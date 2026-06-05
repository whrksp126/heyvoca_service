"""active TTS provider 선택 — config(TTS_PROVIDER) 기반.

provider 인스턴스는 env 설정을 생성자에서 읽어 모듈 캐시(앱 수명 동안 1회 생성).
모델/보이스/언어 확장 = 여기 매핑에 항목 추가 + .env 값.
"""
import os

from .base import TTSConfigError
from .providers.elevenlabs import ElevenLabsProvider
from .providers.gtts import GTTSProvider

_BUILDERS = {
    'elevenlabs': ElevenLabsProvider,
    'gtts': GTTSProvider,
}

_instances = {}


def get_provider(name: str = None):
    name = name or os.getenv('TTS_PROVIDER', 'elevenlabs')
    if name not in _instances:
        builder = _BUILDERS.get(name)
        if builder is None:
            raise TTSConfigError(f"알 수 없는 TTS provider: {name}")
        _instances[name] = builder()
    return _instances[name]
