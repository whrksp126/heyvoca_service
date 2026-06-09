"""gTTS provider — 레거시/폴백. 기존 /tts/output과 동일한 Google TTS."""
import io

from gtts import gTTS

from ..base import TTSProvider, TTSResult, UnsupportedLanguageError, TTSGenerationError

_SUPPORTED = ('en', 'ko')


class GTTSProvider(TTSProvider):
    name = 'gtts'
    model = 'gtts'

    def supports_language(self, language: str) -> bool:
        return language in _SUPPORTED

    def voice_for(self, language: str) -> str:
        if language not in _SUPPORTED:
            raise UnsupportedLanguageError(f"gTTS 미지원 언어: {language}")
        return language  # gTTS는 voice == language

    def synthesize(self, text: str, language: str) -> TTSResult:
        self.voice_for(language)  # 언어 검증
        try:
            fp = io.BytesIO()
            gTTS(text=text, lang=language).write_to_fp(fp)
        except Exception as e:
            raise TTSGenerationError(f'gTTS 생성 실패: {e}')
        return TTSResult(audio=fp.getvalue(), content_type='audio/mpeg', ext='mp3')
