"""
FSRS-5 알고리즘 내부 구현체 (Python 3.8 호환)

외부 라이브러리(py-fsrs, fsrs) 없이 FSRS-5 수식을 직접 구현한다.
참조: https://github.com/open-spaced-repetition/py-fsrs (MIT License)
     "A Stochastic Shortest Path Algorithm for Optimizing a Fixed-Point
      Iteration Scheduling Policy" (Ye 2022)

FSRS-5 기본 파라미터 (17개):
  w[0]~w[3]: 초기 stability (각 rating별 s0)
  w[4]~w[6]: 난이도 초기화/분산 관련
  w[7]~w[8]: stability recall 지수 상수
  w[9]:      난이도 영향도
  w[10]:     보안 감소 계수
  w[11]:     lapse 후 stability 복구 상수
  w[12]:     lapse 후 stability 감소 비율
  w[13]:     lapse 후 stability 상한
  w[14]~[15]: 하드(2)/이지(4) stability 보정
  w[16]:     짧은 간격 복습 hard ceiling
"""

import math
from datetime import datetime, timedelta
from typing import Optional, List

# FSRS-5 기본 파라미터
DEFAULT_PARAMS = [
    0.4072, 1.1829, 3.1262, 15.4722,
    7.2102, 0.5316, 1.0651, 0.0589,
    1.3374, 0.1445, 1.0115, 1.9539,
    0.1100, 0.2900, 2.2700, 0.2500,
    2.9898,
]

# FSRS rating 상수
AGAIN = 1
HARD  = 2
GOOD  = 3
EASY  = 4

# 카드 상태 문자열 상수
STATE_NEW       = "new"
STATE_LEARNING  = "learning"
STATE_REVIEW    = "review"
STATE_RELEARNING = "relearning"

# 망각 임계값 (retrievability < 0.9 → due)
DECAY    = -0.5
FACTOR   = 0.9 ** (1.0 / DECAY) - 1.0   # ≈ 0.0000019


def _init_difficulty(w: List[float], rating: int) -> float:
    """초기 난이도 계산 (D0)."""
    d = w[4] - math.exp(w[5] * (rating - 1)) + 1.0
    return max(1.0, min(10.0, d))


def _next_difficulty(w: List[float], d: float, rating: int) -> float:
    """난이도 갱신 (mean-reversion)."""
    delta = -w[6] * (rating - 3)
    new_d = d + delta * (10.0 - d) / 9.0
    # mean-reversion
    new_d = w[7] * _init_difficulty(w, 4) + (1.0 - w[7]) * new_d
    return max(1.0, min(10.0, new_d))


def _init_stability(w: List[float], rating: int) -> float:
    """초기 stability (S0) — 첫 학습 시."""
    return max(0.1, w[rating - 1])


def _stability_after_recall(
    w: List[float], d: float, s: float, r: float, rating: int
) -> float:
    """정답 시 stability 갱신 (SIncrease)."""
    hard_penalty = w[14] if rating == HARD else 1.0
    easy_bonus   = w[15] if rating == EASY else 1.0
    inner = (
        math.exp(w[8])
        * (11.0 - d)
        * (s ** (-w[9]))
        * (math.exp((1.0 - r) * w[10]) - 1.0)
        * hard_penalty
        * easy_bonus
    )
    return max(s * inner, s + 0.01)   # stability는 단조 증가 보장


def _stability_after_lapse(w: List[float], d: float, s: float, r: float) -> float:
    """오답 시 stability 갱신 (SDecrease)."""
    new_s = w[11] * (d ** (-w[12])) * ((s + 1.0) ** w[13] - 1.0) * r
    return max(new_s, 0.1)


def _next_interval(s: float, desired_retention: float = 0.9) -> int:
    """stability → 다음 복습 간격(일) 계산."""
    interval = s / FACTOR * (desired_retention ** (1.0 / DECAY) - 1.0)
    return max(1, min(round(interval), 36500))   # 최대 100년


def _retrievability(elapsed_days: float, s: float) -> float:
    """경과 일수와 stability로 기억 회수율 계산."""
    if s <= 0:
        return 0.0
    return (1.0 + FACTOR * elapsed_days / s) ** DECAY


def fsrs_review(
    state: dict,
    rating: int,
    now: datetime,
    params: Optional[List[float]] = None,
) -> dict:
    """
    FSRS-5 단일 복습 처리.

    Args:
        state: 현재 FSRS state dict (get_fsrs_state()가 반환하는 형태)
        rating: 1=Again, 2=Hard, 3=Good, 4=Easy
        now: 복습 시각 (UTC)
        params: 17개 float 리스트 (None이면 기본값 사용)

    Returns:
        갱신된 FSRS state dict
    """
    w = params if (params and len(params) == 17) else DEFAULT_PARAMS

    current_state = state.get("state", STATE_NEW)
    d = float(state.get("difficulty") or 0.0)
    s = float(state.get("stability") or 0.0)
    last_review_str = state.get("last_review")
    reps  = int(state.get("reps") or 0)
    lapses = int(state.get("lapses") or 0)

    # 경과 일수 계산
    if last_review_str and s > 0:
        try:
            if isinstance(last_review_str, str):
                lr = datetime.fromisoformat(last_review_str.replace("Z", "+00:00"))
                lr = lr.replace(tzinfo=None)
            else:
                lr = last_review_str
            elapsed_days = max(0.0, (now - lr).total_seconds() / 86400.0)
        except Exception:
            elapsed_days = 0.0
    else:
        elapsed_days = 0.0

    r = _retrievability(elapsed_days, s) if s > 0 else 0.0

    # 상태에 따른 처리
    if current_state == STATE_NEW or s == 0:
        # 첫 학습
        new_s = _init_stability(w, rating)
        new_d = _init_difficulty(w, rating)
        new_state = STATE_LEARNING
        new_lapses = lapses
        new_reps   = 1
    elif rating == AGAIN:
        # 오답 → lapse
        new_s = _stability_after_lapse(w, d, max(s, 0.1), max(r, 0.01))
        new_d = _next_difficulty(w, d, rating)
        new_state = STATE_RELEARNING
        new_lapses = lapses + 1
        new_reps   = reps + 1
    else:
        # 정답
        new_s = _stability_after_recall(w, d, max(s, 0.1), max(r, 0.01), rating)
        new_d = _next_difficulty(w, d, rating)
        new_state = STATE_REVIEW
        new_lapses = lapses
        new_reps   = reps + 1

    scheduled_days = _next_interval(new_s)
    next_review    = now + timedelta(days=scheduled_days)
    new_r          = _retrievability(0.0, new_s)   # 복습 직후 → 1.0에 가까움

    return {
        "state":          new_state,
        "difficulty":     round(new_d, 4),
        "stability":      round(new_s, 4),
        "retrievability": round(new_r, 4),
        "elapsed_days":   round(elapsed_days, 2),
        "scheduled_days": scheduled_days,
        "reps":           new_reps,
        "lapses":         new_lapses,
        "last_review":    now.isoformat(),
        "next_review":    next_review.isoformat(),
        "params_version": "default-v1",
    }
