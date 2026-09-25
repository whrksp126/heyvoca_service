"""사전 동기화 admin 엔드포인트 — 올리기(발행)/내려받기(적용)/버전목록/상태.

admin 콘솔의 '사전 동기화' 패널이 호출. heyvoca_admin 프록시가 /api/dict/* →
/admin/dict/* 로 X-Admin-API-Key를 주입해 전달한다.

언어: 모든 엔드포인트가 `?lang=en|ja`(기본 en)를 받는다. admin 프록시는 헤더를 버리므로
쿼리스트링만 쓴다(POST 는 JSON 본문의 lang 도 허용). 잘못된 값은 400. 응답에 lang 포함.
"""
import logging

from flask import request, jsonify

from app.routes import admin_bp
from app.routes.admin import admin_required
from app.services import dict_manage as dm
from app.utils.dict_lang import normalize_lang

_log = logging.getLogger(__name__)


def _publisher():
    # 프록시가 admin 사용자명을 넘기지 않으므로 발행 '환경'을 기록(가장 중요한 정보).
    return f"admin@{dm._env_name()}"


def _req_lang(data=None):
    """?lang= (POST 는 본문 lang 도) → 'en'|'ja'. 값이 있는데 지원 안 하면 None."""
    raw = request.args.get('lang')
    if raw is None and data:
        raw = data.get('lang')
    if raw is None or str(raw).strip() == '':
        return 'en'
    return normalize_lang(raw)


def _bad_lang():
    return jsonify({'code': 400, 'message': '지원하지 않는 사전 언어입니다(lang=en|ja).'}), 400


@admin_bp.route('/dict/status', methods=['GET'])
@admin_required
def dict_status():
    lang = _req_lang()
    if lang is None:
        return _bad_lang()
    try:
        return jsonify({'code': 200, 'lang': lang, 'data': dm.get_status(lang=lang)})
    except dm.DictManageError as e:
        _log.error('dict_status 오류(lang=%s)', lang, exc_info=True)
        return jsonify({'code': 500, 'lang': lang, 'message': str(e)}), 500
    except Exception:
        _log.error('dict_status 오류', exc_info=True)
        return jsonify({'code': 500, 'lang': lang, 'message': '사전 상태 조회에 실패했습니다.'}), 500


@admin_bp.route('/dict/versions', methods=['GET'])
@admin_required
def dict_versions():
    lang = _req_lang()
    if lang is None:
        return _bad_lang()
    try:
        return jsonify({'code': 200, 'lang': lang, 'data': dm.list_versions(lang=lang)})
    except dm.DictManageError as e:
        _log.error('dict_versions 오류(lang=%s)', lang, exc_info=True)
        return jsonify({'code': 500, 'lang': lang, 'message': str(e)}), 500
    except Exception:
        _log.error('dict_versions 오류', exc_info=True)
        return jsonify({'code': 500, 'lang': lang, 'message': '버전 목록 조회에 실패했습니다.'}), 500


@admin_bp.route('/dict/publish', methods=['POST'])
@admin_required
def dict_publish():
    """올리기 — 이 환경의 사전(lang 별 schema)을 새 버전으로 발행."""
    data = request.get_json(silent=True) or {}
    lang = _req_lang(data)
    if lang is None:
        return _bad_lang()
    if not data.get('confirm'):
        return jsonify({'code': 400, 'lang': lang, 'message': '확인이 필요합니다.'}), 400
    try:
        res = dm.publish(
            message=(data.get('message') or '').strip(),
            publisher=_publisher(),
            expected_latest=data.get('expected_latest'),
            lang=lang,
        )
        return jsonify({'code': 200, 'lang': lang, 'data': res})
    except dm.DictConflictError as e:
        return jsonify({'code': 409, 'lang': lang, 'message': str(e)}), 409
    except dm.DictManageError as e:
        return jsonify({'code': 400, 'lang': lang, 'message': str(e)}), 400
    except Exception:
        _log.error('dict_publish 오류', exc_info=True)
        return jsonify({'code': 500, 'lang': lang, 'message': '발행에 실패했습니다.'}), 500


@admin_bp.route('/dict/apply', methods=['POST'])
@admin_required
def dict_apply():
    """내려받기/복원 — objectstore의 특정 버전을 이 환경에 swap 적용."""
    data = request.get_json(silent=True) or {}
    lang = _req_lang(data)
    if lang is None:
        return _bad_lang()
    if not data.get('confirm'):
        return jsonify({'code': 400, 'lang': lang, 'message': '확인이 필요합니다.'}), 400
    try:
        res = dm.apply_version(version=data.get('version'), publisher=_publisher(), lang=lang)
        return jsonify({'code': 200, 'lang': lang, 'data': res})
    except dm.DictConflictError as e:
        return jsonify({'code': 409, 'lang': lang, 'message': str(e)}), 409
    except dm.DictManageError as e:
        return jsonify({'code': 400, 'lang': lang, 'message': str(e)}), 400
    except Exception:
        _log.error('dict_apply 오류', exc_info=True)
        return jsonify({'code': 500, 'lang': lang, 'message': '적용에 실패했습니다.'}), 500
