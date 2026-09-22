"""TTS 단어 타이밍(alignment) 캐싱/백필 로직 + /tts/resolve timestamps 파라미터 파싱 테스트.

네트워크(Edge TTS/MinIO) 없이 provider/storage를 가짜 객체로 대체해 검증한다.
"""
import os

import pytest

from app.services.tts import service as tts_service
from app.services.tts.base import TTSProvider, TTSResult, TTSGenerationError


class FakeStorage:
    """TTSStorage 최소 대체 — exists/put_audio/put_json/get_json만 메모리로 구현."""

    def __init__(self):
        self.audio = {}
        self.json = {}
        self.put_audio_calls = 0
        self.put_json_calls = 0

    def exists(self, key):
        return key in self.audio

    def put_audio(self, key, data, content_type='audio/mpeg', metadata=None):
        self.audio[key] = data
        self.put_audio_calls += 1

    def put_json(self, key, obj):
        self.json[key] = obj
        self.put_json_calls += 1

    def get_json(self, key):
        return self.json.get(key)


class FakeProvider(TTSProvider):
    """alignment 유무를 조절할 수 있는 가짜 provider(기본 edge 흉내)."""

    def __init__(self, name='edge', model='edge_tts', alignment=None,
                 audio=b'AUDIO-BYTES', raise_error=False):
        self.name = name
        self.model = model
        self._alignment = alignment
        self._audio = audio
        self._raise_error = raise_error
        self.calls = 0

    def supports_language(self, language):
        return True

    def voice_for(self, language):
        return f'test-voice-{language}'

    def synthesize(self, text, language, voice=None):
        self.calls += 1
        if self._raise_error:
            raise TTSGenerationError('provider 실패(mock)')
        return TTSResult(audio=self._audio, content_type='audio/mpeg', ext='mp3',
                          alignment=self._alignment)


SAMPLE_ALIGNMENT = [
    {'text': 'He', 'start': 0.05, 'end': 0.21},
    {'text': 'kept', 'start': 0.22, 'end': 0.45},
]


def _key(provider, storage, text='He kept his desk tidy.', language='en'):
    norm = tts_service.normalize_text(text)
    return tts_service.object_key_for(provider, language, norm)


# ── alignment_key_for ────────────────────────────────────────────────────
def test_alignment_key_for_replaces_extension():
    assert tts_service.alignment_key_for('tts/edge/edge_tts/v/en/ab/abc123.mp3') == \
        'tts/edge/edge_tts/v/en/ab/abc123.json'


# ── 신규 생성: alignment 있으면 json도 같이 기록 ─────────────────────────
def test_fresh_generation_writes_alignment_json_and_returns_it():
    storage = FakeStorage()
    provider = FakeProvider(alignment=SAMPLE_ALIGNMENT)

    key, created, alignment = tts_service.ensure_cached(
        'He kept his desk tidy.', 'en', provider=provider, storage=storage,
        want_alignment=True,
    )

    assert created is True
    assert alignment == SAMPLE_ALIGNMENT
    assert storage.audio[key] == b'AUDIO-BYTES'
    assert storage.json[tts_service.alignment_key_for(key)] == SAMPLE_ALIGNMENT
    assert provider.calls == 1


def test_fresh_generation_without_want_alignment_still_persists_json_if_provider_returns_it():
    # want_alignment=False라도 provider가 alignment를 돌려주면 향후 요청을 위해 저장해둔다.
    storage = FakeStorage()
    provider = FakeProvider(alignment=SAMPLE_ALIGNMENT)

    key, created, alignment = tts_service.ensure_cached(
        'He kept his desk tidy.', 'en', provider=provider, storage=storage,
        want_alignment=False,
    )

    assert created is True
    assert alignment == SAMPLE_ALIGNMENT
    assert storage.json[tts_service.alignment_key_for(key)] == SAMPLE_ALIGNMENT


# ── 캐시 히트 + json 있음: provider 재호출 없이 그대로 반환 ───────────────
def test_cache_hit_with_json_skips_resynthesis():
    storage = FakeStorage()
    provider = FakeProvider(alignment=SAMPLE_ALIGNMENT)
    key = _key(provider, storage)
    storage.audio[key] = b'OLD-AUDIO'
    storage.json[tts_service.alignment_key_for(key)] = SAMPLE_ALIGNMENT

    got_key, created, alignment = tts_service.ensure_cached(
        'He kept his desk tidy.', 'en', provider=provider, storage=storage,
        want_alignment=True,
    )

    assert got_key == key
    assert created is False
    assert alignment == SAMPLE_ALIGNMENT
    assert provider.calls == 0  # 재합성 없음
    assert storage.audio[key] == b'OLD-AUDIO'  # 덮어쓰지 않음


# ── 캐시 히트 + json 없음: want_alignment일 때만 재합성 ───────────────────
def test_cache_hit_without_json_no_regeneration_when_alignment_not_wanted():
    storage = FakeStorage()
    provider = FakeProvider(alignment=SAMPLE_ALIGNMENT)
    key = _key(provider, storage)
    storage.audio[key] = b'OLD-AUDIO'  # json 없음(구 캐시)

    got_key, created, alignment = tts_service.ensure_cached(
        'He kept his desk tidy.', 'en', provider=provider, storage=storage,
        want_alignment=False,
    )

    assert got_key == key
    assert created is False
    assert alignment is None
    assert provider.calls == 0


def test_cache_hit_without_json_triggers_regeneration_when_alignment_wanted():
    storage = FakeStorage()
    provider = FakeProvider(alignment=SAMPLE_ALIGNMENT)
    key = _key(provider, storage)
    storage.audio[key] = b'OLD-AUDIO'  # json 없음(구 캐시)

    got_key, created, alignment = tts_service.ensure_cached(
        'He kept his desk tidy.', 'en', provider=provider, storage=storage,
        want_alignment=True,
    )

    assert got_key == key
    assert created is True  # 재합성 = generation으로 카운트
    assert alignment == SAMPLE_ALIGNMENT
    assert provider.calls == 1
    assert storage.audio[key] == b'AUDIO-BYTES'  # 오디오도 덮어씀
    assert storage.json[tts_service.alignment_key_for(key)] == SAMPLE_ALIGNMENT


def test_cache_hit_without_json_regeneration_failure_keeps_serving_old_audio():
    storage = FakeStorage()
    provider = FakeProvider(alignment=SAMPLE_ALIGNMENT, raise_error=True)
    key = _key(provider, storage)
    storage.audio[key] = b'OLD-AUDIO'

    got_key, created, alignment = tts_service.ensure_cached(
        'He kept his desk tidy.', 'en', provider=provider, storage=storage,
        want_alignment=True,
    )

    assert got_key == key
    assert created is False
    assert alignment is None
    assert storage.audio[key] == b'OLD-AUDIO'  # 기존 오디오 보존


# ── gTTS 폴백: alignment 미지원 → 항상 None ───────────────────────────────
def test_gtts_fallback_has_no_alignment(monkeypatch):
    storage = FakeStorage()
    primary = FakeProvider(name='elevenlabs', model='eleven', raise_error=True)
    fallback = FakeProvider(name='gtts', model='gtts', alignment=None)

    monkeypatch.setattr(tts_service, 'get_provider', lambda name: fallback)

    key, created, alignment = tts_service.ensure_cached(
        'He kept his desk tidy.', 'en', provider=primary, storage=storage,
        want_alignment=True,
    )

    assert created is True
    assert alignment is None
    # fallback provider(gtts) 세그먼트가 담긴 별도 key로 저장됨
    assert '/gtts/' in key
    assert tts_service.alignment_key_for(key) not in storage.json


# ── 라우트: timestamps 쿼리 파라미터 파싱 ─────────────────────────────────
@pytest.fixture(scope='module')
def app():
    os.environ.setdefault('FLASK_CONFIG', 'local')
    from app import create_app
    return create_app()


@pytest.mark.parametrize('qs,expected', [
    ('timestamps=1', True),
    ('timestamps=true', True),
    ('timestamps=TRUE', True),
    ('timestamps=yes', True),
    ('timestamps=0', False),
    ('timestamps=false', False),
    ('', False),
])
def test_want_timestamps_parsing(app, qs, expected):
    from app.routes.tts import _want_timestamps
    with app.test_request_context(f'/tts/resolve?text=hi&language=en&{qs}'):
        assert _want_timestamps() is expected
