"""농장 아이템 보유량 + 원장 (기획 8).

보유량과 원장을 **항상 같이** 움직인다. 어느 한쪽만 바꾸는 경로를 만들지 않기 위해
`grant` / `spend` 두 함수로만 접근하고, 모델을 직접 건드리지 않는다.

커밋은 하지 않는다 — 아이템 지급은 늘 다른 상태 변경(성장, 학습 저장)에 딸려 오므로
호출부의 트랜잭션에 얹혀야 한다. 지급만 커밋되고 성장이 롤백되면 재화가 새어 나간다.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import func

from app import db
from app.models.models import FarmItem, FarmItemReason, UserFarmItem, UserFarmItemLog
from app.utils.db_lock import lock_user


def get_counts(user_id: UUID) -> dict:
    """{item_type: qty} — 보유하지 않은 종류는 0 으로 채워 반환한다."""
    rows = (
        db.session.query(UserFarmItem.item_type, UserFarmItem.qty)
        .filter(UserFarmItem.user_id == user_id)
        .all()
    )
    counts = {t: 0 for t in FarmItem.ALL}
    for item_type, qty in rows:
        counts[item_type] = qty or 0
    return counts


def get_qty(user_id: UUID, item_type: str) -> int:
    row = (
        db.session.query(UserFarmItem.qty)
        .filter(UserFarmItem.user_id == user_id, UserFarmItem.item_type == item_type)
        .first()
    )
    return (row[0] if row else 0) or 0


def _row_for_update(user_id: UUID, item_type: str) -> UserFarmItem:
    """행 잠금 후 반환. 없으면 만든다.

    잠그는 이유는 같은 사용자가 두 기기에서 동시에 아이템을 쓸 수 있어서다.
    잠그지 않으면 보유 1개로 두 번 다시 심기가 된다.

    **User 행을 먼저 잠근다**(전역 순서 User → … → 아이템, `app/utils/db_lock.py`).
    원장 INSERT 가 FK 로 User 에 공유 잠금을 거는데, 아이템 행을 쥔 채 그걸 기다리면
    User 를 먼저 잡고 아이템을 기다리는 상점 구매와 교착한다. 호출부가 이미 잡았다면
    같은 잠금이라 바로 돌아온다.
    """
    lock_user(user_id)
    row = (
        db.session.query(UserFarmItem)
        .filter(UserFarmItem.user_id == user_id, UserFarmItem.item_type == item_type)
        .with_for_update()
        .first()
    )
    if row is None:
        row = UserFarmItem(user_id=user_id, item_type=item_type, qty=0)
        row.total_earned = 0
        db.session.add(row)
        db.session.flush()
    return row


def grant(user_id: UUID, item_type: str, amount: int, reason: FarmItemReason,
          description: Optional[str] = None, user_voca_id: Optional[int] = None,
          purchase_id=None) -> int:
    """아이템 지급. 지급 후 잔량을 반환한다. 커밋하지 않는다."""
    amount = int(amount or 0)
    if amount <= 0:
        return get_qty(user_id, item_type)

    row = _row_for_update(user_id, item_type)
    row.qty = (row.qty or 0) + amount
    row.total_earned = (row.total_earned or 0) + amount
    db.session.add(UserFarmItemLog(
        user_id=user_id, item_type=item_type, amount=amount, reason=reason,
        balance_after=row.qty, description=description,
        user_voca_id=user_voca_id, purchase_id=purchase_id,
    ))
    db.session.flush()
    return row.qty


def spend(user_id: UUID, item_type: str, amount: int = 1,
          description: Optional[str] = None, user_voca_id: Optional[int] = None) -> int:
    """아이템 사용. 부족하면 PermissionError. 커밋하지 않는다.

    Raises:
        PermissionError — 보유량 부족
    """
    amount = int(amount or 0)
    if amount <= 0:
        return get_qty(user_id, item_type)

    row = _row_for_update(user_id, item_type)
    if (row.qty or 0) < amount:
        raise PermissionError(f'{ITEM_LABEL.get(item_type, item_type)}이(가) 부족해요.')

    row.qty = row.qty - amount
    row.total_spent = (row.total_spent or 0) + amount
    db.session.add(UserFarmItemLog(
        user_id=user_id, item_type=item_type, amount=-amount, reason=FarmItemReason.SPENT,
        balance_after=row.qty, description=description, user_voca_id=user_voca_id,
    ))
    db.session.flush()
    return row.qty


def audit(user_id: UUID, item_type: str) -> dict:
    """원장 합계와 보유량이 맞는지 확인. 운영 도구용.

    로그의 amount 합이 곧 잔량이어야 한다. 어긋났다면 어느 경로가 보유량만 건드렸다는 뜻이다.
    """
    ledger_sum = (
        db.session.query(func.coalesce(func.sum(UserFarmItemLog.amount), 0))
        .filter(UserFarmItemLog.user_id == user_id, UserFarmItemLog.item_type == item_type)
        .scalar()
    ) or 0
    held = get_qty(user_id, item_type)
    return {'item_type': item_type, 'held': held, 'ledger_sum': int(ledger_sum),
            'matches': int(ledger_sum) == held}


ITEM_LABEL = {
    FarmItem.SHOVEL:   '새심기 삽',
    FarmItem.NUTRIENT: '영양 회복제',
    FarmItem.SHIELD:   '연속 학습 보호권',
}


def grant_gem(user_id: UUID, amount: int, description: str,
              source_type: str = 'user_voca') -> Optional[int]:
    """보석 지급 — **커밋하지 않는** 판.

    예전 `app/routes/common.register_gem_log` 는 내부에서 커밋해, 농장에서 쓰면 보상 하나를
    줄 때마다 트랜잭션이 끊겼다(2026-09 이후 그 함수도 커밋하지 않는다 — 보석 증감의 공용
    진입점은 `app/utils/gem.change_gem`). 여기서는 같은 원장 행을 쓰되 커밋은 호출부에 맡긴다.

    Returns:
        지급 후 잔액. 사용자가 없으면 None.
    """
    from app.models.models import GemLog, GemReason, User

    amount = int(amount or 0)
    if amount <= 0:
        return None
    # populate_existing — 같은 트랜잭션에서 잠금 없이 먼저 읽어 둔 User 인스턴스가 세션에
    # 있으면, 잠금을 걸어도 옛 잔액을 그대로 돌려준다. 잠근 뒤의 최신값으로 덮어쓴다.
    user = (db.session.query(User).filter(User.id == user_id)
            .with_for_update().populate_existing().first())
    if user is None:
        return None

    user.gem_cnt = (user.gem_cnt or 0) + amount
    db.session.add(GemLog(
        user_id=user_id, amount=amount, reason=GemReason.FARM_REWARD.value,
        description=description, source_type=source_type, source_id=None,
        balance_after=user.gem_cnt,
    ))
    db.session.flush()
    return user.gem_cnt
