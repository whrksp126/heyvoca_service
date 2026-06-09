"""
어드민 Overview 대시보드 API.

엔드포인트:
  GET /admin/study/metrics?days=N        — 최근 N일 학습 로그 집계
  GET /admin/fsrs/health                 — 전체 UserVoca FSRS 카드 상태 집계
  GET /admin/study/recent-sessions?limit=N — 최근 학습 세션 목록
  GET /admin/progress                    — 개발 로드맵 phase 진행 현황
"""

import json
import datetime as dt

from flask import request, jsonify

from app.routes import admin_bp
from app.models.models import (
    db,
    User,
    UserVoca,
    UserStudyLog,
    UserStudySession,
)
from app.routes.admin import admin_required
from app.routes.admin_phase_prompts import PHASE_PROMPTS


# ──────────────────────────────────────────
# 1. GET /admin/study/metrics?days=N
# ──────────────────────────────────────────

@admin_bp.route('/study/metrics', methods=['GET'])
@admin_required
def study_metrics():
    """최근 N일 학습 로그 집계."""
    try:
        days = int(request.args.get('days', 7))
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 365))

    since = dt.datetime.utcnow() - dt.timedelta(days=days)

    # 기간 내 모든 로그를 한 번만 로드 (user_study_log 파티션 인덱스 활용)
    logs = (
        db.session.query(
            UserStudyLog.user_id,
            UserStudyLog.question_type,
            UserStudyLog.test_type,
            UserStudyLog.was_correct,
            UserStudyLog.rating,
            UserStudyLog.state_before,
        )
        .filter(UserStudyLog.created_at >= since)
        .all()
    )

    total_reviews = len(logs)

    # 기간 내 학습한 distinct user 수
    distinct_users = len({str(log.user_id) for log in logs})

    # 평균 정답률
    if total_reviews > 0:
        correct_count = sum(1 for log in logs if log.was_correct)
        avg_score = round(correct_count / total_reviews, 4)
    else:
        avg_score = None

    # question_type 별 건수
    question_types: dict = {}
    for log in logs:
        qt = log.question_type or 'unknown'
        question_types[qt] = question_types.get(qt, 0) + 1

    # test_type 별 건수
    test_types: dict = {}
    for log in logs:
        tt = log.test_type or 'unknown'
        test_types[tt] = test_types.get(tt, 0) + 1

    # FSRS state 별 건수 (state_before JSON에서 state 필드 추출)
    fsrs_states: dict = {}
    for log in logs:
        state = 'unknown'
        if log.state_before:
            try:
                sb = json.loads(log.state_before)
                state = sb.get('state') or 'new'
            except (ValueError, TypeError):
                state = 'unknown'
        else:
            state = 'new'
        fsrs_states[state] = fsrs_states.get(state, 0) + 1

    return jsonify({
        'code': 200,
        'data': {
            'days': days,
            'total_reviews': total_reviews,
            'total_users': distinct_users,
            'avg_score': avg_score,
            'question_types': question_types,
            'test_types': test_types,
            'fsrs_states': fsrs_states,
        },
    })


# ──────────────────────────────────────────
# 2. GET /admin/fsrs/health
# ──────────────────────────────────────────

_FSRS_SAMPLE_LIMIT = 20000  # 샘플링 임계 (이 이상이면 샘플링 후 sampled=true)


@admin_bp.route('/fsrs/health', methods=['GET'])
@admin_required
def fsrs_health():
    """전체 UserVoca의 FSRS 카드 상태 집계."""

    total_cards = db.session.query(UserVoca).count()

    # 대량일 경우 샘플링
    sampled = False
    if total_cards > _FSRS_SAMPLE_LIMIT:
        rows = (
            db.session.query(UserVoca.data, UserVoca.id)
            .order_by(UserVoca.id.desc())
            .limit(_FSRS_SAMPLE_LIMIT)
            .all()
        )
        sampled = True
    else:
        rows = db.session.query(UserVoca.data, UserVoca.id).all()

    # 집계 변수
    state_counts = {'new': 0, 'learning': 0, 'review': 0, 'relearning': 0}
    lapse_count = 0
    stability_sum = 0.0
    difficulty_sum = 0.0
    retrievability_sum = 0.0
    fsrs_card_count = 0  # FSRS state가 있는 카드 수 (평균 계산 분모)

    for row in rows:
        data_str = row.data
        if not data_str:
            state_counts['new'] += 1
            continue

        try:
            payload = json.loads(data_str)
        except (ValueError, TypeError):
            state_counts['new'] += 1
            continue

        # UserVoca.data 구조: {"fsrs": {...}, ...} 또는 구버전 v1
        fsrs = None
        if isinstance(payload, dict):
            fsrs = payload.get('fsrs')
            if fsrs is None:
                # v1 구조: payload 자체가 FSRS state일 수도 있음 (호환)
                # v1은 'state' 키가 없으므로 'new' 처리
                pass

        if not fsrs or not isinstance(fsrs, dict):
            state_counts['new'] += 1
            continue

        state = fsrs.get('state') or 'new'
        if state in state_counts:
            state_counts[state] += 1
        else:
            state_counts['new'] += 1

        # lapse 여부: state가 relearning이면 한 번 이상 lapse 발생
        if state == 'relearning':
            lapse_count += 1

        stability = fsrs.get('stability')
        difficulty = fsrs.get('difficulty')
        retrievability = fsrs.get('retrievability')

        if stability is not None:
            try:
                stability_sum += float(stability)
                fsrs_card_count += 1
            except (TypeError, ValueError):
                pass
        if difficulty is not None:
            try:
                difficulty_sum += float(difficulty)
            except (TypeError, ValueError):
                pass
        if retrievability is not None:
            try:
                retrievability_sum += float(retrievability)
            except (TypeError, ValueError):
                pass

    sample_size = len(rows)
    avg_stability = round(stability_sum / fsrs_card_count, 4) if fsrs_card_count > 0 else None
    avg_difficulty = round(difficulty_sum / fsrs_card_count, 4) if fsrs_card_count > 0 else None
    avg_retrievability = round(retrievability_sum / fsrs_card_count, 4) if fsrs_card_count > 0 else None
    lapse_rate = round(lapse_count / sample_size, 4) if sample_size > 0 else None

    # MySQL 파티션 정보 (user_study_log에 파티션 있음, user_voca는 파티션 없음)
    # user_study_log 파티션 rows 정보를 보조로 제공
    partition_rows = []
    try:
        result = db.session.execute(
            db.text(
                "SELECT partition_name, table_rows "
                "FROM information_schema.partitions "
                "WHERE table_schema = DATABASE() "
                "  AND table_name = 'user_study_log' "
                "  AND partition_name IS NOT NULL "
                "ORDER BY partition_name"
            )
        ).fetchall()
        partition_rows = [
            {'partition': r[0], 'rows': r[1]}
            for r in result
        ]
    except Exception:
        partition_rows = []

    return jsonify({
        'code': 200,
        'data': {
            'total_cards': total_cards,
            'sampled': sampled,
            'sample_size': sample_size if sampled else total_cards,
            'states': state_counts,
            'lapse_rate': lapse_rate,
            'avg_stability': avg_stability,
            'avg_difficulty': avg_difficulty,
            'avg_retrievability': avg_retrievability,
            'partition_rows': partition_rows,
        },
    })


# ──────────────────────────────────────────
# 3. GET /admin/study/recent-sessions?limit=N
# ──────────────────────────────────────────

@admin_bp.route('/study/recent-sessions', methods=['GET'])
@admin_required
def admin_recent_sessions():
    """최근 학습 세션 목록 (전체 사용자, 최신순)."""
    try:
        limit = int(request.args.get('limit', 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 200))

    sessions = (
        UserStudySession.query
        .order_by(UserStudySession.started_at.desc())
        .limit(limit)
        .all()
    )

    data = [
        {
            'id':             str(s.id),
            'user_id':        str(s.user_id) if s.user_id else None,
            'test_type':      s.test_type,
            'book_ids':       s.book_ids,
            'question_count': s.question_count,
            'correct_count':  s.correct_count,
            'started_at':     s.started_at.isoformat() if s.started_at else None,
            'finished_at':    s.finished_at.isoformat() if s.finished_at else None,
            'duration_sec': (
                int((s.finished_at - s.started_at).total_seconds())
                if s.finished_at and s.started_at else None
            ),
        }
        for s in sessions
    ]

    return jsonify({
        'code': 200,
        'data': {
            'sessions': data,
        },
    })


# ──────────────────────────────────────────
# 4. GET /admin/progress
# ──────────────────────────────────────────

def _count_users_with_specific_params() -> int:
    """
    user-specific FSRS 파라미터가 적용된 사용자 수.
    FSRSParamSet 모델은 Phase 3.1에서 추가 예정이므로 현재는 0 반환.
    """
    try:
        # Phase 3.1 완료 후: FSRSParamSet.query.filter_by(scope='user', is_active=True).count()
        return 0
    except Exception:
        return 0


def _get_total_reviews_count() -> int:
    """전체 학습 로그 건수."""
    try:
        return db.session.query(UserStudyLog).count()
    except Exception:
        return 0


def _get_users_with_200_plus_reviews() -> int:
    """200건 이상 학습 로그가 있는 사용자 수."""
    try:
        from sqlalchemy import func
        result = (
            db.session.query(UserStudyLog.user_id)
            .group_by(UserStudyLog.user_id)
            .having(func.count(UserStudyLog.id) >= 200)
            .count()
        )
        return result
    except Exception:
        return 0


@admin_bp.route('/progress', methods=['GET'])
@admin_required
def admin_progress():
    """개발 로드맵 phase 진행 현황."""

    # 데이터 기반으로 계산 가능한 값들
    total_reviews = _get_total_reviews_count()
    users_200_plus = _get_users_with_200_plus_reviews()
    users_with_specific_params = _count_users_with_specific_params()
    total_users = db.session.query(User).count()

    # Phase 1.1 — FSRS 학습 로그 영구 저장 (완료)
    phase_1_1 = {
        'key': '1.1',
        'title': 'FSRS 학습 로그 영구 저장',
        'status': '완료',
        'thresholds': {
            'minimum': 1,
            'recommended': 1,
            'best': 1,
        },
        'current_value': 1,
        'next_action': {
            'description': '완료됨. UserStudyLog 파티션 테이블로 영구 이력 저장 중.',
            'command_for_claude': None,
        },
    }

    # Phase 1.2 — FSRS 스케줄러 + 학습 API (완료)
    phase_1_2 = {
        'key': '1.2',
        'title': 'FSRS 스케줄러 + 학습 API',
        'status': '완료',
        'thresholds': {
            'minimum': 1,
            'recommended': 1,
            'best': 1,
        },
        'current_value': 1,
        'next_action': {
            'description': '완료됨. POST /study/log + FSRS review() 적용 완료.',
            'command_for_claude': None,
        },
    }

    # Phase 2.1 — 문제 유형별 정답률 집계 (완료)
    phase_2_1 = {
        'key': '2.1',
        'title': '문제 유형별 정답률 집계',
        'status': '완료',
        'thresholds': {
            'minimum': 1,
            'recommended': 1,
            'best': 1,
        },
        'current_value': 1,
        'next_action': {
            'description': '완료됨. UserQuestionTypeStat UPSERT 로직 운영 중.',
            'command_for_claude': None,
        },
    }

    # Phase 2.2 — FSRS 파라미터 튜닝 (lapse_history, prior_correct_rate) (완료)
    phase_2_2 = {
        'key': '2.2',
        'title': 'FSRS 파라미터 튜닝',
        'status': '완료',
        'thresholds': {
            'minimum': 1,
            'recommended': 1,
            'best': 1,
        },
        'current_value': 1,
        'next_action': {
            'description': '완료됨. lapse_history / prior_correct_rate 기반 rating 파생 운영 중.',
            'command_for_claude': None,
        },
    }

    # Phase 2.3 — 추천 알고리즘 (compose) (완료)
    phase_2_3 = {
        'key': '2.3',
        'title': '추천 알고리즘 (compose)',
        'status': '완료',
        'thresholds': {
            'minimum': 1,
            'recommended': 1,
            'best': 1,
        },
        'current_value': 1,
        'next_action': {
            'description': '완료됨. GET /study/recommend — 버킷 기반 세션 구성 운영 중.',
            'command_for_claude': None,
        },
    }

    # Phase 3.1 — FSRS 글로벌 파라미터 ML 최적화
    # 임계: minimum 10,000 reviews, recommended 50,000, best 100,000
    p3_1_minimum = 10000
    p3_1_recommended = 50000
    p3_1_best = 100000
    if total_reviews >= p3_1_best:
        p3_1_status = '진행 가능'
    elif total_reviews >= p3_1_minimum:
        p3_1_status = '진행 가능'
    else:
        p3_1_status = '대기중'

    phase_3_1 = {
        'key': '3.1',
        'title': 'FSRS 글로벌 파라미터 ML 최적화',
        'status': p3_1_status,
        'thresholds': {
            'minimum': p3_1_minimum,
            'recommended': p3_1_recommended,
            'best': p3_1_best,
        },
        'current_value': total_reviews,
        'unit': 'total_reviews',
        'next_action': {
            'description': (
                f'전체 학습 로그 {total_reviews:,}건. '
                f'최소 {p3_1_minimum:,}건 이상이면 글로벌 파라미터 fitting 가능.'
            ),
            'command_for_claude': PHASE_PROMPTS.get('3.1'),
        },
    }

    # Phase 3.2 — 사용자별 FSRS 파라미터
    # 임계: minimum 100명 (200+ reviews 보유), recommended 500명, best 1,000명
    p3_2_minimum = 100
    p3_2_recommended = 500
    p3_2_best = 1000
    if users_200_plus >= p3_2_minimum:
        p3_2_status = '진행 가능'
    else:
        p3_2_status = '대기중'

    phase_3_2 = {
        'key': '3.2',
        'title': '사용자별 FSRS 파라미터',
        'status': p3_2_status,
        'thresholds': {
            'minimum': p3_2_minimum,
            'recommended': p3_2_recommended,
            'best': p3_2_best,
        },
        'current_value': users_200_plus,
        'unit': 'users_with_200plus_reviews',
        'next_action': {
            'description': (
                f'200건 이상 학습한 사용자 {users_200_plus}명. '
                f'최소 {p3_2_minimum}명 이상이면 사용자별 파라미터 fitting 가능.'
            ),
            'command_for_claude': PHASE_PROMPTS.get('3.2'),
        },
    }

    # Phase 3.3 — 임베딩 R&D POC (보류)
    phase_3_3 = {
        'key': '3.3',
        'title': '임베딩 R&D POC',
        'status': '보류',
        'thresholds': {
            'minimum': None,
            'recommended': None,
            'best': None,
        },
        'current_value': None,
        'unit': None,
        'next_action': {
            'description': '정식 오픈 6개월 후 별도 의사결정 후 진행. 현재 보류.',
            'command_for_claude': PHASE_PROMPTS.get('3.3'),
        },
    }

    phases = [phase_1_1, phase_1_2, phase_2_1, phase_2_2, phase_2_3,
              phase_3_1, phase_3_2, phase_3_3]

    # 요약
    completed = sum(1 for p in phases if p['status'] == '완료')
    actionable = sum(1 for p in phases if p['status'] == '진행 가능')
    waiting = sum(1 for p in phases if p['status'] == '대기중')
    deferred = sum(1 for p in phases if p['status'] == '보류')

    summary = {
        'total_phases': len(phases),
        'completed': completed,
        'actionable': actionable,
        'waiting': waiting,
        'deferred': deferred,
        'total_reviews': total_reviews,
        'total_users': total_users,
        'users_200_plus_reviews': users_200_plus,
        'users_with_user_specific_params': users_with_specific_params,
    }

    return jsonify({
        'code': 200,
        'data': {
            'summary': summary,
            'phases': phases,
        },
    })
