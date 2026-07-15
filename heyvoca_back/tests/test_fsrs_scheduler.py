"""
scheduler.py — review 5회 연속, lapse, 단조 증가 테스트.
"""

import pytest
from datetime import datetime, timedelta

from app.services.fsrs.scheduler import review, schedule_initial
from app.services.fsrs.state import DEFAULT_FSRS_NEW
from app.services.fsrs.core import AGAIN, HARD, GOOD, EASY


BASE_TIME = datetime(2026, 5, 7, 12, 0, 0)


def _simulate_reviews(ratings, interval_days=1):
    """
    주어진 rating 리스트로 연속 복습 시뮬레이션.
    각 복습은 interval_days 간격으로 진행.
    Returns: 각 복습 후 state dict 리스트.
    """
    state = dict(DEFAULT_FSRS_NEW)
    states = []
    now = BASE_TIME
    for r in ratings:
        state = review(state, r, now)
        states.append(dict(state))
        now += timedelta(days=interval_days)
    return states


class TestReviewBasic:
    def test_initial_new_state(self):
        """new 상태에서 첫 리뷰 후 stability > 0."""
        state = dict(DEFAULT_FSRS_NEW)
        result = review(state, GOOD, BASE_TIME)
        assert result["stability"] > 0
        assert result["reps"] == 1
        assert result["state"] != "new"

    def test_invalid_rating_raises(self):
        """1~4 외 rating은 ValueError 발생."""
        state = dict(DEFAULT_FSRS_NEW)
        with pytest.raises(ValueError):
            review(state, 0, BASE_TIME)
        with pytest.raises(ValueError):
            review(state, 5, BASE_TIME)

    def test_none_state_handled(self):
        """state가 None이어도 정상 처리."""
        result = review(None, GOOD, BASE_TIME)
        assert result["stability"] > 0

    def test_empty_state_handled(self):
        """state가 빈 dict여도 정상 처리."""
        result = review({}, GOOD, BASE_TIME)
        assert result["stability"] > 0


class TestStabilityMonotonicallyIncreasing:
    def test_5_correct_reviews_stability_increases(self):
        """정답 5회 연속 → stability 단조 증가."""
        states = _simulate_reviews([GOOD, GOOD, GOOD, GOOD, GOOD], interval_days=1)
        stabilities = [s["stability"] for s in states]
        for i in range(1, len(stabilities)):
            assert stabilities[i] > stabilities[i - 1], (
                f"stability가 감소함: {stabilities[i-1]} → {stabilities[i]} (step {i})"
            )

    def test_easy_reviews_faster_stability_increase(self):
        """EASY 리뷰는 GOOD보다 더 빠른 stability 증가."""
        states_good = _simulate_reviews([GOOD] * 5, interval_days=1)
        states_easy = _simulate_reviews([EASY] * 5, interval_days=1)
        # 5회 후 EASY가 GOOD보다 stability 높아야 함
        assert states_easy[-1]["stability"] > states_good[-1]["stability"]

    def test_again_lowest_scheduled_days(self):
        """오답(AGAIN)은 정답(GOOD/EASY) 대비 훨씬 짧은 scheduled_days를 가져야 함.

        FSRS-5에서 lapse 후 scheduled_days는 항상 매우 짧아야 한다.
        (stability 감소로 인해 next_interval이 작아짐)
        """
        state_base = dict(DEFAULT_FSRS_NEW)
        now = BASE_TIME
        # 기반 state 생성 (GOOD 5회)
        for _ in range(5):
            state_base = review(state_base, GOOD, now)
            now += timedelta(days=1)

        # 오답 vs 정답 비교
        state_after_again = review(dict(state_base), AGAIN, now)
        state_after_good  = review(dict(state_base), GOOD, now)

        assert state_after_again["scheduled_days"] < state_after_good["scheduled_days"], (
            f"AGAIN scheduled_days({state_after_again['scheduled_days']}) >= "
            f"GOOD scheduled_days({state_after_good['scheduled_days']})"
        )

    def test_reps_increase_per_review(self):
        """reps 카운터는 매 리뷰마다 +1."""
        states = _simulate_reviews([GOOD, GOOD, GOOD, GOOD, GOOD], interval_days=1)
        for i, s in enumerate(states):
            assert s["reps"] == i + 1


class TestLapseHandling:
    def test_lapse_reduces_stability(self):
        """오답(AGAIN) 시 stability 감소."""
        # 먼저 몇 번 정답으로 stability 쌓기
        state = dict(DEFAULT_FSRS_NEW)
        now = BASE_TIME
        for _ in range(5):
            state = review(state, GOOD, now)
            now += timedelta(days=1)

        stability_before_lapse = state["stability"]
        state_after_lapse = review(state, AGAIN, now)

        assert state_after_lapse["stability"] < stability_before_lapse

    def test_lapse_increments_lapses_counter(self):
        """오답 시 lapses 카운터 +1."""
        state = dict(DEFAULT_FSRS_NEW)
        now = BASE_TIME
        # 초기화
        state = review(state, GOOD, now)
        now += timedelta(days=1)

        assert state["lapses"] == 0
        state_after_lapse = review(state, AGAIN, now)
        assert state_after_lapse["lapses"] == 1

    def test_consecutive_lapses(self):
        """연속 오답 시 lapses 계속 증가."""
        state = dict(DEFAULT_FSRS_NEW)
        now = BASE_TIME
        state = review(state, GOOD, now)
        now += timedelta(days=1)

        for expected_lapses in range(1, 4):
            state = review(state, AGAIN, now)
            now += timedelta(days=1)
            assert state["lapses"] == expected_lapses

    def test_recovery_after_lapse(self):
        """lapse 후 정답으로 stability 회복 (증가)."""
        state = dict(DEFAULT_FSRS_NEW)
        now = BASE_TIME
        # stability 축적
        for _ in range(5):
            state = review(state, GOOD, now)
            now += timedelta(days=1)

        # lapse
        state = review(state, AGAIN, now)
        stability_after_lapse = state["stability"]
        now += timedelta(days=1)

        # 정답으로 회복
        state = review(state, GOOD, now)
        assert state["stability"] > stability_after_lapse


class TestScheduleInitial:
    def test_initial_schedule_returns_valid_state(self):
        """schedule_initial은 유효한 state dict를 반환."""
        result = schedule_initial(BASE_TIME)
        assert result["stability"] > 0
        assert result["reps"] == 1
        assert result["next_review"] is not None


class TestNextReviewDate:
    def test_next_review_is_in_future(self):
        """next_review는 복습 시각 이후여야 함."""
        state = dict(DEFAULT_FSRS_NEW)
        result = review(state, GOOD, BASE_TIME)
        from datetime import datetime as _dt
        nr = _dt.fromisoformat(result["next_review"])
        assert nr > BASE_TIME

    def test_scheduled_days_positive(self):
        """정답(Hard/Good/Easy)의 scheduled_days는 항상 양수."""
        for rating in (HARD, GOOD, EASY):
            state = dict(DEFAULT_FSRS_NEW)
            result = review(state, rating, BASE_TIME)
            assert result["scheduled_days"] >= 1

    def test_new_again_scheduled_days_zero(self):
        """미학습 단어를 최초 학습 중 오답 → scheduled_days=0 (미학습 유지, 스케줄 없음)."""
        state = dict(DEFAULT_FSRS_NEW)
        result = review(state, AGAIN, BASE_TIME)
        assert result["scheduled_days"] == 0
        assert result["next_review"] is None
