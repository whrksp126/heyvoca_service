"""오늘의 물주기 — 상태 전이 반영, 무료 긴급 급수, 오늘 학습 우선순위 (기획 6.5, 8.4, 12.1).

건강은 조회 시 계산이 원칙이다(6.3). 그런데 "시들기 시작한 순간"과 "썩은 순간"은
사용자에게 알림을 보내고 밸런싱을 판단하는 근거라 **기록으로 남아야** 한다.
계산만 하면 그 순간이 어디에도 남지 않는다. 그래서 이 모듈은
    계산은 매번, 저장은 상태가 실제로 바뀌었을 때만
으로 나눈다. 바뀌지 않은 행에는 UPDATE 를 내지 않는다.

전체 스캔 비용에 대해:
    V1 의 _load_plants 는 조회마다 사용자의 **모든** UserVoca 를 읽고 data JSON 을
    전부 파싱했다. 단어 3,000개면 요청 한 번에 JSON 파싱 3,000회다.
    여기서는 두 단계로 좁힌다.
    1) SQL 에서 후보를 거른다 — 보유 씨앗(안 썩음), 부패·황금(더 나빠질 곳이 없음),
       그리고 부패 예정일이 아직 한참 남은 행(rot_due_at > now + 유예 상한)은
       상태가 바뀔 수 없으므로 아예 읽지 않는다. ix_uvg_user_rotdue 가 이 조건을 탄다.
    2) 남은 후보에만 JSON 을 파싱한다.
    정상적으로 학습 중인 사용자라면 후보는 보통 수십 개다.

호출 빈도:
    compute_rot_state 는 **쓰기**를 한다. 홈 진입·오늘 목록 조회처럼 사용자가 농장을
    실제로 보는 지점에서 요청당 한 번만 부른다. 답안마다 부르면 안 된다 —
    answer.on_answer 가 그 단어의 건강을 이미 갱신한다.
"""

import datetime as dt
from typing import List, Optional
from uuid import UUID

from sqlalchemy import or_

from app import db
from app.models.models import (FarmEvent, FarmEventLog, HealthState, UserFarmSetting,
                               UserVoca, UserVocaGame, VisualStage)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, growth, health, localday
from app.services.game.farm_v2.answer import CROP_KEY
from app.services.game.farm_v2.restore import atomic, first_meaning

# 오늘 목록의 사유. 화면이 그룹 머리말로 그대로 쓴다(12.1 의 1~3순위).
REASON_CRITICAL = 'CRITICAL'      # 오늘 안 돌보면 실제로 썩는다
REASON_OVERDUE = 'OVERDUE'        # 예정일이 지났다
REASON_DUE_TODAY = 'DUE_TODAY'    # 오늘 예정

_REASON_TIER = {REASON_CRITICAL: 0, REASON_OVERDUE: 1, REASON_DUE_TODAY: 2}

# 상태가 나빠지는 순서. 전이가 '악화'인지 판정할 때 쓴다.
_SEVERITY = {
    HealthState.FRESH: 0,
    HealthState.THIRSTY: 1,
    HealthState.WILTED: 2,
    HealthState.CRITICAL: 3,
    HealthState.ROTTEN: 4,
}

_FAR_FUTURE = dt.datetime.max


def daily_limit(user_id: UUID) -> int:
    """하루 권장 복습 개수. 설정이 없으면 기본값 — 행을 새로 만들지는 않는다.

    조회 경로에서 설정 행을 INSERT 하지 않는 이유는 localday.get_timezone 과 같다.
    읽기만 하는 요청이 쓰기를 만들면 읽기 전용 복제본으로 못 보낸다.
    """
    row = (
        db.session.query(UserFarmSetting.daily_review_limit)
        .filter(UserFarmSetting.user_id == user_id)
        .first()
    )
    value = (row[0] if row else None) or C.DEFAULT_DAILY_REVIEW_LIMIT
    return max(1, int(value))


# ──────────────────────────────────────────────────────────────
# 후보 로딩
# ──────────────────────────────────────────────────────────────

def _candidate_query(user_id: UUID, now: dt.datetime, columns: list):
    """상태가 바뀔 수 있는 행만 남기는 공통 필터.

    rot_due_at 하나로 좁힐 수 있는 근거:
        rot_due_at = D + G + 보호일수 이고 G <= GRACE_MAX(30) 이므로,
        가장 이른 전이 시각인 D(목마름 진입)는 rot_due_at - 30 - 보호일수 이상이다.
        따라서 rot_due_at 이 now + 30일보다 뒤면 지금은 어떤 전이도 일어날 수 없다.
        보호를 받은 행(protection_days > 0)만 이 범위 밖으로 밀릴 수 있어 따로 포함한다.
    rot_due_at 이 NULL 인 행은 아직 한 번도 답안이 없어 일정이 잡히지 않은 경우다.
    판단할 근거가 없으므로 포함해 두고 FSRS 를 본다.
    """
    horizon = now + dt.timedelta(days=C.GRACE_MAX)
    return (
        db.session.query(*columns)
        .join(UserVoca, UserVoca.id == UserVocaGame.user_voca_id)
        .filter(
            UserVocaGame.user_id == user_id,
            # 보유 씨앗은 생장 주기가 시작되지 않았다(6.4)
            UserVocaGame.visual_stage != VisualStage.UNPLANTED_SEED,
            # 부패는 restore 를 거쳐야 벗어난다. 황금은 부패 면역(10.3).
            UserVocaGame.health_state.notin_([HealthState.ROTTEN, HealthState.GOLDEN]),
            or_(UserVocaGame.rot_due_at.is_(None),
                UserVocaGame.rot_due_at <= horizon,
                UserVocaGame.protection_days > 0),
        )
    )


# ──────────────────────────────────────────────────────────────
# 상태 전이 반영 (기획 6.3)
# ──────────────────────────────────────────────────────────────

@atomic
def compute_rot_state(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """사용자의 작물 건강을 계산하고 **바뀐 것만** 반영한다.

    악화 전이(시듦·심한 시듦·부패)에만 이벤트를 남긴다. 좋아지는 방향은 물주기로만
    일어나고 그건 answer.py 가 REVIEW_WATERED 로 이미 기록한다 — 여기서 또 남기면
    같은 사건이 두 번 센다. 다만 저장값이 계산값보다 나쁜 경우(예: 답안 처리가
    중간에 실패해 낡은 값이 남은 경우)에는 조용히 계산값으로 맞춘다.

    Returns:
        {'scanned', 'changed', 'transitions': [{user_voca_id, from, to}],
         'counts': {상태: 새로 진입한 수}}
    """
    now = now or dt.datetime.utcnow()

    rows = _candidate_query(
        user_id, now,
        [UserVocaGame, UserVoca.data],
    ).all()

    transitions = []
    counts = {}
    for game, data in rows:
        fsrs_state = _state_from_raw(data)
        due_at = growth.parse_fsrs_due(fsrs_state)
        stability = growth._stability(fsrs_state)
        result = health.compute_health(
            due_at, stability, now,
            visual_stage=game.visual_stage,
            protection_days=game.protection_days or 0,
            is_golden=False, already_rotten=False,
        )
        new_state = result['state']
        old_state = game.health_state or HealthState.FRESH
        # 부패 예정 시각은 상태가 그대로여도 최신으로 유지한다 —
        # 오늘 목록 정렬과 후보 필터가 이 컬럼에 의존한다.
        if result['rot_due_at'] is not None and game.rot_due_at != result['rot_due_at']:
            game.rot_due_at = result['rot_due_at']

        if new_state == old_state:
            continue

        game.health_state = new_state
        game.health_changed_at = now
        game.updated_at = now
        if new_state == HealthState.ROTTEN:
            game.rotten_at = now
            # 회복(RECOVER)을 걸어 두고 진단을 안 한 채 유예를 넘긴 작물이 여기로 온다.
            # 예약 표시를 남겨 두면 그 작물은 **아무 방법으로도 되살릴 수 없게 된다** —
            # restore.reserve_replant 는 "영양 회복이 진행 중"이라며 거부하고,
            # restore.recover_with_nutrient 는 "이미 회복 중"으로 보고 아무 일도 하지 않는다.
            # 다시 썩었다는 것은 그 회복 절차가 끝나지 않고 무효가 됐다는 뜻이므로
            # 여기서 지우고, 사용자는 아이템을 새로 써서 처음부터 다시 시작한다(기획 7.3).
            #
            # 삽(REPLANT) 예약은 이 경로로 오지 않는다 — 예약 시점에 이미 ROTTEN 이라
            # _candidate_query 가 걸러 낸다. 7.2 의 "다시 심기 미완료"는 그대로 보존된다.
            game.pending_action = None
            game.pending_started_at = None

        if _SEVERITY.get(new_state, 0) > _SEVERITY.get(old_state, 0):
            event = events.HEALTH_DOWN_EVENT.get(new_state)
            if event:
                events.log(user_id, event, user_voca_id=game.user_voca_id,
                           from_state=old_state, to_state=new_state,
                           reason='ELAPSED',
                           detail={'rot_due_at': result['rot_due_at'].isoformat()
                                   if result['rot_due_at'] else None})
            counts[new_state] = counts.get(new_state, 0) + 1

        transitions.append({'user_voca_id': game.user_voca_id,
                            'from': old_state, 'to': new_state})

    if transitions or db.session.dirty:
        db.session.commit()

    return {'scanned': len(rows), 'changed': len(transitions),
            'transitions': transitions, 'counts': counts}


def _state_from_raw(raw: Optional[str]) -> dict:
    """UserVoca.data 문자열 → FSRS state. growth.load_fsrs_state 의 컬럼 버전.

    컬럼만 뽑아 오면 엔티티를 세션에 올리지 않아 3,000개짜리 농장에서도
    identity map 이 부풀지 않는다.
    """
    from app.services.fsrs.state import get_fsrs_state, parse_user_voca_data
    try:
        return get_fsrs_state(parse_user_voca_data(raw)) or {}
    except Exception:
        return {}


# ──────────────────────────────────────────────────────────────
# 오늘 학습 목록 (기획 12.1, 6.5)
# ──────────────────────────────────────────────────────────────

def _due_items(user_id: UUID, now: dt.datetime) -> List[dict]:
    """오늘 돌볼 후보 전체를 우선순위 순으로 (자르기 전).

    부패는 제외한다 — 다시 심기/회복 전에는 학습 대상이 아니다(7.1).
    이미 부패 시각을 넘겼는데 아직 저장이 안 된 행도 계산값으로 걸러 낸다.
    compute_rot_state 를 부르지 않은 요청에서도 썩은 작물이 목록에 섞이지 않게 하려는 것이다.
    """
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    day_start, day_end = localday.day_bounds_utc(today, tz)

    rows = _candidate_query(
        user_id, now,
        [UserVocaGame, UserVoca.data, UserVoca.word, UserVoca.voca_meanings],
    ).all()

    items = []
    for game, data, word, meanings in rows:
        fsrs_state = _state_from_raw(data)
        due_at = growth.parse_fsrs_due(fsrs_state)
        if due_at is None or due_at >= day_end:
            continue    # 오늘 예정이 아니다
        stability = growth._stability(fsrs_state)
        result = health.compute_health(
            due_at, stability, now,
            visual_stage=game.visual_stage,
            protection_days=game.protection_days or 0,
            is_golden=False, already_rotten=False,
        )
        state = result['state']
        if state == HealthState.ROTTEN:
            continue

        if state == HealthState.CRITICAL:
            reason = REASON_CRITICAL      # 6.5 — 부패 직전은 무조건 맨 위
        elif due_at < day_start:
            reason = REASON_OVERDUE
        else:
            reason = REASON_DUE_TODAY

        items.append({
            'user_voca_id': game.user_voca_id,
            'word': word or '',
            'meaning': first_meaning(meanings),
            'reason': reason,
            'health': state,
            'stage': game.visual_stage,
            'crop': CROP_KEY.get(game.visual_stage, 'seed'),
            'due_at': localday.iso_utc(due_at),
            'rot_due_at': localday.iso_utc(result['rot_due_at']) if result['rot_due_at'] else None,
            'days_to_rot': result['days_to_rot'],
            '_sort': (_REASON_TIER[reason],
                      result['rot_due_at'] or _FAR_FUTURE,
                      due_at,
                      game.user_voca_id),
        })

    items.sort(key=lambda it: it['_sort'])
    for it in items:
        it.pop('_sort', None)
    return items


def today_queue(user_id: UUID, now: Optional[dt.datetime] = None,
                limit: Optional[int] = None) -> dict:
    """오늘 학습 목록 (기획 12.1).

    순서는 부패 직전 → 예정일 지남 → 오늘 예정이다. 같은 순위 안에서는 부패 예정이
    이른 것부터 — 오늘 20개만 할 수 있다면 "가장 먼저 썩을 것"부터 살리는 게 맞다.

    limit 을 넘긴 항목도 잘라서 버리지 않고 총계를 함께 돌려준다. 홈 카드가
    "오늘 돌볼 작물 18개"를 말해야 하고(12.1), 무료 긴급 급수 판정도 총계가 필요하다.
    """
    now = now or dt.datetime.utcnow()
    cap = daily_limit(user_id) if limit is None else max(1, int(limit))
    items = _due_items(user_id, now)
    critical_cnt = sum(1 for it in items if it['reason'] == REASON_CRITICAL)
    return {
        'items': items[:cap],
        'total': len(items),
        'critical_first': critical_cnt,
        'recommended_limit': cap,
        'over_limit': max(0, len(items) - cap),
    }


# ──────────────────────────────────────────────────────────────
# 무료 긴급 급수 (기획 8.4)
# ──────────────────────────────────────────────────────────────

@atomic
def apply_emergency_water(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """하루 권장량을 넘겨 오늘 목록에서 밀려난 CRITICAL 작물의 부패를 +1일 민다.

    발동 조건이 좁은 이유는 이게 **아이템이 아니라 안전장치**이기 때문이다.
    사용자가 스스로 미룬 작물까지 밀어 주면 부패가 사실상 사라진다. 그래서
    "시스템이 정한 권장량 때문에 오늘 목록에 못 들어간 것"만 대상으로 한다 —
    구현상으로는 우선순위 정렬 결과에서 권장량 뒤로 밀려난 CRITICAL 이다.
    CRITICAL 을 맨 앞에 놓고도 잘렸다는 건 CRITICAL 만으로 권장량을 넘었다는 뜻이다.

    같은 날 두 번 적용하지 않기 위해 오늘 남긴 PROTECTION_APPLIED 로그를 본다.
    홈 진입마다 이 함수가 불릴 수 있는데, 그때마다 하루씩 밀면 앱을 열기만 해도
    부패가 무한정 미뤄진다. (다음 날 다시 조건을 만족하면 그때 또 적용된다 — 8.4 허용.)

    Returns:
        {'applied', 'user_voca_ids', 'due_total', 'limit'}
    """
    now = now or dt.datetime.utcnow()
    limit = daily_limit(user_id)
    items = _due_items(user_id, now)

    if len(items) <= limit:
        return {'applied': 0, 'user_voca_ids': [], 'due_total': len(items), 'limit': limit}

    excluded = items[limit:]
    targets = [it['user_voca_id'] for it in excluded if it['reason'] == REASON_CRITICAL]
    if not targets:
        return {'applied': 0, 'user_voca_ids': [], 'due_total': len(items), 'limit': limit}

    tz = localday.get_timezone(user_id)
    day_start, day_end = localday.day_bounds_utc(localday.local_day(now, tz), tz)
    already = {
        row[0] for row in
        db.session.query(FarmEventLog.user_voca_id)
        .filter(FarmEventLog.user_id == user_id,
                FarmEventLog.event == FarmEvent.PROTECTION_APPLIED,
                FarmEventLog.user_voca_id.in_(targets),
                FarmEventLog.created_at >= day_start,
                FarmEventLog.created_at < day_end)
        .all()
    }
    targets = [i for i in targets if i not in already]
    if not targets:
        return {'applied': 0, 'user_voca_ids': [], 'due_total': len(items), 'limit': limit}

    games = {
        g.user_voca_id: g for g in
        db.session.query(UserVocaGame)
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.user_voca_id.in_(targets))
        .with_for_update()
        .all()
    }

    applied = []
    for user_voca_id in targets:
        game = games.get(user_voca_id)
        if game is None or game.health_state != HealthState.CRITICAL:
            continue
        before = game.rot_due_at
        game.protection_days = (game.protection_days or 0) + C.EMERGENCY_WATER_DAYS
        game.rot_due_at = (before or now) + dt.timedelta(days=C.EMERGENCY_WATER_DAYS)
        game.updated_at = now
        # 8.4 는 적용 전·후 부패 시점을 로그에 남길 것을 명시한다.
        # 나중에 "왜 안 썩었는가"를 되짚을 수 있는 유일한 근거다.
        events.log(user_id, FarmEvent.PROTECTION_APPLIED, user_voca_id=user_voca_id,
                   from_state=HealthState.CRITICAL, to_state=HealthState.CRITICAL,
                   reason='OVER_DAILY_LIMIT',
                   detail={'before': before.isoformat() if before else None,
                           'after': game.rot_due_at.isoformat(),
                           'days': C.EMERGENCY_WATER_DAYS,
                           'limit': limit, 'due_total': len(items)})
        applied.append(user_voca_id)

    if applied:
        db.session.commit()

    return {'applied': len(applied), 'user_voca_ids': applied,
            'due_total': len(items), 'limit': limit}
