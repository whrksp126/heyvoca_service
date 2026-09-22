"""recommend/stage.py — FSRS state → 농장 작물 단계(crop stage) 분류.

`pool.py::_classify_bucket` 의 bucket('new'|'overdue'|'today'|'short'|'medium'|'long')은
**복습 예정일**과 섞여 있어(미래에 도래할 short/medium/long만 존재, 오늘/기한초과는
overdue·today로 뭉뚱그려짐), `/study/recommend`의 `target_states` 필터가 이 bucket으로
후보를 걸러 버리면 overdue·today(=오늘 당장 복습해야 하는 단어)가 통째로 빠진다.

`target_states`는 원래 "암기 상태(얼마나 외웠는가)"를 묻는 파라미터지, "언제 복습할
차례인가"를 묻는 게 아니다. 그래서 여기서는 **복습 예정일과 무관하게** FSRS state 하나만
보고 단계를 정한다 — 오늘 밭에 물 줄 때가 된 단어도 stability만 충분하면 그대로
seed/sprout/leaf/carrot 중 제 단계를 유지한다.

경계값은 fsrs/thresholds.py 가 단일 소스(농장 화면과 여기가 갈라지면 안 된다).
"""

from app.services.fsrs.thresholds import (
    STABILITY_SPROUT,
    STABILITY_SHORT,
    STABILITY_MEDIUM,
)

# crop_stage 가 반환하는 5가지 값.
CROP_STAGES = ('unlearned', 'seed', 'sprout', 'leaf', 'carrot')

# target_states 쿼리 파라미터 → crop_stage 집합.
# 5개 crop_stage 키는 자기 자신으로 매핑되고, 구(legacy) bucket 이름(short/medium/long/new)은
# 대응하는 crop_stage 집합으로 확장된다(단기=seed+sprout, 중기=leaf, 장기=carrot, new=unlearned).
STATE_ALIASES = {
    'unlearned': {'unlearned'},
    'seed':      {'seed'},
    'sprout':    {'sprout'},
    'leaf':      {'leaf'},
    'carrot':    {'carrot'},
    # legacy
    'new':       {'unlearned'},
    'short':     {'seed', 'sprout'},
    'medium':    {'leaf'},
    'long':      {'carrot'},
}


def crop_stage(fsrs_state: dict) -> str:
    """FSRS state → 농장 작물 단계.

    pool.py::_classify_bucket 의 "new" 판정과 정확히 같은 조건을 쓴다 — 여기서
    'unlearned'가 되는 단어는 반드시 bucket도 'new'여야 한다(그래야 두 분류가
    "아직 학습 안 한 단어" 하나에 대해 어긋나지 않는다).
    """
    fsrs_state = fsrs_state or {}
    state_str = (fsrs_state.get("state") or "new").lower()
    if state_str in ("new", "") or not fsrs_state.get("next_review"):
        return "unlearned"

    s = float(fsrs_state.get("stability") or 0.0)
    if s < STABILITY_SPROUT:
        return "seed"
    elif s < STABILITY_SHORT:
        return "sprout"
    elif s < STABILITY_MEDIUM:
        return "leaf"
    return "carrot"


def expand_target_states(target_states) -> set:
    """target_states(쿼리 파싱된 문자열 리스트) → crop_stage 허용 집합.

    5개 crop_stage 키 + legacy alias(short/medium/long/new)를 모두 받는다.
    모르는 값은 조용히 무시(로그만 debug)하고, 결과 집합이 비면 호출부에서
    "필터 없음"으로 취급하도록 빈 set을 그대로 반환한다.
    """
    import logging
    allowed: set = set()
    for state in (target_states or []):
        key = (state or '').strip().lower()
        expanded = STATE_ALIASES.get(key)
        if expanded:
            allowed.update(expanded)
        else:
            logging.getLogger(__name__).debug('알 수 없는 target_states 값 무시: %r', state)
    return allowed
