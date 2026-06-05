"""TTS provider 추상 인터페이스 + 공통 데이터/예외 타입."""
from abc import ABC, abstractmethod
from dataclasses import dataclass


class TTSError(Exception):
    """TTS 일반 오류."""


class TTSConfigError(TTSError):
    """설정 누락(API 키, voice_id, MinIO 키 등)."""


class TTSGenerationError(TTSError):
    """외부 TTS 생성 실패(API 오류 등)."""


class UnsupportedLanguageError(TTSError):
    """지원하지 않는 언어 또는 voice 미설정."""


@dataclass(frozen=True)
class TTSResult:
    audio: bytes
    content_type: str = 'audio/mpeg'
    ext: str = 'mp3'


class TTSProvider(ABC):
    """TTS provider 공통 인터페이스.

    name/model/voice는 캐시 object key에 인코딩되므로 안정적인 식별자여야 한다.
    """

    name: str = 'base'
    model: str = 'base'

    @abstractmethod
    def supports_language(self, language: str) -> bool:
        """해당 언어를 (voice 설정 포함) 지원하는지."""

    @abstractmethod
    def voice_for(self, language: str) -> str:
        """언어에 매핑된 voice 식별자. 미지원 시 UnsupportedLanguageError."""

    @abstractmethod
    def synthesize(self, text: str, language: str) -> TTSResult:
        """정규화된 텍스트를 음성 바이트로 합성."""
