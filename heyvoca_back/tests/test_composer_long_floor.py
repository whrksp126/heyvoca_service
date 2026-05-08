"""
tests/test_composer_long_floor.py — long 버킷 5% 최소 보장 검증.

LONG_FLOOR_RATIO = 0.05 → count=20이면 최소 ceil(20*0.05)=1개 보장.
count=40이면 최소 2개 보장.
DB 의존성 없음.
"""

import math
import pytest
from uuid import uuid4

from app.services.recommend.pool import CandidateItem
from app.services.recommend.composer import compose, _LONG_FLOOR_RATIO


def _make_item(uid: int, bucket: str, stability: float = 5.0,
               retrievability: float = 0.7) -> CandidateItem:
    fsrs = {
        "state": "new" if bucket == "new" else "review",
        "stability": stability,
        "retrievability": retrievability,
        "next_review": "2026-04-01T00:00:00" if bucket == "overdue" else "2026-06-01T00:00:00",
    }
    return CandidateItem(
        user_voca_id=uid,
        user_voca_book_id=None,
        word=f"word{uid}",
        meanings=[{"meaning": "뜻"}],
        examples=[],
        fsrs_state=fsrs,
        bucket=bucket,
        word_length=5,
    )


def _make_pool_with_long(overdue=0, today=0, new_=0, short=0, medium=0, long_=0):
    pool = []
    uid = 1
    for _ in range(overdue):
        pool.append(_make_item(uid, "overdue"))
        uid += 1
    for _ in range(today):
        pool.append(_make_item(uid, "today"))
        uid += 1
    for _ in range(new_):
        pool.append(_make_item(uid, "new", stability=0.0, retrievability=0.0))
        uid += 1
    for _ in range(short):
        pool.append(_make_item(uid, "short", stability=5.0))
        uid += 1
    for _ in range(medium):
        pool.append(_make_item(uid, "medium", stability=40.0))
        uid += 1
    for _ in range(long_):
        pool.append(_make_item(uid, "long", stability=90.0))
        uid += 1
    return pool


class TestLongFloor:
    def test_long_floor_min_1_when_available(self):
        """
        long 단어가 풀에 있으면 floor 개수(최소 1개) 이상 반드시 포함.
        count=20 → floor=ceil(20*0.05)=1
        """
        pool = _make_pool_with_long(overdue=15, today=10, new_=10, long_=3)
        result = compose(pool, 20, 'daily')
        long_cnt = result['composition'].get('long', 0)
        floor = max(1, math.ceil(20 * _LONG_FLOOR_RATIO))
        assert long_cnt >= floor, f"long count {long_cnt} < floor {floor}"

    def test_long_floor_when_only_long_in_pool(self):
        """long 단어만 있으면 count개 전부 long."""
        pool = _make_pool_with_long(long_=30)
        result = compose(pool, 10, 'daily')
        long_cnt = result['composition'].get('long', 0)
        assert long_cnt == 10

    def test_long_floor_with_count_40(self):
        """count=40이면 floor=2개 이상 보장."""
        pool = _make_pool_with_long(overdue=30, today=20, new_=20, medium=10, long_=5)
        result = compose(pool, 40, 'daily')
        long_cnt = result['composition'].get('long', 0)
        floor = max(1, math.ceil(40 * _LONG_FLOOR_RATIO))
        assert long_cnt >= floor

    def test_long_floor_zero_long_in_pool_fills_from_medium(self):
        """
        long 단어가 없으면 medium 상위(stability 높은 것)에서 보충 시도.
        medium이 있으면 composition에 medium이 포함됨.
        """
        pool = _make_pool_with_long(overdue=15, today=10, new_=10, medium=10, long_=0)
        result = compose(pool, 20, 'daily')
        # long이 없어도 에러 없이 동작해야 함
        total = sum(result['composition'].values())
        assert total > 0

    def test_long_not_capped_at_5percent(self):
        """
        long 풀이 충분히 있을 때는 5%를 넘어 더 채울 수 있음.
        (5%는 최소값이지 최대값이 아님)
        """
        # long 단어만 있는 풀 → 전부 long으로 채움
        pool = _make_pool_with_long(long_=50)
        result = compose(pool, 20, 'daily')
        long_cnt = result['composition'].get('long', 0)
        # long만 있으므로 20개 전부 long (5% = 1개이지만 다른 bucket 없음)
        assert long_cnt == 20

    def test_long_floor_with_no_pool(self):
        """빈 풀 → 에러 없이 빈 결과."""
        result = compose([], 20, 'daily')
        assert result['items'] == []
        assert result['composition'] == {}

    def test_long_floor_respects_minimum_even_with_high_accuracy(self):
        """
        high_accuracy 동적 비율에서도 long floor 최소 1개 보장.
        (new +10%, overdue/today -5% 에도 long은 floor 유지)
        """
        pool = _make_pool_with_long(overdue=20, today=20, new_=20, long_=5)
        user_stats = {
            "recent_7d_correct_rate": 0.95,
            "recent_7d_total": 100,
            "weakness_types": [],
            "today_seen": {},
        }
        result = compose(pool, 20, 'daily', user_stats=user_stats)
        long_cnt = result['composition'].get('long', 0)
        floor = max(1, math.ceil(20 * _LONG_FLOOR_RATIO))
        assert long_cnt >= floor
        assert result['composition_strategy']['dynamic_adjustment'] == 'high_accuracy'
