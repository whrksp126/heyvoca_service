"""실험실 '내 농장 꾸미기' API (/farm/state, /farm/layout, /farm/shop/buy, /farm/books/<id>/crop).

기존 farm.py(V2 당근 농장)와 경로가 겹치지 않아 같은 /farm 접두사를 쓴다. 판단은 app/services/farm_lab.py.
"""
import logging
from uuid import UUID

from flask import Blueprint, g, jsonify, request

from app import db
from app.services import farm_lab as svc
from app.utils.jwt_utils import jwt_required as token_required

farm_lab_bp = Blueprint('farm_lab', __name__, url_prefix='/farm')


def _run(fn, *args):
    try:
        return jsonify({'code': 200, 'data': fn(UUID(g.user_id), *args)}), 200
    except svc.FarmError as e:
        db.session.rollback()
        body = {'code': e.code, 'message': e.message}
        if e.extra:
            body['data'] = e.extra
        return jsonify(body), e.code
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).error('farm_lab 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@farm_lab_bp.route('/state', methods=['GET'])
@token_required
def farm_state():
    return _run(svc.get_state)


@farm_lab_bp.route('/layout', methods=['PUT'])
@token_required
def farm_layout():
    b = request.get_json(silent=True) or {}
    return _run(svc.save_layout, b.get('layout'), b.get('version'))


@farm_lab_bp.route('/shop/buy', methods=['POST'])
@token_required
def farm_buy():
    b = request.get_json(silent=True) or {}
    return _run(svc.buy, b.get('item_id'))


@farm_lab_bp.route('/books/<book_id>/crop', methods=['PATCH'])
@token_required
def farm_book_crop(book_id):
    b = request.get_json(silent=True) or {}
    return _run(svc.set_crop, book_id, b.get('crop_type'))
