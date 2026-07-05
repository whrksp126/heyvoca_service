import json
import logging
from datetime import datetime
from uuid import UUID

from flask import Blueprint, jsonify, g, request

from app import db
from app.models.models import UserStudyLog, UserVoca
from app.utils.jwt_utils import jwt_required
# 분류 기준은 study.py 단일 소스를 import (중복 정의 금지 — 임계값 변경 시 자동 추종)
from app.routes.study import _classify_memory_state, _STABILITY_SHORT, _STABILITY_MEDIUM

insights_bp = Blueprint('insights', __name__, url_prefix='/insights')

_STATE_RANK = {'unlearned': 0, 'short': 1, 'medium': 2, 'long': 3}
_TIMELINE_LIMIT = 50


def _classify_json(raw):
    """UserStudyLog.state_before/after(TEXT JSON) → memory state 키."""
    if not raw:
        return 'unlearned'
    try:
        return _classify_memory_state(json.loads(raw))
    except Exception:
        return 'unlearned'


def _timeline_entry(log):
    """UserStudyLog → 학습 타임라인 항목 dict."""
    from_key = _classify_json(log.state_before)
    to_key = _classify_json(log.state_after)
    return {
        'created_at': log.created_at.isoformat() if log.created_at else None,
        'test_type': log.test_type,
        'question_type': log.question_type,
        'was_correct': bool(log.was_correct),
        'state': to_key,  # 채점 직후 암기 상태
        'state_change': {'from': from_key, 'to': to_key} if from_key != to_key else None,
    }


@insights_bp.route('/word/<int:user_voca_id>', methods=['GET'])
@jwt_required
def word_insights(user_voca_id):
    """단어 상세 '나의 기억' 섹션 — 현재 상태 + 최근 결과 + 승급 진행 + 학습 타임라인.

    응답 data:
      {
        "memory":  {"state": "medium", "stability": 34.2, "next_review": "...", "reps": 7},
        "recent_results": [true, false, ...],   # 최신순 최대 5개
        "streak": 2,                            # 최근 연속 정답 수
        "next_stage": {"state": "long", "threshold_days": 60.0, "progress": 0.57,
                        "on_correct": {"state","progress","gain","promotes"}} | null,
        "timeline": [{"created_at","test_type","question_type","was_correct","state",
                      "state_change": {"from","to"} | null}, ...],  # 최신순, 최대 50개
        "total_count": 12
      }
    """
    user_id = UUID(g.user_id)

    uv = UserVoca.query.filter_by(id=user_voca_id, user_id=user_id).first()
    if not uv:
        return jsonify({'code': 404, 'message': '단어를 찾을 수 없습니다.'}), 404

    try:
        fsrs = (json.loads(uv.data) if uv.data else {}).get('fsrs') or {}
    except Exception:
        fsrs = {}

    state = _classify_memory_state(fsrs)
    stability = float(fsrs.get('stability') or 0.0)

    # 다음 단계 진행률 — long이면 최고 단계라 null
    next_stage = None
    if state != 'long':
        if state in ('unlearned', 'short'):
            target_state, threshold = 'medium', _STABILITY_SHORT
        else:
            target_state, threshold = 'long', _STABILITY_MEDIUM
        # unlearned의 목표는 우선 단기 진입(short) — 임계값은 short 상한과 동일
        if state == 'unlearned':
            target_state = 'short'
        cur_progress = min(1.0, stability / threshold) if threshold else 0.0
        next_stage = {
            'state': target_state,
            'threshold_days': threshold,
            'progress': cur_progress,
        }
        # 다음 복습에서 맞혔을 때(GOOD) 예측 — 진행률 증가분 / 승급 여부
        try:
            from app.services.fsrs.scheduler import review as fsrs_review
            from app.services.fsrs.core import GOOD
            # 예정된 다음 복습 시각 기준으로 정답 시뮬레이션 (없으면 now)
            sim_now = datetime.utcnow()
            nr = fsrs.get('next_review')
            if nr:
                try:
                    sim_now = datetime.fromisoformat(str(nr).replace('Z', ''))
                except ValueError:
                    pass
            proj = fsrs_review(fsrs, GOOD, sim_now)
            proj_stability = float(proj.get('stability') or 0.0)
            proj_state = _classify_memory_state(proj)
            proj_progress = min(1.0, proj_stability / threshold) if threshold else 0.0
            next_stage['on_correct'] = {
                'state': proj_state,
                'progress': round(proj_progress, 4),
                'gain': round(max(0.0, proj_progress - cur_progress), 4),
                'promotes': _STATE_RANK.get(proj_state, 0) > _STATE_RANK.get(state, 0),
            }
        except Exception:
            pass  # 예측 실패는 무시 (프론트가 없으면 미표시)

    logs = (
        UserStudyLog.query
        .filter_by(user_id=user_id, user_voca_id=user_voca_id)
        .order_by(UserStudyLog.created_at.desc())
        .limit(_TIMELINE_LIMIT)
        .all()
    )
    total_count = (
        db.session.query(db.func.count(UserStudyLog.id))
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.user_voca_id == user_voca_id,
        )
        .scalar()
    ) or 0

    timeline = [_timeline_entry(log) for log in logs]

    recent_results = [bool(log.was_correct) for log in logs[:5]]
    streak = 0
    for log in logs:
        if not log.was_correct:
            break
        streak += 1

    return jsonify({
        'code': 200,
        'data': {
            'memory': {
                'state': state,
                'stability': round(stability, 1),
                'next_review': fsrs.get('next_review'),
                'reps': fsrs.get('reps') or 0,
            },
            'recent_results': recent_results,
            'streak': streak,
            'next_stage': next_stage,
            'timeline': timeline,
            'total_count': int(total_count),
        },
    }), 200


@insights_bp.route('/word/<int:user_voca_id>/timeline', methods=['GET'])
@jwt_required
def word_timeline(user_voca_id):
    """학습 타임라인 페이지네이션 — 최신순, cursor(before) 기반 무한 스크롤용.

    query: before=<ISO created_at>(옵션, 이 시각 이전 기록만), limit=<1~50, 기본 20>
    응답 data: { "timeline": [...], "has_more": bool, "next_before": <ISO>|null }
    """
    user_id = UUID(g.user_id)

    uv = UserVoca.query.filter_by(id=user_voca_id, user_id=user_id).first()
    if not uv:
        return jsonify({'code': 404, 'message': '단어를 찾을 수 없습니다.'}), 404

    try:
        limit = min(max(int(request.args.get('limit', 20)), 1), _TIMELINE_LIMIT)
    except (TypeError, ValueError):
        limit = 20

    q = UserStudyLog.query.filter_by(user_id=user_id, user_voca_id=user_voca_id)
    before = request.args.get('before')
    if before:
        try:
            bdt = datetime.fromisoformat(before.replace('Z', ''))
            q = q.filter(UserStudyLog.created_at < bdt)
        except ValueError:
            pass

    # has_more 판정을 위해 limit+1개 조회
    rows = q.order_by(UserStudyLog.created_at.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    timeline = [_timeline_entry(log) for log in rows]
    next_before = rows[-1].created_at.isoformat() if rows else None

    return jsonify({
        'code': 200,
        'data': {'timeline': timeline, 'has_more': has_more, 'next_before': next_before},
    }), 200


@insights_bp.route('/today-changes', methods=['GET'])
@jwt_required
def today_changes():
    """홈 '오늘의 기억 변화' 위젯 — 오늘(logical day) 승급/신규 단어 집계.

    단어별로 오늘 첫 로그의 state_before → 마지막 로그의 state_after를 비교해
    하루 단위 순변화만 계산한다 (세션 내 오르내림은 상쇄).

    응답 data:
      {
        "promoted": [{"user_voca_id","word","from","to"}, ...],  # 기존 단어 승급
        "new":      [{"user_voca_id","word","from","to"}, ...],  # 오늘 첫 학습 진입
        "counts":   {"promoted": n, "new": n, "by_state": {"short":n,"medium":n,"long":n}}
      }
    """
    from app.services.study_day import logical_day_start_utc

    user_id = UUID(g.user_id)
    day_start_utc = logical_day_start_utc()

    rows = (
        db.session.query(
            UserStudyLog.user_voca_id,
            UserStudyLog.state_before,
            UserStudyLog.state_after,
            UserStudyLog.created_at,
        )
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.created_at >= day_start_utc,
        )
        .order_by(UserStudyLog.created_at.asc())
        .all()
    )

    # user_voca_id별 오늘 첫 before / 마지막 after
    day_states = {}
    for vid, before, after, _ in rows:
        if vid is None:
            continue
        if vid not in day_states:
            day_states[vid] = {'from': _classify_json(before)}
        day_states[vid]['to'] = _classify_json(after)

    changed_ids = [
        vid for vid, st in day_states.items()
        if _STATE_RANK.get(st['to'], 0) > _STATE_RANK.get(st['from'], 0)
    ]

    words = {}
    if changed_ids:
        for uv_id, word in (
            db.session.query(UserVoca.id, UserVoca.word)
            .filter(UserVoca.user_id == user_id, UserVoca.id.in_(changed_ids))
            .all()
        ):
            words[uv_id] = word

    promoted, new_words = [], []
    by_state = {}
    for vid in changed_ids:
        st = day_states[vid]
        entry = {
            'user_voca_id': vid,
            'word': words.get(vid) or '',
            'from': st['from'],
            'to': st['to'],
        }
        if st['from'] == 'unlearned':
            new_words.append(entry)
        else:
            promoted.append(entry)
        by_state[st['to']] = by_state.get(st['to'], 0) + 1

    return jsonify({
        'code': 200,
        'data': {
            'promoted': promoted,
            'new': new_words,
            'counts': {
                'promoted': len(promoted),
                'new': len(new_words),
                'by_state': by_state,
            },
        },
    }), 200
