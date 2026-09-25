"""보석 잔액 원자성(lost update 방지) 회귀 테스트 — 실제 로컬 MySQL 에서 스레드로 동시 실행한다.

불변식: **최종 잔액 = 시작 잔액 + GemLog 합계**, 그리고 잔액은 절대 음수가 되지 않는다.
보석을 바꾸는 경로가 잠그지 않고 읽은 잔액에 더하거나(잃어버린 갱신), 원장을 따로 커밋하면
(원자성 깨짐) 이 등식이 어긋난다.

    docker exec heyvoca_back_local python3 -m pytest tests/test_gem_atomic.py -q
"""

import threading
import uuid

import pytest

START_GEM = 1000


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


def _make_user(app, gem=START_GEM):
    from app import db
    from app.models.models import User
    with app.app_context():
        code = uuid.uuid4().hex[:12]
        user = User(level_id=None, email='gem-test-{}@test.local'.format(code), google_id=None,
                    username=None, name='gemtest', phone=None, last_logged_at=None,
                    refresh_token=None, code=code, book_cnt=0, gem_cnt=gem, set_goal_cnt=0)
        user.invite_code = 'GT' + code[:8].upper()
        db.session.add(user)
        db.session.commit()
        return user.id, user.invite_code


def _purge(app, user_ids):
    """사용자 DB 에서 user_id 를 가진 모든 행 → InviteMap → User 순으로 지운다."""
    from app import db
    from app.models.models import InviteMap, User
    ids = list(user_ids)
    with app.app_context():
        models = [m.class_ for m in db.Model.registry.mappers
                  if getattr(m.class_, '__bind_key__', None) is None
                  and m.class_ is not User and hasattr(m.class_, 'user_id')]
        pending = list(models)
        for _ in range(5):          # FK 순서를 몰라도 되도록 몇 바퀴 돈다
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
        db.session.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
        db.session.commit()


@pytest.fixture
def users(app):
    made = []

    def make(gem=START_GEM):
        uid, code = _make_user(app, gem)
        made.append(uid)
        return uid, code

    yield make
    _purge(app, made)


def _state(app, user_id):
    from app import db
    from app.models.models import GemLog, User
    with app.app_context():
        gem, book_cnt = db.session.query(User.gem_cnt, User.book_cnt).filter(User.id == user_id).one()
        logs = db.session.query(GemLog.amount, GemLog.reason).filter(GemLog.user_id == user_id).all()
        return {'gem': gem, 'book_cnt': book_cnt, 'log_sum': sum(a for a, _ in logs),
                'logs': [(a, getattr(r, 'value', r)) for a, r in logs]}


def _auth(user_id):
    from app.utils.jwt_utils import generate_access_token
    return {'Authorization': 'Bearer ' + generate_access_token(user_id)}


def _run_threads(jobs):
    """jobs: [callable] — 동시에 출발시키고 (결과, 예외) 목록을 돌려준다."""
    barrier = threading.Barrier(len(jobs))
    results = [None] * len(jobs)
    errors = []

    def run(i, fn):
        barrier.wait()
        try:
            results[i] = fn()
        except Exception as e:   # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=run, args=(i, fn)) for i, fn in enumerate(jobs)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(120)
    return results, errors


def test_concurrent_reward_shop_book_deduct(app, users):
    """세션 집계(출석·업적 보상) + 농장 상점 구매 + 빈 단어장 구매 + 단어장 보석 차감을 섞어 동시에."""
    uid, _ = users()
    headers = _auth(uid)

    def study_history():
        with app.test_client() as c:
            r = c.post('/mainpage/user_study_history', json={'correct_cnt': 3, 'incorrect_cnt': 1},
                       headers=headers)
            assert r.status_code == 200, r.data
            return ('history', r.get_json())

    def buy_book():
        with app.test_client() as c:
            r = c.post('/purchase/book', json={'amount': 2}, headers=headers)
            assert r.status_code == 200, r.data
            return ('book', 6)

    def deduct():
        with app.test_client() as c:
            r = c.post('/auth/deduct_gem', json={'gem_cnt': 7}, headers=headers)
            assert r.status_code == 200, r.data
            return ('deduct', 7)

    def shop():
        from app.services.game.farm_v2 import shop as shop_svc
        with app.app_context():
            from app import db
            try:
                out = shop_svc.purchase(uid, 'shield_1', 1)
                return ('shop', out)
            finally:
                db.session.remove()

    jobs = []
    for _ in range(4):
        jobs += [study_history, buy_book, deduct, shop]
    results, errors = _run_threads(jobs)
    assert not errors, errors

    s = _state(app, uid)
    # 원장과 잔액이 같이 움직였다 — 잃어버린 갱신도, 원장만/잔액만 남은 변경도 없다
    assert s['gem'] == START_GEM + s['log_sum'], s
    # 지출은 요청 수만큼 정확히 원장에 남았다
    reasons = [r for _, r in s['logs']]
    assert reasons.count('BOOK_PURCHASE') == 4 + 4          # 빈 단어장 4 + 보석 차감 4
    assert reasons.count('ITEM_PURCHASE') == 4
    assert s['book_cnt'] == 4 * 2
    # 출석 보상은 하루 한 번뿐(동시 4회여도)
    assert sum(1 for a, r in s['logs'] if a == 1 and r == 'ACHIEVEMENT') >= 1
    from app import db
    from app.models.models import GemLog
    with app.app_context():
        attend = db.session.query(GemLog).filter(GemLog.user_id == uid,
                                                 GemLog.source_type == 'attendance').count()
    assert attend == 1


def test_concurrent_deduct_never_negative(app, users):
    """잔액 20 에서 7 씩 10번 동시 차감 → 정확히 2번만 성공, 잔액 6, 음수 없음."""
    uid, _ = users(gem=20)
    headers = _auth(uid)

    def deduct():
        with app.test_client() as c:
            return c.post('/auth/deduct_gem', json={'gem_cnt': 7}, headers=headers).status_code

    results, errors = _run_threads([deduct] * 10)
    assert not errors, errors
    assert results.count(200) == 2 and results.count(400) == 8, results
    s = _state(app, uid)
    assert s['gem'] == 6 and s['log_sum'] == -14


def test_invite_both_directions(app, users):
    """A 가 B 의 코드를, B 가 A 의 코드를 동시에 입력 — 교착 없이 둘 다 처리되고 잔액=원장."""
    a, a_code = users()
    b, b_code = users()

    def enter(me, code):
        def run():
            with app.test_client() as c:
                r = c.post('/auth/save_invite_code', json={'invite_code': code}, headers=_auth(me))
                return r.status_code, r.get_json()
        return run

    # 같은 입력을 두 번씩 섞는다 — 두 번째부터는 잠금 안의 invited_by 검사로 400
    results, errors = _run_threads([enter(a, b_code), enter(b, a_code),
                                    enter(a, b_code), enter(b, a_code)])
    assert not errors, errors
    codes = sorted(r[0] for r in results)
    assert codes == [200, 200, 400, 400], results

    for uid in (a, b):
        s = _state(app, uid)
        assert s['gem'] == START_GEM + s['log_sum'], s
        referral = sum(x for x, r in s['logs'] if r == 'REFERRAL')
        assert referral == 20   # 초대받은 보상 10 + 초대한 보상 10


def test_iap_grant_idempotent_under_concurrency(app, users):
    """같은 거래 id 로 DB 지급 단계를 동시에 여러 번 — 정확히 한 번만 지급된다.
    (스토어 검증은 외부 호출이라 여기서는 검증 뒤의 DB 단계 `_grant_iap_gems` 만 부른다.)"""
    from app.routes.purchase import _grant_iap_gems
    uid, _ = users()
    tx = 'test-tx-' + uuid.uuid4().hex

    class P:   # Product 대역 — _grant_iap_gems 가 쓰는 속성만
        price = 1200
        name = '테스트 보석'

    data = {'productId': 'gem_test', 'transactionId': tx, 'platform': 'ios'}

    def grant():
        with app.test_request_context():
            from app import db
            try:
                return _grant_iap_gems(uid, data, 'ios', P, 1, 50)
            finally:
                db.session.remove()

    results, errors = _run_threads([grant] * 6)
    assert not errors, errors
    assert sum(1 for r in results if isinstance(r, int) and r is not True) == 1, results
    assert results.count(None) == 5
    s = _state(app, uid)
    assert s['gem'] == START_GEM + 50 and s['log_sum'] == 50
