"""사전 동기화 admin 엔드포인트 — 올리기(발행)/내려받기(적용)/버전목록/상태.

admin 콘솔의 '사전 동기화' 패널이 호출. heyvoca_admin 프록시가 /api/dict/* →
/admin/dict/* 로 X-Admin-API-Key를 주입해 전달한다.
"""
import logging

from flask import request, jsonify

from app.routes import admin_bp
from app.routes.admin import admin_required
from app.services import dict_manage as dm

_log = logging.getLogger(__name__)


def _publisher():
    # 프록시가 admin 사용자명을 넘기지 않으므로 발행 '환경'을 기록(가장 중요한 정보).
    return f"admin@{dm._env_name()}"


@admin_bp.route('/dict/status', methods=['GET'])
@admin_required
def dict_status():
    try:
        return jsonify({'code': 200, 'data': dm.get_status()})
    except Exception:
        _log.error('dict_status 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '사전 상태 조회에 실패했습니다.'}), 500


@admin_bp.route('/dict/versions', methods=['GET'])
@admin_required
def dict_versions():
    try:
        return jsonify({'code': 200, 'data': dm.list_versions()})
    except Exception:
        _log.error('dict_versions 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '버전 목록 조회에 실패했습니다.'}), 500


@admin_bp.route('/dict/publish', methods=['POST'])
@admin_required
def dict_publish():
    """올리기 — 이 환경의 heyvoca_dict를 새 버전으로 발행."""
    data = request.get_json(silent=True) or {}
    if not data.get('confirm'):
        return jsonify({'code': 400, 'message': '확인이 필요합니다.'}), 400
    try:
        res = dm.publish(
            message=(data.get('message') or '').strip(),
            publisher=_publisher(),
            expected_latest=data.get('expected_latest'),
        )
        return jsonify({'code': 200, 'data': res})
    except dm.DictConflictError as e:
        return jsonify({'code': 409, 'message': str(e)}), 409
    except dm.DictManageError as e:
        return jsonify({'code': 400, 'message': str(e)}), 400
    except Exception:
        _log.error('dict_publish 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '발행에 실패했습니다.'}), 500


@admin_bp.route('/dict/apply', methods=['POST'])
@admin_required
def dict_apply():
    """내려받기/복원 — objectstore의 특정 버전을 이 환경에 swap 적용."""
    data = request.get_json(silent=True) or {}
    if not data.get('confirm'):
        return jsonify({'code': 400, 'message': '확인이 필요합니다.'}), 400
    try:
        res = dm.apply_version(version=data.get('version'), publisher=_publisher())
        return jsonify({'code': 200, 'data': res})
    except dm.DictManageError as e:
        return jsonify({'code': 400, 'message': str(e)}), 400
    except Exception:
        _log.error('dict_apply 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '적용에 실패했습니다.'}), 500
