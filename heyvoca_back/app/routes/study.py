import json
import datetime as dt
from uuid import UUID, uuid4

from flask import Blueprint, jsonify, request, g
from sqlalchemy import text

from app import db
from app.models.models import UserStudySession, UserStudyLog, UserVoca, UserQuestionTypeStat
from app.utils.jwt_utils import jwt_required

study_bp = Blueprint('study', __name__, url_prefix='/study')

_MAX_LIMIT = 500

# memory_state 임계점 (stability 기준)
_STABILITY_SHORT  = 10.0
_STABILITY_MEDIUM = 60.0


def _clamp_limit(raw, default=20):
    """limit 파라미터를 1~_MAX_LIMIT 범위로 클램프."""
    try:
        val = int(raw)
    except (TypeError, ValueError):
        val = default
    return max(1, min(val, _MAX_LIMIT))


def _classify_memory_state(fsrs_state: dict) -> str:
    """FSRS state → 기억 단계 분류."""
    if not fsrs_state or fsrs_state.get("state") in ("new", None):
        return "unlearned"
    s = float(fsrs_state.get("stability") or 0.0)
    if s < _STABILITY_SHORT:
        return "short"
    elif s < _STABILITY_MEDIUM:
        return "medium"
    return "long"


def _sync_sm2_from_fsrs(sm2: dict, fsrs_state: dict, rating: int, now: dt.datetime) -> dict:
    """
    FSRS 결과를 SM2 블록에 동기화 (호환 기간 임시 방편).

    규칙:
      rating 1 (Again/오답):
        repetition=0, interval=1, ef=max(ef-0.15, 1.3),
        nextReview=today+1, lastStudyDate=now
      rating >= 2 (정답):
        repetition+=1, interval=round(stability),
        ef = clip(ef + 0.05*(rating==3) + 0.10*(rating==4), 1.3, 2.6)
        nextReview=fsrs.next_review, lastStudyDate=now

    SM2 블록이 없으면 기본값으로 초기화하고 갱신.
    """
    from app.services.fsrs.core import AGAIN, EASY

    today_str = now.date().isoformat()
    now_str = now.isoformat()

    ef = float(sm2.get("ef") or 2.5)
    repetition = int(sm2.get("repetition") or 0)

    if rating == AGAIN:
        new_ef = max(ef - 0.15, 1.3)
        next_review = (now + dt.timedelta(days=1)).date().isoformat()
        return {
            "ef": round(new_ef, 4),
            "repetition": 0,
            "interval": 1,
            "nextReview": next_review,
            "lastStudyDate": today_str,
            "beforeScheduleCount": int(sm2.get("beforeScheduleCount") or 0),
        }
    else:
        # 정답
        if rating == EASY:
            ef_delta = 0.10
        elif rating == 3:
            ef_delta = 0.05
        else:
            # HARD
            ef_delta = 0.0

        new_ef = max(1.3, min(2.6, ef + ef_delta))
        new_interval = max(1, round(float(fsrs_state.get("stability") or 1.0)))
        new_rep = repetition + 1

        # next_review: FSRS 결과 사용
        next_review_iso = fsrs_state.get("next_review")
        if next_review_iso:
            try:
                nr = dt.datetime.fromisoformat(str(next_review_iso).replace("Z", "+00:00"))
                next_review = nr.date().isoformat()
            except (ValueError, AttributeError):
                next_review = (now + dt.timedelta(days=new_interval)).date().isoformat()
        else:
            next_review = (now + dt.timedelta(days=new_interval)).date().isoformat()

        return {
            "ef": round(new_ef, 4),
            "repetition": new_rep,
            "interval": new_interval,
            "nextReview": next_review,
            "lastStudyDate": today_str,
            "beforeScheduleCount": int(sm2.get("beforeScheduleCount") or 0),
        }


# ──────────────────────────────────────────────
# 디버그용 엔드포인트 (Phase 1.1에서 신설, 유지)
# ──────────────────────────────────────────────

@study_bp.route('/sessions/recent', methods=['GET'])
@jwt_required
def get_recent_sessions():
    """디버그용: 본인 세션 최신순 반환."""
    user_id = UUID(g.user_id)
    limit = _clamp_limit(request.args.get('limit', 20))

    sessions = (
        UserStudySession.query
        .filter_by(user_id=user_id)
        .order_by(UserStudySession.started_at.desc())
        .limit(limit)
        .all()
    )

    data = [
        {
            'id':             str(s.id),
            'test_type':      s.test_type,
            'book_ids':       s.book_ids,
            'question_count': s.question_count,
            'correct_count':  s.correct_count,
            'started_at':     s.started_at.isoformat() if s.started_at else None,
            'finished_at':    s.finished_at.isoformat() if s.finished_at else None,
        }
        for s in sessions
    ]

    return jsonify({'code': 200, 'data': data}), 200


@study_bp.route('/logs', methods=['GET'])
@jwt_required
def get_logs():
    """디버그용: 본인 학습 로그 최신순 반환."""
    user_id = UUID(g.user_id)
    limit = _clamp_limit(request.args.get('limit', 200))

    logs = (
        UserStudyLog.query
        .filter_by(user_id=user_id)
        .order_by(UserStudyLog.created_at.desc())
        .limit(limit)
        .all()
    )

    data = [
        {
            'id':               l.id,
            'user_voca_id':     l.user_voca_id,
            'voca_id':          l.voca_id,
            'user_voca_book_id': str(l.user_voca_book_id) if l.user_voca_book_id else None,
            'session_id':       str(l.session_id) if l.session_id else None,
            'test_type':        l.test_type,
            'question_type':    l.question_type,
            'was_correct':      l.was_correct,
            'q_score':          l.q_score,
            'rating':           l.rating,
            'time_taken_ms':    l.time_taken_ms,
            'word_length':      l.word_length,
            'created_at':       l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]

    return jsonify({'code': 200, 'data': data}), 200


# ──────────────────────────────────────────────
# Phase 1.2 신규 엔드포인트
# ──────────────────────────────────────────────

@study_bp.route('/sessions', methods=['POST'])
@jwt_required
def create_session():
    """
    학습 세션 시작.

    요청:
      { "test_type": "test|exam|today|quick", "book_ids": ["uuid", ...] }

    응답:
      { "code": 201, "data": { "session_id": "<uuid>" } }
    """
    user_id = UUID(g.user_id)
    req = request.get_json(silent=True) or {}

    test_type = req.get('test_type', 'test')
    if test_type not in ('test', 'exam', 'today', 'quick'):
        test_type = 'test'

    book_ids = req.get('book_ids')
    book_ids_json = json.dumps(book_ids, ensure_ascii=False) if book_ids else None

    session = UserStudySession(
        user_id=user_id,
        test_type=test_type,
        book_ids=book_ids_json,
    )
    try:
        db.session.add(session)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'세션 생성 실패: {str(e)}'}), 500

    return jsonify({'code': 201, 'data': {'session_id': str(session.id)}}), 201


@study_bp.route('/log', methods=['POST'])
@jwt_required
def post_study_log():
    """
    단어 1회 학습 결과 기록 + FSRS 상태 갱신.

    요청:
      {
        "session_id":       "<uuid>",
        "user_voca_id":     12345,
        "user_voca_book_id": "<uuid>",   // optional
        "question_type":    "multipleChoice",
        "was_correct":      true,
        "time_taken_ms":    7800,
        "client_now":       "2026-05-07T11:23:01Z"  // optional
      }

    응답:
      {
        "code": 200,
        "data": {
          "rating": 3,
          "fsrs": { ... },
          "memory_state_change": { "from": "short", "to": "medium" }
        }
      }
    """
    from app.services.fsrs.state import (
        parse_user_voca_data, serialize_user_voca_data,
        get_fsrs_state, get_sm2_state,
        set_fsrs_state, set_sm2_state,
        migrate_v1_to_v2, is_v1, DEFAULT_SM2,
    )
    from app.services.fsrs.scheduler import review as fsrs_review
    from app.services.fsrs.ratings import derive_rating, rating_to_q_score

    user_id = UUID(g.user_id)
    req = request.get_json(silent=True) or {}

    # ── 필수 파라미터 검증 ──
    session_id_str  = req.get('session_id')
    user_voca_id    = req.get('user_voca_id')
    question_type   = req.get('question_type', 'multipleChoice')
    was_correct     = req.get('was_correct')
    time_taken_ms   = req.get('time_taken_ms', 0)

    if not session_id_str or user_voca_id is None or was_correct is None:
        return jsonify({'code': 400, 'message': 'session_id, user_voca_id, was_correct는 필수입니다.'}), 400

    try:
        session_uuid = UUID(session_id_str)
    except (ValueError, AttributeError):
        return jsonify({'code': 400, 'message': '유효하지 않은 session_id 형식입니다.'}), 400

    # optional
    user_voca_book_id_str = req.get('user_voca_book_id')
    user_voca_book_uuid: UUID = None
    if user_voca_book_id_str:
        try:
            user_voca_book_uuid = UUID(user_voca_book_id_str)
        except (ValueError, AttributeError):
            pass

    # client_now 파싱 (없으면 서버 utcnow)
    client_now_str = req.get('client_now')
    if client_now_str:
        try:
            now = dt.datetime.fromisoformat(str(client_now_str).replace("Z", "+00:00"))
            now = now.replace(tzinfo=None)
        except (ValueError, AttributeError):
            now = dt.datetime.utcnow()
    else:
        now = dt.datetime.utcnow()

    # ── 권한 검증 ──
    session_obj = UserStudySession.query.filter_by(
        id=session_uuid, user_id=user_id
    ).first()
    if not session_obj:
        return jsonify({'code': 403, 'message': '세션 접근 권한이 없습니다.'}), 403

    # ── UserVoca SELECT FOR UPDATE (row 락) ──
    user_voca = (
        db.session.query(UserVoca)
        .filter(UserVoca.id == user_voca_id, UserVoca.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not user_voca:
        return jsonify({'code': 403, 'message': '단어 접근 권한이 없습니다.'}), 403

    # ── FSRS state 로드 ──
    payload = parse_user_voca_data(user_voca.data)

    # v1이면 즉석에서 v2로 마이그레이션 (FSRS state 초기화)
    if is_v1(payload):
        payload = migrate_v1_to_v2(payload)

    fsrs_state_before = get_fsrs_state(payload) or {}
    sm2_state         = get_sm2_state(payload) or dict(DEFAULT_SM2)

    memory_state_before = _classify_memory_state(fsrs_state_before)

    # ── lapse_history / prior_correct_rate 조회 (Phase 2.3, 1쿼리로 묶음) ──
    word_length      = len(user_voca.word) if user_voca.word else None
    fsrs_difficulty  = fsrs_state_before.get('difficulty') if fsrs_state_before else None

    lapse_history: list = []
    prior_correct_rate = None
    try:
        recent_logs_raw = (
            UserStudyLog.query
            .filter_by(user_voca_id=user_voca_id, user_id=user_id)
            .order_by(UserStudyLog.created_at.desc())
            .limit(5)
            .all()
        )
        if recent_logs_raw:
            # 직전 로그의 lapse 여부 (lapse_history[0] = 직전 rating==1 여부)
            lapse_history = [bool(log.rating == 1) for log in recent_logs_raw]
            # 최근 5개 정답률
            correct_cnt = sum(1 for log in recent_logs_raw if log.was_correct)
            prior_correct_rate = correct_cnt / len(recent_logs_raw)
    except Exception:
        pass  # 조회 실패 시 폴백 (소프트 lapse 미적용)

    # ── FSRS 계산 ──
    rating = derive_rating(
        bool(was_correct),
        int(time_taken_ms),
        word_length=word_length,
        fsrs_difficulty=float(fsrs_difficulty) if fsrs_difficulty is not None else None,
    )
    fsrs_state_after = fsrs_review(
        fsrs_state_before,
        rating,
        now,
        lapse_history=lapse_history,
        prior_correct_rate=prior_correct_rate,
    )

    memory_state_after = _classify_memory_state(fsrs_state_after)

    # ── SM2 동기화 (호환 기간) ──
    sm2_state_after = _sync_sm2_from_fsrs(sm2_state, fsrs_state_after, rating, now)

    # ── payload 업데이트 ──
    payload = set_fsrs_state(payload, fsrs_state_after)
    payload = set_sm2_state(payload, sm2_state_after)

    user_voca.data       = serialize_user_voca_data(payload)
    user_voca.updated_at = dt.datetime.utcnow()

    # ── UserStudyLog INSERT ──
    q_score = rating_to_q_score(rating)

    log = UserStudyLog(
        user_id=user_id,
        user_voca_id=user_voca_id,
        session_id=session_uuid,
        test_type=session_obj.test_type,
        question_type=question_type,
        was_correct=bool(was_correct),
        q_score=q_score,
        time_taken_ms=int(time_taken_ms),
        voca_id=user_voca.voca_id,
        user_voca_book_id=user_voca_book_uuid,
        rating=rating,
        word_length=word_length,
        state_before=json.dumps(fsrs_state_before, ensure_ascii=False) if fsrs_state_before else None,
        state_after=json.dumps(fsrs_state_after, ensure_ascii=False),
    )
    db.session.add(log)

    # ── 세션 카운터 업데이트 ──
    session_obj.question_count = (session_obj.question_count or 0) + 1
    if bool(was_correct):
        session_obj.correct_count = (session_obj.correct_count or 0) + 1

    # ── UserQuestionTypeStat UPSERT (Phase 2.1) ──
    stat = (
        db.session.query(UserQuestionTypeStat)
        .filter_by(user_id=user_id, question_type=question_type)
        .with_for_update()
        .first()
    )
    if stat is None:
        stat = UserQuestionTypeStat(
            user_id=user_id,
            question_type=question_type,
            total_count=1,
            correct_count=1 if bool(was_correct) else 0,
            avg_time_taken_ms=int(time_taken_ms),
            last_30d_correct_rate=None,
        )
        db.session.add(stat)
    else:
        stat.total_count += 1
        if bool(was_correct):
            stat.correct_count += 1
        stat.avg_time_taken_ms = round(0.9 * stat.avg_time_taken_ms + 0.1 * int(time_taken_ms))
        stat.updated_at = dt.datetime.utcnow()

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'학습 로그 저장 실패: {str(e)}'}), 500

    # 학습 완료 후 recommend pool 캐시 무효화 (stale 방지)
    try:
        from app.services.recommend.pool import invalidate_pool_cache
        invalidate_pool_cache(user_id)
    except Exception:
        pass  # 캐시 무효화 실패는 비치명적

    return jsonify({
        'code': 200,
        'data': {
            'rating': rating,
            'fsrs': fsrs_state_after,
            'memory_state_change': {
                'from': memory_state_before,
                'to':   memory_state_after,
            },
        },
    }), 200


@study_bp.route('/me/weakness', methods=['GET'])
@jwt_required
def get_weakness():
    """
    GET /study/me/weakness — 문제 유형별 약점 조회 (Phase 2.1).

    쿼리 파라미터:
      limit : 약점 상위 N개 (기본 5, max 10)

    응답:
      {
        "code": 200,
        "data": {
          "weakness": [
            { "question_type": "multipleChoiceListening", "correct_rate": 0.42, "samples": 87 }
          ],
          "all": [
            { "question_type": "multipleChoice", "correct_rate": 0.81, "samples": 200,
              "avg_time_taken_ms": 6420, "last_30d_correct_rate": 0.78 }
          ]
        }
      }
    """
    user_id = UUID(g.user_id)

    try:
        limit = int(request.args.get('limit', 5))
    except (TypeError, ValueError):
        limit = 5
    limit = max(1, min(limit, 10))

    _MIN_SAMPLES = 10  # 샘플 부족 row 제외 임계값

    stats = (
        UserQuestionTypeStat.query
        .filter_by(user_id=user_id)
        .all()
    )

    all_list = []
    for s in stats:
        correct_rate = (s.correct_count / s.total_count) if s.total_count > 0 else 0.0
        all_list.append({
            'question_type':        s.question_type,
            'correct_rate':         round(correct_rate, 4),
            'samples':              s.total_count,
            'avg_time_taken_ms':    s.avg_time_taken_ms,
            'last_30d_correct_rate': s.last_30d_correct_rate,
        })

    # 약점: 샘플 충분한 것만, 정답률 오름차순
    weakness_candidates = [
        {'question_type': x['question_type'], 'correct_rate': x['correct_rate'], 'samples': x['samples']}
        for x in all_list
        if x['samples'] >= _MIN_SAMPLES
    ]
    weakness_candidates.sort(key=lambda x: x['correct_rate'])
    weakness = weakness_candidates[:limit]

    return jsonify({'code': 200, 'data': {'weakness': weakness, 'all': all_list}}), 200


def _fetch_user_stats(user_id: UUID) -> dict:
    """
    Phase 2.2: 추천에 필요한 사용자 통계를 1쿼리로 묶어 조회.

    Returns:
        {
          "recent_7d_correct_rate": float | None,
          "recent_7d_total": int,
          "weakness_types": [...],
          "today_seen": {user_voca_id(int): [question_type, ...]},
        }
    """
    # 오늘 00:00 KST = UTC 기준 전날 15:00 (KST = UTC+9)
    utc_now = dt.datetime.utcnow()
    # KST 오늘 자정 = UTC 어제 15:00
    kst_today_midnight_utc = dt.datetime(
        utc_now.year, utc_now.month, utc_now.day,
        0, 0, 0
    ) - dt.timedelta(hours=9)

    seven_days_ago = utc_now - dt.timedelta(days=7)

    # 7일 로그 + 오늘 로그를 한 번에 가져옴 (N+1 없음)
    # 오늘 로그는 7일 로그의 부분집합이므로 1회 쿼리로 커버
    recent_logs = (
        db.session.query(
            UserStudyLog.user_voca_id,
            UserStudyLog.question_type,
            UserStudyLog.was_correct,
            UserStudyLog.created_at,
        )
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.created_at >= seven_days_ago,
        )
        .all()
    )

    # 7일 정답률 계산
    total_7d = len(recent_logs)
    correct_7d = sum(1 for r in recent_logs if r.was_correct)
    recent_7d_correct_rate = (correct_7d / total_7d) if total_7d > 0 else None

    # 오늘 본 단어/유형 집계
    today_seen: dict = {}
    for r in recent_logs:
        if r.created_at >= kst_today_midnight_utc:
            vid = r.user_voca_id
            if vid not in today_seen:
                today_seen[vid] = []
            if r.question_type and r.question_type not in today_seen[vid]:
                today_seen[vid].append(r.question_type)

    # 약점 유형 조회 (UserQuestionTypeStat)
    stats = (
        UserQuestionTypeStat.query
        .filter_by(user_id=user_id)
        .all()
    )
    weakness_types = []
    for s in stats:
        if s.total_count >= 10:
            rate = s.correct_count / s.total_count
            if rate < 0.6:
                weakness_types.append({
                    'question_type': s.question_type,
                    'correct_rate': round(rate, 4),
                    'samples': s.total_count,
                })
    # 정답률 오름차순 정렬
    weakness_types.sort(key=lambda x: x['correct_rate'])

    return {
        'recent_7d_correct_rate': recent_7d_correct_rate,
        'recent_7d_total': total_7d,
        'weakness_types': weakness_types,
        'today_seen': today_seen,
    }


@study_bp.route('/recommend', methods=['GET'])
@jwt_required
def get_recommend():
    """
    GET /study/recommend — 단어 추천 (세션 구성, Phase 2.2).

    쿼리 파라미터:
      type        : daily|test|exam|quick  (default: daily)
      count       : 1~50                  (default: 20)
      book_ids    : 콤마 구분 UUID or 'all' (default: all)
      target_states: 콤마 구분 (unlearned,short,medium,long,all) — test/exam에서 pool 필터
      selection   : recommended|random     (default: recommended, 호환용)

    응답:
      {
        "code": 200,
        "data": {
          "session_id": "<uuid>",
          "composition": {"overdue": 8, "today": 5, "new": 4, "long": 3},
          "composition_strategy": {
            "base": "daily",
            "dynamic_adjustment": "high_accuracy",
            "weakness_types": ["multipleChoiceListening"]
          },
          "items": [
            {
              "user_voca_id": 12345,
              "user_voca_book_id": "<uuid>",
              "word": "elaborate",
              "meanings": [...],
              "examples": [...],
              "fsrs": { "state":"review", ... },
              "priority_bucket": "overdue",
              "suggested_question_type": "multipleChoiceListening",
              "reason": "복습 시점이 지났어요"
            }
          ]
        }
      }
    """
    from app.services.recommend.pool import build_candidate_pool
    from app.services.recommend.composer import compose

    user_id = UUID(g.user_id)

    # ── 쿼리 파라미터 파싱 ──
    type_ = request.args.get('type', 'daily').lower()
    if type_ not in ('daily', 'today', 'test', 'exam', 'quick'):
        type_ = 'daily'

    try:
        count = int(request.args.get('count', 20))
    except (TypeError, ValueError):
        count = 20
    count = max(1, min(count, 50))

    book_ids_raw = request.args.get('book_ids', 'all')
    if book_ids_raw.lower() == 'all' or not book_ids_raw:
        book_ids = None
    else:
        book_ids = [b.strip() for b in book_ids_raw.split(',') if b.strip()]
        if not book_ids:
            book_ids = None

    target_states_raw = request.args.get('target_states', 'all')
    target_states = [s.strip() for s in target_states_raw.split(',') if s.strip()]
    if 'all' in target_states:
        target_states = None

    selection = request.args.get('selection', 'recommended').lower()

    # ── Phase 2.2: 사용자 통계 조회 (1쿼리로 묶음) ──
    try:
        user_stats = _fetch_user_stats(user_id)
    except Exception:
        # 통계 조회 실패해도 추천은 계속 (기본 동작으로 폴백)
        user_stats = None

    # ── 후보 풀 빌드 ──
    try:
        pool = build_candidate_pool(user_id, book_ids)
    except Exception as e:
        return jsonify({'code': 500, 'message': f'후보 풀 빌드 실패: {str(e)}'}), 500

    # ── target_states 필터 (test/exam에서 사용) ──
    if target_states and type_ in ('test', 'exam'):
        _state_bucket_map = {
            'unlearned': {'new'},
            'short':     {'short'},
            'medium':    {'medium'},
            'long':      {'long'},
        }
        allowed_buckets = set()
        for state in target_states:
            allowed_buckets.update(_state_bucket_map.get(state, set()))
        if allowed_buckets:
            pool = [it for it in pool if it.bucket in allowed_buckets]

    # ── selection=random: 풀 자체를 랜덤 셔플 후 composer로 전달 ──
    if selection == 'random':
        import random as _random
        pool = list(pool)
        _random.shuffle(pool)

    # ── 세션 구성 (Phase 2.2: user_stats 전달) ──
    result = compose(pool, count, type_, user_stats=user_stats)
    composition: dict = result['composition']
    composition_strategy: dict = result['composition_strategy']
    enriched_items: list = result['enriched_items']

    # ── UserStudySession INSERT ──
    book_ids_for_session = (
        [str(b) for b in book_ids] if book_ids else ['all']
    )
    session_obj = UserStudySession(
        user_id=user_id,
        test_type=type_,
        book_ids=json.dumps(book_ids_for_session, ensure_ascii=False),
        question_count=0,
        correct_count=0,
    )
    try:
        db.session.add(session_obj)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'세션 생성 실패: {str(e)}'}), 500

    # ── 응답 구성 ──
    items_response = []
    for enriched in enriched_items:
        item = enriched['_item']
        fsrs = item.fsrs_state or {}
        items_response.append({
            'user_voca_id':            item.user_voca_id,
            'user_voca_book_id':       str(item.user_voca_book_id) if item.user_voca_book_id else None,
            'word':                    item.word,
            'meanings':                item.meanings,
            'examples':                item.examples,
            'fsrs': {
                'state':          fsrs.get('state', 'new'),
                'stability':      fsrs.get('stability', 0.0),
                'difficulty':     fsrs.get('difficulty', 0.0),
                'retrievability': fsrs.get('retrievability', 0.0),
                'next_review':    fsrs.get('next_review'),
            },
            'priority_bucket':         item.bucket,
            'suggested_question_type': enriched['suggested_question_type'],
            'reason':                  enriched['reason'],
        })

    return jsonify({
        'code': 200,
        'data': {
            'session_id':           str(session_obj.id),
            'composition':          composition,
            'composition_strategy': composition_strategy,
            'items':                items_response,
        },
    }), 200


@study_bp.route('/sessions/<session_id>/finish', methods=['POST'])
@jwt_required
def finish_session(session_id):
    """
    학습 세션 종료. finished_at 기록 + 요약 통계 반환.

    응답:
      {
        "code": 200,
        "data": {
          "session_id":     "<uuid>",
          "question_count": 20,
          "correct_count":  17,
          "duration_sec":   372
        }
      }
    """
    user_id = UUID(g.user_id)

    try:
        session_uuid = UUID(session_id)
    except (ValueError, AttributeError):
        return jsonify({'code': 400, 'message': '유효하지 않은 session_id 형식입니다.'}), 400

    session_obj = UserStudySession.query.filter_by(
        id=session_uuid, user_id=user_id
    ).first()
    if not session_obj:
        return jsonify({'code': 403, 'message': '세션 접근 권한이 없습니다.'}), 403

    if session_obj.finished_at:
        # 이미 종료된 세션 — 통계만 반환
        duration_sec = int(
            (session_obj.finished_at - session_obj.started_at).total_seconds()
        ) if session_obj.started_at else 0
        return jsonify({
            'code': 200,
            'data': {
                'session_id':     str(session_obj.id),
                'question_count': session_obj.question_count,
                'correct_count':  session_obj.correct_count,
                'duration_sec':   duration_sec,
            },
        }), 200

    finished_at = dt.datetime.utcnow()
    session_obj.finished_at = finished_at

    duration_sec = int(
        (finished_at - session_obj.started_at).total_seconds()
    ) if session_obj.started_at else 0

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'세션 종료 실패: {str(e)}'}), 500

    return jsonify({
        'code': 200,
        'data': {
            'session_id':     str(session_obj.id),
            'question_count': session_obj.question_count,
            'correct_count':  session_obj.correct_count,
            'duration_sec':   duration_sec,
        },
    }), 200
