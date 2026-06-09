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
    """user별 일일 생성 카운터 증가 후 현재값 반환(best-effort, Redis)."""
    day = datetime.utcnow().strftime('%Y%m%d')
    k = f'tts:gencount:{user_id}:{day}'
    try:
        cur = int(cache.get(k) or 0) + 1
        cache.set(k, str(cur), timeout=_DICTOK_TTL)
        return cur
    except Exception:
        return 0


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
        return jsonify({"error": f"TTS 설정 오류: {e}"}), 500

    flag_key = _flag_key(object_key)

    # 1) 존재 플래그(Redis) → 없으면 MinIO stat
    obj_exists = bool(cache.get(flag_key))
    if not obj_exists:
        try:
            obj_exists = service.exists(object_key)
        except TTSConfigError as e:
            return jsonify({"error": f"TTS 설정 오류: {e}"}), 500
        if obj_exists:
            cache.set(flag_key, '1', timeout=_EXIST_FLAG_TTL)

    if obj_exists:
        return jsonify({"url": service.presigned_url(object_key), "cached": True}), 200

    # 2) miss → 생성(과금) 경로: 로그인 필수
    user_id = _optional_user_id()
    if not user_id:
        return jsonify({"error": "음성이 아직 준비되지 않았습니다. 로그인 후 재생해주세요."}), 404

    # 길이 상한
    if len(norm) > current_app.config.get('TTS_MAX_CHARS', 500):
        return jsonify({"error": "텍스트가 너무 깁니다."}), 400

    # 사전 실재 검증(토글)
    if current_app.config.get('TTS_GENERATE_REQUIRE_DICT', True) and not _exists_in_dict(norm, language):
        return jsonify({"error": "사전에 없는 텍스트입니다."}), 404

    # 일일 생성 상한
    daily_cap = int(current_app.config.get('TTS_DAILY_GEN_CAP', 1000))
    if daily_cap and _daily_gen_count(user_id) > daily_cap:
        return jsonify({"error": "오늘 음성 생성 한도를 초과했습니다."}), 429

    # 생성 + 업로드. 1차 provider(영어=ElevenLabs) 실패 시 service가 gTTS로 fallback.
    requested_key = object_key
    try:
        object_key, _created = service.ensure_cached(text, language, provider=provider, user_voice=voice)
    except UnsupportedLanguageError as e:
        return jsonify({"error": str(e)}), 400
    except TTSConfigError as e:
        return jsonify({"error": f"TTS 설정 오류: {e}"}), 500
    except TTSError as e:
        return jsonify({"error": f"TTS 생성 실패: {e}"}), 502

    # 반환 key가 요청 key와 다르면 fallback(gTTS)으로 생성된 것.
    fallback = object_key != requested_key
    _record_gen_stats(language, fallback)

    cache.set(_flag_key(object_key), '1', timeout=_EXIST_FLAG_TTL)
    return jsonify({"url": service.presigned_url(object_key), "cached": False, "fallback": fallback}), 200


# ── 음성 설정: 엄선 voice 목록 + 사용자별 선택 ──────────────────────────
@tts_bp.route('/voice-options', methods=['GET'])
def tts_voice_options():
    """음성 설정 화면용 엄선 voice 목록 + 언어 기본값 + 각 voice 샘플 presigned URL.

    샘플은 고정 문구를 voice별로 한 번 생성·캐싱 → 이후 캐시 히트(무료 Edge).
    """
    out = {}
    for lang, vlist in voice_catalog.CURATED_VOICES.items():
        sample_text = voice_catalog.SAMPLE_TEXT.get(lang, '')
        items = []
        for v in vlist:
            sample_url = None
            if sample_text:
                try:
                    key, _ = service.ensure_cached(sample_text, lang, user_voice=v['voice'])
                    sample_url = service.presigned_url(key)
                except Exception:
                    sample_url = None
            items.append({**v, 'sample_url': sample_url})
        out[lang] = items
    return jsonify({'code': 200, 'data': {'voices': out, 'default': voice_catalog.DEFAULT_VOICE}})


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
