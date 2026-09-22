"""
tests/test_search_word_info.py — GET /search/word-info 단위 테스트.

학습 화면에서 영어 예문 속 단어를 탭했을 때 뜨는 사전 요약 팝업 API.
DB/Redis 실접속 없이 검증한다:
  1. _clean_word_token — 구두점/따옴표/공백 정제, 내부 하이픈·어포스트로피 보존.
  2. _word_info_suffix_candidates — 접미사 제거 후보 생성 순서.
  3. _resolve_word_info — 정확 일치 → 원본 케이싱 → spaCy lemma → 접미사 fallback 오케스트레이션
     (DB 경계인 _lookup_voca_exact, spaCy 경계인 _get_spacy를 mock).
  4. /search/word-info 라우트 — 인증 필수, 캐시 조회/저장, not-found → data null.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.utils.jwt_utils import generate_access_token
from app.routes.search import (
    _clean_word_token,
    _word_info_suffix_candidates,
    _resolve_word_info,
)


# ──────────────────────────────────────────────────────────
# 픽스처
# ──────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def app():
    _app = create_app()
    _app.config['TESTING'] = True
    return _app


@pytest.fixture(scope='module')
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_headers():
    token = generate_access_token('11111111-1111-1111-1111-111111111111')
    return {'Authorization': f'Bearer {token}'}


class FakeVoca:
    def __init__(self, id, word, pronunciation=None):
        self.id = id
        self.word = word
        self.pronunciation = pronunciation


class FakeToken:
    def __init__(self, lemma):
        self.lemma_ = lemma


# ──────────────────────────────────────────────────────────
# _clean_word_token
# ──────────────────────────────────────────────────────────

class TestCleanWordToken:
    def test_none_returns_empty(self):
        assert _clean_word_token(None) == ''

    def test_empty_returns_empty(self):
        assert _clean_word_token('') == ''

    def test_plain_word_unchanged(self):
        assert _clean_word_token('ruler') == 'ruler'

    def test_trailing_comma_stripped(self):
        assert _clean_word_token('desks,') == 'desks'

    def test_trailing_period_stripped(self):
        assert _clean_word_token('Empire.') == 'Empire'

    def test_surrounding_quotes_stripped(self):
        assert _clean_word_token('"kept"') == 'kept'
        assert _clean_word_token("'kept'") == 'kept'

    def test_curly_quotes_stripped(self):
        assert _clean_word_token('“kept”') == 'kept'

    def test_surrounding_whitespace_stripped(self):
        assert _clean_word_token('  kept \n') == 'kept'

    def test_internal_hyphen_preserved(self):
        assert _clean_word_token('mother-in-law,') == 'mother-in-law'

    def test_internal_apostrophe_preserved(self):
        assert _clean_word_token("don't.") == "don't"

    def test_only_punctuation_returns_empty(self):
        assert _clean_word_token('...') == ''
        assert _clean_word_token(',,,') == ''


# ──────────────────────────────────────────────────────────
# _word_info_suffix_candidates
# ──────────────────────────────────────────────────────────

class TestSuffixCandidates:
    def test_plural_s(self):
        candidates = _word_info_suffix_candidates('desks')
        assert 'desk' in candidates
        # 's' 제거가 가장 먼저 시도돼야 함
        assert candidates[0] == 'desk'

    def test_ing_plain_strip(self):
        candidates = _word_info_suffix_candidates('walking')
        assert 'walk' in candidates

    def test_ing_to_e(self):
        candidates = _word_info_suffix_candidates('hoping')
        assert 'hope' in candidates

    def test_doubled_consonant_ing(self):
        candidates = _word_info_suffix_candidates('running')
        assert 'run' in candidates

    def test_doubled_consonant_ing_stopping(self):
        candidates = _word_info_suffix_candidates('stopping')
        assert 'stop' in candidates

    def test_ies_to_y(self):
        candidates = _word_info_suffix_candidates('cities')
        assert 'city' in candidates

    def test_ed_and_d_variants(self):
        candidates = _word_info_suffix_candidates('closed')
        # 'ed' 제거(clos)와 'd' 제거(close) 둘 다 후보에 있어야 하고, close가 실제 매치될 값
        assert 'close' in candidates

    def test_no_candidate_duplicates(self):
        candidates = _word_info_suffix_candidates('desks')
        assert len(candidates) == len(set(candidates))

    def test_short_word_no_crash(self):
        # 길이가 짧아 접미사 제거 후 빈 문자열이 될 수 있는 경우도 예외 없이 처리
        assert _word_info_suffix_candidates('s') == []
        assert _word_info_suffix_candidates('') == []


# ──────────────────────────────────────────────────────────
# _resolve_word_info — DB(_lookup_voca_exact)/spaCy(_get_spacy) 경계를 mock
# ──────────────────────────────────────────────────────────

class TestResolveWordInfo:
    """_resolve_word_info(=app.services.word_resolve.resolve_word_info)의 DB/spaCy 경계는
    이제 app.services.word_resolve 모듈에 있으므로 그 이름공간을 patch한다."""

    def test_exact_match_hit(self):
        fake = FakeVoca(1, 'ruler', '/ˈruːlər/')
        with patch('app.services.word_resolve.lookup_voca_exact') as mock_lookup, \
             patch('app.services.word_resolve._get_spacy') as mock_spacy:
            mock_lookup.side_effect = lambda w: fake if w == 'ruler' else None
            result = _resolve_word_info('ruler')
        assert result is fake
        # 정확 일치로 끝났으면 spaCy까지 갈 필요 없음
        mock_spacy.assert_not_called()

    def test_exact_match_with_punctuation_and_casing(self):
        fake = FakeVoca(2, 'empire', '/ˈɛmpaɪər/')
        with patch('app.services.word_resolve.lookup_voca_exact') as mock_lookup:
            mock_lookup.side_effect = lambda w: fake if w == 'empire' else None
            result = _resolve_word_info('Empire.')
        assert result is fake

    def test_original_casing_fallback_for_proper_noun(self):
        # 소문자로는 없고 원본 케이싱(대문자 포함)으로만 사전에 있는 경우(고유명사 등)
        fake = FakeVoca(3, 'NASA', None)
        with patch('app.services.word_resolve.lookup_voca_exact') as mock_lookup:
            def side_effect(w):
                if w == 'NASA':
                    return fake
                return None
            mock_lookup.side_effect = side_effect
            result = _resolve_word_info('NASA')
        assert result is fake

    def test_lemma_path_hit(self):
        fake = FakeVoca(4, 'abandon', None)

        def lookup_side_effect(w):
            return fake if w == 'abandon' else None

        fake_nlp = MagicMock(return_value=[FakeToken('abandon')])
        with patch('app.services.word_resolve.lookup_voca_exact', side_effect=lookup_side_effect), \
             patch('app.services.word_resolve._get_spacy', return_value=fake_nlp):
            result = _resolve_word_info('abandoned')
        assert result is fake
        fake_nlp.assert_called_once_with('abandoned')

    def test_suffix_fallback_hit(self):
        fake = FakeVoca(5, 'desk', None)

        def lookup_side_effect(w):
            return fake if w == 'desk' else None

        with patch('app.services.word_resolve.lookup_voca_exact', side_effect=lookup_side_effect), \
             patch('app.services.word_resolve._get_spacy', return_value=None):
            result = _resolve_word_info('desks,')
        assert result is fake

    def test_not_found_returns_none(self):
        with patch('app.services.word_resolve.lookup_voca_exact', return_value=None), \
             patch('app.services.word_resolve._get_spacy', return_value=None):
            result = _resolve_word_info('zzzzznotaword')
        assert result is None

    def test_empty_input_returns_none_without_lookup(self):
        with patch('app.services.word_resolve.lookup_voca_exact') as mock_lookup:
            result = _resolve_word_info('...')
        assert result is None
        mock_lookup.assert_not_called()


# ──────────────────────────────────────────────────────────
# GET /search/word-info 라우트
# ──────────────────────────────────────────────────────────

class TestWordInfoRoute:
    def test_requires_auth(self, client):
        resp = client.get('/search/word-info?word=ruler')
        assert resp.status_code == 401

    def test_missing_word_returns_data_null(self, client, auth_headers):
        resp = client.get('/search/word-info', headers=auth_headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['code'] == 200
        assert body['data'] is None

    def test_not_found_returns_data_null(self, client, auth_headers):
        with patch('app.routes.search.app_cache') as mock_cache, \
             patch('app.routes.search._resolve_word_info', return_value=None):
            mock_cache.get.return_value = None
            resp = client.get('/search/word-info?word=zzzzznotaword', headers=auth_headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body == {'code': 200, 'data': None}

    def test_found_returns_expected_shape_and_caches(self, client, auth_headers):
        fake = FakeVoca(7, 'desk', '/desk/')
        with patch('app.routes.search.app_cache') as mock_cache, \
             patch('app.routes.search._resolve_word_info', return_value=fake) as mock_resolve, \
             patch('app.routes.search._voca_meanings', return_value=['책상', '사무직']) as mock_meanings:
            mock_cache.get.return_value = None
            resp = client.get('/search/word-info?word=desks,', headers=auth_headers)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body['code'] == 200
        data = body['data']
        assert data['query'] == 'desks,'
        assert data['word'] == 'desk'
        assert data['pronunciation'] == '/desk/'
        assert data['meanings'] == ['책상', '사무직']
        assert data['voca_id'] == 7

        mock_resolve.assert_called_once_with('desks,')
        mock_meanings.assert_called_once_with(7)
        mock_cache.get.assert_called_once_with('search:wordinfo:desks')
        assert mock_cache.set.call_count == 1
        set_args, set_kwargs = mock_cache.set.call_args
        assert set_args[0] == 'search:wordinfo:desks'
        assert set_args[1] == data
        assert set_kwargs.get('timeout') == 60 * 60 * 24

    def test_cache_hit_skips_resolve(self, client, auth_headers):
        cached_data = {
            'query': 'ruler', 'word': 'ruler', 'pronunciation': None,
            'meanings': ['자'], 'voca_id': 9,
        }
        with patch('app.routes.search.app_cache') as mock_cache, \
             patch('app.routes.search._resolve_word_info') as mock_resolve:
            mock_cache.get.return_value = cached_data
            resp = client.get('/search/word-info?word=ruler', headers=auth_headers)

        assert resp.status_code == 200
        assert resp.get_json() == {'code': 200, 'data': cached_data}
        mock_resolve.assert_not_called()
