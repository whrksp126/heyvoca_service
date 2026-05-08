"""
Phase 2.1 — UserQuestionTypeStat 관련 순수 로직 단위 테스트.

DB 의존성 없이 EWMA 계산, 정렬, 임계값 필터 등 순수 함수 로직을 검증한다.
"""

import pytest


# ──────────────────────────────────────────────
# EWMA 계산 헬퍼 (study.py에 인라인된 로직과 동일)
# ──────────────────────────────────────────────

def ewma_update(old_avg: int, new_value: int) -> int:
    """EWMA: new_avg = round(0.9 * old + 0.1 * new)"""
    return round(0.9 * old_avg + 0.1 * new_value)


# ──────────────────────────────────────────────
# stat 딕셔너리를 직접 다루는 순수 함수 (핸들러 로직 추출)
# ──────────────────────────────────────────────

def apply_log_to_stat(stat: dict, was_correct: bool, time_taken_ms: int) -> dict:
    """
    POST /study/log 핸들러의 UPSERT 로직을 순수 함수로 추출.
    stat=None이면 신규 생성 케이스.
    """
    if stat is None:
        return {
            'total_count':      1,
            'correct_count':    1 if was_correct else 0,
            'avg_time_taken_ms': time_taken_ms,
            'last_30d_correct_rate': None,
        }
    else:
        new_total   = stat['total_count'] + 1
        new_correct = stat['correct_count'] + (1 if was_correct else 0)
        new_avg     = ewma_update(stat['avg_time_taken_ms'], time_taken_ms)
        return {
            'total_count':      new_total,
            'correct_count':    new_correct,
            'avg_time_taken_ms': new_avg,
            'last_30d_correct_rate': stat.get('last_30d_correct_rate'),
        }


def compute_weakness(stats: list, min_samples: int = 10, limit: int = 5) -> list:
    """
    GET /study/me/weakness 핸들러의 weakness 계산 로직을 순수 함수로 추출.
    stats: [{'question_type':..., 'total_count':..., 'correct_count':...}, ...]
    """
    candidates = []
    for s in stats:
        if s['total_count'] < min_samples:
            continue
        rate = s['correct_count'] / s['total_count'] if s['total_count'] > 0 else 0.0
        candidates.append({
            'question_type': s['question_type'],
            'correct_rate':  round(rate, 4),
            'samples':       s['total_count'],
        })
    candidates.sort(key=lambda x: x['correct_rate'])
    return candidates[:limit]


# ──────────────────────────────────────────────
# EWMA 계산 테스트
# ──────────────────────────────────────────────

class TestEwmaUpdate:
    def test_zero_old_returns_10_percent_of_new(self):
        """old=0일 때 결과는 new의 10%."""
        assert ewma_update(0, 10000) == round(0.9 * 0 + 0.1 * 10000)

    def test_same_value_stays_same(self):
        """old == new 이면 결과도 동일."""
        assert ewma_update(5000, 5000) == 5000

    def test_ewma_weighted_correctly(self):
        """old=10000, new=0 → round(9000) = 9000."""
        assert ewma_update(10000, 0) == 9000

    def test_ewma_converges(self):
        """동일한 값을 반복 입력하면 해당 값 근처로 수렴.
        정수 반올림으로 최대 10ms 오차 허용."""
        val = 6000
        avg = 0
        for _ in range(100):
            avg = ewma_update(avg, val)
        assert abs(avg - val) <= 10

    def test_formula_exact(self):
        """공식 0.9*old + 0.1*new 를 직접 검증."""
        old, new = 8000, 3000
        expected = round(0.9 * 8000 + 0.1 * 3000)
        assert ewma_update(old, new) == expected

    @pytest.mark.parametrize("old,new,expected", [
        (0,     10000, 1000),
        (10000, 0,     9000),
        (5000,  5000,  5000),
        (1000,  9000,  1800),
    ])
    def test_ewma_parametrized(self, old, new, expected):
        assert ewma_update(old, new) == expected


# ──────────────────────────────────────────────
# 신규 row 생성 케이스
# ──────────────────────────────────────────────

class TestNewStatCreation:
    def test_correct_answer_creates_correct_stat(self):
        result = apply_log_to_stat(None, was_correct=True, time_taken_ms=5000)
        assert result['total_count']       == 1
        assert result['correct_count']     == 1
        assert result['avg_time_taken_ms'] == 5000
        assert result['last_30d_correct_rate'] is None

    def test_wrong_answer_creates_zero_correct(self):
        result = apply_log_to_stat(None, was_correct=False, time_taken_ms=3000)
        assert result['total_count']       == 1
        assert result['correct_count']     == 0
        assert result['avg_time_taken_ms'] == 3000

    def test_new_stat_last_30d_is_none(self):
        result = apply_log_to_stat(None, was_correct=True, time_taken_ms=1000)
        assert result['last_30d_correct_rate'] is None


# ──────────────────────────────────────────────
# 기존 row 업데이트 케이스
# ──────────────────────────────────────────────

class TestExistingStatUpdate:
    def _make_stat(self, total=10, correct=7, avg_ms=5000, last_30d=None):
        return {
            'total_count':           total,
            'correct_count':         correct,
            'avg_time_taken_ms':     avg_ms,
            'last_30d_correct_rate': last_30d,
        }

    def test_correct_answer_increments_both_counts(self):
        stat   = self._make_stat(total=10, correct=7)
        result = apply_log_to_stat(stat, was_correct=True, time_taken_ms=5000)
        assert result['total_count']   == 11
        assert result['correct_count'] == 8

    def test_wrong_answer_increments_only_total(self):
        stat   = self._make_stat(total=10, correct=7)
        result = apply_log_to_stat(stat, was_correct=False, time_taken_ms=5000)
        assert result['total_count']   == 11
        assert result['correct_count'] == 7

    def test_avg_time_ewma_applied(self):
        stat   = self._make_stat(avg_ms=8000)
        result = apply_log_to_stat(stat, was_correct=True, time_taken_ms=3000)
        expected = ewma_update(8000, 3000)
        assert result['avg_time_taken_ms'] == expected

    def test_last_30d_preserved_on_update(self):
        stat   = self._make_stat(last_30d=0.75)
        result = apply_log_to_stat(stat, was_correct=True, time_taken_ms=5000)
        assert result['last_30d_correct_rate'] == 0.75

    def test_multiple_updates_accumulate(self):
        stat = self._make_stat(total=0, correct=0, avg_ms=0)
        for i in range(5):
            stat = apply_log_to_stat(stat, was_correct=(i % 2 == 0), time_taken_ms=4000)
        assert stat['total_count']   == 5
        assert stat['correct_count'] == 3  # i=0,2,4 → 정답


# ──────────────────────────────────────────────
# weakness 정렬 및 임계값 필터 테스트
# ──────────────────────────────────────────────

class TestComputeWeakness:
    def _make_stats(self):
        return [
            {'question_type': 'multipleChoice',          'total_count': 200, 'correct_count': 162},  # 0.81
            {'question_type': 'multipleChoiceListening', 'total_count':  87, 'correct_count':  37},  # 0.4253
            {'question_type': 'fillInTheBlank',          'total_count': 120, 'correct_count':  66},  # 0.55
            {'question_type': 'cardMatch',               'total_count':   5, 'correct_count':   2},  # 샘플 부족
            {'question_type': 'cardMatchListening',      'total_count':  50, 'correct_count':  45},  # 0.90
        ]

    def test_weakness_sorted_ascending_by_correct_rate(self):
        """약점 목록은 정답률 오름차순."""
        result = compute_weakness(self._make_stats(), min_samples=10, limit=5)
        rates = [r['correct_rate'] for r in result]
        assert rates == sorted(rates)

    def test_below_min_samples_excluded(self):
        """샘플 수 < min_samples인 유형은 제외."""
        result = compute_weakness(self._make_stats(), min_samples=10, limit=5)
        qtypes = [r['question_type'] for r in result]
        assert 'cardMatch' not in qtypes

    def test_limit_applied(self):
        """limit보다 많은 결과는 잘림."""
        result = compute_weakness(self._make_stats(), min_samples=10, limit=2)
        assert len(result) == 2

    def test_weakest_first(self):
        """가장 약한(정답률 낮은) 유형이 첫 번째."""
        result = compute_weakness(self._make_stats(), min_samples=10, limit=5)
        assert result[0]['question_type'] == 'multipleChoiceListening'

    def test_empty_stats_returns_empty(self):
        assert compute_weakness([], min_samples=10, limit=5) == []

    def test_all_below_min_samples_returns_empty(self):
        stats = [
            {'question_type': 'multipleChoice', 'total_count': 3, 'correct_count': 2},
        ]
        result = compute_weakness(stats, min_samples=10, limit=5)
        assert result == []

    def test_correct_rate_calculation(self):
        """정답률이 correct_count/total_count로 정확히 계산됨."""
        stats = [
            {'question_type': 'fillInTheBlank', 'total_count': 100, 'correct_count': 55},
        ]
        result = compute_weakness(stats, min_samples=10, limit=5)
        assert len(result) == 1
        assert result[0]['correct_rate'] == pytest.approx(0.55, abs=1e-4)

    def test_samples_field_matches_total_count(self):
        stats = [
            {'question_type': 'multipleChoice', 'total_count': 50, 'correct_count': 30},
        ]
        result = compute_weakness(stats, min_samples=10, limit=5)
        assert result[0]['samples'] == 50
