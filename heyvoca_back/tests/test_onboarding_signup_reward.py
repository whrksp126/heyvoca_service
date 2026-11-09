"""온보딩 v2 가입 보상 — 이슈 #25 4차: 정답 수·답변 수와 무관하게 보석 20개, 이중 지급 없음.

로컬 DB(heyvoca_back_local 컨테이너)에서 돈다. 연결이 안 되면 건너뛴다.
"""
import pytest

from tests.test_tx_snapshot import app, users, _auth, _in_ctx, _run_parallel  # noqa: F401 (픽스처)


def _migrate(app, uid, answers):
    with app.test_client() as c:
        return c.post('/onboarding/migrate', headers=_auth(uid),
                      json={'flow': 'v2', 'theta': 0.0, 'answers': answers})


def _gem_state(app, uid):
    from app import db
    from app.models.models import GemLog, User
    with app.app_context():
        gem = db.session.query(User.gem_cnt).filter(User.id == uid).scalar()
        logs = db.session.query(GemLog).filter(GemLog.user_id == uid,
                                               GemLog.source_type == 'onboarding').count()
        db.session.remove()
    return gem, logs


def test_signup_reward_constant_is_20():
    from app.routes import onboarding
    assert onboarding.SIGNUP_REWARD_GEM == 20


@pytest.mark.parametrize('answers', [
    [],                                                                  # 0문항
    [{'voca_id': 1, 'question_type': 'multipleChoice', 'correct': False}] * 8,  # 전부 오답
    [{'voca_id': 1, 'question_type': 'multipleChoice', 'correct': True}] * 8,   # 전부 정답
])
def test_v2_reward_is_fixed_20(app, users, answers):
    uid = users(gem=0)
    r = _migrate(app, uid, answers)
    assert r.status_code == 200, r.get_json()
    data = r.get_json()['data']
    assert data['reward'] == 20 and data['reward_gem'] == 20
    assert data['gem_cnt'] == 20
    assert _gem_state(app, uid) == (20, 1)


def test_v2_reward_not_paid_twice(app, users):
    uid = users(gem=0)
    ans = [{'voca_id': 1, 'question_type': 'multipleChoice', 'correct': True}]
    assert _migrate(app, uid, ans).status_code == 200
    assert _migrate(app, uid, ans).status_code == 409
    assert _gem_state(app, uid) == (20, 1)


def test_v2_reward_concurrent_once(app, users):
    uid = users(gem=0)

    def call():
        return _migrate(app, uid, []).status_code

    out = _run_parallel([('a', _in_ctx(app, call)), ('b', _in_ctx(app, call))])
    assert sorted(out.values()) == [200, 409], out
    assert _gem_state(app, uid) == (20, 1)
