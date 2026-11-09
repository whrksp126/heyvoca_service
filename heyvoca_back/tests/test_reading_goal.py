"""독서왕 업적 — 서점 구매(POST /voca_books, bookstoreId) 로 진행이 오르는지 (이슈 #24).

실제 로컬 MySQL 이 필요하다(없으면 건너뜀).
    docker exec heyvoca_back_local python3 -m pytest tests/test_reading_goal.py -q
"""

import uuid

import pytest

START_GEM = 1000


@pytest.fixture(scope='module')
def app():
    try:
        from app import create_app, db
        from app.models.models import Bookstore, User
        _app = create_app()
        _app.config['TESTING'] = True
        with _app.app_context():
            db.session.query(User.id).first()
            books = [r[0] for r in db.session.query(Bookstore.id).order_by(Bookstore.id).limit(4).all()]
            if len(books) < 4:
                pytest.skip('서점 단어장이 4개 미만')
    except Exception as e:
        pytest.skip('로컬 DB 에 연결할 수 없어 건너뜀: {}'.format(e))
    _app.config['_TEST_BOOKS'] = books
    return _app


@pytest.fixture
def uid(app):
    from app import db
    from app.models.models import GemLog, User, UserGoals, UserVoca, UserVocaBook, UserVocaBookMap
    with app.app_context():
        code = uuid.uuid4().hex[:12]
        user = User(level_id=None, email='read-test-{}@test.local'.format(code), google_id=None,
                    username=None, name='readtest', phone=None, last_logged_at=None,
                    refresh_token=None, code=code, book_cnt=0, gem_cnt=START_GEM, set_goal_cnt=0)
        user.invite_code = 'RT' + code[:8].upper()
        db.session.add(user)
        db.session.commit()
        user_id = user.id
    yield user_id
    with app.app_context():
        book_ids = [b.id for b in db.session.query(UserVocaBook.id).filter(UserVocaBook.user_id == user_id)]
        if book_ids:
            db.session.query(UserVocaBookMap).filter(UserVocaBookMap.user_voca_book_id.in_(book_ids)).delete(
                synchronize_session=False)
        for model in (UserVocaBook, UserVoca, UserGoals, GemLog):
            db.session.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
        db.session.commit()
        from tests.test_gem_atomic import _purge
        _purge(app, [user_id])


def _auth(user_id):
    from app.utils.jwt_utils import generate_access_token
    return {'Authorization': 'Bearer ' + generate_access_token(user_id)}


def _buy(app, user_id, bookstore_id):
    with app.test_client() as c:
        r = c.post('/vocaBooks', headers=_auth(user_id), json={
            'title': 'reading-goal-test', 'bookstoreId': bookstore_id, 'chargeGem': True,
            'vocaList': [{'origin': 'apple', 'meanings': ['사과'], 'examples': []}],
        })
    assert r.status_code == 201, r.get_json()
    return r.get_json()['data']


def _reading_state(app, user_id):
    from app import db
    from app.models.models import Goals, GoalType, User, UserGoals
    with app.app_context():
        rows = (db.session.query(Goals.level, UserGoals.current_value, UserGoals.is_completed)
                .join(Goals, UserGoals.goal_id == Goals.id)
                .join(GoalType, Goals.type_id == GoalType.id)
                .filter(UserGoals.user_id == user_id, GoalType.type == '독서왕')
                .order_by(Goals.level).all())
        gem = db.session.query(User.gem_cnt).filter(User.id == user_id).scalar()
        return [tuple(r) for r in rows], gem


def _reading_rewards(app, user_id):
    from app import db
    from app.models.models import GemLog
    with app.app_context():
        return [a for (a,) in db.session.query(GemLog.amount).filter(
            GemLog.user_id == user_id, GemLog.description.like('업적 완료: 독서왕%'))]


def test_bookstore_purchase_advances_reading_goal(app, uid):
    from app import db
    books = app.config['_TEST_BOOKS']

    # 1권 → 1단계(목표 1) 완료, 응답 goals 에 레벨 1, gemCnt = 차감 + 보상 반영
    d1 = _buy(app, uid, books[0])
    assert [g['level'] for g in d1['goals']] == [1]
    assert d1['goals'][0]['type'] == '독서왕' and d1['goals'][0]['badge_img']
    rows, gem = _reading_state(app, uid)
    assert rows == [(1, 1, True), (2, 1, False)]
    # gem.before = 구매 차감 후, gem.after = 독서왕 보상 반영 후 = gemCnt
    assert d1['gem']['after'] - d1['gem']['before'] == 2
    assert d1['gemCnt'] == d1['gem']['after']
    assert _reading_rewards(app, uid) == [2]

    # 같은 책을 또 받아도 진행은 그대로(서로 다른 책 수로 센다)
    d_dup = _buy(app, uid, books[0])
    assert d_dup['goals'] == []
    assert d_dup['gem']['before'] == d_dup['gem']['after'] == d_dup['gemCnt']
    assert _reading_state(app, uid)[0] == [(1, 1, True), (2, 1, False)]

    # 2권 → 2단계 진행 2/3, 3권 → 2단계(목표 3, 누적) 완료
    d2 = _buy(app, uid, books[1])
    assert d2['goals'] == []
    d3 = _buy(app, uid, books[2])
    assert [g['level'] for g in d3['goals']] == [2]
    rows, gem = _reading_state(app, uid)
    assert rows == [(1, 1, True), (2, 3, True), (3, 3, False)]
    assert d3['gem']['after'] - d3['gem']['before'] == 3
    assert d3['gemCnt'] == d3['gem']['after'] == gem
    assert sorted(_reading_rewards(app, uid)) == [2, 3]

    # 소급과 같은 함수 — 다시 돌려도 바뀌지 않는다(멱등)
    from app.services.reading_goal import sync_reading_goal
    from app.utils.db_lock import begin_user_tx
    with app.app_context():
        begin_user_tx(uid)
        assert sync_reading_goal(uid) == []
        db.session.commit()
    assert _reading_state(app, uid) == (rows, gem)


def test_non_bookstore_book_has_empty_goals(app, uid):
    with app.test_client() as c:
        r = c.post('/vocaBooks', headers=_auth(uid), json={'title': 'mine', 'vocaList': []})
    assert r.status_code == 201
    assert r.get_json()['data']['goals'] == []
    assert _reading_state(app, uid)[0] == []
