"""연속 학습일(streak) 계산.

CheckIn.today_study_complete == True 인 날짜만 카운팅.
오늘 미학습이면 어제까지 연속을 streak으로 보고, today_completed 플래그를 따로 반환.
"""

from datetime import date, datetime, timedelta
from uuid import UUID

from app import db
from app.models.models import CheckIn


def kst_today() -> date:
    return (datetime.utcnow() + timedelta(hours=9)).date()


def _streak_from_dates(date_set: set, today: date) -> tuple:
    today_completed = today in date_set
    cursor = today if today_completed else today - timedelta(days=1)
    streak = 0
    while cursor in date_set:
        streak += 1
        cursor -= timedelta(days=1)
    return streak, today_completed


def get_user_streak(user_id: UUID, today: date = None) -> tuple:
    """단일 사용자 streak. (streak, today_completed) 반환."""
    if today is None:
        today = kst_today()
    rows = (
        db.session.query(CheckIn.attendence_date)
        .filter(CheckIn.user_id == user_id)
        .filter(CheckIn.today_study_complete == True)
        .filter(CheckIn.attendence_date >= today - timedelta(days=365))
        .all()
    )
    return _streak_from_dates({r.attendence_date for r in rows}, today)


def get_streaks_batch(user_ids, today: date = None) -> dict:
    """여러 사용자의 streak을 한 번의 쿼리로. {user_id: (streak, today_completed)}."""
    if today is None:
        today = kst_today()
    if not user_ids:
        return {}
    rows = (
        db.session.query(CheckIn.user_id, CheckIn.attendence_date)
        .filter(CheckIn.user_id.in_(list(user_ids)))
        .filter(CheckIn.today_study_complete == True)
        .filter(CheckIn.attendence_date >= today - timedelta(days=365))
        .all()
    )
    per_user = {}
    for uid, d in rows:
        per_user.setdefault(uid, set()).add(d)
    return {uid: _streak_from_dates(per_user.get(uid, set()), today) for uid in user_ids}
