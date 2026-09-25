"""/auth/refresh, /auth/logout — token_version 기반 refresh 폐기 회귀 테스트.

버그: 로그아웃(user.refresh_token='' 로 비움)해도 옛 refresh 쿠키로 /auth/refresh 를
계속 호출하면 90일간 갱신이 됐다. user.refresh_token 컬럼은 로그인마다 값이 덮이고
google_app_callback 이 구글 access_token 을 그 컬럼에 그대로 넣기도 해서 신뢰할 수
없다 — 그래서 별도 User.token_version 컬럼 + refresh 토큰의 'tv' 클레임을 대조한다.

실제 로컬 MySQL 에 연결해 app.test_client() 로 HTTP 엔드포인트를 그대로 호출한다
(다른 회귀 테스트들과 동일한 스킵 패턴 — DB 연결 실패 시 skip).

    docker exec heyvoca_back_local python3 -m pytest tests/test_auth_token_version.py -q
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
            db.session.query(User.id).first()
    except Exception as e:
        pytest.skip('로컬 DB 에 연결할 수 없어 건너뜀: {}'.format(e))
    try:
        from app import limiter
        limiter.enabled = False
    except Exception:
        pass
    return _app


@pytest.fixture
def user(app):
    """테스트용 User row. 테스트가 끝나면 지운다."""
    from app import db
    from app.models.models import User
    with app.app_context():
        code = uuid.uuid4().hex[:12]
        u = User(
            level_id=None, email=f'authtv-{code}@test.local', google_id=None,
            username=None, name='authtv', phone=None, last_logged_at=None,
            refresh_token='', code=code, book_cnt=0, gem_cnt=0, set_goal_cnt=0,
        )
        db.session.add(u)
        db.session.commit()
        user_id = u.id
    yield user_id
    with app.app_context():
        row = db.session.query(User).filter(User.id == user_id).first()
        if row:
            db.session.delete(row)
            db.session.commit()


def _issue_refresh_cookie(app, user_id, tv=None):
    """user_id에 대한 refresh 토큰을 발급한다. tv=None이면 'tv' 클레임이 없는
    옛(마이그레이션 이전) 토큰 형식을 그대로 흉내낸다."""
    import os
    import jwt as pyjwt
    from datetime import datetime, timedelta
    with app.app_context():
        payload = {'user_id': str(user_id), 'exp': datetime.utcnow() + timedelta(days=1)}
        if tv is not None:
            payload['tv'] = tv
        return pyjwt.encode(payload, os.getenv('REFRESH_SECRET'), algorithm='HS256')


def _access_token(app, user_id):
    with app.app_context():
        from app.utils.jwt_utils import generate_access_token
        return generate_access_token(user_id)


class TestRefreshTokenVersion:
    def test_refresh_succeeds_before_logout(self, app, user):
        token = _issue_refresh_cookie(app, user, tv=0)
        client = app.test_client()
        client.set_cookie('localhost', 'refresh_token', token)
        resp = client.post('/auth/refresh')
        assert resp.status_code == 200
        assert 'access_token' in resp.get_json()
        # 회전(rotation) — 새 refresh_token 쿠키가 내려온다.
        set_cookie_headers = resp.headers.getlist('Set-Cookie')
        assert any('refresh_token=' in h for h in set_cookie_headers)

    def test_refresh_rejected_after_logout(self, app, user):
        """로그아웃 전에 발급받은 refresh 토큰은 로그아웃 후 거부되어야 한다(핵심 회귀)."""
        old_refresh_token = _issue_refresh_cookie(app, user, tv=0)
        access_token = _access_token(app, user)

        client = app.test_client()
        logout_resp = client.post(
            '/auth/logout', headers={'Authorization': f'Bearer {access_token}'}
        )
        assert logout_resp.status_code == 200

        client2 = app.test_client()
        client2.set_cookie('localhost', 'refresh_token', old_refresh_token)
        refresh_resp = client2.post('/auth/refresh')
        assert refresh_resp.status_code == 401

    def test_refresh_rejected_missing_cookie(self, app):
        client = app.test_client()
        resp = client.post('/auth/refresh')
        assert resp.status_code == 401

    def test_legacy_token_without_tv_claim_treated_as_version_zero(self, app, user):
        """'tv' 클레임이 없는 옛 토큰(마이그레이션 이전 발급분)은 0으로 간주되어,
        아직 로그아웃하지 않은(token_version=0) 사용자에겐 그대로 통과해야 한다."""
        legacy_token = _issue_refresh_cookie(app, user, tv=None)
        client = app.test_client()
        client.set_cookie('localhost', 'refresh_token', legacy_token)
        resp = client.post('/auth/refresh')
        assert resp.status_code == 200

    def test_legacy_token_without_tv_claim_rejected_after_logout(self, app, user):
        """'tv' 클레임이 없는 옛 토큰은 0으로 간주되므로, 로그아웃(token_version=1)
        이후에는 거부되어야 한다."""
        legacy_token = _issue_refresh_cookie(app, user, tv=None)
        access_token = _access_token(app, user)

        client = app.test_client()
        logout_resp = client.post(
            '/auth/logout', headers={'Authorization': f'Bearer {access_token}'}
        )
        assert logout_resp.status_code == 200

        client2 = app.test_client()
        client2.set_cookie('localhost', 'refresh_token', legacy_token)
        resp = client2.post('/auth/refresh')
        assert resp.status_code == 401

    def test_refresh_rejected_after_user_deleted(self, app, user):
        """탈퇴(User row 삭제) 후에는 refresh 토큰이 유효해 보여도 401."""
        from app import db
        from app.models.models import User

        token = _issue_refresh_cookie(app, user, tv=0)
        with app.app_context():
            row = db.session.query(User).filter(User.id == user).first()
            db.session.delete(row)
            db.session.commit()

        client = app.test_client()
        client.set_cookie('localhost', 'refresh_token', token)
        resp = client.post('/auth/refresh')
        assert resp.status_code == 401

    def test_logout_increments_token_version_exactly_once(self, app, user):
        from app import db
        from app.models.models import User

        access_token = _access_token(app, user)
        client = app.test_client()
        client.post('/auth/logout', headers={'Authorization': f'Bearer {access_token}'})

        with app.app_context():
            row = db.session.query(User).filter(User.id == user).first()
            assert row.token_version == 1
