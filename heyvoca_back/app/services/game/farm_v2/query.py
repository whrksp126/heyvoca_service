"""농장 조회·집계 (계약 GET /farm/overview, /farm/plants, /farm/session-summary).

이 모듈은 **읽기 전용**이다. 상태를 고치는 일(부패 확정, 시듦 전이 이벤트 기록)은
watering/restore 쪽 쓰기 경로가 맡고, 여기서는 그 결과를 읽어 화면 모양으로 바꾼다.
GET 마다 수천 행을 쓰기 잠금으로 훑으면 홈 화면이 곧 병목이 된다.

집계를 SQL 로 미는 이유:
    사용자 단어는 수천 개까지 간다. 홈 화면 한 번 여는 데 그걸 전부 파이썬으로 끌어와
    세면 응답이 초 단위로 늘어난다. UserVocaGame 에는 이 화면을 위해
    ix_uvg_user_stage / ix_uvg_user_health 인덱스가 이미 걸려 있다.

건강 상태의 '저장값 vs 조회 시 계산'(기획 6.3) 처리 — 이 모듈의 핵심 판단:
    기획은 조회 시 계산이 원칙이라고 하지만, 조회 시 계산은 행마다 FSRS state(TEXT)를
    파싱해야 해서 SQL 집계와 양립하지 않는다. 그래서 두 층으로 나눴다.

    1) 집계(overview) — 저장된 health_state 를 쓰되, **부패만** SQL 표현식으로 보정한다.
       rot_due_at 은 컬럼으로 저장돼 있어 `rot_due_at <= now` 하나로 판정 가능하고,
       부패는 학습 자체를 막는 유일한 상태라 틀리면 사용자가 곧바로 손해를 본다.
       목마름/시듦/심한 시듦의 지연은 다음 쓰기 때 정정되며, 그 사이의 오차는
       "돌볼 것이 있다"는 신호의 세기일 뿐 권한을 바꾸지 않는다.
    2) 목록(list_plants) — 페이지당 수십 행이므로 행마다 health.compute_health 로
       정확히 계산한다. 실제로 카드에 찍히는 값은 이쪽이다.

    집계 직전에 watering 의 재계산 훅이 있으면 한 번 불러 저장값을 최신화한다.
    그래야 시듦 전이 이벤트(16.2)가 조회로도 남는다 — 다만 그 모듈은 다른 트랙이
    만들므로 없거나 실패해도 조회는 계속돼야 한다.
"""

import datetime as dt
import json
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, case, func, or_

from app import db
from app.models.models import (CheckIn, FarmEvent, FarmEventLog, FarmItem, FarmItemReason,
                               GemLog, GemReason, HealthState, User, UserFarmItemLog,
                               UserFarmMigration, UserFarmSetting, UserStreak,
                               UserStudyLog, UserStudySession, UserVoca, UserVocaGame,
                               VisualStage)
from app.services.game.farm_v2 import answer, comeback, growth, inventory, localday, streak_v2
from app.services.game.farm_v2 import constants as C
# `health` 는 아래에서 파라미터 이름으로도 써야 한다(계약의 ?health=). 모듈 쪽에 별칭을 준다.
from app.services.game.farm_v2 import health as health_calc
from app.utils.dict_lang import get_dict_lang, normalize_lang

_log = logging.getLogger(__name__)


def _lang(lang=None) -> str:
    """집계 대상 학습 언어 — 명시값이 없으면 요청의 g.dict_lang(인증 사용자 learning_lang).

    농장 **조회·집계**(개요 카운트, 작물 목록, 홈 피드, 돌봄 수)만 현재 언어로 좁힌다.
    부패 확정·급수 같은 쓰기 경로와 보석/연속/출석은 언어와 무관한 전역 상태라 그대로 둔다.
    """
    return normalize_lang(lang) or get_dict_lang()


def _attach_ja_reading(pairs, lang: str) -> None:
    """(item, user_voca) 쌍의 item 에 ja 읽기(reading)를 붙인다 — voca_id 일괄 1쿼리."""
    if lang != 'ja' or not pairs:
        return
    from app.services.ja_fields import load_ja_word_info
    info = load_ja_word_info(uv.voca_id for _item, uv in pairs)
    for item, uv in pairs:
        item['reading'] = (info.get(uv.voca_id) or {}).get('reading')

# 홈 4그룹 → 해당 성장 단계. growth.HOME_GROUP 의 역방향이다.
# 'golden' 은 별도 그룹이 아니라 당근 그룹의 하위 집합이다(계약 counts 의 golden 과 같은 뜻).
# 'unplanted' / 'planted_seed' 는 'seed' 그룹의 하위 집합이다 — 전체 목록 시트가
# "아직 심지 않은 씨앗만" 을 걸러 봐야 할 때 쓴다(golden 과 같은 패턴).
# 'unplanted' 는 UNPLANTED_SEED 하나뿐이라 list_plants 의
# `if VisualStage.UNPLANTED_SEED in stages` 분기를 그대로 타서 게임 행이 없는 보유 씨앗도 잡힌다.
GROUP_STAGES = {
    'seed':          (VisualStage.UNPLANTED_SEED, VisualStage.PLANTED_SEED),
    'sprout':        (VisualStage.SPROUT,),
    'leaf':          (VisualStage.LEAF,),
    'carrot':        (VisualStage.CARROT, VisualStage.GOLDEN),
    'golden':        (VisualStage.GOLDEN,),
    'unplanted':     (VisualStage.UNPLANTED_SEED,),
    'planted_seed':  (VisualStage.PLANTED_SEED,),
}

# 계약 overview.health 의 키. GOLDEN 은 건강 축에서 빠진다 — 부패 면역이라
# "돌봐야 할 작물"을 세는 이 지표에 넣으면 사용자가 할 일이 있는 것처럼 보인다.
_HEALTH_KEYS = {
    HealthState.FRESH:    'fresh',
    HealthState.THIRSTY:  'thirsty',
    HealthState.WILTED:   'wilted',
    HealthState.CRITICAL: 'critical',
    HealthState.ROTTEN:   'rotten',
}

# 오늘 돌볼 대상 — 예정일이 지난 상태들. THIRSTY 의 시작점이 곧 FSRS 예정일(D)이라
# FSRS state 를 파싱하지 않고도 "복습 예정 도달"을 셀 수 있다(health.compute_health 참조).
_DUE_STATES = (HealthState.THIRSTY, HealthState.WILTED, HealthState.CRITICAL)


# ──────────────────────────────────────────────────────────────
# 공통 표현식
# ──────────────────────────────────────────────────────────────

def effective_health_expr(now: dt.datetime):
    """집계용 건강 상태 표현식 — 저장값 + 부패만 시각 보정 (기획 6.3).

    저장값을 그대로 쓰지 않는 이유는 마지막 학습 이후 아무도 이 행을 건드리지 않으면
    health_state 가 그때 값에 멈춰 있어서다. 부패만 보정하는 이유는 본문 docstring 참조.
    """
    return case(
        (UserVocaGame.health_state == HealthState.GOLDEN, HealthState.GOLDEN),
        (UserVocaGame.health_state == HealthState.ROTTEN, HealthState.ROTTEN),
        (and_(UserVocaGame.rot_due_at.isnot(None), UserVocaGame.rot_due_at <= now),
         HealthState.ROTTEN),
        else_=UserVocaGame.health_state,
    )


def count_rotten(user_id: UUID, now: dt.datetime) -> int:
    """부패 개수 1건 조회. 복귀 미션이 스냅샷을 뜰 때도 같은 정의를 쓰게 하려고 공개한다."""
    expr = effective_health_expr(now)
    return int(
        db.session.query(func.count())
        .select_from(UserVocaGame)
        .filter(UserVocaGame.user_id == user_id, expr == HealthState.ROTTEN)
        .scalar() or 0
    )


# ──────────────────────────────────────────────────────────────
# 학습 진입 필터 — 썩은 단어 제외 (기획 6.1)
# ──────────────────────────────────────────────────────────────

def rotten_user_voca_ids(user_id, candidate_ids, now: Optional[dt.datetime] = None) -> set:
    """후보 중 **썩어서 학습할 수 없는** user_voca_id 집합.

    V1 의 `services/game/farm.dead_user_voca_ids`(`life == 'DEAD'`)를 대체한다.
    V2 는 부패를 `health_state == 'ROTTEN'` 으로 적고 `life` 는 'ALIVE' 인 채로 두기
    때문에, 구 필터는 실제로 **아무것도 걸러내지 못했다** (2026-09 QA / prod 실측:
    health_state ROTTEN 21건인데 life DEAD 0건 → 썩은 단어가 그대로 출제됐다).

    저장값(health_state)만 보지 않는 이유 — 건강은 '조회 시 계산'이 원칙이다(기획 6.3).
    마지막 쓰기 이후 시간만 흘러 썩은 단어는 저장값이 CRITICAL 등에 멈춰 있고,
    화면(`/vocaIndexs` 의 `_farm_state`, `/farm/plants` 의 `_plant_item`)은
    `health.compute_health` 로 계산한 값을 보여준다. 그래서 여기서도 **같은 입력**
    (FSRS 예정일·간격, visual_stage, protection_days, 황금 여부, 저장된 부패 여부)으로
    `compute_health` 를 그대로 호출한다 — 그래야 "썩었다고 보이는데 문제로 나온다"가
    사라진다.

    자연히 따라오는 규칙들(모두 compute_health 의 정의 그대로다):
      - 황금(GOLDEN)은 절대 썩지 않는다 (10.3).
      - 보유 씨앗(UNPLANTED_SEED)·FSRS 예정일이 없는 단어는 썩지 않는다 (6.4).
      - 게임 행 자체가 없는 단어(한 번도 학습 안 함)도 보유 씨앗과 같다.

    쿼리는 1회 + 순수 계산이다(N+1 금지). 상태를 쓰지 않는다 — 부패 확정 쓰기는
    watering/restore 경로의 몫이고, 학습 진입이 쓰기 잠금을 잡으면 안 된다.
    """
    if not candidate_ids:
        return set()
    now = now or dt.datetime.utcnow()
    if isinstance(user_id, str):
        user_id = UUID(user_id)

    rows = (
        db.session.query(UserVoca.id, UserVoca.data, UserVocaGame.visual_stage,
                         UserVocaGame.health_state, UserVocaGame.protection_days)
        .select_from(UserVoca)
        .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
        .filter(UserVoca.user_id == user_id, UserVoca.id.in_(list(candidate_ids)))
        .all()
    )
    return rotten_ids_from_rows(rows, now)


def rotten_ids_from_rows(rows, now: dt.datetime) -> set:
    """`rotten_user_voca_ids` 의 순수 계산부 — DB 없이 테스트할 수 있게 분리했다.

    rows: (user_voca_id, user_voca.data, visual_stage, health_state, protection_days) 튜플.
          게임 행이 없는 단어는 뒤 세 값이 None 으로 들어온다(LEFT JOIN).
    """
    from app.services.fsrs.state import (parse_user_voca_data, get_fsrs_state,
                                         is_v1, migrate_v1_to_v2)

    rotten = set()
    for uv_id, raw_data, visual_stage, health_state, protection_days in rows:
        stage = visual_stage or VisualStage.UNPLANTED_SEED
        payload = parse_user_voca_data(raw_data)
        if is_v1(payload):
            payload = migrate_v1_to_v2(payload)
        fsrs_state = get_fsrs_state(payload) or {}

        h = health_calc.compute_health(
            growth.parse_fsrs_due(fsrs_state), growth._stability(fsrs_state), now,
            visual_stage=stage,
            protection_days=protection_days or 0,
            is_golden=(stage == VisualStage.GOLDEN),
            already_rotten=(health_state == HealthState.ROTTEN),
        )
        if h['state'] == HealthState.ROTTEN:
            rotten.add(uv_id)
    return rotten


def refresh_health(user_id: UUID, now: dt.datetime) -> None:
    """저장된 건강 상태를 쓰기 경로에 맡겨 최신화한다 (있을 때만).

    watering 모듈(T2)이 상태 전이 이벤트까지 남기는 정본이다. 여기서 같은 계산을
    다시 구현하면 이벤트가 두 번 남거나 두 구현이 갈라진다. 아직 없거나 실패해도
    조회는 계속돼야 하므로 예외를 삼키고, 실패한 트랜잭션만 되돌린다.
    """
    try:
        from app.services.game.farm_v2 import watering
    except ImportError:
        return
    fn = getattr(watering, 'compute_rot_state', None)
    if fn is None:
        return
    try:
        fn(user_id, now)
    except Exception:
        db.session.rollback()


def get_care_due_ids(user_id: UUID, now: Optional[dt.datetime] = None, lang: Optional[str] = None) -> set:
    """오늘 돌봄이 필요한 단어(user_voca_id 집합) — 단어장 목록/찾기 탭의 **정본**
    (`utils/vocaCrop.js::bookCareCount`/`isCareDue`)과 **정확히 같은 판정**을 직접 계산한다.

    정본 = 예정일(FSRS `next_review`)의 **KST 자정 경계**(컷오프 없음, `Date.setHours(0,0,0,0)`
    와 동일)가 오늘이거나 이미 지난 것. **부패(ROTTEN)도 포함한다** — "예정일이 지났고
    방치됐다"는 점에서 원칙("돌봄이 있다 = 오늘 물 줘야 하거나 예정일이 지난 단어가
    있다")에 정확히 들어맞고, 되살리기도 사용자가 해야 할 학습 행동이다(2026-09 QA).
    황금(GOLDEN)만 뺀다 — 부패 면역이라 "물이 필요하다"는 말 자체가 성립하지 않는다.
    아직 한 번도 학습하지 않은 단어(FSRS 예정일 없음)도 뺀다.

    **이전 구현(재작성 전)의 문제 둘:**
      1) `/study/recommend`·데일리 미션이 쓰는 `recommend/pool.py::build_candidate_pool`을
         재사용했는데, 그 버킷은 `study_day.logical_today()`(전역 APP_TZ + **새벽 4시
         컷오프**)로 날짜를 가른다. 정본은 컷오프가 없어 00:00~03:59 KST 사이 "오늘 늦게
         (4시 이후) 예정"인 단어에서 둘이 갈렸다.
      2) ROTTEN·GOLDEN을 둘 다 뺐다 — "부패는 이미 별도 카드(되살릴 수 있는 단어)로
         보여준다"는 판단이었지만, 실제로는 방치가 길어 ROTTEN 이 된 단어가 대부분인
         사용자에게 홈이 "다 끝냈어요"를 보여주는 원인이 됐다. 되살리기 학습을 유도해야
         하므로 ROTTEN도 돌봄에 포함해야 한다.

    건강 상태 자체(THIRSTY→WILTED→CRITICAL 전이, 부패 유예, `_DUE_STATES`)는 이 함수와
    무관하게 시각 기준을 그대로 유지한다 — 바뀌는 건 "오늘 할 일이 있는가" 하나뿐이다.
    미션/추천의 새벽 4시 컷오프도 이번에는 건드리지 않는다(범위 밖 — 코디네이터 확인).
    """
    now = now or dt.datetime.utcnow()
    today = localday.local_day(now, localday.DEFAULT_TZ)  # KST 자정 경계, 컷오프 없음 — 정본과 동일

    from app.services.fsrs.state import parse_user_voca_data, get_fsrs_state, is_v1, migrate_v1_to_v2

    # UserVoca 를 기준으로 LEFT JOIN — 게임 행이 없는(한 번도 안 심은) 단어는 애초에
    # FSRS 예정일이 없어 아래 due_at 체크에서 자연히 빠지지만, 이미 로드하는 행에서
    # 한 번에 걸러 추가 쿼리를 만들지 않는다(요청: 추가 쿼리 최소화).
    rows = (
        db.session.query(UserVocaGame.user_voca_id, UserVocaGame.visual_stage, UserVoca.id, UserVoca.data)
        .select_from(UserVoca)
        .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
        .filter(UserVoca.user_id == user_id, UserVoca.dict_lang == _lang(lang))
        .all()
    )

    due_ids = set()
    for _game_voca_id, visual_stage, uv_id, raw_data in rows:
        if visual_stage == VisualStage.GOLDEN:
            continue
        payload = parse_user_voca_data(raw_data)
        if is_v1(payload):
            payload = migrate_v1_to_v2(payload)
        fsrs_state = get_fsrs_state(payload) or {}
        due_at = growth.parse_fsrs_due(fsrs_state)
        if due_at is None:
            continue  # 미학습(예정일 없음) — 정본의 isUnplanted 와 같은 효과
        if localday.local_day(due_at, localday.DEFAULT_TZ) <= today:
            due_ids.add(uv_id)

    return due_ids


def get_care_due_count(user_id: UUID, now: Optional[dt.datetime] = None, lang: Optional[str] = None) -> int:
    """`get_care_due_ids` 의 개수. 홈 overview.today.care_due_cnt 가 이걸 쓴다."""
    return len(get_care_due_ids(user_id, now, lang))


# ──────────────────────────────────────────────────────────────
# GET /farm/overview
# ──────────────────────────────────────────────────────────────

def get_overview(user_id: UUID, now: Optional[dt.datetime] = None,
                 refresh: bool = True, lang: Optional[str] = None) -> dict:
    """홈 화면 한 번에 필요한 모든 수치 (계약 GET /farm/overview).

    한 엔드포인트로 묶은 이유는 홈이 열릴 때마다 개수·아이템·보석·연속·복귀를
    따로 부르면 왕복이 다섯 번 되기 때문이다. 각 항목은 아래에서 쿼리 1~2건씩이다.

    `refresh=False` 는 **호출부가 방금 compute_rot_state 를 돌린 경우**에 쓴다.
    그 스캔은 사용자의 후보 작물을 전부 읽어 FSRS JSON 을 파싱하므로, 한 요청에서
    두 번 도는 것이 홈 응답 시간의 가장 큰 몫이 된다.
    """
    now = now or dt.datetime.utcnow()
    if refresh:
        refresh_health(user_id, now)

    # 작물 수·건강·돌봄 수는 현재 학습 언어 단어만. 아이템·보석·연속·복귀는 전역.
    lang = _lang(lang)
    counts, seed_detail = _stage_counts(user_id, lang)
    health_counts = _health_counts(user_id, now, lang)

    setting_limit = (
        db.session.query(UserFarmSetting.daily_review_limit)
        .filter(UserFarmSetting.user_id == user_id)
        .scalar()
    ) or C.DEFAULT_DAILY_REVIEW_LIMIT

    comeback_state = comeback.get_state(user_id, now)

    gem_cnt = db.session.query(User.gem_cnt).filter(User.id == user_id).scalar() or 0

    return {
        'counts': counts,
        'seed_detail': seed_detail,
        'health': health_counts,
        'today': {
            # 예정일이 지난 작물 수(건강 상태 기준 — 정확한 시각을 넘어야 잡힌다).
            # 부패는 학습이 막혀 있으므로 오늘 할 일에 넣지 않는다(6.1).
            # **레거시 필드.** 구버전 프론트 폴백용으로 남긴다 — 새로 읽을 곳은
            # care_due_cnt 를 쓴다.
            'due': sum(health_counts[_HEALTH_KEYS[s]] for s in _DUE_STATES),
            # 오늘 돌봄이 필요한 작물 수(**날짜 기준** — 예정일의 현지 날짜가 오늘이거나
            # 이미 지남). 단어장 목록/찾기 탭의 "돌봄"(isCareDue), 데일리 미션의
            # review_due, /study/recommend 의 today·overdue 버킷과 같은 정의다.
            # 홈이 실제로 써야 하는 값 — get_care_due_ids 문서 참고.
            'care_due_cnt': get_care_due_count(user_id, now, lang),
            # 부패까지 남은 단계가 하나뿐인 작물 — 오늘 목록 맨 앞에 올린다(8.4).
            'critical_first': health_counts['critical'],
            'recommended_limit': comeback.course_limit(comeback_state, setting_limit),
        },
        'items': inventory.get_counts(user_id),
        'gem_cnt': int(gem_cnt),
        'streak': _streak_state(user_id, now),
        'comeback': comeback_state,
        'migration_notice': _migration_notice(user_id),
        'language': lang,
    }


def _stage_counts(user_id: UUID, lang: str = 'en') -> tuple:
    """성장 단계 집계 → 홈 4그룹 + 황금 + 씨앗 상세.

    황금을 당근 그룹에 **포함**시킨 이유는 홈이 4그룹 그림판이기 때문이다(5.1).
    황금만 따로 빼면 4그룹 합이 전체 단어 수와 어긋나 "내 단어가 어디 갔지"가 된다.
    씨앗 상세와 같은 구조다 — 그룹은 4개, 세부는 그 안의 내역.
    """
    rows = (
        db.session.query(UserVocaGame.visual_stage, func.count())
        .join(UserVoca, UserVoca.id == UserVocaGame.user_voca_id)
        .filter(UserVocaGame.user_id == user_id, UserVoca.dict_lang == lang)
        .group_by(UserVocaGame.visual_stage)
        .all()
    )
    counts = {'seed': 0, 'sprout': 0, 'leaf': 0, 'carrot': 0, 'golden': 0}
    seed_detail = {'unplanted': 0, 'planted': 0}
    total_games = 0
    for stage, n in rows:
        n = int(n or 0)
        total_games += n
        group = growth.HOME_GROUP.get(stage)
        if group:
            counts[group] += n
        if stage == VisualStage.GOLDEN:
            counts['golden'] += n
        elif stage == VisualStage.UNPLANTED_SEED:
            seed_detail['unplanted'] += n
        elif stage == VisualStage.PLANTED_SEED:
            seed_detail['planted'] += n

    # 아직 게임 행이 없는 단어(전환 전 사용자, 방금 담은 단어)는 보유 씨앗으로 센다.
    # 세지 않으면 단어장에는 단어가 있는데 농장은 비어 보인다.
    total_voca = int(
        db.session.query(func.count(UserVoca.id))
        .filter(UserVoca.user_id == user_id, UserVoca.dict_lang == lang)
        .scalar() or 0
    )
    missing = max(0, total_voca - total_games)
    counts['seed'] += missing
    seed_detail['unplanted'] += missing
    return counts, seed_detail


def _health_counts(user_id: UUID, now: dt.datetime, lang: str = 'en') -> dict:
    """건강 상태 집계. GOLDEN 행은 계약의 5개 키 어디에도 넣지 않는다."""
    expr = effective_health_expr(now)
    rows = (
        db.session.query(expr, func.count())
        .join(UserVoca, UserVoca.id == UserVocaGame.user_voca_id)
        .filter(UserVocaGame.user_id == user_id, UserVoca.dict_lang == lang)
        .group_by(expr)
        .all()
    )
    result = {v: 0 for v in _HEALTH_KEYS.values()}
    for state, n in rows:
        key = _HEALTH_KEYS.get(state)
        if key:
            result[key] += int(n or 0)
    return result


def _streak_state(user_id: UUID, now: dt.datetime) -> dict:
    """계약 overview.streak. 읽기만 한다 — 연속 판정·보호권 소모는 streak_v2(T3)의 몫이다.

    current 를 저장값 그대로 내보내지 않는 이유는, 어제 5개를 못 채운 사용자의 행은
    다음 학습이 있기 전까지 아무도 건드리지 않아 끊긴 기록이 그대로 남아 있기 때문이다.
    화면에는 '지금 살아 있는 연속'이 보여야 한다.
    """
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    yesterday = today - dt.timedelta(days=1)

    row = db.session.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    current = int(getattr(row, 'current_streak', 0) or 0)
    best = int(getattr(row, 'best_streak', 0) or 0)
    last_day = getattr(row, 'last_qualified_day', None)
    deadline = getattr(row, 'recovery_deadline', None)

    if last_day is None:
        current = 0
    elif last_day < yesterday:
        # 멈춤(paused) 기한 안이면 끊기기 전 값을 그대로 보여 준다(보호권 개편 §1).
        if not (deadline and now < deadline):
            current = 0

    checkins = (
        db.session.query(CheckIn.attendence_date, CheckIn.correct_word_cnt,
                         CheckIn.streak_qualified, CheckIn.streak_protected)
        .filter(CheckIn.user_id == user_id,
                CheckIn.attendence_date.in_([today, yesterday]))
        .all()
    )
    today_correct, today_done, protected_yesterday = 0, False, False
    for day, correct_cnt, qualified, protected in checkins:
        if day == today:
            today_correct = int(correct_cnt or 0)
            today_done = bool(qualified)
        elif day == yesterday:
            protected_yesterday = bool(protected)

    return {
        'current': current,
        'best': max(best, current),
        'today_done': today_done,
        'today_correct': today_correct,
        'required': C.STREAK_MIN_CORRECT_WORDS,
        'protected_yesterday': protected_yesterday,
        'recovery_until': localday.iso_utc(deadline) if (deadline and now < deadline) else None,
        # 계약서(연속 학습 보호권 개편) §2 — 멈춤·다시 잇기. notice 는 /farm/streak 에서만 준다.
        **streak_v2.streak_extras(user_id, now),
    }


def _migration_notice(user_id: UUID) -> Optional[dict]:
    """전환 결과 슬라이드용 (기획 15.3). 아직 안 본 경우에만 준다.

    '봤다' 표시(seen_at)는 여기서 찍지 않는다. 조회가 곧 노출은 아니고,
    홈을 열자마자 네트워크가 끊기면 사용자는 결과를 못 본 채 안내를 잃는다.
    """
    row = (
        db.session.query(UserFarmMigration)
        .filter(UserFarmMigration.user_id == user_id,
                UserFarmMigration.seen_at.is_(None))
        .first()
    )
    if row is None:
        return None
    return {
        'auto_recovered': int(row.auto_recovered or 0),
        'shovel': int(row.shovel_granted or 0),
        'nutrient': int(row.nutrient_granted or 0),
        'shield': int(row.shield_granted or 0),
        'gem': int(row.gem_granted or 0),
    }


def mark_migration_seen(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """전환 안내를 봤다고 표시 (기획 15.2 "첫 접속 결과 슬라이드에서 안내").

    사용자가 안내를 닫았을 때 화면이 부른다. 서버에 남기지 않으면 기기를 바꾸거나
    브라우저 저장소를 비웠을 때 이미 확인한 안내가 다시 뜬다 — 화면 쪽 저장만으로는
    "한 번만 보여 준다"를 지킬 수 없다.

    이미 표시돼 있으면 시각을 덮어쓰지 않는다. 처음 본 시각이 이행 검증에 쓰이는 값이다.
    """
    now = now or dt.datetime.utcnow()
    row = (
        db.session.query(UserFarmMigration)
        .filter(UserFarmMigration.user_id == user_id)
        .first()
    )
    if row is None:
        # 전환 대상이 아니었던 사용자(신규 가입)도 이 요청을 보낼 수 있다. 오류가 아니다.
        return {'seen': False}
    if row.seen_at is None:
        row.seen_at = now
        db.session.commit()
    return {'seen': True, 'seen_at': localday.iso_utc(row.seen_at)}


# ──────────────────────────────────────────────────────────────
# GET /farm/plants
# ──────────────────────────────────────────────────────────────

def list_plants(user_id: UUID, now: Optional[dt.datetime] = None,
                group: Optional[str] = None, health: Optional[str] = None,
                limit: int = 50, cursor: Optional[int] = None,
                lang: Optional[str] = None) -> dict:
    """작물 목록 (계약 GET /farm/plants). 커서 페이지네이션. 현재 학습 언어 단어만.

    커서를 offset 대신 user_voca_id 로 잡은 이유는, 스크롤 도중 학습이 끝나 정렬 대상이
    바뀌어도 이미 본 항목이 다시 나오거나 건너뛰지 않기 때문이다. id 는 변하지 않는다.

    health 필터는 SQL 보정값(저장값 + 부패)으로 거르고, 카드에 찍히는 값은 행마다
    다시 계산한다. 저장값이 밀린 사이에는 '시듦'으로 걸러진 카드가 '심한 시듦'으로
    보일 수 있다. 그래도 필터에서 떨어뜨리지 않는 이유는, 걸러내면 페이지 크기가
    들쭉날쭉해져 커서 페이지네이션이 빈 페이지를 내놓기 때문이다.

    Raises:
        ValueError — 알 수 없는 group / health 값
    """
    now = now or dt.datetime.utcnow()
    limit = max(1, min(int(limit or 50), 100))
    lang = _lang(lang)

    # **UserVoca 를 기준으로 LEFT JOIN 한다.** 게임 행(UserVocaGame)은 그 단어를 한 번이라도
    # 학습해야 생기므로, 게임 행을 기준으로 조인하면 아직 심지 않은 보유 씨앗이 목록에서
    # 통째로 빠진다. 실측으로 단어 514개 중 145개만 나왔다 — 밭의 대부분을 차지하는
    # 씨앗이 사라지는 셈이라 홈의 카운트(514)와도 어긋났다.
    q = (
        db.session.query(UserVocaGame, UserVoca)
        .select_from(UserVoca)
        .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
        .filter(UserVoca.user_id == user_id, UserVoca.dict_lang == lang)
    )

    if group:
        stages = GROUP_STAGES.get(str(group).lower())
        if stages is None:
            raise ValueError('알 수 없는 작물 그룹이에요.')
        # 게임 행이 없으면 보유 씨앗이다 — seed 그룹을 물으면 그것들도 함께 나와야 한다.
        cond = UserVocaGame.visual_stage.in_(stages)
        if VisualStage.UNPLANTED_SEED in stages:
            cond = or_(cond, UserVocaGame.user_voca_id.is_(None))
        q = q.filter(cond)

    if health:
        want = str(health).upper()
        if want not in _HEALTH_KEYS and want != HealthState.GOLDEN:
            raise ValueError('알 수 없는 건강 상태예요.')
        if want == HealthState.FRESH:
            # 게임 행이 없는 보유 씨앗은 영구 FRESH 다(기획 6.4)
            q = q.filter(or_(effective_health_expr(now) == want,
                             UserVocaGame.user_voca_id.is_(None)))
        else:
            q = q.filter(effective_health_expr(now) == want)

    if cursor:
        q = q.filter(UserVoca.id > int(cursor))

    rows = q.order_by(UserVoca.id.asc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    pairs = [(_plant_item(game, user_voca, now), user_voca) for game, user_voca in rows]
    _attach_ja_reading(pairs, lang)
    items = [item for item, _uv in pairs]
    return {
        'items': items,
        'next_cursor': rows[-1][1].id if (has_more and rows) else None,
    }


def home_feed(user_id: UUID, now: Optional[dt.datetime] = None,
              limit: int = 5, lang: Optional[str] = None) -> dict:
    """홈 아래쪽에 붙는 "지금 볼 만한 단어" 묶음.

    홈은 히어로·연속 학습·성과 카드까지만 규정돼 있어서, 급한 일이 없는 날에는
    스크롤 영역이 사실상 비었다. 그렇다고 지표를 늘리면 §7("홈에는 진행 지표가 없다")과
    부딪힌다. 그래서 **지표가 아니라 단어 자체**를 내려 준다 — 사용자가 홈에서
    실제로 궁금해하는 건 "몇 %"가 아니라 "무슨 단어를 봐야 하나"다.

    네 묶음을 한 번에 주고 무엇을 그릴지는 화면이 상태에 따라 고른다. 각각을 따로
    호출하면 홈 첫 진입에 왕복이 네 번 늘어난다.

        care     지금 물이 필요한 작물 — 급한 순(부패 마감이 가까운 순)
        rotten   되살릴 수 있는 썩은 작물 — 최근에 썩은 순
        seeds    아직 심지 않은 보유 씨앗 — 최근에 담은 순
        recent   최근에 심은 단어 — 심은 순

    정렬을 rot_due_at 으로 잡은 이유: 실제 복습 예정일은 FSRS state(TEXT) 안에 있어
    SQL 로 정렬할 수 없다. rot_due_at 은 컬럼이고 '예정일 + 유예'라 예정일과 같은
    순서를 준다. 인덱스(ix_uvg_user_rotdue)도 이미 이 컬럼에 걸려 있다.
    """
    now = now or dt.datetime.utcnow()
    limit = max(1, min(int(limit or 5), 20))
    lang = _lang(lang)   # 현재 학습 언어 단어만

    def rows(build):
        q = build(
            db.session.query(UserVocaGame, UserVoca)
            .select_from(UserVoca)
            .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
            .filter(UserVoca.user_id == user_id, UserVoca.dict_lang == lang)
        )
        pairs = [(_plant_item(game, uv, now), uv) for game, uv in q.limit(limit).all()]
        _attach_ja_reading(pairs, lang)
        return [item for item, _uv in pairs]

    eff = effective_health_expr(now)

    # **날짜 기준**(get_care_due_ids)으로 바꿨다 — 예전에는 건강 상태(THIRSTY 이상)로
    # 걸러서, 카운트(overview.today.care_due_cnt)는 예정일이 오늘인 단어를 세는데
    # 정작 이 목록에는 정확한 시각이 지나야 뜨는 어긋남이 있었다("총량 23인데
    # 목록은 비어 있음"). 같은 집합이어야 카드 숫자와 실제로 펼친 목록이 맞는다.
    care_due_ids = get_care_due_ids(user_id, now, lang)
    care = (rows(lambda q: q
                .filter(UserVocaGame.user_voca_id.in_(care_due_ids))
                # 마감이 없는 행은 뒤로 — MySQL 은 NULL 을 먼저 놓는다
                .order_by(UserVocaGame.rot_due_at.is_(None).asc(),
                          UserVocaGame.rot_due_at.asc()))
            if care_due_ids else [])

    rotten = rows(lambda q: q
                  .filter(eff == HealthState.ROTTEN)
                  # MySQL 에는 NULLS LAST 문법이 없다 — 불리언 정렬로 대신한다
                  .order_by(UserVocaGame.rotten_at.is_(None).asc(),
                            UserVocaGame.rotten_at.desc(),
                            UserVoca.id.desc()))

    # 게임 행이 아예 없거나 아직 심기 전인 것 둘 다 "보유 씨앗"이다(기획 5.1).
    seeds = rows(lambda q: q
                 .filter(or_(UserVocaGame.user_voca_id.is_(None),
                             UserVocaGame.visual_stage == VisualStage.UNPLANTED_SEED))
                 .order_by(UserVoca.id.desc()))

    recent = rows(lambda q: q
                  .filter(UserVocaGame.first_planted_at.isnot(None))
                  .order_by(UserVocaGame.first_planted_at.desc()))

    return {'care': care, 'rotten': rotten, 'seeds': seeds, 'recent': recent}


def _plant_item(game: UserVocaGame, user_voca: UserVoca, now: dt.datetime) -> dict:
    """카드 1장. 여기서는 행마다 정확히 계산한다 — 페이지당 수십 건이라 감당 가능하고,
    사용자가 실제로 읽는 숫자("3일 뒤")는 반올림 오차도 티가 나기 때문이다."""
    fsrs_state = growth.load_fsrs_state(user_voca)
    due_at = growth.parse_fsrs_due(fsrs_state)
    # game 이 None 이면 한 번도 학습하지 않은 단어다 — 보유 씨앗이고 썩지 않는다(6.4).
    # 여기서 행을 만들지는 않는다. 목록 조회가 쓰기를 하면 첫 진입이 통째로 느려진다.
    stage = (game.visual_stage if game else None) or VisualStage.UNPLANTED_SEED

    h = health_calc.compute_health(
        due_at, growth._stability(fsrs_state), now,
        visual_stage=stage,
        protection_days=(game.protection_days if game else 0) or 0,
        is_golden=(stage == VisualStage.GOLDEN),
        already_rotten=bool(game and game.health_state == HealthState.ROTTEN),
    )

    return {
        'user_voca_id': user_voca.id,
        'word': user_voca.word or '',
        'meaning': _first_meaning(user_voca.voca_meanings),
        'language': user_voca.dict_lang or 'en',
        'stage': stage,
        'crop': answer.CROP_KEY.get(stage, 'seed'),
        'health': h['state'],
        'pct': answer.stage_progress(game, fsrs_state, now) if game else 0,
        'days_to_review': health_calc.ceil_days(due_at - now) if due_at else None,
        'days_to_rot': h['days_to_rot'],
        'rot_due_at': localday.iso_utc(h['rot_due_at']) if h['rot_due_at'] else None,
        'studiable': health_calc.is_studiable(h['state']),
    }


def _first_meaning(raw) -> str:
    """대표 뜻 1개. 카드에 한 줄만 들어가므로 첫 번째만 쓴다.

    저장 형태가 두 가지다(문자열 배열 / {meaning: ...} 배열) — 사전 출처에 따라 다르다.
    """
    if not raw:
        return ''
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return ''
    if not isinstance(parsed, list) or not parsed:
        return ''
    first = parsed[0]
    if isinstance(first, str):
        return first
    if isinstance(first, dict):
        return first.get('meaning') or ''
    return ''


# ──────────────────────────────────────────────────────────────
# GET /farm/session-summary
# ──────────────────────────────────────────────────────────────

def get_session_summary(user_id: UUID, session_id, now: Optional[dt.datetime] = None) -> dict:
    """세션 종료 요약 (계약 GET /farm/session-summary, 기획 12.3).

    '이번 세션에서 무엇이 일어났는가'는 FarmEventLog 로만 답할 수 있다. 현재 상태를 보면
    이미 여러 답안이 겹쳐 지나간 뒤라 어느 단어가 이번에 자랐는지 알 수 없다.
    이벤트 로그는 상태가 실제로 바뀐 순간만 남기므로(16.2) 이 조회가 곧 그 목적이다.

    슬라이드 순서는 프론트가 정한다. 빈 배열/0 을 그대로 준다.

    응답에 planted/grown/rescued 와 별도로 word_stages(dict, {user_voca_id: visual_stage})를
    담아 세션에 등장한 모든 단어의 **현재** 농장 단계를 함께 내려준다. 세 delta 배열은
    "이번 세션에 단계가 바뀐 단어"만 담으므로, 정답을 맞혀 복습만 되고 단계 변화가 없던
    단어는 거기 없다 — word_stages 는 그 빈틈을 메운다(UserStudyLog 기준, 조회 실패 시
    {}로 방어).

    Raises:
        LookupError — 세션이 없거나 남의 세션
    """
    now = now or dt.datetime.utcnow()
    session = (
        db.session.query(UserStudySession)
        .filter(UserStudySession.id == session_id,
                UserStudySession.user_id == user_id)
        .first()
    )
    if session is None:
        raise LookupError('학습 세션을 찾을 수 없어요.')

    started = session.started_at or now
    ended = session.finished_at or now

    logs = (
        db.session.query(FarmEventLog)
        .filter(FarmEventLog.user_id == user_id,
                FarmEventLog.session_id == session_id)
        .order_by(FarmEventLog.created_at.asc(), FarmEventLog.id.asc())
        .all()
    )

    planted, grown, rescued = {}, {}, {}
    protected = 0
    for row in logs:
        vid = row.user_voca_id
        if row.event == FarmEvent.PROTECTION_APPLIED:
            protected += 1
            continue
        if vid is None:
            continue
        if row.event == FarmEvent.SEED_PLANTED:
            planted[vid] = True
        elif row.event in (FarmEvent.STAGE_UP, FarmEvent.SPROUTED):
            # 한 세션에서 두 번 오른 단어는 처음 시작점과 마지막 도착점으로 합친다.
            # 사용자가 본 것은 "씨앗이 잎이 됐다" 하나지 두 번의 상승이 아니다.
            prev = grown.get(vid)
            grown[vid] = {'from_stage': prev['from_stage'] if prev else row.from_state,
                          'to_stage': row.to_state}
        elif row.event == FarmEvent.REVIEW_WATERED:
            # 되살림의 근거는 '어떤 상태에서 물을 줬는가'다. 시듦·심한 시듦에서 촉촉함으로
            # 돌아온 것만 센다. 목마름은 예정일이 막 지난 정상 복습이라 되살림이 아니다.
            if row.from_state in (HealthState.WILTED, HealthState.CRITICAL):
                rescued[vid] = True

    # 무료 긴급 급수는 세션 밖(진입 시점)에서 붙기도 한다 — session_id 가 없는 건을
    # 세션 시간 범위로 주워 담는다. 결과 화면의 "안전하게 지킨 작물"이 비면 안 된다.
    protected += int(
        db.session.query(func.count())
        .select_from(FarmEventLog)
        .filter(FarmEventLog.user_id == user_id,
                FarmEventLog.event == FarmEvent.PROTECTION_APPLIED,
                FarmEventLog.session_id.is_(None),
                FarmEventLog.created_at >= started,
                FarmEventLog.created_at <= ended)
        .scalar() or 0
    )

    voca_ids = set(planted) | set(grown) | set(rescued)
    words = _word_map(voca_ids)
    stages = _stage_map(voca_ids)

    # planted/grown/rescued 는 '이번 세션에 단계가 바뀐 단어'만 담는 delta 다. 복습만 되고
    # 단계가 그대로인 단어는 여기 없어서, 프론트는 지금까지 FSRS 암기 상태 버킷으로 그
    # 단어들의 작물 그림을 근사해 왔다(farm 의 visual_stage 축과 달라 화면마다 다르게
    # 보일 수 있는 원인). word_stages 는 그 근사를 없애기 위해 **세션에 등장한 모든
    # user_voca_id 의 현재 visual_stage** 를 delta 와 별도로 통째로 내려준다.
    try:
        session_word_ids = _session_word_ids(user_id, session_id)
        word_stages = _session_word_stages(session_word_ids)
    except Exception:
        db.session.rollback()
        _log.warning('세션 단어 stage 조회 실패 — word_stages 를 빈 값으로 내려줌',
                     exc_info=True)
        word_stages = {}

    return {
        'planted': [_word_entry(vid, words) for vid in planted],
        'grown': [
            dict(_word_entry(vid, words),
                 from_stage=info['from_stage'], to_stage=info['to_stage'],
                 crop=answer.CROP_KEY.get(info['to_stage'], 'seed'))
            for vid, info in grown.items()
        ],
        'rescued': [
            dict(_word_entry(vid, words),
                 crop=answer.CROP_KEY.get(stages.get(vid), 'seed'))
            for vid in rescued
        ],
        'rewards': _session_rewards(user_id, started, ended),
        'streak': _session_streak(user_id, now),
        'protected': protected,
        'correct': int(session.correct_count or 0),
        'total': int(session.question_count or 0),
        # {user_voca_id(int): visual_stage 리터럴}. 이번 세션에서 문제가 나온 단어 전체를
        # 담는다(planted/grown/rescued 에 없는, 단계 변화 없이 복습만 된 단어 포함).
        'word_stages': word_stages,
    }


def _word_map(voca_ids) -> dict:
    if not voca_ids:
        return {}
    rows = (
        db.session.query(UserVoca.id, UserVoca.word, UserVoca.voca_meanings)
        .filter(UserVoca.id.in_(list(voca_ids)))
        .all()
    )
    return {vid: (word or '', _first_meaning(meanings)) for vid, word, meanings in rows}


def _stage_map(voca_ids) -> dict:
    if not voca_ids:
        return {}
    rows = (
        db.session.query(UserVocaGame.user_voca_id, UserVocaGame.visual_stage)
        .filter(UserVocaGame.user_voca_id.in_(list(voca_ids)))
        .all()
    )
    return dict(rows)


def _session_word_ids(user_id: UUID, session_id) -> set:
    """이번 세션에서 문제로 나온 모든 user_voca_id (단계 변화 여부 무관).

    FarmEventLog 는 상태가 실제로 바뀐 순간만 남기지만(16.2), UserStudyLog 는 세션에서
    풀린 문제마다 한 행씩 남는다 — 같은 단어가 여러 문제 유형으로 여러 번 나올 수 있어
    DISTINCT 로 중복을 접는다. 이 테이블은 연도별 파티션이라(c3e8a10b4d22) FK 는 없지만
    ix_usl_session 인덱스가 session_id 단독으로 걸려 있어 이 조회 하나로 끝난다.
    """
    rows = (
        db.session.query(UserStudyLog.user_voca_id)
        .filter(UserStudyLog.user_id == user_id,
                UserStudyLog.session_id == session_id)
        .distinct()
        .all()
    )
    return {vid for (vid,) in rows}


def _session_word_stages(voca_ids) -> dict:
    """`voca_ids` 각각의 **현재** 농장 visual_stage, user_voca_id 를 키로.

    _plant_item 과 같은 기본값 규칙을 쓴다 — 게임 행이 없으면(한 번도 독립 정답을 내지
    못한 채 세션이 끝난 단어) 아직 심지 않은 상태이므로 UNPLANTED_SEED 다. 단어 수만큼
    왕복하지 않도록 IN 절 한 번으로 전체를 끌어온다(N+1 금지).
    """
    if not voca_ids:
        return {}
    game_stage = _stage_map(voca_ids)
    return {vid: (game_stage.get(vid) or VisualStage.UNPLANTED_SEED) for vid in voca_ids}


def _word_entry(vid: int, words: dict) -> dict:
    word, meaning = words.get(vid, ('', ''))
    return {'user_voca_id': vid, 'word': word, 'meaning': meaning}


def _session_rewards(user_id: UUID, started: dt.datetime, ended: dt.datetime) -> dict:
    """이번 세션에서 받은 재화 (계약 rewards).

    아이템 원장과 보석 원장에는 session_id 가 없다 — 두 원장은 농장 전용이 아니라서
    세션 컬럼을 붙이면 결제·업적 등 모든 지급 경로가 영향을 받는다. 그래서 세션의
    시간 범위로 자르되, **지급(+)만** 그리고 **학습으로 번 것만** 센다.

    사유를 허용 목록으로 좁힌 이유: 시간 범위만으로 자르면 같은 시각에 붙는 다른 지급이
    전부 '이번 학습의 성과'로 둔갑한다. 그 주 첫 접속의 보호권(WEEKLY_GRANT),
    다시 심기 취소 환급(EVENT), 전환 보상(MIGRATION), 운영 보정(ADMIN_ADJUST)이 그렇다.
    학습으로 얻는 아이템은 성장 단계 보상(8.2)과 연속 마일스톤(11.4) 둘뿐이다.
    """
    rewards = {FarmItem.SHOVEL: 0, FarmItem.NUTRIENT: 0, FarmItem.SHIELD: 0, 'gem': 0}

    item_rows = (
        db.session.query(UserFarmItemLog.item_type, func.sum(UserFarmItemLog.amount))
        .filter(UserFarmItemLog.user_id == user_id,
                UserFarmItemLog.amount > 0,
                UserFarmItemLog.reason.in_([FarmItemReason.STAGE_REWARD,
                                            FarmItemReason.STREAK_REWARD]),
                UserFarmItemLog.created_at >= started,
                UserFarmItemLog.created_at <= ended)
        .group_by(UserFarmItemLog.item_type)
        .all()
    )
    for item_type, total in item_rows:
        if item_type in rewards:
            rewards[item_type] = int(total or 0)

    gem_total = (
        db.session.query(func.sum(GemLog.amount))
        .filter(GemLog.user_id == user_id,
                GemLog.amount > 0,
                GemLog.reason == GemReason.FARM_REWARD,
                GemLog.created_at >= started,
                GemLog.created_at <= ended)
        .scalar()
    )
    rewards['gem'] = int(gem_total or 0)
    return rewards


def _session_streak(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """계약 session-summary.streak — 현재 연속일, 이번에 닿은 마일스톤, 이번 주(월~일) 상태.

    마일스톤을 '지금 연속일과 같은 값'으로 찾는 이유는, 마일스톤이 정확히 그 날짜에
    한 번만 걸리기 때문이다(11.4). 지급 여부 자체는 max_milestone_awarded 가 관리한다.

    `week` — 프론트(StudyResult.jsx `buildStreakWeek`)가 실제 날짜별 기록 없이 `current`
    하나로 "오늘부터 거꾸로 current 일만큼 학습함"을 가정해 이번 주 물방울을 그리던 문제의
    원인이다. 보호권으로 이어진 날도 학습일과 똑같이 'on'으로 그려져, 홈 카드(빈 칸으로
    그림)와 서로 다른 그림이 됐다. 이제 서버가 월~일 각 날짜의 실제 `status` 를 내려주므로
    프론트는 더 이상 `current` 로 날짜를 역산하지 않아도 된다.
    """
    now = now or dt.datetime.utcnow()
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    monday = localday.week_monday(today)
    sunday = monday + dt.timedelta(days=6)

    row = db.session.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    current = int(getattr(row, 'current_streak', 0) or 0)
    milestone = None
    for days, kind, amount in C.STREAK_MILESTONES:
        if days == current:
            milestone = {'days': days, 'reward': _reward_label(kind, amount)}
            break

    # sunday >= today 는 항상 성립한다(monday = week_monday(today)) — today 까지만 조회하면 된다.
    flags = streak_v2.day_flags(user_id, monday, today)
    week = []
    cursor = monday
    while cursor <= sunday:
        if cursor > today:
            status = 'future'
        else:
            qualified, protected = flags.get(cursor, (False, False))
            status = streak_v2.day_status(qualified, protected)
        week.append({'date': cursor.isoformat(), 'status': status, 'is_today': cursor == today})
        cursor += dt.timedelta(days=1)

    return {'current': current, 'milestone': milestone, 'week': week}


def _reward_label(kind: str, amount: int) -> str:
    """마일스톤 보상 문구. 화면에 그대로 나가므로 한국어로 만든다."""
    if kind == 'GEM':
        return f'보석 {amount}개'
    return f'{inventory.ITEM_LABEL.get(kind, kind)} {amount}개'
