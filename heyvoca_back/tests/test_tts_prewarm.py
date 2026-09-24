"""/tts/prewarm 백그라운드화 + /tts/resolve 생성 전용 rate limit·프리워밍 대기 테스트.

Redis/MinIO/Edge TTS 실접속 없이 cache·service를 가짜로 대체해 검증한다.
  1. prewarm은 합성을 기다리지 않고 202 + {queued, cached} 로 즉시 응답, 캐시된 항목은 큐 제외.
  2. 같은 텍스트가 이미 진행 중(tts:pending)이면 큐에 넣지 않고 inflight로 병합.
  3. 드레인은 큐를 비우며 존재 플래그를 세우고 진행 표식·락을 정리한다.
  4. resolve 캐시 히트는 생성 rate limit을 소모하지 않고, 합성 경로만 429 판정을 받는다.
  5. resolve는 프리워밍 진행 중 텍스트를 잠깐 기다렸다 캐시로 응답한다.
"""
import os
from unittest.mock import MagicMock, patch

import jwt
import pytest

from app import create_app
from app.routes import tts as tts_routes
from app.utils.jwt_utils import SECRET_KEY

USER_ID = 'test-user-prewarm'


class FakeCache:
    """Flask-Caching 최소 대체(get/set/add/delete). cache.cache 에 rpush가 없어 큐는 로컬 폴백."""

    def __init__(self):
        self.store = {}
        self.cache = object()

    def get(self, k):
        return self.store.get(k)

    def set(self, k, v, timeout=None):
        self.store[k] = v
        return True

    def add(self, k, v, timeout=None):
        if k in self.store:
            return False
        self.store[k] = v
        return True

    def delete(self, k):
        self.store.pop(k, None)
        return True


@pytest.fixture(scope='module')
def app():
    os.environ.setdefault('FLASK_CONFIG', 'local')
    _app = create_app()
    _app.config['TESTING'] = True
    _app.config['RATELIMIT_ENABLED'] = False
    return _app


@pytest.fixture
def fake_cache():
    fc = FakeCache()
    with patch.object(tts_routes, 'cache', fc):
        tts_routes._local_prewarm_queues.clear()
        yield fc
        tts_routes._local_prewarm_queues.clear()


@pytest.fixture
def auth_headers():
    token = jwt.encode({'user_id': USER_ID}, SECRET_KEY, algorithm='HS256')
    if isinstance(token, bytes):
        token = token.decode()
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(autouse=True)
def _no_db_dict_lang():
    with patch('app.utils.dict_lang.apply_user_dict_lang'):
        yield


def _key(text, language='ja'):
    provider = tts_routes.get_provider_for_language(language)
    voice = tts_routes.voice_catalog.resolve_voice(language, None)
    return tts_routes.service.object_key_for(provider, language, tts_routes.normalize_text(text), user_voice=voice)


# ── prewarm ─────────────────────────────────────────────────────────────
def test_prewarm_returns_202_immediately_and_skips_cached(app, fake_cache, auth_headers):
    cached_key = _key('猫')
    fake_cache.set(tts_routes._flag_key(cached_key), '1')
    with patch.object(tts_routes.service, 'exists', return_value=False), \
         patch.object(tts_routes.service, 'ensure_cached') as ensure, \
         patch.object(tts_routes, '_exists_in_dict', return_value=True), \
         patch.object(tts_routes, '_daily_gen_count', return_value=1), \
         patch.object(tts_routes, '_start_prewarm_drain') as start:
        resp = app.test_client().post('/tts/prewarm', headers=auth_headers, json={'items': [
            {'text': '猫', 'language': 'ja'},
            {'text': '犬', 'language': 'ja'},
            {'text': '鳥', 'language': 'ja'},
            {'text': '犬', 'language': 'ja'},  # 중복
        ]})
    assert resp.status_code == 202
    body = resp.get_json()
    assert body['queued'] == 2 and body['cached'] == 1
    assert body['data']['requested'] == 3
    ensure.assert_not_called()            # 요청 스레드에서 합성하지 않음
    start.assert_called_once_with(USER_ID)
    queued = [j['key'] for j in tts_routes._local_prewarm_queues[USER_ID]]
    assert cached_key not in queued and len(queued) == 2
    for k in queued:
        assert fake_cache.get(tts_routes._pending_key(k))


def test_prewarm_merges_inflight_text(app, fake_cache, auth_headers):
    fake_cache.set(tts_routes._pending_key(_key('犬')), '1')
    with patch.object(tts_routes.service, 'exists', return_value=False), \
         patch.object(tts_routes, '_exists_in_dict', return_value=True), \
         patch.object(tts_routes, '_daily_gen_count', return_value=1) as daily, \
         patch.object(tts_routes, '_start_prewarm_drain') as start:
        resp = app.test_client().post('/tts/prewarm', headers=auth_headers,
                                      json={'items': [{'text': '犬', 'language': 'ja'}]})
    body = resp.get_json()
    assert resp.status_code == 202
    assert body['queued'] == 0 and body['data']['inflight'] == 1
    start.assert_not_called()
    daily.assert_not_called()


def test_drain_generates_and_cleans_up(app, fake_cache):
    k1, k2 = _key('犬'), _key('鳥')
    with app.app_context():
        for k in (k1, k2):
            fake_cache.set(tts_routes._pending_key(k), '1')
        fake_cache.set(tts_routes._prewarm_lock_key(USER_ID, 0), '1')
        tts_routes._queue_push(USER_ID, [
            {'text': '犬', 'language': 'ja', 'voice': None, 'key': k1},
            {'text': '鳥', 'language': 'ja', 'voice': None, 'key': k2},
        ])
    with patch.object(tts_routes.service, 'ensure_cached',
                      side_effect=lambda t, lang, **kw: (_key(t), True, None)) as ensure, \
         patch.object(tts_routes, '_record_gen_stats'):
        tts_routes._prewarm_drain(app, USER_ID, 0)
    assert ensure.call_count == 2
    for k in (k1, k2):
        assert fake_cache.get(tts_routes._flag_key(k)) == '1'
        assert fake_cache.get(tts_routes._pending_key(k)) is None
    assert fake_cache.get(tts_routes._prewarm_lock_key(USER_ID, 0)) is None
    assert not tts_routes._local_prewarm_queues.get(USER_ID)


# ── resolve ─────────────────────────────────────────────────────────────
def test_resolve_cache_hit_does_not_consume_rate_limit(app, fake_cache):
    key = _key('猫')
    fake_cache.set(tts_routes._flag_key(key), '1')
    with patch.object(tts_routes, '_gen_rate_limit_ok') as rl, \
         patch.object(tts_routes, '_cached_presigned_url', return_value='https://x/a.mp3'):
        client = app.test_client()
        codes = [client.get('/tts/resolve', query_string={'text': '猫', 'language': 'ja'}).status_code
                 for _ in range(60)]
    assert codes == [200] * 60
    rl.assert_not_called()


def test_resolve_miss_rate_limited_returns_429(app, fake_cache, auth_headers):
    with patch.object(tts_routes.service, 'exists', return_value=False), \
         patch.object(tts_routes.service, 'ensure_cached') as ensure, \
         patch.object(tts_routes, '_exists_in_dict', return_value=True), \
         patch.object(tts_routes, '_daily_gen_count', return_value=1), \
         patch.object(tts_routes, '_gen_rate_limit_ok', return_value=False):
        resp = app.test_client().get('/tts/resolve', headers=auth_headers,
                                     query_string={'text': '犬', 'language': 'ja'})
    assert resp.status_code == 429
    ensure.assert_not_called()


def test_resolve_waits_for_prewarm_then_serves_cache(app, fake_cache, auth_headers):
    key = _key('鳥')
    fake_cache.set(tts_routes._pending_key(key), '1')

    def _fake_sleep(_s):  # 첫 대기 중 프리워밍이 완료됐다고 가정
        fake_cache.set(tts_routes._flag_key(key), '1')
        fake_cache.delete(tts_routes._pending_key(key))

    with patch.object(tts_routes.service, 'exists', return_value=False), \
         patch.object(tts_routes.service, 'ensure_cached') as ensure, \
         patch.object(tts_routes.time, 'sleep', side_effect=_fake_sleep), \
         patch.object(tts_routes, '_gen_rate_limit_ok') as rl, \
         patch.object(tts_routes, '_cached_presigned_url', return_value='https://x/b.mp3'):
        resp = app.test_client().get('/tts/resolve', headers=auth_headers,
                                     query_string={'text': '鳥', 'language': 'ja'})
    assert resp.status_code == 200
    assert resp.get_json()['cached'] is True
    ensure.assert_not_called()
    rl.assert_not_called()
