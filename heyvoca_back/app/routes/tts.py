import logging
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from flask import render_template, request, jsonify, send_file, current_app, g
from app import db, cache, limiter
from app.routes import tts_bp

import jwt
import json
from uuid import UUID
from gtts import gTTS
from datetime import datetime
import io

from sqlalchemy import func

from app.models.models import Voca, VocaMeaning, VocaExample, VocaJa, User, UserVoca
from app.utils.dict_lang import get_dict_lang, use_dict_lang
from app.utils.jwt_utils import SECRET_KEY, jwt_required  # SECRET_KEY = ACCESS_SECRET
from app.services.word_resolve import resolve_word_info
from app.services.tts import service, voice_catalog
from app.services.tts.registry import get_provider_for_language
from app.services.tts.normalize import normalize_text
from app.services.tts.base import (
    TTSError,
    TTSConfigError,
    UnsupportedLanguageError,
)

_SUPPORTED_LANGS = ('en', 'ko', 'ja')
_EXIST_FLAG_TTL = 7 * 24 * 3600   # 객체 존재 플래그 캐시 7일
_DICTOK_TTL = 24 * 3600           # dict 검증 결과 캐시 24시간
_URL_CACHE_MARGIN = 300           # presigned URL 캐시 TTL = presign TTL - margin(만료 직전 회피)


def _url_key(object_key):
    return f'tts:url:{object_key}'


def _cached_presigned_url(object_key):
    """presigned URL을 Redis에 캐싱해 동일 URL을 재사용한다.

    매 요청마다 새 서명(X-Amz-Date 변동)을 반환하면 URL이 달라져 브라우저 HTTP
    캐시가 mp3를 재사용하지 못한다. 동일 URL을 돌려주면 브라우저가 디스크 캐시로
    재다운로드를 생략한다(presign 서명은 로컬 연산이라 캐싱 자체 비용은 작음).
    """
    uk = _url_key(object_key)
    try:
        cached = cache.get(uk)
        if cached:
            return cached
    except Exception:
        pass
    # 서명 만료(ttl)와 Redis 캐시 TTL을 반드시 같은 소스(config)에서 도출한다.
    # service.presigned_url에 ttl_seconds를 넘기지 않으면 service.py가 별도 기본값
    # (os.getenv('TTS_PRESIGN_TTL','3600')=1h)으로 서명해, 캐시(config 기본 6h)가 서명보다
    # 오래 살아남아 만료된 URL을 계속 서빙(200 cached지만 mp3는 403)하는 버그가 있었다.
    ttl = int(current_app.config.get('TTS_PRESIGN_TTL', 3600))
    url = service.presigned_url(object_key, ttl_seconds=ttl)
    try:
        cache.set(uk, url, timeout=max(60, ttl - _URL_CACHE_MARGIN))
    except Exception:
        pass
    return url


@tts_bp.route('/')
def tts():
    return render_template('tts_test.html')


# ── 레거시: gTTS 즉석 생성 스트림(폴백 유지) ─────────────────────────────
@tts_bp.route('/output', methods=['GET'])
def tts_output():
    text = request.args.get('text')
    language = request.args.get('language')

    if not text:
        return jsonify({"error": "단어를 입력해주세요"}), 400

    tts = gTTS(text=text, lang=language)
    mp3_fp = io.BytesIO()
    tts.write_to_fp(mp3_fp)
    mp3_fp.seek(0)
    return send_file(mp3_fp, mimetype="audio/mp3", as_attachment=False, download_name="output.mp3")


# ── 헬퍼 ────────────────────────────────────────────────────────────────
def _optional_user_id():
    """Authorization 헤더가 있으면 user_id 추출(없거나 무효면 None)."""
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None
    token = auth.split(' ', 1)[1].strip()
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return data.get('user_id')
    except Exception:
        return None


def _flag_key(object_key):
    return f'tts:obj:{object_key}'


_ALIGNMENT_CACHE_TTL = 24 * 3600  # 단어 타이밍(json) Redis 캐시 1일


def _want_timestamps():
    """?timestamps=1|true 파싱(대소문자 무관)."""
    v = (request.args.get('timestamps') or '').strip().lower()
    return v in ('1', 'true', 'yes')


def _alignment_cache_key(object_key):
    return f'tts:align:{object_key}'


def _cache_alignment(object_key, alignment):
    if alignment is None:
        return
    try:
        cache.set(_alignment_cache_key(object_key), json.dumps(alignment, ensure_ascii=False),
                  timeout=_ALIGNMENT_CACHE_TTL)
    except Exception:
        pass


def _get_alignment(object_key):
    """Redis 캐시 → objectstore json 순으로 단어 타이밍을 조회. 없으면 None(음수 캐싱 안 함:
    구 캐시 백필 후 곧바로 다시 조회될 수 있어 negative 캐싱하면 반영이 늦어진다)."""
    ck = _alignment_cache_key(object_key)
    try:
        cached = cache.get(ck)
        if cached:
            return json.loads(cached)
    except Exception:
        pass
    alignment = service.get_storage('rw').get_json(service.alignment_key_for(object_key))
    if alignment:
        _cache_alignment(object_key, alignment)
    return alignment


def _gen_rate_limit():
    return current_app.config.get('TTS_RATE_LIMIT', '30 per minute')


def _gen_rate_limit_ok(user_id):
    """실제 합성이 일어나는 요청만 TTS_RATE_LIMIT(기본 30/분)으로 제한한다.

    예전엔 데코레이터 exempt_when(Redis 존재 플래그)로 판정해, 플래그가 없는 캐시 히트
    (MinIO에는 있음)나 프리워밍 대기 후 히트까지 카운트돼 캐시 재생이 429로 막혔다.
    여기서는 합성 직전에만 hit 한다. 리미터가 없거나 저장소 오류면 허용(best-effort).
    """
    try:
        from limits import parse as _parse_limit
        strategy = limiter.limiter
        ident = f'user:{user_id}' if user_id else limiter._key_func()
        return strategy.hit(_parse_limit(_gen_rate_limit()), 'tts_resolve_gen', str(ident))
    except Exception:
        logging.getLogger(__name__).debug('TTS 생성 rate limit 판정 생략', exc_info=True)
        return True


_RATE_LIMITED_BODY = {"error": "음성 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."}


def _wait_for_prewarm(object_key):
    """프리워밍이 이 키를 생성 대기/진행 중이면 최대 TTS_RESOLVE_WAIT_SECONDS 동안 폴링.
    생성되면 True. 표식이 없거나(대상 아님) 표식이 사라졌는데 객체가 없으면 False."""
    pending = _pending_key(object_key)
    try:
        if not cache.get(pending):
            return False
    except Exception:
        return False
    wait = float(current_app.config.get('TTS_RESOLVE_WAIT_SECONDS', 5))
    interval = 0.25
    deadline = time.monotonic() + wait
    while time.monotonic() < deadline:
        time.sleep(interval)
        try:
            if cache.get(_flag_key(object_key)):
                return True
            if not cache.get(pending):
                break  # 생성 종료(실패/fallback) — 마지막으로 MinIO 확인
        except Exception:
            break
    try:
        if service.exists(object_key):
            cache.set(_flag_key(object_key), '1', timeout=_EXIST_FLAG_TTL)
            return True
    except TTSError:
        pass
    return False


def _exists_in_dict(norm_text, language, user_id=None):
    """생성 남용 방지용 사전 실재 검증(best-effort).

    공백 포함(구/문장/예문/조인된 뜻)은 정확 매칭이 어려워 통과시키고,
    단일 토큰(단어/단일 뜻)만 사전 대조 → 무작위 단어 대량 생성 차단.

    영어는 정확 매칭 실패 시 `resolve_word_info`(정제 → 원본 케이싱 → spaCy lemma →
    접미사 fallback)로 한 번 더 시도한다. 예문 속 활용형("scheduled", "desks" 등)은
    표제어(Voca.word)가 아니라 정확 매칭만으로는 사전에 없는 것으로 오판되어
    TTS 생성이 막히는 버그가 있었다(단어는 사전에 있는데 활용형이 다를 뿐).

    일본어(ja)는 띄어쓰기가 없어 공백 규칙이 무의미하므로 별도 분기(_exists_in_dict_ja):
    표제어·읽기·사전 예문 원문 정확 일치 + (로그인 시) 사용자 ja 단어/예문 원문 일치.
    """
    if language == 'ja':
        return _exists_in_dict_ja(norm_text, user_id)
    if ' ' in norm_text:
        return True
    ck = f'tts:dictok:{language}:{norm_text}'
    try:
        cached = cache.get(ck)
        if cached is not None:
            return cached == '1'
    except Exception:
        cached = None
    if language == 'en':
        found = db.session.query(Voca.id).filter(
            func.lower(Voca.word) == norm_text.lower()
        ).first() is not None
        if not found:
            found = resolve_word_info(norm_text) is not None
    else:  # ko — 현재 학습 언어 사전의 뜻(ja 모드면 heyvoca_dict_ja 의 한국어 뜻)
        found = db.session.query(VocaMeaning.id).filter(
            VocaMeaning.meaning == norm_text
        ).first() is not None
    try:
        cache.set(ck, '1' if found else '0', timeout=_DICTOK_TTL)
    except Exception:
        pass
    return found


def _squash(text):
    """비교용: 태그 제거·정규화 후 공백까지 전부 제거(일본어는 공백이 의미 없음)."""
    return normalize_text(text or '').replace(' ', '')


def _exists_in_dict_ja(norm_text, user_id=None):
    """일본어 TTS 생성 허용 판정.

    1) 사전(heyvoca_dict_ja): Voca.word 또는 VocaJa.reading 정확 일치, 또는
       VocaExample.exam_en 의 태그 제거 원문과 일치(공백 무시).
       → 결과는 전역 캐시 `tts:dictok:ja:{norm}` (사용자와 무관).
    2) 사전 미스이고 로그인 사용자면: 본인 UserVoca(dict_lang='ja') 의 word 또는
       voca_examples[*].origin 원문과 일치하면 허용. 사용자별 결과라 전역 캐시에 넣지 않는다
       (부정 결과를 전역 캐시하면 다른 사용자의 정당한 생성이 막힌다).
    사전 조회는 요청의 학습 언어와 무관하게 ja 사전으로 고정한다(스칼라 컬럼만 읽어 identity map 무관).
    """
    target = _squash(norm_text)
    if not target:
        return False
    ck = f'tts:dictok:ja:{norm_text}'
    found = None
    try:
        cached = cache.get(ck)
        if cached is not None:
            found = cached == '1'
    except Exception:
        found = None

    if found is None:
        with use_dict_lang('ja'):
            found = db.session.query(Voca.id).filter(Voca.word == norm_text).first() is not None
            if not found:
                found = db.session.query(VocaJa.voca_id).filter(
                    VocaJa.reading == norm_text
                ).first() is not None
            if not found:
                stripped = func.replace(
                    func.regexp_replace(VocaExample.exam_en, '<[^>]+>', ''), ' ', ''
                )
                found = db.session.query(VocaExample.id).filter(
                    stripped == target
                ).first() is not None
        try:
            cache.set(ck, '1' if found else '0', timeout=_DICTOK_TTL)
        except Exception:
            pass

    if found:
        return True
    if not user_id:
        return False
    return _exists_in_user_ja(target, user_id)


def _exists_in_user_ja(target, user_id):
    """사용자 본인 ja 단어(word)·예문(origin) 원문 일치 여부(공백·태그 무시)."""
    try:
        uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    except (ValueError, TypeError, AttributeError):
        return False
    base = UserVoca.query.with_entities(UserVoca.word, UserVoca.voca_examples).filter(
        UserVoca.user_id == uid, UserVoca.dict_lang == 'ja'
    )
    if base.filter(UserVoca.word == target).first() is not None:
        return True
    # 예문은 JSON 텍스트(ensure_ascii 로 \uXXXX 이스케이프일 수 있고 태그도 끼어 있음)라
    # SQL LIKE 로 거르지 않고 파이썬에서 파싱 후 정확 비교한다. 생성(miss) 경로에서만 호출.
    for _w, raw in base.filter(UserVoca.voca_examples.isnot(None)).all():
        try:
            items = json.loads(raw) if raw else []
        except Exception:
            continue
        for it in items if isinstance(items, list) else []:
            if isinstance(it, dict) and _squash(it.get('origin') or it.get('en')) == target:
                return True
    return False


_STATS_TTL = 14 * 24 * 3600  # TTS 생성/fallback 통계 보관 14일


def _bump(key, ttl=_STATS_TTL):
    """Redis 카운터 best-effort 증가."""
    try:
        cur = int(cache.get(key) or 0) + 1
        cache.set(key, str(cur), timeout=ttl)
    except Exception:
        pass


def _record_gen_stats(language, fallback):
    """모니터링용 일일 TTS 생성/fallback 카운터(best-effort).

    admin TTS 모니터링 페이지가 tts:gen:* / tts:fallback:* 키를 읽는다.
    """
    day = datetime.utcnow().strftime('%Y%m%d')
    _bump(f'tts:gen:{day}')
    _bump(f'tts:gen:{language}:{day}')
    if fallback:
        _bump(f'tts:fallback:{day}')
        _bump(f'tts:fallback:{language}:{day}')


def _daily_gen_count(user_id):
    """user(또는 게스트 식별자)별 일일 생성 카운터 증가 후 현재값 반환(best-effort, Redis)."""
    day = datetime.utcnow().strftime('%Y%m%d')
    k = f'tts:gencount:{user_id}:{day}'
    try:
        cur = int(cache.get(k) or 0) + 1
        cache.set(k, str(cur), timeout=_DICTOK_TTL)
        return cur
    except Exception:
        return 0


_ONBOARDING_WHITELIST_TTL = 3600  # 온보딩 단어 화이트리스트 캐시(1시간, 관리자 단어장 변경 반영 지연 허용)
_ONBOARDING_WHITELIST_KEY = 'tts:onboarding_words'


def _onboarding_words_whitelist():
    """온보딩 레벨(1~4) 단어장에 포함된 영어 단어 집합(소문자, 정규화 기준).

    게스트(비로그인) TTS **생성**(캐시 미스) 허용 대상을 이 집합으로 한정한다.
    레벨 단어장은 관리자가 구성하는 고정 세트(AdminVocaBook)라 텍스트가 임의 사용자
    입력이 아니므로 무제한 생성 남용 없이 화이트리스트로 안전하게 쓸 수 있다.
    """
    try:
        cached = cache.get(_ONBOARDING_WHITELIST_KEY)
        if cached is not None:
            return set(json.loads(cached))
    except Exception:
        pass

    from app.routes.onboarding import LEVEL_ADMIN_BOOK
    from app.models.models import AdminVocaBookMap, Voca

    book_ids = list(LEVEL_ADMIN_BOOK.values())
    rows = (
        db.session.query(Voca.word)
        .join(AdminVocaBookMap, AdminVocaBookMap.voca_id == Voca.id)
        .filter(AdminVocaBookMap.book_id.in_(book_ids))
        .all()
    )
    words = {normalize_text(w[0]).lower() for w in rows if w[0] and normalize_text(w[0])}
    try:
        cache.set(_ONBOARDING_WHITELIST_KEY, json.dumps(list(words)), timeout=_ONBOARDING_WHITELIST_TTL)
    except Exception:
        pass
    return words


def _is_onboarding_word(norm_text, language):
    """게스트 miss-생성 허용 여부 — 온보딩 레벨 단어장 소속 영어 단어인지."""
    if language != 'en':
        return False
    return norm_text.lower() in _onboarding_words_whitelist()


# ── 신규: objectstore 캐싱 + presigned URL ──────────────────────────────
@tts_bp.route('/resolve', methods=['GET'])
# 전역 기본 한도(60/분)·데코레이터 한도 모두 면제 — 캐시 히트는 무제한, 합성만 _gen_rate_limit_ok로 제한.
@limiter.exempt
def tts_resolve():
    """캐시 히트면 presigned URL 반환(무인증). miss면 보호된 생성 경로.

    응답: { "url": <presigned mp3 URL>, "cached": bool }
    """
    text = request.args.get('text')
    language = request.args.get('language')
    if not text or not language:
        return jsonify({"error": "text, language는 필수입니다."}), 400
    if language not in _SUPPORTED_LANGS:
        return jsonify({"error": f"지원하지 않는 언어: {language}"}), 400

    norm = normalize_text(text)
    if not norm:
        return jsonify({"error": "빈 텍스트입니다."}), 400

    # 사용자 지정 voice(쿼리) — 엄선 화이트리스트만 허용, 그 외/미지정은 언어 기본 voice.
    voice = voice_catalog.resolve_voice(language, request.args.get('voice'))
    want_alignment = _want_timestamps()

    try:
        provider = get_provider_for_language(language)
        object_key = service.object_key_for(provider, language, norm, user_voice=voice)
    except UnsupportedLanguageError as e:
        return jsonify({"error": str(e)}), 400
    except TTSConfigError as e:
        logging.getLogger(__name__).error('TTS 설정 오류 (object_key_for)', exc_info=True)
        return jsonify({"error": "TTS 설정 오류가 발생했습니다."}), 500

    flag_key = _flag_key(object_key)

    # 1) 존재 플래그(Redis) → 없으면 MinIO stat
    obj_exists = bool(cache.get(flag_key))
    if not obj_exists:
        try:
            obj_exists = service.exists(object_key)
        except TTSConfigError as e:
            logging.getLogger(__name__).error('TTS 설정 오류 (exists)', exc_info=True)
            return jsonify({"error": "TTS 설정 오류가 발생했습니다."}), 500
        if obj_exists:
            cache.set(flag_key, '1', timeout=_EXIST_FLAG_TTL)

    # 1-1) 프리워밍이 백그라운드로 만들고 있는 중이면 잠깐(최대 5초) 기다렸다 캐시로 응답.
    if not obj_exists:
        obj_exists = _wait_for_prewarm(object_key)

    if obj_exists:
        resp = {"url": _cached_presigned_url(object_key), "cached": True}
        if want_alignment:
            alignment = _get_alignment(object_key)
            if alignment is None and not _gen_rate_limit_ok(_optional_user_id()):
                # 백필도 실제 합성 — 한도 초과면 오디오만 주고 타이밍은 생략(429 아님).
                pass
            elif alignment is None:
                # 오디오는 있지만 타이밍 json이 없는 구 캐시 → 1회 재합성해 백필.
                # (provider가 alignment 미지원이면 재합성해도 계속 None)
                try:
                    filled_key, created, alignment = service.ensure_cached(
                        text, language, provider=provider, user_voice=voice,
                        want_alignment=True,
                    )
                except TTSError:
                    logging.getLogger(__name__).warning('TTS alignment 백필 실패', exc_info=True)
                    alignment = None
                else:
                    if created:
                        _record_gen_stats(language, fallback=(filled_key != object_key))
                    if filled_key != object_key:
                        object_key = filled_key
                        resp["url"] = _cached_presigned_url(object_key)
                    _cache_alignment(object_key, alignment)
            resp["alignment"] = alignment
        return jsonify(resp), 200

    # 2) miss → 생성(과금) 경로: 기본은 로그인 필수.
    #    단, 온보딩 레벨 단어장(관리자 구성 고정 세트) 화이트리스트 단어는 게스트도 허용
    #    — 게스트 온보딩 맛보기의 듣기형 문제 대응. 무제한 게스트 생성은 그대로 차단된다.
    #    (레벨 단어 음성은 /onboarding/level-book 조회 시 백그라운드로 미리 생성되므로,
    #     여기는 그 사이 레이스 상황을 위한 안전망 역할)
    user_id = _optional_user_id()
    if not user_id and not _is_onboarding_word(norm, language):
        return jsonify({"error": "음성이 아직 준비되지 않았습니다. 로그인 후 재생해주세요."}), 404

    # 길이 상한
    if len(norm) > current_app.config.get('TTS_MAX_CHARS', 500):
        return jsonify({"error": "텍스트가 너무 깁니다."}), 400

    # 사전 실재 검증(토글)
    if current_app.config.get('TTS_GENERATE_REQUIRE_DICT', True) and not _exists_in_dict(norm, language, user_id):
        return jsonify({"error": "사전에 없는 텍스트입니다."}), 404

    # 일일 생성 상한 — 게스트(화이트리스트 허용)는 로그인 사용자와 분리해 IP 기준으로 카운트.
    gen_count_key = user_id or f'guest:{request.remote_addr or "unknown"}'
    daily_cap = int(current_app.config.get('TTS_DAILY_GEN_CAP', 1000))
    if daily_cap and _daily_gen_count(gen_count_key) > daily_cap:
        return jsonify({"error": "오늘 음성 생성 한도를 초과했습니다."}), 429

    # 분당 생성 한도(합성 요청만 카운트).
    if not _gen_rate_limit_ok(user_id):
        return jsonify(_RATE_LIMITED_BODY), 429

    # 생성 + 업로드. 1차 provider(영어=ElevenLabs) 실패 시 service가 gTTS로 fallback.
    requested_key = object_key
    try:
        object_key, _created, alignment = service.ensure_cached(
            text, language, provider=provider, user_voice=voice, want_alignment=want_alignment,
        )
    except UnsupportedLanguageError as e:
        return jsonify({"error": str(e)}), 400
    except TTSConfigError as e:
        logging.getLogger(__name__).error('TTS 설정 오류 (ensure_cached)', exc_info=True)
        return jsonify({"error": "TTS 설정 오류가 발생했습니다."}), 500
    except TTSError as e:
        logging.getLogger(__name__).error('TTS 생성 오류 (ensure_cached)', exc_info=True)
        return jsonify({"error": "TTS 생성에 실패했습니다."}), 502

    # 반환 key가 요청 key와 다르면 fallback(gTTS)으로 생성된 것.
    fallback = object_key != requested_key
    _record_gen_stats(language, fallback)

    cache.set(_flag_key(object_key), '1', timeout=_EXIST_FLAG_TTL)
    resp = {"url": _cached_presigned_url(object_key), "cached": False, "fallback": fallback}
    if want_alignment:
        _cache_alignment(object_key, alignment)
        resp["alignment"] = alignment
    return jsonify(resp), 200


# ── 사전 캐싱(워밍): 학습/테스트 시작 전 캐시에 없는 음성만 미리 생성 ──────
#
# 요청 스레드는 "무엇을 만들지"만 정하고 즉시 202로 돌아간다. 합성은 프로세스 공용
# ThreadPool(백그라운드)에서 진행한다. 예전엔 요청 안에서 합성 완료까지 기다려, 캐시가
# 빈 언어(ja)에서 수십 개를 한 번에 만들다 gunicorn sync 워커 타임아웃(30초)이 났다.
#
# 동시성 규칙
#   - 사용자당 프리워밍 작업 1개 = 사용자 큐(Redis 리스트) 1개. 이미 돌고 있으면 새 요청의
#     항목은 그 큐에 합쳐지고 새 작업을 만들지 않는다(프론트는 4개씩 청크로 연속 호출하므로
#     "거절"하면 뒤 청크가 통째로 빠진다). 큐는 슬롯 락(tts:prewarm:lock:{uid}:{slot}) 보유
#     드레인 스레드가 비우며, 슬롯 수 TTS_PREWARM_USER_PARALLEL(기본 2)만큼 병렬.
#   - 전역 워커 수: 프로세스당 ThreadPool max_workers ≤ 4 (TTS_PREWARM_CONCURRENCY).
#   - 같은 텍스트 중복 병합: 진행 표식(tts:pending:{object_key})을 SETNX로 잡은 요청만 큐에 넣는다.
#     /tts/resolve 는 이 표식이 있으면 최대 TTS_RESOLVE_WAIT_SECONDS 동안 캐시 생성을 기다린다.
_PREWARM_MAX_WORKERS = 4
_PREWARM_PENDING_TTL = 300     # 진행 표식 수명 — 큐 적체/프로세스 사망 시 자연 해제
_PREWARM_LOCK_TTL = 60         # 드레인 락 수명(항목 처리마다 갱신). 프로세스가 죽으면 이만큼 뒤 자연 해제
_PREWARM_QUEUE_TTL = 900       # 사용자 큐 수명(드레인 주체가 사라져도 무한 잔존 방지)

_prewarm_executor = None
_prewarm_executor_guard = threading.Lock()
_local_prewarm_queues = {}     # Redis 원시 클라이언트를 못 얻을 때(테스트 등)의 프로세스 내 폴백
_local_prewarm_guard = threading.Lock()


def _pending_key(object_key):
    return f'tts:pending:{object_key}'


def _prewarm_lock_key(user_id, slot=0):
    return f'tts:prewarm:lock:{user_id}:{slot}'


def _prewarm_user_slots():
    """한 사용자 큐를 동시에 비우는 드레인 스레드 수(기본 2, 전역 풀 크기 이하)."""
    n = int(current_app.config.get('TTS_PREWARM_USER_PARALLEL', 2))
    return max(1, min(n, _PREWARM_MAX_WORKERS))


def _get_prewarm_executor():
    global _prewarm_executor
    if _prewarm_executor is None:
        with _prewarm_executor_guard:
            if _prewarm_executor is None:
                n = int(current_app.config.get('TTS_PREWARM_CONCURRENCY', _PREWARM_MAX_WORKERS))
                n = max(1, min(n, _PREWARM_MAX_WORKERS))
                _prewarm_executor = ThreadPoolExecutor(max_workers=n, thread_name_prefix='tts-prewarm')
    return _prewarm_executor


def _redis_client():
    """Flask-Caching RedisCache의 실제 클라이언트(_write_client). 없으면 None."""
    try:
        inner = cache.cache
        client = getattr(inner, '_write_client', None) or getattr(inner, '_read_client', None)
        if client is None or not hasattr(client, 'rpush'):
            return None
        return client
    except Exception:
        return None


def _prewarm_queue_key(user_id):
    prefix = getattr(cache.cache, 'key_prefix', '') or ''
    return f'{prefix}tts:prewarm:q:{user_id}'


def _queue_push(user_id, jobs):
    client = _redis_client()
    if client is not None:
        try:
            qk = _prewarm_queue_key(user_id)
            pipe = client.pipeline()
            pipe.rpush(qk, *[json.dumps(j, ensure_ascii=False) for j in jobs])
            pipe.expire(qk, _PREWARM_QUEUE_TTL)
            pipe.execute()
            return
        except Exception:
            logging.getLogger(__name__).warning('TTS prewarm 큐 push 실패(로컬 폴백)', exc_info=True)
    with _local_prewarm_guard:
        _local_prewarm_queues.setdefault(user_id, deque()).extend(jobs)


def _queue_pop(user_id):
    client = _redis_client()
    if client is not None:
        try:
            raw = client.lpop(_prewarm_queue_key(user_id))
            if raw is not None:
                return json.loads(raw)
        except Exception:
            logging.getLogger(__name__).warning('TTS prewarm 큐 pop 실패', exc_info=True)
    with _local_prewarm_guard:
        q = _local_prewarm_queues.get(user_id)
        if q:
            return q.popleft()
        _local_prewarm_queues.pop(user_id, None)
    return None


def _queue_len(user_id):
    n = 0
    client = _redis_client()
    if client is not None:
        try:
            n += int(client.llen(_prewarm_queue_key(user_id)) or 0)
        except Exception:
            pass
    with _local_prewarm_guard:
        n += len(_local_prewarm_queues.get(user_id) or ())
    return n


def _prewarm_generate_one(job):
    """큐 항목 1개 합성. 이미 누가 만들어 뒀으면(resolve 온디맨드 등) 건너뛴다."""
    object_key = job['key']
    language = job['language']
    try:
        if cache.get(_flag_key(object_key)):
            return
        # MinIO 존재 재확인은 ensure_cached 가 한다(있으면 created=False로 합성 없이 반환).
        provider = get_provider_for_language(language)
        try:
            made_key, created, _alignment = service.ensure_cached(
                job['text'], language, provider=provider, user_voice=job.get('voice'),
            )
        except TTSError:
            logging.getLogger(__name__).warning('TTS prewarm 생성 실패', exc_info=True)
            return
        # gTTS fallback이면 made_key != object_key(요청 키엔 객체 없음) — 표식은 finally에서
        # 정리되므로 resolve 대기는 곧바로 끝나고 자체 생성 경로로 넘어간다.
        cache.set(_flag_key(made_key), '1', timeout=_EXIST_FLAG_TTL)
        if created:
            _record_gen_stats(language, fallback=(made_key != object_key))
    finally:
        try:
            cache.delete(_pending_key(object_key))
        except Exception:
            pass


def _prewarm_drain(app, user_id, slot):
    """사용자 큐를 비울 때까지 합성. 슬롯 락 보유자만 돈다(사용자당 슬롯 수만큼 병렬)."""
    lock_key = _prewarm_lock_key(user_id, slot)
    with app.app_context():
        try:
            while True:
                job = _queue_pop(user_id)
                if job is None:
                    cache.delete(lock_key)
                    # 락 해제 직전에 push된 항목 레이스 — 남아 있고 락을 다시 잡으면 계속.
                    if _queue_len(user_id) and cache.add(lock_key, '1', timeout=_PREWARM_LOCK_TTL):
                        continue
                    return
                cache.set(lock_key, '1', timeout=_PREWARM_LOCK_TTL)
                try:
                    _prewarm_generate_one(job)
                except Exception:
                    logging.getLogger(__name__).warning('TTS prewarm 항목 처리 오류', exc_info=True)
        except Exception:
            logging.getLogger(__name__).error('TTS prewarm 드레인 오류', exc_info=True)
            try:
                cache.delete(lock_key)
            except Exception:
                pass


def _start_prewarm_drain(user_id):
    """비어 있는 슬롯 락을 잡아 드레인을 백그라운드로 시작. 슬롯이 모두 돌고 있으면
    아무것도 안 한다(방금 push한 항목은 돌고 있는 드레인이 같은 큐에서 이어 처리)."""
    app = current_app._get_current_object()
    started = 0
    for slot in range(_prewarm_user_slots()):
        lock_key = _prewarm_lock_key(user_id, slot)
        if not cache.add(lock_key, '1', timeout=_PREWARM_LOCK_TTL):
            continue
        try:
            _get_prewarm_executor().submit(_prewarm_drain, app, user_id, slot)
        except Exception:
            cache.delete(lock_key)
            raise
        started += 1
    return started


@tts_bp.route('/prewarm', methods=['POST'])
@jwt_required
def tts_prewarm():
    """학습/테스트 시작 전 호출. 선택된 단어 목록 중 **캐시에 없는 것만** 백그라운드 합성 큐에
    넣고 즉시 응답한다(합성 완료를 기다리지 않음).

    클라이언트가 /tts/resolve 와 동일한 voice(localStorage ttsVoices)를 보내야
    object key가 일치해 재생 시 캐시 히트한다.

    요청: { "items": [ {"text", "language", "voice"?}, ... ] }
    응답(202): { "code":202, "queued":N, "cached":M,
                 "data": {"requested","cached","queued","inflight","skipped"} }
      - queued   : 이번 요청으로 새로 큐에 넣은 수
      - inflight : 다른 요청이 이미 생성 중이라 병합(스킵)된 수
      - skipped  : 사전 미등재/요청당 상한/일일 상한으로 제외된 수
    """
    user_id = g.user_id
    body = request.get_json(silent=True) or {}
    items = body.get('items')
    if not isinstance(items, list) or not items:
        return jsonify({"code": 400, "message": "items는 필수입니다."}), 400

    max_chars    = current_app.config.get('TTS_MAX_CHARS', 500)
    require_dict = current_app.config.get('TTS_GENERATE_REQUIRE_DICT', True)
    daily_cap    = int(current_app.config.get('TTS_DAILY_GEN_CAP', 1000))
    # 요청당 큐 투입 상한. 초과분은 온디맨드(/resolve)로 처리.
    gen_budget   = int(current_app.config.get('TTS_PREWARM_MAX_GEN', 80))

    requested = cached = inflight = skipped = 0
    seen_keys = set()
    candidates = []  # (text, norm, language, voice, object_key)

    for it in items:
        if not isinstance(it, dict):
            continue
        text = it.get('text')
        language = it.get('language')
        if not text or language not in _SUPPORTED_LANGS:
            continue
        norm = normalize_text(text)
        if not norm or len(norm) > max_chars:
            continue
        try:
            provider = get_provider_for_language(language)
            voice = voice_catalog.resolve_voice(language, it.get('voice'))
            object_key = service.object_key_for(provider, language, norm, user_voice=voice)
        except TTSError:
            continue
        if object_key in seen_keys:
            continue
        seen_keys.add(object_key)
        candidates.append((text, norm, language, voice, object_key))
    requested = len(candidates)

    # 존재 확인: Redis 플래그 → (없는 것만) MinIO list. MinIO 조회는 건당 수백 ms라
    # 요청 안에서 순차로 하면 60개에 10초를 넘긴다 → 소형 풀로 병렬 조회.
    exists_map = {}
    unknown = []
    for c in candidates:
        if cache.get(_flag_key(c[4])):
            exists_map[c[4]] = True
        else:
            unknown.append(c[4])
    if unknown:
        def _safe_exists(key):
            try:
                return service.exists(key)
            except Exception:
                return False
        with ThreadPoolExecutor(max_workers=min(8, len(unknown))) as pool:
            for key, ok in zip(unknown, pool.map(_safe_exists, unknown)):
                exists_map[key] = ok
                if ok:
                    cache.set(_flag_key(key), '1', timeout=_EXIST_FLAG_TTL)

    jobs = []
    for text, norm, language, voice, object_key in candidates:
        if exists_map.get(object_key):
            cached += 1
            continue

        # 캐시 없음 → 큐 후보. 요청당/일일 상한, 사전 실재 검증은 resolve와 동일 정책.
        if len(jobs) >= gen_budget:
            skipped += 1
            continue
        if require_dict and not _exists_in_dict(norm, language, user_id):
            skipped += 1
            continue
        # 같은 텍스트가 이미 생성 대기/진행 중이면 병합(중복 합성 방지). 일일 카운트도 소모 안 함.
        if not cache.add(_pending_key(object_key), '1', timeout=_PREWARM_PENDING_TTL):
            inflight += 1
            continue
        if daily_cap and _daily_gen_count(user_id) > daily_cap:
            cache.delete(_pending_key(object_key))
            skipped += 1
            break  # 일일 한도 초과 → 중단

        jobs.append({'text': text, 'language': language, 'voice': voice, 'key': object_key})

    if jobs:
        try:
            _queue_push(user_id, jobs)
            _start_prewarm_drain(user_id)
        except Exception:
            logging.getLogger(__name__).error('TTS prewarm 큐잉 실패', exc_info=True)
            for j in jobs:
                cache.delete(_pending_key(j['key']))
            return jsonify({"code": 500, "message": "음성 준비 요청에 실패했습니다."}), 500

    return jsonify({
        "code": 202,
        "queued": len(jobs),
        "cached": cached,
        "data": {
            "requested": requested,
            "cached":    cached,
            "queued":    len(jobs),
            "inflight":  inflight,
            "skipped":   skipped,
        },
    }), 202


# ── 음성 설정: 엄선 voice 목록 + 사용자별 선택 ──────────────────────────
@tts_bp.route('/voice-options', methods=['GET'])
def tts_voice_options():
    """음성 설정 화면용 엄선 voice 목록 + 언어 기본값(정적, 즉시 응답).

    샘플 미리듣기는 무겁지 않게 분리: /tts/voice-sample 에서 선택 voice 1개만 생성.
    """
    return jsonify({'code': 200, 'data': {
        'voices': voice_catalog.CURATED_VOICES,
        'default': voice_catalog.DEFAULT_VOICE,
    }})


@tts_bp.route('/voice-sample', methods=['GET'])
def tts_voice_sample():
    """선택 voice의 고정 샘플 문구를 생성·캐싱해 presigned URL 반환(미리듣기용, 온디맨드)."""
    language = request.args.get('language')
    voice = request.args.get('voice')
    if language not in _SUPPORTED_LANGS or not voice_catalog.is_valid_voice(language, voice):
        return jsonify({'code': 400, 'message': '잘못된 언어/voice'}), 400
    sample = voice_catalog.SAMPLE_TEXT.get(language, '')
    if not sample:
        return jsonify({'code': 400, 'message': '샘플 문구 없음'}), 400
    try:
        key, _created, _alignment = service.ensure_cached(sample, language, user_voice=voice)
        return jsonify({'code': 200, 'data': {'url': service.presigned_url(key)}})
    except Exception:
        # 미리듣기 실패는 치명적이지 않음 → 200+url:None (5xx면 Cloudflare가 가로챔)
        return jsonify({'code': 200, 'data': {'url': None}})


def _load_user_voices(user):
    saved = {}
    if user and user.tts_voices:
        try:
            saved = json.loads(user.tts_voices) or {}
        except Exception:
            saved = {}
    merged = dict(voice_catalog.DEFAULT_VOICE)
    merged.update({k: v for k, v in saved.items() if k in voice_catalog.DEFAULT_VOICE})
    return merged


@tts_bp.route('/my-voices', methods=['GET'])
@jwt_required
def get_my_voices():
    """사용자 voice 설정 조회(미설정 언어는 기본값으로 채워 반환)."""
    user = User.query.filter_by(id=UUID(g.user_id)).first()
    if not user:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404
    return jsonify({'code': 200, 'data': _load_user_voices(user)})


@tts_bp.route('/my-voices', methods=['PUT'])
@jwt_required
def put_my_voices():
    """사용자 voice 설정 저장. 엄선 화이트리스트 외 voice는 무시.

    저장값(JSON)을 읽어 언어 하나만 바꿔 다시 쓰는 읽고-고쳐-쓰기라, User 를 잠근 새 트랜잭션에서
    한다 — 두 언어를 동시에 바꾸면 한쪽 변경이 사라지던 것을 막는다.
    """
    from app.utils.gem import start_user_tx
    user = start_user_tx(UUID(g.user_id))
    if not user:
        db.session.rollback()
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404
    body = request.json or {}
    saved = {}
    if user.tts_voices:
        try:
            saved = json.loads(user.tts_voices) or {}
        except Exception:
            saved = {}
    for lang in voice_catalog.DEFAULT_VOICE:
        if lang in body and voice_catalog.is_valid_voice(lang, body[lang]):
            saved[lang] = body[lang]
    user.tts_voices = json.dumps(saved, ensure_ascii=False)
    db.session.add(user)
    db.session.commit()
    return jsonify({'code': 200, 'data': _load_user_voices(user)})
