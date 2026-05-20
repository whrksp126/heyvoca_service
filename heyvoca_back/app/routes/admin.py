"""
admin 모니터링 엔드포인트.

인증 방식:
  1) POST /admin/login — body: {username, password}. 검증 통과 시 토큰 반환.
  2) X-Admin-Token 헤더 — 위 응답 토큰(=ADMIN_PASSWORD)을 모든 admin 호출 헤더에 포함.

환경변수:
  ADMIN_USER     — 운영자 ID (기본 'ghmate')
  ADMIN_PASSWORD — 운영자 PW (필수, 토큰 역할도 겸함)
  ADMIN_TOKEN    — (deprecated) ADMIN_PASSWORD 미설정 시 fallback

Blueprint prefix: /admin
"""
import os
from functools import wraps
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from sqlalchemy import text

from app import db
from app.routes.admin_phase_prompts import PHASE_PROMPTS

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

# ──────────────────────────────────────────────────────────
# 인증 데코레이터
# ──────────────────────────────────────────────────────────

def _get_admin_token():
    """런타임에 매번 읽어 컨테이너 재시작 없이 교체 가능하게 함.
    우선순위: ADMIN_PASSWORD > ADMIN_TOKEN (deprecated)."""
    return os.environ.get('ADMIN_PASSWORD') or os.environ.get('ADMIN_TOKEN')


def _get_admin_user():
    """운영자 ID. 기본 'ghmate'."""
    return os.environ.get('ADMIN_USER', 'ghmate')


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        admin_token = _get_admin_token()
        if not admin_token:
            return jsonify({'code': 503, 'message': 'ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.'}), 503
        request_token = request.headers.get('X-Admin-Token', '')
        if request_token != admin_token:
            return jsonify({'code': 401, 'message': '인증 실패'}), 401
        return fn(*args, **kwargs)
    return wrapper


@admin_bp.route('/login', methods=['POST'])
def admin_login():
    """ID/PW 검증 후 admin 토큰 반환.

    body: {"username": "ghmate", "password": "..."}
    응답: {"code": 200, "data": {"token": "..."}}
    """
    admin_token = _get_admin_token()
    if not admin_token:
        return jsonify({'code': 503, 'message': 'ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.'}), 503

    body = request.get_json(silent=True) or {}
    username = (body.get('username') or '').strip()
    password = body.get('password') or ''

    if username != _get_admin_user() or password != admin_token:
        return jsonify({'code': 401, 'message': '아이디 또는 비밀번호가 올바르지 않습니다.'}), 401

    return jsonify({'code': 200, 'data': {'token': admin_token}}), 200


# ──────────────────────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────────────────────

def _clamp_days(raw, default=7, min_val=1, max_val=90):
    try:
        val = int(raw)
    except (TypeError, ValueError):
        val = default
    return max(min_val, min(val, max_val))


def _clamp_limit(raw, default=20, max_val=100):
    try:
        val = int(raw)
    except (TypeError, ValueError):
        val = default
    return max(1, min(val, max_val))


# ──────────────────────────────────────────────────────────
# 1. GET /admin/study/metrics — 전체 학습 지표 요약
# ──────────────────────────────────────────────────────────

@admin_bp.route('/study/metrics', methods=['GET'])
@admin_required
def study_metrics():
    """
    전체 학습 지표 요약.

    Query params:
        days (int, 기본값 7): 집계 기간 (최근 N일)

    Response:
        {
          "code": 200,
          "data": {
            "period_days": 7,
            "since": "2026-04-30T00:00:00",
            "total_logs": 12345,
            "total_sessions": 432,
            "active_users": 89,
            "avg_correct_rate": 0.78,
            "schema_version_distribution": {"v1": 0, "v2": 715, "v3": 0},
            "question_type_distribution": {"multipleChoice": 5400, ...},
            "test_type_distribution": {"daily": 8000, ...},
            "avg_time_taken_ms": 7200,
            "fsrs_state_distribution": {"new": 100, "review": 600, "relearning": 15}
          }
        }
    """
    days = _clamp_days(request.args.get('days'), default=7)
    since = datetime.utcnow() - timedelta(days=days)

    # ── 기본 집계 ────────────────────────────────────────────
    log_row = db.session.execute(text('''
        SELECT
            COUNT(*)                                         AS total_logs,
            SUM(CASE WHEN was_correct THEN 1 ELSE 0 END)   AS correct_logs,
            COUNT(DISTINCT user_id)                          AS active_users,
            AVG(time_taken_ms)                               AS avg_time_taken_ms
        FROM heyvoca_user.user_study_log
        WHERE created_at >= :since
    '''), {'since': since}).fetchone()

    total_logs     = int(log_row.total_logs or 0)
    correct_logs   = int(log_row.correct_logs or 0)
    active_users   = int(log_row.active_users or 0)
    avg_time_ms    = round(float(log_row.avg_time_taken_ms or 0))
    avg_correct    = round(correct_logs / total_logs, 4) if total_logs > 0 else None

    session_row = db.session.execute(text('''
        SELECT COUNT(*) AS total_sessions
        FROM heyvoca_user.user_study_session
        WHERE started_at >= :since
    '''), {'since': since}).fetchone()
    total_sessions = int(session_row.total_sessions or 0)

    # ── schema_version 분포 (UserVoca.data JSON) ─────────────
    # 현재 학습 로그가 있는 user_voca_id 기준으로 data의 schema_version 집계.
    # 로그 수가 적을 때는 DISTINCT user_voca_id로 조회해 성능 보장.
    sv_rows = db.session.execute(text('''
        SELECT
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(uv.data, "$.schema_version")), "1") AS sv,
            COUNT(*) AS cnt
        FROM heyvoca_user.user_voca uv
        WHERE uv.id IN (
            SELECT DISTINCT user_voca_id
            FROM heyvoca_user.user_study_log
            WHERE created_at >= :since
        )
        GROUP BY sv
    '''), {'since': since}).fetchall()

    schema_dist = {'v1': 0, 'v2': 0, 'v3': 0}
    for row in sv_rows:
        key = f'v{row.sv}'
        schema_dist[key] = schema_dist.get(key, 0) + int(row.cnt)

    # ── question_type 분포 ────────────────────────────────────
    qt_rows = db.session.execute(text('''
        SELECT question_type, COUNT(*) AS cnt
        FROM heyvoca_user.user_study_log
        WHERE created_at >= :since
        GROUP BY question_type
    '''), {'since': since}).fetchall()
    question_type_dist = {r.question_type: int(r.cnt) for r in qt_rows}

    # ── test_type 분포 ────────────────────────────────────────
    tt_rows = db.session.execute(text('''
        SELECT test_type, COUNT(*) AS cnt
        FROM heyvoca_user.user_study_log
        WHERE created_at >= :since
        GROUP BY test_type
    '''), {'since': since}).fetchall()
    test_type_dist = {r.test_type: int(r.cnt) for r in tt_rows}

    # ── FSRS state 분포 ───────────────────────────────────────
    # state_after JSON에서 추출. NULL이면 'unset'으로 분류.
    fsrs_rows = db.session.execute(text('''
        SELECT
            COALESCE(
                JSON_UNQUOTE(JSON_EXTRACT(state_after, "$.state")),
                "unset"
            ) AS fsrs_state,
            COUNT(*) AS cnt
        FROM heyvoca_user.user_study_log
        WHERE created_at >= :since
        GROUP BY fsrs_state
    '''), {'since': since}).fetchall()
    fsrs_state_dist = {r.fsrs_state: int(r.cnt) for r in fsrs_rows}

    return jsonify({
        'code': 200,
        'data': {
            'period_days':                  days,
            'since':                        since.isoformat(),
            'total_logs':                   total_logs,
            'total_sessions':               total_sessions,
            'active_users':                 active_users,
            'avg_correct_rate':             avg_correct,
            'schema_version_distribution':  schema_dist,
            'question_type_distribution':   question_type_dist,
            'test_type_distribution':       test_type_dist,
            'avg_time_taken_ms':            avg_time_ms,
            'fsrs_state_distribution':      fsrs_state_dist,
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 2. GET /admin/study/recent-sessions — 최근 세션 목록
# ──────────────────────────────────────────────────────────

@admin_bp.route('/study/recent-sessions', methods=['GET'])
@admin_required
def recent_sessions():
    """
    최근 세션 목록 (사용자 무관, 디버그용).

    Query params:
        limit (int, 기본값 20, 최대 100)

    Response:
        {
          "code": 200,
          "data": {
            "sessions": [
              {
                "session_id": "...",
                "user_id": "...",
                "test_type": "test",
                "question_count": 20,
                "correct_count": 17,
                "correct_rate": 0.85,
                "duration_seconds": 142,
                "started_at": "...",
                "finished_at": "..."
              },
              ...
            ],
            "count": 20
          }
        }
    """
    limit = _clamp_limit(request.args.get('limit'), default=20, max_val=100)

    rows = db.session.execute(text('''
        SELECT
            HEX(id)                                         AS session_id_hex,
            HEX(user_id)                                    AS user_id_hex,
            test_type,
            question_count,
            correct_count,
            started_at,
            finished_at,
            TIMESTAMPDIFF(SECOND, started_at, finished_at)  AS duration_seconds
        FROM heyvoca_user.user_study_session
        ORDER BY started_at DESC
        LIMIT :limit
    '''), {'limit': limit}).fetchall()

    sessions = []
    for r in rows:
        qc = int(r.question_count or 0)
        cc = int(r.correct_count or 0)
        sessions.append({
            'session_id':       _fmt_uuid_hex(r.session_id_hex),
            'user_id':          _fmt_uuid_hex(r.user_id_hex),
            'test_type':        r.test_type,
            'question_count':   qc,
            'correct_count':    cc,
            'correct_rate':     round(cc / qc, 4) if qc > 0 else None,
            'duration_seconds': r.duration_seconds,
            'started_at':       r.started_at.isoformat() if r.started_at else None,
            'finished_at':      r.finished_at.isoformat() if r.finished_at else None,
        })

    return jsonify({
        'code': 200,
        'data': {
            'sessions': sessions,
            'count':    len(sessions),
        },
    }), 200


def _fmt_uuid_hex(hex_str):
    """32자 HEX → 하이픈 포함 UUID 형식."""
    if not hex_str:
        return None
    h = hex_str.lower().replace('-', '')
    if len(h) != 32:
        return hex_str
    return f'{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}'


# ──────────────────────────────────────────────────────────
# 3. GET /admin/fsrs/health — FSRS 알고리즘 건강도 점검
# ──────────────────────────────────────────────────────────

@admin_bp.route('/fsrs/health', methods=['GET'])
@admin_required
def fsrs_health():
    """
    FSRS 알고리즘 건강도 점검.

    Response:
        {
          "code": 200,
          "data": {
            "users_with_stats": 89,
            "avg_stability_distribution": {"<10": 320, "10-60": 215, ">=60": 45},
            "lapse_rate_last_7d": 0.18,
            "weakness_users_top": [
              {"user_id": "...", "weakness_count": 3, "avg_correct_rate": 0.41}
            ],
            "fsrs_param_active_version": "default-v1",
            "logs_per_partition": {"p2026": 4, "p2027": 0, ...}
          }
        }
    """
    # ── 유효 FSRS 데이터 보유 사용자 수 ──────────────────────
    users_row = db.session.execute(text('''
        SELECT COUNT(DISTINCT user_id) AS cnt
        FROM heyvoca_user.user_voca
        WHERE JSON_UNQUOTE(JSON_EXTRACT(data, "$.schema_version")) IN ("2", "3")
    ''')).fetchone()
    users_with_stats = int(users_row.cnt or 0)

    # ── stability 분포 (<10 / 10-60 / >=60) ──────────────────
    stab_rows = db.session.execute(text('''
        SELECT
            SUM(CASE WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(data, "$.fsrs.stability")) AS DECIMAL(10,2)) < 10  THEN 1 ELSE 0 END) AS lt10,
            SUM(CASE WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(data, "$.fsrs.stability")) AS DECIMAL(10,2)) BETWEEN 10 AND 59.99 THEN 1 ELSE 0 END) AS mid,
            SUM(CASE WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(data, "$.fsrs.stability")) AS DECIMAL(10,2)) >= 60 THEN 1 ELSE 0 END) AS gte60
        FROM heyvoca_user.user_voca
        WHERE JSON_EXTRACT(data, "$.fsrs.stability") IS NOT NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(data, "$.fsrs.stability")) != "null"
    ''')).fetchone()
    avg_stability_dist = {
        '<10':   int(stab_rows.lt10  or 0),
        '10-60': int(stab_rows.mid   or 0),
        '>=60':  int(stab_rows.gte60 or 0),
    }

    # ── lapse rate (최근 7일) ─────────────────────────────────
    # rating=1 (Again) 비율 = lapse
    since_7d = datetime.utcnow() - timedelta(days=7)
    lapse_row = db.session.execute(text('''
        SELECT
            COUNT(*)                                            AS total,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END)       AS lapses
        FROM heyvoca_user.user_study_log
        WHERE created_at >= :since
          AND rating IS NOT NULL
    '''), {'since': since_7d}).fetchone()
    total_rated = int(lapse_row.total or 0)
    lapses      = int(lapse_row.lapses or 0)
    lapse_rate  = round(lapses / total_rated, 4) if total_rated > 0 else None

    # ── 약점 사용자 상위 10명 ─────────────────────────────────
    # user_question_type_stat 기준: total_count >= 10인 유형 중
    # correct_rate < 0.6 인 유형이 많은 사용자 순
    weakness_rows = db.session.execute(text('''
        SELECT
            HEX(user_id)                                    AS user_id_hex,
            COUNT(*)                                        AS weakness_count,
            AVG(correct_count / total_count)                AS avg_correct_rate
        FROM heyvoca_user.user_question_type_stat
        WHERE total_count >= 10
          AND (correct_count / total_count) < 0.6
        GROUP BY user_id
        ORDER BY weakness_count DESC, avg_correct_rate ASC
        LIMIT 10
    ''')).fetchall()
    weakness_top = [
        {
            'user_id':          _fmt_uuid_hex(r.user_id_hex),
            'weakness_count':   int(r.weakness_count),
            'avg_correct_rate': round(float(r.avg_correct_rate or 0), 4),
        }
        for r in weakness_rows
    ]

    # ── FSRS 파라미터 활성 버전 ──────────────────────────────
    # Phase 3.1 전에는 기본 파라미터만 사용. FSRSParamSet 모델 없으면 "default-v1" 고정.
    fsrs_param_version = 'default-v1'

    # ── 파티션별 로그 수 ─────────────────────────────────────
    partition_rows = db.session.execute(text('''
        SELECT PARTITION_NAME, TABLE_ROWS
        FROM information_schema.PARTITIONS
        WHERE TABLE_SCHEMA = "heyvoca_user"
          AND TABLE_NAME   = "user_study_log"
        ORDER BY PARTITION_ORDINAL_POSITION
    ''')).fetchall()
    logs_per_partition = {r.PARTITION_NAME: int(r.TABLE_ROWS or 0) for r in partition_rows}

    return jsonify({
        'code': 200,
        'data': {
            'users_with_stats':          users_with_stats,
            'avg_stability_distribution': avg_stability_dist,
            'lapse_rate_last_7d':         lapse_rate,
            'weakness_users_top':         weakness_top,
            'fsrs_param_active_version':  fsrs_param_version,
            'logs_per_partition':         logs_per_partition,
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 4. GET /admin/progress — FSRS 로드맵 진행률
# ──────────────────────────────────────────────────────────

def _parse_launch_date():
    """LAUNCH_DATE 환경변수(ISO 8601)를 읽어 datetime 반환. 미설정이면 None."""
    raw = os.environ.get('LAUNCH_DATE')
    if not raw:
        return None
    try:
        # 날짜만 있는 경우(YYYY-MM-DD)와 datetime 형식 모두 처리
        if 'T' in raw or ' ' in raw:
            return datetime.fromisoformat(raw.replace('Z', '+00:00').rstrip('+00:00'))
        else:
            return datetime.strptime(raw, '%Y-%m-%d')
    except (ValueError, AttributeError):
        return None


def _calc_progress(current_value, target_value):
    """
    0.0 ~ 1.0 사이 진행률 반환.

    target=0 이면 "0이어야 한다"는 조건 → current=0이면 1.0, 그 외 0.0.
    """
    if target_value == 0:
        return 1.0 if current_value == 0 else 0.0
    return min(current_value / target_value, 1.0)


def _build_threshold(name, criteria, items, target):
    """
    임계치 딕셔너리를 빌드한다.

    items: list of (current_value, target_value) tuples
    target: dict (응답의 target 필드)
    """
    progresses = [_calc_progress(c, t) for c, t in items]
    threshold_progress = min(progresses) if progresses else 0.0
    met = threshold_progress >= 1.0
    return {
        'name': name,
        'criteria': criteria,
        'target': target,
        'progress_percent': round(threshold_progress * 100, 1),
        'met': met,
    }


@admin_bp.route('/progress', methods=['GET'])
@admin_required
def admin_progress():
    """
    FSRS 로드맵 각 단계의 임계치 대비 현재 달성률.

    환경변수:
        LAUNCH_DATE (ISO 8601, 예: 2026-06-01) — 미설정 시 시간 기반 임계치 progress=0

    Response: 스펙 참고 (docs/POST_LAUNCH_TODO.md)
    """
    now = datetime.utcnow()

    # ── LAUNCH_DATE 기반 경과일 ────────────────────────────
    launch_dt = _parse_launch_date()
    days_since_launch = (now - launch_dt).days if launch_dt else None

    # ── 전체 학습 로그 수 ─────────────────────────────────
    log_count_row = db.session.execute(text(
        'SELECT COUNT(*) AS cnt FROM heyvoca_user.user_study_log'
    )).fetchone()
    total_logs = int(log_count_row.cnt or 0)

    # ── 전체 세션 수 ──────────────────────────────────────
    total_sessions_row = db.session.execute(text(
        'SELECT COUNT(*) AS cnt FROM heyvoca_user.user_study_session'
    )).fetchone()
    total_sessions = int(total_sessions_row.cnt or 0)

    # ── 최근 30일 활성 사용자 ─────────────────────────────
    since_30d = now - timedelta(days=30)
    active_row = db.session.execute(text('''
        SELECT COUNT(DISTINCT user_id) AS cnt
        FROM heyvoca_user.user_study_log
        WHERE created_at >= :since
    '''), {'since': since_30d}).fetchone()
    active_users_30d = int(active_row.cnt or 0)

    # ── 사용자별 누적 리뷰 수 (200+, 500+) ──────────────
    review_200_row = db.session.execute(text('''
        SELECT COUNT(*) AS cnt
        FROM (
            SELECT user_id, COUNT(*) AS review_cnt
            FROM heyvoca_user.user_study_log
            GROUP BY user_id
            HAVING review_cnt >= 200
        ) t
    ''')).fetchone()
    users_with_200_plus = int(review_200_row.cnt or 0)

    review_500_row = db.session.execute(text('''
        SELECT COUNT(*) AS cnt
        FROM (
            SELECT user_id, COUNT(*) AS review_cnt
            FROM heyvoca_user.user_study_log
            GROUP BY user_id
            HAVING review_cnt >= 500
        ) t
    ''')).fetchone()
    users_with_500_plus = int(review_500_row.cnt or 0)

    # ── summary ──────────────────────────────────────────
    summary = {
        'total_logs': total_logs,
        'total_sessions': total_sessions,
        'active_users_30d': active_users_30d,
        'users_with_200_plus_reviews': users_with_200_plus,
        'days_since_launch': days_since_launch,
    }

    # ── 헬퍼: 시간 기반 progress (LAUNCH_DATE 없으면 0) ──
    def _days_progress(target_days):
        if days_since_launch is None:
            return 0.0
        return _calc_progress(days_since_launch, target_days)

    def _days_met(target_days):
        if days_since_launch is None:
            return False
        return days_since_launch >= target_days

    # ── Phase 3.1 임계치 ─────────────────────────────────
    p31_min_prog = _calc_progress(total_logs, 10000)
    p31_rec_prog = _calc_progress(total_logs, 30000)
    p31_best_prog = _calc_progress(total_logs, 100000)

    phase_31_status = 'available' if p31_min_prog >= 1.0 else 'blocked'

    phase_31 = {
        'id': '3.1',
        'title': '글로벌 FSRS 파라미터 ML 최적화',
        'description': '전체 사용자 학습 로그로 17개 파라미터 fitting (scipy.optimize)',
        'status': phase_31_status,
        'thresholds': [
            {
                'name': '최소',
                'criteria': '총 학습 로그 10,000 reviews',
                'current': {'total_logs': total_logs},
                'target': {'total_logs': 10000},
                'progress_percent': round(p31_min_prog * 100, 1),
                'met': p31_min_prog >= 1.0,
            },
            {
                'name': '권장',
                'criteria': '총 학습 로그 30,000 reviews',
                'current': {'total_logs': total_logs},
                'target': {'total_logs': 30000},
                'progress_percent': round(p31_rec_prog * 100, 1),
                'met': p31_rec_prog >= 1.0,
            },
            {
                'name': '최상',
                'criteria': '총 학습 로그 100,000 reviews',
                'current': {'total_logs': total_logs},
                'target': {'total_logs': 100000},
                'progress_percent': round(p31_best_prog * 100, 1),
                'met': p31_best_prog >= 1.0,
            },
        ],
        'next_action': {
            'trigger_label': '최소 기준 달성 시 진행 가능',
            'command_short': 'Phase 3.1 진행해줘 (FSRS 글로벌 파라미터 ML 최적화)',
            'command_for_claude': PHASE_PROMPTS['3.1'],
            'doc_link': 'heyvoca_service/docs/POST_LAUNCH_TODO.md',
        },
    }

    # ── Phase 3.2 임계치 ─────────────────────────────────
    p32_min_prog  = _calc_progress(users_with_200_plus, 100)
    p32_rec_prog  = _calc_progress(users_with_200_plus, 500)
    p32_best_prog = _calc_progress(users_with_500_plus, 1000)

    phase_32_status = 'available' if p32_min_prog >= 1.0 else 'blocked'

    phase_32 = {
        'id': '3.2',
        'title': '사용자별 FSRS 파라미터',
        'description': '200+ reviews 사용자에게 user-specific 파라미터 적용',
        'status': phase_32_status,
        'thresholds': [
            {
                'name': '최소',
                'criteria': '200+ reviews 사용자 100명 이상',
                'current': {'users_with_200_plus_reviews': users_with_200_plus},
                'target': {'users_with_200_plus_reviews': 100},
                'progress_percent': round(p32_min_prog * 100, 1),
                'met': p32_min_prog >= 1.0,
            },
            {
                'name': '권장',
                'criteria': '200+ reviews 사용자 500명',
                'current': {'users_with_200_plus_reviews': users_with_200_plus},
                'target': {'users_with_200_plus_reviews': 500},
                'progress_percent': round(p32_rec_prog * 100, 1),
                'met': p32_rec_prog >= 1.0,
            },
            {
                'name': '최상',
                'criteria': '500+ reviews 사용자 1000명',
                'current': {'users_with_500_plus_reviews': users_with_500_plus},
                'target': {'users_with_500_plus_reviews': 1000},
                'progress_percent': round(p32_best_prog * 100, 1),
                'met': p32_best_prog >= 1.0,
            },
        ],
        'next_action': {
            'trigger_label': '최소 기준 달성 시 진행 가능',
            'command_short': 'Phase 3.2 진행해줘 (사용자별 FSRS 파라미터)',
            'command_for_claude': PHASE_PROMPTS['3.2'],
            'doc_link': 'heyvoca_service/docs/POST_LAUNCH_TODO.md',
        },
    }

    # ── Phase 3.3 임계치 ─────────────────────────────────
    p33_rec_prog = _days_progress(180)
    p33_rec_met  = _days_met(180)

    phase_33 = {
        'id': '3.3',
        'title': '임베딩 R&D POC',
        'description': '단어/사용자 임베딩 기반 추천 고도화 (POC)',
        'status': 'deferred',
        'thresholds': [
            {
                'name': '권장',
                'criteria': '정식 오픈 6개월 경과 + 별도 의사결정',
                'current': {'days_since_launch': days_since_launch},
                'target': {'days_since_launch': 180},
                'progress_percent': round(p33_rec_prog * 100, 1),
                'met': p33_rec_met,
            },
        ],
        'next_action': {
            'trigger_label': '별도 의사결정 후 진행',
            'command_short': 'Phase 3.3 진행해줘 (임베딩 R&D POC)',
            'command_for_claude': PHASE_PROMPTS['3.3'],
            'doc_link': 'heyvoca_service/docs/POST_LAUNCH_TODO.md',
        },
    }

    return jsonify({
        'code': 200,
        'data': {
            'now': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'summary': summary,
            'phases': [phase_31, phase_32, phase_33],
        },
    }), 200
