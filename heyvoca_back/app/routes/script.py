"""글자 밭 API — 일본어(히라가나/가타카나)·영어(알파벳) 문자 학습.

문자 데이터셋(어떤 글자가 있는지, 표시 순서 등) 자체는 프론트 정적 JSON이 정본이다.
여기서는 사용자별 글자 숙달(level 0~5)과 간격 반복 스케줄(next_review_at)만 다룬다.

간격 테이블은 이 파일이 단일 소스다(모델 docstring에서도 이 파일을 가리킴) —
바꾸면 프론트 표시 로직과 어긋나지 않는지 함께 확인할 것.
"""

import datetime as dt
import logging
from uuid import UUID

from flask import Blueprint, jsonify, g, request

from app import db
from app.models.models import UserScriptProgress
from app.utils.jwt_utils import jwt_required

script_bp = Blueprint('script', __name__, url_prefix='/script')

_log = logging.getLogger(__name__)

SCRIPT_CHOICES = ('hiragana', 'katakana', 'alphabet')

# level(0~5) → 다음 복습까지 일수. 0 = 즉시 다시 노출.
LEVEL_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]

_MAX_ITEMS_PER_REQUEST = 200


def _fail(where: str):
    _log.error('%s 오류', where, exc_info=True)
    return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


def _bad_request(message: str):
    return jsonify({'code': 400, 'message': message}), 400


def _validate_script(value):
    if value not in SCRIPT_CHOICES:
        raise ValueError('script는 hiragana|katakana|alphabet 중 하나여야 합니다.')
    return value


def _validate_char(value):
    if not isinstance(value, str) or not (1 <= len(value) <= 8):
        raise ValueError('char는 길이 1~8의 문자열이어야 합니다.')
    return value


def _next_review_at(level: int, now: dt.datetime) -> dt.datetime:
    days = LEVEL_INTERVAL_DAYS[level]
    return now if days == 0 else now + dt.timedelta(days=days)


def _serialize(row: UserScriptProgress) -> dict:
    return {
        'char': row.char,
        'level': row.level,
        'correct_cnt': row.correct_cnt,
        'wrong_cnt': row.wrong_cnt,
        'last_studied_at': row.last_studied_at.isoformat() if row.last_studied_at else None,
        'next_review_at': row.next_review_at.isoformat() if row.next_review_at else None,
    }


@script_bp.route('/progress', methods=['GET'])
@jwt_required
def get_progress():
    """GET /script/progress?script=hiragana

    응답: {code:200, data:{script, items:[...], due_count}}
    items는 이 사용자가 이미 학습(로그/스킵)한 글자만 담는다 — 안 건드린 글자는
    행 자체가 없으므로 목록에 없다(프론트가 정적 데이터셋과 합쳐 "미학습"으로 표시).
    due_count = next_review_at <= now 인 행 수.
    """
    script = request.args.get('script')
    try:
        _validate_script(script)
    except ValueError as e:
        return _bad_request(str(e))

    user_id = UUID(g.user_id)
    now = dt.datetime.utcnow()

    try:
        rows = (
            db.session.query(UserScriptProgress)
            .filter_by(user_id=user_id, script=script)
            .all()
        )
        items = [_serialize(r) for r in rows]
        due_count = sum(1 for r in rows if r.next_review_at is not None and r.next_review_at <= now)
        return jsonify({
            'code': 200,
            'data': {'script': script, 'items': items, 'due_count': due_count},
        }), 200
    except Exception:
        return _fail('글자 밭 진행도 조회')


def _load_existing(user_id, script, chars):
    """이번 요청에서 다룰 글자들의 기존 행을 미리 잠가서(with_for_update) 가져온다.

    같은 요청 안에서 여러 번 나오는 글자는 메모리에서 순서대로 누적 적용하고
    커밋은 마지막에 한 번만 한다(다른 클라이언트 라우트의 UPSERT 관례와 동일).
    """
    if not chars:
        return {}
    rows = (
        db.session.query(UserScriptProgress)
        .filter(
            UserScriptProgress.user_id == user_id,
            UserScriptProgress.script == script,
            UserScriptProgress.char.in_(chars),
        )
        .with_for_update()
        .all()
    )
    return {r.char: r for r in rows}


@script_bp.route('/log', methods=['POST'])
@jwt_required
def log_results():
    """POST /script/log body {script, results:[{char, correct: bool}]}

    정답 → level=min(5, level+1). 오답 → level=max(1 if level>=1 else 0, level-1)
    (한 번 1 이상 올라간 글자는 0으로 안 떨어뜨린다). 같은 요청 안의 같은 글자는
    순서대로 누적 적용된다. 응답 = 갱신된 items(이번 요청에서 다룬 글자만, 등장 순서).
    """
    body = request.get_json(silent=True) or {}
    script = body.get('script')
    results = body.get('results')

    try:
        _validate_script(script)
    except ValueError as e:
        return _bad_request(str(e))

    if not isinstance(results, list) or not results:
        return _bad_request('results는 1개 이상의 배열이어야 합니다.')
    if len(results) > _MAX_ITEMS_PER_REQUEST:
        return _bad_request(f'results는 한 번에 최대 {_MAX_ITEMS_PER_REQUEST}개까지 가능합니다.')

    normalized = []
    try:
        for item in results:
            if not isinstance(item, dict):
                raise ValueError('results 항목은 객체여야 합니다.')
            char = _validate_char(item.get('char'))
            correct = item.get('correct')
            if not isinstance(correct, bool):
                raise ValueError('results 항목의 correct는 boolean이어야 합니다.')
            normalized.append((char, correct))
    except ValueError as e:
        return _bad_request(str(e))

    user_id = UUID(g.user_id)
    now = dt.datetime.utcnow()

    try:
        chars = {c for c, _ in normalized}
        existing = _load_existing(user_id, script, chars)
        touched_order = []  # 등장 순서 보존(응답용), 중복 제거

        for char, correct in normalized:
            row = existing.get(char)
            if row is None:
                row = UserScriptProgress(user_id=user_id, script=script, char=char)
                db.session.add(row)
                existing[char] = row
                touched_order.append(char)
            elif char not in touched_order:
                touched_order.append(char)

            if correct:
                row.level = min(5, row.level + 1)
                row.correct_cnt += 1
            else:
                floor = 1 if row.level >= 1 else 0
                row.level = max(floor, row.level - 1)
                row.wrong_cnt += 1

            row.last_studied_at = now
            row.next_review_at = _next_review_at(row.level, now)
            row.updated_at = now

        db.session.commit()

        items = [_serialize(existing[c]) for c in touched_order]
        return jsonify({'code': 200, 'data': {'script': script, 'items': items}}), 200
    except Exception:
        db.session.rollback()
        return _fail('글자 밭 로그 저장')


@script_bp.route('/skip', methods=['POST'])
@jwt_required
def skip_chars():
    """POST /script/skip body {script, chars:[...]}

    '이미 알아요' — 건너뛰기 확인 테스트 통과. level=max(level,3),
    next_review_at=now+7일. correct_cnt/wrong_cnt는 건드리지 않는다.
    """
    body = request.get_json(silent=True) or {}
    script = body.get('script')
    chars = body.get('chars')

    try:
        _validate_script(script)
    except ValueError as e:
        return _bad_request(str(e))

    if not isinstance(chars, list) or not chars:
        return _bad_request('chars는 1개 이상의 배열이어야 합니다.')
    if len(chars) > _MAX_ITEMS_PER_REQUEST:
        return _bad_request(f'chars는 한 번에 최대 {_MAX_ITEMS_PER_REQUEST}개까지 가능합니다.')

    try:
        normalized = [_validate_char(c) for c in chars]
    except ValueError as e:
        return _bad_request(str(e))

    user_id = UUID(g.user_id)
    now = dt.datetime.utcnow()
    next_review = now + dt.timedelta(days=7)

    try:
        # 중복 제거하되 등장 순서는 보존(응답용)
        ordered_unique = list(dict.fromkeys(normalized))
        existing = _load_existing(user_id, script, set(ordered_unique))

        for char in ordered_unique:
            row = existing.get(char)
            if row is None:
                row = UserScriptProgress(user_id=user_id, script=script, char=char)
                db.session.add(row)
                existing[char] = row

            row.level = max(row.level, 3)
            row.next_review_at = next_review
            row.updated_at = now

        db.session.commit()

        items = [_serialize(existing[c]) for c in ordered_unique]
        return jsonify({'code': 200, 'data': {'script': script, 'items': items}}), 200
    except Exception:
        db.session.rollback()
        return _fail('글자 밭 건너뛰기 처리')
