"""복귀 농장 회복 미션 (기획 7.4).

30일 이상 비운 사용자가 돌아왔을 때 부패 수백 개를 그대로 들이밀지 않기 위한 완충 장치다.
연속 3일 매일 5개를 채우면 **복귀 시점에 이미 썩어 있던** 작물에 영양 회복제와 같은 효능을
일괄 적용한다.

이 모듈이 다루는 것과 다루지 않는 것:
    다룬다   — 미션 생성/진행/만료, 1회성 회복 효과 적용, 하루 권장량 축소
    안 다룬다 — 회복 이후의 진단 복습 진행. 그건 학습 흐름(answer/restore)의 몫이고,
               여기서는 '진단 대상'이라는 표시(pending_action)까지만 남긴다.

'마지막 접속'의 판정 근거로 User.last_logged_at 을 쓰지 않는다:
    auth.py 를 보면 last_logged_at 은 일부 로그인 경로에서만 갱신되고(구글·애플 본 경로는
    주석 처리돼 있다), 값도 `datetime.now(tz=KST)` 라 naive UTC 컬럼에 KST 벽시계가 들어가
    9시간 어긋난다. 그 값으로 30일을 재면 어떤 사용자는 영원히 복귀자가 되지 않고
    어떤 사용자는 하루 만에 복귀자가 된다.
    CheckIn 은 학습한 날마다 현지 날짜로 한 행이 쌓이므로 '마지막으로 농장에 온 날'을
    가장 정확히 말해 준다. 게다가 복귀 미션이 되돌리려는 것은 로그인 공백이 아니라
    **학습 공백**이다.
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_

from app import db
from app.models.models import (CheckIn, FarmEvent, HealthState, UserComebackMission,
                               UserStudyLog, UserVocaGame, VisualStage)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, localday

STATUS_ACTIVE = 'ACTIVE'
STATUS_COMPLETED = 'COMPLETED'
STATUS_EXPIRED = 'EXPIRED'

# 회복 효과를 적용한 사유 표시. 아이템을 쓴 회복과 로그에서 구분돼야
# "회복제를 산 적 없는데 회복됐다"는 문의를 로그로 답할 수 있다.
REASON_COMEBACK = 'COMEBACK_MISSION'


# ──────────────────────────────────────────────────────────────
# 조회
# ──────────────────────────────────────────────────────────────

def get_active(user_id: UUID, now: dt.datetime) -> Optional[UserComebackMission]:
    """유효한 ACTIVE 미션. 7일 창을 넘겼으면 없는 것으로 본다.

    여기서 EXPIRED 로 고쳐 쓰지 않는 이유는 이 함수가 GET 경로(overview)에서도
    불리기 때문이다. 만료 확정은 쓰기 경로(check_and_start / record_day)가 한다.
    """
    row = (
        db.session.query(UserComebackMission)
        .filter(UserComebackMission.user_id == user_id,
                UserComebackMission.status == STATUS_ACTIVE)
        .order_by(UserComebackMission.started_at.desc())
        .first()
    )
    if row is None:
        return None
    if row.expires_at is not None and now > row.expires_at:
        return None
    return row


def get_state(user_id: UUID, now: Optional[dt.datetime] = None) -> Optional[dict]:
    """계약 overview.comeback. 미션이 없으면 None.

    progress_days 를 저장값 그대로 주지 않는다. 어제 학습을 걸렀다면 진행도는 이미
    끊긴 것인데, 다음 학습이 있기 전까지 아무도 이 행을 건드리지 않아 저장값은
    끊기기 전 숫자로 남아 있다. 화면이 "2일째"라고 해 놓고 다음 학습에서 1일로
    떨어지면 사용자는 빼앗겼다고 느낀다.
    """
    now = now or dt.datetime.utcnow()
    mission = get_active(user_id, now)
    if mission is None:
        return None

    today = localday.user_local_day(user_id, now)
    return {
        'progress_days': _effective_progress(mission, today),
        'required_days': C.COMEBACK_REQUIRED_DAYS,
        'expires_at': localday.iso_utc(mission.expires_at) if mission.expires_at else None,
        'rotten_snapshot': int(mission.rotten_snapshot or 0),
    }


def course_limit(state: Optional[dict], default_limit: int) -> int:
    """복귀 중인 사용자의 하루 권장 학습량 (기획 7.4 "하루 10~20개씩").

    복귀자에게 평소 권장량(60개)을 그대로 주면 첫 화면이 곧 수백 개의 밀린 일이 된다.
    기획이 금지한 것은 '부패 카운트 노출' 자체가 아니라 그 규모에 압도되는 경험이므로,
    백엔드가 통제할 수 있는 지점인 하루 분량을 코스 크기로 낮춘다.
    """
    limit = int(default_limit or C.DEFAULT_DAILY_REVIEW_LIMIT)
    if not state:
        return limit
    return max(C.COMEBACK_COURSE_MIN, min(limit, C.COMEBACK_COURSE_MAX))


def _effective_progress(mission: UserComebackMission, today: dt.date) -> int:
    """하루라도 끊겼으면 0. 저장값을 고치지는 않는다(읽기 경로에서도 쓰이므로)."""
    saved = int(mission.progress_days or 0)
    last = mission.last_progress_day
    if saved <= 0 or last is None:
        return saved
    # 오늘이거나 어제까지 이어졌으면 유효. 그 이상 벌어졌으면 끊긴 것이다.
    return saved if (today - last).days <= 1 else 0


# ──────────────────────────────────────────────────────────────
# 미션 시작
# ──────────────────────────────────────────────────────────────

def check_and_start(user_id: UUID, now: Optional[dt.datetime] = None) -> Optional[dict]:
    """30일 이상 비운 뒤 첫 진입이면 복귀 미션을 만든다 (기획 7.4).

    농장 진입 시점(overview 이전)에 한 번 불린다. 이미 ACTIVE 미션이 있으면 그대로 둔다 —
    복귀 기간 중 매 진입마다 미션이 새로 생기면 3일 진행도가 계속 초기화된다.

    Returns:
        계약 overview.comeback 과 같은 dict. 대상이 아니면 None.
    """
    now = now or dt.datetime.utcnow()

    existing = get_active(user_id, now)
    if existing is not None:
        return get_state(user_id, now)

    # 창을 넘긴 ACTIVE 는 여기서 확정 만료시킨다. 남겨 두면 다음 복귀 때 이 행이
    # get_active 에 계속 걸려 새 미션이 만들어지지 않는다.
    _expire_stale(user_id, now)

    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    last_day = (
        db.session.query(func.max(CheckIn.attendence_date))
        .filter(CheckIn.user_id == user_id)
        .scalar()
    )
    if last_day is None:
        # 학습 이력이 아예 없는 사용자는 '복귀'가 아니라 '신규'다.
        return None

    absent_days = (today - last_day).days
    if absent_days < C.COMEBACK_ABSENT_DAYS:
        return None

    # 같은 공백에 대해 미션을 두 번 만들지 않는다. 마지막 학습일 이후에 시작된 미션이
    # 이미 있다면(완료됐든 만료됐든) 이번 복귀는 이미 처리된 것이다.
    handled = (
        db.session.query(UserComebackMission.id)
        .filter(UserComebackMission.user_id == user_id,
                UserComebackMission.started_at >= localday.day_bounds_utc(last_day, tz)[0])
        .first()
    )
    if handled is not None:
        return None

    from app.services.game.farm_v2 import query   # 순환 참조 방지 — query 가 이 모듈을 쓴다
    rotten = query.count_rotten(user_id, now)

    mission = UserComebackMission(
        user_id=user_id,
        absent_days=absent_days,
        rotten_snapshot=rotten,
        expires_at=now + dt.timedelta(days=C.COMEBACK_WINDOW_DAYS),
    )
    mission.started_at = now
    db.session.add(mission)
    db.session.commit()

    return get_state(user_id, now)


def _expire_stale(user_id: UUID, now: dt.datetime) -> None:
    rows = (
        db.session.query(UserComebackMission)
        .filter(UserComebackMission.user_id == user_id,
                UserComebackMission.status == STATUS_ACTIVE,
                UserComebackMission.expires_at.isnot(None),
                UserComebackMission.expires_at < now)
        .all()
    )
    if not rows:
        return
    for row in rows:
        row.status = STATUS_EXPIRED
    db.session.commit()


# ──────────────────────────────────────────────────────────────
# 하루 진행
# ──────────────────────────────────────────────────────────────

def record_day(user_id: UUID, now: Optional[dt.datetime] = None) -> Optional[dict]:
    """그날의 학습량을 미션 진행도에 반영한다 (기획 7.4).

    학습 세션이 끝난 뒤에 불린다. 하루 5개를 채운 날만 +1 이고, 하루라도 건너뛰면
    0 으로 되돌린 뒤 오늘부터 다시 센다.

    '오늘 5개'의 근거로 CheckIn.correct_word_cnt 대신 UserStudyLog 를 직접 세는 이유는,
    그 컬럼이 연속 학습일(T3)의 관리 대상이라 복귀 미션이 남의 집계 타이밍에 의존하게
    되기 때문이다. 서로 다른 두 기능이 같은 사실을 각자의 근거로 판정하는 편이 안전하다.
    또한 기준이 '서로 다른 단어 5개'라 중복 응답을 distinct 로 걸러야 한다.

    Returns:
        갱신된 상태 dict. 미션이 없으면 None.
    """
    now = now or dt.datetime.utcnow()
    mission = get_active(user_id, now)
    if mission is None:
        _expire_stale(user_id, now)
        return None

    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    if mission.last_progress_day == today:
        return get_state(user_id, now)   # 하루는 한 번만 센다

    start_utc, end_utc = localday.day_bounds_utc(today, tz)
    done = int(
        db.session.query(func.count(func.distinct(UserStudyLog.user_voca_id)))
        .filter(UserStudyLog.user_id == user_id,
                UserStudyLog.was_correct == True,   # noqa: E712 — SQLAlchemy 표현식
                UserStudyLog.created_at >= start_utc,
                UserStudyLog.created_at < end_utc)
        .scalar() or 0
    )
    if done < C.COMEBACK_DAILY_WORDS:
        return get_state(user_id, now)

    # 끊긴 진행도는 여기서 확정 반영한다(읽기 경로의 _effective_progress 와 같은 판정).
    progress = _effective_progress(mission, today)
    mission.progress_days = progress + 1
    mission.last_progress_day = today

    if mission.progress_days >= C.COMEBACK_REQUIRED_DAYS:
        grant_reward(user_id, mission, now)   # 안에서 커밋한다
    else:
        db.session.commit()

    return get_state(user_id, now)


# ──────────────────────────────────────────────────────────────
# 보상
# ──────────────────────────────────────────────────────────────

def grant_reward(user_id: UUID, mission: UserComebackMission,
                 now: Optional[dt.datetime] = None) -> dict:
    """복귀 전용 영양 회복 — 1회성 서버 보상 (기획 7.4).

    영양 회복제와 **효능은 같고 아이템은 오가지 않는다**. 그래서 inventory.spend 를
    부르지 않고, restore.py 도 고치지 않는다. 대신 아이템 소비를 뺀 회복 효과만
    여기서 직접 적용한다 — 회복제 경로에 '공짜 플래그'를 뚫으면 그 플래그가
    언젠가 다른 곳에서 쓰이고, 재화 없이 회복되는 경로가 조용히 늘어난다.

    대상은 **복귀 시점에 이미 썩어 있던** 작물만이다. 미션 3일 동안 새로 썩은 것까지
    덤으로 주면 미션 중 방치가 이득이 된다.

    Raises:
        ValueError — 이미 보상을 받은 미션
    """
    now = now or dt.datetime.utcnow()
    if mission.rewarded_at is not None:
        raise ValueError('이미 복귀 보상을 받은 미션이에요.')

    targets = _snapshot_rotten(user_id, mission)
    vocas = _load_vocas([g.user_voca_id for g in targets])
    logs = []
    for game in targets:
        _apply_nutrient_effect(game, vocas.get(game.user_voca_id), now)
        logs.append(events.build(
            user_id, FarmEvent.RECOVERED,
            user_voca_id=game.user_voca_id,
            from_state=HealthState.ROTTEN, to_state=HealthState.FRESH,
            reason=REASON_COMEBACK,
        ))
    events.log_many(logs)

    mission.status = STATUS_COMPLETED
    mission.rewarded_at = now
    mission.recovered_cnt = len(targets)
    db.session.commit()

    return {
        'recovered': len(targets),
        'rotten_snapshot': int(mission.rotten_snapshot or 0),
        'progress_days': int(mission.progress_days or 0),
        'required_days': C.COMEBACK_REQUIRED_DAYS,
    }


def _snapshot_rotten(user_id: UUID, mission: UserComebackMission) -> list:
    """복귀 시점(started_at)에 이미 썩어 있던 작물.

    저장값(health_state)과 시각 판정(rot_due_at)을 둘 다 본다. 복귀자는 오래 비운 사이
    아무도 그 행을 건드리지 않아 저장값이 FRESH 로 멈춰 있을 수 있기 때문이다 —
    그게 바로 이 미션이 필요한 상황이다.
    """
    started = mission.started_at or dt.datetime.utcnow()
    return (
        db.session.query(UserVocaGame)
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.visual_stage != VisualStage.GOLDEN,
                or_(
                    UserVocaGame.health_state == HealthState.ROTTEN,
                    UserVocaGame.rot_due_at <= started,
                ))
        .all()
    )


def _load_vocas(voca_ids: list) -> dict:
    """대상 단어의 UserVoca 행 — {id: row}. IN 절이 커지지 않게 묶어서 읽는다.

    복귀자는 부패 단어가 수백 개일 수 있어 한 번에 물어보면 IN 리스트가 통째로 파싱된다.
    """
    from app.models.models import UserVoca

    rows = {}
    ids = list(voca_ids or [])
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        for uv in db.session.query(UserVoca).filter(UserVoca.id.in_(chunk)).all():
            rows[uv.id] = uv
    return rows


def _apply_nutrient_effect(game: UserVocaGame, user_voca, now: dt.datetime) -> None:
    """회복제 1개를 쓴 것과 같은 상태 변화 — 아이템 소비만 없다 (기획 7.3).

    restore.recover_with_nutrient 를 부르지 않는 이유는 그 함수가 '아이템을 쓴다'는
    사실까지 포함한 하나의 거래이기 때문이다. 소비만 건너뛰는 인자를 새로 뚫으면
    그 인자가 언젠가 다른 호출부에서도 쓰여, 재화 없이 회복되는 경로가 조용히 늘어난다.
    대신 아이템 소비를 뺀 **나머지 효과 전부**를 회복제 경로의 함수로 그대로 만든다.

    FSRS 안정성 복원(7.3 의 70~80%)을 여기서도 반드시 해야 하는 이유:
        복귀자의 next_review 는 수십~수백 일 지나 있다. 게임 레이어만 FRESH 로 돌려 놓고
        FSRS 를 그대로 두면, 다음 부패 재계산(watering.compute_rot_state — 홈 진입마다 돈다)
        이 곧바로 같은 작물을 다시 부패로 확정한다. 3일 미션을 채운 보상이 홈 화면을
        한 번 여는 사이에 사라진다.
        restore._soften_fsrs_for_recover 가 next_review 를 지금으로 당기므로,
        회복 직후의 유예 G 가 그 시점부터 다시 시작된다.

    visual_stage 는 그대로 둔다 — 회복의 정의가 '이전 성장 단계 보존'이다(7.3).
    진단 복습 대상 표시(pending_action)를 남겨 다음 답안이 restore.complete_diagnosis 로
    마무리하게 한다.
    """
    from app.services.game.farm_v2 import restore

    game.health_state = HealthState.FRESH
    game.health_changed_at = now
    game.rotten_at = None
    game.protection_days = 0
    game.recovery_count = (game.recovery_count or 0) + 1
    game.pending_action = restore.PENDING_RECOVER
    game.pending_started_at = now
    game.updated_at = now

    if user_voca is None:
        # 단어 행을 못 찾은 경우에만 마감을 비워 둔다. 다음 답안이 일정을 다시 잡는다.
        game.rot_due_at = None
        return

    moved = restore._soften_fsrs_for_recover(user_voca, now)
    restore._apply_rot_schedule(game, now, moved['stability_after'], now)
