"""전역 콤보 (AI 추천 테스트 연속 정답) 서비스.

정책 (2026-07-05 확정):
- AI 추천 테스트(test_type='quick')의 정답만 적립. 세션·날짜 경계 무관 전역 유지.
- 오답 시: 콤보 >= MIN_PROTECT_COMBO 이면 AT_RISK 전환(프론트 보호 팝업),
  미만이면 조용히 0 리셋.
- 보호: 보석 PROTECT_COST개 차감 후 위기 직전 값 복원. 포기: 0 확정.
- AT_RISK 방치 중 다음 답안 유입 시 자동 포기 처리(팝업 이탈 안전장치).
- 업적(암기왕): best_combo 도달형 — 기존 Goals/UserGoals/보상 흐름 재사용하되
  증가형 update_user_goal 대신 도달값 동기화 방식. (콤보왕 GoalType 삭제, 암기왕으로 통합)

이 모듈의 함수들은 study/log 커밋 '이후' 별도 트랜잭션으로 실행된다
(콤보 실패가 학습 저장을 깨지 않도록).
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from app import db
from app.models.models import (
    User, UserCombo, GemReason, Goals, GoalType, UserGoals,
)
from app.routes.common import register_gem_log

# 튜닝 상수
MIN_PROTECT_COMBO = 5   # 이 값 미만 콤보는 팝업 없이 조용히 리셋
PROTECT_COST      = 1   # 콤보 보호 보석 비용 (고정)

STATUS_ACTIVE  = 'ACTIVE'
STATUS_AT_RISK = 'AT_RISK'

# 암기왕: 연속 정답 콤보 최고치 기준으로 전환 (2026-07-06)
# 콤보왕 GoalType은 마이그레이션으로 삭제, 암기왕 Goals를 콤보 임계값으로 교체함.
_GOAL_TYPE_NAME = '암기왕'


def _get_or_create_locked(user_id: UUID) -> UserCombo:
    """user_combo 행을 잠금 조회 (없으면 생성)."""
    row = (
        db.session.query(UserCombo)
        .filter(UserCombo.user_id == user_id)
        .with_for_update()
        .first()
    )
    if row is None:
        row = UserCombo(user_id=user_id)
        db.session.add(row)
        db.session.flush()
    return row


def _payload(row: UserCombo, *, best_updated=False, goal_completed=None) -> dict:
    return {
        'current':           row.current_combo,
        'best':              row.best_combo,
        'status':            row.status,
        'at_risk_combo':     row.at_risk_combo,
        'protect_cost':      PROTECT_COST,
        'min_protect_combo': MIN_PROTECT_COMBO,
        'events': {
            'best_updated':   best_updated,
            'goal_completed': goal_completed,  # {'level': n, 'goal': n, 'reward': n} | None
        },
    }


def _sync_combo_goal(user_id: UUID, best_combo: int) -> Optional[dict]:
    """암기왕 업적을 best_combo 도달값으로 동기화.

    update_user_goal(+1 증가형)과 달리 current_value를 도달값으로 직접 세팅.
    임계 통과 시 완료 처리 + 다음 레벨 생성 + 보석 지급(기존 흐름과 동일).
    반환: 이번 호출로 완료된 최고 레벨 정보 (없으면 None).
    """
    completed_info = None
    # best는 1씩 증가하므로 한 번에 여러 레벨을 넘는 일은 없지만, 방어적으로 루프
    for _ in range(3):
        current_user_goal = (
            db.session.query(UserGoals)
            .join(Goals, UserGoals.goal_id == Goals.id)
            .join(GoalType, Goals.type_id == GoalType.id)
            .filter(UserGoals.user_id == user_id)
            .filter(GoalType.type == _GOAL_TYPE_NAME)
            .filter(UserGoals.is_completed == False)  # noqa: E712
            .first()
        )
        if current_user_goal is None:
            # 진행 중 목표 없음 → 첫 레벨 생성 (전 레벨 완료면 종료)
            goal_type = db.session.query(GoalType).filter(GoalType.type == _GOAL_TYPE_NAME).first()
            if not goal_type:
                return completed_info
            done_ids = {
                ug.goal_id for ug in
                db.session.query(UserGoals)
                .join(Goals, UserGoals.goal_id == Goals.id)
                .filter(UserGoals.user_id == user_id, Goals.type_id == goal_type.id)
                .all()
            }
            next_goal = (
                db.session.query(Goals)
                .filter(Goals.type_id == goal_type.id, ~Goals.id.in_(done_ids) if done_ids else True)
                .order_by(Goals.level)
                .first()
            )
            if not next_goal:
                return completed_info
            current_user_goal = UserGoals(
                user_id=user_id, goal_id=next_goal.id,
                current_value=0, is_completed=False, completed_at=None,
            )
            db.session.add(current_user_goal)
            db.session.flush()

        goal = db.session.query(Goals).filter(Goals.id == current_user_goal.goal_id).first()
        new_value = min(best_combo, goal.goal)
        if new_value <= current_user_goal.current_value:
            return completed_info
        current_user_goal.current_value = new_value

        if new_value < goal.goal:
            return completed_info

        # 완료 처리 + 보상 (mainpage.update_user_goal와 동일 흐름)
        current_user_goal.is_completed = True
        current_user_goal.completed_at = dt.datetime.utcnow()
        user = db.session.query(User).filter(User.id == user_id).first()
        if user and goal.reward_count > 0:
            user.gem_cnt += goal.reward_count
            db.session.flush()
            register_gem_log(
                user_id=user_id,
                amount=goal.reward_count,
                reason=GemReason.ACHIEVEMENT,
                description=f'암기왕 Lv.{goal.level} 달성 (콤보 {goal.goal}회)',
                source_type='goal',
                source_id=None,
                balance_after=user.gem_cnt,
            )
        completed_info = {'level': goal.level, 'goal': goal.goal, 'reward': goal.reward_count}

        # 다음 레벨 목표 생성
        next_goal = (
            db.session.query(Goals)
            .filter(Goals.type_id == goal.type_id, Goals.level == goal.level + 1)
            .first()
        )
        if next_goal:
            db.session.add(UserGoals(
                user_id=user_id, goal_id=next_goal.id,
                current_value=min(best_combo, next_goal.goal), is_completed=False, completed_at=None,
            ))
            db.session.flush()
            if best_combo >= next_goal.goal:
                continue  # 드물게 다음 레벨도 이미 도달한 경우
        return completed_info
    return completed_info


def apply_answer(user_id: UUID, was_correct: bool) -> dict:
    """답안 1건을 콤보에 반영하고 커밋한다. (study/log 커밋 이후 호출 전제)"""
    row = _get_or_create_locked(user_id)

    # AT_RISK 방치 상태에서 새 답안 → 자동 포기 (위기 콤보 소멸)
    if row.status == STATUS_AT_RISK:
        row.status = STATUS_ACTIVE
        row.at_risk_combo = None
        row.at_risk_at = None
        row.current_combo = 0

    best_updated = False
    goal_completed = None

    if was_correct:
        row.current_combo += 1
        if row.current_combo > row.best_combo:
            row.best_combo = row.current_combo
            best_updated = True
            goal_completed = _sync_combo_goal(user_id, row.best_combo)
    else:
        if row.current_combo >= MIN_PROTECT_COMBO:
            row.status = STATUS_AT_RISK
            row.at_risk_combo = row.current_combo
            row.at_risk_at = dt.datetime.utcnow()
        row.current_combo = 0

    payload = _payload(row, best_updated=best_updated, goal_completed=goal_completed)
    db.session.commit()
    return payload


def get_state(user_id: UUID) -> dict:
    row = db.session.query(UserCombo).filter(UserCombo.user_id == user_id).first()
    if row is None:
        return {
            'current': 0, 'best': 0, 'status': STATUS_ACTIVE, 'at_risk_combo': None,
            'protect_cost': PROTECT_COST, 'min_protect_combo': MIN_PROTECT_COMBO,
            'events': {'best_updated': False, 'goal_completed': None},
        }
    return _payload(row)


def protect(user_id: UUID) -> dict:
    """보석을 차감하고 위기 콤보를 복원한다.

    Raises:
        LookupError:  콤보 행 없음
        ValueError:   AT_RISK 상태 아님
        PermissionError: 보석 부족
    """
    # 락 순서 고정: user → user_combo
    user = (
        db.session.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .first()
    )
    row = (
        db.session.query(UserCombo)
        .filter(UserCombo.user_id == user_id)
        .with_for_update()
        .first()
    )
    try:
        if user is None or row is None:
            raise LookupError('콤보 정보가 없습니다.')
        if row.status != STATUS_AT_RISK or not row.at_risk_combo:
            raise ValueError('보호할 콤보가 없습니다.')
        if user.gem_cnt < PROTECT_COST:
            raise PermissionError('보석이 부족합니다.')

        user.gem_cnt -= PROTECT_COST
        db.session.flush()
        register_gem_log(
            user_id=user_id,
            amount=-PROTECT_COST,
            reason=GemReason.COMBO_PROTECT,
            description=f'콤보 {row.at_risk_combo} 보호',
            source_type='combo',
            source_id=None,
            balance_after=user.gem_cnt,
        )
        row.current_combo = row.at_risk_combo
        row.status = STATUS_ACTIVE
        row.at_risk_combo = None
        row.at_risk_at = None

        payload = _payload(row)
        payload['gem_cnt'] = user.gem_cnt
        db.session.commit()
        return payload
    except Exception:
        db.session.rollback()
        raise


def forfeit(user_id: UUID) -> dict:
    """위기 콤보를 포기 확정한다 (0 유지)."""
    row = _get_or_create_locked(user_id)
    row.status = STATUS_ACTIVE
    row.at_risk_combo = None
    row.at_risk_at = None
    payload = _payload(row)
    db.session.commit()
    return payload
