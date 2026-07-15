"""
core.py — 표준 FSRS-4.5 수식 정합성 회귀 테스트.

B1·B2·B3 수정으로 다음 정본 불변식이 보장되어야 한다:
  - 정답 stability는 S·(1 + SInc) 형태 (B2: 1+ 포함)
  - 같은 상태에서 Hard < Good < Easy 순으로 다음 간격이 길어짐 (B1: w[15]/w[16])
  - lapse 후 stability는 (1-R) 지수항을 사용 → 밀린(낮은 R) 카드 오답이 덜 깎임 (B3)
"""

from datetime import datetime, timedelta

from app.services.fsrs.core import (
    fsrs_review as _fsrs_review,
    _init_stability,
    _stability_after_recall,
    _stability_after_lapse,
    DEFAULT_PARAMS,
    AGAIN, HARD, GOOD, EASY,
)

W = DEFAULT_PARAMS
BASE_TIME = datetime(2026, 6, 24, 12, 0, 0)


def _review_state(stability=10.0, difficulty=5.0, elapsed_days=10.0):
    """경과 일수를 직접 지정한 review 상태 dict."""
    last = BASE_TIME - timedelta(days=elapsed_days)
    return {
        "state": "review",
        "difficulty": difficulty,
        "stability": stability,
        "retrievability": 0.9,
        "elapsed_days": elapsed_days,
        "scheduled_days": max(1, int(stability)),
        "reps": 5,
        "lapses": 0,
        "last_review": last.isoformat(),
        "next_review": BASE_TIME.isoformat(),
        "params_version": "default-v1",
    }


class TestRatingDirection:
    """B1: 같은 상태에서 Hard < Good < Easy 간격."""

    def test_scheduled_days_hard_lt_good_lt_easy(self):
        state = _review_state(stability=10.0, difficulty=5.0, elapsed_days=10.0)
        hard = _fsrs_review(dict(state), HARD, BASE_TIME)
        good = _fsrs_review(dict(state), GOOD, BASE_TIME)
        easy = _fsrs_review(dict(state), EASY, BASE_TIME)
        assert hard["scheduled_days"] < good["scheduled_days"], (
            f"Hard({hard['scheduled_days']}) >= Good({good['scheduled_days']})"
        )
        assert good["scheduled_days"] < easy["scheduled_days"], (
            f"Good({good['scheduled_days']}) >= Easy({easy['scheduled_days']})"
        )

    def test_stability_hard_lt_good_lt_easy(self):
        state = _review_state(stability=10.0, difficulty=5.0, elapsed_days=10.0)
        hard = _fsrs_review(dict(state), HARD, BASE_TIME)["stability"]
        good = _fsrs_review(dict(state), GOOD, BASE_TIME)["stability"]
        easy = _fsrs_review(dict(state), EASY, BASE_TIME)["stability"]
        assert hard < good < easy

    def test_init_stability_ordering(self):
        """첫 학습 초기 stability도 Again < Hard < Good < Easy."""
        s = [_init_stability(W, r) for r in (AGAIN, HARD, GOOD, EASY)]
        assert s[0] < s[1] < s[2] < s[3]


class TestRecallFormula:
    """B2: 정답 stability = S·(1 + SInc) → 성공 복습은 stability를 키운다."""

    def test_recall_increases_stability(self):
        s_before = 10.0
        s_after = _stability_after_recall(W, d=5.0, s=s_before, r=0.9, rating=GOOD)
        assert s_after > s_before

    def test_recall_multiplier_includes_one_plus(self):
        """SInc 항이 작아도(높은 R) stability가 s 아래로 떨어지지 않는다."""
        # r=0.99 → SInc 매우 작음. 1+ 가 없으면 s*작은값 < s 가 되어 하한에 걸림.
        s_before = 30.0
        s_after = _stability_after_recall(W, d=5.0, s=s_before, r=0.99, rating=GOOD)
        assert s_after >= s_before  # 단조 증가


class TestLapseFormula:
    """B3: lapse 후 stability는 exp(w[14]·(1-R)) 사용."""

    def test_overdue_lapse_retains_more_than_ontime_lapse(self):
        """밀린(낮은 R) 카드를 틀린 게, 제때(높은 R) 틀린 것보다 stability를 덜 깎는다."""
        s_ontime = _stability_after_lapse(W, d=5.0, s=20.0, r=0.9)   # 제때
        s_overdue = _stability_after_lapse(W, d=5.0, s=20.0, r=0.4)  # 밀림
        assert s_overdue > s_ontime, (
            f"overdue lapse({s_overdue}) <= ontime lapse({s_ontime})"
        )

    def test_lapse_stability_floor(self):
        assert _stability_after_lapse(W, d=9.0, s=0.5, r=0.1) >= 0.1


class TestFirstReviewStateTransition:
    """첫 복습 등급별 상태 전이."""

    def test_new_again_stays_new(self):
        """미학습(new) 단어를 최초 학습 중 오답 → 미학습 상태를 그대로 유지한다.

        (구 동작: learning으로 승격 + stability=0.4072 → UI에서 "단기암기"로
         잘못 분류되는 버그가 있었음. 이제는 아무 일도 없었던 것처럼 되돌린다.)
        """
        r = _fsrs_review({"state": "new", "stability": 0, "difficulty": 0}, AGAIN, BASE_TIME)
        assert r["state"] == "new"
        assert r["stability"] == 0.0
        assert r["difficulty"] == 0.0
        assert r["reps"] == 0
        assert r["lapses"] == 0
        assert r["last_review"] is None
        assert r["next_review"] is None

    def test_new_good_goes_review(self):
        r = _fsrs_review({"state": "new", "stability": 0, "difficulty": 0}, GOOD, BASE_TIME)
        assert r["state"] == "review"
