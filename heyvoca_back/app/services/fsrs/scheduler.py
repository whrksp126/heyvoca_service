"""
FSRS 스케줄러 래퍼.

내부 core.py의 fsrs_review()를 래핑하여
state dict 기반 인터페이스를 제공한다.

인터페이스:
  review(state, rating, now, params, *, lapse_history, prior_correct_rate)  → 새 state dict
  schedule_initial(now)  → 첫 학습 헬퍼 (rating=GOOD 기본)

rating 상수:
  AGAIN=1, HARD=2, GOOD=3, EASY=4

Phase 2.3 — 부드러운 lapse (FSRS_SOFT_LAPSE, 기본값 true):
  첫 lapse:      stability *= 0.3
  연속 lapse:    stability *= 0.1
  prior_correct_rate >= 0.8인 경우 위 감소율 *0.5 (덜 깎음)
  최종값: max(soft_value, fsrs_standard_value)
"""

import os
from datetime import datetime
from typing import Optional, List

from app.services.fsrs.core import (
    fsrs_review as _fsrs_review,
    DEFAULT_PARAMS,
    AGAIN, HARD, GOOD, EASY,
    STATE_NEW, STATE_LEARNING, STATE_REVIEW, STATE_RELEARNING,
)
from app.services.fsrs.state import DEFAULT_FSRS_NEW

# 소프트 lapse 감소율 상수
_SOFT_LAPSE_FIRST      = 0.3   # 첫 lapse: stability * 0.3
_SOFT_LAPSE_CONSECUTIVE = 0.1  # 연속 lapse: stability * 0.1
_SOFT_LAPSE_GOOD_BONUS  = 0.5  # prior_correct_rate >= 0.8 이면 감소율 * 0.5
_PRIOR_RATE_THRESHOLD   = 0.8  # 직전 정답률이 이 이상이면 bonus 적용


def _use_soft_lapse() -> bool:
    """FSRS_SOFT_LAPSE 환경변수 확인. 기본값 true."""
    val = os.environ.get('FSRS_SOFT_LAPSE', 'true').strip().lower()
    return val != 'false'


def _apply_soft_lapse(
    fsrs_result: dict,
    stability_before: float,
    is_consecutive_lapse: bool,
    prior_correct_rate: Optional[float],
) -> dict:
    """
    FSRS 표준 lapse 결과에 소프트 lapse 보정 적용.

    감소율 결정:
      is_consecutive_lapse=True  → _SOFT_LAPSE_CONSECUTIVE (0.1)
      is_consecutive_lapse=False → _SOFT_LAPSE_FIRST (0.3)
      prior_correct_rate >= 0.8  → 위 감소율 * 0.5

    최종 stability = max(soft_value, fsrs_standard_value)
    """
    rate = _SOFT_LAPSE_CONSECUTIVE if is_consecutive_lapse else _SOFT_LAPSE_FIRST

    if prior_correct_rate is not None and prior_correct_rate >= _PRIOR_RATE_THRESHOLD:
        rate = rate * _SOFT_LAPSE_GOOD_BONUS

    soft_stability = max(stability_before * rate, 0.1)
    fsrs_stability = float(fsrs_result.get('stability') or 0.1)

    # 둘 중 큰 값 → 과도한 하락 방지
    final_stability = max(soft_stability, fsrs_stability)

    result = dict(fsrs_result)
    result['stability'] = round(final_stability, 4)
    return result


def review(
    state: dict,
    rating: int,
    now: datetime,
    params: Optional[List[float]] = None,
    *,
    lapse_history: Optional[List[bool]] = None,
    prior_correct_rate: Optional[float] = None,
) -> dict:
    """
    FSRS-5 복습 처리.

    Args:
        state:              현재 FSRS state dict.
        rating:             1=Again, 2=Hard, 3=Good, 4=Easy
        now:                복습 시각 (UTC datetime)
        params:             17개 float 파라미터 리스트 (None이면 기본값).
        lapse_history:      최근 로그의 lapse 여부 리스트.
                            예: [True] → 직전이 lapse, [False] → 직전이 정답.
                            None 또는 빈 리스트이면 첫 lapse로 간주.
        prior_correct_rate: 직전 5~10개 로그 정답률 (0.0~1.0).
                            None이면 bonus 미적용.

    Returns:
        갱신된 FSRS state dict.

    환경변수:
        FSRS_SOFT_LAPSE=false 로 설정하면 표준 FSRS forget_stability 그대로 사용.
    """
    if rating not in (AGAIN, HARD, GOOD, EASY):
        raise ValueError(f"rating은 1~4 사이여야 합니다. 받은 값: {rating}")

    # state가 None이거나 빈 dict이면 new 상태로 처리
    if not state:
        state = dict(DEFAULT_FSRS_NEW)

    stability_before = float(state.get('stability') or 0.0)

    # 표준 FSRS 계산
    fsrs_result = _fsrs_review(state, rating, now, params)

    # 소프트 lapse 적용 (rating=AGAIN 이고 이미 stability가 있는 경우만)
    if rating == AGAIN and _use_soft_lapse() and stability_before > 0:
        # 직전 로그가 lapse였는지 판단
        is_consecutive = bool(lapse_history and lapse_history[0] is True)
        fsrs_result = _apply_soft_lapse(
            fsrs_result,
            stability_before,
            is_consecutive,
            prior_correct_rate,
        )

    return fsrs_result


def schedule_initial(now: datetime, params: Optional[List[float]] = None) -> dict:
    """
    미학습 단어의 첫 복습 처리 헬퍼.
    GOOD(3) 기본 rating으로 첫 학습 상태를 초기화한다.
    실제 학습 결과가 있을 경우 review()를 직접 호출할 것.

    Returns:
        첫 학습 후 FSRS state dict.
    """
    return review(dict(DEFAULT_FSRS_NEW), GOOD, now, params)
