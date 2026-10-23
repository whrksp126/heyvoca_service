"""일별 실사용자(전환) 리포트 — 읽기 전용 집계 (2026-10, 이슈 #13).

"스토어 다운로드는 조금씩 느는데, 그 사람들이 실제 사용자가 됐나?"를 하루 단위로 본다.
지표 정의·근거·한계는 heyvoca_service/docs/DAILY_ACTIVE_REPORT.md 가 정본이다.

쓰는 곳
  - heyvoca_back/scripts/daily_active_report.py   (CLI, JSON + Markdown)
  - GET /admin/report/daily-active                (app/routes/admin_daily_report.py)

하루 경계는 KST 자정(APP_TZ 기본값과 같음). 모든 DB 시각은 UTC naive 로 저장돼 있다.
'실사용'은 로그인이 아니라 **학습 답안 기록(user_study_log)** 이 있는 날로 센다.
온보딩 맛보기 세션(is_onboarding=True)은 가입 직전 게스트 답안을 옮긴 것이라 학습으로 치지 않는다.

DB 에 아무것도 쓰지 않는다(SELECT 만).
"""

import hashlib
import os
import re
import datetime as dt
from collections import defaultdict

import pytz

from app.models.models import (
    db,
    User,
    UserStudyLog,
    UserStudySession,
    UserOnboardingMission,
)

KST = pytz.timezone('Asia/Seoul')

# ── 제외 규칙 ─────────────────────────────────────────────
# 팀 계정. 저장소가 공개라 이메일 원문 대신 sha256(소문자 이메일) 앞 16자만 둔다.
# 추가는 env REPORT_EXCLUDE_EMAILS(쉼표 구분, 원문) 또는 CLI --exclude-email 로.
TEAM_EMAIL_SHA16 = {
    '101dda0650d414d9',  # 개발(본인)
    '3ade6bbed81fe1ec',  # 팀원
    '7969d6e3cfc6d4ef',  # 팀원
}
# 스토어 자동 테스트 봇.
#  - Firebase Test Lab / Play 사전 출시 보고서 기기: ...@cloudtestlabaccounts.com
#  - Play 사전 출시 보고서 로봇 계정: 이름성.5자리숫자@gmail.com (예: abcdef.01234@gmail.com)
BOT_EMAIL_DOMAINS = ('cloudtestlabaccounts.com',)
BOT_EMAIL_RE = re.compile(r'^[a-z]+\.\d{5}@gmail\.com$')

MISSION_LAST_KEY = 'free_test'   # 온보딩 6단계 체인의 종료 미션 (routes/onboarding.py ONBOARDING_MISSIONS)

STORE_DOWNLOADS_NOTE = (
    '스토어 다운로드 수는 아직 자동 수집하지 않는다. '
    'App Store: 현재 API 키(앱 관리 권한)로 Analytics Reports 는 403, Sales Reports 는 판매자 번호(vendor number)와 '
    'Sales/Finance 역할이 필요. Play: 설치 통계는 API 가 아니라 Cloud Storage 버킷(pubsite_prod_…)의 CSV 로만 제공되며 '
    '버킷 ID 와 서비스계정의 "대량 보고서 다운로드" 권한이 필요. 자세한 내용은 docs/DAILY_ACTIVE_REPORT.md.'
)


def _sha16(email):
    return hashlib.sha256((email or '').strip().lower().encode()).hexdigest()[:16]


def exclusion_reason(email, extra_emails=()):
    """제외 대상이면 'team' | 'bot', 아니면 None."""
    e = (email or '').strip().lower()
    extra = {x.strip().lower() for x in extra_emails if x and x.strip()}
    env_extra = os.environ.get('REPORT_EXCLUDE_EMAILS', '')
    extra |= {x.strip().lower() for x in env_extra.split(',') if x.strip()}
    if e in extra or _sha16(e) in TEAM_EMAIL_SHA16:
        return 'team'
    if e.endswith(tuple('@' + d for d in BOT_EMAIL_DOMAINS)) or BOT_EMAIL_RE.match(e):
        return 'bot'
    return None


def login_method(user):
    if user.google_id and user.apple_id:
        return 'google+apple'
    if user.apple_id:
        return 'apple'
    if user.google_id:
        return 'google'
    return 'other'


def platform_guess(method):
    """가입 플랫폼은 DB 에 없다 — Apple 로그인은 iOS 앱에만 있으므로 그것만 확정한다."""
    return 'ios' if method == 'apple' else 'unknown'


def _kst_day(utc_naive):
    return pytz.utc.localize(utc_naive).astimezone(KST).date()


def _kst_day_start_utc(day):
    return KST.localize(dt.datetime.combine(day, dt.time.min)).astimezone(pytz.utc).replace(tzinfo=None)


def kst_today():
    return dt.datetime.now(KST).date()


def _rate(num, den):
    return round(num / den, 4) if den else None


def build_report(start, end, extra_exclude_emails=(), today=None):
    """[start, end] (KST 날짜, 양끝 포함) 일별 리포트 dict.

    리텐션(D1/D7)은 활동 관측일이 '어제'까지 다 지나야 값이 나온다(오늘은 진행 중이라 미확정 → None).
    """
    if end < start:
        start, end = end, start
    today = today or kst_today()
    last_closed = today - dt.timedelta(days=1)          # 하루가 다 지난 마지막 날
    act_end = min(end + dt.timedelta(days=7), today)    # 리텐션 관측까지 포함한 활동 조회 끝(포함)

    # ── 사용자 분류 ──
    users = db.session.query(
        User.id, User.email, User.google_id, User.apple_id, User.created_at, User.onboarding_ver,
    ).all()
    included, excluded_cnt = {}, defaultdict(int)
    for u in users:
        reason = exclusion_reason(u.email, extra_exclude_emails)
        if reason:
            excluded_cnt[reason] += 1
            continue
        included[u.id] = u

    # ── 학습 활동 (온보딩 맛보기 세션 제외) ──
    range_lo = _kst_day_start_utc(start)
    range_hi = _kst_day_start_utc(act_end + dt.timedelta(days=1))
    onboarding_sids = {
        r.id for r in db.session.query(UserStudySession.id)
        .filter(UserStudySession.is_onboarding.is_(True)).all()
    }
    logs = (
        db.session.query(UserStudyLog.user_id, UserStudyLog.created_at,
                         UserStudyLog.session_id, UserStudyLog.was_correct)
        .filter(UserStudyLog.created_at >= range_lo, UserStudyLog.created_at < range_hi)
        .all()
    )
    active_days = defaultdict(set)                       # user_id -> {kst day}
    day_q = defaultdict(int)
    day_correct = defaultdict(int)
    day_active = defaultdict(set)
    day_active_excluded = defaultdict(set)
    for lg in logs:
        if lg.session_id in onboarding_sids:
            continue
        d = _kst_day(lg.created_at)
        if lg.user_id not in included:
            day_active_excluded[d].add(lg.user_id)
            continue
        active_days[lg.user_id].add(d)
        day_active[d].add(lg.user_id)
        day_q[d] += 1
        day_correct[d] += 1 if lg.was_correct else 0

    sessions = (
        db.session.query(UserStudySession.user_id, UserStudySession.started_at)
        .filter(UserStudySession.is_onboarding.is_(False),
                UserStudySession.finished_at.isnot(None),
                UserStudySession.started_at >= range_lo,
                UserStudySession.started_at < range_hi)
        .all()
    )
    day_sessions = defaultdict(int)
    for s in sessions:
        if s.user_id in included:
            day_sessions[_kst_day(s.started_at)] += 1

    # ── 가입 코호트 ──
    cohort = defaultdict(list)
    for u in included.values():
        d = _kst_day(u.created_at)
        if start <= d <= end:
            cohort[d].append(u)
    cohort_ids = [u.id for us in cohort.values() for u in us]
    missions = defaultdict(set)
    if cohort_ids:
        for m in (db.session.query(UserOnboardingMission.user_id, UserOnboardingMission.mission_key)
                  .filter(UserOnboardingMission.user_id.in_(cohort_ids)).all()):
            missions[m.user_id].add(m.mission_key)

    days = []
    tot = defaultdict(int)
    d = start
    while d <= end:
        us = cohort[d]
        by_method, by_platform = defaultdict(int), defaultdict(int)
        for u in us:
            m = login_method(u)
            by_method[m] += 1
            by_platform[platform_guess(m)] += 1
        n = len(us)
        first_study = sum(1 for u in us if d in active_days[u.id])
        setup_done = sum(1 for u in us if u.onboarding_ver == '1')
        mission_any = sum(1 for u in us if missions[u.id])
        mission_done = sum(1 for u in us if MISSION_LAST_KEY in missions[u.id])

        def _ret(offsets):
            if d + dt.timedelta(days=max(offsets)) > last_closed:
                return None
            return sum(1 for u in us if any(d + dt.timedelta(days=o) in active_days[u.id] for o in offsets))

        d1 = _ret([1])
        d7 = _ret([7])
        w1 = _ret(range(1, 8))
        dau = day_active[d]
        new_active = sum(1 for uid in dau if _kst_day(included[uid].created_at) == d)
        row = {
            'date': d.isoformat(),
            'closed': d <= last_closed,
            'signups': n,
            'signups_by_method': dict(by_method),
            'signups_by_platform': dict(by_platform),
            'onboarding_setup_done': setup_done,
            'first_study_same_day': first_study,
            'first_study_rate': _rate(first_study, n),
            'onboarding_mission_started': mission_any,
            'onboarding_mission_completed': mission_done,
            'd1_retained': d1,
            'd1_rate': _rate(d1, n) if d1 is not None else None,
            'd7_retained': d7,
            'd7_rate': _rate(d7, n) if d7 is not None else None,
            'w1_retained': w1,
            'w1_rate': _rate(w1, n) if w1 is not None else None,
            'dau': len(dau),
            'dau_new': new_active,
            'dau_returning': len(dau) - new_active,
            'dau_excluded_accounts': len(day_active_excluded[d]),
            'sessions': day_sessions[d],
            'questions': day_q[d],
            'correct_rate': _rate(day_correct[d], day_q[d]),
        }
        days.append(row)
        for k in ('signups', 'onboarding_setup_done', 'first_study_same_day',
                  'onboarding_mission_started', 'onboarding_mission_completed', 'sessions', 'questions'):
            tot[k] += row[k]
        for k in ('d1', 'd7', 'w1'):
            if row[f'{k}_retained'] is not None:
                tot[f'{k}_retained'] += row[f'{k}_retained']
                tot[f'{k}_cohort'] += n
        d += dt.timedelta(days=1)

    period_active = set()
    for r_day, ids in day_active.items():
        if start <= r_day <= end:
            period_active |= ids
    closed_rows = [r for r in days if r['closed']]
    summary = {
        'signups': tot['signups'],
        'onboarding_setup_done': tot['onboarding_setup_done'],
        'first_study_same_day': tot['first_study_same_day'],
        'first_study_rate': _rate(tot['first_study_same_day'], tot['signups']),
        'onboarding_mission_completed': tot['onboarding_mission_completed'],
        'd1_rate': _rate(tot['d1_retained'], tot['d1_cohort']),
        'd1_retained': tot['d1_retained'], 'd1_cohort': tot['d1_cohort'],
        'd7_rate': _rate(tot['d7_retained'], tot['d7_cohort']),
        'd7_retained': tot['d7_retained'], 'd7_cohort': tot['d7_cohort'],
        'w1_rate': _rate(tot['w1_retained'], tot['w1_cohort']),
        'w1_retained': tot['w1_retained'], 'w1_cohort': tot['w1_cohort'],
        'active_users': len(period_active),
        'avg_dau': round(sum(r['dau'] for r in closed_rows) / len(closed_rows), 2) if closed_rows else None,
        'sessions': tot['sessions'],
        'questions': tot['questions'],
        'total_users_included': len(included),
    }
    return {
        'generated_at': dt.datetime.now(KST).isoformat(timespec='seconds'),
        'timezone': 'Asia/Seoul',
        'start': start.isoformat(),
        'end': end.isoformat(),
        'excluded_accounts': dict(excluded_cnt),
        'summary': summary,
        'days': days,
        'store_downloads': {'available': False, 'note': STORE_DOWNLOADS_NOTE},
    }


def _pct(v):
    return '-' if v is None else f'{v * 100:.0f}%'


def _n(v):
    return '-' if v is None else str(v)


def render_markdown(rep):
    s = rep['summary']
    ex = rep['excluded_accounts']
    lines = [
        f"# 헤이보카 일별 실사용자 리포트 ({rep['start']} ~ {rep['end']}, KST)",
        '',
        f"생성 {rep['generated_at']} · 집계 대상 사용자 {s['total_users_included']}명 "
        f"(제외: 팀 {ex.get('team', 0)} · 봇 {ex.get('bot', 0)})",
        '',
        '## 요약',
        '',
        f"- 신규 가입 **{s['signups']}명** — 가입 당일 첫 학습 {s['first_study_same_day']}명({_pct(s['first_study_rate'])}), "
        f"가입 설정(온보딩) 완료 {s['onboarding_setup_done']}명, 온보딩 미션 6단계 완주 {s['onboarding_mission_completed']}명",
        f"- 재방문 D1 {_pct(s['d1_rate'])} ({s['d1_retained']}/{s['d1_cohort']}) · "
        f"D7 {_pct(s['d7_rate'])} ({s['d7_retained']}/{s['d7_cohort']}) · "
        f"1주 내 재방문 {_pct(s['w1_rate'])} ({s['w1_retained']}/{s['w1_cohort']})",
        f"- 기간 내 학습한 사용자 {s['active_users']}명 · 평균 DAU {_n(s['avg_dau'])} · "
        f"완료 세션 {s['sessions']}회 · 푼 문항 {s['questions']}개",
        '',
        '## 일별',
        '',
        '| 날짜 | 가입 | Google/Apple | 당일 학습 | D1 | D7 | DAU(신규/기존) | 세션 | 문항 | 정답률 |',
        '|---|---|---|---|---|---|---|---|---|---|',
    ]
    for r in rep['days']:
        m = r['signups_by_method']
        g = m.get('google', 0) + m.get('google+apple', 0)
        a = m.get('apple', 0)
        method = f"{g}/{a}" + (f" (기타 {m['other']})" if m.get('other') else '')
        mark = '' if r['closed'] else ' (진행 중)'
        lines.append(
            f"| {r['date'][5:]}{mark} | {r['signups']} | {method} | {r['first_study_same_day']} "
            f"| {_n(r['d1_retained'])} | {_n(r['d7_retained'])} "
            f"| {r['dau']} ({r['dau_new']}/{r['dau_returning']}) | {r['sessions']} | {r['questions']} "
            f"| {_pct(r['correct_rate'])} |"
        )
    lines += [
        '',
        '- D1/D7: 그날 가입자 중 1일/7일 뒤에 학습한 사람 수. `-` 는 아직 그날이 지나지 않음.',
        '- DAU 는 로그인이 아니라 **문제를 1개 이상 푼 사람** 기준(온보딩 맛보기 제외).',
        '- 플랫폼: 가입 플랫폼은 DB 에 저장되지 않는다. Apple 로그인 = iOS 확정, Google 은 iOS/Android/웹 구분 불가.',
        f"- 스토어 다운로드: {rep['store_downloads']['note']}",
        '',
    ]
    return '\n'.join(lines)
