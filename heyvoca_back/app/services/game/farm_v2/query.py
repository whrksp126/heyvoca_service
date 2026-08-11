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
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, case, func, or_

from app import db
from app.models.models import (CheckIn, FarmEvent, FarmEventLog, FarmItem, FarmItemReason,
                               GemLog, GemReason, HealthState, User, UserFarmItemLog,
                               UserFarmMigration, UserFarmSetting, UserStreak,
                               UserStudySession, UserVoca, UserVocaGame, VisualStage)
from app.services.game.farm_v2 import answer, comeback, growth, inventory, localday
from app.services.game.farm_v2 import constants as C
# `health` 는 아래에서 파라미터 이름으로도 써야 한다(계약의 ?health=). 모듈 쪽에 별칭을 준다.
from app.services.game.farm_v2 import health as health_calc

# 홈 4그룹 → 해당 성장 단계. growth.HOME_GROUP 의 역방향이다.
# 'golden' 은 별도 그룹이 아니라 당근 그룹의 하위 집합이다(계약 counts 의 golden 과 같은 뜻).
GROUP_STAGES = {
    'seed':   (VisualStage.UNPLANTED_SEED, VisualStage.PLANTED_SEED),
    'sprout': (VisualStage.SPROUT,),
    'leaf':   (VisualStage.LEAF,),
    'carrot': (VisualStage.CARROT, VisualStage.GOLDEN),
    'golden': (VisualStage.GOLDEN,),
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


# ──────────────────────────────────────────────────────────────
# GET /farm/overview
# ──────────────────────────────────────────────────────────────

def get_overview(user_id: UUID, now: Optional[dt.datetime] = None,
                 refresh: bool = True) -> dict:
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

    counts, seed_detail = _stage_counts(user_id)
    health_counts = _health_counts(user_id, now)

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
            # 예정일이 지난 작물 수. 부패는 학습이 막혀 있으므로 오늘 할 일에 넣지 않는다(6.1).
            'due': sum(health_counts[_HEALTH_KEYS[s]] for s in _DUE_STATES),
            # 부패까지 남은 단계가 하나뿐인 작물 — 오늘 목록 맨 앞에 올린다(8.4).
            'critical_first': health_counts['critical'],
            'recommended_limit': comeback.course_limit(comeback_state, setting_limit),
        },
        'items': inventory.get_counts(user_id),
        'gem_cnt': int(gem_cnt),
        'streak': _streak_state(user_id, now),
        'comeback': comeback_state,
        'migration_notice': _migration_notice(user_id),
    }


def _stage_counts(user_id: UUID) -> tuple:
    """성장 단계 집계 → 홈 4그룹 + 황금 + 씨앗 상세.

    황금을 당근 그룹에 **포함**시킨 이유는 홈이 4그룹 그림판이기 때문이다(5.1).
    황금만 따로 빼면 4그룹 합이 전체 단어 수와 어긋나 "내 단어가 어디 갔지"가 된다.
    씨앗 상세와 같은 구조다 — 그룹은 4개, 세부는 그 안의 내역.
    """
    rows = (
        db.session.query(UserVocaGame.visual_stage, func.count())
        .filter(UserVocaGame.user_id == user_id)
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
        .filter(UserVoca.user_id == user_id)
        .scalar() or 0
    )
    missing = max(0, total_voca - total_games)
    counts['seed'] += missing
    seed_detail['unplanted'] += missing
    return counts, seed_detail


def _health_counts(user_id: UUID, now: dt.datetime) -> dict:
    """건강 상태 집계. GOLDEN 행은 계약의 5개 키 어디에도 넣지 않는다."""
    expr = effective_health_expr(now)
    rows = (
        db.session.query(expr, func.count())
        .filter(UserVocaGame.user_id == user_id)
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
        # 48시간 복구 창 안이면 아직 되살릴 수 있으므로 숫자를 남겨 둔다(11.3).
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
                limit: int = 50, cursor: Optional[int] = None) -> dict:
    """작물 목록 (계약 GET /farm/plants). 커서 페이지네이션.

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

    # **UserVoca 를 기준으로 LEFT JOIN 한다.** 게임 행(UserVocaGame)은 그 단어를 한 번이라도
    # 학습해야 생기므로, 게임 행을 기준으로 조인하면 아직 심지 않은 보유 씨앗이 목록에서
    # 통째로 빠진다. 실측으로 단어 514개 중 145개만 나왔다 — 밭의 대부분을 차지하는
    # 씨앗이 사라지는 셈이라 홈의 카운트(514)와도 어긋났다.
    q = (
        db.session.query(UserVocaGame, UserVoca)
        .select_from(UserVoca)
        .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
        .filter(UserVoca.user_id == user_id)
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

    items = [_plant_item(game, user_voca, now) for game, user_voca in rows]
    return {
        'items': items,
        'next_cursor': rows[-1][1].id if (has_more and rows) else None,
    }


def home_feed(user_id: UUID, now: Optional[dt.datetime] = None,
              limit: int = 5) -> dict:
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

    def rows(build):
        q = build(
            db.session.query(UserVocaGame, UserVoca)
            .select_from(UserVoca)
            .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
            .filter(UserVoca.user_id == user_id)
        )
        return [_plant_item(game, uv, now) for game, uv in q.limit(limit).all()]

    eff = effective_health_expr(now)
    care_states = (HealthState.THIRSTY, HealthState.WILTED, HealthState.CRITICAL)

    care = rows(lambda q: q
                .filter(eff.in_(care_states))
                # 마감이 없는 행은 뒤로 — MySQL 은 NULL 을 먼저 놓는다
                .order_by(UserVocaGame.rot_due_at.is_(None).asc(),
                          UserVocaGame.rot_due_at.asc()))

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
        'streak': _session_streak(user_id),
        'protected': protected,
        'correct': int(session.correct_count or 0),
        'total': int(session.question_count or 0),
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


def _session_streak(user_id: UUID) -> dict:
    """계약 session-summary.streak — 현재 연속일과 이번에 닿은 마일스톤.

    마일스톤을 '지금 연속일과 같은 값'으로 찾는 이유는, 마일스톤이 정확히 그 날짜에
    한 번만 걸리기 때문이다(11.4). 지급 여부 자체는 max_milestone_awarded 가 관리한다.
    """
    row = db.session.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    current = int(getattr(row, 'current_streak', 0) or 0)
    milestone = None
    for days, kind, amount in C.STREAK_MILESTONES:
        if days == current:
            milestone = {'days': days, 'reward': _reward_label(kind, amount)}
            break
    return {'current': current, 'milestone': milestone}


def _reward_label(kind: str, amount: int) -> str:
    """마일스톤 보상 문구. 화면에 그대로 나가므로 한국어로 만든다."""
    if kind == 'GEM':
        return f'보석 {amount}개'
    return f'{inventory.ITEM_LABEL.get(kind, kind)} {amount}개'
