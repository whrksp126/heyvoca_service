"""사용자 현지 학습일 (기획 11.2).

지금 코드는 `kst_today()` 로 하루를 정한다(`app/services/streak.py`). KST 고정이라
해외 사용자는 자기 자정이 아닌 한국 자정에 하루가 끊긴다. V2 는 연속 학습일과 부패가
모두 현지 자정 기준이므로 여기서 하루의 경계를 한 번만 정하고 나머지가 이걸 쓴다.

DB 시각은 전부 naive UTC 다(`datetime.utcnow()`). 이 모듈은 그 관례를 그대로 따르며,
경계에서만 tz 를 입혔다 벗긴다.
"""

import datetime as dt
from typing import Optional
from uuid import UUID

import pytz

from app import db
from app.models.models import UserFarmSetting

DEFAULT_TZ = 'Asia/Seoul'
# 시간대 변경 쿨다운(기획 6.3). 자정 직전에 시간대를 옮겨 하루를 두 번 벌거나
# 부패를 계속 미루는 걸 막는다.
TZ_CHANGE_COOLDOWN = dt.timedelta(hours=24)


def _tzinfo(tz_name: str):
    try:
        return pytz.timezone(tz_name or DEFAULT_TZ)
    except pytz.UnknownTimeZoneError:
        # 알 수 없는 시간대가 저장돼 있어도 하루 판정이 멈추면 안 된다
        return pytz.timezone(DEFAULT_TZ)


def get_timezone(user_id: UUID) -> str:
    """사용자 시간대. 설정이 없으면 기본값 — 행을 새로 만들지는 않는다."""
    row = (
        db.session.query(UserFarmSetting.timezone)
        .filter(UserFarmSetting.user_id == user_id)
        .first()
    )
    return (row[0] if row else None) or DEFAULT_TZ


def local_day(now_utc: dt.datetime, tz_name: str = DEFAULT_TZ) -> dt.date:
    """naive UTC 시각 → 해당 시간대의 날짜."""
    aware = pytz.utc.localize(now_utc) if now_utc.tzinfo is None else now_utc
    return aware.astimezone(_tzinfo(tz_name)).date()


def user_local_day(user_id: UUID, now_utc: Optional[dt.datetime] = None) -> dt.date:
    """사용자의 오늘(현지 학습일)."""
    return local_day(now_utc or dt.datetime.utcnow(), get_timezone(user_id))


def day_bounds_utc(day: dt.date, tz_name: str = DEFAULT_TZ) -> tuple:
    """현지 날짜 하루의 [시작, 끝) 을 naive UTC 로.

    "그날 정답 완료한 단어 수"처럼 로그를 날짜로 자를 때 쓴다. 현지 자정을 UTC 로
    환산해야 하므로 날짜 비교만으로는 안 된다.
    """
    tz = _tzinfo(tz_name)
    start_local = tz.localize(dt.datetime.combine(day, dt.time.min))
    end_local = tz.localize(dt.datetime.combine(day + dt.timedelta(days=1), dt.time.min))
    return (start_local.astimezone(pytz.utc).replace(tzinfo=None),
            end_local.astimezone(pytz.utc).replace(tzinfo=None))


def iso_utc(value: Optional[dt.datetime]) -> Optional[str]:
    """API 로 나가는 시각 → **시간대가 붙은** ISO 문자열.

    DB 의 시각은 전부 naive UTC 다(`datetime.utcnow()`). 그대로 `isoformat()` 해서
    내보내면 `2026-08-02T09:00:00` 처럼 tz 가 없는 문자열이 되고, 브라우저의
    `new Date(...)` 는 그걸 **로컬 시각으로** 읽는다 — KST 사용자에게 9시간 어긋난다.
    "10초 안에 취소" 가 "9시간 전에 만료" 로 보이는 식이다.

    날짜(`date`)에는 쓰지 않는다. 캘린더의 'YYYY-MM-DD' 는 시각이 아니라 날짜라
    시간대를 붙이면 오히려 틀린다.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = pytz.utc.localize(value)
    return value.isoformat()


def week_monday(day: dt.date) -> dt.date:
    """그 주의 월요일. 보호권 주간 지급 판정용(기획 11.3)."""
    return day - dt.timedelta(days=day.weekday())


def get_or_create_setting(user_id: UUID) -> UserFarmSetting:
    row = (
        db.session.query(UserFarmSetting)
        .filter(UserFarmSetting.user_id == user_id)
        .first()
    )
    if row is None:
        row = UserFarmSetting(user_id=user_id)
        db.session.add(row)
        db.session.flush()
    return row


def set_timezone(user_id: UUID, tz_name: str,
                 now_utc: Optional[dt.datetime] = None) -> dict:
    """시간대 변경. 24시간 쿨다운 중이면 거부한다.

    Raises:
        ValueError      — 알 수 없는 시간대
        PermissionError — 쿨다운 중
    """
    now = now_utc or dt.datetime.utcnow()
    try:
        pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        raise ValueError('알 수 없는 시간대입니다.')

    setting = get_or_create_setting(user_id)
    if setting.timezone == tz_name:
        return {'timezone': setting.timezone, 'changed': False}

    if setting.tz_changed_at is not None:
        elapsed = now - setting.tz_changed_at
        if elapsed < TZ_CHANGE_COOLDOWN:
            remain = TZ_CHANGE_COOLDOWN - elapsed
            raise PermissionError(
                f'시간대는 24시간에 한 번만 바꿀 수 있어요. '
                f'{int(remain.total_seconds() // 3600) + 1}시간 뒤에 다시 시도해 주세요.'
            )

    setting.timezone = tz_name
    setting.tz_changed_at = now
    db.session.commit()
    return {'timezone': tz_name, 'changed': True}
