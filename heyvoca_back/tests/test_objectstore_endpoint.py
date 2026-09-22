"""objectstore 엔드포인트 내부/공개 분리 테스트.

핵심 계약:
  - MINIO_INTERNAL_ENDPOINT 미설정 → 내부=공개(기존 동작 그대로)
  - 설정 시 서버 측 전송(dict dump, TTS put/exists/get)만 내부 주소 사용
  - presigned URL 서명은 **항상 공개 주소**(사용자 기기가 요청하는 호스트)
"""
import pytest

from app.services import objectstore_endpoint as oe
from app.services import dict_manage
from app.services.tts.storage import TTSStorage

PUBLIC = 'https://objectstore.ghmate.com'
INTERNAL = 'http://minio:9000'


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv('MINIO_INTERNAL_ENDPOINT', raising=False)
    monkeypatch.setenv('MINIO_ENDPOINT', PUBLIC)
    monkeypatch.setenv('MINIO_BUCKET', 'heyvoca')
    monkeypatch.setenv('MINIO_DICT_RW_KEY', 'ak-rw')
    monkeypatch.setenv('MINIO_DICT_RW_SECRET', 'sk-rw')
    monkeypatch.delenv('MINIO_DICT_RO_KEY', raising=False)
    monkeypatch.delenv('MINIO_DICT_RO_SECRET', raising=False)


def _host(client):
    return client._base_url._url.netloc


def _scheme(client):
    return client._base_url._url.scheme


# ── 헬퍼 자체 ───────────────────────────────────────────────

def test_internal_falls_back_to_public_when_unset():
    assert oe.public_endpoint() == PUBLIC
    assert oe.internal_endpoint() == PUBLIC
    assert oe.has_internal_endpoint() is False


def test_internal_used_when_set(monkeypatch):
    monkeypatch.setenv('MINIO_INTERNAL_ENDPOINT', INTERNAL)
    assert oe.internal_endpoint() == INTERNAL
    assert oe.public_endpoint() == PUBLIC      # 공개 주소는 영향 없음
    assert oe.has_internal_endpoint() is True


def test_default_public_endpoint_when_env_missing(monkeypatch):
    monkeypatch.delenv('MINIO_ENDPOINT', raising=False)
    assert oe.public_endpoint() == oe.DEFAULT_PUBLIC_ENDPOINT


# ── dict_manage ────────────────────────────────────────────

def test_dict_client_uses_internal_when_set(monkeypatch):
    monkeypatch.setenv('MINIO_INTERNAL_ENDPOINT', INTERNAL)
    cli = dict_manage._minio('rw')
    assert _host(cli) == 'minio:9000'
    assert _scheme(cli) == 'http'


def test_dict_client_public_flag_ignores_internal(monkeypatch):
    monkeypatch.setenv('MINIO_INTERNAL_ENDPOINT', INTERNAL)
    cli = dict_manage._minio('rw', public=True)
    assert _host(cli) == 'objectstore.ghmate.com'
    assert _scheme(cli) == 'https'


def test_dict_client_unchanged_without_internal():
    assert _host(dict_manage._minio('ro')) == 'objectstore.ghmate.com'
    assert _host(dict_manage._minio('rw')) == 'objectstore.ghmate.com'


# ── TTS storage ────────────────────────────────────────────

def test_tts_storage_object_ops_use_internal(monkeypatch):
    monkeypatch.setenv('MINIO_INTERNAL_ENDPOINT', INTERNAL)
    st = TTSStorage(role='rw')
    assert _host(st._client) == 'minio:9000'          # exists/put/get 경로
    assert _host(st._signing_client()) == 'objectstore.ghmate.com'


def test_tts_presigned_url_is_always_public(monkeypatch):
    monkeypatch.setenv('MINIO_INTERNAL_ENDPOINT', INTERNAL)
    st = TTSStorage(role='ro')
    url = st.presigned_get('tts/edge/edge_tts/ko/abc.mp3', ttl_seconds=60)
    assert url.startswith('https://objectstore.ghmate.com/heyvoca/')
    assert 'minio:9000' not in url


def test_tts_presigned_url_public_without_internal():
    st = TTSStorage(role='ro')
    assert st._signing_client() is st._client        # 별도 클라이언트 불필요
    url = st.presigned_get('tts/edge/edge_tts/ko/abc.mp3', ttl_seconds=60)
    assert url.startswith('https://objectstore.ghmate.com/heyvoca/')


def test_tts_storage_explicit_endpoint_signs_with_same_host(monkeypatch):
    # endpoint를 명시로 넘기는 스크립트/테스트는 그 주소로 서명까지 수행(기존 호환).
    monkeypatch.setenv('MINIO_INTERNAL_ENDPOINT', INTERNAL)
    st = TTSStorage(role='rw', endpoint='https://example.invalid')
    assert _host(st._client) == 'example.invalid'
    assert st._signing_client() is st._client
