"""게임 레이어 API (콤보 + 당근 농장).

학습 알고리즘(FSRS)·추천과 분리된 신규 라우트 파일 —
study.py는 hook 1블록 외에 수정하지 않는 것이 원칙.
"""

import datetime as dt
import logging
from uuid import UUID

from flask import Blueprint, jsonify, g, request

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


# ── 당근 농장 ──────────────────────────────────────────────────

@game_bp.route('/farm', methods=['GET'])
@jwt_required
def get_farm():
    """농장 전체 (밭 그리드) — 식물 목록 + 요약 + 부활템/보석."""
    from app.services.game.farm import get_farm as farm_get_farm
    user_id = UUID(g.user_id)
    try:
        return jsonify({'code': 200, 'data': farm_get_farm(user_id, dt.datetime.utcnow())}), 200
    except Exception:
        logging.getLogger(__name__).error('농장 조회 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@game_bp.route('/farm/summary', methods=['GET'])
@jwt_required
def get_farm_summary():
    """홈 요약 카드용 — 카운트 + 부활템/보석."""
    from app.services.game.farm import get_summary
    user_id = UUID(g.user_id)
    try:
        return jsonify({'code': 200, 'data': get_summary(user_id, dt.datetime.utcnow())}), 200
    except Exception:
        logging.getLogger(__name__).error('농장 요약 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@game_bp.route('/farm/revive', methods=['POST'])
@jwt_required
def revive_plant():
    """부활템 1개로 죽은 단어 1개 부활."""
    from app.services.game.farm import revive
    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}
    user_voca_id = body.get('user_voca_id')
    if user_voca_id is None:
        return jsonify({'code': 400, 'message': 'user_voca_id는 필수입니다.'}), 400
    try:
        return jsonify({'code': 200, 'data': revive(user_id, int(user_voca_id))}), 200
    except LookupError:
        return jsonify({'code': 404, 'message': '농장 정보가 없습니다.'}), 404
    except ValueError:
        return jsonify({'code': 409, 'message': '죽은 단어가 아닙니다.'}), 409
    except PermissionError:
        return jsonify({'code': 400, 'message': '부활템이 부족합니다.'}), 400
    except Exception:
        logging.getLogger(__name__).error('부활 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@game_bp.route('/farm/buy-revive', methods=['POST'])
@jwt_required
def buy_revive_items():
    """보석으로 부활템 구매 (1보석=5개). body.packs 묶음 수(기본 1)."""
    from app.services.game.farm import buy_revive
    user_id = UUID(g.user_id)
    data = request.get_json(silent=True) or {}
    packs = data.get('packs', 1)
    try:
        return jsonify({'code': 200, 'data': buy_revive(user_id, packs)}), 200
    except PermissionError:
        return jsonify({'code': 400, 'message': '보석이 부족합니다.'}), 400
    except Exception:
        logging.getLogger(__name__).error('부활템 구매 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500
