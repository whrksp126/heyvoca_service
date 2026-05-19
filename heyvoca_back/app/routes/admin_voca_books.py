"""
관리자 단어장(AdminVocaBook) 관리 API.

기존 /admin 페이지(어드민 토큰 인증)에서 단어장 목록·상세를 조회·편집하고,
서점(Bookstore)에 등록·노출까지 관리할 수 있도록 한다.

인증: X-Admin-Token 헤더 (admin.admin_required 데코레이터 재사용)
Blueprint prefix: /admin/voca-books
"""
import json
from datetime import datetime

from flask import Blueprint, request, jsonify
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

from app import db
from app.models.models import (
    AdminVocaBook,
    AdminVocaBookMap,
    Bookstore,
    Voca,
    VocaMeaning,
    VocaMeaningMap,
    VocaExample,
    VocaExampleMap,
)
from app.routes.admin import admin_required


admin_voca_books_bp = Blueprint(
    'admin_voca_books', __name__, url_prefix='/admin/voca-books'
)


# ──────────────────────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────────────────────

def _clamp_int(raw, default, min_val=1, max_val=None):
    try:
        val = int(raw)
    except (TypeError, ValueError):
        val = default
    val = max(min_val, val)
    if max_val is not None:
        val = min(val, max_val)
    return val


def _parse_json_field(raw):
    """admin_voca_book_map.voca_meanings/voca_examples 텍스트를 list로 파싱.

    실패하거나 빈 값이면 (None, raw) 반환 — 호출자가 parse_error 판단.
    """
    if raw is None or raw == '':
        return [], False
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed, False
        # list가 아닌 형태(dict, str 등)는 비정상으로 간주
        return None, True
    except (json.JSONDecodeError, TypeError):
        return None, True


def _bookstore_to_dict(bs):
    if bs is None:
        return None
    return {
        'id': bs.id,
        'name': bs.name,
        'downloads': bs.downloads,
        'category': bs.category,
        'category_id': bs.category_id,
        'color': bs.color,
        'gem': bs.gem,
        'hide': bs.hide,
        'level': bs.level,
        'level_id': bs.level_id,
        'admin_voca_book_id': bs.admin_voca_book_id,
        'created_at': bs.created_at.isoformat() if bs.created_at else None,
        'updated_at': bs.updated_at.isoformat() if bs.updated_at else None,
    }


def _book_to_dict(book, bookstore=None):
    return {
        'id': book.id,
        'book_nm': book.book_nm,
        'language': book.language,
        'source': book.source,
        'category': book.category,
        'username': book.username,
        'word_count': book.word_count,
        'updated_at': book.updated_at.isoformat() if book.updated_at else None,
        'bookstore': _bookstore_to_dict(bookstore),
    }


# ──────────────────────────────────────────────────────────
# 1. GET /admin/voca-books — 목록
# ──────────────────────────────────────────────────────────

@admin_voca_books_bp.route('/', methods=['GET'], strict_slashes=False)
@admin_required
def list_voca_books():
    """관리자 단어장 목록.

    Query params:
        page (int, 기본 1)
        page_size (int, 기본 20, 최대 100)
        source (str): 'all' | 'AI 생성' | '직접 제작' (URL 인코딩된 한글 그대로)
        q (str): book_nm LIKE 검색
        sort (str): 'updated_at' | 'id' (기본 updated_at, NULL은 뒤로)

    Response data:
        {
          items: [{...book_fields, bookstore: {...} | null}],
          total: int,
          page: int,
          page_size: int,
          source_counts: {"AI 생성": 52, "직접 제작": 13}
        }
    """
    page = _clamp_int(request.args.get('page'), 1, min_val=1)
    page_size = _clamp_int(request.args.get('page_size'), 20, min_val=1, max_val=100)
    source = (request.args.get('source') or 'all').strip()
    q = (request.args.get('q') or '').strip()
    sort = (request.args.get('sort') or 'updated_at').strip()

    query = AdminVocaBook.query

    if source and source != 'all':
        query = query.filter(AdminVocaBook.source == source)
    if q:
        query = query.filter(AdminVocaBook.book_nm.ilike(f'%{q}%'))

    if sort == 'id':
        query = query.order_by(AdminVocaBook.id.desc())
    else:
        # MySQL은 DESC 정렬 시 NULL을 자동으로 뒤로 배치하므로 별도 처리 불필요
        query = query.order_by(
            AdminVocaBook.updated_at.desc(),
            AdminVocaBook.id.desc(),
        )

    total = query.count()
    books = query.limit(page_size).offset((page - 1) * page_size).all()

    # 한 번에 bookstore lookup
    book_ids = [b.id for b in books]
    bookstores = {}
    if book_ids:
        rows = Bookstore.query.filter(
            Bookstore.admin_voca_book_id.in_(book_ids)
        ).all()
        for bs in rows:
            bookstores[bs.admin_voca_book_id] = bs

    items = [_book_to_dict(b, bookstores.get(b.id)) for b in books]

    # source_counts (필터와 무관, 전체 기준)
    raw_counts = (
        db.session.query(AdminVocaBook.source, func.count(AdminVocaBook.id))
        .group_by(AdminVocaBook.source)
        .all()
    )
    source_counts = {src: cnt for src, cnt in raw_counts}

    return jsonify({
        'code': 200,
        'data': {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'source_counts': source_counts,
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 2. GET /admin/voca-books/<id> — 상세
# ──────────────────────────────────────────────────────────

@admin_voca_books_bp.route('/<int:book_id>', methods=['GET'])
@admin_required
def get_voca_book(book_id):
    """단어장 상세 + 단어 목록 + bookstore 상태.

    각 단어의 voca_meanings/voca_examples는 JSON 파싱하여 list로 반환.
    파싱 실패 시 parse_error=true와 raw 필드를 함께 반환해 프론트가 폴백 가능.
    """
    book = AdminVocaBook.query.filter_by(id=book_id).first()
    if book is None:
        return jsonify({'code': 404, 'message': '단어장을 찾을 수 없습니다.'}), 404

    maps = (
        AdminVocaBookMap.query
        .options(joinedload(AdminVocaBookMap.voca))
        .filter_by(book_id=book_id)
        .order_by(AdminVocaBookMap.id.asc())
        .all()
    )

    bookstore = Bookstore.query.filter_by(admin_voca_book_id=book_id).first()

    words = []
    for m in maps:
        meanings, m_err = _parse_json_field(m.voca_meanings)
        examples, e_err = _parse_json_field(m.voca_examples)
        parse_error = bool(m_err or e_err)
        voca = m.voca
        words.append({
            'map_id': m.id,
            'voca_id': m.voca_id,
            'word': voca.word if voca else None,
            'pronunciation': voca.pronunciation if voca else None,
            'verb_forms': voca.verb_forms if voca else None,
            'voca_level': voca.level if voca else None,
            'is_active': voca.is_active if voca else None,
            'level': m.level,
            'meanings': meanings if not m_err else [],
            'examples': examples if not e_err else [],
            'raw_meanings': m.voca_meanings if m_err else None,
            'raw_examples': m.voca_examples if e_err else None,
            'parse_error': parse_error,
        })

    return jsonify({
        'code': 200,
        'data': {
            'book': _book_to_dict(book, bookstore),
            'words': words,
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 3. PATCH /admin/voca-books/<id> — 메타 수정
# ──────────────────────────────────────────────────────────

_EDITABLE_BOOK_FIELDS = {'book_nm', 'language', 'source', 'category', 'username'}


@admin_voca_books_bp.route('/<int:book_id>', methods=['PATCH'])
@admin_required
def patch_voca_book(book_id):
    """단어장 메타 수정. 들어온 필드만 setattr."""
    book = AdminVocaBook.query.filter_by(id=book_id).first()
    if book is None:
        return jsonify({'code': 404, 'message': '단어장을 찾을 수 없습니다.'}), 404

    payload = request.get_json(silent=True) or {}
    changed = False
    for k, v in payload.items():
        if k not in _EDITABLE_BOOK_FIELDS:
            continue
        # 필수 컬럼 빈 값 방지
        if k in ('book_nm', 'language', 'source') and (v is None or str(v).strip() == ''):
            return jsonify({'code': 400, 'message': f"'{k}' 은(는) 비울 수 없습니다."}), 400
        setattr(book, k, v)
        changed = True

    if changed:
        book.updated_at = datetime.utcnow()
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'code': 500, 'message': f'DB 오류: {e}'}), 500

    bookstore = Bookstore.query.filter_by(admin_voca_book_id=book_id).first()
    return jsonify({'code': 200, 'data': _book_to_dict(book, bookstore)}), 200


# ──────────────────────────────────────────────────────────
# 헬퍼: word_count 재계산
# ──────────────────────────────────────────────────────────

def _recalc_word_count(book_id):
    cnt = AdminVocaBookMap.query.filter_by(book_id=book_id).count()
    book = AdminVocaBook.query.filter_by(id=book_id).first()
    if book is not None:
        book.word_count = cnt
        book.updated_at = datetime.utcnow()
    return cnt


def _normalize_meanings(value):
    """프론트에서 list 또는 string으로 올 수 있음. 항상 list[str]로 정규화."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x) for x in value if str(x).strip() != '']
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        # 콤마 구분 fallback
        return [t.strip() for t in s.split(',') if t.strip()]
    return []


def _normalize_examples(value):
    """list[{origin,meaning}] 형태로 정규화. 빈 항목 제거.

    하위 호환: 과거 키 `en`/`ko`도 받아 새 키로 변환.
    """
    if not isinstance(value, list):
        return []
    out = []
    for it in value:
        if not isinstance(it, dict):
            continue
        origin = str(it.get('origin', it.get('en', '')) or '').strip()
        meaning = str(it.get('meaning', it.get('ko', '')) or '').strip()
        if not origin and not meaning:
            continue
        out.append({'origin': origin, 'meaning': meaning})
    return out


# ──────────────────────────────────────────────────────────
# 4. PATCH /admin/voca-books/<book_id>/words/<map_id> — 단어 의미/예문/level 수정
# ──────────────────────────────────────────────────────────

@admin_voca_books_bp.route('/<int:book_id>/words/<int:map_id>', methods=['PATCH'])
@admin_required
def patch_word(book_id, map_id):
    """admin_voca_book_map row의 voca_meanings/voca_examples/level 수정.

    body: { meanings: [...] | "csv", examples: [{origin, meaning}, ...], level: int|null }
    """
    m = AdminVocaBookMap.query.filter_by(id=map_id).first()
    if m is None:
        return jsonify({'code': 404, 'message': '단어 매핑을 찾을 수 없습니다.'}), 404
    if m.book_id != book_id:
        return jsonify({'code': 400, 'message': '단어장과 일치하지 않는 매핑입니다.'}), 400

    payload = request.get_json(silent=True) or {}

    if 'meanings' in payload:
        meanings = _normalize_meanings(payload.get('meanings'))
        m.voca_meanings = json.dumps(meanings, ensure_ascii=False)
    if 'examples' in payload:
        examples = _normalize_examples(payload.get('examples'))
        m.voca_examples = json.dumps(examples, ensure_ascii=False)
    if 'level' in payload:
        lv = payload.get('level')
        if lv is None or lv == '':
            m.level = None
        else:
            try:
                m.level = int(lv)
            except (TypeError, ValueError):
                return jsonify({'code': 400, 'message': 'level은 정수여야 합니다.'}), 400

    book = AdminVocaBook.query.filter_by(id=book_id).first()
    if book is not None:
        book.updated_at = datetime.utcnow()

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'DB 오류: {e}'}), 500

    voca = m.voca
    return jsonify({
        'code': 200,
        'data': {
            'map_id': m.id,
            'voca_id': m.voca_id,
            'word': voca.word if voca else None,
            'level': m.level,
            'meanings': json.loads(m.voca_meanings or '[]'),
            'examples': json.loads(m.voca_examples or '[]'),
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 5. POST /admin/voca-books/<book_id>/words — 단어 추가
# ──────────────────────────────────────────────────────────

@admin_voca_books_bp.route('/<int:book_id>/words', methods=['POST'])
@admin_required
def add_word(book_id):
    """단어장에 단어 추가.

    body:
      { voca_id: int }                                      # 기존 voca를 그대로 매핑
      또는
      { word, pronunciation?, verb_forms?, voca_level?,
        meanings: [...], examples: [...], level: int|null } # word로 조회/생성

    Query:
      force=true → 같은 word가 이미 있어도 신규 voca 생성

    응답:
      - 200: 추가됨 (data.map_id, data.voca_id, ...)
      - 409: 동음이의 후보 다수 (data.candidates) — 사용자 선택 필요
      - 409: 동일 (voca_id, book_id) 중복
    """
    book = AdminVocaBook.query.filter_by(id=book_id).first()
    if book is None:
        return jsonify({'code': 404, 'message': '단어장을 찾을 수 없습니다.'}), 404

    payload = request.get_json(silent=True) or {}
    force = (request.args.get('force') or '').lower() == 'true'

    voca = None
    voca_id = payload.get('voca_id')

    if voca_id:
        voca = Voca.query.filter_by(id=int(voca_id)).first()
        if voca is None:
            return jsonify({'code': 404, 'message': '단어를 찾을 수 없습니다.'}), 404
    else:
        word = (payload.get('word') or '').strip()
        if not word:
            return jsonify({'code': 400, 'message': 'voca_id 또는 word가 필요합니다.'}), 400

        candidates = Voca.query.filter_by(word=word).all()
        if candidates and not force:
            if len(candidates) >= 1:
                # 후보가 있으면 사용자에게 선택 기회 제공 (force=true 또는 voca_id 지정으로 재호출)
                return jsonify({
                    'code': 409,
                    'message': '동일한 단어가 이미 사전에 있습니다. 기존 단어를 선택하거나 force=true로 재호출하세요.',
                    'data': {
                        'candidates': [
                            {
                                'voca_id': v.id,
                                'word': v.word,
                                'pronunciation': v.pronunciation,
                                'verb_forms': v.verb_forms,
                                'level': v.level,
                            } for v in candidates
                        ],
                    },
                }), 409

        # 새 Voca 생성 (후보 없거나 force=true)
        voca = Voca(
            word=word,
            pronunciation=(payload.get('pronunciation') or None),
        )
        voca.verb_forms = payload.get('verb_forms') or None
        voca.level = payload.get('voca_level') or None
        voca.is_active = True
        db.session.add(voca)
        db.session.flush()  # voca.id 확보

    # 중복 매핑 검사
    dup = AdminVocaBookMap.query.filter_by(book_id=book_id, voca_id=voca.id).first()
    if dup is not None:
        return jsonify({
            'code': 409,
            'message': '이 단어는 이미 단어장에 포함되어 있습니다.',
            'data': {'existing_map_id': dup.id},
        }), 409

    meanings = _normalize_meanings(payload.get('meanings'))
    examples = _normalize_examples(payload.get('examples'))
    level = payload.get('level')
    try:
        level_int = int(level) if level not in (None, '') else None
    except (TypeError, ValueError):
        level_int = None

    new_map = AdminVocaBookMap()
    new_map.voca_id = voca.id
    new_map.book_id = book_id
    new_map.level = level_int
    new_map.voca_meanings = json.dumps(meanings, ensure_ascii=False)
    new_map.voca_examples = json.dumps(examples, ensure_ascii=False)
    db.session.add(new_map)

    try:
        db.session.flush()
        _recalc_word_count(book_id)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'DB 오류: {e}'}), 500

    return jsonify({
        'code': 200,
        'data': {
            'map_id': new_map.id,
            'voca_id': voca.id,
            'word': voca.word,
            'pronunciation': voca.pronunciation,
            'verb_forms': voca.verb_forms,
            'voca_level': voca.level,
            'level': new_map.level,
            'meanings': meanings,
            'examples': examples,
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 6. DELETE /admin/voca-books/<book_id>/words/<map_id> — 단어 제거
# ──────────────────────────────────────────────────────────

@admin_voca_books_bp.route('/<int:book_id>/words/<int:map_id>', methods=['DELETE'])
@admin_required
def delete_word(book_id, map_id):
    """admin_voca_book_map row만 삭제. Voca 자체는 다른 단어장에서 참조 가능하므로 절대 삭제하지 않는다."""
    m = AdminVocaBookMap.query.filter_by(id=map_id).first()
    if m is None:
        return jsonify({'code': 404, 'message': '단어 매핑을 찾을 수 없습니다.'}), 404
    if m.book_id != book_id:
        return jsonify({'code': 400, 'message': '단어장과 일치하지 않는 매핑입니다.'}), 400

    db.session.delete(m)
    try:
        db.session.flush()
        _recalc_word_count(book_id)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'DB 오류: {e}'}), 500

    return jsonify({'code': 200, 'data': {'deleted_map_id': map_id}}), 200


# ──────────────────────────────────────────────────────────
# 7. POST /admin/voca-books/<book_id>/bookstore/toggle — 서점 등록 토글
# ──────────────────────────────────────────────────────────

_BOOKSTORE_REQUIRED_ON_CREATE = ('gem', 'category', 'level_id')


@admin_voca_books_bp.route('/<int:book_id>/bookstore/toggle', methods=['POST'])
@admin_required
def toggle_bookstore(book_id):
    """단어장의 서점 노출 토글.

    - Bookstore 레코드가 없으면 신규 생성 (`hide='N'`).
      body 필수: gem(int), category(str), level_id(int)
      body 선택: name(기본 book_nm), downloads(기본 0), color, category_id, level
    - 있으면 hide만 'N'↔'Y' 토글. (downloads/created_at 보존)

    응답: { code, data: {bookstore, action: 'created'|'shown'|'hidden'} }
    """
    book = AdminVocaBook.query.filter_by(id=book_id).first()
    if book is None:
        return jsonify({'code': 404, 'message': '단어장을 찾을 수 없습니다.'}), 404

    payload = request.get_json(silent=True) or {}

    bs = Bookstore.query.filter_by(admin_voca_book_id=book_id).first()
    now = datetime.utcnow()

    if bs is None:
        missing = [k for k in _BOOKSTORE_REQUIRED_ON_CREATE if payload.get(k) in (None, '')]
        if missing:
            return jsonify({
                'code': 400,
                'message': f"신규 등록 시 필수 필드 누락: {', '.join(missing)}",
            }), 400

        try:
            gem = int(payload.get('gem'))
            level_id = int(payload.get('level_id'))
        except (TypeError, ValueError):
            return jsonify({'code': 400, 'message': 'gem/level_id는 정수여야 합니다.'}), 400

        bs = Bookstore()
        bs.name = (payload.get('name') or book.book_nm)[:100]
        bs.downloads = int(payload.get('downloads') or 0)
        bs.category = str(payload.get('category'))[:50]
        bs.category_id = payload.get('category_id') if payload.get('category_id') not in ('', None) else None
        bs.color = payload.get('color') or None
        bs.gem = gem
        bs.hide = 'N'
        bs.level = payload.get('level') or None
        bs.level_id = level_id
        bs.book_id = None
        bs.admin_voca_book_id = book_id
        bs.created_at = now
        bs.updated_at = now
        db.session.add(bs)
        action = 'created'
    else:
        bs.hide = 'Y' if bs.hide == 'N' else 'N'
        bs.updated_at = now
        action = 'hidden' if bs.hide == 'Y' else 'shown'

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'DB 오류: {e}'}), 500

    return jsonify({
        'code': 200,
        'data': {
            'bookstore': _bookstore_to_dict(bs),
            'action': action,
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 8. PATCH /admin/voca-books/<book_id>/bookstore — 서점 정보 수정
# ──────────────────────────────────────────────────────────

_EDITABLE_BOOKSTORE_FIELDS = {
    'name', 'downloads', 'category', 'category_id', 'color',
    'gem', 'level', 'level_id',
}


@admin_voca_books_bp.route('/<int:book_id>/bookstore', methods=['PATCH'])
@admin_required
def patch_bookstore(book_id):
    """서점 등록 정보 수정. 들어온 필드만 갱신."""
    bs = Bookstore.query.filter_by(admin_voca_book_id=book_id).first()
    if bs is None:
        return jsonify({'code': 404, 'message': '아직 서점에 등록되지 않았습니다. 먼저 등록하세요.'}), 404

    payload = request.get_json(silent=True) or {}
    changed = False
    for k, v in payload.items():
        if k not in _EDITABLE_BOOKSTORE_FIELDS:
            continue
        if k in ('gem', 'downloads', 'level_id', 'category_id'):
            if v in (None, ''):
                if k == 'category_id':
                    setattr(bs, k, None)
                    changed = True
                continue
            try:
                v = int(v)
            except (TypeError, ValueError):
                return jsonify({'code': 400, 'message': f"'{k}' 은(는) 정수여야 합니다."}), 400
        if k == 'name' and (v is None or str(v).strip() == ''):
            return jsonify({'code': 400, 'message': "'name' 은(는) 비울 수 없습니다."}), 400
        if k == 'category' and (v is None or str(v).strip() == ''):
            return jsonify({'code': 400, 'message': "'category' 은(는) 비울 수 없습니다."}), 400
        setattr(bs, k, v)
        changed = True

    if changed:
        bs.updated_at = datetime.utcnow()
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'code': 500, 'message': f'DB 오류: {e}'}), 500

    return jsonify({'code': 200, 'data': _bookstore_to_dict(bs)}), 200


# ──────────────────────────────────────────────────────────
# 10. GET /admin/voca-books/_voca/<voca_id>/dictionary — 사전에 있는 의미/예문 조회
# ──────────────────────────────────────────────────────────

@admin_voca_books_bp.route('/_voca/<int:voca_id>/dictionary', methods=['GET'])
@admin_required
def get_voca_dictionary(voca_id):
    """voca_id 단어가 사전(voca_meaning_map/voca_example_map)에 가진 의미·예문 전체 반환.

    단어장 편집 화면에서 "사전에서 가져오기" 패널의 데이터 소스로 사용.
    예문은 EN/KO 모두 <strong class="target-word"> 강조가 그대로 보존됨.
    """
    voca = Voca.query.filter_by(id=voca_id).first()
    if voca is None:
        return jsonify({'code': 404, 'message': '단어를 찾을 수 없습니다.'}), 404

    meanings = (
        db.session.query(VocaMeaning)
        .join(VocaMeaningMap, VocaMeaningMap.meaning_id == VocaMeaning.id)
        .filter(VocaMeaningMap.voca_id == voca_id)
        .order_by(VocaMeaning.id.asc())
        .all()
    )
    examples = (
        db.session.query(VocaExample)
        .join(VocaExampleMap, VocaExampleMap.example_id == VocaExample.id)
        .filter(VocaExampleMap.voca_id == voca_id)
        .order_by(VocaExample.id.asc())
        .all()
    )

    return jsonify({
        'code': 200,
        'data': {
            'voca': {
                'id': voca.id,
                'word': voca.word,
                'pronunciation': voca.pronunciation,
                'verb_forms': voca.verb_forms,
                'level': voca.level,
            },
            'meanings': [{'id': m.id, 'meaning': m.meaning} for m in meanings],
            'examples': [{'id': e.id, 'origin': e.exam_en, 'meaning': e.exam_ko} for e in examples],
        },
    }), 200


# ──────────────────────────────────────────────────────────
# 9. GET /admin/voca-books/_search-voca — voca 후보 검색
# ──────────────────────────────────────────────────────────

@admin_voca_books_bp.route('/_search-voca', methods=['GET'])
@admin_required
def search_voca():
    """단어 추가 시 기존 voca 후보를 빠르게 찾는다.

    Query: q (prefix), limit (기본 20, 최대 50)
    """
    q = (request.args.get('q') or '').strip()
    limit = _clamp_int(request.args.get('limit'), 20, min_val=1, max_val=50)
    if not q:
        return jsonify({'code': 200, 'data': {'items': []}}), 200

    rows = (
        Voca.query
        .filter(Voca.word.ilike(f'{q}%'))
        .order_by(Voca.word.asc(), Voca.id.asc())
        .limit(limit)
        .all()
    )
    items = [
        {
            'voca_id': v.id,
            'word': v.word,
            'pronunciation': v.pronunciation,
            'verb_forms': v.verb_forms,
            'level': v.level,
            'is_active': v.is_active,
        } for v in rows
    ]
    return jsonify({'code': 200, 'data': {'items': items}}), 200
