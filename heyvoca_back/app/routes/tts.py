import logging

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

from app.models.models import Voca, VocaMeaning, User
from app.utils.jwt_utils import SECRET_KEY, jwt_required  # SECRET_KEY = ACCESS_SECRET
from app.services.tts import service, voice_catalog
from app.services.tts.registry import get_provider_for_language
from app.services.tts.normalize import normalize_text
from app.services.tts.base import (
    TTSError,
    TTSConfigError,
    UnsupportedLanguageError,
)

_SUPPORTED_LANGS = ('en', 'ko')
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


def _resolve_object_key():
    """현재 요청(text/language/voice)으로 캐시 object key를 계산. 실패 시 None."""
    text = request.args.get('text')
    language = request.args.get('language')
    if not text or language not in _SUPPORTED_LANGS:
        return None
    try:
        provider = get_provider_for_language(language)
        norm = normalize_text(text)
        if not norm:
            return None
        voice = voice_catalog.resolve_voice(language, request.args.get('voice'))
        return service.object_key_for(provider, language, norm, user_voice=voice)
    except TTSError:
        return None


def _is_cache_hit():
    """rate limit 면제 판정: 객체 존재 플래그가 있으면(=캐시 히트) 면제."""
    key = _resolve_object_key()
    if not key:
        return False
    try:
        return bool(cache.get(_flag_key(key)))
    except Exception:
        return False


def _gen_rate_limit():
    return current_app.config.get('TTS_RATE_LIMIT', '30 per minute')


def _exists_in_dict(norm_text, language):
    """생성 남용 방지용 사전 실재 검증(best-effort).

    공백 포함(구/문장/예문/조인된 뜻)은 정확 매칭이 어려워 통과시키고,
    단일 토큰(단어/단일 뜻)만 사전 대조 → 무작위 단어 대량 생성 차단.
    """
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
    else:  # ko
        found = db.session.query(VocaMeaning.id).filter(
            VocaMeaning.meaning == norm_text
        ).first() is not None
    try:
        cache.set(ck, '1' if found else '0', timeout=_DICTOK_TTL)
    except Exception:
        pass
    return found


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
@limiter.limit(_gen_rate_limit, exempt_when=_is_cache_hit)
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

    if obj_exists:
        return jsonify({"url": _cached_presigned_url(object_key), "cached": True}), 200

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
    if current_app.config.get('TTS_GENERATE_REQUIRE_DICT', True) and not _exists_in_dict(norm, language):
        return jsonify({"error": "사전에 없는 텍스트입니다."}), 404

    # 일일 생성 상한 — 게스트(화이트리스트 허용)는 로그인 사용자와 분리해 IP 기준으로 카운트.
    gen_count_key = user_id or f'guest:{request.remote_addr or "unknown"}'
    daily_cap = int(current_app.config.get('TTS_DAILY_GEN_CAP', 1000))
    if daily_cap and _daily_gen_count(gen_count_key) > daily_cap:
        return jsonify({"error": "오늘 음성 생성 한도를 초과했습니다."}), 429

    # 생성 + 업로드. 1차 provider(영어=ElevenLabs) 실패 시 service가 gTTS로 fallback.
    requested_key = object_key
    try:
        object_key, _created = service.ensure_cached(text, language, provider=provider, user_voice=voice)
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
    return jsonify({"url": _cached_presigned_url(object_key), "cached": False, "fallback": fallback}), 200


# ── 사전 캐싱(워밍): 학습/테스트 시작 전 캐시에 없는 음성만 미리 생성 ──────
@tts_bp.route('/prewarm', methods=['POST'])
@jwt_required
def tts_prewarm():
    """학습/테스트 시작 전 호출. 선택된 단어 목록의 음성을 미리 생성·업로드해
    실제 학습 중 첫 재생 지연을 없앤다. **캐시에 없는 것만** 생성(컴퓨팅 낭비 방지).

    클라이언트가 /tts/resolve 와 동일한 voice(localStorage ttsVoices)를 보내야
    object key가 일치해 재생 시 캐시 히트한다.

    요청: { "items": [ {"text", "language", "voice"?}, ... ] }
    응답: { "code":200, "data": {"requested","cached","generated","failed"} }
    """
    user_id = g.user_id
    body = request.get_json(silent=True) or {}
    items = body.get('items')
    if not isinstance(items, list) or not items:
        return jsonify({"code": 400, "message": "items는 필수입니다."}), 400

    max_chars    = current_app.config.get('TTS_MAX_CHARS', 500)
    require_dict = current_app.config.get('TTS_GENERATE_REQUIRE_DICT', True)
    daily_cap    = int(current_app.config.get('TTS_DAILY_GEN_CAP', 1000))
    # 요청당 생성 상한 — sync worker 장시간 점유 방지. 초과분은 온디맨드(/resolve)로 처리.
    gen_budget   = int(current_app.config.get('TTS_PREWARM_MAX_GEN', 80))

    requested = cached = generated = failed = 0
    seen_keys = set()

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
        requested += 1

        # 존재 확인: Redis 플래그 → MinIO list
        flag_key = _flag_key(object_key)
        obj_exists = bool(cache.get(flag_key))
        if not obj_exists:
            try:
                obj_exists = service.exists(object_key)
            except TTSError:
                obj_exists = False
            if obj_exists:
                cache.set(flag_key, '1', timeout=_EXIST_FLAG_TTL)
        if obj_exists:
            cached += 1
            continue

        # 캐시 없음 → 생성. 요청당/일일 상한, 사전 실재 검증은 resolve와 동일 정책.
        if generated >= gen_budget:
            continue
        if require_dict and not _exists_in_dict(norm, language):
            continue
        if daily_cap and _daily_gen_count(user_id) > daily_cap:
            break  # 일일 한도 초과 → 중단

        requested_key = object_key
        try:
            object_key, _created = service.ensure_cached(text, language, provider=provider, user_voice=voice)
        except TTSError:
            logging.getLogger(__name__).warning('TTS prewarm 생성 실패', exc_info=True)
            failed += 1
            continue
        _record_gen_stats(language, object_key != requested_key)
        cache.set(_flag_key(object_key), '1', timeout=_EXIST_FLAG_TTL)
        generated += 1

    return jsonify({"code": 200, "data": {
        "requested": requested,
        "cached":    cached,
        "generated": generated,
        "failed":    failed,
    }}), 200


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
        key, _ = service.ensure_cached(sample, language, user_voice=voice)
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
    """사용자 voice 설정 저장. 엄선 화이트리스트 외 voice는 무시."""
    user = User.query.filter_by(id=UUID(g.user_id)).first()
    if not user:
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
