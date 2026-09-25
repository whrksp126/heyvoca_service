"""사용자 단위 행 잠금 순서 + MySQL 교착(1213) 재시도.

전역 잠금 순서
--------------
    User → UserStreak / UserCombo → UserVocaGame → UserFarmItem → UserVoca·CheckIn·기타

한 트랜잭션에서 **한 사용자의 행을 둘 이상 잠그거나 바꾸는** 게임/재화 경로는 시작하자마자
`lock_user(user_id)` 로 User 행을 먼저 잡는다. 사실상 사용자 단위 뮤텍스다.

User 를 맨 앞에 두는 이유
  1. 보석(User.gem_cnt)은 거의 모든 보상·구매 경로의 마지막에 붙는다. 그래서 "무엇을 먼저
     잡든 결국 User 를 잡는" 경로가 많고, 그 순서가 경로마다 달랐다(상점: User → 아이템,
     정답 기록: 연속 기록 → 아이템 → User).
  2. 게임 테이블은 거의 전부 `user.id` 에 FK 가 있다. InnoDB 는 자식 행을 INSERT 할 때
     부모(User) 행에 **공유 잠금**을 건다. 즉 원장·이벤트 로그 한 줄만 써도 User 를 건드린다.
     User 를 뒤에 잡는 경로는 거의 항상 "다른 행 X → User S" 순서가 되어, User 를 먼저
     잡는 상점 구매와 엇갈린다. 공유 잠금 두 개가 서로 배타 잠금으로 올리려다 막히는
     교착(S→X 업그레이드)도 같은 뿌리다.
  3. 없는 행을 `SELECT ... FOR UPDATE` 한 뒤 INSERT 하는 경로(아이템·연속 기록·게임 행 첫 생성)는
     갭 잠금끼리 교착이 난다. 같은 사용자 안에서는 User 를 먼저 잡으면 한 줄로 서서 사라진다.

성능: User PK 한 행의 배타 잠금이다. 막히는 건 **같은 사용자**의 동시 게임 트랜잭션뿐이고,
한 사용자는 답안을 순서대로 보내므로 실제 대기는 거의 없다. 다른 사용자끼리는 서로 막지 않는다.

재시도: 사용자 단위 직렬화로 같은 사용자 안의 교착은 없어지지만, **서로 다른 사용자**의 갭 잠금
(인접한 키에 동시에 첫 행을 INSERT)은 여전히 1213 을 낼 수 있다. 그래서 커밋을 한 번만 하는
(= 롤백하면 흔적이 전부 사라지는) 공개 함수에 한해 `retry_on_deadlock` 을 건다.

스냅샷 규칙 — `begin_user_tx`
-----------------------------
MySQL 기본 격리수준(REPEATABLE READ)은 트랜잭션의 **첫 일반 SELECT** 시점 스냅샷을 끝까지 쓴다.
요청 진입부(`jwt_required` 의 학습 언어 조회 등)에서 이미 일반 SELECT 가 나가 있으면, 그 뒤에
User 를 잠가도 이어지는 일반 SELECT(오늘 CheckIn·진행 중 목표·중복 로그 확인 등)는 잠금 **이전**
스냅샷을 본다. 앞선 잠금 보유자가 커밋한 행이 안 보여 같은 보상을 두 번 주거나, 이미 있는 행을
다시 INSERT 해 1062 로 실패한다.

그래서 한 사용자의 행을 판단·갱신하는 쓰기 트랜잭션은 `begin_user_tx(user_id)` 로 연다:
  1. 세션에 커밋 안 된 변경이 없는지 확인(있으면 RuntimeError — 롤백이 그 변경을 지우기 때문)
  2. 롤백으로 진입부 스냅샷을 버린다(트랜잭션이 없으면 아무 일도 안 한다 — 왕복 없음)
  3. **새 트랜잭션의 첫 문장**으로 User 행을 잠근다
이후의 일반 SELECT 는 잠금을 얻은 **뒤**에 스냅샷을 잡는다. 같은 사용자의 행을 바꾸는 모든 쓰기
경로가 User 를 먼저 잠그므로, 그 스냅샷은 "앞선 잠금 보유자가 커밋한 것까지" 전부 담는다.
"""

import functools
import logging
import random
import time

from sqlalchemy import event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app import db

MYSQL_DEADLOCK = 1213

_log = logging.getLogger(__name__)

# session.info 키 — 이 트랜잭션에서 flush/대량 UPDATE·DELETE 로 DB 에 쓴 적이 있는가 /
# begin_user_tx 로 연 트랜잭션이면 잠근 사용자 id 집합.
_WROTE = '_heyvoca_tx_wrote'
_USER_TX = '_heyvoca_user_tx'


@event.listens_for(Session, 'after_flush')
def _mark_flush(session, flush_context):
    session.info[_WROTE] = True


@event.listens_for(Session, 'after_bulk_update')
def _mark_bulk_update(update_context):
    update_context.session.info[_WROTE] = True


@event.listens_for(Session, 'after_bulk_delete')
def _mark_bulk_delete(delete_context):
    delete_context.session.info[_WROTE] = True


@event.listens_for(Session, 'after_transaction_end')
def _clear_marks(session, transaction):
    # 가장 바깥 트랜잭션이 끝날 때(커밋·롤백)만 지운다. SAVEPOINT 종료는 무시.
    if transaction.parent is None:
        session.info.pop(_WROTE, None)
        session.info.pop(_USER_TX, None)


def has_pending_writes(session=None) -> bool:
    """커밋 안 된 변경(flush 전 객체 변경 + 이미 flush/대량 실행한 쓰기)이 있는가."""
    s = session or db.session()
    return bool(s.new or s.dirty or s.deleted or s.info.get(_WROTE))


def begin_user_tx(*user_ids) -> None:
    """새 트랜잭션을 열고 **첫 문장으로** 주어진 사용자들의 User 행을 잠근다(여럿이면 id 오름차순).

    Raises:
        RuntimeError — 세션에 커밋 안 된 변경이 있음(프로그래밍 오류. 롤백하면 그 변경이 사라진다)
    """
    s = db.session()
    if has_pending_writes(s):
        raise RuntimeError('begin_user_tx: 커밋 안 된 변경이 있는 세션에서 새 사용자 트랜잭션을 열 수 없습니다.')
    db.session.rollback()
    ids = sorted({u for u in user_ids if u is not None}, key=lambda u: u.bytes)
    for uid in ids:
        lock_user(uid)
    s.info[_USER_TX] = set(ids)


def in_user_tx(user_id) -> bool:
    """지금 트랜잭션이 `begin_user_tx(user_id, ...)` 로 열렸는가(= 일반 SELECT 가 최신인가)."""
    return user_id in (db.session().info.get(_USER_TX) or ())


def require_user_tx(user_id) -> None:
    """이 트랜잭션이 `begin_user_tx(user_id)` 로 열렸는지 확인한다(아니면 RuntimeError).

    일반 SELECT 로 판정한 뒤 갱신하는 헬퍼(업적 진행 등)가 옛 스냅샷을 보지 않도록 호출 계약을
    강제한다. 잠금만 뒤늦게 거는 것으로는 스냅샷이 바뀌지 않으므로 여기서 대신 잠그지 않는다.
    """
    if not in_user_tx(user_id):
        raise RuntimeError('require_user_tx: begin_user_tx 로 연 트랜잭션 안에서만 부를 수 있습니다.')


def lock_row(model, *criteria, populate=True):
    """행 하나를 `SELECT ... FOR UPDATE` 로 잠그고 최신값으로 갱신된 엔티티를 돌려준다(없으면 None).

    populate_existing — 같은 트랜잭션에서 잠금 없이 먼저 읽어 둔 인스턴스가 identity map 에 있으면
    잠금을 걸어도 옛 값이 그대로 돌아온다. 잠근 뒤의 값으로 덮는다(쿼리 전 autoflush 가 먼저 돈다).
    """
    q = db.session.query(model).filter(*criteria).with_for_update()
    if populate:
        q = q.populate_existing()
    return q.first()


def lock_user(user_id) -> bool:
    """User 행을 `SELECT ... FOR UPDATE` 로 잠근다. 행이 있으면 True.

    엔티티가 아니라 id 컬럼만 읽는다 — 세션에 이미 올라온 User 인스턴스를 건드리지 않고
    잠금만 건다. 같은 트랜잭션에서 여러 번 불러도 된다(이미 가진 잠금이라 바로 돌아온다).
    """
    from app.models.models import User

    row = db.session.query(User.id).filter(User.id == user_id).with_for_update().first()
    return row is not None


def is_deadlock(exc) -> bool:
    orig = getattr(exc, 'orig', None)
    args = getattr(orig, 'args', None) or ()
    return bool(args) and args[0] == MYSQL_DEADLOCK


def retry_on_deadlock(fn=None, *, attempts: int = 3):
    """MySQL 1213(교착)일 때만 롤백 후 다시 부른다. 다른 예외는 그대로 올린다.

    **붙여도 되는 함수의 조건**: (1) 호출 시점에 세션에 커밋 안 된 작업이 없고,
    (2) 함수 안에서 커밋을 마지막에 한 번만 한다(중간 커밋이 있으면 앞부분이 두 번 적용된다),
    (3) DB 밖의 부수효과(외부 API·캐시 쓰기)가 없다. 교착이 나면 InnoDB 가 트랜잭션 전체를
    되돌리므로, 이 조건이면 다시 부르는 것은 처음 부르는 것과 같다.

    1205(잠금 대기 시간 초과)는 재시도하지 않는다 — 이미 수십 초를 기다린 뒤라 또 기다리면
    요청이 끝나지 않는다.
    """
    def decorate(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    db.session.rollback()
                    if not is_deadlock(e) or attempt >= attempts:
                        raise
                    _log.warning('교착(1213) 재시도 %s/%s: %s', attempt, attempts - 1,
                                 func.__qualname__)
                    time.sleep(random.uniform(0.01, 0.05) * attempt)
        return wrapper

    return decorate(fn) if fn is not None else decorate
