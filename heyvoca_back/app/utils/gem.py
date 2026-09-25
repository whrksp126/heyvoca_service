"""보석(User.gem_cnt) 증감의 단일 진입점 — 잠금 + 잔액 검사 + 원장(GemLog)을 한 번에.

원칙
----
- **읽고 더하기 금지.** 잠그지 않고 읽은 잔액에 더해 쓰면, 같은 사용자의 다른 트랜잭션이
  사이에 바꾼 값이 사라진다(lost update). 여기서는 User 행을 `SELECT ... FOR UPDATE` 로
  잡은 뒤(전역 잠금 순서의 첫 번째, `app/utils/db_lock.py`) 증감한다.
- **차감의 잔액 검사도 같은 잠금 안에서.** 잠근 뒤 읽은 잔액으로 판정하므로 음수가 되지 않는다.
- **커밋하지 않는다.** 보석 변경과 원장, 그리고 호출부의 나머지 변경(아이템 지급·목표 완료 등)이
  한 트랜잭션으로 묶이도록 커밋은 항상 호출부가 마지막에 한 번 한다. 그래야 `retry_on_deadlock`
  을 걸 수 있다(중간 커밋이 있으면 재시도가 앞부분을 두 번 적용한다).

`UPDATE user SET gem_cnt = gem_cnt + :d` 표현식 대신 행 잠금을 택한 이유: 원장의
`balance_after` 를 정확히 남기려면 결국 갱신 직후의 잔액을 읽어야 하고, 대부분의 경로가
보석 외에 같은 사용자의 다른 행(목표·아이템·체크인)도 바꾼다. 그 경우 어차피 User 를 먼저
잡아야 전역 순서가 맞으므로 한 가지 방식으로 통일했다.
"""

from typing import Optional, Tuple
from uuid import UUID

from app import db


class InsufficientGem(Exception):
    """잔액 부족. `balance` 는 잠근 뒤 읽은 현재 잔액, `need` 는 필요한 양."""

    def __init__(self, balance: int, need: int):
        super().__init__('보석이 부족합니다. (보유 {0}, 필요 {1})'.format(balance, need))
        self.balance = balance
        self.need = need

    @property
    def shortage(self) -> int:
        return max(0, self.need - self.balance)


def lock_user_row(user_id: UUID):
    """User 행을 FOR UPDATE 로 잠그고 **최신값으로 갱신된** 엔티티를 돌려준다(없으면 None).

    populate_existing — 같은 세션에 잠금 없이 먼저 읽어 둔 User 인스턴스가 있으면(예: 요청
    앞단의 조회) 잠금을 걸어도 identity map 의 옛 잔액이 그대로 돌아온다. 잠근 뒤 값으로 덮는다.
    쿼리 전 autoflush 가 먼저 돌므로 아직 flush 안 된 변경이 사라지지는 않는다.
    """
    from app.models.models import User

    return (db.session.query(User).filter(User.id == user_id)
            .with_for_update().populate_existing().first())


def start_user_tx(user_id: UUID):
    """**새 트랜잭션**을 열고 첫 문장으로 User 행을 잠근다. 잠근 User 엔티티를 돌려준다.

    요청 진입부(인증·사전 언어 확정)에서 이미 평범한 SELECT 가 한 번 나가 있다. MySQL 기본
    격리수준(REPEATABLE READ)은 **첫 일반 SELECT 시점**의 스냅샷을 트랜잭션 끝까지 쓰므로,
    그 트랜잭션 안에서 User 를 잠가도 이후의 일반 SELECT(오늘 CheckIn·진행 중 목표·중복
    영수증 검사 등)는 잠금 **이전** 스냅샷을 본다 — 앞선 잠금 보유자가 커밋한 행이 안 보여
    같은 목표를 두 번 올리거나 같은 영수증을 두 번 처리할 수 있다.

    여기서는 먼저 롤백으로 그 스냅샷을 버린다. 새 트랜잭션의 첫 문장이 잠금 읽기이므로 이후
    일반 SELECT 의 스냅샷은 잠금을 얻은 **뒤**에 잡힌다. 호출 시점에 flush/커밋 안 된 변경이
    없어야 한다(읽기만 했던 요청 진입부 전용) — 있으면 RuntimeError(`db_lock.begin_user_tx`).
    """
    from app.utils.db_lock import begin_user_tx

    begin_user_tx(user_id)
    return lock_user_row(user_id)


def lock_users_ordered(*user_ids):
    """여러 User 행을 **id 오름차순**으로 잠근다(교착 방지). {id: User} 를 돌려준다.

    두 트랜잭션이 같은 두 사용자를 반대 순서로 잠그면 교착이 난다(초대 보상 양방향 등).
    순서를 id 로 고정하면 한쪽이 다른 쪽을 기다릴 뿐 엇갈리지 않는다.
    """
    out = {}
    for uid in sorted({u for u in user_ids if u is not None}, key=lambda u: u.bytes):
        out[uid] = lock_user_row(uid)
    return out


def add_gem_log(user_id, amount, reason, description,
                source_type=None, source_id=None, balance_after=0):
    """GemLog 한 줄 추가 — 커밋하지 않는다(flush 만)."""
    from app.models.models import GemLog

    db.session.add(GemLog(
        user_id=user_id,
        amount=amount,
        reason=getattr(reason, 'value', reason),
        description=description,
        source_type=source_type,
        source_id=source_id,
        balance_after=balance_after,
    ))
    db.session.flush()


def change_gem(user_id: UUID, delta: int, reason, description: str,
               source_type: Optional[str] = None, source_id=None,
               user=None) -> Tuple[object, int]:
    """User 를 잠근 뒤 보석을 delta 만큼 바꾸고 원장을 남긴다. **커밋하지 않는다.**

    Args:
        delta: 양수=지급, 음수=차감. 0 이면 아무것도 하지 않는다(원장도 안 남김).
        user: 호출부가 이미 `lock_user_row` 로 잠가 받은 인스턴스(있으면 다시 조회하지 않음).

    Returns:
        (user, 변경 후 잔액)

    Raises:
        LookupError: 사용자 없음
        InsufficientGem: 차감 후 음수가 되는 경우(아무것도 바꾸지 않음)
    """
    delta = int(delta or 0)
    if user is None:
        user = lock_user_row(user_id)
    if user is None:
        raise LookupError('사용자를 찾을 수 없습니다.')
    balance = int(user.gem_cnt or 0)
    if delta == 0:
        return user, balance
    if balance + delta < 0:
        raise InsufficientGem(balance, -delta)

    user.gem_cnt = balance + delta
    add_gem_log(user_id, delta, reason, description,
                source_type=source_type, source_id=source_id,
                balance_after=user.gem_cnt)
    return user, user.gem_cnt
