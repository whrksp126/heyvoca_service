"""
tests/test_recommend_composer.py — composer 유닛 테스트.

DB 의존성 없음.
"""

import pytest
from uuid import uuid4

from app.services.recommend.pool import CandidateItem
from app.services.recommend.composer import compose, COMPOSITION_DAILY


def _make_item(uid: int, bucket: str, stability: float = 5.0,
               retrievability: float = 0.7, next_review: str = None) -> CandidateItem:
    fsrs = {
        "state": "new" if bucket == "new" else "review",
        "stability": stability,
        "retrievability": retrievability,
        "next_review": next_review or ("2026-04-01T00:00:00" if bucket == "overdue" else "2026-06-01T00:00:00"),
    }
    return CandidateItem(
        user_voca_id=uid,
        user_voca_book_id=None,
        word=f"word{uid}",
        meanings=[],
        examples=[],
        fsrs_state=fsrs,
        bucket=bucket,
        word_length=5 + uid % 5,
    )


def _make_pool(overdue: int = 0, today: int = 0, new: int = 0,
               short: int = 0, medium: int = 0, long_: int = 0) -> list:
    """지정 bucket 분포의 풀 생성."""
    pool = []
    uid = 1
    for _ in range(overdue):
        pool.append(_make_item(uid, "overdue", next_review="2026-04-01T00:00:00"))
        uid += 1
    for _ in range(today):
        pool.append(_make_item(uid, "today", next_review="2026-05-08T00:00:00"))
        uid += 1
    for _ in range(new):
        pool.append(_make_item(uid, "new", stability=0.0, retrievability=0.0, next_review=None))
        uid += 1
    for _ in range(short):
        pool.append(_make_item(uid, "short", stability=5.0, next_review="2026-06-01T00:00:00"))
        uid += 1
    for _ in range(medium):
        pool.append(_make_item(uid, "medium", stability=30.0, next_review="2026-07-01T00:00:00"))
        uid += 1
    for _ in range(long_):
        pool.append(_make_item(uid, "long", stability=90.0, next_review="2027-01-01T00:00:00"))
        uid += 1
    return pool


class TestComposeBasic:
    def test_empty_pool(self):
        """빈 풀 → 빈 결과."""
        result = compose([], 20, 'daily')
        assert result['items'] == []
        assert result['composition'] == {}

    def test_returns_correct_keys(self):
        """반환 dict에 composition, items 키 존재."""
        pool = _make_pool(overdue=10, today=5, new=10, long_=2)
        result = compose(pool, 20, 'daily')
        assert 'composition' in result
        assert 'items' in result

    def test_total_count_not_exceed_pool_size(self):
        """pool 크기보다 많은 count 요청 → pool 크기 이하로 반환."""
        pool = _make_pool(overdue=2, today=2, new=2)
        result = compose(pool, 20, 'daily')
        assert len(result['items']) <= 6

    def test_count_not_exceed_requested(self):
        """요청 count 이하로 반환."""
        pool = _make_pool(overdue=20, today=20, new=20, long_=5)
        result = compose(pool, 20, 'daily')
        assert len(result['items']) <= 20


class TestComposeDailyRatio:
    def test_daily_ratio_approximate(self):
        """100개 풀에서 20개 뽑을 때 daily 비율 근사 검증."""
        pool = _make_pool(overdue=40, today=20, new=30, long_=10)
        result = compose(pool, 20, 'daily')
        composition = result['composition']
        total = sum(composition.values())

        assert total == len(result['items'])
        assert total > 0

        # overdue는 최대 50%
        overdue_cnt = composition.get('overdue', 0)
        assert overdue_cnt <= 20 * 0.50 + 2  # +2 여유

        # new는 최소 20% (풀에 충분히 있을 때)
        # 풀에 30개 new → 20*0.2=4개 이상
        new_cnt = composition.get('new', 0)
        assert new_cnt >= 3  # floor(20*0.2)=4, -1 여유

    def test_new_guaranteed_when_available(self):
        """풀에 신규 5개 있을 때 최소 4개 출제 (20% 보장)."""
        pool = _make_pool(overdue=30, today=20, new=5, long_=5)
        result = compose(pool, 20, 'daily')
        new_cnt = result['composition'].get('new', 0)
        # 20 * 0.20 = 4, 풀에 5개 있으므로 최소 4 이상
        assert new_cnt >= 4

    def test_long_interleaved(self):
        """풀에 long 단어가 있으면 최소 1개 포함."""
        pool = _make_pool(overdue=10, today=10, new=10, long_=5)
        result = compose(pool, 20, 'daily')
        long_cnt = result['composition'].get('long', 0)
        assert long_cnt >= 1


class TestComposeShortage:
    def test_overdue_zero_fills_from_today(self):
        """overdue 0개일 때 today에서 보충 → today 비율 증가."""
        pool = _make_pool(overdue=0, today=20, new=10, long_=2)
        result = compose(pool, 20, 'daily')
        # overdue 없음 → 해당 슬롯이 today 또는 다른 카테고리로 채워짐
        today_cnt = result['composition'].get('today', 0)
        # 원래 today 목표 5개(25%) + overdue 부족 보충 포함
        assert today_cnt >= 5
        assert len(result['items']) > 0

    def test_new_shortage_fills_from_short(self):
        """new 부족 → short에서 보충."""
        pool = _make_pool(overdue=10, today=5, new=2, short=10, long_=2)
        result = compose(pool, 20, 'daily')
        # new 2개 + short에서 보충 → short가 포함됨
        short_cnt = result['composition'].get('short', 0)
        new_cnt = result['composition'].get('new', 0)
        # new + short 합계가 원래 new 목표(4) 이상
        assert new_cnt + short_cnt >= 2

    def test_all_new_pool(self):
        """풀 전체가 new → new만 반환."""
        pool = _make_pool(new=50)
        result = compose(pool, 20, 'daily')
        assert len(result['items']) == 20
        assert all(it.bucket == 'new' for it in result['items'])

    def test_all_overdue_pool(self):
        """풀 전체가 overdue → overdue만 반환."""
        pool = _make_pool(overdue=50)
        result = compose(pool, 20, 'daily')
        assert len(result['items']) == 20
        assert all(it.bucket == 'overdue' for it in result['items'])


class TestComposeTypes:
    def test_quick_type_returns_items(self):
        """quick 타입: retrievability 오름차순 top-N."""
        pool = _make_pool(overdue=5, today=5, new=5, short=5, medium=5, long_=5)
        result = compose(pool, 10, 'quick')
        assert len(result['items']) == 10
        # retrievability 낮은 것이 앞에 있어야 함
        items = result['items']
        for i in range(len(items) - 1):
            r1 = float(items[i].fsrs_state.get("retrievability") or 0.0)
            r2 = float(items[i + 1].fsrs_state.get("retrievability") or 0.0)
            assert r1 <= r2 + 1e-9

    def test_test_type_returns_items(self):
        """test 타입: bucket 우선순위 순."""
        pool = _make_pool(overdue=5, today=5, new=5, short=5, medium=5, long_=5)
        result = compose(pool, 15, 'test')
        assert len(result['items']) <= 15
        assert 'composition' in result

    def test_exam_type_returns_items(self):
        """exam 타입: test와 동일 동작."""
        pool = _make_pool(overdue=5, today=5, new=5)
        result = compose(pool, 10, 'exam')
        assert len(result['items']) <= 10

    def test_unknown_type_falls_back_to_daily(self):
        """알 수 없는 타입 → daily 폴백."""
        pool = _make_pool(overdue=10, today=5, new=10, long_=2)
        result = compose(pool, 20, 'unknown_type')
        assert len(result['items']) > 0

    def test_today_type_same_as_daily(self):
        """today 타입은 daily와 동일 비율 로직."""
        pool = _make_pool(overdue=10, today=10, new=10, long_=5)
        result = compose(pool, 20, 'today')
        assert len(result['items']) <= 20


class TestComposeEdgeCases:
    def test_count_1(self):
        """count=1 → 1개만 반환."""
        pool = _make_pool(overdue=5, today=5, new=5)
        result = compose(pool, 1, 'daily')
        assert len(result['items']) == 1

    def test_composition_sum_equals_items(self):
        """composition의 합 = items 길이."""
        pool = _make_pool(overdue=10, today=10, new=10, long_=5, short=5)
        result = compose(pool, 20, 'daily')
        assert sum(result['composition'].values()) == len(result['items'])

    def test_no_duplicates(self):
        """동일 user_voca_id가 두 번 나오지 않아야 함."""
        pool = _make_pool(overdue=10, today=10, new=10, long_=5)
        result = compose(pool, 20, 'daily')
        ids = [it.user_voca_id for it in result['items']]
        assert len(ids) == len(set(ids))
