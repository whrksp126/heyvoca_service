"""
tests/test_sync_user_examples.py — scripts/sync_user_book_examples.py 의 순수 함수 단위 테스트.

DB 의존성 없음. --stale 모드에서 새로 추가된 예문 집합 비교(is_stale_user_examples) 위주로
검증한다. 기존 is_defective_user_examples 기준과의 상호작용(빈 값은 --stale이 아니라 기존
'빈 데이터' 기준이 처리)도 함께 확인한다.
"""

import json

from scripts.sync_user_book_examples import (
    canon_origin_text,
    example_origin_set,
    is_defective_user_examples,
    is_stale_user_examples,
)


def _examples_json(items):
    return json.dumps(items, ensure_ascii=False)


ADMIN_EXAMPLES = [
    {'origin': 'He <strong class="target-word">abandoned</strong> the plan.', 'meaning': '그는 계획을 포기했다.'},
    {'origin': 'She <strong class="target-word">abandoned</strong> her car.', 'meaning': '그녀는 차를 버렸다.'},
]


class TestCanonOriginText:
    def test_strips_tags_and_lowercases(self):
        a = canon_origin_text('He <strong class="target-word">Abandoned</strong> the plan.')
        b = canon_origin_text('he abandoned the plan.')
        assert a == b

    def test_normalizes_whitespace(self):
        a = canon_origin_text('He   abandoned\nthe  plan.')
        b = canon_origin_text('He abandoned the plan.')
        assert a == b

    def test_none_returns_empty(self):
        assert canon_origin_text(None) == ''


class TestExampleOriginSet:
    def test_extracts_origin_from_standard_keys(self):
        items = [{'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'}]
        assert example_origin_set(items) == {'he abandoned the plan.'}

    def test_extracts_origin_from_legacy_keys(self):
        items = [{'en': 'He abandoned the plan.', 'ko': '그는 계획을 포기했다.'}]
        assert example_origin_set(items) == {'he abandoned the plan.'}

    def test_ignores_non_dict_and_empty_origin(self):
        items = ['not a dict', {'origin': '', 'meaning': '뜻'}]
        assert example_origin_set(items) == set()


class TestIsStaleUserExamples:
    def test_identical_sets_not_stale(self):
        user_raw = _examples_json([
            {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'},
            {'origin': 'She abandoned her car.', 'meaning': '그녀는 차를 버렸다.'},
        ])
        assert is_stale_user_examples(user_raw, ADMIN_EXAMPLES) is False

    def test_user_subset_of_admin_not_stale(self):
        user_raw = _examples_json([
            {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'},
        ])
        assert is_stale_user_examples(user_raw, ADMIN_EXAMPLES) is False

    def test_user_has_extra_old_sentence_is_stale(self):
        # admin에서 삭제/교체된 옛 문장을 user가 여전히 들고 있는 경우
        user_raw = _examples_json([
            {'origin': 'I feel cold.', 'meaning': '나는 춥다.'},
        ])
        assert is_stale_user_examples(user_raw, ADMIN_EXAMPLES) is True

    def test_tag_whitespace_case_differences_alone_not_stale(self):
        user_raw = _examples_json([
            {'origin': 'he   ABANDONED the   plan.', 'meaning': '그는 계획을 포기했다.'},
        ])
        assert is_stale_user_examples(user_raw, ADMIN_EXAMPLES) is False

    def test_empty_user_not_stale_here_but_defective_criterion_applies(self):
        # 빈 값은 --stale이 담당하는 영역이 아니라 기존 '빈 데이터' 결함 기준이 처리한다.
        for raw in (None, '', '[]', 'null'):
            assert is_stale_user_examples(raw, ADMIN_EXAMPLES) is False
            assert is_defective_user_examples(raw, ADMIN_EXAMPLES) is True

    def test_empty_admin_examples_user_nonempty_is_stale(self):
        user_raw = _examples_json([
            {'origin': 'He abandoned the plan.', 'meaning': '그는 계획을 포기했다.'},
        ])
        assert is_stale_user_examples(user_raw, []) is True

    def test_invalid_json_not_stale(self):
        # 파싱 불가 값은 is_defective_user_examples가 True로 처리하므로 stale 쪽은 False로 둬도
        # 결함 판정 자체는 놓치지 않는다.
        assert is_stale_user_examples('not json', ADMIN_EXAMPLES) is False
        assert is_defective_user_examples('not json', ADMIN_EXAMPLES) is True
