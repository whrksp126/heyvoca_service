"""
tests/test_composer_dynamic_ratio.py — 7일 정답률 기반 동적 비율 변화 검증.

- 정답률 >= 0.90: new +10%, overdue -5%, today -5%
- 정답률 <= 0.60: new -10%, overdue +5%, today +5%
- 그 외 or total < 20: 기본 COMPOSITION_DAILY

DB 의존성 없음.
"""

import pytest

from app.services.recommend.composer import (
    compose,
    _compute_dynamic_ratio,
    COMPOSITION_DAILY,
    _DYNAMIC_HIGH_THRESHOLD,
    _DYNAMIC_LOW_THRESHOLD,
    _DYNAMIC_MIN_TOTAL,
)
from app.services.recommend.pool import CandidateItem


def _make_item(uid: int, bucket: str, stability: float = 30.0) -> CandidateItem:
    fsrs = {
        "state": "new" if bucket == "new" else "review",
        "stability": stability,
        "retrievability": 0.7,
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


def _make_big_pool():
    """overdue=40, today=30, new=40, long=10 — 비율 테스트용."""
    pool = []
    uid = 1
    for _ in range(40):
        pool.append(_make_item(uid, "overdue"))
        uid += 1
    for _ in range(30):
        pool.append(_make_item(uid, "today"))
        uid += 1
    for _ in range(40):
        pool.append(_make_item(uid, "new", stability=0.0))
        uid += 1
    for _ in range(10):
        pool.append(_make_item(uid, "long", stability=90.0))
        uid += 1
    return pool


class TestComputeDynamicRatio:
    def test_default_when_no_stats(self):
        """user_stats 없으면 기본 비율."""
        ratio, label = _compute_dynamic_ratio(None)
        assert ratio == COMPOSITION_DAILY
        assert label == 'default'

    def test_default_when_total_insufficient(self):
        """total < 20이면 기본 비율."""
        stats = {"recent_7d_correct_rate": 0.95, "recent_7d_total": 10}
        ratio, label = _compute_dynamic_ratio(stats)
        assert ratio == COMPOSITION_DAILY
        assert label == 'default'

    def test_default_when_rate_none(self):
        """rate None이면 기본 비율."""
        stats = {"recent_7d_correct_rate": None, "recent_7d_total": 50}
        ratio, label = _compute_dynamic_ratio(stats)
        assert ratio == COMPOSITION_DAILY
        assert label == 'default'

    def test_high_accuracy_increases_new(self):
        """정답률 >= 0.90 → new +0.10."""
        stats = {"recent_7d_correct_rate": 0.95, "recent_7d_total": 100}
        ratio, label = _compute_dynamic_ratio(stats)
        assert label == 'high_accuracy'
        assert abs(ratio['new'] - (COMPOSITION_DAILY['new'] + 0.10)) < 1e-9
        assert abs(ratio['overdue'] - (COMPOSITION_DAILY['overdue'] - 0.05)) < 1e-9
        assert abs(ratio['today'] - (COMPOSITION_DAILY['today'] - 0.05)) < 1e-9

    def test_low_accuracy_increases_review(self):
        """정답률 <= 0.60 → overdue +0.05, today +0.05, new -0.10."""
        stats = {"recent_7d_correct_rate": 0.50, "recent_7d_total": 100}
        ratio, label = _compute_dynamic_ratio(stats)
        assert label == 'low_accuracy'
        assert abs(ratio['new'] - (COMPOSITION_DAILY['new'] - 0.10)) < 1e-9
        assert abs(ratio['overdue'] - (COMPOSITION_DAILY['overdue'] + 0.05)) < 1e-9
        assert abs(ratio['today'] - (COMPOSITION_DAILY['today'] + 0.05)) < 1e-9

    def test_boundary_high(self):
        """경계값 0.90 → high_accuracy."""
        stats = {"recent_7d_correct_rate": 0.90, "recent_7d_total": 50}
        _, label = _compute_dynamic_ratio(stats)
        assert label == 'high_accuracy'

    def test_boundary_low(self):
        """경계값 0.60 → low_accuracy."""
        stats = {"recent_7d_correct_rate": 0.60, "recent_7d_total": 50}
        _, label = _compute_dynamic_ratio(stats)
        assert label == 'low_accuracy'

    def test_middle_range_is_default(self):
        """0.61~0.89 → default."""
        stats = {"recent_7d_correct_rate": 0.75, "recent_7d_total": 50}
        _, label = _compute_dynamic_ratio(stats)
        assert label == 'default'

    def test_ratio_values_bounded(self):
        """비율이 0~1 범위를 벗어나지 않음."""
        for rate in [0.0, 0.30, 0.60, 0.75, 0.90, 1.0]:
            stats = {"recent_7d_correct_rate": rate, "recent_7d_total": 100}
            ratio, _ = _compute_dynamic_ratio(stats)
            for v in ratio.values():
                assert 0.0 <= v <= 1.0, f"rate={rate}, ratio={ratio}"


class TestComposeWithDynamicRatio:
    def test_high_accuracy_more_new_words(self):
        """
        high accuracy 시 new 비율 증가로 count=20 기준 new 단어가 기본보다 많거나 같음.
        """
        pool = _make_big_pool()
        base_result = compose(pool, 20, 'daily', user_stats=None)
        high_result = compose(pool, 20, 'daily', user_stats={
            "recent_7d_correct_rate": 0.95,
            "recent_7d_total": 100,
            "weakness_types": [],
            "today_seen": {},
        })

        base_new = base_result['composition'].get('new', 0)
        high_new = high_result['composition'].get('new', 0)
        # high accuracy에서 new가 같거나 더 많아야 함
        assert high_new >= base_new

        strategy = high_result['composition_strategy']
        assert strategy['dynamic_adjustment'] == 'high_accuracy'

    def test_low_accuracy_more_overdue(self):
        """
        low accuracy 시 overdue 비율 증가로 overdue 단어가 기본보다 많거나 같음.
        """
        pool = _make_big_pool()
        base_result = compose(pool, 20, 'daily', user_stats=None)
        low_result = compose(pool, 20, 'daily', user_stats={
            "recent_7d_correct_rate": 0.50,
            "recent_7d_total": 100,
            "weakness_types": [],
            "today_seen": {},
        })

        base_overdue = base_result['composition'].get('overdue', 0)
        low_overdue = low_result['composition'].get('overdue', 0)
        assert low_overdue >= base_overdue

        strategy = low_result['composition_strategy']
        assert strategy['dynamic_adjustment'] == 'low_accuracy'

    def test_default_no_change(self):
        """중간 정답률 → default 레이블, 기본 비율과 동일한 동작."""
        pool = _make_big_pool()
        result = compose(pool, 20, 'daily', user_stats={
            "recent_7d_correct_rate": 0.75,
            "recent_7d_total": 100,
            "weakness_types": [],
            "today_seen": {},
        })
        assert result['composition_strategy']['dynamic_adjustment'] == 'default'

    def test_test_type_ignores_dynamic_ratio(self):
        """test 타입은 동적 비율을 적용하지 않음 → 항상 default."""
        pool = _make_big_pool()
        result = compose(pool, 20, 'test', user_stats={
            "recent_7d_correct_rate": 0.95,
            "recent_7d_total": 100,
            "weakness_types": [],
            "today_seen": {},
        })
        assert result['composition_strategy']['dynamic_adjustment'] == 'default'

    def test_enriched_items_present_with_dynamic(self):
        """동적 비율 적용 후에도 enriched_items 정상 반환."""
        pool = _make_big_pool()
        result = compose(pool, 20, 'daily', user_stats={
            "recent_7d_correct_rate": 0.95,
            "recent_7d_total": 100,
            "weakness_types": [],
            "today_seen": {},
        })
        assert 'enriched_items' in result
        assert len(result['enriched_items']) == len(result['items'])
