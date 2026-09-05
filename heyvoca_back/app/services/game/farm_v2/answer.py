"""학습 답안 1건 → 농장 반영 (기획 5, 8.2, 12.2).

`study/log` 가 학습 데이터를 커밋한 **직후** 호출된다. 여기서 실패해도 학습 저장은
이미 끝나 있다(호출부 try/except) — 농장이 게임 레이어인 이유다.

반환값은 학습 화면 하단의 상태 바가 그대로 쓴다. 시안 기준:
    [작물] [막대 + 오른 만큼] [다음 복습일]
단계명 문자열은 보내지 않는다. 작물 그림이 이미 그 말이라 화면에서 쓰지 않는다.
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from app import db
from app.models.models import (FarmEvent, FarmItem, FarmItemReason,
                               HealthState, UserVoca, UserVocaGame, VisualStage)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, growth, health, inventory, localday

# 단계 → 시안 작물 키. 심기 전/심은 씨앗은 화면에서 같은 씨앗 그림을 쓴다(기획 5.1).
CROP_KEY = {
    VisualStage.UNPLANTED_SEED: 'seed',
    VisualStage.PLANTED_SEED:   'seed',
    VisualStage.SPROUT:         'sprout',
    VisualStage.LEAF:           'leaf',
    VisualStage.CARROT:         'carrot',
    VisualStage.GOLDEN:         'golden',
}

# 단계 상승 보상 (기획 8.2) — 단어당 각 단계 최초 1회.
# 심은 씨앗에는 재화 보상이 없다. 첫 학습 피드백은 즉시 주되 보상은 발아까지 미룬다.
_STAGE_REWARD_FLAG = {
    VisualStage.SPROUT: 'sprout_rewarded',
    VisualStage.LEAF:   'leaf_rewarded',
    VisualStage.CARROT: 'carrot_rewarded',
}


def _get_or_create(user_voca_id: int, user_id: UUID) -> UserVocaGame:
    row = (
        db.session.query(UserVocaGame)
        .filter(UserVocaGame.user_voca_id == user_voca_id)
        .with_for_update()
        .first()
    )
    if row is None:
        row = UserVocaGame(user_voca_id=user_voca_id, user_id=user_id)
        db.session.add(row)
        db.session.flush()
    return row


def stage_progress(game: UserVocaGame, fsrs_state: dict, now: dt.datetime) -> int:
    """다음 단계까지의 진행률 0~100.

    심은 씨앗 위로는 전부 **다음 복습 간격**이 문턱이므로, 막대도 그 하나로 잰다.
    (예전에는 씨앗만 '심은 시각 → 첫 예정 복습' 경과 시간으로 쟀다. 발아 조건이
     시간·행동이던 시절의 잔재라, 조건이 간격으로 통일된 지금은 막대만 다른 것을
     재고 있어 "막대가 다 찼는데 안 자란다"가 나온다.)
    """
    stage = game.visual_stage or VisualStage.UNPLANTED_SEED
    if stage == VisualStage.GOLDEN:
        return 100
    if stage == VisualStage.UNPLANTED_SEED:
        return 0

    s = growth._stability(fsrs_state)
    if stage == VisualStage.PLANTED_SEED:
        return _pct(s, C.STAGE_SPROUT_DAYS)
    if stage == VisualStage.SPROUT:
        return _pct(s - C.STAGE_SPROUT_DAYS, C.STAGE_LEAF_DAYS - C.STAGE_SPROUT_DAYS)
    if stage == VisualStage.LEAF:
        return _pct(s - C.STAGE_LEAF_DAYS, C.STAGE_CARROT_DAYS - C.STAGE_LEAF_DAYS)
    # 당근 → 황금
    return _pct(s - C.STAGE_CARROT_DAYS, C.GOLDEN_MIN_STABILITY_DAYS - C.STAGE_CARROT_DAYS)


def _pct(num: float, den: float) -> int:
    if not den or den <= 0:
        return 0
    return max(0, min(100, int(round(num / den * 100))))


def on_answer(user_id: UUID, user_voca_id: int, was_correct: bool,
              session_id=None, now: Optional[dt.datetime] = None,
              fsrs_before: Optional[dict] = None) -> Optional[dict]:
    """답안 1건을 농장에 반영하고 화면용 payload 를 만든다.

    커밋까지 여기서 한다. 호출부(hooks)는 학습 트랜잭션을 이미 닫은 뒤다.

    `fsrs_before` 는 **이 답안을 반영하기 전**의 FSRS 상태다. 반드시 받아야 한다 —
    호출 시점에는 user_voca.data 가 이미 새 상태로 커밋돼 있어서, 여기서 다시 읽으면
    학습 전/후가 같은 값이 된다. 예전에는 인자가 없어 pct_from 과 pct_to 를 둘 다
    **학습 후** 상태로 계산했고, 그래서 단계가 오르지 않는 회차에는 두 값이 항상 같아
    막대가 한 번도 움직이지 않았다(오르는 `+N%` 도, 오답으로 줄어드는 것도 없었다).
    """
    now = now or dt.datetime.utcnow()

    user_voca = db.session.query(UserVoca).filter(UserVoca.id == user_voca_id).first()
    if user_voca is None:
        return None

    game = _get_or_create(user_voca_id, user_id)
    fsrs_state = growth.load_fsrs_state(user_voca)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    stage_before = game.visual_stage or VisualStage.UNPLANTED_SEED
    health_before = game.health_state or HealthState.FRESH
    # 학습 전 상태를 못 받았으면(구 호출부) 최소한 예전 동작으로 떨어진다
    pct_before = stage_progress(game, fsrs_before if fsrs_before is not None else fsrs_state, now)

    # ── 독립 정답 판정 ──
    # 씨앗 구간에서만 로그를 뒤진다. 잎 이상은 안정성만으로 단계가 정해지므로
    # 이 조회를 붙이면 하루 수만 건의 쓸모없는 스캔이 생긴다.
    if stage_before in (VisualStage.UNPLANTED_SEED, VisualStage.PLANTED_SEED):
        independent = growth.is_independent_answer(user_id, user_voca_id, session_id, was_correct)
    else:
        independent = bool(was_correct)

    rewards = []
    to_stage = growth.next_stage(game, fsrs_state, now, today, independent, was_correct)

    if to_stage is not None:
        _apply_stage_up(game, stage_before, to_stage, now, today, fsrs_state,
                        user_id, user_voca_id, session_id, rewards)

    # ── 건강 갱신 ──
    # 정답이면 물을 준 것이다. FSRS 가 다음 예정일을 새로 잡았으므로 상태는 FRESH 로 돌아가고
    # 보호 일수도 리셋된다(급수는 그 회차의 지연을 메우는 것이지 영구 연장이 아니다).
    #
    # **부패는 예외다(기획 6.1/7.1).** 썩은 작물은 삽·회복제를 거쳐야만 벗어난다.
    # 여기서 무조건 FRESH 로 되돌리면, 부패 작물을 아무 학습 모드에서나 한 번 맞히는 것만으로
    # 아이템 없이 완전 복구가 된다 — 상점과 부패 후 처리(기획 7·8)가 통째로 무의미해진다.
    # 삽/회복제로 예약된 진단 답안은 restore.complete_diagnosis 가 따로 FRESH 로 확정한다.
    if game.health_state == HealthState.ROTTEN:
        pass
    elif was_correct and game.health_state != HealthState.GOLDEN:
        if game.health_state != HealthState.FRESH:
            events.log(user_id, FarmEvent.REVIEW_WATERED, user_voca_id=user_voca_id,
                       from_state=game.health_state, to_state=HealthState.FRESH,
                       reason='CORRECT', session_id=session_id)
        game.health_state = HealthState.FRESH
        game.health_changed_at = now
        game.protection_days = 0
    elif not was_correct:
        # 오답은 물주기 미완료다(5.4). 건강을 깎지도, 예정일을 앞당기지도 않는다.
        events.log(user_id, FarmEvent.WATERING_INCOMPLETE, user_voca_id=user_voca_id,
                   from_state=game.health_state, reason='INCORRECT', session_id=session_id)

    due_at = growth.parse_fsrs_due(fsrs_state)
    stability = growth._stability(fsrs_state)
    # 부패 상태에서는 마감을 다시 잡지 않는다. 여기서 미래로 밀면 조회 집계
    # (query.effective_health_expr)와 부패 목록이 서로 다른 답을 내놓는다.
    # 황금은 부패 자체가 없으므로(10.3) 마감 컬럼을 비워 둔 채로 유지한다 —
    # _apply_golden 이 None 으로 지운 값을 다음 답안이 되살리면 안 된다.
    if (due_at is not None and game.visual_stage != VisualStage.UNPLANTED_SEED
            and game.visual_stage != VisualStage.GOLDEN
            and game.health_state not in (HealthState.ROTTEN, HealthState.GOLDEN)):
        t = health.thresholds(due_at, stability, game.visual_stage, game.protection_days)
        game.rot_due_at = t['rotten_at']

    # ── 황금 판정 ──
    # 당근일 때만 본다. 조건 3·4·5 가 로그 조회라 모든 단어에 붙이면 비용이 크다.
    if game.visual_stage == VisualStage.CARROT and was_correct:
        if growth.check_golden(user_id, user_voca_id, game, fsrs_state):
            _apply_golden(game, now, user_id, user_voca_id, session_id, rewards)

    game.updated_at = now
    db.session.commit()

    stage_after = game.visual_stage or VisualStage.UNPLANTED_SEED
    grew = VisualStage.rank(stage_after) > VisualStage.rank(stage_before)
    # 진화한 회차에도 **새 단계에서의** 진행률을 보낸다. 0 으로 눌러 버리면
    # pct_from(0) == pct_to(0) 이 되어, 가장 보여 줘야 할 순간에 막대가 멈춘다.
    pct_after = stage_progress(game, fsrs_state, now)

    return {
        'crop': CROP_KEY.get(stage_after, 'seed'),
        'stage': stage_after,
        'grew': grew,
        # 진화 연출은 **이전 작물이 쪼그라들고 새 작물이 튀어오르는** 전환이라 이전 그림이
        # 필요하다. 이걸 안 주면 화면이 "한 단계 아래"로 추정하는데, 회복제로 단계가
        # 복원되거나 한 번에 두 단계가 오르면 잘못된 작물이 0.12초 스쳐 간다.
        'crop_from': CROP_KEY.get(stage_before, 'seed'),
        'stage_from': stage_before,
        # 시안의 막대 — 진화한 회차는 새 단계의 진행률로 리셋되므로 from 을 0 으로 보낸다
        'pct_from': 0 if grew else pct_before,
        'pct_to': pct_after,
        'health': game.health_state,
        'next_review_at': localday.iso_utc(due_at) if due_at else None,
        'days_to_review': health.ceil_days(due_at - now) if due_at else None,
        'rewards': rewards,
    }


def _apply_stage_up(game: UserVocaGame, from_stage: str, to_stage: str,
                    now: dt.datetime, today, fsrs_state: dict,
                    user_id: UUID, user_voca_id: int, session_id, rewards: list) -> None:
    """단계 상승 + 최초 도달 보상 (기획 8.2)."""
    game.visual_stage = to_stage
    if VisualStage.rank(to_stage) > VisualStage.rank(game.highest_stage or ''):
        game.highest_stage = to_stage

    if to_stage == VisualStage.PLANTED_SEED:
        game.first_planted_at = now
        game.planted_study_day = today
        # 첫 예정 복습 시각을 여기서 박아 둔다. 나중에 FSRS 가 일정을 다시 잡아도
        # 발아 판정의 기준선은 **심은 그때의 첫 예정일**이어야 한다(5.1 조건 3).
        game.first_due_at = growth.parse_fsrs_due(fsrs_state)
    elif to_stage == VisualStage.SPROUT:
        game.first_sprouted_at = now

    events.log(user_id, events.stage_up_event(from_stage, to_stage),
               user_voca_id=user_voca_id, from_state=from_stage, to_state=to_stage,
               reason='CORRECT', session_id=session_id)

    # 최초 도달 보상 — 단어당 1회. 다시 심어 같은 단계에 재도달해도 지급하지 않는다.
    flag = _STAGE_REWARD_FLAG.get(to_stage)
    if not flag or getattr(game, flag, False):
        return
    setattr(game, flag, True)

    if to_stage == VisualStage.SPROUT:
        bal = inventory.grant_gem(
            user_id, C.REWARD_SPROUT_GEM,
            description=f'새싹 성장 보상 (user_voca #{user_voca_id})')
        if bal is not None:
            rewards.append({'kind': 'GEM', 'amount': C.REWARD_SPROUT_GEM,
                            'balance': bal, 'why': 'SPROUT'})
    elif to_stage == VisualStage.LEAF:
        bal = inventory.grant(user_id, FarmItem.SHOVEL, C.REWARD_LEAF_SHOVEL,
                              FarmItemReason.STAGE_REWARD, description='이파리 성장 보상',
                              user_voca_id=user_voca_id)
        events.log(user_id, FarmEvent.SHOVEL_EARNED, user_voca_id=user_voca_id,
                   reason='STAGE_LEAF', session_id=session_id)
        rewards.append({'kind': FarmItem.SHOVEL, 'amount': C.REWARD_LEAF_SHOVEL,
                        'balance': bal, 'why': 'LEAF'})
    elif to_stage == VisualStage.CARROT:
        bal = inventory.grant(user_id, FarmItem.NUTRIENT, C.REWARD_CARROT_NUTRIENT,
                              FarmItemReason.STAGE_REWARD, description='당근 성장 보상',
                              user_voca_id=user_voca_id)
        rewards.append({'kind': FarmItem.NUTRIENT, 'amount': C.REWARD_CARROT_NUTRIENT,
                        'balance': bal, 'why': 'CARROT'})


def _apply_golden(game: UserVocaGame, now: dt.datetime, user_id: UUID,
                  user_voca_id: int, session_id, rewards: list) -> None:
    """황금 당근 전환 (기획 10).

    첫 황금에만 보석을 준다. 개별 지급하면 쉬운 단어를 대량으로 넣어 재화를 캘 수 있다(10.4).
    """
    from_stage = game.visual_stage
    game.visual_stage = VisualStage.GOLDEN
    game.highest_stage = VisualStage.GOLDEN
    game.health_state = HealthState.GOLDEN
    game.golden_at = now
    game.golden_check_status = 'PASSED'
    game.rot_due_at = None

    events.log(user_id, FarmEvent.GOLDEN_ACHIEVED, user_voca_id=user_voca_id,
               from_state=from_stage, to_state=VisualStage.GOLDEN, session_id=session_id)

    is_first = (
        db.session.query(UserVocaGame.user_voca_id)
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.visual_stage == VisualStage.GOLDEN,
                UserVocaGame.user_voca_id != user_voca_id)
        .first()
    ) is None
    if not is_first:
        return

    bal = inventory.grant_gem(user_id, C.REWARD_FIRST_GOLDEN_GEM,
                              description='첫 황금 당근 보상')
    if bal is not None:
        rewards.append({'kind': 'GEM', 'amount': C.REWARD_FIRST_GOLDEN_GEM,
                        'balance': bal, 'why': 'FIRST_GOLDEN'})
