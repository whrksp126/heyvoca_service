"""
SM2 → FSRS 상태 변환 (휴리스틱 근사).

SM2 필드:
  ef, repetition, interval, nextReview, lastStudyDate, beforeScheduleCount

FSRS 필드:
  state, difficulty, stability, retrievability,
  elapsed_days, scheduled_days, reps, lapses,
  last_review, next_review, params_version
"""

import math
from datetime import datetime, timedelta
from typing import Optional

DEFAULT_FSRS_NEW = {
    "state": "new",
    "difficulty": 0.0,
    "stability": 0.0,
    "retrievability": 0.0,
    "elapsed_days": 0,
    "scheduled_days": 0,
    "reps": 0,
    "lapses": 0,
    "last_review": None,
    "next_review": None,
    "params_version": "default-v1",
}

# FSRS 망각 계수 (core.py와 동일)
_DECAY  = -0.5
_FACTOR = 0.9 ** (1.0 / _DECAY) - 1.0


def _retrievability_from_elapsed(elapsed_days: float, stability: float) -> float:
    """elapsed_days와 stability로 기억 회수율 근사."""
    if stability <= 0:
        return 0.0
    return (1.0 + _FACTOR * elapsed_days / stability) ** _DECAY


def sm2_to_fsrs(sm2: dict, *, today: Optional[datetime] = None) -> dict:
    """
    SM2 상태 dict → FSRS state dict 변환 (휴리스틱).

    변환 규칙:
    - repetition == 0 and interval == 0 → state="new", 모든 값 초기값
    - 그 외:
        state       = "review"
        stability   = max(interval or 1, 1)
        difficulty  = clip(10 - 2*(ef - 1.3), 1, 10)
        last_review = sm2.lastStudyDate (있으면)
                      else (today - timedelta(days=interval))
        next_review = sm2.nextReview (있으면)
                      else (last_review + timedelta(days=stability))
        reps        = repetition
        lapses      = 0  (SM2에 lapse 정보 없음)
        elapsed_days= (today - last_review).days
        retrievability = 근사값
    """
    if today is None:
        today = datetime.utcnow()

    repetition = int(sm2.get("repetition") or 0)
    interval   = int(sm2.get("interval") or 0)
    ef         = float(sm2.get("ef") or 2.5)

    # 미학습 단어
    if repetition == 0 and interval == 0:
        return dict(DEFAULT_FSRS_NEW)

    # stability = interval (최소 1)
    stability = max(float(interval), 1.0)

    # difficulty: ef ↔ difficulty 역방향 매핑
    # ef 범위: 1.3~2.6 → difficulty 범위: 1~10
    raw_diff = 10.0 - 2.0 * (ef - 1.3)
    difficulty = max(1.0, min(10.0, raw_diff))

    # last_review 파싱
    last_review_str = sm2.get("lastStudyDate") or sm2.get("last_review")
    last_review: Optional[datetime] = None
    if last_review_str:
        try:
            lr = datetime.fromisoformat(str(last_review_str).replace("Z", "+00:00"))
            last_review = lr.replace(tzinfo=None)
        except (ValueError, AttributeError):
            pass

    if last_review is None:
        last_review = today - timedelta(days=interval)

    # next_review 파싱
    next_review_str = sm2.get("nextReview") or sm2.get("next_review")
    next_review: Optional[datetime] = None
    if next_review_str:
        try:
            nr = datetime.fromisoformat(str(next_review_str).replace("Z", "+00:00"))
            next_review = nr.replace(tzinfo=None)
        except (ValueError, AttributeError):
            pass

    if next_review is None:
        next_review = last_review + timedelta(days=int(stability))

    # elapsed_days: 마지막 복습 이후 경과 일수
    elapsed_days = max(0.0, (today - last_review).total_seconds() / 86400.0)

    retrievability = _retrievability_from_elapsed(elapsed_days, stability)

    scheduled_days = max(1, int(round((next_review - today).total_seconds() / 86400.0)))

    return {
        "state":          "review",
        "difficulty":     round(difficulty, 4),
        "stability":      round(stability, 4),
        "retrievability": round(retrievability, 4),
        "elapsed_days":   round(elapsed_days, 2),
        "scheduled_days": scheduled_days,
        "reps":           repetition,
        "lapses":         0,
        "last_review":    last_review.isoformat(),
        "next_review":    next_review.isoformat(),
        "params_version": "default-v1",
    }
