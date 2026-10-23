"""학습 중 데이터 오류 신고 (2026-10).

클라이언트
  POST /report                     — 신고 1건 생성 (@jwt_required)

어드민 (admin_bp, X-Admin-API-Key)
  GET   /admin/reports             — 목록 (필터: status/reason/lang/from/to/q, 페이지)
  GET   /admin/reports/summary     — 사유·상태별 건수 + 신고 많은 단어(voca 묶음) 상위
  GET   /admin/reports/<id>        — 상세(스냅샷 포함)
  PATCH /admin/reports/<id>        — 상태 변경 {status, resolve_note, resolved_by}
  PATCH /admin/reports/bulk        — 여러 건 상태 변경 {ids:[...], status, resolve_note}

AI 일괄 처리용 내보내기는 scripts/export_content_reports.py.
"""

import datetime as dt
import logging
from uuid import UUID

from flask import Blueprint, jsonify, g, request
from sqlalchemy import func

from app import db
from app.models.models import ContentReport, UserVoca
from app.routes import admin_bp
from app.routes.admin import admin_required
from app.utils.jwt_utils import jwt_required

logger = logging.getLogger(__name__)

report_bp = Blueprint('report', __name__, url_prefix='/report')

# 사유 코드 — 프론트(components/report/reportReasons.js)·어드민과 같은 목록
REASONS = {
    'meaning': '뜻이 틀림',
    'example': '예문이 이상함',
    'audio': '발음·음성 문제',
    'grading': '정답 판정이 틀림',
    'question': '문제가 이상함',
    'other': '기타',
}
STATUSES = ('open', 'resolved', 'rejected')
DICT_LANGS = ('en', 'ja', 'script', 'custom')

MEMO_MAX = 500
SNAPSHOT_MAX_BYTES = 20_000
# 같은 사용자·같은 문항·같은 사유를 이 시간 안에 다시 보내면 새로 만들지 않는다(연타 방지)
DUP_WINDOW_SEC = 600
# 사용자당 하루 상한 — 오남용 방지
DAILY_LIMIT = 100


def _s(value, max_len):
    if value is None:
        return None
    v = str(value).strip()
    return v[:max_len] if v else None


def _int_or_none(value):
    try:
        v = int(value)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _serialize(r, with_snapshot=False):
    d = {
        'id': r.id,
        'user_id': str(r.user_id) if r.user_id else None,
        'voca_id': r.voca_id,
        'user_voca_id': r.user_voca_id,
        'dict_lang': r.dict_lang,
        'target_key': r.target_key,
        'word': r.word,
        'question_type': r.question_type,
        'test_type': r.test_type,
        'reason': r.reason,
        'reason_label': REASONS.get(r.reason, r.reason),
        'memo': r.memo,
        'app_version': r.app_version,
        'web_version': r.web_version,
        'platform': r.platform,
        'status': r.status,
        'resolve_note': r.resolve_note,
        'resolved_by': r.resolved_by,
        'created_at': r.created_at.isoformat() if r.created_at else None,
        'resolved_at': r.resolved_at.isoformat() if r.resolved_at else None,
    }
    if with_snapshot:
        d['snapshot'] = r.snapshot
    return d


# ──────────────────────────────────────────
# 클라이언트
# ──────────────────────────────────────────

@report_bp.route('', methods=['POST'])
@jwt_required
def create_report():
    import json

    data = request.get_json(silent=True) or {}
    user_id = UUID(g.user_id)

    reason = _s(data.get('reason'), 32)
    if reason not in REASONS:
        return jsonify({'code': 400, 'message': '신고 사유가 올바르지 않습니다.'}), 400

    memo = _s(data.get('memo'), MEMO_MAX)
    user_voca_id = _int_or_none(data.get('user_voca_id'))
    target_key = _s(data.get('target_key'), 191)
    question_type = _s(data.get('question_type'), 48)
    dict_lang = _s(data.get('dict_lang'), 8)
    if dict_lang not in DICT_LANGS:
        dict_lang = None

    snapshot = data.get('snapshot')
    if snapshot is not None and not isinstance(snapshot, dict):
        snapshot = None
    if snapshot is not None and len(json.dumps(snapshot, ensure_ascii=False)) > SNAPSHOT_MAX_BYTES:
        return jsonify({'code': 400, 'message': '신고 데이터가 너무 큽니다.'}), 400

    # 사전 id·언어·단어는 클라이언트 값이 아니라 본인 UserVoca 에서 정한다
    voca_id = None
    word = _s(data.get('word'), 255)
    if user_voca_id:
        uv = UserVoca.query.filter_by(id=user_voca_id, user_id=user_id).first()
        if uv is None:
            user_voca_id = None
        else:
            voca_id = uv.voca_id
            word = uv.word or word
            if dict_lang != 'script':
                dict_lang = uv.dict_lang if uv.voca_id else 'custom'

    if not (user_voca_id or target_key or word):
        return jsonify({'code': 400, 'message': '신고 대상이 없습니다.'}), 400

    now = dt.datetime.utcnow()

    dup_q = ContentReport.query.filter(
        ContentReport.user_id == user_id,
        ContentReport.reason == reason,
        ContentReport.created_at >= now - dt.timedelta(seconds=DUP_WINDOW_SEC),
    )
    if user_voca_id:
        dup_q = dup_q.filter(ContentReport.user_voca_id == user_voca_id)
    elif target_key:
        dup_q = dup_q.filter(ContentReport.target_key == target_key)
    else:
        dup_q = dup_q.filter(ContentReport.word == word)
    if question_type:
        dup_q = dup_q.filter(ContentReport.question_type == question_type)
    dup = dup_q.first()
    if dup is not None:
        # 메모만 새로 붙었으면 기존 건에 반영하고 성공으로 돌려준다
        if memo and memo != dup.memo:
            dup.memo = memo
            db.session.commit()
        return jsonify({'code': 200, 'data': {'id': dup.id, 'duplicate': True}}), 200

    today_cnt = db.session.query(func.count(ContentReport.id)).filter(
        ContentReport.user_id == user_id,
        ContentReport.created_at >= now - dt.timedelta(days=1),
    ).scalar() or 0
    if today_cnt >= DAILY_LIMIT:
        return jsonify({'code': 429, 'message': '오늘은 더 이상 신고할 수 없습니다.'}), 429

    platform = _s(data.get('platform'), 16)
    if platform not in ('ios', 'android', 'web'):
        platform = None

    report = ContentReport(
        user_id=user_id,
        voca_id=voca_id,
        user_voca_id=user_voca_id,
        dict_lang=dict_lang,
        target_key=target_key,
        word=word,
        question_type=question_type,
        test_type=_s(data.get('test_type'), 16),
        reason=reason,
        memo=memo,
        snapshot=snapshot,
        app_version=_s(data.get('app_version'), 32),
        web_version=_s(data.get('web_version'), 64),
        platform=platform,
        status='open',
        created_at=now,
    )
    try:
        db.session.add(report)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.error('신고 저장 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500
    return jsonify({'code': 200, 'data': {'id': report.id, 'duplicate': False}}), 200


# ──────────────────────────────────────────
# 어드민
# ──────────────────────────────────────────

def _parse_date(value, end=False):
    if not value:
        return None
    try:
        d = dt.datetime.strptime(value[:10], '%Y-%m-%d')
    except ValueError:
        return None
    # 입력은 KST 날짜, 저장은 UTC
    d = d - dt.timedelta(hours=9)
    return d + dt.timedelta(days=1) if end else d


def _filtered_query(skip_status=False):
    q = ContentReport.query
    status = request.args.get('status')
    if status in STATUSES and not skip_status:
        q = q.filter(ContentReport.status == status)
    reason = request.args.get('reason')
    if reason in REASONS:
        q = q.filter(ContentReport.reason == reason)
    lang = request.args.get('lang')
    if lang in DICT_LANGS:
        q = q.filter(ContentReport.dict_lang == lang)
    voca_id = _int_or_none(request.args.get('voca_id'))
    if voca_id:
        q = q.filter(ContentReport.voca_id == voca_id)
    since = _parse_date(request.args.get('from'))
    if since:
        q = q.filter(ContentReport.created_at >= since)
    until = _parse_date(request.args.get('to'), end=True)
    if until:
        q = q.filter(ContentReport.created_at < until)
    kw = (request.args.get('q') or '').strip()
    if kw:
        like = f'%{kw}%'
        q = q.filter(db.or_(ContentReport.word.like(like), ContentReport.memo.like(like),
                            ContentReport.target_key.like(like)))
    return q


@admin_bp.route('/reports', methods=['GET'])
@admin_required
def admin_list_reports():
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(int(request.args.get('per_page', 50)), 200))
    except (TypeError, ValueError):
        page, per_page = 1, 50
    q = _filtered_query()
    total = q.count()
    rows = (q.order_by(ContentReport.created_at.desc(), ContentReport.id.desc())
             .offset((page - 1) * per_page).limit(per_page).all())
    return jsonify({'code': 200, 'data': {
        'items': [_serialize(r) for r in rows],
        'total': total, 'page': page, 'per_page': per_page,
        'has_more': page * per_page < total,
    }})


@admin_bp.route('/reports/summary', methods=['GET'])
@admin_required
def admin_reports_summary():
    base = _filtered_query()
    # 상태별 건수는 상태 필터와 무관하게(다른 필터만 적용) — 탭 숫자처럼 쓴다
    by_status = dict(_filtered_query(skip_status=True).with_entities(ContentReport.status, func.count(ContentReport.id))
                     .group_by(ContentReport.status).all())
    by_reason = dict(base.with_entities(ContentReport.reason, func.count(ContentReport.id))
                     .group_by(ContentReport.reason).all())
    # 같은 단어에 신고가 몰리면 먼저 고친다 — voca(사전 id 또는 식별자) 기준 묶음
    group_key = func.coalesce(func.cast(ContentReport.voca_id, db.String(32)),
                              ContentReport.target_key, ContentReport.word)
    top = (base.with_entities(
                ContentReport.dict_lang, ContentReport.voca_id, group_key.label('k'),
                func.max(ContentReport.word).label('word'),
                func.count(ContentReport.id).label('cnt'),
                func.group_concat(func.distinct(ContentReport.reason)).label('reasons'),
                func.max(ContentReport.created_at).label('last_at'))
           .group_by(ContentReport.dict_lang, ContentReport.voca_id, group_key)
           .order_by(func.count(ContentReport.id).desc(), func.max(ContentReport.created_at).desc())
           .limit(30).all())
    return jsonify({'code': 200, 'data': {
        'by_status': {s: by_status.get(s, 0) for s in STATUSES},
        'by_reason': {k: by_reason.get(k, 0) for k in REASONS},
        'reasons': REASONS,
        'top_targets': [{
            'dict_lang': t.dict_lang, 'voca_id': t.voca_id, 'key': t.k, 'word': t.word,
            'count': t.cnt, 'reasons': (t.reasons or '').split(',') if t.reasons else [],
            'last_at': t.last_at.isoformat() if t.last_at else None,
        } for t in top],
    }})


@admin_bp.route('/reports/<int:report_id>', methods=['GET'])
@admin_required
def admin_get_report(report_id):
    r = ContentReport.query.get(report_id)
    if r is None:
        return jsonify({'code': 404, 'message': '신고를 찾을 수 없습니다.'}), 404
    # 같은 대상의 다른 신고 수(상세에서 "이 단어 신고 N건" 표시)
    same = 0
    if r.voca_id:
        same = ContentReport.query.filter(ContentReport.voca_id == r.voca_id,
                                          ContentReport.dict_lang == r.dict_lang,
                                          ContentReport.id != r.id).count()
    data = _serialize(r, with_snapshot=True)
    data['same_target_count'] = same
    return jsonify({'code': 200, 'data': data})


def _apply_status(r, status, note, by):
    r.status = status
    if note is not None:
        r.resolve_note = note
    if by:
        r.resolved_by = by
    r.resolved_at = None if status == 'open' else dt.datetime.utcnow()


@admin_bp.route('/reports/<int:report_id>', methods=['PATCH'])
@admin_required
def admin_update_report(report_id):
    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if status not in STATUSES:
        return jsonify({'code': 400, 'message': 'status 는 open|resolved|rejected'}), 400
    r = ContentReport.query.get(report_id)
    if r is None:
        return jsonify({'code': 404, 'message': '신고를 찾을 수 없습니다.'}), 404
    _apply_status(r, status, _s(data.get('resolve_note'), 1000), _s(data.get('resolved_by'), 64))
    db.session.commit()
    return jsonify({'code': 200, 'data': _serialize(r)})


@admin_bp.route('/reports/bulk', methods=['PATCH'])
@admin_required
def admin_bulk_update_reports():
    data = request.get_json(silent=True) or {}
    status = data.get('status')
    ids = [i for i in (_int_or_none(x) for x in (data.get('ids') or [])) if i][:500]
    if status not in STATUSES or not ids:
        return jsonify({'code': 400, 'message': 'ids 와 status 가 필요합니다.'}), 400
    note = _s(data.get('resolve_note'), 1000)
    by = _s(data.get('resolved_by'), 64)
    rows = ContentReport.query.filter(ContentReport.id.in_(ids)).all()
    for r in rows:
        _apply_status(r, status, note, by)
    db.session.commit()
    return jsonify({'code': 200, 'data': {'updated': len(rows)}})
