"""건강 축 — 촉촉함 / 목마름 / 시듦 / 심한 시듦 / 부패 (기획 6).

성장 축과 **완전히 독립**이다. 썩은 당근이 존재하고, 썩어도 과거 성장 단계는 남는다.
이 모듈은 DB 를 읽지도 쓰지도 않는 순수 계산이다 — 그래야 조회 시 계산(6.3)이 가능하다.

V1 과의 차이:
    V1 은 간격의 25%/50%/100% 지점을 각각 독립적으로 잡았다. 간격이 길수록 유예가
    무한정 늘어나(90일 간격이면 죽기까지 90일) 사실상 안 죽었다.
    V2 는 유예 G 를 먼저 clamp(3~30일)로 묶고 그 **안에서** 25/60/100% 를 나눈다.
"""

import datetime as dt
import math
from typing import Optional

from app.models.models import HealthState, VisualStage
from app.services.game.farm_v2 import constants as C

_DAY = dt.timedelta(days=1)

# 부패 유예 계산에서 '초기 단어'로 보는 성장 단계 (최소 유예 5일 적용)
_EARLY_STAGES = frozenset({VisualStage.PLANTED_SEED, VisualStage.SPROUT})


def grace_days(interval_days: float, visual_stage: str = None) -> int:
    """부패 유예 G = clamp(ceil(I × 0.5), 3, 30). 초기 단어는 최소 5일 (기획 6.2)."""
    try:
        interval = float(interval_days or 0.0)
    except (TypeError, ValueError):
        interval = 0.0
    g = int(math.ceil(interval * C.GRACE_RATIO))
    g = max(C.GRACE_MIN, min(C.GRACE_MAX, g))
    if visual_stage in _EARLY_STAGES:
        g = max(g, C.GRACE_MIN_EARLY)
    return g


def thresholds(due_at: dt.datetime, interval_days: float,
               visual_stage: str = None, protection_days: int = 0) -> dict:
    """상태 전이 시각들. due_at 은 FSRS 가 정한 복습 예정 시각(D).

    protection_days 는 무료 긴급 급수(8.4)로 밀린 일수다. **부패만** 밀린다 —
    시듦은 그대로 진행돼야 사용자가 "돌봐야 할 것이 있다"는 신호를 계속 받는다.
    """
    g = grace_days(interval_days, visual_stage)
    wilt_offset = max(C.WILT_MIN_DAYS, int(math.ceil(g * C.WILT_RATIO)))
    crit_offset = max(C.CRITICAL_MIN_DAYS, int(math.ceil(g * C.CRITICAL_RATIO)))
    return {
        'grace_days': g,
        'thirsty_at':  due_at,
        'wilted_at':   due_at + wilt_offset * _DAY,
        'critical_at': due_at + crit_offset * _DAY,
        'rotten_at':   due_at + (g + max(0, int(protection_days or 0))) * _DAY,
    }


def compute_health(due_at: Optional[dt.datetime], interval_days: float, now: dt.datetime,
                   visual_stage: str = None, protection_days: int = 0,
                   is_golden: bool = False, already_rotten: bool = False) -> dict:
    """단어 1개의 건강 상태 (순수).

    Returns:
        {'state', 'grace_days', 'rot_due_at', 'days_to_rot', 'days_to_wilt', 'next_at'}
        next_at 은 **다음으로 나빠지는 시각**이다. 화면의 "N일 뒤" 는 이걸 쓴다.
    """
    if is_golden:
        # 황금은 부패하지 않는다(10.3). 시간이 얼마나 지났든 상태가 변하지 않는다.
        return {'state': HealthState.GOLDEN, 'grace_days': None, 'rot_due_at': None,
                'days_to_rot': None, 'days_to_wilt': None, 'next_at': None}

    if already_rotten:
        return {'state': HealthState.ROTTEN, 'grace_days': None, 'rot_due_at': None,
                'days_to_rot': 0, 'days_to_wilt': None, 'next_at': None}

    # 보유 씨앗은 생장 주기가 시작되지 않았다 — 영구 FRESH (기획 6.4).
    # due_at 이 없는 경우(아직 FSRS 일정이 없음)도 같다.
    if visual_stage == VisualStage.UNPLANTED_SEED or due_at is None:
        return {'state': HealthState.FRESH, 'grace_days': None, 'rot_due_at': None,
                'days_to_rot': None, 'days_to_wilt': None, 'next_at': None}

    t = thresholds(due_at, interval_days, visual_stage, protection_days)

    if now >= t['rotten_at']:
        state, next_at = HealthState.ROTTEN, None
    elif now >= t['critical_at']:
        state, next_at = HealthState.CRITICAL, t['rotten_at']
    elif now >= t['wilted_at']:
        state, next_at = HealthState.WILTED, t['critical_at']
    elif now >= t['thirsty_at']:
        state, next_at = HealthState.THIRSTY, t['wilted_at']
    else:
        state, next_at = HealthState.FRESH, t['thirsty_at']

    return {
        'state': state,
        'grace_days': t['grace_days'],
        'rot_due_at': t['rotten_at'],
        'days_to_rot': ceil_days(t['rotten_at'] - now),
        'days_to_wilt': ceil_days(t['wilted_at'] - now) if state == HealthState.FRESH else None,
        'next_at': next_at,
    }


def ceil_days(delta: dt.timedelta) -> int:
    """남은 시간 → 올림 일수. 음수면 0.

    올림인 이유는 화면 문구가 "3일 뒤"이기 때문이다. 2.1일 남았는데 "2일 뒤"라고 적으면
    사용자가 이틀 뒤에 왔을 때 이미 썩어 있다.
    """
    secs = delta.total_seconds()
    if secs <= 0:
        return 0
    return int((secs + 86399) // 86400)


# 화면에 그대로 나가는 한국어 라벨. 기획 2.1 이 금지한 표현(죽음·사망)을 쓰지 않는다.
HEALTH_LABEL = {
    HealthState.FRESH:    '촉촉해요',
    HealthState.THIRSTY:  '목말라요',
    HealthState.WILTED:   '시들었어요',
    HealthState.CRITICAL: '많이 시들었어요',
    HealthState.ROTTEN:   '썩었어요',
    HealthState.GOLDEN:   '황금이에요',
}

# 학습 가능 여부 (기획 6.1). 부패만 회복/다시 심기 전까지 막힌다.
def is_studiable(state: str) -> bool:
    return state != HealthState.ROTTEN
