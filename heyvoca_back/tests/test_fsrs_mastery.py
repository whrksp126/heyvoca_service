"""
tests/test_fsrs_mastery.py — app/services/fsrs/state.py의 mastery 블록(get_mastery/
set_mastery) 유닛 테스트. DB 의존성 없음.
"""

import pytest

from app.services.fsrs.state import (
    get_mastery,
    set_mastery,
    DEFAULT_MASTERY,
    MASTERY_RECENT_MAX_LEN,
)


class TestGetMasteryDefaults:
    def test_missing_field_returns_default(self):
        """mastery 필드가 아예 없는 기존 payload(백필 전) → 안전 기본값."""
        payload = {"schema_version": 3, "fsrs": {"state": "review"}}
        result = get_mastery(payload)
        assert result == {"recent": [], "streak": 0, "last_studied_at": None}

    def test_empty_payload(self):
        assert get_mastery({}) == dict(DEFAULT_MASTERY)

    def test_malformed_mastery_not_dict(self):
        """mastery 값이 dict가 아니면(손상된 데이터) 기본값으로 폴백."""
        payload = {"mastery": "corrupted"}
        result = get_mastery(payload)
        assert result["recent"] == []
        assert result["streak"] == 0

    def test_recent_not_list_falls_back_to_empty(self):
        payload = {"mastery": {"recent": "not-a-list", "last_studied_at": None}}
        result = get_mastery(payload)
        assert result["recent"] == []

    def test_recent_truncated_to_max_len(self):
        payload = {"mastery": {"recent": [True] * 10, "last_studied_at": None}}
        result = get_mastery(payload)
        assert len(result["recent"]) == MASTERY_RECENT_MAX_LEN

    def test_last_studied_at_non_string_falls_back_to_none(self):
        payload = {"mastery": {"recent": [], "last_studied_at": 12345}}
        result = get_mastery(payload)
        assert result["last_studied_at"] is None


class TestStreakDerivedFromRecent:
    """streak는 저장된 값이 아니라 항상 recent(최신이 맨 앞)로부터 재계산된다."""

    def test_streak_counts_leading_true(self):
        payload = {"mastery": {"recent": [True, True, True, False, True], "last_studied_at": None}}
        assert get_mastery(payload)["streak"] == 3

    def test_streak_zero_when_first_is_false(self):
        payload = {"mastery": {"recent": [False, True, True], "last_studied_at": None}}
        assert get_mastery(payload)["streak"] == 0

    def test_streak_ignores_stale_stored_value(self):
        """저장돼 있던 streak 값이 recent와 안 맞아도(드리프트) 항상 recent 기준으로 재계산."""
        payload = {"mastery": {"recent": [True, False], "streak": 99, "last_studied_at": None}}
        assert get_mastery(payload)["streak"] == 1

    def test_all_true_streak_capped_at_recent_len(self):
        payload = {"mastery": {"recent": [True] * MASTERY_RECENT_MAX_LEN, "last_studied_at": None}}
        assert get_mastery(payload)["streak"] == MASTERY_RECENT_MAX_LEN


class TestSetMastery:
    def test_prepends_new_result_correct(self):
        payload = {"mastery": {"recent": [False, True], "last_studied_at": "2026-05-01T00:00:00Z"}}
        result = set_mastery(payload, True, "2026-05-08T12:00:00Z")
        assert result["mastery"]["recent"] == [True, False, True]
        assert result["mastery"]["streak"] == 1
        assert result["mastery"]["last_studied_at"] == "2026-05-08T12:00:00Z"

    def test_prepends_new_result_incorrect_resets_streak(self):
        payload = {"mastery": {"recent": [True, True, True], "last_studied_at": None}}
        result = set_mastery(payload, False, "2026-05-08T12:00:00Z")
        assert result["mastery"]["recent"] == [False, True, True, True]
        assert result["mastery"]["streak"] == 0

    def test_trims_to_max_len(self):
        payload = {"mastery": {"recent": [True, True, True, True, True], "last_studied_at": None}}
        result = set_mastery(payload, True, "2026-05-08T12:00:00Z")
        assert len(result["mastery"]["recent"]) == MASTERY_RECENT_MAX_LEN
        assert result["mastery"]["streak"] == MASTERY_RECENT_MAX_LEN

    def test_first_ever_answer_on_word_with_no_mastery(self):
        payload = {"schema_version": 3, "fsrs": {}}
        result = set_mastery(payload, True, "2026-05-08T12:00:00Z")
        assert result["mastery"]["recent"] == [True]
        assert result["mastery"]["streak"] == 1

    def test_does_not_mutate_original_payload(self):
        payload = {"mastery": {"recent": [True], "last_studied_at": None}}
        set_mastery(payload, False, "2026-05-08T12:00:00Z")
        assert payload["mastery"]["recent"] == [True]  # 원본 불변

    def test_preserves_other_payload_keys(self):
        payload = {"schema_version": 3, "fsrs": {"state": "review"}, "mastery": {"recent": []}}
        result = set_mastery(payload, True, "2026-05-08T12:00:00Z")
        assert result["schema_version"] == 3
        assert result["fsrs"] == {"state": "review"}
