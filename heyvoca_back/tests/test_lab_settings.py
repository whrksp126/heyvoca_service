"""실험실 설정 — recall_first on/off, chat_study 켜기 무시. (로컬 MySQL + 마이그레이션 적용 필요)

    docker exec heyvoca_back_local python3 -m pytest tests/test_lab_settings.py -q
"""
import uuid

import pytest


@pytest.fixture(scope='module')
def app():
    try:
        from app import create_app, db
        from app.models.models import User
        _app = create_app()
        _app.config['TESTING'] = True
        _app.config['RATELIMIT_ENABLED'] = False
        with _app.app_context():
            db.session.query(User.recall_first_enabled).first()
    except Exception as e:
        pytest.skip('로컬 DB 에 연결할 수 없거나 마이그레이션 미적용: {}'.format(e))
    return _app


@pytest.fixture()
def auth(app):
    from app import db
    from app.models.models import User
    from app.utils.jwt_utils import generate_access_token
    with app.app_context():
        code = uuid.uuid4().hex[:12]
        user = User(level_id=None, email='lab-test-{}@test.local'.format(code), google_id=None,
                    username=None, name='labtest', phone=None, last_logged_at=None,
                    refresh_token=None, code=code, book_cnt=0, gem_cnt=0, set_goal_cnt=0)
        user.invite_code = 'LB' + code[:8].upper()
        db.session.add(user)
        db.session.commit()
        uid = user.id
        token = generate_access_token(uid)
    yield {'Authorization': 'Bearer {}'.format(token)}
    with app.app_context():
        User.query.filter_by(id=uid).delete()
        db.session.commit()


def _put(client, auth, feature, enabled):
    return client.put('/lab/settings', json={'feature': feature, 'enabled': enabled}, headers=auth)


def test_recall_first_on_off(app, auth):
    c = app.test_client()
    r = c.get('/lab/settings', headers=auth)
    assert r.status_code == 200
    assert r.get_json()['data']['features']['recall_first'] is False
    r = _put(c, auth, 'recall_first', True)
    assert r.get_json()['data']['features']['recall_first'] is True
    assert c.get('/lab/settings', headers=auth).get_json()['data']['features']['recall_first'] is True
    r = _put(c, auth, 'recall_first', False)
    assert r.get_json()['data']['features']['recall_first'] is False


def test_chat_study_cannot_be_enabled(app, auth):
    c = app.test_client()
    r = _put(c, auth, 'chat_study', True)
    assert r.status_code == 200          # 구버전 클라이언트를 깨지 않는다
    assert r.get_json()['data']['features']['chat_study'] is False
    assert c.get('/lab/settings', headers=auth).get_json()['data']['features']['chat_study'] is False


def test_chat_reminder_is_noop(app):
    from app.routes import fcm
    assert fcm.run_chat_reminder(app, 'morning') is None
