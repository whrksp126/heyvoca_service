"""어드민 — 일별 실사용자(전환) 리포트 API (읽기 전용).

  GET /admin/report/daily-active?start=YYYY-MM-DD&end=YYYY-MM-DD&format=json|md
      start/end 생략 시 어제(KST) 하루. days=N 이면 end(기본 어제)에서 거꾸로 N일.

집계는 app/services/daily_report.py 단일 소스(CLI scripts/daily_active_report.py 와 공용).
"""

import datetime as dt

from flask import request, jsonify, Response

from app.routes import admin_bp
from app.routes.admin import admin_required
from app.services.daily_report import build_report, render_markdown, kst_today

MAX_DAYS = 92


def _parse_day(raw):
    return dt.date.fromisoformat(raw) if raw else None


@admin_bp.route('/report/daily-active', methods=['GET'])
@admin_required
def daily_active_report():
    try:
        end = _parse_day(request.args.get('end')) or (kst_today() - dt.timedelta(days=1))
        start = _parse_day(request.args.get('start'))
        days = request.args.get('days')
        if start is None:
            n = int(days) if days else 1
            start = end - dt.timedelta(days=max(1, n) - 1)
    except (TypeError, ValueError):
        return jsonify({'code': 400, 'message': '날짜는 YYYY-MM-DD, days 는 정수여야 합니다.'}), 400
    if abs((end - start).days) + 1 > MAX_DAYS:
        return jsonify({'code': 400, 'message': f'기간은 최대 {MAX_DAYS}일입니다.'}), 400

    report = build_report(start, end)
    if request.args.get('format') == 'md':
        return Response(render_markdown(report), mimetype='text/markdown; charset=utf-8')
    return jsonify({'code': 200, 'data': report})
