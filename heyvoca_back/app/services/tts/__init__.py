"""TTS(외부 AI 음성 + objectstore 캐싱) 서비스 패키지.

- provider 추상화(base.py + providers/): ElevenLabs 기본, gTTS 폴백/레거시.
- 캐시 object key에 provider/model/voice/language를 인코딩 → 모델 교체·다국어 확장 시 충돌 없음.
- 음성은 MINIO_BUCKET(heyvoca)의 tts/ prefix에 저장, presigned URL로 서빙.

핵심 진입점:
    from app.services.tts import service
    service.ensure_cached(text, language)   # 없으면 생성·업로드 → (key, created)
    service.presigned_url(key)              # 재생용 presigned GET URL
    service.exists(key) / service.object_key_for(provider, lang, norm)
"""
from .base import (
    TTSError,
    TTSConfigError,
    TTSGenerationError,
    UnsupportedLanguageError,
    TTSResult,
)

__all__ = [
    'TTSError',
    'TTSConfigError',
    'TTSGenerationError',
    'UnsupportedLanguageError',
    'TTSResult',
]
