"""게임 레이어 API (콤보; 트랙 ④에서 농장 합류 예정).

학습 알고리즘(FSRS)·추천과 분리된 신규 라우트 파일 —
study.py는 hook 1블록 외에 수정하지 않는 것이 원칙.
"""

import logging
from uuid import UUID

from flask import Blueprint, jsonify, g

from app.utils.jwt_utils import jwt_required

game_bp = Blueprint('game', __name__, url_prefix='/game')


@game_bp.route('/combo', methods=['GET'])
@jwt_required
def get_combo():
    """현재 콤보 상태 조회 (학습 진입 시 초기값)."""
    from app.services.game.combo import get_state
    user_id = UUID(g.user_id)
    return jsonify({'code': 200, 'data': get_state(user_id)}), 200


@game_bp.route('/combo/protect', methods=['POST'])
@jwt_required
def protect_combo():
    """보석을 차감하고 위기 콤보를 복원."""
    from app.services.game.combo import protect
    user_id = UUID(g.user_id)
    try:
        payload = protect(user_id)
        return jsonify({'code': 200, 'data': payload}), 200
    except LookupError:
        return jsonify({'code': 404, 'message': '콤보 정보가 없습니다.'}), 404
    except ValueError:
        return jsonify({'code': 409, 'message': '보호할 콤보가 없습니다.'}), 409
    except PermissionError:
        return jsonify({'code': 400, 'message': '보석이 부족합니다.'}), 400
    except Exception:
        logging.getLogger(__name__).error('콤보 보호 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@game_bp.route('/combo/forfeit', methods=['POST'])
@jwt_required
def forfeit_combo():
    """위기 콤보 포기 확정 (0 유지)."""
    from app.services.game.combo import forfeit
    user_id = UUID(g.user_id)
    try:
        payload = forfeit(user_id)
        return jsonify({'code': 200, 'data': payload}), 200
    except Exception:
        logging.getLogger(__name__).error('콤보 포기 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500
