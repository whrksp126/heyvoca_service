"""푸시 발송용 사용자 컨텍스트 일괄 조회.

알림 허용 사용자 묶음에 대해 다음을 GROUP BY 쿼리로 한 번에 조회:
  - 오늘 복습 예정 단어 수 (UserVoca.data->>'$.nextReview' <= today_kst)
  - 전체 카드 수
  - FSRS state별 카운트 (new/learning/review/relearning)
  - 오늘 복습 예정 단어 중 랜덤 1개의 word 텍스트
  - streak / today_completed (services.streak 위임)
"""

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func

from app import db
from app.models.models import User, UserHasToken, UserVoca
from app.services.streak import get_streaks_batch, kst_today


def query_message_allowed_users() -> dict:
    """알림 허용 토큰을 사용자별로 묶어 반환. {user_id: {'username','name','tokens':[..]}}."""
    rows = (
        db.session.query(UserHasToken.user_id, UserHasToken.token, User.username, User.name)
        .join(User, UserHasToken.user_id == User.id)
        .filter(UserHasToken.is_message_allowed == True)
        .all()
    )
    out = {}
    for user_id, token, username, name in rows:
        slot = out.setdefault(user_id, {'username': username, 'name': name, 'tokens': []})
        slot['tokens'].append(token)
    return out


def _safe_str(v):
    return v if isinstance(v, str) and v.strip() else None


def _display_name(username, name) -> str:
    return _safe_str(username) or _safe_str(name) or '회원'


def build_push_contexts(user_data: dict, today=None) -> dict:
    """user_data를 받아 푸시 발송에 필요한 컨텍스트로 확장.

    user_data: {user_id: {'username','name','tokens':[..]}}
    return:    {user_id: {**input, display_name, review_due, total_cards,
                          state_stats, streak, today_completed, sample_voca_word}}
    """
    if today is None:
        today = kst_today()
    today_str = today.strftime('%Y-%m-%d')
    user_ids = list(user_data.keys())
    if not user_ids:
        return {}

    next_review_expr = func.json_unquote(func.json_extract(UserVoca.data, '$.nextReview'))
    state_expr = func.json_unquote(func.json_extract(UserVoca.data, '$.state'))

    review_rows = (
        db.session.query(UserVoca.user_id, func.count(UserVoca.id))
        .filter(UserVoca.user_id.in_(user_ids))
        .filter(next_review_expr.isnot(None))
        .filter(next_review_expr <= today_str)
        .group_by(UserVoca.user_id)
        .all()
    )
    review_due_map = {uid: int(cnt) for uid, cnt in review_rows}

    total_rows = (
        db.session.query(UserVoca.user_id, func.count(UserVoca.id))
        .filter(UserVoca.user_id.in_(user_ids))
        .group_by(UserVoca.user_id)
        .all()
    )
    total_map = {uid: int(cnt) for uid, cnt in total_rows}

    state_rows = (
        db.session.query(UserVoca.user_id, state_expr.label('s'), func.count(UserVoca.id))
        .filter(UserVoca.user_id.in_(user_ids))
        .group_by(UserVoca.user_id, state_expr)
        .all()
    )
    state_stats_map = {}
    for uid, s, cnt in state_rows:
        key = (s or 'new').lower()
        state_stats_map.setdefault(uid, {})[key] = int(cnt)

    streaks = get_streaks_batch(user_ids, today=today)

    sample_word_map = _pick_sample_words(user_ids, today_str, next_review_expr)

    out = {}
    for uid, base in user_data.items():
        streak, today_completed = streaks.get(uid, (0, False))
        out[uid] = {
            **base,
            'display_name': _display_name(base.get('username'), base.get('name')),
            'review_due': review_due_map.get(uid, 0),
            'total_cards': total_map.get(uid, 0),
            'state_stats': state_stats_map.get(uid, {}),
            'streak': streak,
            'today_completed': today_completed,
            'sample_voca_word': sample_word_map.get(uid),
        }
    return out


def _pick_sample_words(user_ids, today_str, next_review_expr) -> dict:
    """사용자별 오늘 복습 예정 UserVoca.word 중 랜덤 1개. 단어가 없으면 키 누락."""
    if not user_ids:
        return {}
    rows = (
        db.session.query(UserVoca.user_id, UserVoca.word)
        .filter(UserVoca.user_id.in_(user_ids))
        .filter(UserVoca.word.isnot(None))
        .filter(UserVoca.word != '')
        .filter(next_review_expr.isnot(None))
        .filter(next_review_expr <= today_str)
        .order_by(func.rand())
        .all()
    )
    out = {}
    for uid, word in rows:
        if uid not in out and word:
            out[uid] = word
    return out
