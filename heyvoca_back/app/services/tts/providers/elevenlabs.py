"""ElevenLabs TTS provider — REST 직접 호출(requests 재사용, 신규 의존성 없음).

언어별 voice는 config(TTS_VOICE_EN/KO)로 매핑. Flash v2.5는 멀티링궐이라
하나의 voice로 en/ko 모두 처리 가능하지만, 언어별로 다른 voice도 허용한다.
"""
import os

import requests

from ..base import (
    TTSProvider,
    TTSResult,
    TTSConfigError,
    TTSGenerationError,
    UnsupportedLanguageError,
)


class ElevenLabsProvider(TTSProvider):
    name = 'elevenlabs'

    def __init__(self):
        self.model = os.getenv('TTS_MODEL', 'eleven_flash_v2_5')
        # ELEVENLABS_BASE_URL 우선, 없으면 다른 프로젝트 컨벤션 ELEVENLABS_API_URL도 허용.
        # 값에 '/v1'이 붙어 있어도(예: https://api.elevenlabs.io/v1) 정규화해 중복을 막는다.
        raw = (
            os.getenv('ELEVENLABS_BASE_URL')
            or os.getenv('ELEVENLABS_API_URL')
            or 'https://api.elevenlabs.io'
        ).rstrip('/')
        if raw.endswith('/v1'):
            raw = raw[:-3]
        self.base_url = raw
        self.api_key = os.getenv('ELEVENLABS_API_KEY')
        self.output_format = os.getenv('ELEVENLABS_OUTPUT_FORMAT', 'mp3_44100_128')
        self._voices = {
            'en': os.getenv('TTS_VOICE_EN'),
            'ko': os.getenv('TTS_VOICE_KO'),
        }
        self.timeout = int(os.getenv('ELEVENLABS_TIMEOUT', '30'))

    def supports_language(self, language: str) -> bool:
        return bool(self._voices.get(language))

    def voice_for(self, language: str) -> str:
        voice = self._voices.get(language)
        if not voice:
            raise UnsupportedLanguageError(
                f"'{language}' voice 미설정 (TTS_VOICE_{language.upper()})."
            )
        return voice

    def synthesize(self, text: str, language: str) -> TTSResult:
        if not self.api_key:
            raise TTSConfigError('ELEVENLABS_API_KEY 미설정.')
        voice = self.voice_for(language)
        url = f"{self.base_url}/v1/text-to-speech/{voice}"
        headers = {
            'xi-api-key': self.api_key,
            'accept': 'audio/mpeg',
            'content-type': 'application/json',
        }
        payload = {'text': text, 'model_id': self.model}
        try:
            resp = requests.post(
                url,
                json=payload,
                headers=headers,
                params={'output_format': self.output_format},
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise TTSGenerationError(f'ElevenLabs 요청 실패: {e}')
        if resp.status_code != 200:
            raise TTSGenerationError(
                f'ElevenLabs {resp.status_code}: {resp.text[:300]}',
                status_code=resp.status_code,
            )
        if not resp.content:
            raise TTSGenerationError('ElevenLabs 빈 응답.')
        return TTSResult(audio=resp.content, content_type='audio/mpeg', ext='mp3')

    def get_subscription(self) -> dict:
        """구독/사용량 정보 조회 (character_count, character_limit 등).

        토큰(문자) 잔량 모니터링용. ElevenLabs `/v1/user/subscription` 호출.
        Raises: TTSConfigError(키 미설정), TTSGenerationError(API 오류).
        """
        if not self.api_key:
            raise TTSConfigError('ELEVENLABS_API_KEY 미설정.')
        url = f"{self.base_url}/v1/user/subscription"
        try:
            resp = requests.get(
                url,
                headers={'xi-api-key': self.api_key, 'accept': 'application/json'},
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise TTSGenerationError(f'ElevenLabs 구독 조회 실패: {e}')
        if resp.status_code != 200:
            raise TTSGenerationError(
                f'ElevenLabs {resp.status_code}: {resp.text[:300]}',
                status_code=resp.status_code,
            )
        try:
            return resp.json()
        except ValueError as e:
            raise TTSGenerationError(f'ElevenLabs 응답 파싱 실패: {e}')
