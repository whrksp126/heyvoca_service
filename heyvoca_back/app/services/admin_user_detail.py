"""어드민 '유저 관리' — 사용자 한 명의 학습 기록 상세 (2026-11-19 회의 QA).

원칙
- **읽기 전용.** 앱 API 중 GET 이지만 쓰기가 섞인 것(/farm/streak 의 주간 보호권 지급·빈 날 정산,
  /farm/overview 의 부패 확정·긴급 급수)은 관리자가 열었다는 이유로 사용자 상태가 바뀌면 안 되므로
  쓰기 단계를 빼고, 앱이 쓰는 **읽기 함수만** 그대로 호출한다.
    · 암기 상태 요약  = farm_v2.query.get_overview(refresh=False)  (홈 숫자와 같은 함수)
    · 연속 학습       = query.get_overview 의 streak(홈 카드 값) + streak_v2 의 읽기 헬퍼
                        (day_status · _pause_view · _earn_back_view · _next_milestone)
    · 농장 방문 달력  = /farm/streak 의 calendar 와 같은 CheckIn 컬럼·같은 day_status 로 만든다
    · 아이템·보석     = farm_v2.inventory.get_counts / User.gem_cnt (/farm/items 와 같음)
    · 입문 퀘스트     = routes.onboarding._build_unlock_status (/onboarding/unlock-status 와 같음)
    · 업적            = /mainpage/user_goals + /mainpage/achievement_criteria 와 같은 쿼리
  저장된 health_state 가 아직 갱신되지 않은 작물도 effective_health_expr 이 부패를 시각 보정하므로
  부패 수는 앱과 같다. (시듦 단계 전이는 앱 접속 때 갱신되므로 마지막 접속 시점 기준이다.)
- 민감 정보(토큰·refresh·apple_refresh_token 등)는 응답에 넣지 않는다.
"""

import datetime as dt
import json
from typing import Optional
from uuid import UUID

from sqlalchemy import case, func, or_

from app import db
from app.models.models import (CheckIn, FarmItem, GoalType, Goals, User, UserFarmItemLog, UserGoals,
                               UserStreak, UserStudyLog, UserStudySession, UserVoca, UserVocaBook, UserVocaBookMap,
                               UserVocaGame, VisualStage)

CALENDAR_DAYS_DEFAULT = 90
CALENDAR_DAYS_MAX = 366
_DAY = dt.timedelta(days=1)
KST = dt.timedelta(hours=9)

STAGE_KEYS = {
    VisualStage.UNPLANTED_SEED: 'unplanted',
    VisualStage.PLANTED_SEED: 'seed',
    VisualStage.SPROUT: 'sprout',
    VisualStage.LEAF: 'leaf',
    VisualStage.CARROT: 'carrot',
    VisualStage.GOLDEN: 'golden',
}
HEALTH_KEYS = {'FRESH': 'fresh', 'THIRSTY': 'thirsty', 'WILTED': 'wilted',
               'CRITICAL': 'critical', 'ROTTEN': 'rotten', 'GOLDEN': 'golden'}


def _iso(v):
    return v.isoformat() if v else None


def _utc_iso(v):
    """naive UTC DateTime → 'Z' 붙은 ISO (프론트가 현지 시각으로 바꿔 그린다)."""
    return (v.isoformat() + 'Z') if v else None


# ──────────────────────────────────────────
# 프로필
# ──────────────────────────────────────────

def _profile(user: User, listing: Optional[dict]) -> dict:
    from app.services.game.farm_v2 import inventory, localday
    listing = listing or {}
    return {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
        'username': user.username,
        'login': 'apple' if user.apple_id else ('google' if user.google_id else 'other'),
        'created_at': _utc_iso(user.created_at),
        'signup_date': _iso(listing.get('signup')),
        'last_logged_at': _utc_iso(user.last_logged_at),
        'last_active': _iso(listing.get('last_active')),
        'platform': listing.get('platform') or 'unknown',
        'app_version': listing.get('app_version'),
        'real': listing.get('real'),
        'real_at': _iso(listing.get('real_at')),
        'active_days': listing.get('active_days', 0),
        'study_days': listing.get('study_days', 0),
        'churned': bool(listing.get('churned')),
        'app_deleted': bool(listing.get('app_deleted')),
        'excluded': bool(listing.get('excluded')),
        'learning_lang': user.learning_lang or 'en',
        'multi_lang_enabled': bool(user.multi_lang_enabled),
        'daily_new_limit': user.daily_new_limit,
        'xp': user.xp,
        'gem_cnt': int(user.gem_cnt or 0),
        'items': inventory.get_counts(user.id),
        'timezone': localday.get_timezone(user.id),
        'source_channel': user.source_channel,
        'learning_goal': user.learning_goal,
        'onboarded': user.onboarding_ver == '1',
    }


# ──────────────────────────────────────────
# 암기 상태 — 전체 요약(앱 홈과 같은 함수) + 단어장별 분포
# ──────────────────────────────────────────

def _langs(user: User) -> list:
    rows = (db.session.query(UserVoca.dict_lang).filter(UserVoca.user_id == user.id)
            .distinct().all())
    langs = {(r[0] or 'en') for r in rows} | {user.learning_lang or 'en'}
    first = user.learning_lang or 'en'
    return [first] + sorted(l for l in langs if l != first)


def _farm_summary(user_id: UUID, now: dt.datetime, langs: list) -> dict:
    """언어별 query.get_overview — 앱 홈이 보는 숫자 그대로. refresh=False 라 쓰기가 없다."""
    from app.services.game.farm_v2 import query
    out = {}
    for lang in langs:
        ov = query.get_overview(user_id, now, refresh=False, lang=lang)
        out[lang] = {
            'counts': ov['counts'], 'seed_detail': ov['seed_detail'], 'health': ov['health'],
            'today': ov['today'], 'comeback': ov['comeback'],
        }
    return out


def _book_distribution(user_id: UUID, now: dt.datetime) -> list:
    """단어장별 작물 단계(6단계)·건강 상태 분포. 게임 행이 없는 단어는 미학습으로 센다
    (query._stage_counts 와 같은 규칙)."""
    from app.services.game.farm_v2.query import effective_health_expr

    books = (db.session.query(UserVocaBook).filter(UserVocaBook.user_id == user_id)
             .order_by(UserVocaBook.created_at.asc()).all())
    if not books:
        return []
    book_ids = [b.id for b in books]

    health = effective_health_expr(now)
    rows = (
        db.session.query(UserVocaBookMap.user_voca_book_id, UserVocaGame.visual_stage, health, func.count())
        .join(UserVocaGame, UserVocaGame.user_voca_id == UserVocaBookMap.user_voca_id)
        .filter(UserVocaBookMap.user_voca_book_id.in_(book_ids))
        .group_by(UserVocaBookMap.user_voca_book_id, UserVocaGame.visual_stage, health)
        .all()
    )
    totals = dict(
        db.session.query(UserVocaBookMap.user_voca_book_id, func.count(UserVocaBookMap.id))
        .filter(UserVocaBookMap.user_voca_book_id.in_(book_ids))
        .group_by(UserVocaBookMap.user_voca_book_id).all()
    )

    stage_by, health_by, games_by = {}, {}, {}
    for bid, stage, hstate, n in rows:
        k = bid.hex
        n = int(n or 0)
        st = stage_by.setdefault(k, {v: 0 for v in STAGE_KEYS.values()})
        hs = health_by.setdefault(k, {v: 0 for v in HEALTH_KEYS.values()})
        st[STAGE_KEYS.get(stage, 'unplanted')] += n
        hk = HEALTH_KEYS.get(hstate)
        # 미학습 씨앗은 밭에 없어 건강 상태가 없다(썩지 않음) — 건강 분포에서 뺀다.
        if hk and stage != VisualStage.UNPLANTED_SEED:
            hs[hk] += n
        games_by[k] = games_by.get(k, 0) + n

    out = []
    for b in books:
        k = b.id.hex
        total = int(totals.get(b.id, 0) or 0)
        stages = stage_by.get(k, {v: 0 for v in STAGE_KEYS.values()})
        stages['unplanted'] += max(0, total - games_by.get(k, 0))
        try:
            color = json.loads(b.color) if b.color else None
        except (TypeError, ValueError):
            color = None
        out.append({
            'id': str(b.id), 'name': b.name, 'language': b.language or 'en',
            'book_kind': b.book_kind, 'script_key': b.script_key,
            'bookstore_id': b.bookstore_id, 'color': color,
            'total': total, 'memorized': b.memorized_word_cnt,
            'stages': stages,
            'health': health_by.get(k, {v: 0 for v in HEALTH_KEYS.values()}),
            'created_at': _utc_iso(b.created_at), 'updated_at': _utc_iso(b.updated_at),
        })
    return out


# ──────────────────────────────────────────
# 연속 학습 + 농장 방문 달력 (쓰기 없는 /farm/streak)
# ──────────────────────────────────────────

def _streak(user_id: UUID, now: dt.datetime, home_streak: dict, calendar_days: int) -> dict:
    from app.models.models import FarmItemReason
    from app.services.game.farm_v2 import inventory, localday, streak_v2

    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    since = today - dt.timedelta(days=calendar_days - 1)

    day_rows = (
        db.session.query(CheckIn.attendence_date, CheckIn.streak_qualified, CheckIn.streak_protected,
                         CheckIn.daily_mission_complete, CheckIn.correct_word_cnt,
                         CheckIn.today_study_complete)
        .filter(CheckIn.user_id == user_id, CheckIn.attendence_date >= since,
                CheckIn.attendence_date <= today)
        .all()
    )
    day_map = {d: (bool(q), bool(p), bool(m), int(c or 0), bool(s)) for d, q, p, m, c, s in day_rows}
    calendar = []
    cursor = since
    while cursor <= today:
        q, p, m, c, s = day_map.get(cursor, (False, False, False, 0, False))
        calendar.append({'date': cursor.isoformat(), 'qualified': q, 'protected': p,
                         'daily_mission_complete': m, 'correct_cnt': c, 'attended': s or q,
                         'status': streak_v2.day_status(q, p), 'is_today': cursor == today})
        cursor += _DAY

    st = db.session.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    shield_cnt = inventory.get_qty(user_id, FarmItem.SHIELD)
    pause = earn_back = next_milestone = None
    if st is not None:
        pause = streak_v2._pause_view(st, user_id, today, now, have=shield_cnt)
        earn_back = streak_v2._earn_back_view(st, user_id, today)
        next_milestone = streak_v2._next_milestone(st)

    shield_logs = (
        db.session.query(UserFarmItemLog)
        .filter(UserFarmItemLog.user_id == user_id, UserFarmItemLog.item_type == FarmItem.SHIELD)
        .order_by(UserFarmItemLog.created_at.desc()).limit(50).all()
    )
    protected_days = [d.isoformat() for (d,) in (
        db.session.query(CheckIn.attendence_date)
        .filter(CheckIn.user_id == user_id, CheckIn.streak_protected.is_(True))
        .order_by(CheckIn.attendence_date.desc()).limit(100).all())]

    return {
        **home_streak,   # current/best/today_done/today_correct/required/paused/pause/earn_back — 홈 카드 값
        'shield_cnt': shield_cnt,
        'pause': pause if pause is not None else home_streak.get('pause'),
        'earn_back': earn_back if earn_back is not None else home_streak.get('earn_back'),
        'next_milestone': next_milestone,
        'last_qualified_day': _iso(st.last_qualified_day) if st else None,
        'protected_days_cnt': int(st.protected_days_cnt or 0) if st else 0,
        'protected_days': protected_days,
        'shield_logs': [{
            'amount': l.amount, 'reason': l.reason.value if isinstance(l.reason, FarmItemReason) else str(l.reason),
            'balance_after': l.balance_after, 'description': l.description, 'created_at': _utc_iso(l.created_at),
        } for l in shield_logs],
        'timezone': tz,
        'today': today.isoformat(),
        'calendar': calendar,
    }


# ──────────────────────────────────────────
# 업적 · 입문 퀘스트
# ──────────────────────────────────────────

def _achievements(user_id: UUID) -> list:
    """/mainpage/user_goals(달성 레벨) + /mainpage/achievement_criteria(기준) + 진행 중 current_value."""
    criteria = {}
    for type_name, level, goal, reward, goal_text in (
            db.session.query(GoalType.type, Goals.level, Goals.goal, Goals.reward_count, Goals.goal_text)
            .join(Goals, GoalType.id == Goals.type_id).order_by(GoalType.id, Goals.level).all()):
        criteria.setdefault(type_name, []).append({
            'level': level, 'goal': goal_text or f'{type_name} {level}단계 달성',
            'target_value': goal, 'reward': reward,
        })

    done = dict(
        db.session.query(GoalType.type, func.max(Goals.level))
        .select_from(UserGoals).join(Goals, UserGoals.goal_id == Goals.id)
        .join(GoalType, Goals.type_id == GoalType.id)
        .filter(UserGoals.user_id == user_id, UserGoals.completed_at.isnot(None))
        .group_by(GoalType.type).all()
    )
    completed_at = {}
    for type_name, level, at in (
            db.session.query(GoalType.type, Goals.level, UserGoals.completed_at)
            .select_from(UserGoals).join(Goals, UserGoals.goal_id == Goals.id)
            .join(GoalType, Goals.type_id == GoalType.id)
            .filter(UserGoals.user_id == user_id, UserGoals.completed_at.isnot(None)).all()):
        completed_at[(type_name, level)] = at
    progress = {}
    for type_name, level, cur, target in (
            db.session.query(GoalType.type, Goals.level, UserGoals.current_value, Goals.goal)
            .select_from(UserGoals).join(Goals, UserGoals.goal_id == Goals.id)
            .join(GoalType, Goals.type_id == GoalType.id)
            .filter(UserGoals.user_id == user_id, UserGoals.is_completed.is_(False)).all()):
        progress[type_name] = {'level': level, 'current': int(cur or 0), 'target': target}

    out = []
    for type_name, levels in criteria.items():
        lv = int(done.get(type_name) or 0)
        out.append({
            'type': type_name, 'level': lv, 'max_level': len(levels),
            'in_progress': progress.get(type_name),
            'levels': [{**c, 'completed_at': _utc_iso(completed_at.get((type_name, c['level'])))}
                       for c in levels],
        })
    return out


def _quests(user: User) -> Optional[dict]:
    from app.routes.onboarding import _build_unlock_status
    s = _build_unlock_status(user)
    return {k: s.get(k) for k in ('legacy', 'missions', 'current_mission', 'required_done', 'quest_hidden')}


# ──────────────────────────────────────────
# 공개 함수
# ──────────────────────────────────────────

def get_detail(user_id: UUID, listing: Optional[dict] = None, calendar_days: int = CALENDAR_DAYS_DEFAULT) -> Optional[dict]:
    from app.services.game.farm_v2 import query
    user = db.session.query(User).filter(User.id == user_id).first()
    if user is None:
        return None
    now = dt.datetime.utcnow()
    calendar_days = max(7, min(int(calendar_days or CALENDAR_DAYS_DEFAULT), CALENDAR_DAYS_MAX))
    langs = _langs(user)
    home_streak = query._streak_state(user_id, now)
    sessions_total = int(db.session.query(func.count(UserStudySession.id))
                         .filter(UserStudySession.user_id == user_id).scalar() or 0)
    return {
        'profile': _profile(user, listing),
        'languages': langs,
        'farm': _farm_summary(user_id, now, langs),
        'books': _book_distribution(user_id, now),
        'streak': _streak(user_id, now, home_streak, calendar_days),
        'achievements': _achievements(user_id),
        'quests': _quests(user),
        'sessions_total': sessions_total,
        'generated_at': _utc_iso(now),
    }


def get_history(user_id: UUID, page: int = 1, per_page: int = 30, include_empty: bool = False) -> dict:
    """학습 세션 최근순 페이지.

    문제 수·정답·풀이 시간은 세션 행의 저장값이 아니라 **실제 답안 로그(UserStudyLog)** 로 센다 —
    중간에 닫은 세션은 question_count 가 0 으로 남아 있지만 푼 문제는 로그에 있다.
    기본은 답안이 하나도 없는 빈 세션(열었다 바로 닫음)을 뺀다(include_empty=1 이면 포함).
    """
    has_log = (db.session.query(UserStudyLog.id)
               .filter(UserStudyLog.session_id == UserStudySession.id).exists())
    q = db.session.query(UserStudySession).filter(UserStudySession.user_id == user_id)
    if not include_empty:
        q = q.filter(or_(UserStudySession.question_count > 0, has_log))
    q = q.order_by(UserStudySession.started_at.desc(), UserStudySession.id.desc())
    rows = q.offset((page - 1) * per_page).limit(per_page + 1).all()
    has_more = len(rows) > per_page
    rows = rows[:per_page]

    agg, qtypes = {}, {}
    if rows:
        for sid, n, correct, ms, first, last in (
                db.session.query(UserStudyLog.session_id, func.count(UserStudyLog.id),
                                 func.sum(case((UserStudyLog.was_correct.is_(True), 1), else_=0)),
                                 func.sum(UserStudyLog.time_taken_ms),
                                 func.min(UserStudyLog.created_at), func.max(UserStudyLog.created_at))
                .filter(UserStudyLog.session_id.in_([s.id for s in rows]))
                .group_by(UserStudyLog.session_id).all()):
            agg[sid.hex] = (int(n or 0), int(correct or 0), int(ms or 0), first, last)
        # 문제 유형별 문항 수·정답 수 — 어드민 학습 기록에 앱 문제 유형 그림으로 보여 준다
        for sid, qtype, n, correct in (
                db.session.query(UserStudyLog.session_id, UserStudyLog.question_type, func.count(UserStudyLog.id),
                                 func.sum(case((UserStudyLog.was_correct.is_(True), 1), else_=0)))
                .filter(UserStudyLog.session_id.in_([s.id for s in rows]))
                .group_by(UserStudyLog.session_id, UserStudyLog.question_type).all()):
            qtypes.setdefault(sid.hex, []).append(
                {'type': qtype, 'count': int(n or 0), 'correct': int(correct or 0)})

    items = []
    for s in rows:
        n, correct, ms, first, last = agg.get(s.id.hex, (0, 0, 0, None, None))
        qc = n or int(s.question_count or 0)
        cc = correct if n else int(s.correct_count or 0)
        end = s.finished_at or last
        dur = None
        if s.started_at and end and end >= s.started_at:
            dur = int((end - s.started_at).total_seconds())
        try:
            book_cnt = len(json.loads(s.book_ids)) if s.book_ids else 0
        except (TypeError, ValueError):
            book_cnt = 0
        items.append({
            'id': str(s.id), 'test_type': s.test_type, 'is_onboarding': bool(s.is_onboarding),
            'question_count': qc, 'correct_count': cc,
            'accuracy': round(cc * 100.0 / qc, 1) if qc else None,
            'duration_sec': dur, 'answer_time_sec': round(ms / 1000) if ms else None,
            'finished': s.finished_at is not None, 'book_cnt': book_cnt,
            'question_types': sorted(qtypes.get(s.id.hex, []), key=lambda x: -x['count']),
            'started_at': _utc_iso(s.started_at), 'finished_at': _utc_iso(s.finished_at),
            'date_kst': (s.started_at + KST).date().isoformat() if s.started_at else None,
        })
    return {'items': items, 'page': page, 'per_page': per_page, 'has_more': has_more}
