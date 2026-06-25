"""학습 '하루' 경계 계산 — APP_TZ + 새벽 컷오프(Anki식) 기준.

due 판정(recommend/pool.py)과 '오늘 학습' 집계(routes/study.py)가
동일한 하루 경계를 쓰도록 단일 소스로 제공한다.

환경변수:
  APP_TZ              기준 타임존 (IANA 이름, 기본 'Asia/Seoul')
  APP_DAY_CUTOFF_HOUR 하루 시작 시각(로컬 시, 0~23, 기본 4)
                      → 00:00~03:59 학습은 전날로 집계 (늦은 밤 학습자 배려)

예) cutoff=4, KST 기준:
  '월요일' 학습일 = 월 04:00(KST) ~ 화 03:59(KST)
"""

import os
import datetime as dt

import pytz

_DEFAULT_TZ = 'Asia/Seoul'
_DEFAULT_CUTOFF_HOUR = 4


def _get_tz():
    name = (os.environ.get('APP_TZ') or _DEFAULT_TZ).strip() or _DEFAULT_TZ
    try:
        return pytz.timezone(name)
    except Exception:
        return pytz.timezone(_DEFAULT_TZ)


def _get_cutoff_hour() -> int:
    try:
        h = int(os.environ.get('APP_DAY_CUTOFF_HOUR', _DEFAULT_CUTOFF_HOUR))
    except (TypeError, ValueError):
        h = _DEFAULT_CUTOFF_HOUR
    return min(max(h, 0), 23)


def logical_date(instant_utc: dt.datetime = None) -> dt.date:
    """임의 UTC 시각을 '학습 날짜'(로컬 tz + 새벽 컷오프)로 변환.

    due 판정에서 now와 next_review를 동일 기준으로 비교하기 위한 단일 변환기.
    """
    if instant_utc is None:
        instant_utc = dt.datetime.utcnow()
    tz = _get_tz()
    local = pytz.utc.localize(instant_utc).astimezone(tz)
    return (local - dt.timedelta(hours=_get_cutoff_hour())).date()


def logical_today(now_utc: dt.datetime = None) -> dt.date:
    """현재 '학습 날짜'. due 판정용 today."""
    return logical_date(now_utc)


def logical_day_start_utc(now_utc: dt.datetime = None) -> dt.datetime:
    """현재 학습 날짜의 시작 시각(UTC, naive). '오늘 학습' 로그 필터용.

    로그 필터: UserStudyLog.created_at >= logical_day_start_utc()
    """
    if now_utc is None:
        now_utc = dt.datetime.utcnow()
    tz = _get_tz()
    d = logical_today(now_utc)
    cutoff = _get_cutoff_hour()
    naive_local_start = dt.datetime(d.year, d.month, d.day, cutoff, 0, 0)
    local_start = tz.localize(naive_local_start)
    return local_start.astimezone(pytz.utc).replace(tzinfo=None)
