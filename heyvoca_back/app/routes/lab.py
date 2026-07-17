import logging
from uuid import UUID

from flask import Blueprint, jsonify, request, g

from app import db
from app.models.models import User
from app.utils.jwt_utils import jwt_required

lab_bp = Blueprint('lab', __name__, url_prefix='/lab')

# 실험실에서 토글 가능한 기능 키 → User 컬럼 매핑.
# 새 실험 기능을 추가할 때 여기에 한 줄만 늘리면 GET/PUT이 자동 확장된다.
_FEATURE_COLUMNS = {
    'chat_study': 'chat_study_enabled',
}


def _features_dict(user: User) -> dict:
    """User → {feature_key: bool} 형태의 실험실 기능 상태."""
    return {
        key: bool(getattr(user, col, False))
        for key, col in _FEATURE_COLUMNS.items()
    }


@lab_bp.route('/settings', methods=['GET'])
@jwt_required
def get_lab_settings():
    """현재 사용자의 실험실 기능 ON/OFF 상태 조회."""
    user_id = UUID(g.user_id)
    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404

    return jsonify({'code': 200, 'data': {'features': _features_dict(user)}}), 200


@lab_bp.route('/settings', methods=['PUT'])
@jwt_required
def update_lab_settings():
    """실험실 기능 하나를 켜거나 끈다.

    요청: { "feature": "chat_study", "enabled": true }
    응답: { "code": 200, "data": { "features": { ... } } }
    """
    user_id = UUID(g.user_id)
    req = request.get_json(silent=True) or {}

    feature = req.get('feature')
    enabled = req.get('enabled')

    if feature not in _FEATURE_COLUMNS:
        return jsonify({'code': 400, 'message': '알 수 없는 실험실 기능입니다.'}), 400
    if enabled is None:
        return jsonify({'code': 400, 'message': 'enabled는 필수입니다.'}), 400

    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404

    setattr(user, _FEATURE_COLUMNS[feature], bool(enabled))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).error('실험실 설정 저장 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '설정 저장에 실패했습니다.'}), 500

    return jsonify({'code': 200, 'data': {'features': _features_dict(user)}}), 200
