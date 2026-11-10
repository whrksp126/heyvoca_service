"""어드민 '유저 관리' — 마케팅용 사용자 통계 (이슈 #25 12차, 2026-11).

어드민 (admin_bp, X-Admin-API-Key)
  GET    /admin/user-stats/overview?days=7|30|90  — 지표 전부(일별 시계열·분포·리텐션·온보딩)
  GET    /admin/user-stats/users                  — 사용자 목록 {q, sort, order, real, page, per_page}
  GET    /admin/user-stats/excluded               — 통계 제외 이메일 목록
  POST   /admin/user-stats/excluded               — 등록 {email, memo}
  DELETE /admin/user-stats/excluded/<id>          — 삭제

정의
- 날짜는 전부 KST. user.created_at 은 naive UTC 라 +9h 해서 가입일을 정한다.
- '사용한 날' = user_daily_activity(인증 요청이 있었던 날, 2026-11-10 기록 시작)
                ∪ check_in(학습한 날 — 과거 소급용, 보호권으로만 이은 날 제외).
- 실사용자 = 가입일 포함 7일(가입일~+6일) 안에 서로 다른 2일 이상 사용. 아직 7일이 안 지났고
  2일을 못 채웠으면 '판정 대기'(pending).
- 관리자 제외: admin_excluded_email 의 이메일 계정은 모든 집계·목록 기본값에서 뺀다
  (탈퇴자는 이벤트의 이메일 해시로 대조).
- 앱 삭제 추정: FCM 발송이 토큰 무효(Unregistered/InvalidArgument)로 실패해 토큰을 지운 계정 중
  지금 토큰이 하나도 없고 그 뒤로 접속이 없는 계정.
- 이탈: 실사용자 중 최근 14일(오늘 포함) 사용한 날이 없는 계정.

데이터 규모(수천 명)에선 원본 행을 한 번 읽어 파이썬에서 계산하는 편이 쿼리 여러 번보다 싸다.
원본 묶음은 Redis 에 BASE_CACHE_SEC 동안 둔다(제외 목록 변경 시 즉시 무효화).
"""

import datetime as dt
import hashlib
import logging
from collections import Counter, defaultdict
from uuid import UUID

from flask import jsonify, request
from sqlalchemy import func

from app import cache, db
from app.models.models import (AdminExcludedEmail, CheckIn, User, UserDailyActivity, UserHasToken,
                               UserLifecycleEvent, UserOnboardingMission)
from app.routes import admin_bp
from app.routes.admin import admin_required

logger = logging.getLogger(__name__)

KST = dt.timedelta(hours=9)
BASE_CACHE_KEY = 'admin:user_stats:base:v1'
BASE_CACHE_SEC = 120
REAL_WINDOW_DAYS = 7
REAL_MIN_DAYS = 2
CHURN_DAYS = 14
ALLOWED_PERIODS = (7, 30, 90)


# ──────────────────────────────────────────
# 기록 헬퍼 (auth.withdraw / fcm._delete_token 에서 호출 — 호출 측 트랜잭션에 add 만 한다)
# ──────────────────────────────────────────

def email_hash(email):
    e = (email or '').strip().lower()
    return 'sha256:' + hashlib.sha256(e.encode('utf-8')).hexdigest() if e else None


def _last_platform(user_id):
    row = (db.session.query(UserDailyActivity.platform)
           .filter(UserDailyActivity.user_id == user_id, UserDailyActivity.platform.isnot(None))
           .order_by(UserDailyActivity.activity_date.desc()).first())
    return row[0] if row else None


def record_withdraw_event(user):
    """탈퇴 직전 호출. user 행이 지워져도 일별 탈퇴 수·관리자 제외 판정이 가능하게 남긴다.
    이메일은 원문이 아니라 해시만 저장한다."""
    try:
        login = 'apple' if user.apple_id else ('google' if user.google_id else 'other')
        db.session.add(UserLifecycleEvent(
            user_id=user.id, event='withdraw', email=email_hash(user.email),
            user_created_at=user.created_at, platform=_last_platform(user.id),
            meta={'login': login}, created_at=dt.datetime.utcnow(),
        ))
    except Exception:
        logger.warning('탈퇴 이벤트 기록 실패', exc_info=True)


def record_fcm_unregistered(user_id):
    try:
        db.session.add(UserLifecycleEvent(
            user_id=user_id, event='fcm_unregistered', created_at=dt.datetime.utcnow(),
        ))
    except Exception:
        logger.warning('FCM 무효 이벤트 기록 실패', exc_info=True)


# ──────────────────────────────────────────
# 원본 묶음
# ──────────────────────────────────────────

def _kst_date(ts):
    return (ts + KST).date() if ts else None


def _today():
    return (dt.datetime.utcnow() + KST).date()


def invalidate_cache():
    try:
        cache.delete(BASE_CACHE_KEY)
    except Exception:
        pass


def _load_base():
    try:
        cached = cache.get(BASE_CACHE_KEY)
    except Exception:
        cached = None
    if cached:
        return cached

    excluded_emails = {(e or '').strip().lower() for (e,) in db.session.query(AdminExcludedEmail.email).all()}
    excluded_hashes = {email_hash(e) for e in excluded_emails if e}

    users = {}
    for r in db.session.query(User.id, User.email, User.name, User.created_at, User.google_id,
                              User.apple_id, User.onboarding_ver).all():
        users[r.id.hex] = {
            'id': str(r.id), 'email': r.email, 'name': r.name,
            'created_at': r.created_at, 'signup': _kst_date(r.created_at),
            'login': 'apple' if r.apple_id else ('google' if r.google_id else 'other'),
            'onboarded': r.onboarding_ver == '1',
            'excluded': (r.email or '').strip().lower() in excluded_emails,
        }

    # 사용한 날 — 접속 기록 ∪ 학습한 날
    days = defaultdict(set)
    last_info = {}   # uid -> (date, platform, app_version)
    for uid, d, plat, ver in db.session.query(UserDailyActivity.user_id, UserDailyActivity.activity_date,
                                              UserDailyActivity.platform, UserDailyActivity.app_version).all():
        k = uid.hex
        days[k].add(d)
        prev = last_info.get(k)
        if prev is None or d >= prev[0]:
            last_info[k] = (d, plat or (prev[1] if prev else None), ver or (prev[2] if prev else None))
    study_days = Counter()
    for uid, d, done, cnt, protected in db.session.query(
            CheckIn.user_id, CheckIn.attendence_date, CheckIn.today_study_complete,
            CheckIn.correct_word_cnt, CheckIn.streak_protected).all():
        if protected and not done and not cnt:
            continue  # 보호권으로만 이은 날은 사용한 날이 아니다
        k = uid.hex
        days[k].add(d)
        study_days[k] += 1

    # 생애 이벤트
    withdrawals = []          # (date, signup_date, excluded, uid_hex)
    fcm_events = defaultdict(list)  # uid_hex -> [date]
    for uid, ev, email_h, ucreated, created in db.session.query(
            UserLifecycleEvent.user_id, UserLifecycleEvent.event, UserLifecycleEvent.email,
            UserLifecycleEvent.user_created_at, UserLifecycleEvent.created_at).all():
        if ev == 'withdraw':
            withdrawals.append((_kst_date(created), _kst_date(ucreated), email_h in excluded_hashes, uid.hex))
        elif ev == 'fcm_unregistered':
            fcm_events[uid.hex].append(_kst_date(created))

    token_users = {uid.hex for (uid,) in db.session.query(UserHasToken.user_id).distinct().all()}

    missions = defaultdict(set)
    for uid, key in db.session.query(UserOnboardingMission.user_id, UserOnboardingMission.mission_key).all():
        missions[uid.hex].add(key)

    base = {
        'users': users, 'days': dict(days), 'last_info': last_info, 'study_days': dict(study_days),
        'withdrawals': withdrawals, 'fcm_events': dict(fcm_events), 'token_users': token_users,
        'missions': dict(missions), 'built_at': dt.datetime.utcnow().isoformat(),
    }
    try:
        cache.set(BASE_CACHE_KEY, base, timeout=BASE_CACHE_SEC)
    except Exception:
        pass
    return base


def _real_status(signup, day_set, today):
    """('real', 판정일) | ('pending', None) | ('no', None)."""
    if signup is None:
        return 'no', None
    end = signup + dt.timedelta(days=REAL_WINDOW_DAYS - 1)
    in_window = sorted(d for d in day_set if signup <= d <= end)
    if len(in_window) >= REAL_MIN_DAYS:
        return 'real', in_window[REAL_MIN_DAYS - 1]
    if today <= end:
        return 'pending', None
    return 'no', None


def _enrich(base):
    """사용자별 파생값(실사용자·마지막 사용일·플랫폼…)을 붙인 목록. 제외 계정 포함."""
    today = _today()
    out = []
    for k, u in base['users'].items():
        ds = base['days'].get(k, set())
        status, real_at = _real_status(u['signup'], ds, today)
        last_day = max(ds) if ds else None
        li = base['last_info'].get(k)
        fcm = base['fcm_events'].get(k) or []
        last_fcm = max(fcm) if fcm else None
        app_deleted = bool(last_fcm and k not in base['token_users'] and (last_day is None or last_day <= last_fcm))
        out.append({
            **u, 'key': k, 'real': status, 'real_at': real_at,
            'last_active': last_day, 'active_days': len(ds),
            'study_days': base['study_days'].get(k, 0),
            'platform': (li[1] if li else None) or 'unknown',
            'app_version': li[2] if li else None,
            'app_deleted': app_deleted, 'app_deleted_at': last_fcm if app_deleted else None,
            'churned': status == 'real' and (last_day is None or (today - last_day).days >= CHURN_DAYS),
        })
    return out


def _pct(n, d):
    return round(n * 100.0 / d, 1) if d else None


# ──────────────────────────────────────────
# 라우트
# ──────────────────────────────────────────

@admin_bp.route('/user-stats/overview', methods=['GET'])
@admin_required
def admin_user_stats_overview():
    try:
        period = int(request.args.get('days', 30))
    except (TypeError, ValueError):
        period = 30
    if period not in ALLOWED_PERIODS:
        period = 30

    base = _load_base()
    today = _today()
    start = today - dt.timedelta(days=period - 1)
    dates = [start + dt.timedelta(days=i) for i in range(period)]

    rows = [u for u in _enrich(base) if not u['excluded']]
    included_keys = {u['key'] for u in rows}
    excluded_keys = {k for k, u in base['users'].items() if u['excluded']}

    # 날짜 → 그날 사용한 계정(제외 계정 빼고, 탈퇴자 포함 — 활동 기록이 남아 있으면)
    withdrawn_excluded = {w[3] for w in base['withdrawals'] if w[2]}
    by_day = defaultdict(set)
    for k, ds in base['days'].items():
        if k in excluded_keys or k in withdrawn_excluded:
            continue
        for d in ds:
            if d >= start - dt.timedelta(days=29):
                by_day[d].add(k)

    def active_between(d0, d1):
        s = set()
        d = d0
        while d <= d1:
            s |= by_day.get(d, set())
            d += dt.timedelta(days=1)
        return s

    signups_by_day = defaultdict(list)
    for u in rows:
        if u['signup']:
            signups_by_day[u['signup']].append(u)
    withdraw_by_day = Counter(w[0] for w in base['withdrawals'] if not w[2])
    withdrawn_signup_dates = [w[1] for w in base['withdrawals'] if not w[2] and w[1]]
    app_del_by_day = Counter()
    for u in rows:
        for d in base['fcm_events'].get(u['key'], []):
            app_del_by_day[d] += 1

    # 누적 기준값(기간 시작 전)
    cum_signup = sum(1 for u in rows if u['signup'] and u['signup'] < start) + \
        sum(1 for d in withdrawn_signup_dates if d < start)
    cum_real = sum(1 for u in rows if u['real_at'] and u['real_at'] < start)
    real_at_by_day = Counter(u['real_at'] for u in rows if u['real_at'])
    withdrawn_signup_by_day = Counter(withdrawn_signup_dates)

    daily = []
    for d in dates:
        su = signups_by_day.get(d, [])
        cum_signup += len(su) + withdrawn_signup_by_day.get(d, 0)
        cum_real += real_at_by_day.get(d, 0)
        dau = len(by_day.get(d, set()))
        wau = len(active_between(d - dt.timedelta(days=6), d))
        mau = len(active_between(d - dt.timedelta(days=29), d))
        daily.append({
            'date': d.isoformat(),
            'signups': len(su) + withdrawn_signup_by_day.get(d, 0),
            'signups_real': sum(1 for u in su if u['real'] == 'real'),
            'signups_pending': sum(1 for u in su if u['real'] == 'pending'),
            'cum_signups': cum_signup, 'cum_real': cum_real,
            'dau': dau, 'wau': wau, 'mau': mau,
            'withdrawals': withdraw_by_day.get(d, 0),
            'app_deleted': app_del_by_day.get(d, 0),
        })

    period_signups = [u for u in rows if u['signup'] and u['signup'] >= start]
    real_users = [u for u in rows if u['real'] == 'real']

    # 리텐션 — 기간 ≤30일이면 일 단위, 90일이면 주(월요일 시작) 단위 코호트
    weekly = period > 30
    cohorts = defaultdict(list)
    for u in period_signups:
        key = u['signup'] - dt.timedelta(days=u['signup'].weekday()) if weekly else u['signup']
        cohorts[key].append(u)
    retention = []
    for ck in sorted(cohorts.keys(), reverse=True):
        members = cohorts[ck]
        row = {'cohort': ck.isoformat(), 'size': len(members)}
        for n in (1, 7, 30):
            eligible = [m for m in members if m['signup'] + dt.timedelta(days=n) <= today]
            hit = sum(1 for m in eligible
                      if (m['signup'] + dt.timedelta(days=n)) in base['days'].get(m['key'], set()))
            row[f'd{n}'] = _pct(hit, len(eligible)) if eligible else None
            row[f'd{n}_n'] = len(eligible)
        retention.append(row)

    # 온보딩·입문 퀘스트(기간 내 가입자 기준)
    try:
        from app.routes.onboarding import ONBOARDING_MISSIONS
        missions_def = sorted(ONBOARDING_MISSIONS, key=lambda m: m['order'])
    except Exception:
        missions_def = []
    n_period = len(period_signups)
    quest_steps = []
    for m in missions_def:
        cnt = sum(1 for u in period_signups if m['key'] in base['missions'].get(u['key'], set()))
        quest_steps.append({'key': m['key'], 'title': m['title'], 'count': cnt, 'rate': _pct(cnt, n_period)})
    onboarded = sum(1 for u in period_signups if u['onboarded'])

    def dist(values):
        c = Counter(values)
        return [{'key': k, 'count': v} for k, v in c.most_common()]

    active_period = active_between(start, today) & included_keys
    active_rows = [u for u in rows if u['key'] in active_period]

    return jsonify({'code': 200, 'data': {
        'period': period, 'start': start.isoformat(), 'today': today.isoformat(),
        'built_at': base['built_at'],
        'activity_tracking_since': '2026-11-10',
        'totals': {
            'users': len(rows),
            'excluded': len(excluded_keys),
            'real': len(real_users),
            'pending': sum(1 for u in rows if u['real'] == 'pending'),
            'not_real': sum(1 for u in rows if u['real'] == 'no'),
            'period_signups': n_period + sum(1 for d in withdrawn_signup_dates if d >= start),
            'period_withdrawals': sum(withdraw_by_day.get(d, 0) for d in dates),
            'dau': len(by_day.get(today, set())),
            'wau': len(active_between(today - dt.timedelta(days=6), today)),
            'mau': len(active_between(today - dt.timedelta(days=29), today)),
            'churned': sum(1 for u in real_users if u['churned']),
            'churn_rate': _pct(sum(1 for u in real_users if u['churned']), len(real_users)),
            'app_deleted': sum(1 for u in rows if u['app_deleted']),
            'onboarded': onboarded, 'onboarded_rate': _pct(onboarded, n_period),
        },
        'daily': daily,
        'platforms': {'all': dist(u['platform'] for u in rows),
                      'active': dist(u['platform'] for u in active_rows)},
        'logins': dist(u['login'] for u in rows),
        'app_versions': dist(f"{u['platform']} {u['app_version']}" for u in active_rows
                             if u['app_version'] and u['platform'] in ('ios', 'android')),
        'retention': {'unit': 'week' if weekly else 'day', 'rows': retention},
        'quest_steps': quest_steps,
    }})


USER_SORTS = {
    'created_at': lambda u: u['created_at'] or dt.datetime.min,
    'last_active': lambda u: u['last_active'] or dt.date.min,
    'study_days': lambda u: u['study_days'],
    'active_days': lambda u: u['active_days'],
    'email': lambda u: (u['email'] or '').lower(),
}


@admin_bp.route('/user-stats/users', methods=['GET'])
@admin_required
def admin_user_stats_users():
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(int(request.args.get('per_page', 50)), 200))
    except (TypeError, ValueError):
        page, per_page = 1, 50
    rows = _enrich(_load_base())
    include_excluded = request.args.get('include_excluded') in ('1', 'true')
    if not include_excluded:
        rows = [u for u in rows if not u['excluded']]
    real = request.args.get('real')
    if real in ('real', 'pending', 'no'):
        rows = [u for u in rows if u['real'] == real]
    if request.args.get('churned') in ('1', 'true'):
        rows = [u for u in rows if u['churned']]
    if request.args.get('app_deleted') in ('1', 'true'):
        rows = [u for u in rows if u['app_deleted']]
    platform = request.args.get('platform')
    if platform:
        rows = [u for u in rows if u['platform'] == platform]
    kw = (request.args.get('q') or '').strip().lower()
    if kw:
        rows = [u for u in rows if kw in (u['email'] or '').lower() or kw in (u['name'] or '').lower()
                or kw == u['id']]
    sort = request.args.get('sort') if request.args.get('sort') in USER_SORTS else 'created_at'
    desc = request.args.get('order', 'desc') != 'asc'
    rows.sort(key=USER_SORTS[sort], reverse=desc)
    total = len(rows)
    chunk = rows[(page - 1) * per_page: page * per_page]

    def iso(v):
        return v.isoformat() if v else None

    return jsonify({'code': 200, 'data': {
        'items': [{
            'id': u['id'], 'email': u['email'], 'name': u['name'],
            'created_at': iso(u['created_at']), 'signup_date': iso(u['signup']),
            'last_active': iso(u['last_active']), 'platform': u['platform'], 'app_version': u['app_version'],
            'login': u['login'], 'real': u['real'], 'real_at': iso(u['real_at']),
            'active_days': u['active_days'], 'study_days': u['study_days'],
            'onboarded': u['onboarded'], 'churned': u['churned'],
            'app_deleted': u['app_deleted'], 'excluded': u['excluded'],
        } for u in chunk],
        'total': total, 'page': page, 'per_page': per_page, 'has_more': page * per_page < total,
    }})


@admin_bp.route('/user-stats/excluded', methods=['GET'])
@admin_required
def admin_excluded_list():
    rows = AdminExcludedEmail.query.order_by(AdminExcludedEmail.created_at.desc()).all()
    emails = [r.email for r in rows]
    exist = {(e or '').lower() for (e,) in db.session.query(User.email)
             .filter(func.lower(User.email).in_([e.lower() for e in emails])).all()} if emails else set()
    return jsonify({'code': 200, 'data': [{
        'id': r.id, 'email': r.email, 'memo': r.memo,
        'created_at': r.created_at.isoformat() if r.created_at else None,
        'has_account': r.email.lower() in exist,
    } for r in rows]})


@admin_bp.route('/user-stats/excluded', methods=['POST'])
@admin_required
def admin_excluded_add():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email or len(email) > 128:
        return jsonify({'code': 400, 'message': '이메일이 올바르지 않습니다.'}), 400
    memo = (data.get('memo') or '').strip()[:255] or None
    if AdminExcludedEmail.query.filter(func.lower(AdminExcludedEmail.email) == email).first():
        return jsonify({'code': 409, 'message': '이미 등록된 이메일입니다.'}), 409
    row = AdminExcludedEmail(email=email, memo=memo, created_at=dt.datetime.utcnow())
    try:
        db.session.add(row)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.error('제외 이메일 등록 실패', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500
    invalidate_cache()
    return jsonify({'code': 200, 'data': {'id': row.id, 'email': row.email, 'memo': row.memo}})


@admin_bp.route('/user-stats/excluded/<int:row_id>', methods=['DELETE'])
@admin_required
def admin_excluded_delete(row_id):
    row = AdminExcludedEmail.query.get(row_id)
    if row is None:
        return jsonify({'code': 404, 'message': '찾을 수 없습니다.'}), 404
    db.session.delete(row)
    db.session.commit()
    invalidate_cache()
    return jsonify({'code': 200, 'data': {'deleted': row_id}})
