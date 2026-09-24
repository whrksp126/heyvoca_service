"""연속 학습 보호권 개편 시나리오 테스트 (streak_v2 + shop).

정책 정본: 연속 학습 보호권 계약서 §1 (gap 1~7 자동 다중 소모 / 부족 시 멈춤 /
gap≥8·기한 경과 종료 / 다시 잇기 도전 / notice 1회 표시 / 하루 보석 한도 제거).

**실제 로컬 MySQL(heyvoca_user)** 에 버리는 사용자를 만들어 돌린다 — 서비스 함수가
내부에서 커밋하므로 트랜잭션 롤백으로 격리할 수 없다. 테스트마다 사용자를 새로 만들고
끝나면 관련 행을 전부 지운다. DB 에 붙을 수 없는 환경이면 전부 skip 한다.

    docker exec heyvoca_back_local python3 -m pytest tests/test_streak_shield.py -q

시간대는 기본값(Asia/Seoul). 오늘 T = 2026-09-25(KST), 시각은 KST 정오(= UTC 03:00).
"""

import datetime as dt
import json
import uuid

import pytest

T = dt.date(2026, 9, 25)
D = dt.timedelta(days=1)


def noon(day):
    """현지(KST) 정오의 naive UTC."""
    return dt.datetime(day.year, day.month, day.day, 3, 0, 0)


# ──────────────────────────────────────────────────────────────
# 픽스처
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def app():
    try:
        from app import create_app, db
        from app.models.models import User
        _app = create_app()
        _app.config['TESTING'] = True
        with _app.app_context():
            db.session.query(User.id).first()   # 연결 확인
    except Exception as e:   # DB 없음 — 통합 테스트 불가
        pytest.skip('로컬 DB 에 연결할 수 없어 건너뜀: {}'.format(e))
    return _app


@pytest.fixture
def ctx(app):
    with app.app_context():
        yield


@pytest.fixture
def uid(ctx):
    from app import db
    from app.models.models import (CheckIn, FarmEventLog, GemLog, User, UserFarmItem,
                                   UserFarmItemLog, UserFarmSetting, UserStreak)
    code = uuid.uuid4().hex[:12]
    user = User(level_id=None, email='streak-test-{}@test.local'.format(code), google_id=None,
                username=None, name='streaktest', phone=None, last_logged_at=None,
                refresh_token=None, code=code, book_cnt=0, gem_cnt=0, set_goal_cnt=0)
    db.session.add(user)
    db.session.commit()
    user_id = user.id
    yield user_id
    db.session.rollback()
    for model in (FarmEventLog, UserFarmItemLog, UserFarmItem, GemLog, CheckIn,
                  UserStreak, UserFarmSetting):
        db.session.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    db.session.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.session.commit()


# ──────────────────────────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────────────────────────

def setup_streak(user_id, length, last_day, shields=0, gems=0):
    """last_day 까지 length 일 연속 자격을 채운 상태를 만든다. 주간 지급은 끈다."""
    from app import db
    from app.models.models import CheckIn, FarmItem, FarmItemReason, User, UserStreak
    from app.services.game.farm_v2 import inventory

    for i in range(length):
        day = last_day - D * i
        c = CheckIn(user_id=user_id, attendence_date=day, today_study_complete=True)
        c.correct_word_cnt = 5
        c.streak_qualified = True
        db.session.add(c)
    st = UserStreak(user_id=user_id, current_streak=length, best_streak=length,
                    last_qualified_day=last_day if length else None)
    st.shield_granted_week = dt.date(2099, 1, 5)   # 주간 무료 지급이 시나리오를 흔들지 않게
    db.session.add(st)
    db.session.flush()
    if shields:
        inventory.grant(user_id, FarmItem.SHIELD, shields, FarmItemReason.WEEKLY_GRANT,
                        description='test')
    if gems:
        db.session.query(User).filter(User.id == user_id).update({'gem_cnt': gems})
    db.session.commit()


def study(user_id, day):
    """그날 하루 자격(정답 5개)을 채운다 — record_correct_word 경로 그대로."""
    from app import db
    from app.models.models import CheckIn
    from app.services.game.farm_v2 import streak_v2

    c = db.session.query(CheckIn).filter(CheckIn.user_id == user_id,
                                         CheckIn.attendence_date == day).first()
    if c is None:
        c = CheckIn(user_id=user_id, attendence_date=day, today_study_complete=True)
        db.session.add(c)
    c.correct_word_cnt = 5   # 이번 호출이 '5개째 정답'이 되게 한다
    db.session.commit()
    return streak_v2.record_correct_word(user_id, 999999, now=noon(day))


def state(user_id, day):
    from app.services.game.farm_v2 import streak_v2
    return streak_v2.get_state(user_id, now=noon(day))


def shields(user_id):
    from app.models.models import FarmItem
    from app.services.game.farm_v2 import inventory
    return inventory.get_qty(user_id, FarmItem.SHIELD)


def protected_days(user_id):
    from app import db
    from app.models.models import CheckIn
    rows = (db.session.query(CheckIn.attendence_date)
            .filter(CheckIn.user_id == user_id, CheckIn.streak_protected == True)  # noqa: E712
            .all())
    return sorted(r[0].isoformat() for r in rows)


def gem_cnt(user_id):
    from app import db
    from app.models.models import User
    return db.session.query(User.gem_cnt).filter(User.id == user_id).scalar()


def streak_row(user_id):
    from app import db
    from app.models.models import UserStreak
    db.session.expire_all()
    return db.session.query(UserStreak).filter(UserStreak.user_id == user_id).first()


# ──────────────────────────────────────────────────────────────
# gap 0 / 1~7 자동 소모 / 8 이상 종료
# ──────────────────────────────────────────────────────────────

def test_gap0_nothing(uid):
    setup_streak(uid, 10, T - D, shields=2)
    s = state(uid, T)
    assert s['current'] == 10 and s['paused'] is False and s['pause'] is None
    assert s['notice'] is None and s['shield_cnt'] == 2
    assert s['earn_back'] is None and s['next_earn_back_on'] is None


def test_gap1_auto_protect(uid):
    setup_streak(uid, 10, T - 2 * D, shields=1)
    s = state(uid, T)
    assert s['current'] == 11 and s['shield_cnt'] == 0 and s['paused'] is False
    assert protected_days(uid) == [(T - D).isoformat()]
    n = s['notice']
    assert n['type'] == 'protected' and n['shields_spent'] == 1
    assert n['days'] == [(T - D).isoformat()] and n['streak'] == 11
    assert n['shield_before'] == 1 and n['shield_after'] == 0


def test_gap2_auto_protect_multi(uid):
    setup_streak(uid, 10, T - 3 * D, shields=3)
    s = state(uid, T)
    assert s['current'] == 12 and s['shield_cnt'] == 1
    assert s['notice']['shields_spent'] == 2
    # 오늘 학습하면 이어서 +1
    study(uid, T)
    assert state(uid, T)['current'] == 13


def test_gap7_auto_protect(uid):
    setup_streak(uid, 10, T - 8 * D, shields=7)
    s = state(uid, T)
    assert s['current'] == 17 and s['shield_cnt'] == 0
    assert len(protected_days(uid)) == 7


def test_gap8_breaks_without_spending(uid):
    setup_streak(uid, 10, T - 9 * D, shields=10)
    s = state(uid, T)
    assert s['current'] == 0 and s['best'] == 10 and s['shield_cnt'] == 10
    assert protected_days(uid) == []
    n = s['notice']
    assert n['type'] == 'broken' and n['gap_days'] == 8 and n['lost_streak'] == 10
    assert n['shield_cnt'] == 10 and n['max_gap'] == 7
    assert n['earn_back'] is None and n['next_earn_back_on'] is None


def test_idempotent_settle(uid):
    setup_streak(uid, 10, T - 3 * D, shields=5)
    state(uid, T)
    s = state(uid, T)
    assert s['current'] == 12 and s['shield_cnt'] == 3


# ──────────────────────────────────────────────────────────────
# 보유 부족 → 멈춤
# ──────────────────────────────────────────────────────────────

def test_gap2_short_pauses(uid):
    setup_streak(uid, 10, T - 3 * D, shields=1)
    s = state(uid, T)
    assert s['paused'] is True and s['current'] == 10 and s['shield_cnt'] == 1
    p = s['pause']
    assert p['needed'] == 2 and p['have'] == 1 and p['short'] == 1 and p['gem_cost'] == 10
    assert p['missed_days'] == [(T - 2 * D).isoformat(), (T - D).isoformat()]
    assert p['from_streak'] == 10
    # 마지막 빈 날(9/24 KST) 자정 종료 = 9/24 15:00Z, +48h
    assert p['deadline'] == '2026-09-26T15:00:00+00:00'
    assert s['recovery_until'] == p['deadline'] and s['recoverable'] is False
    assert s['notice']['type'] == 'paused' and s['notice']['short'] == 1
    assert protected_days(uid) == []   # 소모 없음


def test_paused_study_then_protect(uid):
    from app import db
    from app.models.models import GemLog, GemReason
    setup_streak(uid, 10, T - 3 * D, shields=1, gems=25)
    state(uid, T)
    r = study(uid, T)
    assert r['streak'] == 10   # 멈춤 중 학습해도 끊기기 전 값 고정
    s = state(uid, T)
    assert s['paused'] is True and s['current'] == 10 and s['today_done'] is True

    from app.services.game.farm_v2 import streak_v2
    out = streak_v2.protect_streak(uid, now=noon(T))
    assert out['streak'] == 13          # 10 + 빈 날 2 + 오늘 1
    assert out['shields_spent'] == 2 and out['shield_cnt'] == 0 and out['gem_cnt'] == 15
    assert out['days'] == [(T - 2 * D).isoformat(), (T - D).isoformat()]
    logs = (db.session.query(GemLog)
            .filter(GemLog.user_id == uid, GemLog.reason == GemReason.ITEM_PURCHASE).all())
    assert len(logs) == 1 and logs[0].amount == -10 and logs[0].source_type == 'farm_item'
    s = state(uid, T)
    assert s['paused'] is False and s['current'] == 13 and s['notice'] is None
    study(uid, T + D)
    assert state(uid, T + D)['current'] == 14


def test_protect_gem_shortage_is_atomic(uid):
    from app.services.game.farm_v2 import shop, streak_v2
    setup_streak(uid, 10, T - 3 * D, shields=1, gems=5)
    state(uid, T)
    with pytest.raises(shop.GemShortage) as ei:
        streak_v2.protect_streak(uid, now=noon(T))
    assert ei.value.shortage == 5
    assert shields(uid) == 1 and gem_cnt(uid) == 5
    s = state(uid, T)
    assert s['paused'] is True and s['current'] == 10


def test_protect_not_paused_409(uid):
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 10, T - D, gems=100)
    with pytest.raises(ValueError):
        streak_v2.protect_streak(uid, now=noon(T))
    assert gem_cnt(uid) == 100


def test_paused_another_day_missed_recalculates(uid):
    setup_streak(uid, 10, T - 2 * D, shields=0)
    s = state(uid, T)
    assert s['pause']['needed'] == 1
    s = state(uid, T + D)             # 오늘도 비움 → 빈 날 2
    p = s['pause']
    assert s['paused'] is True and p['needed'] == 2 and p['short'] == 2
    assert p['deadline'] == '2026-09-27T15:00:00+00:00'
    assert s['notice']['type'] == 'paused' and s['notice']['needed'] == 2


def test_paused_auto_applies_when_shields_become_enough(uid):
    from app.services.game.farm_v2 import shop
    setup_streak(uid, 10, T - 3 * D, shields=0, gems=30)
    assert state(uid, T)['paused'] is True
    shop.purchase(uid, 'shield_1', 2, now_utc=noon(T))   # 상점에서 미리 사 둠
    s = state(uid, T)
    assert s['paused'] is False and s['current'] == 12 and s['shield_cnt'] == 0
    assert s['notice']['type'] == 'protected'


def test_paused_grows_past_7_breaks(uid):
    setup_streak(uid, 10, T - 3 * D, shields=0)
    assert state(uid, T)['pause']['needed'] == 2
    s = state(uid, T + 6 * D)          # 빈 날 8
    assert s['paused'] is False and s['current'] == 0
    assert s['notice']['type'] == 'broken' and s['notice']['gap_days'] == 8


def test_pause_deadline_passes_breaks(uid):
    setup_streak(uid, 10, T - 2 * D, shields=0)
    assert state(uid, T)['paused'] is True        # 빈 날 = T-1, 기한 = T+1 자정 종료
    study(uid, T)
    study(uid, T + D)
    s = state(uid, T + D)
    assert s['paused'] is True and s['current'] == 10
    s = state(uid, T + 2 * D)                     # 기한 경과
    assert s['paused'] is False and s['current'] == 2   # T, T+1 만 이어짐
    assert s['best'] == 10
    assert s['notice']['type'] == 'broken' and s['notice']['lost_streak'] == 10


def test_recover_legacy_endpoint_with_owned_shields(uid):
    from app import db
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 10, T - 3 * D, shields=1)
    state(uid, T)
    # 정산 뒤 보호권을 따로 받은 상황(경합) — recover 는 보유분만으로 적용
    from app.models.models import FarmItem, FarmItemReason
    from app.services.game.farm_v2 import inventory
    inventory.grant(uid, FarmItem.SHIELD, 1, FarmItemReason.WEEKLY_GRANT, description='t')
    db.session.commit()
    out = streak_v2.recover_streak(uid, now=noon(T))
    assert out['current'] == 12 and out['shield_cnt'] == 0


def test_recover_legacy_endpoint_short(uid):
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 10, T - 3 * D, shields=1)
    state(uid, T)
    with pytest.raises(PermissionError):
        streak_v2.recover_streak(uid, now=noon(T))
    assert shields(uid) == 1


def test_legacy_recovery_window_is_upgraded(uid):
    """옛 코드가 연 48시간 창(current 를 내리고 recovery_from_streak 에 보관)."""
    from app import db
    from app.models.models import UserStreak
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 20, T - 2 * D, shields=1)
    st = db.session.query(UserStreak).filter(UserStreak.user_id == uid).first()
    st.recovery_from_streak = 20
    st.recovery_deadline = streak_v2._recovery_deadline(T - D, 'Asia/Seoul')
    st.current_streak = 0
    st.last_qualified_day = None
    db.session.commit()
    s = state(uid, T)
    assert s['current'] == 21 and s['paused'] is False and s['shield_cnt'] == 0


# ──────────────────────────────────────────────────────────────
# 다시 잇기 도전
# ──────────────────────────────────────────────────────────────

def test_earn_back_offer_start_success(uid):
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 34, T - 10 * D, shields=3)   # 빈 날 9
    s = state(uid, T)
    assert s['current'] == 0 and s['shield_cnt'] == 3
    eb = s['earn_back']
    assert eb['status'] == 'offered' and eb['from_streak'] == 34 and eb['days_required'] == 3
    assert eb['offer_until'] == (T + 2 * D).isoformat() and eb['start_day'] is None
    assert eb['result_streak'] == 37
    assert s['notice']['type'] == 'broken' and s['notice']['earn_back']['status'] == 'offered'

    s = streak_v2.start_earn_back(uid, now=noon(T))
    assert s['earn_back']['status'] == 'active' and s['earn_back']['start_day'] == T.isoformat()
    assert s['earn_back']['days_done'] == 0

    study(uid, T)
    s = state(uid, T)
    assert s['earn_back']['days_done'] == 1 and s['earn_back']['today_done'] is True
    study(uid, T + D)
    r = study(uid, T + 2 * D)
    assert r['streak'] == 37
    s = state(uid, T + 2 * D)
    assert s['current'] == 37 and s['best'] == 37 and s['earn_back'] is None
    n = s['notice']
    assert n['type'] == 'earn_back_success' and n['from_streak'] == 34
    assert n['added'] == 3 and n['streak'] == 37
    # 이후 날짜는 복구값에 +1 씩 — 되짚기가 깎지 않는다
    study(uid, T + 3 * D)
    assert state(uid, T + 3 * D)['current'] == 38
    study(uid, T + 4 * D)
    assert state(uid, T + 4 * D)['current'] == 39


def test_earn_back_fails_on_missed_day(uid):
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 34, T - 10 * D)
    state(uid, T)
    streak_v2.start_earn_back(uid, now=noon(T))
    study(uid, T)
    s = state(uid, T + 2 * D)          # T+1 비움
    assert s['earn_back'] is None
    assert s['next_earn_back_on'] == (T + 30 * D).isoformat()
    study(uid, T + 2 * D)
    assert state(uid, T + 2 * D)['current'] < 34


def test_earn_back_cooldown(uid):
    from app import db
    from app.models.models import UserStreak
    setup_streak(uid, 40, T - 10 * D)
    st = db.session.query(UserStreak).filter(UserStreak.user_id == uid).first()
    st.earn_back_last_start_day = T - 5 * D
    db.session.commit()
    s = state(uid, T)
    assert s['earn_back'] is None
    assert s['notice']['type'] == 'broken' and s['notice']['earn_back'] is None
    assert s['notice']['next_earn_back_on'] == (T + 25 * D).isoformat()
    assert s['next_earn_back_on'] == (T + 25 * D).isoformat()


def test_earn_back_offer_expires(uid):
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 34, T - 10 * D)
    assert state(uid, T)['earn_back']['status'] == 'offered'
    assert state(uid, T + 2 * D)['earn_back']['status'] == 'offered'   # 마지막 시작 가능일
    assert state(uid, T + 3 * D)['earn_back'] is None
    with pytest.raises(ValueError):
        streak_v2.start_earn_back(uid, now=noon(T + 3 * D))


def test_earn_back_not_offered_below_30(uid):
    setup_streak(uid, 29, T - 10 * D)
    s = state(uid, T)
    assert s['earn_back'] is None and s['notice']['earn_back'] is None


def test_start_without_offer_409(uid):
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 5, T - D)
    with pytest.raises(ValueError):
        streak_v2.start_earn_back(uid, now=noon(T))


# ──────────────────────────────────────────────────────────────
# notice ack / overview
# ──────────────────────────────────────────────────────────────

def test_notice_ack(uid):
    from app.services.game.farm_v2 import streak_v2
    setup_streak(uid, 10, T - 2 * D, shields=1)
    n = state(uid, T)['notice']
    assert n is not None
    assert streak_v2.ack_notice(uid, 'wrong-id')['cleared'] is False
    assert state(uid, T)['notice']['id'] == n['id']        # ack 전까지 계속 내려온다
    assert streak_v2.ack_notice(uid, n['id'])['cleared'] is True
    assert state(uid, T)['notice'] is None
    assert streak_row(uid).pending_notice is None


def test_overview_extras(uid):
    from app.services.game.farm_v2 import query, streak_v2
    setup_streak(uid, 10, T - 3 * D, shields=1)
    streak_v2.settle_on_visit(uid, now=noon(T))
    o = query._streak_state(uid, noon(T))
    assert o['current'] == 10 and o['paused'] is True
    assert o['pause']['short'] == 1 and o['earn_back'] is None
    assert 'notice' not in o
    assert o['recovery_until'] == o['pause']['deadline']


def test_notice_json_is_plain(uid):
    setup_streak(uid, 10, T - 2 * D, shields=1)
    state(uid, T)
    json.loads(streak_row(uid).pending_notice)


# ──────────────────────────────────────────────────────────────
# 상점 — 하루 보석 한도 제거
# ──────────────────────────────────────────────────────────────

def test_no_daily_gem_limit(uid):
    from app.services.game.farm_v2 import shop
    setup_streak(uid, 0, T, gems=500)
    assert not hasattr(shop, 'DAILY_GEM_SPEND_LIMIT')
    a = shop.purchase(uid, 'shield_1', 10, now_utc=noon(T))
    b = shop.purchase(uid, 'shield_1', 5, now_utc=noon(T))
    c = shop.purchase(uid, 'nutrient_100', 2, now_utc=noon(T))
    assert a['granted'] == 10 and b['item_qty'] == 15 and c['granted'] == 200
    assert gem_cnt(uid) == 500 - 150 - 50
    with pytest.raises(ValueError):
        shop.purchase(uid, 'shield_1', 11, now_utc=noon(T))   # 1회 수량 상한은 유지


def test_shop_gem_shortage(uid):
    from app.services.game.farm_v2 import shop
    setup_streak(uid, 0, T, gems=15)
    with pytest.raises(shop.GemShortage) as ei:
        shop.purchase(uid, 'shield_1', 2, now_utc=noon(T))
    assert ei.value.shortage == 5 and isinstance(ei.value, PermissionError)
    assert gem_cnt(uid) == 15


def test_routes_registered(app):
    rules = {r.rule for r in app.url_map.iter_rules()}
    for path in ('/farm/streak', '/farm/streak/recover', '/farm/streak/protect',
                 '/farm/streak/earn-back/start', '/farm/streak/notice/ack'):
        assert path in rules


# ──────────────────────────────────────────────────────────────
# 라우트 (HTTP 형태) — 실제 현재 시각 기준
# ──────────────────────────────────────────────────────────────

def _client_headers(app, user_id):
    from app.utils.jwt_utils import generate_access_token
    token = generate_access_token(str(user_id))
    return app.test_client(), {'Authorization': 'Bearer {}'.format(token)}


def test_route_protect_shortage_then_success(app, uid):
    from app.services.game.farm_v2 import localday
    today = localday.user_local_day(uid)
    setup_streak(uid, 10, today - 3 * D, shields=1, gems=5)
    client, h = _client_headers(app, uid)

    r = client.get('/farm/streak', headers=h)
    body = r.get_json()
    assert r.status_code == 200 and body['data']['paused'] is True
    notice_id = body['data']['notice']['id']

    r = client.post('/farm/streak/protect', headers=h)
    body = r.get_json()
    assert r.status_code == 400 and body['code'] == 400
    assert body['message'] == '보석이 5개 모자라요' and body['data'] == {'shortage': 5}

    from app import db
    from app.models.models import User
    db.session.query(User).filter(User.id == uid).update({'gem_cnt': 30})
    db.session.commit()
    r = client.post('/farm/streak/protect', headers=h)
    body = r.get_json()
    assert r.status_code == 200
    assert set(body['data']) == {'streak', 'shields_spent', 'shield_cnt', 'gem_cnt', 'days'}
    assert body['data']['streak'] == 12 and body['data']['gem_cnt'] == 20

    r = client.post('/farm/streak/protect', headers=h)
    assert r.status_code == 409

    r = client.post('/farm/streak/notice/ack', headers=h, json={'id': notice_id})
    assert r.status_code == 200 and r.get_json() == {'code': 200}


def test_route_earn_back_start(app, uid):
    from app.services.game.farm_v2 import localday
    today = localday.user_local_day(uid)
    setup_streak(uid, 34, today - 10 * D)
    client, h = _client_headers(app, uid)
    r = client.get('/farm/streak', headers=h)
    assert r.get_json()['data']['earn_back']['status'] == 'offered'
    r = client.post('/farm/streak/earn-back/start', headers=h)
    data = r.get_json()['data']
    assert r.status_code == 200 and data['earn_back']['status'] == 'active'
    assert 'calendar' in data and 'notice' in data
    assert client.post('/farm/streak/earn-back/start', headers=h).status_code == 409
