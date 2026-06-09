"""TTS 조회 오케스트레이션 — Flask app context 없이도 동작하는 코어.

라우트(tts.py)는 이 위에 Redis 존재플래그 캐시 / 인증 / rate limit / dict 검증을 얹는다.
prewarm 스크립트는 ensure_cached()만 직접 호출한다.
"""
import os
from urllib.parse import quote

from .registry import get_provider, get_provider_for_language
from .storage import TTSStorage
from .normalize import normalize_text, build_object_key
from .base import TTSError, TTSGenerationError

_storages = {}

# 1차 provider(예: ElevenLabs) 생성 실패 시 전환할 무료 fallback provider.
# gTTS는 en/ko 모두 지원하고 외부 quota가 없어 토큰 소진/장애 시 안전망 역할.
FALLBACK_PROVIDER = 'gtts'


def get_storage(role: str = 'ro'):
    """TTSStorage 싱글턴(연결 재사용). role='ro' 조회/서명, 'rw' 업로드."""
    if role not in _storages:
        _storages[role] = TTSStorage(role=role)
    return _storages[role]


def object_key_for(provider, language: str, norm_text: str, prefix: str = None,
                   user_voice: str = None) -> str:
    prefix = prefix or os.getenv('TTS_PREFIX', 'tts')
    voice = user_voice or provider.voice_for(language)
    return build_object_key(
        prefix, provider.name, provider.model,
        voice, language, norm_text,
    )


# TTS는 온디맨드 생성(put)이 필수라 모든 환경이 RW 키를 보유한다.
# 또한 objectstore 정책상 RO 키는 dict/만 읽고 tts/는 RW만 접근 가능 → 서빙도 RW로 통일.
def exists(key: str, storage=None) -> bool:
    return (storage or get_storage('rw')).exists(key)


def presigned_url(key: str, storage=None, ttl_seconds: int = None) -> str:
    ttl = ttl_seconds or int(os.getenv('TTS_PRESIGN_TTL', '3600'))
    return (storage or get_storage('rw')).presigned_get(key, ttl)


def ensure_cached(text: str, language: str, provider=None, storage=None,
                  allow_fallback: bool = True, user_voice: str = None):
    """객체가 없으면 생성·업로드(RW 키). (object_key, created: bool) 반환.

    text는 원문(미정규화) — 내부에서 normalize 후 키 계산.

    1차 provider의 synthesize가 실패(TTSGenerationError; quota 소진·장애 등)하면
    allow_fallback일 때 무료 FALLBACK_PROVIDER(gTTS)로 자동 전환해 재시도한다.
    fallback 음성은 provider명이 다른 별도 object key에 저장되므로, 1차 provider가
    복구되면 다음 요청부터 자동으로 원래(고품질) 키로 생성·서빙된다(gTTS 캐시는 잔존하나 무시됨).

    호출처는 반환된 object_key의 provider 세그먼트가 요청 provider와 다른지로
    fallback 발생 여부를 판별할 수 있다.
    """
    provider = provider or get_provider_for_language(language)
    storage = storage or get_storage('rw')
    norm = normalize_text(text)
    if not norm:
        raise TTSError('빈 텍스트')
    key = object_key_for(provider, language, norm, user_voice=user_voice)
    if storage.exists(key):
        return key, False

    used = provider
    voice_used = user_voice or provider.voice_for(language)
    try:
        result = provider.synthesize(norm, language, voice=user_voice)
    except TTSGenerationError:
        # 1차 provider 생성 실패 → 무료 fallback(gTTS)으로 전환.
        # fallback 자체가 불가하거나 이미 fallback provider면 원오류를 그대로 전파.
        if not allow_fallback or provider.name == FALLBACK_PROVIDER:
            raise
        fb = get_provider(FALLBACK_PROVIDER)
        if not fb.supports_language(language):
            raise
        # fallback(gTTS)은 voice 선택 개념이 없어 user_voice 미적용 → 기본 키로 저장
        fb_key = object_key_for(fb, language, norm)
        if storage.exists(fb_key):
            return fb_key, False
        result = fb.synthesize(norm, language)  # 이마저 실패하면 그대로 전파
        used = fb
        voice_used = fb.voice_for(language)
        key = fb_key

    # 해시 키만으로는 무슨 텍스트인지 알 수 없으므로 원문/언어/엔진을 메타데이터로 남긴다.
    # 헤더는 ASCII만 허용 → 한글 등은 URL-encode(복원: urllib.parse.unquote).
    metadata = {
        'text': quote(norm),
        'lang': language,
        'provider': used.name,
        'voice': voice_used,
    }
    storage.put_audio(key, result.audio, result.content_type, metadata=metadata)
    return key, True
