"""active TTS provider 선택 — config(TTS_PROVIDER) 기반.

provider 인스턴스는 env 설정을 생성자에서 읽어 모듈 캐시(앱 수명 동안 1회 생성).
모델/보이스/언어 확장 = 여기 매핑에 항목 추가 + .env 값.
"""
import os

from .base import TTSConfigError
from .providers.elevenlabs import ElevenLabsProvider
from .providers.gtts import GTTSProvider
from .providers.edge import EdgeTTSProvider

_BUILDERS = {
    'elevenlabs': ElevenLabsProvider,
    'gtts': GTTSProvider,
    'edge': EdgeTTSProvider,
}

# 언어별 기본 provider (env 미지정 시). 영어=ElevenLabs(고품질), 한국어=Edge(무료 신경망).
_LANG_DEFAULT_PROVIDER = {
    'en': 'elevenlabs',
    'ko': 'edge',
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


def get_provider_for_language(language: str):
    """언어별 provider 선택. 우선순위:
    TTS_PROVIDER_{LANG} > TTS_PROVIDER(전역) > 언어별 기본(_LANG_DEFAULT_PROVIDER).
    """
    name = (
        os.getenv(f'TTS_PROVIDER_{language.upper()}')
        or os.getenv('TTS_PROVIDER')
        or _LANG_DEFAULT_PROVIDER.get(language, 'elevenlabs')
    )
    return get_provider(name)
