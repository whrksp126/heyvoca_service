"""
tests/test_meaning_concept.py — "유사 뜻(같은 개념) 그룹" 관련 단위 테스트.

app/services/meaning_concept.py의 정규화 규칙 + 겹침 판정, 그리고
app/routes/study.py의 객관식 오답 제외 로직(_build_mcq_options)을 검증한다.
DB 의존성 없음(순수 함수).
"""

import random

from app.services.meaning_concept import (
    normalize_meaning,
    concept_ids_for_word,
    normalized_meanings_for_word,
    words_overlap,
    attach_concept_ids,
)
from app.routes.study import _build_mcq_options


# ──────────────────────────────────────────────
# normalize_meaning
# ──────────────────────────────────────────────

class TestNormalizeMeaning:
    def test_tilde_particle_removed(self):
        # '~을' 처럼 물결 뒤가 조사면 토큰 전체 제거
        assert normalize_meaning('~을 이루다') == '이루다'

    def test_paren_group_removed(self):
        assert normalize_meaning('(그룹으로) 나누다') == '나누다'

    def test_whitespace_collapsed(self):
        # 한글 띄어쓰기 차이는 공백을 전부 지워 흡수
        assert normalize_meaning('잘 못하다') == '잘못하다'

    def test_bracket_group_removed(self):
        assert normalize_meaning('영역[권]') == '영역'

    def test_ellipsis_non_particle_kept(self):
        # '…' 뒤가 조사가 아니면 물결/말줄임 문자만 지우고 뒤 내용은 유지
        assert normalize_meaning('…파운드 지폐') == '파운드지폐'

    def test_ellipsis_verb_phrase_kept(self):
        assert normalize_meaning('…하려고 하다') == '하려고하다'

    def test_tilde_particle_with_dots_form(self):
        assert normalize_meaning('...에게 알리다') == '알리다'

    def test_english_lowercased(self):
        assert normalize_meaning('Achieve') == 'achieve'

    def test_punctuation_stripped(self):
        assert normalize_meaning("이루다, 달성하다") == '이루다달성하다'

    def test_empty_falls_back_to_original(self):
        # 정규화 결과가 비면(전부 구두점/공백 등) 원문 strip을 반환
        assert normalize_meaning('   ') == ''
        assert normalize_meaning('') == ''

    def test_full_width_paren_removed(self):
        assert normalize_meaning('（비고）뜻풀이') == '뜻풀이'


# ──────────────────────────────────────────────
# concept_ids_for_word / normalized_meanings_for_word / words_overlap
# ──────────────────────────────────────────────

class TestConceptHelpers:
    def test_concept_ids_for_word_dedups_and_drops_none(self):
        # meaning_concepts: meanings와 순서/길이가 같은 concept_id 리스트의 리스트(뜻 하나가 여러 그룹에 속할 수 있음)
        meaning_concepts = [[1], [1, 2], [], None]
        assert concept_ids_for_word(meaning_concepts) == [1, 2]

    def test_normalized_meanings_for_word_accepts_strings_and_dicts(self):
        assert normalized_meanings_for_word(['~을 이루다', '달성하다']) == ['이루다', '달성하다']
        assert normalized_meanings_for_word([{'meaning': '~을 이루다'}]) == ['이루다']

    def test_words_overlap_by_concept_id(self):
        assert words_overlap([1, 2], [], [2, 3], []) is True
        assert words_overlap([1], [], [2], []) is False

    def test_words_overlap_fallback_by_normalized_text(self):
        # concept_id가 없는(사용자 직접 생성) 단어끼리는 정규화 뜻 문자열로 폴백 비교
        assert words_overlap([], ['이루다'], [], ['이루다']) is True
        assert words_overlap([], ['이루다'], [], ['달성하다']) is False

    def test_words_overlap_no_data(self):
        assert words_overlap([], [], [], []) is False

    def test_attach_concept_ids(self):
        # meanings(문자열 배열) 자체는 절대 변형되지 않는다 — concept 정보는 별도 병렬 배열로만 반환.
        # 뜻 하나가 여러 그룹(concept_id)에 속할 수 있어 각 원소는 리스트다.
        concept_lookup = {
            101: {'이루다': [1, 5], '달성하다': [1], '늘리다': [2]},
        }
        meanings = ['이루다', '늘리다', '알수없음']
        meaning_concepts, concept_ids = attach_concept_ids(101, meanings, concept_lookup)
        assert meaning_concepts == [[1, 5], [2], []]
        assert len(meaning_concepts) == len(meanings)
        assert concept_ids == [1, 5, 2]

    def test_attach_concept_ids_no_voca_id_returns_empty_lists(self):
        # 사용자 직접 생성 단어(voca_id 없음) → concept_ids는 항상 빈 리스트
        meaning_concepts, concept_ids = attach_concept_ids(None, ['내맘대로뜻'], {})
        assert meaning_concepts == [[]]
        assert concept_ids == []


# ──────────────────────────────────────────────
# _build_mcq_options — 오답 제외 로직
# ──────────────────────────────────────────────

class TestBuildMcqOptions:
    def setup_method(self):
        random.seed(42)

    def test_excludes_overlapping_concept_when_enough_candidates(self):
        # 정답 'achieve/이루다'(concept 1)와 겹치는 'attain/이루다'(concept 1)는
        # 다른 대체 후보가 k개 이상 있으면 오답에서 제외된다.
        distractor_pool = [
            {'text': '이루다(attain)', 'concept_ids': [1], 'normalized_meanings': []},
            {'text': '증가시키다', 'concept_ids': [2], 'normalized_meanings': []},
            {'text': '감소시키다', 'concept_ids': [3], 'normalized_meanings': []},
            {'text': '요청하다', 'concept_ids': [4], 'normalized_meanings': []},
        ]
        options, answer_index = _build_mcq_options(
            '달성하다', distractor_pool, k=3,
            correct_concept_ids=[1], correct_norms=[],
        )
        assert options is not None
        assert '이루다(attain)' not in options
        assert options[answer_index] == '달성하다'

    def test_falls_back_when_not_enough_non_overlapping_candidates(self):
        # 겹치지 않는 후보가 k개 미만이면 기존 폴백(겹침 허용)으로 채운다 — 문제 자체는 만들어져야 함.
        distractor_pool = [
            {'text': '이루다(attain)', 'concept_ids': [1], 'normalized_meanings': []},
            {'text': '이룩하다', 'concept_ids': [1], 'normalized_meanings': []},
        ]
        options, answer_index = _build_mcq_options(
            '달성하다', distractor_pool, k=3,
            correct_concept_ids=[1], correct_norms=[],
        )
        assert options is not None
        assert len(options) >= 2  # 정답 + 오답 최소 1개
        assert options[answer_index] == '달성하다'

    def test_no_candidates_returns_none(self):
        options, answer_index = _build_mcq_options('달성하다', [], k=3)
        assert options is None
        assert answer_index is None

    def test_accepts_plain_string_pool_for_backward_compat(self):
        # concept 정보 없는 옛 방식(문자열 리스트) 입력도 그대로 동작해야 한다.
        options, answer_index = _build_mcq_options('달성하다', ['이루다', '증가시키다', '감소시키다'], k=3)
        assert options is not None
        assert options[answer_index] == '달성하다'

    def test_normalized_meaning_overlap_excludes_without_concept_id(self):
        # concept_id가 없는(사용자 생성) 단어끼리는 정규화 뜻 문자열이 같으면 겹침으로 판정해 제외
        distractor_pool = [
            {'text': '이루다', 'concept_ids': [], 'normalized_meanings': ['이루다']},
            {'text': '증가시키다', 'concept_ids': [], 'normalized_meanings': ['증가시키다']},
            {'text': '감소시키다', 'concept_ids': [], 'normalized_meanings': ['감소시키다']},
            {'text': '요청하다', 'concept_ids': [], 'normalized_meanings': ['요청하다']},
        ]
        options, answer_index = _build_mcq_options(
            '이루다(정답)', distractor_pool, k=3,
            correct_concept_ids=[], correct_norms=['이루다'],
        )
        assert options is not None
        assert '이루다' not in options
