"""
tests/test_near_synonyms.py — 빈칸 직접 입력의 near_synonyms 순수 로직 테스트.

context_meaning_indexes(문맥 뜻 좁히기) + rank_near_synonyms(정렬·정리). DB 의존성 없음.
"""

from app.services.meaning_concept import (
    context_meaning_indexes,
    rank_near_synonyms,
    loose_word_key,
    near_synonym_words,
)


def _ko(w):
    return f'그들은 <strong class="target-word">{w}</strong>를 봤다.'


class TestContextMeaningIndexes:
    def test_exhibition(self):
        ms = ['공정한', '박람회', '꽤', '맑은']
        assert context_meaning_indexes(ms, _ko('박람회')) == [1]

    def test_prefix_fair(self):
        ms = ['공정한', '박람회']
        assert context_meaning_indexes(ms, _ko('공정하게')) == [0]

    def test_stem_da(self):
        ms = ['막다', '열다']
        assert context_meaning_indexes(ms, _ko('막았다')) == [0]

    def test_no_highlight(self):
        assert context_meaning_indexes(['박람회'], '박람회를 봤다.') == []

    def test_no_match(self):
        assert context_meaning_indexes(['공정한', '꽤'], _ko('박람회')) == []

    def test_dict_meanings_and_inner_tag(self):
        ms = [{'meaning': '박람회'}, {'meaning': '꽤'}]
        ko = '<strong data-x="1" class="target-word"><b>박람회</b></strong>'
        assert context_meaning_indexes(ms, ko) == [0]


class TestRankNearSynonyms:
    def test_same_meaning_first_then_concept_count_then_alpha(self):
        out = rank_near_synonyms(
            ['zeta'], [('beta', 1), ('beta', 2), ('alpha', 1), ('gamma', 1), ('gamma', 2)])
        assert out == ['zeta', 'beta', 'gamma', 'alpha']

    def test_exclude_loose_variants(self):
        out = rank_near_synonyms(['Part-Time', 'part time', 'parttime.', 'other'],
                                 [], exclude=('part time',))
        assert out == ['other']

    def test_dedupe_case_insensitive_keeps_first_and_strips(self):
        out = rank_near_synonyms([' Show ', 'show', ''], [('SHOW', 1), ('  ', 1)])
        assert out == ['Show']

    def test_limit(self):
        out = rank_near_synonyms([f'w{i:02d}' for i in range(10)], [], limit=3)
        assert out == ['w00', 'w01', 'w02']

    def test_loose_key(self):
        assert loose_word_key("Ice-Cream. 's") == 'icecreams'


def test_near_synonym_words_short_circuits_without_db():
    # voca_id None / 강조 없음 → 쿼리 없이 []
    assert near_synonym_words(None, ['박람회'], [[1]], _ko('박람회')) == []
