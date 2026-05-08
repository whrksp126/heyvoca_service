"""
tests/test_recommend_ranking.py — ranking 함수 유닛 테스트.

DB 의존성 없음.
"""

import pytest
import datetime as dt
from uuid import uuid4

from app.services.recommend.pool import CandidateItem
from app.services.recommend.ranking import (
    rank_overdue, rank_today, rank_long_interleave,
    rank_new, rank_short_medium,
)


def _make_item(
    uid: int,
    bucket: str,
    stability: float = 5.0,
    retrievability: float = 0.8,
    next_review: str = None,
) -> CandidateItem:
    fsrs = {
        "state": "review" if bucket != "new" else "new",
        "stability": stability,
        "retrievability": retrievability,
        "next_review": next_review,
    }
    return CandidateItem(
        user_voca_id=uid,
        user_voca_book_id=None,
        word=f"word{uid}",
        meanings=[],
        examples=[],
        fsrs_state=fsrs,
        bucket=bucket,
        word_length=5,
    )


NOW = dt.datetime(2026, 5, 8, 12, 0, 0)


class TestRankOverdue:
    def test_sorted_oldest_first(self):
        """overdue: next_review 가장 오래된 순 (오름차순)."""
        items = [
            _make_item(1, "overdue", next_review="2026-04-01T00:00:00"),
            _make_item(2, "overdue", next_review="2026-03-01T00:00:00"),
            _make_item(3, "overdue", next_review="2026-05-01T00:00:00"),
        ]
        result = rank_overdue(items, NOW)
        assert result[0].user_voca_id == 2  # 2026-03-01 가장 오래됨
        assert result[1].user_voca_id == 1  # 2026-04-01
        assert result[2].user_voca_id == 3  # 2026-05-01

    def test_empty_list(self):
        """빈 리스트 처리."""
        assert rank_overdue([], NOW) == []

    def test_original_not_mutated(self):
        """원본 리스트는 변경되지 않아야 함."""
        items = [
            _make_item(1, "overdue", next_review="2026-04-01T00:00:00"),
            _make_item(2, "overdue", next_review="2026-03-01T00:00:00"),
        ]
        original_order = [it.user_voca_id for it in items]
        rank_overdue(items, NOW)
        assert [it.user_voca_id for it in items] == original_order

    def test_no_next_review_goes_to_front(self):
        """next_review 없는 항목은 epoch(1970-01-01) 기준 → 맨 앞."""
        items = [
            _make_item(1, "overdue", next_review="2026-04-01T00:00:00"),
            _make_item(2, "overdue", next_review=None),
        ]
        result = rank_overdue(items, NOW)
        assert result[0].user_voca_id == 2


class TestRankToday:
    def test_returns_all_items(self):
        """today: 셔플 후에도 모든 아이템 포함."""
        items = [_make_item(i, "today") for i in range(10)]
        result = rank_today(items, NOW)
        assert len(result) == 10
        assert set(it.user_voca_id for it in result) == set(range(10))

    def test_callable(self):
        """호출 가능하고 예외 없음."""
        items = [_make_item(1, "today"), _make_item(2, "today")]
        result = rank_today(items, NOW)
        assert isinstance(result, list)

    def test_empty_list(self):
        assert rank_today([], NOW) == []


class TestRankLongInterleave:
    def test_low_retrievability_first(self):
        """retrievability 낮은 것이 앞 (망각 위험 우선)."""
        items = [
            _make_item(1, "long", stability=90.0, retrievability=0.9),
            _make_item(2, "long", stability=70.0, retrievability=0.5),
            _make_item(3, "long", stability=80.0, retrievability=0.3),
        ]
        result = rank_long_interleave(items)
        assert result[0].user_voca_id == 3  # retrievability 0.3 최저
        assert result[1].user_voca_id == 2  # 0.5
        assert result[2].user_voca_id == 1  # 0.9

    def test_same_retrievability_higher_stability_last(self):
        """retrievability 같으면 stability 높은 것이 뒤."""
        items = [
            _make_item(1, "long", stability=90.0, retrievability=0.7),
            _make_item(2, "long", stability=60.0, retrievability=0.7),
        ]
        result = rank_long_interleave(items)
        # stability 낮은 것(-60)이 우선이므로 item 2가 앞
        assert result[0].user_voca_id == 2


class TestRankNew:
    def test_returns_all_items(self):
        """new: 셔플 후 모든 아이템 포함."""
        items = [_make_item(i, "new", stability=0.0, retrievability=0.0) for i in range(15)]
        result = rank_new(items)
        assert len(result) == 15
        assert set(it.user_voca_id for it in result) == set(range(15))

    def test_callable_no_exception(self):
        items = [_make_item(1, "new")]
        assert isinstance(rank_new(items), list)


class TestRankShortMedium:
    def test_low_retrievability_first(self):
        """short/medium: retrievability 낮은 것 우선."""
        items = [
            _make_item(1, "short", retrievability=0.9),
            _make_item(2, "short", retrievability=0.2),
            _make_item(3, "short", retrievability=0.6),
        ]
        result = rank_short_medium(items)
        assert result[0].user_voca_id == 2
        assert result[1].user_voca_id == 3
        assert result[2].user_voca_id == 1
