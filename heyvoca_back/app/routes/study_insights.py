import json
import logging
from datetime import datetime
from uuid import UUID

from flask import Blueprint, jsonify, g, request

from app import db
from app.models.models import UserStudyLog, UserVoca, UserVocaGame, VisualStage
from app.services.game.farm_v2 import growth as farm_growth
from app.services.game.farm_v2 import xp as farm_xp
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

    # 표시 XP 는 암기 상태(unlearned/short/medium/long)가 아니라 **농장 성장 단계**
    # (game.visual_stage) 기준이다 — 단계는 안 내려가지만 암기 상태는 stability 가
    # 떨어지면 그대로 낮아져서, 여기서 재도출하면 단어장/밭 화면과 어긋난다(xp.py 참고).
    game = UserVocaGame.query.filter_by(user_voca_id=user_voca_id, user_id=user_id).first()
    visual_stage = (game.visual_stage if game else None) or VisualStage.UNPLANTED_SEED

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
            'xp': farm_xp.xp_of(visual_stage, fsrs),
            'xp_next': farm_xp.xp_next(visual_stage),
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
            # 표시 XP 승급 시뮬레이션 — game.visual_stage 축으로, growth.next_stage 를
            # 그대로 재사용한다(예정 복습을 독립 정답으로 맞힌 경우와 같은 조건).
            proj_visual_stage = farm_growth.next_stage(
                game, proj, sim_now, None, True, True) if game else None
            if proj_visual_stage is None:
                proj_visual_stage = visual_stage
            next_stage['on_correct'] = {
                'state': proj_state,
                'progress': round(proj_progress, 4),
                'gain': round(max(0.0, proj_progress - cur_progress), 4),
                'promotes': _STATE_RANK.get(proj_state, 0) > _STATE_RANK.get(state, 0),
                'xp_gain': max(0, farm_xp.xp_of(proj_visual_stage, proj) - next_stage['xp']),
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
        "promoted": [{"user_voca_id","word","meaning","from","to","stage"}, ...],  # 기존 단어 승급
        "new":      [{"user_voca_id","word","meaning","from","to","stage"}, ...],  # 오늘 첫 학습 진입
        "counts":   {"promoted": n, "new": n, "by_state": {"short":n,"medium":n,"long":n}}
      }

    `stage` 는 농장의 실제 visual_stage 리터럴(예 PLANTED_SEED/SPROUT)이다. FSRS 구간
    (unlearned/short/...)만으로 화면이 작물을 근사하면, 심은 씨앗도 아직 안 심은 봉투로
    잘못 그려지는 문제가 있었다(session-summary의 word_stages와 같은 이유).
    """
    from app.services.study_day import logical_day_start_utc
    # 대표 뜻 추출과 stage 조회는 farm_v2.query 의 구현을 재사용한다(문자열/딕셔너리 배열
    # 두 형태 처리, 게임 행 없으면 UNPLANTED_SEED). 상단 import 로 올리지 않는 이유는
    # 다른 서비스 모듈 순환 참조를 피하기 위해서다.
    from app.services.game.farm_v2.query import _first_meaning, _session_word_stages

    from app.utils.dict_lang import get_dict_lang
    from app.services.ja_fields import load_ja_word_info

    user_id = UUID(g.user_id)
    day_start_utc = logical_day_start_utc()
    lang = get_dict_lang()

    rows = (
        db.session.query(
            UserStudyLog.user_voca_id,
            UserStudyLog.state_before,
            UserStudyLog.state_after,
            UserStudyLog.created_at,
        )
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.dict_lang == lang,   # 현재 학습 언어의 변화만
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
    voca_ids = {}
    stage_map = {}
    if changed_ids:
        for uv_id, word, meanings, voca_id in (
            db.session.query(UserVoca.id, UserVoca.word, UserVoca.voca_meanings, UserVoca.voca_id)
            .filter(UserVoca.user_id == user_id, UserVoca.id.in_(changed_ids))
            .all()
        ):
            words[uv_id] = (word or '', _first_meaning(meanings))
            voca_ids[uv_id] = voca_id
        # IN 절 1회 — 단어 수만큼 왕복하지 않는다. 조회 실패해도 목록 자체는 내려줘야
        # 하므로 stage 만 빈 값으로 방어한다(session-summary의 word_stages 방어와 동일 패턴).
        try:
            stage_map = _session_word_stages(changed_ids)
        except Exception:
            db.session.rollback()
            stage_map = {}

    ja_info = load_ja_word_info(voca_ids.values()) if lang == 'ja' else {}

    promoted, new_words = [], []
    by_state = {}
    for vid in changed_ids:
        st = day_states[vid]
        word, meaning = words.get(vid) or ('', '')
        entry = {
            'user_voca_id': vid,
            'word': word,
            'meaning': meaning,
            'from': st['from'],
            'to': st['to'],
            'stage': stage_map.get(vid, VisualStage.UNPLANTED_SEED),
            'language': lang,
        }
        if lang == 'ja':
            entry['reading'] = (ja_info.get(voca_ids.get(vid)) or {}).get('reading')
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
