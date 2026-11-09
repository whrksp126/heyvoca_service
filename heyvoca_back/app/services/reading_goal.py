"""독서왕 업적 — 보유한 서점 단어장 수(누적)로 진행을 맞춘다.

왜 `update_user_goal('독서왕')`(+1 증가형)을 쓰지 않나
  - 그 함수는 레벨마다 진행값을 0 부터 다시 센다. 독서왕 목표는 '서점 단어장 구매 3개 달성'처럼
    **누적** 문구라, +1 증가형이면 2단계에 실제로는 4개가 필요해진다.
  - 서점 구매 경로(`POST /voca_books`)에 독서왕이 빠져 있던 탓에 기존 사용자의 진행이 0 이다.
    소급(scripts/backfill_reading_goal.py)과 실시간 경로가 **같은 함수**를 써야 둘이 어긋나지 않고
    여러 번 돌려도 같은 결과(멱등)가 된다.
  → 암기왕(`services/game/combo._sync_combo_goal`)과 같은 '도달값 동기화' 방식.

진행값 = 사용자가 지금 가진 서점 단어장의 서로 다른 bookstore_id 수(언어 무관).
  - 단어장 삭제는 hard delete 라 이력이 없다. 지웠다고 이미 받은 레벨을 되돌리지는 않는다
    (진행값은 내려가지 않는다 — max 로만 갱신).
  - 같은 서점 단어장을 두 번 받아도 한 번으로 센다(같은 책 반복 구매로 업적을 올리지 못하게).

호출 계약: `begin_user_tx(user_id)` 로 연 트랜잭션 안(User 잠금이 첫 문장)에서 부른다.
**커밋하지 않는다** — 호출부가 마지막에 한 번 커밋한다. 보석은 `change_gem` 단일 경로.
"""

import datetime as dt
from typing import List
from uuid import UUID

from sqlalchemy import func

from app import db
from app.models.models import GemReason, Goals, GoalType, UserGoals, UserVocaBook
from app.utils.db_lock import require_user_tx
from app.utils.gem import change_gem

GOAL_TYPE_NAME = '독서왕'


def count_owned_bookstore_books(user_id: UUID) -> int:
    return int(
        db.session.query(func.count(func.distinct(UserVocaBook.bookstore_id)))
        .filter(UserVocaBook.user_id == user_id, UserVocaBook.bookstore_id.isnot(None))
        .scalar() or 0
    )


def sync_reading_goal(user_id: UUID, owned: int = None) -> List[dict]:
    """독서왕 진행을 `owned`(기본: 현재 보유 수)에 맞추고, 이번 호출로 완료된 레벨 목록을 돌려준다.

    반환 항목: {'level', 'goal', 'reward', 'badge_img', 'completed_at'(utc datetime)}.
    완료 처리·다음 레벨 행 생성·보상 지급은 `update_user_goal` 과 같은 흐름이다.
    """
    require_user_tx(user_id)
    if owned is None:
        owned = count_owned_bookstore_books(user_id)

    goal_type = db.session.query(GoalType).filter(GoalType.type == GOAL_TYPE_NAME).first()
    if goal_type is None:
        return []
    goals = (db.session.query(Goals).filter(Goals.type_id == goal_type.id)
             .order_by(Goals.level).all())
    if not goals:
        return []
    goal_ids = [gl.id for gl in goals]
    rows = {ug.goal_id: ug for ug in
            db.session.query(UserGoals)
            .filter(UserGoals.user_id == user_id, UserGoals.goal_id.in_(goal_ids)).all()}

    completed = []
    now = dt.datetime.utcnow()
    for goal in goals:
        ug = rows.get(goal.id)
        if ug is not None and ug.is_completed:
            continue
        if ug is None:
            ug = UserGoals(user_id=user_id, goal_id=goal.id, current_value=0,
                           is_completed=False, completed_at=None)
            db.session.add(ug)
            rows[goal.id] = ug
        new_value = max(int(ug.current_value or 0), min(owned, goal.goal))
        ug.current_value = new_value
        if new_value < goal.goal:
            # 아직 못 미친 첫 레벨이 '진행 중' 행 — 그 다음 레벨 행은 만들지 않는다.
            break
        ug.is_completed = True
        ug.completed_at = now
        if goal.reward_count and goal.reward_count > 0:
            change_gem(user_id, goal.reward_count, GemReason.ACHIEVEMENT,
                       f'업적 완료: {GOAL_TYPE_NAME} 레벨 {goal.level}',
                       source_type='achievement')
        completed.append({'level': goal.level, 'goal': goal.goal, 'reward': goal.reward_count,
                          'badge_img': goal.badge_img, 'completed_at': now})
    db.session.flush()
    return completed


def goals_payload(completed: List[dict]) -> List[dict]:
    """레거시 `/user_voca_book/create` 응답의 goals 배열과 같은 모양(KST 시각)."""
    return [{
        'name': GOAL_TYPE_NAME,
        'type': GOAL_TYPE_NAME,
        'level': c['level'],
        'badge_img': c['badge_img'],
        'completed_at': c['completed_at'] + dt.timedelta(hours=9),
    } for c in completed]
