"""Edge TTS provider — Microsoft Edge 읽어주기(무료 신경망 보이스).

한국어 등 비영어를 무료로 자연스럽게 합성(ko-KR-SunHiNeural 등). API 키 불필요.
주의: 비공식 엔드포인트라 안정성·상업 라이선스는 보장되지 않음(비상업/개발용).
edge-tts는 async라 sync 래퍼로 감싼다(gunicorn sync 워커에서 동작).
"""
import asyncio
import os

import edge_tts

from ..base import (
    TTSProvider,
    TTSResult,
    TTSGenerationError,
    UnsupportedLanguageError,
)


class EdgeTTSProvider(TTSProvider):
    name = 'edge'
    model = 'edge_tts'

    # 언어별 기본 보이스. EDGE_TTS_VOICE_{LANG} env로 덮어쓸 수 있음.
    _DEFAULT_VOICES = {
        'ko': 'ko-KR-SunHiNeural',
        'en': 'en-US-AriaNeural',
    }

    def voice_for(self, language: str) -> str:
        voice = os.getenv(f'EDGE_TTS_VOICE_{language.upper()}') or self._DEFAULT_VOICES.get(language)
        if not voice:
            raise UnsupportedLanguageError(f"edge-tts 미지원 언어/voice 미설정: {language}")
        return voice

    def supports_language(self, language: str) -> bool:
        return bool(
            os.getenv(f'EDGE_TTS_VOICE_{language.upper()}')
            or self._DEFAULT_VOICES.get(language)
        )

    def synthesize(self, text: str, language: str, voice: str = None) -> TTSResult:
        voice = voice or self.voice_for(language)

        async def _run():
            comm = edge_tts.Communicate(text, voice)
            buf = bytearray()
            async for chunk in comm.stream():
                if chunk.get('type') == 'audio':
                    buf += chunk['data']
            return bytes(buf)

        try:
            audio = asyncio.run(_run())
        except Exception as e:
            raise TTSGenerationError(f'edge-tts 생성 실패: {e}')
        if not audio:
            raise TTSGenerationError('edge-tts 빈 응답.')
        return TTSResult(audio=audio, content_type='audio/mpeg', ext='mp3')
