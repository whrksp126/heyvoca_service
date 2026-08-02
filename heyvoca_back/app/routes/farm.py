"""당근 농장 V2 API.

계약(`docs` 트랙 공통 규격)의 `/farm/*` 엔드포인트 전부를 담는다.
V1 농장(`/game/farm*`)은 프론트가 아직 쓰고 있으므로 그대로 두고, 이 파일은 V2 만 맡는다.

이 파일에 규칙 하나만 둔다 — **판단은 서비스가 하고, 라우트는 옮기기만 한다.**
서비스 함수는 예외로 실패를 알리고(LookupError/ValueError/PermissionError),
여기서 HTTP 코드로 옮긴다. 그래야 같은 서비스 함수를 hook 이나 스크립트에서
불러도 HTTP 개념이 딸려오지 않는다.

서비스 import 를 전부 함수 안에서 하는 이유는 순환 참조 때문이다 —
`app/__init__.py` 가 이 모듈을 import 하는 시점에 서비스가 모델을 다시 import 한다.
"""

import datetime as dt
import logging
from uuid import UUID

from flask import Blueprint, jsonify, g, request

from app.utils.jwt_utils import jwt_required

farm_bp = Blueprint('farm', __name__, url_prefix='/farm')

_log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# 공용 헬퍼
# ──────────────────────────────────────────────────────────────

def _fail(where: str):
    """예상 못 한 예외를 로그로 남기고 500 을 만든다.

    한 곳에 모은 이유는 문구를 통일하기 위해서다. 사용자에게 내부 사정을 말하지
    않고(13.4 금지 문구), 원인은 서버 로그에만 남긴다.
    """
    _log.error('%s 오류', where, exc_info=True)
    return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


def _msg(exc, default: str) -> str:
    """서비스가 붙인 한국어 문구를 그대로 쓰되, 비어 있으면 기본 문구로 대체한다.

    서비스 쪽 문구가 더 구체적이라(어떤 아이템이 부족한지 등) 그대로 노출하는 편이
    사용자에게 유용하다. 다만 문구 없이 raise 된 경우를 대비해 기본값을 둔다.
    """
    text = str(exc or '').strip()
    return text or default


def _int_arg(name: str, default=None):
    """쿼리스트링 정수 파라미터. 값이 이상하면 기본값으로 되돌린다.

    잘못된 커서로 400 을 주지 않는 이유는, 커서는 사용자가 입력하는 값이 아니라
    앞 응답을 그대로 되돌려주는 값이라 오류로 다룰 실익이 없기 때문이다.
    """
    raw = request.args.get(name)
    if raw is None or raw == '':
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _id_list(body: dict):
    """본문의 user_voca_ids 를 정수 리스트로. 형식이 틀리면 ValueError.

    서비스도 같은 정규화를 하지만(_normalize_ids), 여기서 한 번 더 보는 이유는
    "형식 오류(400)"와 "상태 불일치(409)"를 구분하기 위해서다. 서비스는 둘 다
    ValueError 로 알린다.
    """
    raw = body.get('user_voca_ids')
    if not isinstance(raw, (list, tuple)) or not raw:
        raise ValueError('user_voca_ids는 1개 이상의 배열이어야 합니다.')
    try:
        return [int(v) for v in raw]
    except (TypeError, ValueError):
        raise ValueError('user_voca_ids는 정수 배열이어야 합니다.')


# ──────────────────────────────────────────────────────────────
# 조회
# ──────────────────────────────────────────────────────────────

@farm_bp.route('/overview', methods=['GET'])
@jwt_required
def get_overview():
    """홈 화면 한 번치 수치 (계약 GET /farm/overview).

    호출 순서가 중요하다:
      1. compute_rot_state  — 유예가 끝난 작물을 부패로 확정(6.2). 집계 전에 해야
         홈 숫자와 학습 가능 여부가 어긋나지 않는다.
      2. apply_emergency_water — 권장량 밖으로 밀린 CRITICAL 을 하루 미룬다(8.4).
         부패 확정 뒤에 해야 "오늘 밀린 것"이 정확하다.
      3. check_and_start — 30일 공백 뒤 첫 진입이면 복귀 미션 생성(7.4).
         집계 전에 해야 overview.comeback 이 이번 응답부터 실린다.
      4. get_overview — 집계.

    1~3 은 쓰기다. 여기서 실패해도 홈은 열려야 하므로 각각 감싸서 삼킨다 —
    부패 재계산이 늦어지는 것과 홈 화면이 안 뜨는 것은 사용자에게 무게가 다르다.
    """
    from app import db
    from app.services.game.farm_v2 import comeback, query, watering

    user_id = UUID(g.user_id)
    now = dt.datetime.utcnow()

    refreshed = True
    for step, fn in (('부패 재계산', watering.compute_rot_state),
                     ('무료 긴급 급수', watering.apply_emergency_water),
                     ('복귀 미션 판정', comeback.check_and_start)):
        try:
            fn(user_id, now)
        except Exception:
            db.session.rollback()
            if fn is watering.compute_rot_state:
                refreshed = False
            _log.warning('농장 개요 사전 처리 실패 (%s)', step, exc_info=True)

    try:
        # 1번에서 이미 부패를 확정했다 — 집계가 같은 스캔을 한 번 더 돌지 않게 한다.
        # (1번이 실패했을 때만 집계 쪽에서 다시 시도한다.)
        data = query.get_overview(user_id, now, refresh=not refreshed)
        return jsonify({'code': 200, 'data': data}), 200
    except Exception:
        return _fail('농장 개요 조회')


@farm_bp.route('/plants', methods=['GET'])
@jwt_required
def list_plants():
    """작물 목록 (계약 GET /farm/plants). group/health 필터 + 커서 페이지네이션."""
    from app.services.game.farm_v2 import query

    user_id = UUID(g.user_id)
    try:
        data = query.list_plants(
            user_id,
            now=dt.datetime.utcnow(),
            group=request.args.get('group'),
            health=request.args.get('health'),
            limit=_int_arg('limit', 50),
            cursor=_int_arg('cursor'),
        )
        return jsonify({'code': 200, 'data': data}), 200
    except ValueError as e:
        # 필터 값이 틀린 것은 상태 충돌이 아니라 잘못된 요청이다.
        return jsonify({'code': 400, 'message': _msg(e, '요청 값이 올바르지 않습니다.')}), 400
    except Exception:
        return _fail('작물 목록 조회')


# ──────────────────────────────────────────────────────────────
# 부패 후 처리 (기획 7)
# ──────────────────────────────────────────────────────────────

@farm_bp.route('/rotten', methods=['GET'])
@jwt_required
def list_rotten():
    """썩은 작물 보관소 목록 (계약 GET /farm/rotten).

    목록 조회 전에 부패를 다시 계산한다. 이 화면은 "무엇을 되살릴까"를 고르는
    자리라, 방금 유예가 끝난 작물이 빠져 있으면 사용자가 두 번 들어와야 한다.
    """
    from app import db
    from app.services.game.farm_v2 import restore, watering

    user_id = UUID(g.user_id)
    try:
        watering.compute_rot_state(user_id, dt.datetime.utcnow())
    except Exception:
        db.session.rollback()
        _log.warning('부패 목록 사전 재계산 실패', exc_info=True)

    try:
        data = restore.list_rotten(user_id, limit=_int_arg('limit', 50),
                                   cursor=_int_arg('cursor'))
        return jsonify({'code': 200, 'data': data}), 200
    except Exception:
        return _fail('부패 목록 조회')


@farm_bp.route('/replant', methods=['POST'])
@jwt_required
def replant():
    """삽으로 다시 심기 예약 (계약 POST /farm/replant).

    응답의 cancel_until 이 10초 취소 창이다. 확정은 진단 정답 시점에
    학습 hook 이 restore.complete_diagnosis 로 마무리한다.
    """
    from app.services.game.farm_v2 import restore

    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}
    try:
        ids = _id_list(body)
    except ValueError as e:
        return jsonify({'code': 400, 'message': str(e)}), 400

    try:
        return jsonify({'code': 200, 'data': restore.reserve_replant(user_id, ids)}), 200
    except LookupError as e:
        return jsonify({'code': 404, 'message': _msg(e, '농장 정보를 찾을 수 없어요.')}), 404
    except ValueError as e:
        return jsonify({'code': 409, 'message': _msg(e, '지금은 다시 심을 수 없는 작물이에요.')}), 409
    except PermissionError as e:
        return jsonify({'code': 400, 'message': _msg(e, '삽이 부족해요.')}), 400
    except Exception:
        return _fail('다시 심기 예약')


@farm_bp.route('/replant/cancel', methods=['POST'])
@jwt_required
def cancel_replant():
    """다시 심기 예약 취소 (계약 POST /farm/replant/cancel). 삽을 돌려준다."""
    from app.services.game.farm_v2 import restore

    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}
    try:
        ids = _id_list(body)
    except ValueError as e:
        return jsonify({'code': 400, 'message': str(e)}), 400

    try:
        return jsonify({'code': 200, 'data': restore.cancel_replant(user_id, ids)}), 200
    except LookupError as e:
        return jsonify({'code': 404, 'message': _msg(e, '취소할 예약이 없어요.')}), 404
    except ValueError as e:
        return jsonify({'code': 409, 'message': _msg(e, '지금은 취소할 수 없어요.')}), 409
    except Exception:
        return _fail('다시 심기 취소')


@farm_bp.route('/recover', methods=['POST'])
@jwt_required
def recover():
    """영양 회복제로 회복 (계약 POST /farm/recover). 아이템은 즉시 소비된다."""
    from app.services.game.farm_v2 import restore

    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}
    try:
        ids = _id_list(body)
    except ValueError as e:
        return jsonify({'code': 400, 'message': str(e)}), 400

    try:
        return jsonify({'code': 200, 'data': restore.recover_with_nutrient(user_id, ids)}), 200
    except LookupError as e:
        return jsonify({'code': 404, 'message': _msg(e, '농장 정보를 찾을 수 없어요.')}), 404
    except ValueError as e:
        return jsonify({'code': 409, 'message': _msg(e, '지금은 회복할 수 없는 작물이에요.')}), 409
    except PermissionError as e:
        return jsonify({'code': 400, 'message': _msg(e, '영양 회복제가 부족해요.')}), 400
    except Exception:
        return _fail('회복 처리')


# ──────────────────────────────────────────────────────────────
# 아이템 / 상점 (기획 8.2)
# ──────────────────────────────────────────────────────────────

@farm_bp.route('/items', methods=['GET'])
@jwt_required
def get_items():
    """보유 아이템 + 보석 (계약 GET /farm/items)."""
    from app.services.game.farm_v2 import shop

    user_id = UUID(g.user_id)
    try:
        return jsonify({'code': 200, 'data': shop.get_wallet(user_id)}), 200
    except LookupError as e:
        return jsonify({'code': 404, 'message': _msg(e, '사용자 정보를 찾을 수 없어요.')}), 404
    except Exception:
        return _fail('아이템 조회')


@farm_bp.route('/shop', methods=['GET'])
@jwt_required
def get_shop():
    """상점 진열 (계약 GET /farm/shop). 가격은 서버 상수가 정본이다."""
    from app.services.game.farm_v2 import shop

    try:
        return jsonify({'code': 200, 'data': {'packs': shop.list_packs()}}), 200
    except Exception:
        return _fail('상점 조회')


@farm_bp.route('/shop/purchase', methods=['POST'])
@jwt_required
def purchase_pack():
    """보석으로 아이템 구매 (계약 POST /farm/shop/purchase).

    가격을 본문에서 받지 않는다 — sku 만 받고 서버가 되찾는다. 클라이언트가 보낸
    가격을 믿으면 그 값이 곧 결제 금액이 된다.
    """
    from app.services.game.farm_v2 import shop

    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}
    sku = body.get('sku')
    if not sku:
        return jsonify({'code': 400, 'message': 'sku는 필수입니다.'}), 400

    try:
        data = shop.purchase(user_id, str(sku), body.get('qty', 1))
        return jsonify({'code': 200, 'data': data}), 200
    except LookupError as e:
        return jsonify({'code': 404, 'message': _msg(e, '없는 상품이에요.')}), 404
    except ValueError as e:
        # 수량 범위 오류다. 상태 충돌(409)이 아니라 잘못된 요청이라 400 으로 준다.
        return jsonify({'code': 400, 'message': _msg(e, '수량이 올바르지 않아요.')}), 400
    except PermissionError as e:
        return jsonify({'code': 400, 'message': _msg(e, '보석이 부족해요.')}), 400
    except Exception:
        return _fail('아이템 구매')


# ──────────────────────────────────────────────────────────────
# 연속 학습일 (기획 11)
# ──────────────────────────────────────────────────────────────

@farm_bp.route('/streak', methods=['GET'])
@jwt_required
def get_streak():
    """연속 학습일 상태 + 최근 35일 캘린더 (계약 GET /farm/streak).

    GET 이지만 서비스가 주간 보호권 지급과 놓친 날 정산을 함께 처리해 **쓰기가 있다**.
    "그 주 첫 접속"은 사용자가 화면을 여는 순간에만 판정할 수 있어서다(11.3).
    """
    from app.services.game.farm_v2 import streak_v2

    user_id = UUID(g.user_id)
    try:
        return jsonify({'code': 200, 'data': streak_v2.get_state(user_id)}), 200
    except Exception:
        return _fail('연속 학습일 조회')


@farm_bp.route('/streak/recover', methods=['POST'])
@jwt_required
def recover_streak():
    """보호권 1개로 연속 기록 복구 (계약 POST /farm/streak/recover)."""
    from app.services.game.farm_v2 import streak_v2

    user_id = UUID(g.user_id)
    try:
        return jsonify({'code': 200, 'data': streak_v2.recover_streak(user_id)}), 200
    except ValueError as e:
        return jsonify({'code': 409, 'message': _msg(e, '지금은 복구할 수 없어요.')}), 409
    except PermissionError as e:
        return jsonify({'code': 400, 'message': _msg(e, '연속 보호권이 부족해요.')}), 400
    except Exception:
        return _fail('연속 기록 복구')


# ──────────────────────────────────────────────────────────────
# 세션 결과 (기획 12.3)
# ──────────────────────────────────────────────────────────────

@farm_bp.route('/session-summary', methods=['GET'])
@jwt_required
def session_summary():
    """세션 종료 요약 (계약 GET /farm/session-summary).

    세션 종료 시점에 복귀 미션의 하루 진행도를 반영한다(7.4). 학습이 끝난 직후가
    "오늘 5개를 채웠는가"를 판정할 수 있는 가장 늦고 확실한 지점이라, 답안마다
    세는 대신 여기서 한 번만 본다.
    """
    from app import db
    from app.services.game.farm_v2 import comeback, query

    user_id = UUID(g.user_id)
    raw = request.args.get('session_id')
    if not raw:
        return jsonify({'code': 400, 'message': 'session_id는 필수입니다.'}), 400
    try:
        session_uuid = UUID(raw)
    except (TypeError, ValueError):
        return jsonify({'code': 400, 'message': '유효하지 않은 session_id 형식입니다.'}), 400

    try:
        comeback.record_day(user_id)
    except Exception:
        db.session.rollback()
        _log.warning('복귀 미션 진행 반영 실패', exc_info=True)

    try:
        data = query.get_session_summary(user_id, session_uuid)
        return jsonify({'code': 200, 'data': data}), 200
    except LookupError as e:
        return jsonify({'code': 404, 'message': _msg(e, '학습 세션을 찾을 수 없어요.')}), 404
    except Exception:
        return _fail('세션 요약 조회')


@farm_bp.route('/migration/seen', methods=['POST'])
@jwt_required
def migration_seen():
    """전환 안내를 확인했다고 표시.

    화면 저장소에만 닫힘을 기록하면 기기를 바꿨을 때 이미 본 안내가 다시 뜬다.
    """
    from app.services.game.farm_v2 import query

    user_id = UUID(g.user_id)
    try:
        return jsonify({'code': 200, 'data': query.mark_migration_seen(user_id)}), 200
    except Exception:
        return _fail('전환 안내 확인 표시')
