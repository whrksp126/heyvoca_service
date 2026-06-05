"""TTS 조회 오케스트레이션 — Flask app context 없이도 동작하는 코어.

라우트(tts.py)는 이 위에 Redis 존재플래그 캐시 / 인증 / rate limit / dict 검증을 얹는다.
prewarm 스크립트는 ensure_cached()만 직접 호출한다.
"""
import os

from .registry import get_provider
from .storage import TTSStorage
from .normalize import normalize_text, build_object_key
from .base import TTSError

_storages = {}


def get_storage(role: str = 'ro'):
    """TTSStorage 싱글턴(연결 재사용). role='ro' 조회/서명, 'rw' 업로드."""
    if role not in _storages:
        _storages[role] = TTSStorage(role=role)
    return _storages[role]


def object_key_for(provider, language: str, norm_text: str, prefix: str = None) -> str:
    prefix = prefix or os.getenv('TTS_PREFIX', 'tts')
    return build_object_key(
        prefix, provider.name, provider.model,
        provider.voice_for(language), language, norm_text,
    )


# TTS는 온디맨드 생성(put)이 필수라 모든 환경이 RW 키를 보유한다.
# 또한 objectstore 정책상 RO 키는 dict/만 읽고 tts/는 RW만 접근 가능 → 서빙도 RW로 통일.
def exists(key: str, storage=None) -> bool:
    return (storage or get_storage('rw')).exists(key)


def presigned_url(key: str, storage=None, ttl_seconds: int = None) -> str:
    ttl = ttl_seconds or int(os.getenv('TTS_PRESIGN_TTL', '3600'))
    return (storage or get_storage('rw')).presigned_get(key, ttl)


def ensure_cached(text: str, language: str, provider=None, storage=None):
    """객체가 없으면 생성·업로드(RW 키). (object_key, created: bool) 반환.

    text는 원문(미정규화) — 내부에서 normalize 후 키 계산.
    """
    provider = provider or get_provider()
    storage = storage or get_storage('rw')
    norm = normalize_text(text)
    if not norm:
        raise TTSError('빈 텍스트')
    key = object_key_for(provider, language, norm)
    if storage.exists(key):
        return key, False
    result = provider.synthesize(norm, language)
    storage.put_audio(key, result.audio, result.content_type)
    return key, True
