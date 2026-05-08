"""
tests/test_interleave.py — 인터리빙 (음성/형태소 유사 단어 인접 회피) 검증.

DB 의존성 없음.
"""

import pytest

from app.utils.interleave import interleave_avoid_adjacent, get_group_key


class TestGetGroupKey:
    def test_prefix_3_chars(self):
        """길이 4 이상 단어 → prefix:xxx 형태 키."""
        key = get_group_key("account")
        assert key == "prefix:acc"

    def test_same_prefix_same_key(self):
        """account, accountable, accountant — 같은 그룹 키."""
        k1 = get_group_key("account")
        k2 = get_group_key("accountable")
        k3 = get_group_key("accountant")
        assert k1 == k2 == k3

    def test_different_prefix_different_key(self):
        """play, work — 다른 그룹 키."""
        assert get_group_key("play") != get_group_key("work")

    def test_short_word_solo_key(self):
        """길이 3 이하 단어 → solo: 형태 (개별 그룹)."""
        key = get_group_key("hi")
        assert key.startswith("solo:")

    def test_case_insensitive(self):
        """대소문자 무관하게 같은 키."""
        assert get_group_key("Account") == get_group_key("account")


class TestInterleaveAvoidAdjacent:
    def _run(self, words: list) -> list:
        """단어 리스트를 dict 아이템으로 래핑하여 인터리빙 적용 후 단어 목록 반환."""
        items = [{'word': w} for w in words]
        result = interleave_avoid_adjacent(items, lambda it: it['word'])
        return [it['word'] for it in result]

    def test_no_adjacent_same_group(self):
        """
        같은 그룹(account*)이 연속되지 않아야 함.
        account, accountable, accountant, play, work → 인터리빙 후 account* 비연속
        """
        words = ["account", "accountable", "accountant", "play", "work"]
        result = self._run(words)

        for i in range(len(result) - 1):
            g1 = get_group_key(result[i])
            g2 = get_group_key(result[i + 1])
            # 완벽한 인터리빙이 불가능한 경우는 예외이지만
            # 이 케이스는 가능하므로 인접이 없어야 함
            if g1 == g2:
                # 세 단어 모두 같은 그룹이므로 불가피 인접 허용 체크
                same_group_count = sum(1 for w in words if get_group_key(w) == g1)
                other_count = len(words) - same_group_count
                if same_group_count > other_count + 1:
                    # 불가피한 인접 — 테스트 통과
                    pass
                else:
                    pytest.fail(f"인접 같은 그룹: {result[i]} 와 {result[i+1]}")

    def test_empty_list(self):
        """빈 리스트 → 빈 리스트."""
        assert self._run([]) == []

    def test_single_item(self):
        """단일 아이템 → 그대로."""
        assert self._run(["word"]) == ["word"]

    def test_all_different_groups(self):
        """모두 다른 그룹 → 인접 없음, 순서만 조정."""
        words = ["apple", "banana", "cherry", "durian"]
        result = self._run(words)
        assert sorted(result) == sorted(words)

    def test_all_same_group(self):
        """모두 같은 그룹 → 인터리빙 불가피, 길이는 보존."""
        words = ["account", "accountable", "accountant"]
        result = self._run(words)
        assert len(result) == 3
        assert sorted(result) == sorted(words)

    def test_preserves_all_items(self):
        """인터리빙 후 원본 아이템이 모두 보존됨."""
        words = ["elaborate", "elaboration", "play", "work", "account", "accounting"]
        result = self._run(words)
        assert sorted(result) == sorted(words)

    def test_original_not_mutated(self):
        """원본 리스트 불변."""
        items = [{'word': 'account'}, {'word': 'play'}, {'word': 'accountable'}]
        original_copy = [dict(it) for it in items]
        interleave_avoid_adjacent(items, lambda it: it['word'])
        for orig, item in zip(original_copy, items):
            assert orig['word'] == item['word']

    def test_two_adjacent_same_group_swapped(self):
        """
        ['account', 'accountable', 'play'] → 'account', 'play', 'accountable' 로 재배치.
        """
        words = ["account", "accountable", "play"]
        result = self._run(words)
        # 인터리빙 후 account와 accountable이 인접하지 않아야 함
        for i in range(len(result) - 1):
            if get_group_key(result[i]) == get_group_key("account"):
                if get_group_key(result[i + 1]) == get_group_key("account"):
                    # play가 2개밖에 없으므로 불가피한 경우 제외
                    other_count = sum(1 for w in words if get_group_key(w) != get_group_key("account"))
                    same_count = sum(1 for w in words if get_group_key(w) == get_group_key("account"))
                    if same_count <= other_count + 1:
                        pytest.fail(f"인접 같은 그룹: {result[i]}, {result[i+1]}")
