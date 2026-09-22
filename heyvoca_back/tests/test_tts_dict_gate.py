"""
tests/test_tts_dict_gate.py — app.routes.tts._exists_in_dict 단위 테스트.

TTS 생성 남용 방지용 사전 실재 검증(_exists_in_dict) 게이트가 예문 속 활용형
("scheduled", "desks" 등)도 표제어(Voca.word)로 정규화해 통과시키는지 검증한다.
DB/Redis 실접속 없이 검증한다:
  1. 정확 매칭 히트 — Voca.word 정확 일치(대소문자 무시)면 resolve_word_info까지 안 감.
  2. 활용형 히트 — 정확 매칭 실패 후 resolve_word_info(접미사 fallback 등)가 찾으면 True.
  3. 완전 미스 — 정확 매칭도 resolve_word_info도 실패하면 False.
  4. 공백 포함(구/문장)은 항상 True(정확 매칭 로직 자체를 건너뜀).
  5. 캐시(tts:dictok:{lang}:{norm}) 히트/저장 동작은 기존과 동일하게 유지.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.routes.tts import _exists_in_dict


@pytest.fixture(scope='module')
def app():
    os.environ.setdefault('FLASK_CONFIG', 'local')
    _app = create_app()
    _app.config['TESTING'] = True
    return _app


class FakeVoca:
    def __init__(self, id, word):
        self.id = id
        self.word = word


def _mock_query_result(found):
    """db.session.query(Voca.id).filter(...).first() 체인을 흉내낸다."""
    query = MagicMock()
    query.filter.return_value.first.return_value = (1,) if found else None
    return query


class TestExactHit:
    def test_exact_match_skips_resolver(self, app):
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info') as mock_resolve:
            mock_cache.get.return_value = None
            mock_db.session.query.return_value = _mock_query_result(found=True)

            result = _exists_in_dict('schedule', 'en')

        assert result is True
        mock_resolve.assert_not_called()
        mock_cache.set.assert_called_once_with('tts:dictok:en:schedule', '1', timeout=24 * 3600)


class TestInflectedHitViaResolver:
    def test_scheduled_resolves_via_suffix_fallback(self, app):
        fake = FakeVoca(1, 'schedule')
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info', return_value=fake) as mock_resolve:
            mock_cache.get.return_value = None
            mock_db.session.query.return_value = _mock_query_result(found=False)

            result = _exists_in_dict('scheduled', 'en')

        assert result is True
        mock_resolve.assert_called_once_with('scheduled')
        mock_cache.set.assert_called_once_with('tts:dictok:en:scheduled', '1', timeout=24 * 3600)

    def test_desks_resolves_via_suffix_fallback(self, app):
        fake = FakeVoca(2, 'desk')
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info', return_value=fake) as mock_resolve:
            mock_cache.get.return_value = None
            mock_db.session.query.return_value = _mock_query_result(found=False)

            result = _exists_in_dict('desks', 'en')

        assert result is True
        mock_resolve.assert_called_once_with('desks')


class TestMiss:
    def test_unknown_token_returns_false(self, app):
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info', return_value=None) as mock_resolve:
            mock_cache.get.return_value = None
            mock_db.session.query.return_value = _mock_query_result(found=False)

            result = _exists_in_dict('qwertyzz', 'en')

        assert result is False
        mock_resolve.assert_called_once_with('qwertyzz')
        mock_cache.set.assert_called_once_with('tts:dictok:en:qwertyzz', '0', timeout=24 * 3600)


class TestMultiWordPassthrough:
    def test_space_included_always_true_without_db_or_resolver(self, app):
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info') as mock_resolve:
            result = _exists_in_dict('he kept his desk tidy', 'en')

        assert result is True
        mock_resolve.assert_not_called()
        mock_db.session.query.assert_not_called()
        mock_cache.get.assert_not_called()
        mock_cache.set.assert_not_called()


class TestCacheHit:
    def test_cached_positive_skips_db_and_resolver(self, app):
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info') as mock_resolve:
            mock_cache.get.return_value = '1'

            result = _exists_in_dict('scheduled', 'en')

        assert result is True
        mock_db.session.query.assert_not_called()
        mock_resolve.assert_not_called()

    def test_cached_negative_skips_db_and_resolver(self, app):
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info') as mock_resolve:
            mock_cache.get.return_value = '0'

            result = _exists_in_dict('qwertyzz', 'en')

        assert result is False
        mock_db.session.query.assert_not_called()
        mock_resolve.assert_not_called()


class TestKoreanUnaffected:
    def test_korean_path_does_not_call_resolver(self, app):
        with app.app_context(), \
             patch('app.routes.tts.cache') as mock_cache, \
             patch('app.routes.tts.db') as mock_db, \
             patch('app.routes.tts.resolve_word_info') as mock_resolve:
            mock_cache.get.return_value = None
            mock_db.session.query.return_value = _mock_query_result(found=True)

            result = _exists_in_dict('일정', 'ko')

        assert result is True
        mock_resolve.assert_not_called()
