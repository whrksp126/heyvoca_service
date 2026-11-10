"""작물 경험치(XP) — 공용 계산 (기획 crop_xp 계약, 프론트와 필드명 공유).

단일 소스: `xp_raw = round(stability_days × 10)`. FSRS stability(일)는 성장 판정과
같은 축이므로 XP 도 같은 축에서 파생한다. 단계 문턱은 `farm_v2/constants.py` 의
성장 문턱 일수(STAGE_*_DAYS, GOLDEN_MIN_STABILITY_DAYS) × 10 — 새 숫자를 여기 다시
적지 않는다. 두 파일이 갈리면 밭의 작물과 표시 XP 가 다른 말을 하게 된다.

바닥(floor): 현재 단계 시작 XP. `xp = max(xp_raw, floor(stage))` — 오답으로
stability 가 떨어져도 성장 단계 자체가 안 내려가듯(5.2) 표시 XP 도 안 내려간다.
UNPLANTED_SEED(보유 씨앗, 아직 안 심음)는 xp=0 고정.
"""

from typing import Optional

from app.models.models import VisualStage
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import growth

# (단계, 문턱 일수) 순서. UNPLANTED_SEED/PLANTED_SEED 는 둘 다 "아직 새싹 문턱 전"이라
# floor 가 0 으로 같다 — 심었는지 여부는 FSRS 로 구분되지 않는다(growth.py 참고).
_STAGE_DAYS = [
    (VisualStage.UNPLANTED_SEED, 0.0),
    (VisualStage.PLANTED_SEED, 0.0),
    (VisualStage.SPROUT, C.STAGE_SPROUT_DAYS),
    (VisualStage.LEAF, C.STAGE_LEAF_DAYS),
    (VisualStage.CARROT, C.STAGE_CARROT_DAYS),
    (VisualStage.GOLDEN, C.GOLDEN_MIN_STABILITY_DAYS),
]

STAGE_FLOOR = {stage: int(round(days * 10)) for stage, days in _STAGE_DAYS}
_STAGES = [stage for stage, _ in _STAGE_DAYS]


def xp_raw(stability: float) -> int:
    """`round(stability_days × 10)`. 음수·None 은 0."""
    try:
        return max(0, int(round(float(stability or 0.0) * 10)))
    except (TypeError, ValueError):
        return 0


def xp_floor(stage: Optional[str]) -> int:
    """단계 시작 XP. 모르는 단계는 0(보유 씨앗과 동일 취급)."""
    return STAGE_FLOOR.get(stage or VisualStage.UNPLANTED_SEED, 0)


def xp_next(stage: Optional[str]) -> Optional[int]:
    """다음 단계 문턱 XP. 황금(최고 단계)이면 None.

    UNPLANTED_SEED/PLANTED_SEED 는 floor 가 같은 0 이라, 문턱이 다시 올라가는
    첫 단계(새싹)의 floor 를 "다음"으로 본다 — 하드코딩 없이 STAGE_FLOOR 순회로 구한다.
    """
    stage = stage or VisualStage.UNPLANTED_SEED
    try:
        idx = _STAGES.index(stage)
    except ValueError:
        idx = 0
    here = STAGE_FLOOR[_STAGES[idx]]
    for later in _STAGES[idx + 1:]:
        if STAGE_FLOOR[later] > here:
            return STAGE_FLOOR[later]
    return None


def xp_of(stage: Optional[str], fsrs_state: dict, bonus: int = 0) -> int:
    """표시 XP = `max(xp_raw, floor(stage)) + bonus`. UNPLANTED_SEED 는 항상 0.

    bonus 는 정답 바닥 보정 누적분(UserVocaGame.xp_bonus, `bump_bonus`)이다. 단계가 안 바뀌었는데
    문턱을 넘어 보이면 안 되므로 bonus 를 더한 값은 다음 단계 문턱 − 1 을 넘지 않는다
    (stability 만으로 이미 문턱 이상이면 그 값을 그대로 둔다).
    """
    stage = stage or VisualStage.UNPLANTED_SEED
    if stage == VisualStage.UNPLANTED_SEED:
        return 0
    stability = growth._stability(fsrs_state)
    base = max(xp_raw(stability), xp_floor(stage))
    if not bonus or bonus <= 0:
        return base
    nxt = xp_next(stage)
    val = base + int(bonus)
    if nxt is not None:
        val = min(val, max(base, nxt - 1))
    return val


def game_bonus(game) -> int:
    """UserVocaGame 행의 보정 누적분(행이 없거나 구 스키마면 0)."""
    return int(getattr(game, 'xp_bonus', 0) or 0) if game is not None else 0


def bump_bonus(game, stage: Optional[str], fsrs_state: dict, xp_from: int, today) -> int:
    """정답인데 XP 가 안 올랐으면(xp_to <= xp_from) xp_to 가 xp_from + 1 이 되게 bonus 를 올린다.

    같은 단어 같은 현지 학습일에는 1회만(xp_bonus_day) — 하루에 여러 번 맞혀 XP 를 무한히
    올리는 것을 막는다. 문턱 직전이라 더 못 올리면 손대지 않는다. 반환값은 보정 후 xp_to.
    호출부가 정답 여부를 판정한다(오답·감소 규칙은 그대로).
    """
    stage = stage or VisualStage.UNPLANTED_SEED
    bonus = game_bonus(game)
    xp_to = xp_of(stage, fsrs_state, bonus)
    if stage == VisualStage.UNPLANTED_SEED or xp_to > xp_from:
        return xp_to
    if getattr(game, 'xp_bonus_day', None) == today:
        return xp_to
    want = bonus + (xp_from - xp_to + 1)
    bumped = xp_of(stage, fsrs_state, want)
    if bumped <= xp_to:
        return xp_to
    game.xp_bonus = want
    game.xp_bonus_day = today
    return bumped
