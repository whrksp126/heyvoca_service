"""행 잠금 순서(교착) 회귀 테스트 — 실제 로컬 MySQL 에서 두 스레드로 돌린다.

전역 잠금 순서: **User → UserStreak / UserCombo → UserVocaGame → UserFarmItem → CheckIn·기타**.
여러 행을 건드리는 게임 트랜잭션은 시작하자마자 User 행을 잠근다(사용자 단위 직렬화).
`app/utils/db_lock.py` 머리말 참고.

재현 시나리오 (수정 전에는 둘 다 1213 Deadlock 이 났다)
  1. 정답 기록(주간 보호권 지급 → 보호권 아이템 행, 이어서 마일스톤 보석 → User 행)
     vs 상점 보호권 구매(User 행 → 보호권 아이템 행)
  2. 정답 기록(오늘 CheckIn 행 → 마일스톤 보석 User 행)
     vs 세션 집계(`/user_study_history` 와 같은 순서: User 행 → 오늘 CheckIn 행)

두 스레드가 확실히 엇갈리도록, 정답 기록이 **마일스톤 보석을 주기 직전**에 멈춰
상대 스레드가 먼저 자기 첫 행을 잡게 한다. 재시도에 가려지지 않도록 데코레이터를
벗긴 본체(`__wrapped__`)를 부른다 — 교착이 한 번이라도 나면 그대로 실패한다.

    docker exec heyvoca_back_local python3 -m pytest tests/test_lock_order.py -q
"""

import datetime as dt
import threading
import time
import uuid

import pytest

T = dt.date(2026, 9, 25)
D = dt.timedelta(days=1)
NOW = dt.datetime(2026, 9, 25, 3, 0, 0)   # KST 정오
GATE_SLEEP = 0.8                          # 상대 스레드가 첫 잠금을 잡고 대기에 들어갈 시간


@pytest.fixture(scope='module')
def app():
    try:
        from app import create_app, db
        from app.models.models import User
        _app = create_app()
        _app.config['TESTING'] = True
        with _app.app_context():
            db.session.query(User.id).first()
    except Exception as e:
        pytest.skip('로컬 DB 에 연결할 수 없어 건너뜀: {}'.format(e))
    return _app


@pytest.fixture
def uid(app):
    from app import db
    from app.models.models import (CheckIn, FarmEventLog, GemLog, User, UserFarmItem,
                                   UserFarmItemLog, UserFarmSetting, UserStreak)
    with app.app_context():
        code = uuid.uuid4().hex[:12]
        user = User(level_id=None, email='lock-test-{}@test.local'.format(code), google_id=None,
                    username=None, name='locktest', phone=None, last_logged_at=None,
                    refresh_token=None, code=code, book_cnt=0, gem_cnt=100, set_goal_cnt=0)
        db.session.add(user)
        db.session.commit()
        user_id = user.id
    yield user_id
    with app.app_context():
        for model in (FarmEventLog, UserFarmItemLog, UserFarmItem, GemLog, CheckIn,
                      UserStreak, UserFarmSetting):
            db.session.query(model).filter(model.user_id == user_id).delete(
                synchronize_session=False)
        db.session.query(User).filter(User.id == user_id).delete(synchronize_session=False)
        db.session.commit()


def _setup(app, user_id, weekly=True):
    """어제까지 6일 연속 + 오늘 정답 5개(자격 미표시) → 이번 정답으로 7일 마일스톤(보석)이 걸린다.
    주간 보호권은 아직 안 받은 주로 둬서 정답 기록이 보호권 아이템 행을 먼저 잡게 한다."""
    from app import db
    from app.models.models import CheckIn, FarmItem, UserFarmItem, UserStreak
    with app.app_context():
        # 보호권 아이템 행을 미리 만들어 둔다. 없으면 첫 지급이 INSERT 가 되고, 그 FK 검사가
        # User 행에 공유 잠금을 걸어 우연히 순서가 맞아 버린다(교착이 재현되지 않는다).
        item = UserFarmItem(user_id=user_id, item_type=FarmItem.SHIELD, qty=0)
        item.total_earned = 0
        db.session.add(item)
        for i in range(1, 7):
            c = CheckIn(user_id=user_id, attendence_date=T - D * i, today_study_complete=True)
            c.correct_word_cnt = 5
            c.streak_qualified = True
            db.session.add(c)
        today = CheckIn(user_id=user_id, attendence_date=T, today_study_complete=True)
        today.correct_word_cnt = 5   # 이번 호출이 '5개째 정답'이 되게 한다
        db.session.add(today)
        st = UserStreak(user_id=user_id, current_streak=6, best_streak=6,
                        last_qualified_day=T - D)
        st.max_milestone_awarded = 3
        # weekly=False 면 이번 주 보호권을 이미 받은 것으로 둔다(아이템 행을 안 건드림)
        st.shield_granted_week = None if weekly else dt.date(2099, 1, 5)
        db.session.add(st)
        db.session.commit()


def _unwrap(fn):
    return getattr(fn, '__wrapped__', fn)


def _run_pair(app, first, second, gate='gem'):
    """first 가 게이트에서 멈춘 사이 second 를 돌린다. 각 스레드의 예외를 모은다.

    gate='item' — 첫 아이템 행 잠금 **직후**(아이템 행 X 를 쥔 채, 원장 INSERT 전)
    gate='gem'  — 마일스톤 보석 지급 **직전**(오늘 CheckIn 행을 갱신한 뒤)
    """
    from app.services.game.farm_v2 import inventory

    errors = {}
    at_gate = threading.Event()
    name = '_row_for_update' if gate == 'item' else 'grant_gem'
    original = getattr(inventory, name)

    def gated(*args, **kwargs):
        if gate == 'gem' and threading.current_thread().name == 'first' and not at_gate.is_set():
            at_gate.set()
            time.sleep(GATE_SLEEP)
        out = original(*args, **kwargs)
        if gate == 'item' and threading.current_thread().name == 'first' and not at_gate.is_set():
            at_gate.set()
            time.sleep(GATE_SLEEP)
        return out

    def runner(name, fn):
        with app.app_context():
            from app import db
            try:
                fn()
            except Exception as e:   # noqa: BLE001 — 스레드 예외를 본 스레드로 옮긴다
                errors[name] = e
                db.session.rollback()
            finally:
                db.session.remove()

    setattr(inventory, name, gated)
    try:
        t1 = threading.Thread(target=runner, args=('first', first), name='first')
        t1.start()
        assert at_gate.wait(10), '정답 기록이 게이트까지 가지 못함'
        t2 = threading.Thread(target=runner, args=('second', second), name='second')
        t2.start()
        t1.join(60)
        t2.join(60)
    finally:
        setattr(inventory, name, original)
    return errors


def _is_deadlock(exc) -> bool:
    orig = getattr(exc, 'orig', None)
    args = getattr(orig, 'args', None) or ()
    return bool(args) and args[0] == 1213


def _final(app, user_id):
    from app import db
    from app.models.models import FarmItem, GemLog, User, UserStreak
    from app.services.game.farm_v2 import inventory
    with app.app_context():
        gem = db.session.query(User.gem_cnt).filter(User.id == user_id).scalar()
        st = db.session.query(UserStreak).filter(UserStreak.user_id == user_id).first()
        shield = inventory.get_qty(user_id, FarmItem.SHIELD)
        audit = inventory.audit(user_id, FarmItem.SHIELD)
        logs = db.session.query(GemLog.amount).filter(GemLog.user_id == user_id).all()
        return {'gem': gem, 'streak': st.current_streak, 'milestone': st.max_milestone_awarded,
                'shield': shield, 'audit_ok': audit['matches'],
                'gem_log_sum': sum(a for (a,) in logs)}


def test_record_milestone_vs_shop_purchase(app, uid):
    from app.services.game.farm_v2 import shop, streak_v2
    _setup(app, uid)

    record = _unwrap(streak_v2.record_correct_word)
    purchase = _unwrap(shop.purchase)
    errors = _run_pair(app,
                       lambda: record(uid, 999999, now=NOW),
                       lambda: purchase(uid, 'shield_1', 1),
                       gate='item')

    deadlocks = [k for k, e in errors.items() if _is_deadlock(e)]
    assert not deadlocks, '교착 발생: {}'.format(errors)
    assert not errors, errors

    f = _final(app, uid)
    assert f['streak'] == 7 and f['milestone'] == 7
    assert f['gem'] == 100 + 3 - 10                # 7일 보상 +3, 보호권 구매 -10
    assert f['gem_log_sum'] == 3 - 10              # 원장과 잔액이 같이 움직였다
    assert f['shield'] == 1 + 1 and f['audit_ok']  # 주간 1 + 구매 1


def test_record_milestone_vs_session_summary_order(app, uid):
    """`/user_study_history` 와 같은 순서(User 갱신 → 오늘 CheckIn 갱신)로 도는 트랜잭션."""
    from app import db
    from app.models.models import CheckIn, User
    from app.services.game.farm_v2 import streak_v2
    _setup(app, uid, weekly=False)

    def summary_like():
        user = db.session.query(User).filter(User.id == uid).first()
        user.xp = (user.xp or 0) + 5
        db.session.flush()                         # 라우트에서는 다음 조회의 autoflush
        checkin = (db.session.query(CheckIn)
                   .filter(CheckIn.user_id == uid, CheckIn.attendence_date == T).first())
        checkin.attend_rewarded = True
        db.session.flush()
        db.session.commit()

    record = _unwrap(streak_v2.record_correct_word)
    errors = _run_pair(app, lambda: record(uid, 999999, now=NOW), summary_like, gate='gem')

    deadlocks = [k for k, e in errors.items() if _is_deadlock(e)]
    assert not deadlocks, '교착 발생: {}'.format(errors)
    assert not errors, errors
    f = _final(app, uid)
    assert f['streak'] == 7 and f['gem'] == 100 + 3


def test_concurrent_stress(app, uid):
    """게이트 없이 정답 기록·조회 정산·구매를 여러 스레드로 섞어 돌린다.
    재시도에 기대지 않는지 보려고 여기서도 본체(`__wrapped__`)를 부른다."""
    from app.services.game.farm_v2 import shop, streak_v2
    _setup(app, uid)
    purchase = _unwrap(shop.purchase)
    record = _unwrap(streak_v2.record_correct_word)

    errors = []

    def worker(i):
        with app.app_context():
            from app import db
            try:
                for _ in range(4):
                    if i % 3 == 0:
                        purchase(uid, 'shield_1', 1)
                    elif i % 3 == 1:
                        record(uid, 999999, now=NOW)
                    else:
                        streak_v2.get_state(uid, now=NOW)
            except Exception as e:   # noqa: BLE001
                errors.append(e)
                db.session.rollback()
            finally:
                db.session.remove()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(120)

    assert not errors, errors
    f = _final(app, uid)
    # 구매 스레드 2개 × 4회 = 8회 × 10 보석, 마일스톤은 딱 한 번
    assert f['milestone'] == 7 and f['streak'] == 7
    assert f['gem'] == 100 + 3 - 80 and f['gem_log_sum'] == 3 - 80
    assert f['shield'] == 1 + 8 and f['audit_ok']


def test_retry_on_deadlock_only_1213(app):
    """1213 만 다시 부르고, 그 밖의 OperationalError·예외는 그대로 올린다."""
    from sqlalchemy.exc import OperationalError
    from app.utils.db_lock import retry_on_deadlock

    def op_error(code):
        return OperationalError('SELECT 1', {}, Exception(code, 'x'))

    calls = {'n': 0}

    @retry_on_deadlock
    def flaky():
        calls['n'] += 1
        if calls['n'] < 3:
            raise op_error(1213)
        return 'ok'

    @retry_on_deadlock
    def timeout():
        calls['t'] = calls.get('t', 0) + 1
        raise op_error(1205)

    @retry_on_deadlock(attempts=2)
    def always():
        raise op_error(1213)

    with app.app_context():
        assert flaky() == 'ok' and calls['n'] == 3
        with pytest.raises(OperationalError):
            timeout()
        assert calls['t'] == 1
        with pytest.raises(OperationalError):
            always()
