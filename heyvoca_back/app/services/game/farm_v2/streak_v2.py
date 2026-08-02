"""연속 학습일 V2 (기획 11).

기존 끈기왕(`app/services/streak.py`)과 무엇이 다른가:

1. 기준이 다르다. 끈기왕은 `CheckIn.daily_mission_complete`(데일리 미션 전부 달성)를 본다.
   V2 는 **그날 정답 완료한 서로 다른 단어 5개**다(11.1). 미션을 다 못 채운 날도
   5개를 했으면 연속은 이어진다 — 목표를 크게 잡은 사용자가 목표 때문에 연속을 잃는
   구조를 없애기 위해서다.
2. 하루 경계가 다르다. 끈기왕은 `kst_today()` 로 KST 가 박혀 있다. V2 는 사용자 현지
   자정을 쓴다(11.2) — 하루의 정의는 `localday` 모듈 하나만 갖는다.
3. 재계산으로 복원할 수 없는 상태가 붙는다. 보호권 자동 소모, 48시간 복구 창,
   마일스톤 1회 지급은 로그를 다시 훑어도 나오지 않으므로 `UserStreak` 에 들고 있다.

현재 연속일수 자체는 `CheckIn.streak_qualified/streak_protected` 로 되짚을 수 있다.
그래서 이 모듈은 **저장값을 권위로 쓰되, 갱신할 때마다 CheckIn 을 되짚어 교차 검증**한다
(`_walk_back`). 어느 한쪽만 어긋나도 사용자에게 유리한 쪽(큰 값)으로 수렴시킨다 —
연속 기록은 잘못 깎였을 때의 피해가 잘못 늘었을 때보다 훨씬 크다.

기획 11.5 가 금지한 연출("큰 빨간 0", 복구 결제 우선 노출)을 화면이 만들지 않도록,
응답에 "며칠을 잃었다" 류의 손실 강조 필드를 두지 않는다. 끊긴 사실은 `current` 가
작아진 것으로만 드러나고, `best` 는 그대로 남으며, 복구 가능 여부는 부가 정보
(`recovery_until`/`recoverable`)로만 나간다.
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from app import db
from app.models.models import (CheckIn, FarmEvent, FarmItem, FarmItemReason,
                               UserStreak, UserStudyLog)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, inventory, localday

_DAY = dt.timedelta(days=1)

# CheckIn 되짚기 범위. 연속일은 원리상 무한히 길어질 수 있지만 매번 전 기간을 읽을 수는 없다.
# 이 범위를 넘어가는 기록은 저장값(current_streak)을 신뢰한다 — `_resolve_current` 참고.
_WALK_BACK_DAYS = 1200

# 화면에 그대로 나가는 마일스톤 보상 문구. `constants.STREAK_MILESTONES` 는 기계용
# 튜플이라 사람이 읽을 이름이 없다. 라벨을 여기서만 만들어 두면 문구가 갈리지 않는다.
_REWARD_LABEL = {
    'GEM': '보석',
    FarmItem.SHOVEL: inventory.ITEM_LABEL[FarmItem.SHOVEL],
    FarmItem.NUTRIENT: inventory.ITEM_LABEL[FarmItem.NUTRIENT],
    FarmItem.SHIELD: inventory.ITEM_LABEL[FarmItem.SHIELD],
}


# ──────────────────────────────────────────────────────────────
# 내부 헬퍼 — 전부 커밋하지 않는다. 공개 함수가 트랜잭션을 닫는다.
# ──────────────────────────────────────────────────────────────

def _get_or_create_streak(user_id: UUID) -> UserStreak:
    """연속 기록 행. 없으면 만든다.

    행 잠금(`with_for_update`)을 거는 이유는 아이템과 같다 — 두 기기에서 같은 순간에
    답을 보내면 연속일이 하루에 두 번 오르거나 보호권이 두 번 소모될 수 있다.
    """
    row = (
        db.session.query(UserStreak)
        .filter(UserStreak.user_id == user_id)
        .with_for_update()
        .first()
    )
    if row is None:
        # **빈 행으로 시작하지 않는다.** V2 훅이 배포되면 이 함수가 전환 스크립트보다
        # 먼저 불릴 수 있다(학습 한 번이면 된다). 그때 0 으로 만들어 두면 그 사용자의
        # 끈기왕 연속일이 그대로 날아간다 — 과거 CheckIn 에는 아직 streak_qualified 가
        # 없어 되짚기로도 못 살린다. 그래서 만드는 순간 레거시 기록에서 시드한다.
        # 이러면 배포와 이행의 순서에 기대지 않아도 된다.
        row = _seed_from_legacy(user_id)
        db.session.add(row)
        db.session.flush()
    return row


def _seed_from_legacy(user_id: UUID) -> UserStreak:
    """레거시 끈기왕(CheckIn.daily_mission_complete)에서 UserStreak 행을 만든다.

    기준일을 **KST(끈기왕 그대로)** 로 잡는다. 승계의 목적은 사용자가 어제까지 보던
    숫자를 그대로 잇는 것인데, 과거 CheckIn 이 KST 로 기록됐으므로 현지 시간으로 다시
    자르면 경계 근처 사용자의 숫자가 하루씩 달라진다. 이후의 판정만 현지 시간을 쓴다.

    세션에 add 하지 않고 객체만 돌려준다 — 호출부가 잠금·flush 순서를 정한다.
    """
    from app.services.streak import kst_today

    today = kst_today()
    rows = (
        db.session.query(CheckIn.attendence_date)
        .filter(CheckIn.user_id == user_id,
                CheckIn.daily_mission_complete == True,   # noqa: E712
                CheckIn.attendence_date >= today - dt.timedelta(days=365))
        .all()
    )
    days = {r[0] for r in rows}
    current, last_day = _walk_back(days, today)

    # 최고 기록 — 끈기왕은 최고값을 저장하지 않아 승계할 값이 없다. 1년치에서 가장 긴
    # 구간을 세어 넣는다. 11.5 가 "최고 기록은 유지"라고 한 이상 0 으로 시작할 수는 없다.
    best = 0
    run = 0
    for d in sorted(days):
        run = run + 1 if (d - dt.timedelta(days=1)) in days else 1
        best = max(best, run)
    best = max(best, current)

    st = UserStreak(user_id=user_id, current_streak=current, best_streak=best,
                    last_qualified_day=last_day)
    # 마일스톤은 현재 연속일 이하의 최고 단계까지 지급된 것으로 본다. 비워 두면 승계
    # 다음 학습일에 3·7·14일 보상이 한꺼번에 쏟아진다 — 하루도 쌓지 않고 받는 재화다.
    for days_req, _kind, _amount in C.STREAK_MILESTONES:
        if days_req <= current:
            st.max_milestone_awarded = days_req
    return st


def _backfill_qualified(user_id: UUID, current: int, last_day) -> None:
    """승계한 연속 구간의 CheckIn 에 streak_qualified 를 세운다.

    이게 없으면 캘린더와 이후의 되짚기 계산이 승계된 숫자와 어긋난다.
    """
    if not current or not last_day:
        return
    cursor = last_day
    for _ in range(current):
        checkin = _get_or_create_checkin(user_id, cursor, studied=True)
        checkin.streak_qualified = True
        cursor -= _DAY


def _get_or_create_checkin(user_id: UUID, day: dt.date, studied: bool) -> CheckIn:
    """그 날짜의 출석 행. 없으면 만든다.

    `studied` 는 today_study_complete 초깃값이다. 보호권으로 이어 준 날은 학습을 하지
    않았으므로 False 로 만들어야 한다 — 출석 통계가 학습하지 않은 날을 학습일로 세면
    다른 지표(출석왕 등)까지 오염된다.
    """
    row = (
        db.session.query(CheckIn)
        .filter(CheckIn.user_id == user_id, CheckIn.attendence_date == day)
        .first()
    )
    if row is None:
        row = CheckIn(user_id=user_id, attendence_date=day,
                      today_study_complete=studied, daily_mission_complete=False)
        db.session.add(row)
        db.session.flush()
    return row


def _flag_days(user_id: UUID, since: dt.date, until: dt.date) -> dict:
    """{날짜: (자격 충족, 보호권 적용)} — 연속 판정에 쓰는 날만 담는다."""
    rows = (
        db.session.query(CheckIn.attendence_date,
                         CheckIn.streak_qualified, CheckIn.streak_protected)
        .filter(CheckIn.user_id == user_id,
                CheckIn.attendence_date >= since,
                CheckIn.attendence_date <= until)
        .all()
    )
    return {r[0]: (bool(r[1]), bool(r[2])) for r in rows}


def _counted_days(flags: dict) -> set:
    """연속으로 세는 날 = 자격을 채운 날 + 보호권으로 이은 날(11.3)."""
    return {d for d, (qualified, protected) in flags.items() if qualified or protected}


def _walk_back(counted: set, today: dt.date) -> tuple:
    """오늘(또는 어제)부터 거슬러 올라가 이어진 날 수. (일수, **가장 최근에 센 날**).

    오늘이 아직 자격 미달이어도 연속이 끊긴 건 아니다 — 하루는 자정까지 남아 있다.
    그래서 오늘이 비어 있으면 어제부터 센다. 끈기왕의 `_streak_from_dates` 와 같은 규칙이다.

    두 번째 값은 구간의 **끝(최근)** 이다. 되짚기 방향이 과거로 가므로 루프가 마지막으로
    들른 날은 구간의 시작(가장 오래된 날)인데, 호출부가 이 값을 넣는 자리는
    `UserStreak.last_qualified_day` — "마지막으로 자격을 채운 날"이다. 오래된 쪽을 넣으면
    다음 정산이 `today - last` 를 며칠씩 벌어진 공백으로 읽어 연속 기록이 통째로 끊긴다.
    """
    start = today if today in counted else today - _DAY
    cursor = start
    n = 0
    while cursor in counted:
        n += 1
        cursor -= _DAY
    return n, (start if n else None)


def _resolve_current(st: UserStreak, counted: set, today: dt.date) -> int:
    """CheckIn 되짚기 결과와 저장값을 합쳐 현재 연속일을 정한다.

    되짚기만 믿으면 안 되는 경우가 둘 있다.
      - 승계(`migrate_from_checkin`) 직후: 과거 CheckIn 에 V2 플래그가 없을 수 있다.
      - `_WALK_BACK_DAYS` 를 넘는 장기 기록: 되짚기가 창 끝에서 잘린다.
    반대로 저장값만 믿으면 보호·복구로 CheckIn 만 바뀐 경우를 놓친다.
    둘 다 계산해 큰 쪽을 쓴다 — 잘못 깎인 연속 기록이 잘못 늘어난 것보다 훨씬 아프다.
    """
    walked, _ = _walk_back(counted, today)
    stored = 0
    last = st.last_qualified_day
    if last is not None and last >= today - _DAY:
        # 저장값 기준으로 아직 끊기지 않았다. 어제까지였다면 오늘 몫 하루를 더한다.
        stored = (st.current_streak or 0) + (1 if last == today - _DAY else 0)
    return max(walked, stored)


def _milestone_reward_label(kind: str, amount: int) -> str:
    return '{} {}개'.format(_REWARD_LABEL.get(kind, kind), amount)


def _next_milestone(st: UserStreak) -> Optional[dict]:
    """아직 받지 않은 가장 가까운 마일스톤 (11.4).

    기준을 현재 연속일이 아니라 `max_milestone_awarded` 로 잡는 이유는, 기록이 끊겨
    3일에 다시 도달해도 3일 보상을 다시 주지 않기 때문이다(모델 주석과 같은 규칙).
    이미 받은 단계를 다음 목표로 보여 주면 도달했는데 아무 일도 안 일어난다.
    """
    awarded = st.max_milestone_awarded or 0
    for days, kind, amount in C.STREAK_MILESTONES:
        if days > awarded:
            return {'days': days, 'reward': _milestone_reward_label(kind, amount)}
    return None


def _grant_milestones(st: UserStreak, user_id: UUID) -> Optional[dict]:
    """도달한 마일스톤 보상 지급 (11.4). 커밋하지 않는다.

    보호권으로 이은 날에는 지급하지 않고 **다음 학습일에 몰아서** 준다. 그래서 여러 개가
    한꺼번에 걸릴 수 있어 루프로 돈다. 아무것도 안 한 날에 보상 연출이 뜨는 것보다,
    돌아온 날 한꺼번에 받는 편이 이해하기 쉽다.

    Returns:
        마지막(가장 높은) 지급 건 {days, reward}. 없으면 None.
    """
    current = st.current_streak or 0
    granted = None
    for days, kind, amount in C.STREAK_MILESTONES:
        if days > current or days <= (st.max_milestone_awarded or 0):
            continue
        description = '연속 학습 {}일 보상'.format(days)
        if kind == 'GEM':
            inventory.grant_gem(user_id, amount, description=description)
        else:
            inventory.grant(user_id, kind, amount, FarmItemReason.STREAK_REWARD,
                            description=description)
        st.max_milestone_awarded = days
        granted = {'days': days, 'reward': _milestone_reward_label(kind, amount)}
    return granted


def _recovery_deadline(missed_day: dt.date, tz: str) -> dt.datetime:
    """복구 창 마감 시각 (11.3). 놓친 날이 **끝난 시점**부터 48시간.

    놓친 날의 시작이 아니라 끝을 기준으로 삼는 이유는, 자정 직전에 학습한 사용자와
    새벽에 학습한 사용자가 같은 길이의 기회를 갖게 하기 위해서다.
    """
    _, end_utc = localday.day_bounds_utc(missed_day, tz)
    return end_utc + dt.timedelta(hours=C.STREAK_RECOVERY_HOURS)


def _settle(st: UserStreak, user_id: UUID, today: dt.date, tz: str,
            now: dt.datetime) -> dict:
    """놓친 날 정산 본체 (11.3). 커밋하지 않는다.

    빈 날이 **여러 날**일 때의 처리는 기획에 없다. 여기서는 다음과 같이 정했다.

      - 빈 날 1일 + 보호권 보유 → 보호권 1개 자동 소모, 그날을 이어 준다.
      - 빈 날 1일 + 보호권 없음 → 48시간 복구 창을 연다. 연속은 이 시점에 끊긴 것으로
        본다(current 는 실제 이어진 일수로 내려간다). 창 안에서 보호권을 구해 오면
        `recover_streak` 로 되살릴 수 있다.
      - 빈 날 2일 이상 → **보호권을 자동으로 태우지 않고** 연속을 종료한다.

    마지막 규칙이 이 함수의 유일한 재량이다. 근거는 셋이다.
      (1) 11.3 은 "누락 하루가 발생하면"이라고 하루짜리 사고를 전제한다.
      (2) 날마다 태우면 일주일을 비운 사용자가 돌아왔을 때 보유 보호권이 사용자 동의 없이
          한꺼번에 사라진다. 재화를 소모했는데 습관은 돌아오지 않은, 가장 나쁜 결과다.
      (3) 이틀 이상의 공백은 이미 복귀 미션(7.4)이 담당하는 영역이다.

    최고 기록(best_streak)은 어떤 경우에도 건드리지 않는다(11.5).
    """
    result = {'protected_day': None, 'shield_spent': 0,
              'recovery_opened': False, 'recovery_expired': False}
    last = st.last_qualified_day
    if last is None:
        return result

    gap = (today - last).days - 1   # 오늘은 아직 진행 중이라 놓친 날로 세지 않는다
    if gap < 0:
        # 시간대를 뒤로 옮겨 '오늘'이 과거가 된 경우. 기록을 깎을 이유는 없다.
        return result

    # ── 이미 열려 있는 복구 창 처리 ──
    if st.recovery_deadline is not None:
        if gap >= 2 or now >= st.recovery_deadline:
            # 창이 지났거나, 창이 열린 사이 또 하루를 비웠다. 하루짜리 복구로는
            # 연속이 이어지지 않으므로 창을 닫는다.
            st.recovery_deadline = None
            st.recovery_from_streak = None
            result['recovery_expired'] = True
        return result

    if gap == 0:
        return result

    if gap == 1:
        missed = last + _DAY
        if inventory.get_qty(user_id, FarmItem.SHIELD) >= 1:
            inventory.spend(user_id, FarmItem.SHIELD, 1,
                            description='연속 학습 보호 ({})'.format(missed.isoformat()))
            checkin = _get_or_create_checkin(user_id, missed, studied=False)
            checkin.streak_protected = True
            st.last_qualified_day = missed
            st.current_streak = (st.current_streak or 0) + 1
            st.best_streak = max(st.best_streak or 0, st.current_streak)
            st.protected_days_cnt = (st.protected_days_cnt or 0) + 1
            events.log(user_id, FarmEvent.STREAK_PROTECTED, reason='AUTO_SHIELD',
                       detail={'day': missed.isoformat(), 'streak': st.current_streak})
            result['protected_day'] = missed
            result['shield_spent'] = 1
            return result

        # 보호권이 없다 — 복구 창을 열고 현재 연속일은 실제 이어진 값으로 내린다.
        st.recovery_from_streak = st.current_streak or 0
        st.recovery_deadline = _recovery_deadline(missed, tz)
        result['recovery_opened'] = True

    # gap >= 2 이거나 보호권 없이 하루를 놓친 경우 — 이어진 일수를 다시 센다.
    flags = _flag_days(user_id, today - dt.timedelta(days=_WALK_BACK_DAYS), today)
    walked, last_counted = _walk_back(_counted_days(flags), today)
    st.current_streak = walked
    st.last_qualified_day = last_counted
    return result


# ──────────────────────────────────────────────────────────────
# 공개 함수
# ──────────────────────────────────────────────────────────────

def record_correct_word(user_id: UUID, user_voca_id: int,
                        now: Optional[dt.datetime] = None) -> dict:
    """정답 1건을 연속 학습일에 반영한다 (기획 11.1).

    **같은 단어를 여러 번 맞혀도 1회로 센다.** "그날 그 단어의 첫 정답인가"를 따로
    판정하지 않고, 그날 정답 로그의 `user_voca_id` 집합을 다시 세는 방식을 골랐다.
    이유는 호출 순서 때문이다 — 이 함수는 학습 로그가 커밋된 직후에 불리지만, 훅의
    순서가 바뀌거나 재시도가 겹치면 "지금 답안이 로그에 이미 있는지"가 달라진다.
    증분(`+1`) 방식은 그 차이가 그대로 숫자 오차로 남지만, 집합을 다시 세는 방식은
    몇 번을 불러도 같은 값으로 수렴한다. 연속 학습일은 하루에 한 번만 바뀌는 값이라
    정확성이 비용보다 중요하다.

    비용은 하루치 정답 로그의 distinct id 조회 1회다(`ix_usl_user_created` 로 커버).
    5개를 이미 채운 뒤에도 표시용 카운터를 계속 갱신해야 해서 매 정답마다 돈다.

    보호권 주간 지급(11.3)과 놓친 날 정산(11.3)도 여기서 함께 처리한다. 학습은 사용자가
    농장에 들어오는 가장 확실한 경로라, 여기에 걸어 두면 "그 주 첫 접속"을 놓치지 않는다.

    Returns:
        {'qualified_now': 이번 호출로 오늘 자격을 채웠는가,
         'streak': 현재 연속일, 'milestone': {days, reward}|None}
    """
    now = now or dt.datetime.utcnow()
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    _grant_weekly_shield(st, user_id, today)   # 정산보다 먼저 — 이번 주 보호권으로 어제를 살릴 수 있다
    _settle(st, user_id, today, tz, now)

    checkin = _get_or_create_checkin(user_id, today, studied=True)
    if not checkin.today_study_complete:
        checkin.today_study_complete = True

    # 오늘 정답 완료한 서로 다른 단어 — 이번 답안을 포함시킨다.
    # (로그가 아직 안 쓰였을 수도, 이미 쓰였을 수도 있다. 집합이라 어느 쪽이든 같다.)
    start_utc, end_utc = localday.day_bounds_utc(today, tz)
    rows = (
        db.session.query(UserStudyLog.user_voca_id)
        .filter(UserStudyLog.user_id == user_id,
                UserStudyLog.was_correct == True,   # noqa: E712 — SQLAlchemy 표현식
                UserStudyLog.created_at >= start_utc,
                UserStudyLog.created_at < end_utc)
        .distinct()
        .all()
    )
    word_ids = {r[0] for r in rows}
    word_ids.add(user_voca_id)
    # 최댓값으로만 올린다. 로그 파티션 정리 등으로 과거 로그가 줄어도 이미 인정한 하루가
    # 뒤늦게 취소되면 안 된다.
    checkin.correct_word_cnt = max(checkin.correct_word_cnt or 0, len(word_ids))

    qualified_now = False
    milestone = None
    if not checkin.streak_qualified and checkin.correct_word_cnt >= C.STREAK_MIN_CORRECT_WORDS:
        checkin.streak_qualified = True
        qualified_now = True

        flags = _flag_days(user_id, today - dt.timedelta(days=_WALK_BACK_DAYS), today)
        counted = _counted_days(flags)
        counted.add(today)
        st.current_streak = _resolve_current(st, counted, today)
        st.last_qualified_day = today
        st.best_streak = max(st.best_streak or 0, st.current_streak)
        milestone = _grant_milestones(st, user_id)

    db.session.commit()
    return {'qualified_now': qualified_now,
            'streak': st.current_streak or 0,
            'milestone': milestone}


def settle_missed_days(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """놓친 날 정산 (기획 11.3). 규칙과 판단 근거는 `_settle` 의 docstring 참고.

    별도 배치가 아니라 **접속 시점에** 도는 이유는, 전 사용자를 매일 밤 훑는 잡을 하나 더
    돌리는 비용이 크고, 접속하지 않은 사용자에게는 정산 결과를 보여 줄 화면도 없기 때문이다.
    멱등하므로 여러 번 불려도 같은 결과가 된다.
    """
    now = now or dt.datetime.utcnow()
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    result = _settle(st, user_id, today, tz, now)
    db.session.commit()
    return {
        'current': st.current_streak or 0,
        'best': st.best_streak or 0,
        'protected_day': result['protected_day'].isoformat() if result['protected_day'] else None,
        'shield_spent': result['shield_spent'],
        'recovery_until': localday.iso_utc(st.recovery_deadline) if st.recovery_deadline else None,
    }


def _grant_weekly_shield(st: UserStreak, user_id: UUID, today: dt.date) -> int:
    """주간 보호권 지급 본체 (11.3). 커밋하지 않는다. 지급 수(0 또는 1)를 반환.

    "이번 주 월요일 > 마지막 지급 주" 하나로 판정한다. 몇 주를 건너뛰었든 1개만 준다 —
    접속하지 않은 과거 주는 소급하지 않는다는 규칙 그대로다. 소급하면 오래 쉰 사용자가
    보호권을 무더기로 받아 연속 기록이 사실상 끊기지 않게 된다.
    """
    week = localday.week_monday(today)
    if st.shield_granted_week is not None and st.shield_granted_week >= week:
        return 0
    inventory.grant(user_id, FarmItem.SHIELD, 1, FarmItemReason.WEEKLY_GRANT,
                    description='주간 연속 학습 보호권 ({})'.format(week.isoformat()))
    st.shield_granted_week = week
    return 1


def grant_weekly_shield(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """그 주 첫 접속 시 보호권 1개 지급 (기획 11.3).

    Returns:
        {'granted': 지급 개수, 'week': 'YYYY-MM-DD'(그 주 월요일), 'shield_cnt': 보유량}
    """
    now = now or dt.datetime.utcnow()
    today = localday.user_local_day(user_id, now)
    st = _get_or_create_streak(user_id)
    granted = _grant_weekly_shield(st, user_id, today)
    db.session.commit()
    return {'granted': granted,
            'week': localday.week_monday(today).isoformat(),
            'shield_cnt': inventory.get_qty(user_id, FarmItem.SHIELD)}


def recover_streak(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """48시간 안에 보호권 1개로 연속 기록 복구 (기획 11.3).

    복구는 "놓친 그날에 보호권을 뒤늦게 쓴 것"으로 처리한다. 그래서 그날의 CheckIn 에
    `streak_protected` 를 세우고 연속일을 다시 세면 끝이다 — 복구 전에 이미 새로 쌓기
    시작한 날들도 자동으로 이어 붙는다(끊긴 뒤 하루 더 학습하고 복구하면 26+1=27).

    Raises:
        ValueError      — 복구할 기록이 없거나 창이 지남 (라우트가 409)
        PermissionError — 보호권 부족 (라우트가 400)
    """
    now = now or dt.datetime.utcnow()
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    _settle(st, user_id, today, tz, now)   # 만료된 창은 여기서 닫힌다

    if st.recovery_deadline is None:
        db.session.commit()
        raise ValueError('지금은 복구할 연속 기록이 없어요.')
    if now >= st.recovery_deadline:
        st.recovery_deadline = None
        st.recovery_from_streak = None
        db.session.commit()
        raise ValueError('복구할 수 있는 시간이 지났어요.')

    missed = _missed_day(user_id, st, today)
    if missed is None:
        st.recovery_deadline = None
        st.recovery_from_streak = None
        db.session.commit()
        raise ValueError('지금은 복구할 연속 기록이 없어요.')

    inventory.spend(user_id, FarmItem.SHIELD, 1,
                    description='연속 학습 복구 ({})'.format(missed.isoformat()))

    checkin = _get_or_create_checkin(user_id, missed, studied=False)
    checkin.streak_protected = True

    flags = _flag_days(user_id, today - dt.timedelta(days=_WALK_BACK_DAYS), today)
    counted = _counted_days(flags)
    counted.add(missed)
    walked, last_counted = _walk_back(counted, today)
    # 되짚기가 창에서 잘렸을 경우를 대비해 복구 직전 값도 후보로 둔다.
    st.current_streak = max(walked, (st.recovery_from_streak or 0) + 1)
    st.last_qualified_day = last_counted or missed
    st.best_streak = max(st.best_streak or 0, st.current_streak)
    st.protected_days_cnt = (st.protected_days_cnt or 0) + 1
    st.recovery_deadline = None
    st.recovery_from_streak = None
    events.log(user_id, FarmEvent.STREAK_PROTECTED, reason='RECOVERED',
               detail={'day': missed.isoformat(), 'streak': st.current_streak})

    db.session.commit()
    return {'current': st.current_streak or 0,
            'shield_cnt': inventory.get_qty(user_id, FarmItem.SHIELD)}


def _missed_day(user_id: UUID, st: UserStreak, today: dt.date) -> Optional[dt.date]:
    """복구 대상이 되는 '놓친 하루'.

    `last_qualified_day + 1` 로 구하지 않는다. 창이 열린 뒤 오늘 학습을 해서
    `last_qualified_day` 가 이미 앞으로 갔을 수 있기 때문이다. 어제부터 거슬러 올라가
    처음 만나는 빈 날이 곧 그 하루다.
    """
    flags = _flag_days(user_id, today - dt.timedelta(days=_WALK_BACK_DAYS), today)
    counted = _counted_days(flags)
    cursor = today - _DAY
    limit = today - dt.timedelta(days=C.STREAK_RECOVERY_HOURS // 24 + 1)
    while cursor in counted and cursor >= limit:
        cursor -= _DAY
    if cursor < limit:
        return None
    return cursor


def get_state(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """GET /farm/streak 의 data (기획 11).

    조회이지만 주간 보호권 지급과 놓친 날 정산을 함께 돌린다. 11.3 의 "그 주 첫 접속"과
    "누락 발생 시 자동 소모"는 사용자가 화면을 여는 순간에만 판정할 수 있어서다.

    `calendar` 는 빈 날도 포함해 35일을 전부 채워 보낸다. 프론트가 빠진 날짜를 스스로
    메우게 하면 하루 경계(현지 시간)를 프론트가 다시 계산하게 되고, 그 순간 서버와
    사용자의 '오늘'이 갈린다.
    """
    now = now or dt.datetime.utcnow()
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    _grant_weekly_shield(st, user_id, today)
    _settle(st, user_id, today, tz, now)
    db.session.commit()

    since = today - dt.timedelta(days=34)
    flags = _flag_days(user_id, since, today)
    calendar = []
    cursor = since
    while cursor <= today:
        qualified, protected = flags.get(cursor, (False, False))
        calendar.append({'date': cursor.isoformat(),
                         'qualified': qualified, 'protected': protected})
        cursor += _DAY

    today_row = (
        db.session.query(CheckIn.correct_word_cnt, CheckIn.streak_qualified)
        .filter(CheckIn.user_id == user_id, CheckIn.attendence_date == today)
        .first()
    )
    today_correct = (today_row[0] if today_row else 0) or 0
    today_done = bool(today_row[1]) if today_row else False

    shield_cnt = inventory.get_qty(user_id, FarmItem.SHIELD)
    window_open = st.recovery_deadline is not None and now < st.recovery_deadline

    return {
        'current': st.current_streak or 0,
        'best': st.best_streak or 0,
        'today_correct': today_correct,
        'required': C.STREAK_MIN_CORRECT_WORDS,
        'today_done': today_done,
        'shield_cnt': shield_cnt,
        'recovery_until': localday.iso_utc(st.recovery_deadline) if window_open else None,
        'recoverable': bool(window_open and shield_cnt >= 1),
        'calendar': calendar,
        'next_milestone': _next_milestone(st),
    }


def get_overview_streak(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """GET /farm/overview 의 `streak` 조각.

    `get_state` 를 잘라 쓰지 않고 따로 둔 이유는 홈이 35일 캘린더를 쓰지 않기 때문이다.
    홈 진입마다 CheckIn 35행을 읽을 필요가 없다.
    """
    now = now or dt.datetime.utcnow()
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    _grant_weekly_shield(st, user_id, today)
    _settle(st, user_id, today, tz, now)
    db.session.commit()

    rows = _flag_days(user_id, today - _DAY, today)
    today_row = (
        db.session.query(CheckIn.correct_word_cnt)
        .filter(CheckIn.user_id == user_id, CheckIn.attendence_date == today)
        .first()
    )
    window_open = st.recovery_deadline is not None and now < st.recovery_deadline
    return {
        'current': st.current_streak or 0,
        'best': st.best_streak or 0,
        'today_done': rows.get(today, (False, False))[0],
        'today_correct': (today_row[0] if today_row else 0) or 0,
        'required': C.STREAK_MIN_CORRECT_WORDS,
        'protected_yesterday': rows.get(today - _DAY, (False, False))[1],
        'recovery_until': localday.iso_utc(st.recovery_deadline) if window_open else None,
    }


def migrate_from_checkin(user_id: UUID, now: Optional[dt.datetime] = None,
                         commit: bool = True) -> dict:
    """기존 끈기왕 숫자를 UserStreak 로 승계 (계약 6 "그대로 승계").

    이미 행이 있으면 아무것도 하지 않는다 — 전환 스크립트가 두 번 돌거나, 사용자가
    전환 중에 학습해 행이 먼저 생겼을 때 숫자를 덮어쓰면 안 된다.

    판단한 것 둘.
      1. 기준일을 **KST(끈기왕 그대로)** 로 계산한다. 승계의 목적은 사용자가 어제까지
         보던 숫자를 그대로 잇는 것이다. 과거 CheckIn 은 KST 로 기록됐으므로 현지
         시간으로 다시 자르면 경계 근처 사용자의 숫자가 하루씩 달라진다. 이후의 판정만
         현지 시간을 쓴다.
      2. `max_milestone_awarded` 를 현재 연속일 이하의 최고 마일스톤으로 채운다.
         비워 두면 승계 다음 학습일에 3·7·14일 보상이 한꺼번에 쏟아진다 — V2 에서 하루도
         쌓지 않고 받는 재화라 밸런싱이 무너진다. 전환 보상은 15.3 이 따로 담당한다.

    승계한 연속 구간의 CheckIn 에는 `streak_qualified` 를 세워 둔다. 그래야 캘린더와
    이후의 되짚기 계산이 승계된 숫자와 맞는다.
    """
    now = now or dt.datetime.utcnow()
    exists = (
        db.session.query(UserStreak.user_id)
        .filter(UserStreak.user_id == user_id)
        .first()
    )
    if exists is not None:
        return {'migrated': False, 'current': None, 'best': None}

    st = _seed_from_legacy(user_id)
    db.session.add(st)
    db.session.flush()
    _backfill_qualified(user_id, st.current_streak, st.last_qualified_day)

    # **커밋하지 않는다.** 전환 스크립트(scripts/farm_v2_migrate.py)가 한 사용자의
    # 단계 변환·재화 지급·이행 기록을 하나의 트랜잭션으로 묶는데, 여기서 커밋해 버리면
    # 그 뒤가 실패했을 때 단계 변환만 남고 user_farm_migration 행이 없는 상태가 된다.
    # 그 상태로 재실행하면 전환 보상이 두 번 지급된다.
    if commit:
        db.session.commit()
    return {'migrated': True, 'current': st.current_streak, 'best': st.best_streak,
            'last_qualified_day': (st.last_qualified_day.isoformat()
                                   if st.last_qualified_day else None)}
