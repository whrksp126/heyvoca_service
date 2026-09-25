"""작물 경험치(XP) 계약 검증 — 정본: crop_xp_contract.md §1/§2.

xp_raw = round(stability_days x 10). 단계 문턱 XP = 성장 문턱 일수(farm_v2/constants.py
STAGE_*_DAYS, GOLDEN_MIN_STABILITY_DAYS) x 10. 표시 XP 는 `max(xp_raw, floor(stage))` —
단계가 안 내려가듯 표시 XP 도 오답으로 안 내려간다.

1부(순수 함수, DB 불필요): farm_v2/xp.py 자체 공식.
2부(실제 로컬 MySQL, test_streak_shield.py 와 같은 패턴): answer.on_answer 페이로드에
    xp_from/xp_to/xp_delta/xp_next 가 실제로 실리는지, 예시 수치와 일치하는지.

    docker exec heyvoca_back_local python3 -m pytest tests/test_crop_xp.py -q
"""

import datetime as dt
import json
import uuid

import pytest

from app.models.models import VisualStage
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import xp as xp_calc

NOW = dt.datetime(2026, 9, 25, 3, 0, 0)


# ──────────────────────────────────────────────────────────────
# 1. 순수 함수 — xp.py 자체 공식
# ──────────────────────────────────────────────────────────────

def test_xp_raw_is_stability_times_ten_rounded():
    assert xp_calc.xp_raw(3.13) == 31
    assert xp_calc.xp_raw(9.0) == 90
    assert xp_calc.xp_raw(0) == 0
    assert xp_calc.xp_raw(None) == 0
    assert xp_calc.xp_raw(-5) == 0   # 음수 방어


def test_stage_floor_derives_from_constants_not_hardcoded():
    # 계약서 예시(새싹 50/당근 600/황금 1800)는 STAGE_SPROUT_DAYS=5, STAGE_CARROT_DAYS=60,
    # GOLDEN_MIN_STABILITY_DAYS=180 에서 그대로 나온다.
    assert xp_calc.xp_floor(VisualStage.UNPLANTED_SEED) == 0
    assert xp_calc.xp_floor(VisualStage.PLANTED_SEED) == 0
    assert xp_calc.xp_floor(VisualStage.SPROUT) == round(C.STAGE_SPROUT_DAYS * 10) == 50
    assert xp_calc.xp_floor(VisualStage.LEAF) == round(C.STAGE_LEAF_DAYS * 10)
    assert xp_calc.xp_floor(VisualStage.CARROT) == round(C.STAGE_CARROT_DAYS * 10) == 600
    assert xp_calc.xp_floor(VisualStage.GOLDEN) == round(C.GOLDEN_MIN_STABILITY_DAYS * 10) == 1800


def test_xp_next_thresholds():
    assert xp_calc.xp_next(VisualStage.UNPLANTED_SEED) == xp_calc.STAGE_FLOOR[VisualStage.SPROUT]
    assert xp_calc.xp_next(VisualStage.PLANTED_SEED) == xp_calc.STAGE_FLOOR[VisualStage.SPROUT]
    assert xp_calc.xp_next(VisualStage.SPROUT) == xp_calc.STAGE_FLOOR[VisualStage.LEAF]
    assert xp_calc.xp_next(VisualStage.LEAF) == xp_calc.STAGE_FLOOR[VisualStage.CARROT]
    assert xp_calc.xp_next(VisualStage.CARROT) == xp_calc.STAGE_FLOOR[VisualStage.GOLDEN]
    assert xp_calc.xp_next(VisualStage.GOLDEN) is None   # 최고 단계


def test_xp_of_unplanted_seed_is_always_zero():
    assert xp_calc.xp_of(VisualStage.UNPLANTED_SEED, {'stability': 999}) == 0
    assert xp_calc.xp_of(None, {'stability': 999}) == 0


def test_xp_of_uses_floor_when_stability_regresses():
    # 오답으로 stability 가 떨어져도(예: 새싹인데 stability=2) 표시 XP 는 새싹 floor(50) 아래로
    # 내려가지 않는다 — 단계 자체가 안 내려가는 규칙과 같은 축.
    assert xp_calc.xp_of(VisualStage.SPROUT, {'stability': 2.0}) == 50
    # floor 위로는 원래 값 그대로
    assert xp_calc.xp_of(VisualStage.SPROUT, {'stability': 9.0}) == 90


def test_xp_of_matches_task_examples():
    # 새 단어 첫 정답 stability ~3.13일 (constants.py 실측 주석) → PLANTED_SEED, xp ~31
    assert xp_calc.xp_of(VisualStage.PLANTED_SEED, {'stability': 3.13}) == 31
    # 3일 뒤 Good 제때 맞혀 stability ~9일 → SPROUT, xp ~90
    assert xp_calc.xp_of(VisualStage.SPROUT, {'stability': 9.0}) == 90


# ──────────────────────────────────────────────────────────────
# 2. 통합 — answer.on_answer 페이로드 (실제 로컬 MySQL)
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
    except Exception as e:
        pytest.skip('로컬 DB 에 연결할 수 없어 건너뜀: {}'.format(e))
    return _app


@pytest.fixture
def ctx(app):
    with app.app_context():
        yield


@pytest.fixture
def uid(ctx):
    from app import db
    from app.models.models import User
    code = uuid.uuid4().hex[:12]
    user = User(level_id=None, email='xp-test-{}@test.local'.format(code), google_id=None,
                username=None, name='xptest', phone=None, last_logged_at=None,
                refresh_token=None, code=code, book_cnt=0, gem_cnt=0, set_goal_cnt=0)
    db.session.add(user)
    db.session.commit()
    user_id = user.id
    yield user_id
    db.session.rollback()
    from app.models.models import (FarmEventLog, UserFarmItemLog, UserFarmItem, GemLog,
                                   UserStudyLog, UserVocaGame, UserVoca)
    uv_ids = [r[0] for r in db.session.query(UserVoca.id).filter(UserVoca.user_id == user_id).all()]
    if uv_ids:
        db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id.in_(uv_ids)).delete(synchronize_session=False)
        db.session.query(UserStudyLog).filter(UserStudyLog.user_voca_id.in_(uv_ids)).delete(synchronize_session=False)
    for model in (FarmEventLog, UserFarmItemLog, UserFarmItem, GemLog):
        db.session.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    db.session.query(UserVoca).filter(UserVoca.user_id == user_id).delete(synchronize_session=False)
    db.session.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.session.commit()


def _make_uv(user_id, stability=None, next_review_offset_days=5):
    """UserVoca 1개. stability=None 이면 미학습(new) FSRS state."""
    from app import db
    from app.models.models import UserVoca
    if stability is None:
        data = {'schema_version': 3, 'fsrs': {'state': 'new'}}
    else:
        data = {'schema_version': 3, 'fsrs': {
            'state': 'review', 'stability': stability,
            'next_review': (NOW + dt.timedelta(days=next_review_offset_days)).isoformat() + 'Z',
        }}
    uv = UserVoca(user_id=user_id, voca_id=999999, word='xptest', dict_lang='en',
                  data=json.dumps(data, ensure_ascii=False))
    db.session.add(uv)
    db.session.commit()
    return uv


def _make_game(user_id, uv_id, visual_stage, highest_stage=None):
    # UserVocaGame.__init__ 은 (user_voca_id, user_id) 만 받는다 — 나머지는 속성으로 덮어쓴다.
    from app import db
    from app.models.models import HealthState, UserVocaGame
    game = UserVocaGame(uv_id, user_id)
    game.visual_stage = visual_stage
    game.highest_stage = highest_stage or visual_stage
    game.health_state = HealthState.FRESH
    db.session.add(game)
    db.session.commit()
    return game


def test_new_word_first_correct_answer_xp(uid):
    """새 단어 첫 정답 — 계약서 예시: xp_to ~31, 심은 씨앗→다음 문턱 50."""
    from app.services.game.farm_v2 import answer

    uv = _make_uv(uid, stability=None)
    fsrs_before = {}   # 아직 아무것도 없음
    fsrs_after = {'state': 'review', 'stability': 3.13,
                  'next_review': (NOW + dt.timedelta(days=3)).isoformat() + 'Z'}
    uv.data = json.dumps({'schema_version': 3, 'fsrs': fsrs_after}, ensure_ascii=False)
    from app import db
    db.session.commit()

    payload = answer.on_answer(uid, uv.id, was_correct=True, session_id=None,
                               now=NOW, fsrs_before=fsrs_before)

    assert payload['stage'] == VisualStage.PLANTED_SEED
    assert payload['xp_from'] == 0
    assert payload['xp_to'] == 31
    assert payload['xp_delta'] == 31
    assert payload['xp_next'] == 50


def test_sprout_promotion_after_three_days_good_xp(uid):
    """3일 뒤 Good 을 제때 맞혀 새싹으로 — 계약서 예시: xp_to ~90."""
    from app.services.game.farm_v2 import answer

    uv = _make_uv(uid, stability=3.13, next_review_offset_days=0)
    _make_game(uid, uv.id, VisualStage.PLANTED_SEED)

    fsrs_before = {'state': 'review', 'stability': 3.13}
    fsrs_after = {'state': 'review', 'stability': 9.0,
                  'next_review': (NOW + dt.timedelta(days=9)).isoformat() + 'Z'}
    from app import db
    uv.data = json.dumps({'schema_version': 3, 'fsrs': fsrs_after}, ensure_ascii=False)
    db.session.commit()

    payload = answer.on_answer(uid, uv.id, was_correct=True, session_id=None,
                               now=NOW, fsrs_before=fsrs_before)

    assert payload['stage'] == VisualStage.SPROUT
    assert payload['grew'] is True
    assert payload['xp_from'] == 31
    assert payload['xp_to'] == 90
    assert payload['xp_delta'] == 59
    # 이파리 문턱 = STAGE_LEAF_DAYS(실제 21일, constants.py 주석의 15일은 stale) x 10
    assert payload['xp_next'] == round(C.STAGE_LEAF_DAYS * 10)


def test_wrong_answer_does_not_drop_xp_below_stage_floor(uid):
    """새싹 상태에서 오답 — 계약서 예시: xp floor 50 아래로 안 내려간다."""
    from app.services.game.farm_v2 import answer

    uv = _make_uv(uid, stability=9.0, next_review_offset_days=9)
    _make_game(uid, uv.id, VisualStage.SPROUT)

    fsrs_before = {'state': 'review', 'stability': 9.0}
    # 오답 후 FSRS lapse 로 stability 급락
    fsrs_after = {'state': 'review', 'stability': 2.0,
                  'next_review': (NOW + dt.timedelta(days=1)).isoformat() + 'Z'}
    from app import db
    uv.data = json.dumps({'schema_version': 3, 'fsrs': fsrs_after}, ensure_ascii=False)
    db.session.commit()

    payload = answer.on_answer(uid, uv.id, was_correct=False, session_id=None,
                               now=NOW, fsrs_before=fsrs_before)

    assert payload['stage'] == VisualStage.SPROUT   # 성장 단계는 안 내려간다
    assert payload['xp_from'] == 90
    assert payload['xp_to'] == 50                    # floor(새싹) — xp_raw(20) 보다 높다
    assert payload['xp_delta'] == -40                # 음수 가능(계약서 §2)
    assert payload['xp_next'] == round(C.STAGE_LEAF_DAYS * 10)


def test_pct_and_xp_share_the_same_progress_axis(uid):
    """막대(pct_*)와 xp 는 floor~next 구간 기준으로 같은 값을 가리켜야 한다(계약서 §2)."""
    from app.services.game.farm_v2 import answer

    uv = _make_uv(uid, stability=9.0, next_review_offset_days=6)
    _make_game(uid, uv.id, VisualStage.SPROUT)

    fsrs_before = {'state': 'review', 'stability': 9.0}
    fsrs_after = {'state': 'review', 'stability': 15.0,
                  'next_review': (NOW + dt.timedelta(days=6)).isoformat() + 'Z'}
    from app import db
    uv.data = json.dumps({'schema_version': 3, 'fsrs': fsrs_after}, ensure_ascii=False)
    db.session.commit()

    payload = answer.on_answer(uid, uv.id, was_correct=True, session_id=None,
                               now=NOW, fsrs_before=fsrs_before)

    floor = xp_calc.xp_floor(payload['stage'])
    nxt = xp_calc.xp_next(payload['stage'])
    expected_pct = int(round((payload['xp_to'] - floor) / (nxt - floor) * 100))
    assert payload['pct_to'] == expected_pct
