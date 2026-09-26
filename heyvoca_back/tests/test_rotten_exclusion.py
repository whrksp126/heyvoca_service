"""썩은(ROTTEN) 단어가 학습 진입에서 제외되는지 검증.

배경(2026-09 QA, prod 확인): `/study/recommend` 가 V1 헬퍼
`services/game/farm.dead_user_voca_ids`(`user_voca_game.life == 'DEAD'`)로 걸렀는데,
V2 는 부패를 `health_state == 'ROTTEN'` 에 적고 `life` 는 'ALIVE' 로 둔다.
prod 실측 ROTTEN 21건 / DEAD 0건 → 필터가 한 건도 못 걸러 썩은 단어가 출제됐다.

여기서 검증하는 것:
  1. farm_v2.query.rotten_ids_from_rows — 부패 판정 정의 (순수 함수, DB 불필요)
  2. routes/study.py — 두 학습 진입(/study/recommend, /study/chat-session)이
     새 헬퍼를 쓰고, 필터가 target_states 앞(= 모든 모드 공통 경로)에 있는지 (소스 검사)
  3. routes/voca_indexs._farm_state — 클라이언트가 그림을 고르는 필드(farm.studiable /
     health / crop / stage)가 썩은 단어에서 올바른지
"""

import datetime as dt
import json
import os

from app.models.models import HealthState, VisualStage
from app.services.game.farm_v2.query import rotten_ids_from_rows, rotten_user_voca_ids

NOW = dt.datetime(2026, 9, 23, 3, 0, 0)

BACK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _data(stability=10.0, due_offset_days=None, state='review'):
    """UserVoca.data (v3 payload) JSON 문자열. due_offset_days=None → 예정일 없음."""
    fsrs = {'state': state, 'stability': stability}
    if due_offset_days is not None:
        fsrs['next_review'] = (NOW + dt.timedelta(days=due_offset_days)).isoformat() + 'Z'
    return json.dumps({'schema_version': 3, 'fsrs': fsrs}, ensure_ascii=False)


def _row(uv_id, data=None, stage=VisualStage.LEAF, health=HealthState.FRESH, protection=0):
    """LEFT JOIN 결과 1행: (user_voca_id, data, visual_stage, health_state, protection_days)."""
    return (uv_id, data, stage, health, protection)


# ──────────────────────────────────────────────
# 1. 저장값이 ROTTEN 인 단어
# ──────────────────────────────────────────────

def test_stored_rotten_is_excluded():
    rows = [_row(1, _data(due_offset_days=-40), health=HealthState.ROTTEN)]
    assert rotten_ids_from_rows(rows, NOW) == {1}


def test_stored_rotten_excluded_even_if_due_is_in_the_future():
    # 되살리기 전에는 예정일이 미래로 밀려 있어도(회복 중 아님) 여전히 학습 불가다.
    rows = [_row(1, _data(due_offset_days=+30), health=HealthState.ROTTEN)]
    assert rotten_ids_from_rows(rows, NOW) == {1}


# ──────────────────────────────────────────────
# 2. 시간상 썩었지만 저장값이 갱신되지 않은 단어 (이번 버그의 핵심)
# ──────────────────────────────────────────────

def test_time_rotten_with_stale_state_is_excluded():
    # stability 10 → 유예 G = clamp(ceil(10*0.5),3,30) = 5일. 예정일 30일 전 → 이미 부패.
    # 저장값은 마지막 쓰기 시점의 CRITICAL 에 멈춰 있다.
    rows = [_row(1, _data(stability=10.0, due_offset_days=-30), health=HealthState.CRITICAL)]
    assert rotten_ids_from_rows(rows, NOW) == {1}


def test_just_before_rot_boundary_is_kept():
    # G=5일. 예정일 4일 전 → 아직 CRITICAL, 학습 가능해야 한다.
    rows = [_row(1, _data(stability=10.0, due_offset_days=-4), health=HealthState.FRESH)]
    assert rotten_ids_from_rows(rows, NOW) == set()


def test_protection_days_delay_rot():
    # 무료 긴급 급수로 부패만 밀린다(8.4). G=5 + 보호 2일 = 7일 → 6일 지연은 아직 안 썩음.
    rows = [_row(1, _data(stability=10.0, due_offset_days=-6), protection=2)]
    assert rotten_ids_from_rows(rows, NOW) == set()
    rows = [_row(1, _data(stability=10.0, due_offset_days=-8), protection=2)]
    assert rotten_ids_from_rows(rows, NOW) == {1}


# ──────────────────────────────────────────────
# 3. 황금은 절대 썩지 않는다 (기획 10.3)
# ──────────────────────────────────────────────

def test_golden_is_never_excluded():
    rows = [_row(1, _data(stability=90.0, due_offset_days=-400), stage=VisualStage.GOLDEN,
                 health=HealthState.GOLDEN)]
    assert rotten_ids_from_rows(rows, NOW) == set()


def test_golden_stage_wins_over_stored_rotten_state():
    # 황금으로 승급하기 전 저장값이 ROTTEN 인 채 남아 있어도 황금은 학습 가능하다.
    # (/vocaIndexs 의 _farm_state 와 동일한 우선순위 — is_golden 이 already_rotten 보다 먼저다)
    rows = [_row(1, _data(due_offset_days=-400), stage=VisualStage.GOLDEN,
                 health=HealthState.ROTTEN)]
    assert rotten_ids_from_rows(rows, NOW) == set()


# ──────────────────────────────────────────────
# 4. 보유 씨앗 / 예정일 없음 — 썩지 않는다 (기획 6.4)
# ──────────────────────────────────────────────

def test_unplanted_seed_is_never_excluded():
    rows = [_row(1, _data(due_offset_days=-400), stage=VisualStage.UNPLANTED_SEED)]
    assert rotten_ids_from_rows(rows, NOW) == set()


def test_no_due_date_is_never_excluded():
    rows = [_row(1, _data(due_offset_days=None), stage=VisualStage.LEAF)]
    assert rotten_ids_from_rows(rows, NOW) == set()


def test_null_data_is_never_excluded():
    rows = [_row(1, None, stage=VisualStage.PLANTED_SEED)]
    assert rotten_ids_from_rows(rows, NOW) == set()


def test_broken_json_data_is_never_excluded():
    rows = [_row(1, '{not json', stage=VisualStage.LEAF)]
    assert rotten_ids_from_rows(rows, NOW) == set()


# ──────────────────────────────────────────────
# 5. 건강한 단어는 남는다 / 게임 행이 없는 단어
# ──────────────────────────────────────────────

def test_healthy_word_is_kept():
    rows = [_row(1, _data(stability=10.0, due_offset_days=+5), health=HealthState.FRESH)]
    assert rotten_ids_from_rows(rows, NOW) == set()


def test_missing_user_voca_game_row_does_not_explode():
    # LEFT JOIN 결과로 게임 행이 없으면 stage/health/protection 이 전부 None 으로 들어온다.
    rows = [(7, _data(stability=10.0, due_offset_days=-400), None, None, None)]
    assert rotten_ids_from_rows(rows, NOW) == set()


def test_mixed_rows_return_only_rotten_ids():
    rows = [
        _row(1, _data(stability=10.0, due_offset_days=-30), health=HealthState.CRITICAL),  # 시간상 부패
        _row(2, _data(due_offset_days=-40), health=HealthState.ROTTEN),                    # 저장값 부패
        _row(3, _data(stability=10.0, due_offset_days=+3)),                                # 건강
        _row(4, _data(due_offset_days=-400), stage=VisualStage.GOLDEN),                    # 황금
        (5, None, None, None, None),                                                       # 게임 행 없음
    ]
    assert rotten_ids_from_rows(rows, NOW) == {1, 2}


def test_empty_candidate_list_short_circuits_without_db():
    # DB 세션이 없어도(앱 컨텍스트 밖) 빈 후보는 즉시 빈 집합이어야 한다.
    assert rotten_user_voca_ids('00000000-0000-0000-0000-000000000000', []) == set()
    assert rotten_user_voca_ids('00000000-0000-0000-0000-000000000000', None) == set()


# ──────────────────────────────────────────────
# 6. 라우트 배선 — 학습 진입이 V2 헬퍼를 쓰는지 (소스 검사, DB 불필요)
# ──────────────────────────────────────────────

def _study_source():
    with open(os.path.join(BACK_DIR, 'app', 'routes', 'study.py'), encoding='utf-8') as f:
        return f.read()


def test_study_routes_do_not_use_v1_dead_filter():
    # life=='DEAD' 는 V2 에서 항상 비어 있다 — 다시 들어오면 이 버그가 그대로 재발한다.
    # (주석에는 이름이 남아 있으므로 호출/임포트만 본다)
    src = _study_source()
    assert 'dead_user_voca_ids(user_id' not in src
    assert 'import dead_user_voca_ids' not in src


def test_study_routes_use_rotten_helper_twice():
    # /study/recommend 와 /study/chat-session 두 진입 모두.
    assert _study_source().count('rotten_user_voca_ids(user_id') == 2


def test_rotten_filter_runs_before_target_states_filter():
    """필터가 target_states 분기보다 앞이어야 AI 추천·자유 설정 테스트·quick 전부에 걸린다."""
    src = _study_source()
    filter_pos = src.index('rotten_user_voca_ids(user_id')
    target_states_pos = src.index('allowed_stages = expand_target_states(target_states)')
    assert filter_pos < target_states_pos


def test_study_routes_fsrs_dict_includes_last_review_reps_lapses():
    """/study/recommend, /study/chat-session 응답의 fsrs 객체 — 프론트가 "N일 전 학습"
    표시에 쓰는 last_review/reps/lapses 가 두 곳 모두에 내려가야 한다."""
    src = _study_source()
    fsrs_dict_blocks = [
        src[m.end():src.index('}', m.end())]
        for m in __import__('re').finditer(r"'fsrs':\s*\{", src)
    ]
    # get_recommend / get_chat_session 두 곳 모두에 'fsrs': {...} 슬라이스 딕셔너리가 있어야 한다.
    assert len(fsrs_dict_blocks) == 2
    for block in fsrs_dict_blocks:
        for key in ("'last_review'", "'reps'", "'lapses'"):
            assert key in block, '{} 누락: {}'.format(key, block)


# ──────────────────────────────────────────────
# 7. /vocaIndexs 응답 — 클라이언트가 그림/차단에 쓰는 필드
# ──────────────────────────────────────────────

class _FakeGame:
    def __init__(self, visual_stage, health_state, protection_days=0, highest_stage=None):
        self.visual_stage = visual_stage
        self.health_state = health_state
        self.protection_days = protection_days
        self.highest_stage = highest_stage or visual_stage


def _farm_payload(game, fsrs):
    from app.routes.voca_indexs import _farm_state
    from app.services.game.farm_v2 import answer as farm_answer
    from app.services.game.farm_v2 import growth as farm_growth
    from app.services.game.farm_v2 import health as farm_health
    return _farm_state(game, fsrs, NOW, farm_answer, farm_growth, farm_health)


def test_voca_indexs_farm_payload_for_rotten_word():
    fsrs = {'state': 'review', 'stability': 10.0,
            'next_review': (NOW - dt.timedelta(days=30)).isoformat() + 'Z'}
    payload = _farm_payload(_FakeGame(VisualStage.CARROT, HealthState.CRITICAL), fsrs)

    # 화면이 읽는 필드가 모두 있어야 한다 — crop/stage 로 그림, health 로 상태 문구,
    # studiable 로 학습 차단을 고른다.
    for key in ('stage', 'crop', 'highest_stage', 'health', 'pct',
                'days_to_review', 'days_to_rot', 'studiable'):
        assert key in payload, key

    assert payload['health'] == HealthState.ROTTEN   # 저장값이 CRITICAL 이어도 조회 시 계산이 이긴다
    assert payload['studiable'] is False
    assert payload['crop'] == 'carrot'               # 썩어도 성장 단계 그림은 유지된다(기획 6)
    assert payload['stage'] == VisualStage.CARROT
    assert payload['days_to_rot'] == 0


def test_voca_indexs_farm_payload_studiable_for_healthy_and_golden():
    fsrs_ok = {'state': 'review', 'stability': 10.0,
               'next_review': (NOW + dt.timedelta(days=5)).isoformat() + 'Z'}
    healthy = _farm_payload(_FakeGame(VisualStage.LEAF, HealthState.FRESH), fsrs_ok)
    assert healthy['studiable'] is True and healthy['health'] == HealthState.FRESH

    fsrs_old = {'state': 'review', 'stability': 90.0,
                'next_review': (NOW - dt.timedelta(days=400)).isoformat() + 'Z'}
    golden = _farm_payload(_FakeGame(VisualStage.GOLDEN, HealthState.GOLDEN), fsrs_old)
    assert golden['studiable'] is True and golden['health'] == HealthState.GOLDEN


def test_voca_indexs_and_helper_agree():
    """같은 단어에 대해 /vocaIndexs 의 studiable 과 추천 필터의 판정이 어긋나면 안 된다."""
    cases = [
        (VisualStage.CARROT, HealthState.CRITICAL, -30, True),    # 시간상 부패
        (VisualStage.CARROT, HealthState.ROTTEN,   -30, True),    # 저장값 부패
        (VisualStage.LEAF,   HealthState.FRESH,     +5, False),   # 건강
        (VisualStage.GOLDEN, HealthState.GOLDEN,  -400, False),   # 황금
        (VisualStage.UNPLANTED_SEED, HealthState.FRESH, -400, False),  # 보유 씨앗
    ]
    for stage, health, offset, expect_rotten in cases:
        fsrs = {'state': 'review', 'stability': 10.0,
                'next_review': (NOW + dt.timedelta(days=offset)).isoformat() + 'Z'}
        payload = _farm_payload(_FakeGame(stage, health), fsrs)
        rows = [_row(1, json.dumps({'schema_version': 3, 'fsrs': fsrs}), stage=stage, health=health)]
        excluded = 1 in rotten_ids_from_rows(rows, NOW)
        assert excluded == expect_rotten, (stage, health, offset)
        assert payload['studiable'] is not excluded, (stage, health, offset)
