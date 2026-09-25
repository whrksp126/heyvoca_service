"""
scheduler.py — Phase 2.3 부드러운 lapse (FSRS_SOFT_LAPSE) 단위 테스트.

소프트 lapse 로직 (rate = "남기는 하한 비율"):
  - stability_before > 0 이고 rating == AGAIN 이고 FSRS_SOFT_LAPSE=true 일 때만 적용
  - 첫 lapse (lapse_history 없음 또는 직전이 lapse 아님): soft_stab = stability * 0.3
  - 연속 lapse (lapse_history[0] == True):               soft_stab = stability * 0.1
  - prior_correct_rate >= 0.8:                           하한율 * 2.0 (최대 1.0), 즉 덜 깎음
    (정답률이 높았던 단어가 오답 한 번에 일반보다 더 크게 깎이면 안 된다는 불변식)
  - 최종 stability = max(soft_stab, fsrs_표준_stability)
  - FSRS_SOFT_LAPSE=false → 표준 FSRS 그대로 (소프트 보정 없음)
"""

import os
import pytest
from datetime import datetime, timedelta

from app.services.fsrs.scheduler import review, _apply_soft_lapse
from app.services.fsrs.state import DEFAULT_FSRS_NEW
from app.services.fsrs.core import AGAIN, GOOD, EASY, DEFAULT_PARAMS, fsrs_review as _fsrs_review

BASE_TIME = datetime(2026, 5, 7, 12, 0, 0)


def _build_state_with_stability(stability: float) -> dict:
    """주어진 stability를 가진 review 상태 dict 생성 (테스트용)."""
    return {
        "state":          "review",
        "difficulty":     5.0,
        "stability":      stability,
        "retrievability": 0.9,
        "elapsed_days":   1,
        "scheduled_days": max(1, int(stability)),
        "reps":           5,
        "lapses":         0,
        "last_review":    (BASE_TIME - timedelta(days=1)).isoformat(),
        "next_review":    BASE_TIME.isoformat(),
        "params_version": 1,
    }


def _get_fsrs_standard_stability(stability_before: float) -> float:
    """표준 FSRS lapse 결과의 stability 반환."""
    state = _build_state_with_stability(stability_before)
    result = _fsrs_review(state, AGAIN, BASE_TIME, None)
    return float(result.get("stability") or 0.1)


class TestSoftLapseEnabled:
    """FSRS_SOFT_LAPSE=true (기본) 환경에서 소프트 lapse 동작 검증."""

    def test_first_lapse_reduces_stability_by_30_percent_at_least(self, monkeypatch):
        """
        첫 lapse (lapse_history=None):
          soft_stab = stability * 0.3 = 10 * 0.3 = 3.0
          final = max(3.0, fsrs_표준) ≥ 3.0
        """
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result = review(state, AGAIN, BASE_TIME, lapse_history=None, prior_correct_rate=None)

        soft_stab = stability * 0.3  # 3.0
        fsrs_std   = _get_fsrs_standard_stability(stability)
        expected_final = max(soft_stab, fsrs_std)

        assert abs(result["stability"] - expected_final) < 0.01, (
            f"stability={result['stability']}, expected={expected_final:.4f} "
            f"(soft={soft_stab}, fsrs_std={fsrs_std:.4f})"
        )
        # 기존 stability보다 확실히 감소
        assert result["stability"] < stability

    def test_first_lapse_with_empty_history(self, monkeypatch):
        """빈 lapse_history → 첫 lapse와 동일하게 처리."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result_none  = review(state, AGAIN, BASE_TIME, lapse_history=None)
        result_empty = review(state, AGAIN, BASE_TIME, lapse_history=[])

        assert result_none["stability"] == result_empty["stability"]

    def test_first_lapse_with_prev_correct(self, monkeypatch):
        """직전이 정답(lapse_history=[False]) → 첫 lapse (0.3 감소율)."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result = review(state, AGAIN, BASE_TIME, lapse_history=[False])

        soft_stab     = stability * 0.3  # 3.0
        fsrs_std      = _get_fsrs_standard_stability(stability)
        expected_final = max(soft_stab, fsrs_std)

        assert abs(result["stability"] - expected_final) < 0.01

    def test_consecutive_lapse_reduces_stability_by_10_percent(self, monkeypatch):
        """
        연속 lapse (lapse_history=[True]):
          soft_stab = stability * 0.1 = 10 * 0.1 = 1.0
          final = max(1.0, fsrs_표준)
        """
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result = review(state, AGAIN, BASE_TIME, lapse_history=[True], prior_correct_rate=None)

        soft_stab      = stability * 0.1  # 1.0
        fsrs_std       = _get_fsrs_standard_stability(stability)
        expected_final = max(soft_stab, fsrs_std)

        assert abs(result["stability"] - expected_final) < 0.01
        # 연속 lapse는 첫 lapse보다 더 크게 감소해야 함
        result_first = review(state, AGAIN, BASE_TIME, lapse_history=[False])
        assert result["stability"] <= result_first["stability"]

    def test_high_correct_rate_bonus_applied(self, monkeypatch):
        """
        prior_correct_rate=0.85 (>= 0.8), 첫 lapse:
          rate = 0.3 * 2.0 = 0.6
          soft_stab = 10 * 0.6 = 6.0
          final = max(6.0, fsrs_표준)
        → 정답률이 높았던 단어는 bonus 없을 때(soft_stab=3.0)보다 덜 깎여야 한다.
        """
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result_no_bonus = review(
            state, AGAIN, BASE_TIME,
            lapse_history=[False], prior_correct_rate=None
        )
        result_bonus = review(
            state, AGAIN, BASE_TIME,
            lapse_history=[False], prior_correct_rate=0.85
        )

        # bonus 적용 시 soft_stab이 6.0 (no_bonus=3.0보다 큼 → 덜 깎임)
        fsrs_std = _get_fsrs_standard_stability(stability)

        soft_no_bonus = stability * 0.3        # 3.0
        soft_bonus    = stability * 0.3 * 2.0  # 6.0

        expected_no_bonus = max(soft_no_bonus, fsrs_std)
        expected_bonus    = max(soft_bonus,    fsrs_std)

        assert abs(result_no_bonus["stability"] - expected_no_bonus) < 0.01
        assert abs(result_bonus["stability"]    - expected_bonus)    < 0.01
        # 정답률이 높았던 쪽이 일반보다 크거나 같아야 한다 (핵심 불변식).
        assert result_bonus["stability"] >= result_no_bonus["stability"]

    def test_high_correct_rate_bonus_consecutive_lapse(self, monkeypatch):
        """
        prior_correct_rate=0.9, 연속 lapse:
          rate = 0.1 * 2.0 = 0.2
          soft_stab = 10 * 0.2 = 2.0
          final = max(2.0, fsrs_표준)
        """
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result = review(
            state, AGAIN, BASE_TIME,
            lapse_history=[True], prior_correct_rate=0.9
        )

        fsrs_std   = _get_fsrs_standard_stability(stability)
        soft_stab  = max(stability * 0.1 * 2.0, 0.1)  # max(2.0, 0.1)=2.0
        expected   = max(soft_stab, fsrs_std)

        assert abs(result["stability"] - expected) < 0.01

    def test_correct_rate_below_threshold_no_bonus(self, monkeypatch):
        """prior_correct_rate=0.75 (< 0.8) → bonus 미적용."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result_below = review(
            state, AGAIN, BASE_TIME,
            lapse_history=[False], prior_correct_rate=0.75
        )
        result_none  = review(
            state, AGAIN, BASE_TIME,
            lapse_history=[False], prior_correct_rate=None
        )

        # bonus 없으므로 두 결과가 동일해야 함
        assert result_below["stability"] == result_none["stability"]

    def test_correct_rate_exactly_threshold(self, monkeypatch):
        """prior_correct_rate=0.8 (정확히 임계값) → bonus 적용."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result_at    = review(state, AGAIN, BASE_TIME, lapse_history=[False], prior_correct_rate=0.8)
        result_below = review(state, AGAIN, BASE_TIME, lapse_history=[False], prior_correct_rate=0.79)

        # 0.8은 bonus 적용, 0.79는 미적용 → soft_stab 차이
        # 단, fsrs_표준이 dominant이면 둘 다 fsrs_표준으로 같을 수 있음
        fsrs_std = _get_fsrs_standard_stability(stability)
        soft_at    = max(stability * 0.3 * 2.0, 0.1)  # 6.0
        soft_below = max(stability * 0.3, 0.1)          # 3.0
        expected_at    = max(soft_at,    fsrs_std)
        expected_below = max(soft_below, fsrs_std)

        assert abs(result_at["stability"]    - expected_at)    < 0.01
        assert abs(result_below["stability"] - expected_below) < 0.01

    def test_max_prevents_worse_than_fsrs_standard(self, monkeypatch):
        """
        max(soft, fsrs_std) 보장 — soft가 fsrs_std보다 작아도
        결과는 fsrs_std보다 작아지지 않는다.
        """
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        # stability=0.5 같은 매우 낮은 값: fsrs_std가 더 클 수 있음
        stability = 0.5
        state = _build_state_with_stability(stability)

        result   = review(state, AGAIN, BASE_TIME, lapse_history=None)
        fsrs_std = _get_fsrs_standard_stability(stability)
        soft     = max(stability * 0.3, 0.1)  # max(0.15, 0.1) = 0.15

        expected = max(soft, fsrs_std)
        assert abs(result["stability"] - expected) < 0.01

    def test_stability_not_below_minimum(self, monkeypatch):
        """stability는 최소 0.1 이상이어야 한다 (_apply_soft_lapse의 max(..., 0.1) 보장)."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        stability = 0.05
        state = _build_state_with_stability(stability)

        result = review(state, AGAIN, BASE_TIME, lapse_history=[True], prior_correct_rate=0.9)
        assert result["stability"] >= 0.1

    def test_soft_lapse_not_applied_for_non_again_rating(self, monkeypatch):
        """AGAIN 이 아닌 rating(GOOD, EASY, HARD)에는 소프트 lapse 미적용."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        from app.services.fsrs.core import HARD

        stability = 10.0
        state = _build_state_with_stability(stability)

        for rating in (HARD, GOOD, EASY):
            result = review(state, rating, BASE_TIME, lapse_history=[True], prior_correct_rate=0.9)
            # 정답 계열 → stability 감소 없음 (HARD는 살짝 다를 수 있지만 0.3 이상)
            assert result["stability"] > stability * 0.3, (
                f"rating={rating}: stability={result['stability']} — 소프트 lapse가 잘못 적용됨"
            )

    def test_soft_lapse_not_applied_when_stability_is_zero(self, monkeypatch):
        """stability=0 (new 상태)에서는 소프트 lapse 미적용 (첫 학습)."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
        state = dict(DEFAULT_FSRS_NEW)  # stability=0

        # 소프트 lapse 조건: stability_before > 0 이어야 함
        result = review(state, AGAIN, BASE_TIME)
        # 결과는 표준 FSRS와 동일 (소프트 lapse 미적용)
        fsrs_std = _fsrs_review(state, AGAIN, BASE_TIME, None)
        assert result["stability"] == fsrs_std["stability"]


class TestSoftLapseDisabled:
    """FSRS_SOFT_LAPSE=false 환경에서 표준 FSRS 동작 검증."""

    def test_env_false_uses_standard_fsrs(self, monkeypatch):
        """FSRS_SOFT_LAPSE=false → 소프트 보정 없이 표준 FSRS 결과."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'false')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result   = review(state, AGAIN, BASE_TIME, lapse_history=None, prior_correct_rate=None)
        fsrs_std = _get_fsrs_standard_stability(stability)

        assert abs(result["stability"] - fsrs_std) < 0.001, (
            f"SOFT_LAPSE=false임에도 표준 FSRS 결과와 다름: "
            f"result={result['stability']}, fsrs_std={fsrs_std}"
        )

    def test_env_false_ignores_lapse_history(self, monkeypatch):
        """FSRS_SOFT_LAPSE=false → lapse_history 무시, 표준 FSRS만."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'false')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result_none  = review(state, AGAIN, BASE_TIME, lapse_history=None)
        result_true  = review(state, AGAIN, BASE_TIME, lapse_history=[True])
        result_false = review(state, AGAIN, BASE_TIME, lapse_history=[False])

        # 모두 표준 FSRS와 동일해야 함
        fsrs_std = _get_fsrs_standard_stability(stability)
        for r in (result_none, result_true, result_false):
            assert abs(r["stability"] - fsrs_std) < 0.001

    def test_env_false_ignores_correct_rate(self, monkeypatch):
        """FSRS_SOFT_LAPSE=false → prior_correct_rate 무시."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'false')
        stability = 10.0
        state = _build_state_with_stability(stability)

        fsrs_std = _get_fsrs_standard_stability(stability)

        result_high = review(state, AGAIN, BASE_TIME, prior_correct_rate=1.0)
        result_low  = review(state, AGAIN, BASE_TIME, prior_correct_rate=0.0)

        assert abs(result_high["stability"] - fsrs_std) < 0.001
        assert abs(result_low["stability"]  - fsrs_std) < 0.001

    def test_env_false_case_insensitive(self, monkeypatch):
        """FSRS_SOFT_LAPSE=FALSE (대문자) → 표준 FSRS."""
        monkeypatch.setenv('FSRS_SOFT_LAPSE', 'FALSE')
        stability = 10.0
        state = _build_state_with_stability(stability)

        result   = review(state, AGAIN, BASE_TIME)
        fsrs_std = _get_fsrs_standard_stability(stability)
        assert abs(result["stability"] - fsrs_std) < 0.001

    def test_env_default_is_soft_lapse_on(self, monkeypatch):
        """환경변수 미설정(기본값) → 소프트 lapse ON."""
        monkeypatch.delenv('FSRS_SOFT_LAPSE', raising=False)
        stability = 10.0
        state = _build_state_with_stability(stability)

        result   = review(state, AGAIN, BASE_TIME, lapse_history=None)
        fsrs_std = _get_fsrs_standard_stability(stability)

        # 소프트 lapse ON: soft_stab=3.0, max(3.0, fsrs_std)
        soft_stab = stability * 0.3  # 3.0
        expected  = max(soft_stab, fsrs_std)
        assert abs(result["stability"] - expected) < 0.01


class TestApplySoftLapseUnit:
    """_apply_soft_lapse 내부 함수 단위 테스트."""

    def test_first_lapse_calculation(self):
        """첫 lapse: soft = stability * 0.3, final = max(soft, fsrs_stab)."""
        fsrs_result = {"stability": 0.5, "state": "relearning"}
        result = _apply_soft_lapse(
            fsrs_result,
            stability_before=10.0,
            is_consecutive_lapse=False,
            prior_correct_rate=None,
        )
        soft   = 10.0 * 0.3  # 3.0
        final  = max(soft, 0.5)  # 3.0
        assert abs(result["stability"] - final) < 0.001

    def test_consecutive_lapse_calculation(self):
        """연속 lapse: soft = stability * 0.1, final = max(soft, fsrs_stab)."""
        fsrs_result = {"stability": 0.3, "state": "relearning"}
        result = _apply_soft_lapse(
            fsrs_result,
            stability_before=10.0,
            is_consecutive_lapse=True,
            prior_correct_rate=None,
        )
        soft  = 10.0 * 0.1  # 1.0
        final = max(soft, 0.3)  # 1.0
        assert abs(result["stability"] - final) < 0.001

    def test_bonus_applied_when_correct_rate_high(self):
        """prior_correct_rate=0.85 → 하한율 * 2.0 (덜 깎음)."""
        fsrs_result = {"stability": 0.2}
        result = _apply_soft_lapse(
            fsrs_result,
            stability_before=10.0,
            is_consecutive_lapse=False,
            prior_correct_rate=0.85,
        )
        soft  = max(10.0 * 0.3 * 2.0, 0.1)  # max(6.0, 0.1)=6.0
        final = max(soft, 0.2)               # 6.0
        assert abs(result["stability"] - final) < 0.001

    def test_bonus_multiplier_clamped_to_one(self):
        """하한율 * 2.0 이 1.0을 넘으면 clamp되어 원래 stability를 넘지 않는다."""
        fsrs_result = {"stability": 0.2}
        result = _apply_soft_lapse(
            fsrs_result,
            stability_before=10.0,
            is_consecutive_lapse=False,
            prior_correct_rate=0.99,
        )
        # rate가 clamp 없이 그대로면 0.3*2.0=0.6 이라 문제 없지만, 향후 하한율이
        # 커져도(_SOFT_LAPSE_FIRST 조정 등) 1.0을 넘지 않아야 한다는 안전장치를 고정한다.
        assert result["stability"] <= 10.0

    def test_fsrs_result_other_keys_preserved(self):
        """_apply_soft_lapse는 stability만 수정, 나머지 키는 유지."""
        fsrs_result = {
            "stability": 0.5,
            "state": "relearning",
            "reps": 3,
            "lapses": 1,
            "difficulty": 7.0,
        }
        result = _apply_soft_lapse(
            fsrs_result,
            stability_before=10.0,
            is_consecutive_lapse=False,
            prior_correct_rate=None,
        )
        assert result["state"]      == "relearning"
        assert result["reps"]       == 3
        assert result["lapses"]     == 1
        assert result["difficulty"] == 7.0


@pytest.mark.parametrize("stability,is_consecutive,desc", [
    (10.0, False, "첫lapse"),
    (10.0, True,  "연속lapse"),
    (30.0, False, "30일(첫lapse)"),
    (30.0, True,  "30일(연속lapse)"),
])
def test_high_correct_rate_never_worse_than_normal(stability, is_consecutive, desc, monkeypatch):
    """핵심 불변식: 직전 정답률이 높았던 단어(>=0.8)의 소프트 lapse 결과는
    일반(정답률 정보 없음)보다 크거나 같아야 한다 — 더 깎이면 안 된다."""
    monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
    state = _build_state_with_stability(stability)
    lapse_history = [True] if is_consecutive else [False]

    result_normal = review(
        state, AGAIN, BASE_TIME,
        lapse_history=lapse_history, prior_correct_rate=None,
    )
    result_high_rate = review(
        state, AGAIN, BASE_TIME,
        lapse_history=lapse_history, prior_correct_rate=0.9,
    )

    assert result_high_rate["stability"] >= result_normal["stability"], (
        f"[{desc}] 정답률 높은 쪽이 일반보다 더 깎임: "
        f"high_rate={result_high_rate['stability']}, normal={result_normal['stability']}"
    )


@pytest.mark.parametrize("stability,lapse_history,prior_correct_rate,desc", [
    (10.0, None,    None,  "첫lapse(기본)"),
    (10.0, [],     None,   "첫lapse(빈리스트)"),
    (10.0, [False], None,  "직전정답→첫lapse"),
    (10.0, [True],  None,  "연속lapse"),
    (10.0, [False], 0.9,   "첫lapse+고정답률"),
    (10.0, [True],  0.85,  "연속lapse+고정답률"),
    (0.5,  None,    None,  "낮은stability"),
    (50.0, [True],  None,  "높은stability연속lapse"),
])
def test_soft_lapse_stability_always_positive(
    stability, lapse_history, prior_correct_rate, desc, monkeypatch
):
    """소프트 lapse 후 stability는 항상 양수."""
    monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
    state  = _build_state_with_stability(stability)
    result = review(
        state, AGAIN, BASE_TIME,
        lapse_history=lapse_history,
        prior_correct_rate=prior_correct_rate
    )
    assert result["stability"] > 0, f"[{desc}] stability <= 0: {result['stability']}"


@pytest.mark.parametrize("stability,lapse_history,prior_correct_rate,desc", [
    (10.0, None,    None,  "첫lapse"),
    (10.0, [True],  None,  "연속lapse"),
    (10.0, [False], 0.9,   "첫lapse+보너스"),
    (10.0, [True],  0.9,   "연속lapse+보너스"),
])
def test_soft_lapse_always_less_than_before(
    stability, lapse_history, prior_correct_rate, desc, monkeypatch
):
    """소프트 lapse 후 stability는 반드시 기존보다 작아야 한다."""
    monkeypatch.setenv('FSRS_SOFT_LAPSE', 'true')
    state  = _build_state_with_stability(stability)
    result = review(
        state, AGAIN, BASE_TIME,
        lapse_history=lapse_history,
        prior_correct_rate=prior_correct_rate
    )
    assert result["stability"] < stability, (
        f"[{desc}] stability가 감소하지 않음: before={stability}, after={result['stability']}"
    )
