"""연속 학습일 V2 (기획 11).

기존 끈기왕(`app/services/streak.py`)과 무엇이 다른가:

1. 기준이 다르다. 끈기왕은 `CheckIn.daily_mission_complete`(데일리 미션 전부 달성)를 본다.
   V2 는 **그날 정답 완료한 서로 다른 단어 5개**다(11.1). 미션을 다 못 채운 날도
   5개를 했으면 연속은 이어진다 — 목표를 크게 잡은 사용자가 목표 때문에 연속을 잃는
   구조를 없애기 위해서다.
2. 하루 경계가 다르다. 끈기왕은 `kst_today()` 로 KST 가 박혀 있다. V2 는 사용자 현지
   자정을 쓴다(11.2) — 하루의 정의는 `localday` 모듈 하나만 갖는다.
3. 재계산으로 복원할 수 없는 상태가 붙는다. 보호권 자동 소모, 멈춤(paused) 기한,
   다시 잇기 도전, 1회 표시 notice, 마일스톤 1회 지급은 로그를 다시 훑어도 나오지
   않으므로 `UserStreak` 에 들고 있다.

보호권 정책(2026-09 개편, 정본은 연속 학습 보호권 계약서 §1):
  - 빈 날 1~7일 + 보유 충분 → 접속 즉시 빈 날 수만큼 자동 소모
  - 빈 날 1~7일 + 보유 부족 → 소모 없이 멈춤. 마지막 빈 날 종료+48h 안에 부족분을 사면 한꺼번에 적용
  - 멈춤 기한 경과 / 빈 날 8일 이상 → 소모 없이 종료. 끊긴 값이 30일 이상이면 다시 잇기 제안

현재 연속일수 자체는 `CheckIn.streak_qualified/streak_protected` 로 되짚을 수 있다.
그래서 이 모듈은 **저장값을 권위로 쓰되, 갱신할 때마다 CheckIn 을 되짚어 교차 검증**한다
(`_walk_back`). 어느 한쪽만 어긋나도 사용자에게 유리한 쪽(큰 값)으로 수렴시킨다 —
연속 기록은 잘못 깎였을 때의 피해가 잘못 늘었을 때보다 훨씬 크다.

기획 11.5 가 금지한 연출("큰 빨간 0", 복구 결제 우선 노출)을 화면이 만들지 않도록,
응답에 "며칠을 잃었다" 류의 손실 강조 필드를 두지 않는다. 끊긴 사실은 `current` 가
작아진 것으로만 드러나고, `best` 는 그대로 남으며, 멈춤·복구 정보는 부가 정보
(`pause`/`recovery_until`/`recoverable`)로만 나간다.
"""

import datetime as dt
import json
from typing import Optional
from uuid import UUID, uuid4

from app import db
from app.models.models import (CheckIn, FarmEvent, FarmItem, FarmItemReason,
                               User, UserStreak, UserStudyLog)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, inventory, localday
from app.utils.db_lock import begin_user_tx, lock_user, retry_on_deadlock

_DAY = dt.timedelta(days=1)

# CheckIn 되짚기 범위. 연속일은 원리상 무한히 길어질 수 있지만 매번 전 기간을 읽을 수는 없다.
# 이 범위를 넘어가는 기록은 저장값(current_streak)을 신뢰한다 — `_resolve_current` 참고.
_WALK_BACK_DAYS = 1200

# UserStreak.earn_back_status 값 — 계약서 §2 의 earn_back.status 와 글자 그대로 같다.
EARN_BACK_OFFERED = 'offered'
EARN_BACK_ACTIVE = 'active'

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

    **User 행을 먼저 잠근다.** 이 행을 잡는 트랜잭션은 이어서 보호권(아이템 행)·출석(CheckIn)을
    바꾸고 마일스톤 보석(User)까지 준다. User 를 마지막에 잡으면 "User → 아이템"(상점 구매),
    "User → 오늘 CheckIn"(세션 집계 /user_study_history)과 순서가 엇갈려 교착한다.
    전역 순서는 `app/utils/db_lock.py`.
    """
    lock_user(user_id)
    row = (
        db.session.query(UserStreak)
        .filter(UserStreak.user_id == user_id)
        .with_for_update()
        .populate_existing()
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


def _correct_counts(user_id: UUID, since: dt.date, until: dt.date) -> dict:
    """{날짜: 그날 정답 완료한 서로 다른 단어 수}.

    `_flag_days` 와 별도 함수로 둔 이유는 그 함수가 `(qualified, protected)` 튜플
    시그니처로 이미 다른 곳(`_counted_days`/`_walk_back`)에 물려 있어서다. 캘린더 탭 시
    "맞힌 단어 N개" 요약(프론트 `StreakCard.jsx`)에만 쓰는 값이라 얹지 않고 따로 뺐다.
    """
    rows = (
        db.session.query(CheckIn.attendence_date, CheckIn.correct_word_cnt)
        .filter(CheckIn.user_id == user_id,
                CheckIn.attendence_date >= since,
                CheckIn.attendence_date <= until)
        .all()
    )
    return {r[0]: (r[1] or 0) for r in rows}


def _counted_days(flags: dict) -> set:
    """연속으로 세는 날 = 자격을 채운 날 + 보호권으로 이은 날(11.3)."""
    return {d for d, (qualified, protected) in flags.items() if qualified or protected}


def day_flags(user_id: UUID, since: dt.date, until: dt.date) -> dict:
    """`_flag_days` 의 공개 래퍼. 다른 조회 모듈(query.py 의 session-summary 등)이 날짜별
    (자격 충족, 보호권 적용) 을 읽을 때 이걸 통해서만 접근한다 — 판정 규칙이 이 모듈
    하나에만 있게 하기 위해서다.
    """
    return _flag_days(user_id, since, until)


def day_status(qualified: bool, protected: bool) -> str:
    """날짜 하나의 상태를 화면이 바로 쓸 수 있는 enum 하나로 통일한다.

    홈 카드(GET /farm/streak)와 학습 결과 슬라이드(GET /farm/session-summary)가 같은 날을
    다르게 그리던 문제(보호권으로 이은 날을 한쪽은 학습일처럼, 한쪽은 빈 날처럼 표시)의
    원인이 "qualified/protected 두 불리언을 각 화면이 각자 다르게 해석"한 것이었다.
    이후로는 두 API 모두 이 함수가 만든 값만 내려보낸다.

    'studied' 가 최우선이다 — 보호권으로 이어진 날 중에도 이론상 qualified 가 같이 서는
    경우(예: 자정 근처 경합)가 있을 수 있는데, 그런 날은 실제로 학습을 했다는 뜻이라
    학습으로 보여야 한다. 'future'/'missed'(오늘)는 호출부가 today/is_today 로 얹는다 —
    이 함수는 과거·오늘 구분 없이 그 날의 원시 플래그만 본다.
    """
    if qualified:
        return 'studied'
    if protected:
        return 'protected'
    return 'missed'


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
    """멈춤 기한. 마지막 빈 날이 **끝난 시점**(현지 자정)부터 48시간.

    빈 날의 시작이 아니라 끝을 기준으로 삼는 이유는, 자정 직전에 학습한 사용자와
    새벽에 학습한 사용자가 같은 길이의 기회를 갖게 하기 위해서다.
    """
    _, end_utc = localday.day_bounds_utc(missed_day, tz)
    return end_utc + dt.timedelta(hours=C.STREAK_RECOVERY_HOURS)


def _shield_unit_price() -> int:
    """보호권 1개의 보석 가격. `SHIELD_PACKS` 의 1개짜리 묶음이 정본이다."""
    for sku, gem_price, amount in C.SHIELD_PACKS:
        if amount == 1:
            return int(gem_price)
    sku, gem_price, amount = C.SHIELD_PACKS[0]
    return int(round(float(gem_price) / float(amount)))


def _shield_sku() -> str:
    for sku, _gem_price, amount in C.SHIELD_PACKS:
        if amount == 1:
            return sku
    return C.SHIELD_PACKS[0][0]


def _is_paused(st: UserStreak) -> bool:
    return st.recovery_deadline is not None


def _clear_pause(st: UserStreak) -> None:
    st.recovery_deadline = None
    st.recovery_from_streak = None
    st.pause_anchor_day = None


def _missed_days(user_id: UUID, anchor: Optional[dt.date], today: dt.date) -> list:
    """빈 날 목록 = anchor 다음 날부터 **어제까지** 연속 인정(자격 또는 보호)이 안 된 날.

    오늘은 진행 중이라 넣지 않는다. 멈춤 중에 학습한 날은 인정된 날이라 빠진다 —
    나중에 부족분을 채우면 그 날들이 그대로 이어 붙는다.
    """
    if anchor is None or anchor >= today - _DAY:
        return []
    flags = _flag_days(user_id, anchor + _DAY, today - _DAY)
    counted = _counted_days(flags)
    out = []
    cursor = anchor + _DAY
    while cursor < today:
        if cursor not in counted:
            out.append(cursor)
        cursor += _DAY
    return out


def _set_notice(st: UserStreak, kind: str, today: dt.date, payload: dict) -> dict:
    """한 번만 보여 줄 정산 결과를 저장한다. 이전에 안 본 것이 있으면 덮어쓴다 —
    화면에는 가장 최근 결과 하나만 의미가 있다(이전 'paused' 는 새 'protected' 로 풀렸다)."""
    notice = {'id': '{}-{}-{}'.format(kind, today.isoformat(), uuid4().hex[:8]),
              'type': kind}
    notice.update(payload)
    st.pending_notice = json.dumps(notice, ensure_ascii=False)
    return notice


def _get_notice(st: UserStreak) -> Optional[dict]:
    if not st.pending_notice:
        return None
    try:
        data = json.loads(st.pending_notice)
    except (TypeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _rejoin(st: UserStreak, user_id: UUID, today: dt.date, frozen: int,
            anchor: Optional[dt.date], extra=()) -> None:
    """멈춤을 풀고 연속을 다시 잇는다. 커밋하지 않는다.

    빈 날이 전부 인정된 상태(보호권 적용 직후 등)에서 부른다. 그러면 anchor 다음 날부터
    오늘(또는 어제)까지가 끊김 없이 이어지므로, 연속값 = 끊기기 전 값(frozen) + 그 일수다
    (기존 recover 의 26+1=27 과 같은 원리). 되짚기 값과 비교해 큰 쪽을 쓴다.
    """
    flags = _flag_days(user_id, today - dt.timedelta(days=_WALK_BACK_DAYS), today)
    counted = _counted_days(flags) | set(extra)
    walked, last_counted = _walk_back(counted, today)
    candidate = 0
    if last_counted is not None and anchor is not None and last_counted > anchor:
        candidate = frozen + (last_counted - anchor).days
    st.current_streak = max(walked, candidate, frozen)
    st.last_qualified_day = last_counted or anchor
    st.best_streak = max(st.best_streak or 0, st.current_streak)
    _clear_pause(st)


def _apply_protection(st: UserStreak, user_id: UUID, missed: list, today: dt.date,
                      reason: str) -> int:
    """빈 날 전부에 보호권을 쓰고 연속을 잇는다. 커밋하지 않는다. 소모 수를 반환.

    Raises:
        PermissionError — 보호권 부족 (호출부가 미리 확인한다)
    """
    n = len(missed)
    frozen = st.current_streak or 0
    anchor = st.last_qualified_day
    inventory.spend(user_id, FarmItem.SHIELD, n,
                    description='연속 학습 보호 ({})'.format(
                        ', '.join(d.isoformat() for d in missed)))
    for day in missed:
        checkin = _get_or_create_checkin(user_id, day, studied=False)
        checkin.streak_protected = True
    st.protected_days_cnt = (st.protected_days_cnt or 0) + n
    _rejoin(st, user_id, today, frozen, anchor, extra=missed)
    events.log(user_id, FarmEvent.STREAK_PROTECTED, reason=reason,
               detail={'days': [d.isoformat() for d in missed], 'streak': st.current_streak})
    return n


# ── 다시 잇기 도전 (Earn Back) ──

def _clear_earn_back(st: UserStreak) -> None:
    """진행 중·제안 중인 도전을 지운다. 쿨다운 기준(earn_back_last_start_day)은 남긴다."""
    st.earn_back_status = None
    st.earn_back_from_streak = None
    st.earn_back_offered_on = None
    st.earn_back_start_day = None


def _offer_until(st: UserStreak) -> Optional[dt.date]:
    if st.earn_back_offered_on is None:
        return None
    return st.earn_back_offered_on + dt.timedelta(days=C.STREAK_EARN_BACK_OFFER_DAYS - 1)


def _next_earn_back_on(st: UserStreak) -> Optional[dt.date]:
    if st.earn_back_last_start_day is None:
        return None
    return st.earn_back_last_start_day + dt.timedelta(days=C.STREAK_EARN_BACK_COOLDOWN_DAYS)


def _expire_earn_back(st: UserStreak, user_id: UUID, today: dt.date) -> None:
    """제안 유효기간 경과·도전 실패를 정리한다. 커밋하지 않는다.

    도전은 "하루 정답 단어 5개"(streak_qualified)만 인정한다 — 보호권으로 이은 날은
    학습하지 않은 날이라 도전 일수로 세지 않는다.
    """
    status = st.earn_back_status
    if status == EARN_BACK_OFFERED:
        until = _offer_until(st)
        if until is None or today > until:
            _clear_earn_back(st)
    elif status == EARN_BACK_ACTIVE:
        start = st.earn_back_start_day
        if start is None:
            _clear_earn_back(st)
            return
        if start < today:
            flags = _flag_days(user_id, start, today - _DAY)
            cursor = start
            while cursor < today:
                if not flags.get(cursor, (False, False))[0]:
                    _clear_earn_back(st)   # 하루라도 빠지면 실패 — 새 연속만 남는다
                    return
                cursor += _DAY
    elif status is not None:
        _clear_earn_back(st)


def _earn_back_view(st: UserStreak, user_id: UUID, today: dt.date) -> Optional[dict]:
    """계약 `earn_back` 객체. 도전이 없으면 None."""
    status = st.earn_back_status
    if status not in (EARN_BACK_OFFERED, EARN_BACK_ACTIVE):
        return None
    from_streak = st.earn_back_from_streak or 0
    flags = _flag_days(user_id, st.earn_back_start_day or today, today)
    today_done = flags.get(today, (False, False))[0]
    days_done = 0
    if status == EARN_BACK_ACTIVE and st.earn_back_start_day is not None:
        cursor = st.earn_back_start_day
        while cursor <= today:
            if flags.get(cursor, (False, False))[0]:
                days_done += 1
            cursor += _DAY
    offer_until = _offer_until(st) if status == EARN_BACK_OFFERED else None
    return {
        'status': status,
        'from_streak': from_streak,
        'days_required': C.STREAK_EARN_BACK_DAYS,
        'days_done': days_done,
        'start_day': (st.earn_back_start_day.isoformat()
                      if status == EARN_BACK_ACTIVE and st.earn_back_start_day else None),
        'offer_until': offer_until.isoformat() if offer_until else None,
        'today_done': bool(today_done),
        'result_streak': from_streak + C.STREAK_EARN_BACK_DAYS,
    }


def _check_earn_back_success(st: UserStreak, user_id: UUID, today: dt.date) -> Optional[dict]:
    """오늘 자격을 채운 직후 부른다. 시작일부터 오늘까지 3일 연속이면 성공. 커밋하지 않는다.

    성공값 = 끊기기 전 연속 + 도전 일수(3). 쉰 날은 세지 않는다. 이 값은 저장값
    (current_streak/last_qualified_day=오늘)으로 남고, 이후 날짜는 `_resolve_current` 의
    저장값 경로(어제까지였으면 +1)로 이어진다. 되짚기 값은 이보다 작으므로 max 에서 진다.
    """
    if st.earn_back_status != EARN_BACK_ACTIVE or st.earn_back_start_day is None:
        return None
    start = st.earn_back_start_day
    if start > today:
        return None
    flags = _flag_days(user_id, start, today)
    cursor = start
    while cursor <= today:
        if not flags.get(cursor, (False, False))[0]:
            return None
        cursor += _DAY
    added = (today - start).days + 1
    if added < C.STREAK_EARN_BACK_DAYS:
        return None

    from_streak = st.earn_back_from_streak or 0
    result = from_streak + added
    st.current_streak = max(st.current_streak or 0, result)
    st.last_qualified_day = today
    st.best_streak = max(st.best_streak or 0, st.current_streak)
    _clear_earn_back(st)
    events.log(user_id, FarmEvent.STREAK_EARN_BACK, reason='EARN_BACK',
               detail={'from': from_streak, 'added': added, 'streak': st.current_streak})
    return _set_notice(st, 'earn_back_success', today, {
        'from_streak': from_streak, 'added': added, 'streak': st.current_streak,
    })


def _break(st: UserStreak, user_id: UUID, today: dt.date, frozen: int, gap: int) -> None:
    """연속 종료. current = 실제로 이어진 일수(되짚기). best·보유 보호권은 그대로.
    커밋하지 않는다."""
    flags = _flag_days(user_id, today - dt.timedelta(days=_WALK_BACK_DAYS), today)
    walked, last_counted = _walk_back(_counted_days(flags), today)
    st.current_streak = walked
    st.last_qualified_day = last_counted
    _clear_pause(st)

    lost = frozen or 0
    next_on = None
    if lost >= C.STREAK_EARN_BACK_MIN_STREAK and st.earn_back_status is None:
        cooldown_end = _next_earn_back_on(st)
        if cooldown_end is None or today >= cooldown_end:
            st.earn_back_status = EARN_BACK_OFFERED
            st.earn_back_from_streak = lost
            st.earn_back_offered_on = today
            st.earn_back_start_day = None
        else:
            next_on = cooldown_end

    if lost >= 1:
        _set_notice(st, 'broken', today, {
            'gap_days': gap,
            'lost_streak': lost,
            'shield_cnt': inventory.get_qty(user_id, FarmItem.SHIELD),
            'max_gap': C.STREAK_MAX_PROTECT_GAP,
            'earn_back': _earn_back_view(st, user_id, today),
            'next_earn_back_on': next_on.isoformat() if next_on else None,
        })


def _upgrade_legacy_window(st: UserStreak, user_id: UUID, today: dt.date) -> None:
    """옛 '48시간 복구 창'이 열린 행을 새 '멈춤' 형태로 옮긴다. 커밋하지 않는다.

    옛 규칙은 창을 열면서 current 를 실제 이어진 일수로 **내리고** 끊기기 전 값을
    recovery_from_streak 에 두었다. 새 규칙의 멈춤은 current 를 끊기기 전 값에 고정하고
    last_qualified_day 를 빈 날 직전(anchor)에 고정한다. 그래서 놓친 하루(어제부터 거슬러
    처음 만나는 빈 날)를 찾아 anchor 를 되살린다. 그 뒤의 판정은 새 규칙이 맡는다.
    """
    if st.recovery_deadline is None or st.pause_anchor_day is not None:
        return
    frozen = st.recovery_from_streak
    since = today - dt.timedelta(days=C.STREAK_MAX_PROTECT_GAP + 3)
    counted = _counted_days(_flag_days(user_id, since, today))
    cursor = today - _DAY
    while cursor in counted and cursor >= since:
        cursor -= _DAY
    if frozen is None or cursor < since:
        _clear_pause(st)
        return
    anchor = cursor - _DAY
    st.pause_anchor_day = anchor
    st.last_qualified_day = anchor
    st.current_streak = frozen


def _settle(st: UserStreak, user_id: UUID, today: dt.date, tz: str,
            now: dt.datetime) -> dict:
    """빈 날 정산 본체. 커밋하지 않는다. 정책 정본은 계약서 §1.

      - 빈 날 0            → 아무것도 안 함
      - 빈 날 1~7, 보유 충분 → 접속 즉시 빈 날 수만큼 자동 소모, 연속 유지. notice protected
      - 빈 날 1~7, 보유 부족 → **소모 없음.** 멈춤(paused). 기한 = 마지막 빈 날 종료+48h.
                              notice paused. 멈춤 중 빈 날이 늘면 필요 개수·기한을 다시 잰다.
      - 멈춤 기한 경과 / 빈 날 8일 이상 → 소모 없이 종료. notice broken
                              (끊긴 값이 30일 이상이면 다시 잇기 제안)

    멈춤 동안 current_streak·last_qualified_day 는 끊기기 전 값에 고정된다. 그래서
    빈 날은 항상 `last_qualified_day` 다음 날부터 어제까지의 미인정일로 구할 수 있다.
    최고 기록(best_streak)은 어떤 경우에도 내리지 않는다(11.5).
    """
    result = {'shield_spent': 0, 'protected_days': [], 'paused': False, 'broken': False}
    _upgrade_legacy_window(st, user_id, today)
    _expire_earn_back(st, user_id, today)

    last = st.last_qualified_day
    if last is None:
        if _is_paused(st):
            _clear_pause(st)
        return result
    if (today - last).days - 1 < 0:
        # 시간대를 뒤로 옮겨 '오늘'이 과거가 된 경우. 기록을 깎을 이유는 없다.
        return result

    paused = _is_paused(st)
    frozen = st.current_streak or 0
    missed = _missed_days(user_id, last, today)

    if not missed:
        if paused:
            # 빈 날이 다른 경로로 모두 채워졌다(예: 수동 보정) — 소모 없이 잇는다.
            _rejoin(st, user_id, today, frozen, last)
        return result

    gap = len(missed)
    deadline = _recovery_deadline(missed[-1], tz)
    if gap > C.STREAK_MAX_PROTECT_GAP or now >= deadline:
        _break(st, user_id, today, frozen, gap)
        result['broken'] = True
        return result

    have = inventory.get_qty(user_id, FarmItem.SHIELD)
    if have >= gap:
        spent = _apply_protection(st, user_id, missed, today, reason='AUTO_SHIELD')
        _set_notice(st, 'protected', today, {
            'shields_spent': spent,
            'days': [d.isoformat() for d in missed],
            'streak': st.current_streak or 0,
            'shield_before': have,
            'shield_after': have - spent,
        })
        result['shield_spent'] = spent
        result['protected_days'] = missed
        return result

    # 보유 부족 — 멈춤. 새로 멈췄거나 빈 날이 늘어 조건이 바뀐 경우에만 알린다.
    changed = (not paused) or st.recovery_deadline != deadline
    st.recovery_deadline = deadline
    st.recovery_from_streak = frozen
    st.pause_anchor_day = last
    result['paused'] = True
    if changed:
        _set_notice(st, 'paused', today, _pause_payload(st, missed, have))
    return result


def _pause_payload(st: UserStreak, missed: list, have: int) -> dict:
    """계약 `pause` 객체(= paused notice 본문)."""
    needed = len(missed)
    short = max(needed - have, 0)
    return {
        'needed': needed,
        'have': have,
        'short': short,
        'missed_days': [d.isoformat() for d in missed],
        'deadline': localday.iso_utc(st.recovery_deadline) if st.recovery_deadline else None,
        'from_streak': (st.recovery_from_streak if st.recovery_from_streak is not None
                        else (st.current_streak or 0)),
        'gem_cost': short * _shield_unit_price(),
    }


def _pause_view(st: UserStreak, user_id: UUID, today: dt.date, now: dt.datetime,
                have: Optional[int] = None) -> Optional[dict]:
    """계약 `pause` 객체. 멈춤이 아니면(또는 기한이 지났으면) None. 읽기만 한다."""
    if not _is_paused(st) or now >= st.recovery_deadline:
        return None
    missed = _missed_days(user_id, st.last_qualified_day, today)
    if not missed:
        return None
    if have is None:
        have = inventory.get_qty(user_id, FarmItem.SHIELD)
    return _pause_payload(st, missed, have)


def streak_extras(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """overview.streak 에 얹는 `paused`/`pause`/`earn_back` — 읽기 전용.

    정산은 하지 않는다(overview 라우트가 먼저 `settle_on_visit` 을 부른다).
    """
    now = now or dt.datetime.utcnow()
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    st = db.session.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    if st is None:
        return {'paused': False, 'pause': None, 'earn_back': None}
    pause = _pause_view(st, user_id, today, now)
    return {'paused': pause is not None, 'pause': pause,
            'earn_back': _earn_back_view(st, user_id, today)}


# ──────────────────────────────────────────────────────────────
# 공개 함수
# ──────────────────────────────────────────────────────────────

@retry_on_deadlock
def record_correct_word(user_id: UUID, user_voca_id: int,
                        now: Optional[dt.datetime] = None) -> dict:
    """정답 1건을 연속 학습일에 반영한다 (기획 11.1).

    **같은 단어를 여러 번 맞혀도 1회로 센다.** "그날 그 단어의 첫 정답인가"를 따로
    판정하지 않고, 그날 정답 로그의 `user_voca_id` 집합을 다시 세는 방식을 골랐다.
    이유는 호출 순서 때문이다 — 이 함수는 학습 로그가 커밋된 직후에 불리지만, 훅의
    순서가 바뀌거나 재시도가 겹치면 "지금 답안이 로그에 이미 있는지"가 달라진다.
    증분(`+1`) 방식은 그 차이가 그대로 숫자 오차로 남지만, 집합을 다시 세는 방식은
    몇 번을 불러도 같은 값으로 수렴한다.

    보호권 주간 지급과 빈 날 정산도 여기서 함께 처리한다.

    **멈춤 중에는** 오늘 자격을 채워도 연속값을 바꾸지 않는다(끊기기 전 값 고정).
    그날은 CheckIn.streak_qualified 로 남아, 나중에 부족분을 채우면 그대로 이어 붙는다.

    Returns:
        {'qualified_now': 이번 호출로 오늘 자격을 채웠는가,
         'streak': 현재 연속일, 'milestone': {days, reward}|None}
    """
    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    _grant_weekly_shield(st, user_id, today)   # 정산보다 먼저 — 이번 주 보호권으로 빈 날을 메울 수 있다
    _settle(st, user_id, today, tz, now)

    checkin = _get_or_create_checkin(user_id, today, studied=True)
    if not checkin.today_study_complete:
        checkin.today_study_complete = True

    # 오늘 정답 완료한 서로 다른 단어 — 이번 답안을 포함시킨다.
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

        if not _is_paused(st):
            flags = _flag_days(user_id, today - dt.timedelta(days=_WALK_BACK_DAYS), today)
            counted = _counted_days(flags)
            counted.add(today)
            st.current_streak = _resolve_current(st, counted, today)
            st.last_qualified_day = today
            st.best_streak = max(st.best_streak or 0, st.current_streak)
            db.session.flush()
            _check_earn_back_success(st, user_id, today)
            milestone = _grant_milestones(st, user_id)

    db.session.commit()
    return {'qualified_now': qualified_now,
            'streak': st.current_streak or 0,
            'milestone': milestone}


def settle_missed_days(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """빈 날 정산만 따로 (운영 도구·스크립트용). 규칙은 `_settle` 참고. 멱등하다."""
    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    result = _settle(st, user_id, today, tz, now)
    db.session.commit()
    return {
        'current': st.current_streak or 0,
        'best': st.best_streak or 0,
        'protected_days': [d.isoformat() for d in result['protected_days']],
        'shield_spent': result['shield_spent'],
        'paused': result['paused'],
        'recovery_until': localday.iso_utc(st.recovery_deadline) if st.recovery_deadline else None,
    }


def settle_on_visit(user_id: UUID, now: Optional[dt.datetime] = None) -> None:
    """화면 진입 시 주간 보호권 지급 + 빈 날 정산 (overview 라우트용). 커밋한다."""
    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    st = _get_or_create_streak(user_id)
    _grant_weekly_shield(st, user_id, today)
    _settle(st, user_id, today, tz, now)
    db.session.commit()


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
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    today = localday.user_local_day(user_id, now)
    st = _get_or_create_streak(user_id)
    granted = _grant_weekly_shield(st, user_id, today)
    db.session.commit()
    return {'granted': granted,
            'week': localday.week_monday(today).isoformat(),
            'shield_cnt': inventory.get_qty(user_id, FarmItem.SHIELD)}



class NotPaused(ValueError):
    """멈춤 상태가 아님 — 라우트가 409 로 옮긴다."""


@retry_on_deadlock
def protect_streak(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """POST /farm/streak/protect — 부족분 보호권을 보석으로 사고 즉시 적용 (원자적).

    구매(보석 차감·GemLog·아이템 원장)는 상점과 같은 경로(`shop.purchase_in_tx`)를 쓴다.
    구매 → 빈 날 전부에 보호권 소모 → 연속 재계산 → 멈춤 해제까지 한 번에 커밋한다.
    어디서든 실패하면 전부 되돌린다.

    Raises:
        NotPaused           — 멈춤 상태가 아님 (409)
        shop.GemShortage    — 보석 부족 (400, shortage 포함)
    """
    from app.services.game.farm_v2 import shop

    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    try:
        st = _get_or_create_streak(user_id)
        _grant_weekly_shield(st, user_id, today)
        _settle(st, user_id, today, tz, now)
        if not _is_paused(st):
            raise NotPaused('지금은 지킬 연속 기록이 없어요.')

        missed = _missed_days(user_id, st.last_qualified_day, today)
        if not missed:
            raise NotPaused('지금은 지킬 연속 기록이 없어요.')
        have = inventory.get_qty(user_id, FarmItem.SHIELD)
        short = max(len(missed) - have, 0)
        gem_cnt = None
        if short > 0:
            bought = shop.purchase_in_tx(user_id, _shield_sku(), short)
            gem_cnt = bought['gem_cnt']

        spent = _apply_protection(st, user_id, missed, today, reason='PROTECT_PURCHASE')
        st.pending_notice = None   # 멈춤 안내는 이걸로 해결됐다 — 다시 띄우지 않는다
        streak = st.current_streak or 0
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    if gem_cnt is None:
        gem_cnt = int(db.session.query(User.gem_cnt).filter(User.id == user_id).scalar() or 0)
    return {'streak': streak,
            'shields_spent': spent,
            'shield_cnt': inventory.get_qty(user_id, FarmItem.SHIELD),
            'gem_cnt': gem_cnt,
            'days': [d.isoformat() for d in missed]}


def recover_streak(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """POST /farm/streak/recover — 하위호환. 보유 보호권만으로 멈춤을 푼다.

    새 정책에서는 보유분이 충분하면 정산이 알아서 적용하므로, 이 경로가 실제로
    적용까지 가는 경우는 드물다(정산 직후 경합 정도). 부족분 구매는 `protect_streak`.

    Raises:
        ValueError      — 멈춤 상태가 아님 (409)
        PermissionError — 보호권 부족 (400)
    """
    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    try:
        st = _get_or_create_streak(user_id)
        settled = _settle(st, user_id, today, tz, now)
        if settled['shield_spent'] and not _is_paused(st):
            # 보유분이 이미 충분해 정산이 방금 적용했다 — 구 클라이언트에는 복구 성공으로 답한다.
            st.pending_notice = None
            db.session.commit()
            return {'current': st.current_streak or 0,
                    'shield_cnt': inventory.get_qty(user_id, FarmItem.SHIELD)}
        if not _is_paused(st):
            db.session.commit()
            raise NotPaused('지금은 복구할 연속 기록이 없어요.')
        missed = _missed_days(user_id, st.last_qualified_day, today)
        if not missed:
            db.session.commit()
            raise NotPaused('지금은 복구할 연속 기록이 없어요.')
        if inventory.get_qty(user_id, FarmItem.SHIELD) < len(missed):
            db.session.commit()
            raise PermissionError('연속 보호권이 {}개 필요해요.'.format(len(missed)))
        _apply_protection(st, user_id, missed, today, reason='RECOVERED')
        st.pending_notice = None
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return {'current': st.current_streak or 0,
            'shield_cnt': inventory.get_qty(user_id, FarmItem.SHIELD)}


def start_earn_back(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """POST /farm/streak/earn-back/start — 제안된 다시 잇기 도전을 시작한다.

    Raises:
        ValueError — 제안 상태가 아니거나 시작 가능일이 지남 (409)
    """
    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    _settle(st, user_id, today, tz, now)   # 지난 제안은 여기서 정리된다
    until = _offer_until(st)
    if st.earn_back_status != EARN_BACK_OFFERED or until is None or today > until:
        db.session.commit()
        raise ValueError('지금은 시작할 수 있는 도전이 없어요.')
    st.earn_back_status = EARN_BACK_ACTIVE
    st.earn_back_start_day = today
    st.earn_back_last_start_day = today
    # 시작 전에 오늘 이미 5개를 채웠고, 시작일부터 3일이 모두 채워졌다면(이론상 불가) 바로 판정
    _check_earn_back_success(st, user_id, today)
    db.session.commit()
    return get_state(user_id, now)


def ack_notice(user_id: UUID, notice_id) -> dict:
    """POST /farm/streak/notice/ack — 해당 notice 를 봤음으로 표시.

    id 가 지금 걸린 것과 다르면(이미 새 결과로 바뀜) 아무것도 하지 않는다 —
    사용자가 아직 못 본 새 결과를 옛 id 로 지우면 안 된다.
    """
    begin_user_tx(user_id)
    st = (
        db.session.query(UserStreak)
        .filter(UserStreak.user_id == user_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    cleared = False
    if st is not None:
        current = _get_notice(st)
        if current is not None and notice_id and str(current.get('id')) == str(notice_id):
            st.pending_notice = None
            cleared = True
    db.session.commit()
    return {'cleared': cleared}


def get_state(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """GET /farm/streak 의 data (기획 11 + 계약서 §2).

    조회이지만 주간 보호권 지급과 빈 날 정산을 함께 돌린다. "그 주 첫 접속"과
    "접속 즉시 자동 소모"는 사용자가 화면을 여는 순간에만 판정할 수 있어서다.

    `calendar` 는 빈 날도 포함해 35일을 전부 채워 보낸다. 프론트가 빠진 날짜를 스스로
    메우게 하면 하루 경계(현지 시간)를 프론트가 다시 계산하게 되고, 그 순간 서버와
    사용자의 '오늘'이 갈린다.
    """
    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)

    st = _get_or_create_streak(user_id)
    _grant_weekly_shield(st, user_id, today)
    _settle(st, user_id, today, tz, now)
    db.session.commit()

    since = today - dt.timedelta(days=34)
    flags = _flag_days(user_id, since, today)
    correct_counts = _correct_counts(user_id, since, today)   # 캘린더 날짜 탭 요약용 — 쿼리 1회 추가
    calendar = []
    cursor = since
    while cursor <= today:
        qualified, protected = flags.get(cursor, (False, False))
        # 'qualified'/'protected'는 하위 호환을 위해 유지한다(구버전 웹/앱 캐시 대비).
        # 새로 붙는 'status'/'is_today'가 화면이 실제로 그려야 할 값이다 — day_status 참고.
        calendar.append({'date': cursor.isoformat(),
                         'qualified': qualified, 'protected': protected,
                         'correct_cnt': correct_counts.get(cursor, 0),
                         'status': day_status(qualified, protected),
                         'is_today': cursor == today})
        cursor += _DAY

    today_row = (
        db.session.query(CheckIn.correct_word_cnt, CheckIn.streak_qualified)
        .filter(CheckIn.user_id == user_id, CheckIn.attendence_date == today)
        .first()
    )
    today_correct = (today_row[0] if today_row else 0) or 0
    today_done = bool(today_row[1]) if today_row else False

    shield_cnt = inventory.get_qty(user_id, FarmItem.SHIELD)
    pause = _pause_view(st, user_id, today, now, have=shield_cnt)
    earn_back = _earn_back_view(st, user_id, today)
    next_on = _next_earn_back_on(st)
    show_next_on = earn_back is None and next_on is not None and today < next_on

    return {
        'current': st.current_streak or 0,   # 멈춤 중이면 끊기기 전 값(고정)
        'best': st.best_streak or 0,
        'today_correct': today_correct,
        'required': C.STREAK_MIN_CORRECT_WORDS,
        'today_done': today_done,
        'shield_cnt': shield_cnt,
        'recovery_until': pause['deadline'] if pause else None,
        'recoverable': bool(pause and shield_cnt >= pause['needed']),
        'calendar': calendar,
        'next_milestone': _next_milestone(st),
        'paused': pause is not None,
        'pause': pause,
        'earn_back': earn_back,
        'next_earn_back_on': next_on.isoformat() if show_next_on else None,
        'notice': _get_notice(st),
    }


def get_overview_streak(user_id: UUID, now: Optional[dt.datetime] = None) -> dict:
    """overview.streak 과 같은 모양(정산 포함). 현재 overview 는 query._streak_state 를 쓴다 —
    이 함수는 스크립트·테스트용으로 남긴다.
    """
    now = now or dt.datetime.utcnow()
    begin_user_tx(user_id)   # 첫 문장 = User 잠금 → 이후 일반 SELECT 가 최신(`db_lock` 머리말)
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
    pause = _pause_view(st, user_id, today, now)
    return {
        'current': st.current_streak or 0,
        'best': st.best_streak or 0,
        'today_done': rows.get(today, (False, False))[0],
        'today_correct': (today_row[0] if today_row else 0) or 0,
        'required': C.STREAK_MIN_CORRECT_WORDS,
        'protected_yesterday': rows.get(today - _DAY, (False, False))[1],
        'recovery_until': pause['deadline'] if pause else None,
        'paused': pause is not None,
        'pause': pause,
        'earn_back': _earn_back_view(st, user_id, today),
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
