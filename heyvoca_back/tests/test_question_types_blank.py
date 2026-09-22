"""
tests/test_question_types_blank.py — fillInTheBlank/fillInTheBlankReverse 관련 단위 테스트.

DB 의존성 없음. 세 영역을 검증한다:
  1. composer._item_can_use_question_type — fillInTheBlank(추천 대상)의 태깅/레거시 키/빈
     예문 판정. fillInTheBlankReverse는 2026-09 프론트에서 드롭되어 추천 후보에서 제외됐지만
     함수 자체(과거 로그 판정용)는 남아 있어 그 경로도 별도로 검증한다.
  2. /study/log 화이트리스트(app.constants.question_types.ALLOWED_QUESTION_TYPES) — 드롭된
     유형도 과거 로그 호환을 위해 화이트리스트에는 남아야 하지만, 추천 후보에서는 빠져야 한다.
  3. composer의 question_type 가중치 테이블 — fillInTheBlankReverse 제외, 합계 100 유지.
  4. scripts/normalize_book_examples.py 의 순수 함수(태그 정규화, 중첩 span 접기, 캐노니컬 매치).
"""

from app.services.recommend.composer import _item_can_use_question_type, _QUESTION_TYPE_WEIGHTS, _ALL_QUESTION_TYPES
from app.services.recommend.pool import CandidateItem
from app.constants.question_types import ALLOWED_QUESTION_TYPES, RECOMMENDABLE_QUESTION_TYPES

from scripts.normalize_book_examples import (
    collapse_nested_strong,
    normalize_target_word_markup,
    canon_text,
    process_example,
    process_row,
    build_dict_lookup_by_voca,
)


def _make_item(meanings=None, examples=None) -> CandidateItem:
    return CandidateItem(
        user_voca_id=1,
        user_voca_book_id=None,
        word='abandon',
        meanings=meanings or [],
        examples=examples or [],
        fsrs_state={'state': 'new', 'stability': 0.0, 'retrievability': 0.0, 'next_review': None},
        bucket='new',
        word_length=7,
    )


# ──────────────────────────────────────────────
# _item_can_use_question_type — fillInTheBlank (한→영, origin 태깅 필요)
# ──────────────────────────────────────────────

class TestItemCanUseFillInTheBlank:
    def test_tagged_origin_allows(self):
        item = _make_item(examples=[
            {'origin': 'He <strong class="target-word">abandoned</strong> the plan.', 'meaning': '그는 계획을 포기했다.'},
        ])
        assert _item_can_use_question_type(item, 'fillInTheBlank') is True

    def test_untagged_origin_disallows(self):
        item = _make_item(examples=[
            {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'},
        ])
        assert _item_can_use_question_type(item, 'fillInTheBlank') is False

    def test_legacy_en_key_tagged_allows(self):
        item = _make_item(examples=[
            {'en': 'He <strong class="target-word">abandoned</strong> the plan.', 'ko': '그는 계획을 포기했다.'},
        ])
        assert _item_can_use_question_type(item, 'fillInTheBlank') is True

    def test_empty_examples_disallows(self):
        item = _make_item(examples=[])
        assert _item_can_use_question_type(item, 'fillInTheBlank') is False

    def test_one_of_multiple_examples_tagged_allows(self):
        item = _make_item(examples=[
            {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'},
            {'origin': 'She <strong class="target-word">abandoned</strong> her car.', 'meaning': '그녀는 차를 버렸다.'},
        ])
        assert _item_can_use_question_type(item, 'fillInTheBlank') is True


# ──────────────────────────────────────────────
# _item_can_use_question_type — fillInTheBlankReverse (영→한, meanings + meaning 태깅 필요)
#
# 2026-09 프론트 드롭으로 추천 후보(RECOMMENDABLE_QUESTION_TYPES)에서는 빠졌지만, 함수
# 자체는 과거 로그 판정 등에 쓰일 수 있어 남아 있다 — 그 판정 로직만 검증한다.
# ──────────────────────────────────────────────

class TestItemCanUseFillInTheBlankReverseLegacy:
    def test_tagged_meaning_with_meanings_allows(self):
        item = _make_item(
            meanings=['포기하다'],
            examples=[{'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 <strong class="target-word">포기했다</strong>.'}],
        )
        assert _item_can_use_question_type(item, 'fillInTheBlankReverse') is True

    def test_no_meanings_disallows_even_if_tagged(self):
        item = _make_item(
            meanings=[],
            examples=[{'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 <strong class="target-word">포기했다</strong>.'}],
        )
        assert _item_can_use_question_type(item, 'fillInTheBlankReverse') is False

    def test_untagged_meaning_disallows(self):
        item = _make_item(
            meanings=['포기하다'],
            examples=[{'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'}],
        )
        assert _item_can_use_question_type(item, 'fillInTheBlankReverse') is False

    def test_legacy_ko_key_tagged_allows(self):
        item = _make_item(
            meanings=['포기하다'],
            examples=[{'en': 'He abandoned the plan.', 'ko': '그는 계획을 <strong class="target-word">포기했다</strong>.'}],
        )
        assert _item_can_use_question_type(item, 'fillInTheBlankReverse') is True

    def test_empty_examples_disallows(self):
        item = _make_item(meanings=['포기하다'], examples=[])
        assert _item_can_use_question_type(item, 'fillInTheBlankReverse') is False


# ──────────────────────────────────────────────
# ALLOWED_QUESTION_TYPES 화이트리스트
# ──────────────────────────────────────────────

class TestAllowedQuestionTypes:
    def test_contains_all_recommendable_types(self):
        for qt in RECOMMENDABLE_QUESTION_TYPES:
            assert qt in ALLOWED_QUESTION_TYPES

    def test_contains_diagnosis_type(self):
        assert 'multipleChoiceDiagnosis' in ALLOWED_QUESTION_TYPES

    def test_contains_fill_in_the_blank_reverse_for_legacy_logs(self):
        # 2026-09 프론트 드롭 — 더 이상 추천 후보는 아니지만 과거 /study/log 기록 호환을
        # 위해 화이트리스트에는 남아 있어야 한다.
        assert 'fillInTheBlankReverse' in ALLOWED_QUESTION_TYPES

    def test_fill_in_the_blank_reverse_not_recommendable(self):
        assert 'fillInTheBlankReverse' not in RECOMMENDABLE_QUESTION_TYPES

    def test_rejects_unknown_type(self):
        assert 'notAQuestionType' not in ALLOWED_QUESTION_TYPES
        assert '' not in ALLOWED_QUESTION_TYPES


# ──────────────────────────────────────────────
# composer._QUESTION_TYPE_WEIGHTS — fillInTheBlankReverse 제외, 새 가중치(합계 100)
# ──────────────────────────────────────────────

class TestQuestionTypeWeights:
    def test_fill_in_the_blank_reverse_excluded_from_weights(self):
        assert 'fillInTheBlankReverse' not in _QUESTION_TYPE_WEIGHTS
        assert 'fillInTheBlankReverse' not in _ALL_QUESTION_TYPES

    def test_weights_sum_to_100(self):
        assert sum(_QUESTION_TYPE_WEIGHTS.values()) == 100

    def test_expected_weights(self):
        assert _QUESTION_TYPE_WEIGHTS == {
            'multipleChoice': 25,
            'reverseMultipleChoice': 25,
            'multipleChoiceListening': 15,
            'fillInTheBlank': 20,
            'cardMatch': 10,
            'cardMatchListening': 5,
        }


# ──────────────────────────────────────────────
# scripts/normalize_book_examples.py — collapse_nested_strong / normalize_target_word_markup
# ──────────────────────────────────────────────

class TestCollapseNestedStrong:
    def test_collapses_double_strong(self):
        s = '<strong class="target-word"><strong class="target-word">abandon</strong></strong>'
        assert collapse_nested_strong(s) == '<strong class="target-word">abandon</strong>'

    def test_leaves_single_strong_untouched(self):
        s = '<strong class="target-word">abandon</strong>'
        assert collapse_nested_strong(s) == s

    def test_empty_input_returns_empty(self):
        assert collapse_nested_strong('') == ''
        assert collapse_nested_strong(None) == ''


class TestNormalizeTargetWordMarkup:
    def test_span_variant_becomes_strong(self):
        s = 'The notice <span class="target-word">clarified</span> the policy.'
        result = normalize_target_word_markup(s)
        assert result == 'The notice <strong class="target-word">clarified</strong> the policy.'

    def test_nested_span_wrapping_strong_becomes_single_strong(self):
        s = 'All staff are <span class="target-word"><strong class="target-word">accustomed</strong></span> to it.'
        result = normalize_target_word_markup(s)
        assert result == 'All staff are <strong class="target-word">accustomed</strong> to it.'
        # 이중으로 감싸지지 않아야 함
        assert result.count('<strong') == 1

    def test_b_and_em_variants_become_strong(self):
        assert normalize_target_word_markup('<b class="target-word">abandon</b>') == \
            '<strong class="target-word">abandon</strong>'
        assert normalize_target_word_markup('<em class="target-word">abandon</em>') == \
            '<strong class="target-word">abandon</strong>'

    def test_already_standard_untouched(self):
        s = 'He <strong class="target-word">abandoned</strong> it.'
        assert normalize_target_word_markup(s) == s

    def test_plain_text_untouched(self):
        assert normalize_target_word_markup('plain text') == 'plain text'

    def test_empty_input_returns_empty_string(self):
        assert normalize_target_word_markup('') == ''
        assert normalize_target_word_markup(None) == ''


# ──────────────────────────────────────────────
# canon_text — 사전 캐노니컬 매치용
# ──────────────────────────────────────────────

class TestCanonText:
    def test_strips_tags_and_lowercases(self):
        a = canon_text('He <strong class="target-word">Abandoned</strong> the plan.')
        b = canon_text('he abandoned the plan.')
        assert a == b

    def test_normalizes_whitespace(self):
        a = canon_text('He   abandoned\nthe  plan.')
        b = canon_text('He abandoned the plan.')
        assert a == b

    def test_none_returns_empty(self):
        assert canon_text(None) == ''


# ──────────────────────────────────────────────
# process_example — 예문 단건 보정
# ──────────────────────────────────────────────

class TestProcessExample:
    def test_already_tagged_ok(self):
        ex = {'origin': 'He <strong class="target-word">abandoned</strong> it.', 'meaning': '그는 <strong class="target-word">포기했다</strong>.'}
        new_ex, changed, status = process_example(ex, dict_lookup={})
        assert status == 'ok'
        assert changed is False
        assert new_ex == ex

    def test_legacy_keys_converted(self):
        ex = {'en': 'He abandoned it.', 'ko': '그는 포기했다.'}
        new_ex, changed, status = process_example(ex, dict_lookup={})
        assert changed is True
        assert new_ex['origin'] == 'He abandoned it.'
        assert new_ex['meaning'] == '그는 포기했다.'
        # meaning엔 태그가 없고 dict_lookup도 없으므로 미태깅 잔여로 남는다
        assert status == 'untagged_no_match'

    def test_span_variant_normalized(self):
        ex = {'origin': 'He <span class="target-word">abandoned</span> it.', 'meaning': '그는 <span class="target-word">포기했다</span>.'}
        new_ex, changed, status = process_example(ex, dict_lookup={})
        assert changed is True
        assert new_ex['origin'] == 'He <strong class="target-word">abandoned</strong> it.'
        assert new_ex['meaning'] == '그는 <strong class="target-word">포기했다</strong>.'
        assert status == 'ok'

    def test_empty_meaning_filled_by_dict_match(self):
        ex = {'origin': 'He abandoned the plan.', 'meaning': ''}
        dict_lookup = {
            canon_text('He abandoned the plan.'): (
                'He <strong class="target-word">abandoned</strong> the plan.',
                '그는 계획을 <strong class="target-word">포기했다</strong>.',
            ),
        }
        new_ex, changed, status = process_example(ex, dict_lookup=dict_lookup)
        assert status == 'ok'
        assert changed is True
        assert new_ex['origin'] == 'He <strong class="target-word">abandoned</strong> the plan.'
        assert new_ex['meaning'] == '그는 계획을 <strong class="target-word">포기했다</strong>.'

    def test_empty_meaning_no_match_leaves_status(self):
        ex = {'origin': 'He abandoned the plan.', 'meaning': ''}
        new_ex, changed, status = process_example(ex, dict_lookup={})
        assert status == 'empty_no_match'
        assert new_ex['meaning'] == ''

    def test_untagged_meaning_filled_by_dict_match(self):
        ex = {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'}
        dict_lookup = {
            canon_text('He abandoned the plan.'): (
                'He <strong class="target-word">abandoned</strong> the plan.',
                '그는 계획을 <strong class="target-word">포기했다</strong>.',
            ),
        }
        new_ex, changed, status = process_example(ex, dict_lookup=dict_lookup)
        assert status == 'ok'
        assert new_ex['meaning'] == '그는 계획을 <strong class="target-word">포기했다</strong>.'

    def test_untagged_meaning_falls_back_to_tag_ko_fn(self):
        ex = {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'}

        def stub_tag_ko_fn(origin, meaning):
            return meaning.replace('포기했다', '<strong class="target-word">포기했다</strong>')

        new_ex, changed, status = process_example(ex, dict_lookup={}, tag_ko_fn=stub_tag_ko_fn)
        assert status == 'ok'
        assert new_ex['meaning'] == '그는 계획을 <strong class="target-word">포기했다</strong>.'

    def test_untagged_meaning_tag_ko_fn_fails_leaves_status(self):
        ex = {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'}

        def stub_tag_ko_fn(origin, meaning):
            return None  # GPT 필요 - 스킵

        new_ex, changed, status = process_example(ex, dict_lookup={}, tag_ko_fn=stub_tag_ko_fn)
        assert status == 'untagged_no_match'
        assert new_ex['meaning'] == '그는 계획을 포기했다.'

    def test_non_dict_item_dropped(self):
        new_ex, changed, status = process_example('not a dict', dict_lookup={})
        assert new_ex is None
        assert changed is True
        assert status == 'dropped_non_dict'


# ──────────────────────────────────────────────
# process_row / build_dict_lookup_by_voca
# ──────────────────────────────────────────────

class TestProcessRow:
    def test_empty_value_returns_empty(self):
        for raw in (None, '', '[]', 'null'):
            new_items, changed, leftovers = process_row(raw, dict_lookup={})
            assert new_items == []
            assert changed is False
            assert leftovers == []

    def test_invalid_json_raises(self):
        try:
            process_row('not json', dict_lookup={})
            assert False, 'ValueError가 발생해야 함'
        except ValueError:
            pass

    def test_drops_fully_empty_items(self):
        raw = '[{"origin": "", "meaning": ""}, {"origin": "Hi.", "meaning": "안녕."}]'
        new_items, changed, leftovers = process_row(raw, dict_lookup={})
        assert changed is True
        assert len(new_items) == 1
        assert new_items[0]['origin'] == 'Hi.'

    def test_mixed_ok_and_leftover(self):
        raw = json_dump_examples([
            {'origin': 'He <strong class="target-word">abandoned</strong> it.', 'meaning': '그는 포기했다.'},
        ])
        new_items, changed, leftovers = process_row(raw, dict_lookup={})
        assert len(new_items) == 1
        assert len(leftovers) == 1
        assert leftovers[0]['status'] == 'untagged_no_match'


def json_dump_examples(items):
    import json
    return json.dumps(items, ensure_ascii=False)


class TestBuildDictLookupByVoca:
    def test_groups_by_voca_id_and_canon_key(self):
        rows = [
            (1, 'He abandoned it.', 'He <strong class="target-word">abandoned</strong> it. -- placeholder'),
            (1, 'He <strong class="target-word">abandoned</strong> it.', '그는 <strong class="target-word">포기했다</strong>.'),
            (2, 'She left.', '그녀는 떠났다.'),
        ]
        lookup = build_dict_lookup_by_voca(rows)
        # 같은 voca_id(1) 안에서 canon 텍스트가 같은 두 행은 먼저 나온 것이 우선
        key = canon_text('He abandoned it.')
        assert lookup[1][key][0] == 'He abandoned it.'
        assert 2 in lookup
