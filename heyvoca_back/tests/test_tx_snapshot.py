"""스냅샷·잃어버린 갱신·체크-후-삽입 회귀 테스트 — 실제 로컬 MySQL 에서 스레드로 돌린다.

MySQL(REPEATABLE READ)은 트랜잭션의 **첫 일반 SELECT** 시점 스냅샷을 끝까지 쓴다. 잠금을 그 뒤에
걸면, 이어지는 일반 SELECT 는 앞선 잠금 보유자가 커밋한 행을 못 본다. 여기서는 각 쓰기 경로가
`begin_user_tx`(첫 문장 = User 잠금)로 그 창을 닫았는지 본다.

재현 방식: 한 스레드가 '판정에 쓸 조회를 이미 한 뒤'(= 스냅샷이 잡힌 뒤) 게이트에서 멈추고, 그 사이
다른 스레드가 같은 사용자의 행을 바꿔 커밋한다. 수정 전 코드는 옛 스냅샷으로 판정해
이중 지급·덮어쓰기·1062 로 실패한다. 게이트는 운영 코드의 함수를 잠깐 감싸 sleep 을 넣는 식이다.

    docker exec heyvoca_back_local python3 -m pytest tests/test_tx_snapshot.py -q
"""

import datetime as dt
import json
import threading
import time
import uuid

import pytest

GATE = 0.8   # 상대 스레드가 끼어들 시간


# ──────────────────────────────────────────────────────────────
# 공용 픽스처 / 헬퍼
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def app():
    try:
        from app import create_app, db
        from app.models.models import User
        _app = create_app()
        _app.config['TESTING'] = True
        _app.config['RATELIMIT_ENABLED'] = False
        with _app.app_context():
            db.session.query(User.id).first()
    except Exception as e:
        pytest.skip('로컬 DB 에 연결할 수 없어 건너뜀: {}'.format(e))
    try:
        from app import limiter
        limiter.enabled = False
    except Exception:
        pass
    return _app


def _purge(app, user_ids):
    """user_id 를 가진 모든 사용자 DB 행 → 초대 관계 → User 순으로 지운다(FK 순서는 몇 바퀴로 해결)."""
    from app import db
    from app.models.models import InviteMap, User, UserVoca, UserVocaBook, UserVocaBookMap
    ids = [i for i in user_ids if i is not None]
    if not ids:
        return
    with app.app_context():
        book_ids = [r[0] for r in db.session.query(UserVocaBook.id)
                    .filter(UserVocaBook.user_id.in_(ids)).all()]
        if book_ids:
            db.session.query(UserVocaBookMap).filter(
                UserVocaBookMap.user_voca_book_id.in_(book_ids)).delete(synchronize_session=False)
            db.session.commit()
        models = [m.class_ for m in db.Model.registry.mappers
                  if getattr(m.class_, '__bind_key__', None) is None
                  and m.class_ is not User and hasattr(m.class_, 'user_id')]
        pending = list(models)
        for _ in range(6):
            left = []
            for model in pending:
                try:
                    db.session.query(model).filter(model.user_id.in_(ids)).delete(
                        synchronize_session=False)
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                    left.append(model)
            pending = left
            if not pending:
                break
        db.session.query(User).filter(User.id.in_(ids)).update(
            {User.invited_by: None}, synchronize_session=False)
        db.session.query(InviteMap).filter(
            InviteMap.inviter_id.in_(ids) | InviteMap.invitee_id.in_(ids)).delete(
            synchronize_session=False)
        db.session.query(UserVoca).filter(UserVoca.user_id.in_(ids)).delete(
            synchronize_session=False)
        db.session.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
        db.session.commit()


@pytest.fixture
def users(app):
    from app import db
    from app.models.models import User
    made = []

    def make(gem=100, book_cnt=0):
        with app.app_context():
            code = uuid.uuid4().hex[:12]
            user = User(level_id=None, email='tx-test-{}@test.local'.format(code), google_id=None,
                        username=None, name='txtest', phone=None, last_logged_at=None,
                        refresh_token=None, code=code, book_cnt=book_cnt, gem_cnt=gem,
                        set_goal_cnt=0)
            user.invite_code = 'TX' + code[:8].upper()
            db.session.add(user)
            db.session.commit()
            made.append(user.id)
            return user.id

    yield make
    _purge(app, made)


def _auth(user_id):
    from app.utils.jwt_utils import generate_access_token
    return {'Authorization': 'Bearer ' + generate_access_token(user_id)}


def _in_ctx(app, fn):
    """앱 컨텍스트 + 스레드 전용 세션으로 fn 을 돌리고, 결과나 예외를 돌려준다."""
    def run():
        from app import db
        with app.app_context():
            try:
                return fn()
            finally:
                db.session.remove()
    return run


def _run_parallel(jobs):
    """jobs: [(name, callable)] — 동시에 출발. {name: 결과 또는 예외}."""
    barrier = threading.Barrier(len(jobs))
    out = {}

    def run(name, fn):
        barrier.wait()
        try:
            out[name] = fn()
        except Exception as e:   # noqa: BLE001
            out[name] = e

    threads = [threading.Thread(target=run, args=(n, f), name=n) for n, f in jobs]
    for t in threads:
        t.start()
    for t in threads:
        t.join(60)
    return out


def _run_gated(first, second, gate_event, timeout=15):
    """first 를 먼저 돌려 게이트(gate_event)에 닿으면 second 를 돌린다. {'first':…, 'second':…}."""
    out = {}

    def run(name, fn):
        try:
            out[name] = fn()
        except Exception as e:   # noqa: BLE001
            out[name] = e

    t1 = threading.Thread(target=run, args=('first', first), name='first')
    t1.start()
    assert gate_event.wait(timeout), 'first 가 게이트에 닿지 못함'
    t2 = threading.Thread(target=run, args=('second', second), name='second')
    t2.start()
    t1.join(60)
    t2.join(60)
    return out


def _lock_user_fresh(user_id):
    """테스트 쪽 '다른 요청' — 새 트랜잭션을 User 잠금으로 연다(운영 경로와 같은 순서)."""
    from app import db
    from app.utils.db_lock import lock_user
    db.session.rollback()
    lock_user(user_id)


def _fsrs_data(next_review, stability=1.0, reps=1):
    from app.services.fsrs.state import (migrate_v1_to_v2, serialize_user_voca_data,
                                         set_fsrs_state, get_fsrs_state)
    payload = migrate_v1_to_v2({})
    state = dict(get_fsrs_state(payload) or {})
    state.update({'state': 'review', 'stability': stability, 'difficulty': 5.0,
                  'reps': reps, 'lapses': 0, 'scheduled_days': 1,
                  'last_review': (next_review - dt.timedelta(days=1)).isoformat(),
                  'next_review': next_review.isoformat()})
    return serialize_user_voca_data(set_fsrs_state(payload, state))


def _make_word(user_id, word, data=None):
    from app import db
    from app.models.models import UserVoca
    uv = UserVoca(dict_lang='en')
    uv.user_id = user_id
    uv.word = word
    uv.voca_meanings = json.dumps(['뜻'], ensure_ascii=False)
    uv.voca_examples = '[]'
    uv.data = data
    db.session.add(uv)
    db.session.flush()
    return uv


def _make_game(user_voca_id, user_id, **kw):
    from app import db
    from app.models.models import UserVocaGame
    g = UserVocaGame(user_voca_id=user_voca_id, user_id=user_id)
    for k, v in kw.items():
        setattr(g, k, v)
    db.session.add(g)
    db.session.flush()
    return g


# ──────────────────────────────────────────────────────────────
# 0. 헬퍼 계약
# ──────────────────────────────────────────────────────────────

def test_begin_user_tx_refuses_pending_writes(app, users):
    """커밋 안 된 변경이 있으면 롤백으로 지워 버리지 않고 RuntimeError."""
    from app import db
    from app.models.models import User
    from app.utils.db_lock import begin_user_tx, in_user_tx, require_user_tx
    uid = users()
    with app.app_context():
        try:
            u = db.session.query(User).filter(User.id == uid).first()
            u.name = 'dirty'
            with pytest.raises(RuntimeError):
                begin_user_tx(uid)
            db.session.rollback()

            db.session.query(User).filter(User.id == uid).update(
                {User.name: 'bulk'}, synchronize_session=False)
            with pytest.raises(RuntimeError):
                begin_user_tx(uid)
            db.session.rollback()

            db.session.query(User).filter(User.id == uid).first()   # 읽기만 — 허용
            with pytest.raises(RuntimeError):
                require_user_tx(uid)
            begin_user_tx(uid)
            assert in_user_tx(uid)
            require_user_tx(uid)
            db.session.commit()
            assert not in_user_tx(uid)
        finally:
            db.session.remove()


# ──────────────────────────────────────────────────────────────
# 1. 연속 학습 — 정답 기록이 잠금 전 스냅샷으로 오늘 CheckIn 을 못 보고 INSERT(1062)
# ──────────────────────────────────────────────────────────────

def test_record_correct_word_sees_checkin_created_by_session_summary(app, users, monkeypatch):
    """세션 집계(/user_study_history)가 오늘 CheckIn 을 만들고 User 를 쥔 사이 정답 기록이 들어온다.

    수정 전: 정답 기록의 첫 SELECT(시간대 조회)가 잠금 전 스냅샷을 잡아, 세션 집계가 커밋한 CheckIn 을
    못 보고 다시 INSERT → IntegrityError(1062). 수정 후: 첫 문장이 User 잠금이라 커밋된 행을 본다.
    """
    from app.routes import mainpage
    from app.services.game.farm_v2 import localday, streak_v2
    uid = users()
    now = dt.datetime.utcnow()
    today = localday.local_day(now, localday.DEFAULT_TZ)
    monkeypatch.setattr(mainpage, 'logical_today', lambda *a, **k: today)

    gate = threading.Event()
    original = mainpage.get_today_new_done

    def gated(user_id):
        if threading.current_thread().name == 'first' and not gate.is_set():
            out = original(user_id)   # 오늘 CheckIn INSERT 가 autoflush 로 나간 뒤
            gate.set()
            time.sleep(GATE)
            return out
        return original(user_id)

    monkeypatch.setattr(mainpage, 'get_today_new_done', gated)

    def history():
        with app.test_client() as c:
            r = c.post('/mainpage/user_study_history', json={'correct_cnt': 1, 'incorrect_cnt': 0},
                       headers=_auth(uid))
            return r.status_code

    out = _run_gated(history, _in_ctx(app, lambda: streak_v2.record_correct_word(uid, 987654321, now)),
                     gate)
    assert out['first'] == 200, out
    assert not isinstance(out['second'], Exception), out['second']

    from app import db
    from app.models.models import CheckIn
    with app.app_context():
        row = db.session.query(CheckIn).filter(CheckIn.user_id == uid,
                                               CheckIn.attendence_date == today).one()
        assert row.correct_word_cnt >= 1
        assert row.attend_rewarded is True


# ──────────────────────────────────────────────────────────────
# 2. 부패 재계산이 방금 물 준 작물을 옛 값으로 덮어쓰기 (lost update)
# ──────────────────────────────────────────────────────────────

def test_compute_rot_state_does_not_overwrite_fresh_answer(app, users, monkeypatch):
    from app import db
    from app.models.models import HealthState, UserVoca, UserVocaGame, VisualStage
    from app.services.game.farm_v2 import health, watering
    uid = users()
    now = dt.datetime.utcnow()
    with app.app_context():
        uv = _make_word(uid, 'rotcheck', _fsrs_data(now - dt.timedelta(days=60)))
        _make_game(uv.id, uid, visual_stage=VisualStage.SPROUT, highest_stage=VisualStage.SPROUT,
                   health_state=HealthState.THIRSTY)
        uv_id = uv.id
        db.session.commit()
        db.session.remove()

    gate = threading.Event()
    original = health.compute_health

    def gated(*a, **k):
        if threading.current_thread().name == 'first' and not gate.is_set():
            gate.set()
            time.sleep(GATE)
        return original(*a, **k)

    monkeypatch.setattr(health, 'compute_health', gated)

    def water():   # 정답 반영과 같은 순서: User → 게임 행 → 단어 데이터
        _lock_user_fresh(uid)
        g = db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id == uv_id).one()
        g.health_state = HealthState.FRESH
        g.rot_due_at = None
        u = db.session.query(UserVoca).filter(UserVoca.id == uv_id).one()
        u.data = _fsrs_data(now + dt.timedelta(days=10))
        db.session.commit()

    out = _run_gated(_in_ctx(app, lambda: watering.compute_rot_state(uid, now)),
                     _in_ctx(app, water), gate)
    assert not isinstance(out['first'], Exception), out['first']
    assert not isinstance(out['second'], Exception), out['second']
    with app.app_context():
        g = db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id == uv_id).one()
        assert g.health_state == HealthState.FRESH, '옛 스냅샷으로 부패를 덮어씀'


# ──────────────────────────────────────────────────────────────
# 3. 무료 긴급 급수 — 같은 날 두 번 적용
# ──────────────────────────────────────────────────────────────

def test_emergency_water_applies_once_per_day(app, users, monkeypatch):
    from app import db
    from app.models.models import (FarmEvent, FarmEventLog, HealthState, UserFarmSetting,
                                   UserVocaGame, VisualStage)
    from app.services.game.farm_v2 import watering
    uid = users()
    now = dt.datetime.utcnow()
    with app.app_context():
        ids = []
        for w in ('ew-a', 'ew-b'):
            uv = _make_word(uid, w, _fsrs_data(now - dt.timedelta(days=3)))
            _make_game(uv.id, uid, visual_stage=VisualStage.SPROUT,
                       health_state=HealthState.CRITICAL, rot_due_at=now + dt.timedelta(hours=5))
            ids.append(uv.id)
        s = UserFarmSetting(user_id=uid)
        s.daily_review_limit = 1
        db.session.add(s)
        db.session.commit()
        db.session.remove()

    items = [{'user_voca_id': i, 'reason': watering.REASON_CRITICAL} for i in ids]
    seen = set()

    def fake_due(user_id, now_):
        name = threading.current_thread().name
        if name not in seen:
            seen.add(name)
            time.sleep(GATE)   # 두 요청 모두 '오늘 적용 안 함'을 본 뒤 멈춘다
        return list(items)

    monkeypatch.setattr(watering, '_due_items', fake_due)
    out = _run_parallel([
        ('a', _in_ctx(app, lambda: watering.apply_emergency_water(uid, now))),
        ('b', _in_ctx(app, lambda: watering.apply_emergency_water(uid, now))),
    ])
    assert not any(isinstance(v, Exception) for v in out.values()), out
    with app.app_context():
        g = db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id == ids[1]).one()
        n = db.session.query(FarmEventLog).filter(
            FarmEventLog.user_id == uid, FarmEventLog.event == FarmEvent.PROTECTION_APPLIED).count()
        assert n == 1, '하루 1회 규칙 위반 — 적용 {}회'.format(n)
        assert g.protection_days == 1


# ──────────────────────────────────────────────────────────────
# 4. 복귀 미션 — 동시 진입이 미션을 두 개 만든다 (체크-후-삽입, 유니크 불가 조건)
# ──────────────────────────────────────────────────────────────

def test_comeback_mission_created_once(app, users, monkeypatch):
    from app import db
    from app.models.models import CheckIn, UserComebackMission
    from app.services.game.farm_v2 import comeback, query
    uid = users()
    now = dt.datetime.utcnow()
    with app.app_context():
        db.session.add(CheckIn(user_id=uid, attendence_date=(now - dt.timedelta(days=40)).date(),
                               today_study_complete=True))
        db.session.commit()
        db.session.remove()

    original = query.count_rotten

    def slow_count(*a, **k):
        time.sleep(GATE)
        return original(*a, **k)

    monkeypatch.setattr(query, 'count_rotten', slow_count)
    out = _run_parallel([
        ('a', _in_ctx(app, lambda: comeback.check_and_start(uid, now))),
        ('b', _in_ctx(app, lambda: comeback.check_and_start(uid, now))),
    ])
    assert not any(isinstance(v, Exception) for v in out.values()), out
    with app.app_context():
        n = db.session.query(UserComebackMission).filter(
            UserComebackMission.user_id == uid).count()
        assert n == 1, '복귀 미션 {}개'.format(n)


# ──────────────────────────────────────────────────────────────
# 5. 복귀 미션 3일째 — 보상(회복 효과) 이중 적용
# ──────────────────────────────────────────────────────────────

def test_comeback_reward_applied_once(app, users, monkeypatch):
    from app import db
    from app.models.models import (FarmEvent, FarmEventLog, HealthState, UserComebackMission,
                                   UserStudyLog, UserVocaGame, VisualStage)
    from app.services.game.farm_v2 import comeback, localday
    uid = users()
    now = dt.datetime.utcnow()
    today = localday.local_day(now, localday.DEFAULT_TZ)
    with app.app_context():
        uv = _make_word(uid, 'cbword', _fsrs_data(now - dt.timedelta(days=90), stability=5.0))
        _make_game(uv.id, uid, visual_stage=VisualStage.LEAF, health_state=HealthState.ROTTEN,
                   rotten_at=now - dt.timedelta(days=20))
        m = UserComebackMission(user_id=uid, absent_days=40, rotten_snapshot=1,
                                expires_at=now + dt.timedelta(days=4))
        m.started_at = now - dt.timedelta(days=3)
        m.progress_days = 2
        m.last_progress_day = today - dt.timedelta(days=1)
        db.session.add(m)
        sid = uuid.uuid4()
        for i in range(5):
            log = UserStudyLog(user_id=uid, user_voca_id=900000 + i, session_id=sid,
                               test_type='test', question_type='multipleChoice', was_correct=True,
                               q_score=5, time_taken_ms=1000)
            log.created_at = now - dt.timedelta(minutes=1)
            db.session.add(log)
        uv_id = uv.id
        db.session.commit()
        db.session.remove()

    seen = set()
    original = comeback._effective_progress

    def slow(mission, day):
        name = threading.current_thread().name
        if name not in seen:
            seen.add(name)
            time.sleep(GATE)
        return original(mission, day)

    monkeypatch.setattr(comeback, '_effective_progress', slow)
    out = _run_parallel([
        ('a', _in_ctx(app, lambda: comeback.record_day(uid, now))),
        ('b', _in_ctx(app, lambda: comeback.record_day(uid, now))),
    ])
    assert not any(isinstance(v, Exception) for v in out.values()), out
    with app.app_context():
        g = db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id == uv_id).one()
        n = db.session.query(FarmEventLog).filter(
            FarmEventLog.user_id == uid, FarmEventLog.event == FarmEvent.RECOVERED).count()
        m = db.session.query(UserComebackMission).filter(UserComebackMission.user_id == uid).one()
        assert n == 1, '복귀 보상 {}회'.format(n)
        assert g.recovery_count == 1
        assert m.progress_days == 3 and m.status == comeback.STATUS_COMPLETED


# ──────────────────────────────────────────────────────────────
# 6. 진단 확정이 그 사이의 학습 결과(UserVoca.data)를 옛 값으로 덮어쓰기
# ──────────────────────────────────────────────────────────────

def test_complete_diagnosis_keeps_concurrent_fsrs_update(app, users, monkeypatch):
    from app import db
    from app.models.models import HealthState, UserVoca, VisualStage
    from app.services.fsrs.state import get_fsrs_state, parse_user_voca_data
    from app.services.game.farm_v2 import restore
    uid = users()
    now = dt.datetime.utcnow()
    with app.app_context():
        uv = _make_word(uid, 'diagword', _fsrs_data(now - dt.timedelta(days=30), reps=1))
        _make_game(uv.id, uid, visual_stage=VisualStage.LEAF, highest_stage=VisualStage.LEAF,
                   health_state=HealthState.ROTTEN, pending_action=restore.PENDING_REPLANT,
                   pending_started_at=now)
        uv_id = uv.id
        db.session.commit()
        db.session.remove()

    gate = threading.Event()
    # 진단 대상 확인(일반 SELECT) 직후 = 잠금 직전에 멈춘다. 수정 전은 lock_user, 수정 후는 begin_user_tx.
    for name in ('begin_user_tx', 'lock_user'):
        original = getattr(restore, name, None)
        if original is None:
            continue

        def gated(*a, _orig=original, **k):
            if threading.current_thread().name == 'first' and not gate.is_set():
                gate.set()
                time.sleep(GATE)
            return _orig(*a, **k)

        monkeypatch.setattr(restore, name, gated)

    def study():   # study/log 와 같은 순서: User → UserVoca FOR UPDATE → data 갱신
        _lock_user_fresh(uid)
        u = db.session.query(UserVoca).filter(UserVoca.id == uv_id).with_for_update().one()
        u.data = _fsrs_data(now - dt.timedelta(days=30), reps=7)
        db.session.commit()

    out = _run_gated(_in_ctx(app, lambda: restore.complete_diagnosis(uid, uv_id, True, now=now)),
                     _in_ctx(app, study), gate)
    assert not isinstance(out['first'], Exception), out['first']
    assert not isinstance(out['second'], Exception), out['second']
    with app.app_context():
        u = db.session.query(UserVoca).filter(UserVoca.id == uv_id).one()
        st = get_fsrs_state(parse_user_voca_data(u.data))
        assert st.get('reps') == 7, '그 사이 학습 결과(reps=7)가 사라짐: {}'.format(st.get('reps'))
        assert float(st.get('stability')) == restore.REPLANT_STABILITY_DAYS


# ──────────────────────────────────────────────────────────────
# 7. 초대 — 같은 초대자에게 동시에 들어온 두 초대(초대왕 진행 유실 / 1062)
# ──────────────────────────────────────────────────────────────

@pytest.fixture
def invite_goal(app):
    """로컬에 초대왕 목표가 없을 수 있어 임시로 만든다(보상 0 — 보석과 무관하게 진행값만 본다)."""
    from app import db
    from app.models.models import GoalType, Goals
    with app.app_context():
        existing = db.session.query(GoalType).filter(GoalType.type == '초대왕').first()
        created = None
        if existing is None:
            gt = GoalType(type='초대왕', description='test')
            db.session.add(gt)
            db.session.flush()
            db.session.add(Goals(type_id=gt.id, level=1, goal=5, reward_count=0,
                                 goal_text='t', description='t', badge_img=None))
            db.session.commit()
            created = gt.id
    yield
    if created is not None:
        with app.app_context():
            gids = [r[0] for r in db.session.query(Goals.id).filter(Goals.type_id == created).all()]
            from app.models.models import UserGoals
            db.session.query(UserGoals).filter(UserGoals.goal_id.in_(gids)).delete(
                synchronize_session=False)
            db.session.query(Goals).filter(Goals.type_id == created).delete(synchronize_session=False)
            db.session.query(GoalType).filter(GoalType.id == created).delete(synchronize_session=False)
            db.session.commit()


def test_two_invitees_same_inviter(app, users, invite_goal, monkeypatch):
    from app import db
    from app.models.models import GoalType, Goals, User, UserGoals
    from app.routes import auth
    inviter = users()
    a, b = users(), users()
    with app.app_context():
        code = db.session.query(User.invite_code).filter(User.id == inviter).scalar()

    gate = threading.Event()
    original = auth.update_user_goal

    def gated(*args, **kw):
        out = original(*args, **kw)   # 초대자 목표 행을 만든/올린 뒤, 커밋 전
        if threading.current_thread().name == 'first' and not gate.is_set():
            gate.set()
            time.sleep(GATE)
        return out

    monkeypatch.setattr(auth, 'update_user_goal', gated)

    def enter(uid):
        def run():
            with app.test_client() as c:
                r = c.post('/auth/save_invite_code', json={'invite_code': code}, headers=_auth(uid))
                return r.status_code
        return run

    out = _run_gated(enter(a), enter(b), gate)
    assert out == {'first': 200, 'second': 200}, out
    with app.app_context():
        rows = (db.session.query(UserGoals.goal_id, UserGoals.current_value, UserGoals.is_completed)
                .join(Goals, UserGoals.goal_id == Goals.id)
                .join(GoalType, Goals.type_id == GoalType.id)
                .filter(UserGoals.user_id == inviter, GoalType.type == '초대왕')
                .all())
        # 레벨 목표가 1이면 첫 초대로 1레벨이 완료되고 2레벨 행이 생긴다 — 레벨 합으로 본다.
        assert sum(r[1] for r in rows) == 2, '초대왕 진행 {}'.format(rows)
        assert sum(1 for r in rows if not r[2]) <= 1, '진행 중 목표가 둘 {}'.format(rows)


# ──────────────────────────────────────────────────────────────
# 8. 퀴즐렛 업로드 — 남은 단어장 1개로 두 업로드가 모두 통과 (book_cnt lost update)
# ──────────────────────────────────────────────────────────────

def test_quizlet_upload_respects_book_cnt(app, users, monkeypatch):
    from app import db
    from app.models.models import User, UserVocaBook
    from app.routes import voca_books
    uid = users(book_cnt=1)
    original = voca_books.bulk_persist_vocas

    def slow(*a, **k):
        time.sleep(GATE)
        return original(*a, **k)

    monkeypatch.setattr(voca_books, 'bulk_persist_vocas', slow)

    def upload():
        with app.test_client() as c:
            r = c.post('/user_voca_book/upload/quizlet',
                       json={'title': 'q', 'text': 'apple\t사과\nbanana\t바나나', 'language': 'en'},
                       headers=_auth(uid))
            return r.status_code

    out = _run_parallel([('a', upload), ('b', upload)])
    with app.app_context():
        books = db.session.query(UserVocaBook).filter(UserVocaBook.user_id == uid).count()
        cnt = db.session.query(User.book_cnt).filter(User.id == uid).scalar()
    assert books == 1, '단어장 {}개 생성(남은 개수 1) — {}'.format(books, out)
    assert cnt == 0
    assert sorted(out.values()) == [200, 400], out


# ──────────────────────────────────────────────────────────────
# 9. 분할 업로드 — 같은 단어가 든 청크 두 개를 동시에(UserVoca 중복 / 매핑 1062)
# ──────────────────────────────────────────────────────────────

def test_parallel_chunks_same_word(app, users, monkeypatch):
    from app import db
    from app.models.models import UserVoca, UserVocaBook, UserVocaBookMap
    from app.routes import voca_books
    uid = users()
    with app.app_context():
        book = UserVocaBook(user_id=uid, bookstore_id=None, color='{}', name='b', total_word_cnt=0,
                            memorized_word_cnt=0, voca_list=None, updated_at=None, language='en')
        db.session.add(book)
        db.session.commit()
        book_id = book.id

    original = voca_books._apply_emphasis_to_items

    def slow(items):
        time.sleep(GATE)
        return original(items)

    monkeypatch.setattr(voca_books, '_apply_emphasis_to_items', slow)

    def append():
        with app.test_client() as c:
            r = c.post('/vocaBooks/{}/vocas'.format(book_id),
                       json={'vocaList': [{'origin': 'zzchunkword', 'meanings': ['뜻'],
                                           'examples': []}], 'language': 'en'},
                       headers=_auth(uid))
            return r.status_code

    out = _run_parallel([('a', append), ('b', append)])
    assert sorted(out.values()) == [201, 201], out
    with app.app_context():
        n = db.session.query(UserVoca).filter(UserVoca.user_id == uid,
                                              UserVoca.word == 'zzchunkword').count()
        maps = db.session.query(UserVocaBookMap).filter(
            UserVocaBookMap.user_voca_book_id == book_id).count()
        total = db.session.query(UserVocaBook.total_word_cnt).filter(
            UserVocaBook.id == book_id).scalar()
    assert n == 1, 'UserVoca {}개'.format(n)
    assert maps == 1 and total == 1


# ──────────────────────────────────────────────────────────────
# 10. 온보딩 make_book — 미션·보석·보상 단어장이 한 커밋 (중간 커밋 부분 반영)
# ──────────────────────────────────────────────────────────────

def test_make_book_reward_is_atomic(app, users, monkeypatch):
    from app import db
    from app.models.models import GemLog, User, UserOnboardingMission, UserVocaBook
    from app.routes import onboarding
    uid = users(gem=10)

    def boom():
        raise RuntimeError('보상 단어장 생성 실패 흉내')

    monkeypatch.setattr(onboarding, 'get_dict_lang', boom)
    with app.app_context():
        try:
            onboarding.complete_onboarding_mission(uid, 'make_book')
        except RuntimeError:
            pass
        finally:
            db.session.remove()
        missions = db.session.query(UserOnboardingMission).filter(
            UserOnboardingMission.user_id == uid).count()
        gem = db.session.query(User.gem_cnt).filter(User.id == uid).scalar()
        logs = db.session.query(GemLog).filter(GemLog.user_id == uid).count()
        books = db.session.query(UserVocaBook).filter(UserVocaBook.user_id == uid).count()
    # 전부 반영되거나 전부 빠져야 한다 — 미션·보석만 남고 보상 단어장이 빠지면 다시 받을 길이 없다
    assert (missions, logs, books) in ((0, 0, 0), (1, 1, 1)), (missions, logs, books)
    assert gem == (10 if missions == 0 else 10 + onboarding.ONBOARDING_MISSION_BY_KEY['make_book']['reward_gem'])


# ──────────────────────────────────────────────────────────────
# 11. 탈퇴 — User 를 첫 문장으로 잠그고(초대받은 사람 포함) 한 트랜잭션
# ──────────────────────────────────────────────────────────────

def test_withdraw_with_invitee(app, users):
    from app import db
    from app.models.models import InviteMap, User
    w = users()
    invitee = users()
    with app.app_context():
        u = db.session.query(User).filter(User.id == invitee).one()
        u.invited_by = w
        db.session.add(InviteMap(inviter_id=w, invitee_id=invitee))
        db.session.commit()
    with app.test_client() as c:
        r = c.delete('/auth/withdraw', headers=_auth(w))
    assert r.status_code == 200, r.data
    with app.app_context():
        assert db.session.query(User).filter(User.id == w).first() is None
        assert db.session.query(User.invited_by).filter(User.id == invitee).scalar() is None


# ──────────────────────────────────────────────────────────────
# 12. 사전 발행/적용 — 같은 환경 동시 실행 차단
# ──────────────────────────────────────────────────────────────

def test_dict_op_lock_is_exclusive():
    from app.services import dict_manage as dm
    held = threading.Event()
    release = threading.Event()

    def holder():
        with dm._op_lock('en'):
            held.set()
            release.wait(5)

    t = threading.Thread(target=holder)
    t.start()
    assert held.wait(5)
    try:
        with pytest.raises(dm.DictConflictError):
            with dm._op_lock('en'):
                pass
    finally:
        release.set()
        t.join(5)
    with dm._op_lock('en'):   # 풀린 뒤에는 다시 잡힌다
        pass
