"""매일 자정 실적 알림 — 전날(KST 0~24시) 집계를 CodingPT 알림 채널로 보낸다 (2026-11).

  스케줄: fcm.create_scheduler 의 'daily_report' 작업(매일 00:00 KST)
  수동:   python3 -m jobs.daily_report --dry-run [--date YYYY-MM-DD] | --send

출처(읽기만 한다)
  사용자    app/routes/admin_user_stats.day_user_counts — 어드민 '유저 관리'와 같은 정의
            (관리자 제외 이메일 계정 제외, 가입=user.created_at+탈퇴 이벤트, 탈퇴=user_lifecycle_event,
             접속=user_daily_activity ∪ check_in, 실사용자=가입 7일 안 2일 이상 사용)
  학습      user_study_log(created_at, user_id, was_correct) — 온보딩 맛보기 세션(is_onboarding) 제외
            user_study_session(finished_at, is_onboarding) — 끝낸 정규 세션 수
            farm_event_log(event='SEED_PLANTED', created_at) — 새로 심은 씨앗(다시 심기는 별도 이벤트라 빠짐)
  운영      Redis heyvoca:ops:5xx / exc / tts_fallback:<KST날짜> (app/services/codingpt_notify.py)
            content_report(created_at) — 신고 접수 수

DB 시각은 전부 naive UTC. 하루 경계는 KST 자정.
"""
import datetime as dt

from sqlalchemy import case, func, or_

from app import db
from app.models.models import (ContentReport, FarmEvent, FarmEventLog, UserStudyLog,
                               UserStudySession)
from app.services import codingpt_notify as cn

KST = dt.timedelta(hours=9)
WEEKDAYS = '월화수목금토일'


def kst_today():
    return (dt.datetime.utcnow() + KST).date()


def _utc_range(day):
    lo = dt.datetime.combine(day, dt.time.min) - KST
    return lo, lo + dt.timedelta(days=1)


def _study_stats(day, excluded_keys):
    lo, hi = _utc_range(day)
    rows = (
        db.session.query(UserStudyLog.user_id, func.count(UserStudyLog.id),
                         func.sum(case((UserStudyLog.was_correct.is_(True), 1), else_=0)))
        .outerjoin(UserStudySession, UserStudySession.id == UserStudyLog.session_id)
        .filter(UserStudyLog.created_at >= lo, UserStudyLog.created_at < hi,
                or_(UserStudySession.id.is_(None), UserStudySession.is_onboarding.is_(False)))
        .group_by(UserStudyLog.user_id).all()
    )
    learners = questions = correct = 0
    for uid, cnt, ok in rows:
        if uid.hex in excluded_keys:
            continue
        learners += 1
        questions += int(cnt or 0)
        correct += int(ok or 0)

    sessions = sum(
        int(cnt) for uid, cnt in db.session.query(UserStudySession.user_id, func.count(UserStudySession.id))
        .filter(UserStudySession.finished_at >= lo, UserStudySession.finished_at < hi,
                UserStudySession.is_onboarding.is_(False))
        .group_by(UserStudySession.user_id).all()
        if uid.hex not in excluded_keys)

    seeds = sum(
        int(cnt) for uid, cnt in db.session.query(FarmEventLog.user_id, func.count(FarmEventLog.id))
        .filter(FarmEventLog.event == FarmEvent.SEED_PLANTED,
                FarmEventLog.created_at >= lo, FarmEventLog.created_at < hi)
        .group_by(FarmEventLog.user_id).all()
        if uid.hex not in excluded_keys)

    return {
        'learners': learners, 'sessions': sessions, 'questions': questions,
        'accuracy': round(correct * 100.0 / questions, 1) if questions else None,
        'seeds': seeds,
    }


def _ops_stats(day):
    lo, hi = _utc_range(day)
    reports = (db.session.query(func.count(ContentReport.id))
               .filter(ContentReport.created_at >= lo, ContentReport.created_at < hi).scalar()) or 0
    return {
        'errors_5xx': cn.read_ops_counter('5xx', day),
        'unhandled': cn.read_ops_counter('exc', day),
        'reports': int(reports),
        'tts_fallback': cn.read_ops_counter('tts_fallback', day),
    }


def collect(day):
    """하루치 지표 dict. 읽기 전용."""
    from app.routes.admin_user_stats import day_user_counts
    users = day_user_counts(day)
    excluded = users.pop('excluded_keys')
    try:
        return {'day': day, **users, **_study_stats(day, excluded), **_ops_stats(day)}
    finally:
        db.session.rollback()   # 읽기 전용 — 스케줄러 스레드의 세션을 깨끗이


def _fmt(v, suffix=''):
    return '-' if v is None else f'{v:,}{suffix}' if isinstance(v, int) else f'{v}{suffix}'


def _delta(cur, prev, pct=False):
    if cur is None or prev is None:
        return ''
    d = round(cur - prev, 1) if pct else cur - prev
    if d == 0:
        return ' (=)'
    sign = '+' if d > 0 else ''
    return f' ({sign}{d}{"%p" if pct else ""})'


def day_label(day):
    return f'{day.month}/{day.day}({WEEKDAYS[day.weekday()]})'


def render(cur, prev):
    """(title, text, fields)."""
    def line(label, key, suffix='', pct=False):
        return f'· {label} {_fmt(cur[key], suffix)}{_delta(cur[key], prev.get(key) if prev else None, pct)}'

    title = f'헤이보카 {day_label(cur["day"])} 실적'
    text = '\n'.join([
        '[사용자]',
        line('신규 가입', 'signups'),
        line('탈퇴', 'withdrawals'),
        line('접속', 'active'),
        line('학습한 사용자', 'learners'),
        line('실사용자 새로 판정', 'real_new') + f' · 누계 {_fmt(cur["real_total"])}',
        '',
        '[학습량]',
        line('학습 세션', 'sessions'),
        line('푼 문제', 'questions'),
        line('정답률', 'accuracy', '%', pct=True),
        line('새로 심은 씨앗', 'seeds'),
        '',
        '[운영]',
        line('5xx 응답', 'errors_5xx') + f' (처리 안 된 예외 {_fmt(cur["unhandled"])})',
        line('신고 접수', 'reports'),
        line('TTS 대체 음성', 'tts_fallback'),
        '',
        f'괄호는 전날({day_label(prev["day"])}) 대비. 관리자 제외 계정·온보딩 맛보기는 뺐다.' if prev else
        '관리자 제외 계정·온보딩 맛보기는 뺐다.',
    ])
    fields = {
        '가입': cur['signups'], '탈퇴': cur['withdrawals'], '접속': cur['active'],
        '학습자': cur['learners'], '세션': cur['sessions'], '문제': cur['questions'],
        '정답률': None if cur['accuracy'] is None else f'{cur["accuracy"]}%',
        '씨앗': cur['seeds'], '5xx': cur['errors_5xx'], '신고': cur['reports'],
        'TTS대체': cur['tts_fallback'],
    }
    return title, text, fields


def run(day=None, send=True, compare=True):
    """day(기본 어제 KST) 실적을 만들어 보낸다. 반환 (title, text, fields).
    실패는 그대로 올린다 — 스케줄러 EVENT_JOB_ERROR 리스너가 알림을 보낸다."""
    day = day or (kst_today() - dt.timedelta(days=1))
    cur = collect(day)
    prev = collect(day - dt.timedelta(days=1)) if compare else None
    title, text, fields = render(cur, prev)
    if send:
        cn.notify(title, text=text, level='info', fields=fields,
                  dedupe_key=f'report:daily:{day.isoformat()}', wait=True)
    return title, text, fields
