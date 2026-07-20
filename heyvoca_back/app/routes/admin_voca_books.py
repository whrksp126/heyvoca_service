"""
관리자 단어장(AdminVocaBook) 관리 API.

기존 /admin 페이지(어드민 토큰 인증)에서 단어장 목록·상세를 조회·편집하고,
서점(Bookstore)에 등록·노출까지 관리할 수 있도록 한다.

인증: X-Admin-Token 헤더 (admin.admin_required 데코레이터 재사용)
Blueprint prefix: /admin/voca-books
"""
import json
import logging
from datetime import datetime

from flask import Blueprint, request, jsonify
from sqlalchemy import func, or_, literal, case, select, union_all, text, Integer as SAInteger
from sqlalchemy.orm import joinedload

from app.utils.example_tagging import apply_emphasis

from app import db
from app.models.models import (
    AdminVocaBook,
    AdminVocaBookMap,
    Bookstore,
    Voca,
    VocaBook,
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
        sort_by (str): id | book_nm | language | source | category | word_count |
                       bookstore | updated_at (기본 updated_at)
        sort_dir (str): asc | desc (기본 desc)
        sort (str, deprecated): 'updated_at' | 'id' 하위호환 — sort_by 미지정 시만 적용

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

    # sort_by / sort_dir (신규) — sort (deprecated) 하위호환
    sort_by = (request.args.get('sort_by') or '').strip()
    sort_dir = (request.args.get('sort_dir') or 'desc').strip().lower()
    if not sort_by:
        legacy_sort = (request.args.get('sort') or 'updated_at').strip()
        sort_by = legacy_sort if legacy_sort in ('id', 'updated_at') else 'updated_at'

    if sort_dir not in ('asc', 'desc'):
        sort_dir = 'desc'

    query = AdminVocaBook.query

    if source and source != 'all':
        query = query.filter(AdminVocaBook.source == source)
    if q:
        query = query.filter(AdminVocaBook.book_nm.ilike(f'%{q}%'))

    # bookstore 정렬은 LEFT JOIN 필요 (등록된 항목이 먼저 / 나중)
    SORTABLE_COLUMNS = {
        'id': AdminVocaBook.id,
        'book_nm': AdminVocaBook.book_nm,
        'language': AdminVocaBook.language,
        'source': AdminVocaBook.source,
        'category': AdminVocaBook.category,
        'word_count': AdminVocaBook.word_count,
        'updated_at': AdminVocaBook.updated_at,
    }

    if sort_by == 'bookstore':
        # bookstore 등록 여부 + 노출 여부 기준. 등록(가시) > 등록(숨김) > 미등록 순(desc 기본).
        from sqlalchemy import case, literal
        bookstore_score = case(
            (Bookstore.id.is_(None), literal(0)),
            (Bookstore.hide == 'N', literal(2)),
            else_=literal(1),
        )
        query = query.outerjoin(Bookstore, Bookstore.admin_voca_book_id == AdminVocaBook.id)
        primary = bookstore_score.asc() if sort_dir == 'asc' else bookstore_score.desc()
        query = query.order_by(primary, AdminVocaBook.id.desc())
    elif sort_by in SORTABLE_COLUMNS:
        col = SORTABLE_COLUMNS[sort_by]
        primary = col.asc() if sort_dir == 'asc' else col.desc()
        query = query.order_by(primary, AdminVocaBook.id.desc())
    else:
        # 안전망: 알 수 없는 sort_by → updated_at desc
        query = query.order_by(AdminVocaBook.updated_at.desc(), AdminVocaBook.id.desc())

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
            logging.getLogger(__name__).error('book 수정 DB 오류', exc_info=True)
            return jsonify({'code': 500, 'message': '데이터베이스 처리 중 오류가 발생했습니다.'}), 500

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
        # 저장 시 강조 안 된 예문 자동 태깅 (이미 강조 skip → 1차 → 잔여분 GPT)
        ms = _normalize_meanings(payload.get('meanings')) if 'meanings' in payload \
            else json.loads(m.voca_meanings or '[]')
        apply_emphasis(m.voca.word if m.voca else '', ms, examples, 'origin', 'meaning')
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
        logging.getLogger(__name__).error('word 수정 DB 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '데이터베이스 처리 중 오류가 발생했습니다.'}), 500

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
    # 단어 추가 시 강조 안 된 예문 자동 태깅
    apply_emphasis(voca.word, meanings, examples, 'origin', 'meaning')
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
        logging.getLogger(__name__).error('word 추가 DB 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '데이터베이스 처리 중 오류가 발생했습니다.'}), 500

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
        logging.getLogger(__name__).error('word 삭제 DB 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '데이터베이스 처리 중 오류가 발생했습니다.'}), 500

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
        logging.getLogger(__name__).error('bookstore 토글 DB 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '데이터베이스 처리 중 오류가 발생했습니다.'}), 500

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
            logging.getLogger(__name__).error('bookstore 수정 DB 오류', exc_info=True)
            return jsonify({'code': 500, 'message': '데이터베이스 처리 중 오류가 발생했습니다.'}), 500

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
# 11. GET /admin/voca-books/unified — 통합 단어장 목록 (페이지네이션)
# ──────────────────────────────────────────────────────────

_UNIFIED_SORT_COLS = {
    'book_type', 'book_nm', 'language', 'source', 'category',
    'word_count', 'is_registered', 'username', 'updated_at',
}


def _build_admin_select(q_filter):
    """AdminVocaBook → 공통 컬럼 select (Core expression).

    is_registered 컬럼: Bookstore.admin_voca_book_id 로 EXISTS 체크.
    """
    avb = AdminVocaBook.__table__
    bs = Bookstore.__table__

    is_reg = (
        select(literal(1))
        .select_from(bs)
        .where(bs.c.admin_voca_book_id == avb.c.id)
        .correlate(avb)
        .exists()
        .label('is_registered')
    )

    stmt = select(
        avb.c.id,
        avb.c.book_nm,
        avb.c.language,
        avb.c.source,
        avb.c.category,
        avb.c.username,
        avb.c.word_count,
        avb.c.updated_at,
        literal('admin').label('book_type'),
        is_reg,
    ).select_from(avb)

    if q_filter:
        stmt = stmt.where(avb.c.book_nm.ilike(f'%{q_filter}%'))

    return stmt


def _build_legacy_select(q_filter):
    """VocaBook → 공통 컬럼 select (Core expression).

    is_registered 컬럼: Bookstore.book_id 로 EXISTS 체크.
    """
    vb = VocaBook.__table__
    bs = Bookstore.__table__

    is_reg = (
        select(literal(1))
        .select_from(bs)
        .where(bs.c.book_id == vb.c.id)
        .correlate(vb)
        .exists()
        .label('is_registered')
    )

    stmt = select(
        vb.c.id,
        vb.c.book_nm,
        vb.c.language,
        vb.c.source,
        vb.c.category,
        vb.c.username,
        vb.c.word_count,
        vb.c.updated_at,
        literal('legacy').label('book_type'),
        is_reg,
    ).select_from(vb)

    if q_filter:
        stmt = stmt.where(vb.c.book_nm.ilike(f'%{q_filter}%'))

    return stmt


def _col_expr(subq, sort_by, sort_dir):
    """서브쿼리 컬럼 + 방향 → SQLAlchemy order_by expression."""
    col = subq.c[sort_by]
    if sort_dir == 'asc':
        expr = col.asc()
    else:
        expr = col.desc()
    return expr


@admin_voca_books_bp.route('/unified', methods=['GET'])
@admin_required
def unified_voca_books():
    """legacy VocaBook + admin AdminVocaBook 통합 페이지네이션 목록.

    Query params:
        page (int, 기본 1, min 1)
        page_size (int, 기본 50, min 1, max 100)
        type: all | admin | legacy (기본 all)
        q: book_nm ILIKE 검색
        sort_by: book_type | book_nm | language | source | category |
                 word_count | is_registered | username | updated_at (기본 updated_at)
        sort_dir: asc | desc (기본 desc)

    Response:
        { code:200, data: {
            items: [{id, book_nm, language, source, category, username,
                     word_count, updated_at, book_type, is_registered,
                     bookstore_id, bookstore_name}],
            total: int,
            page: int, page_size: int,
            type_counts: { all, admin, legacy }
        }}
    """
    page = _clamp_int(request.args.get('page'), 1, min_val=1)
    page_size = _clamp_int(request.args.get('page_size'), 50, min_val=1, max_val=100)
    book_type = (request.args.get('type') or 'all').strip().lower()
    if book_type not in ('all', 'admin', 'legacy'):
        book_type = 'all'
    q = (request.args.get('q') or '').strip()
    sort_by = (request.args.get('sort_by') or 'updated_at').strip()
    if sort_by not in _UNIFIED_SORT_COLS:
        sort_by = 'updated_at'
    sort_dir = (request.args.get('sort_dir') or 'desc').strip().lower()
    if sort_dir not in ('asc', 'desc'):
        sort_dir = 'desc'

    offset = (page - 1) * page_size

    # ── type=admin 또는 type=legacy 단순 경로 ─────────────────────────
    if book_type == 'admin':
        model = AdminVocaBook
        q_obj = model.query
        if q:
            q_obj = q_obj.filter(model.book_nm.ilike(f'%{q}%'))

        # 정렬 (is_registered 제외 단순 컬럼 정렬)
        if sort_by == 'is_registered':
            # LEFT JOIN + CASE
            is_reg_expr = case(
                (Bookstore.admin_voca_book_id.isnot(None), literal(1)),
                else_=literal(0),
            )
            q_obj = q_obj.outerjoin(
                Bookstore, Bookstore.admin_voca_book_id == model.id
            )
            order_col = is_reg_expr.asc() if sort_dir == 'asc' else is_reg_expr.desc()
        elif sort_by == 'book_type':
            # admin만 조회 중이므로 모두 동일 — 보조 정렬만 적용
            order_col = model.id.desc()
        else:
            raw_col = getattr(model, sort_by, model.updated_at)
            order_col = raw_col.asc() if sort_dir == 'asc' else raw_col.desc()

        total = q_obj.count()
        books = q_obj.order_by(order_col, model.id.desc()).limit(page_size).offset(offset).all()

        book_ids = [b.id for b in books]
        bs_map = {}
        if book_ids:
            for bs in Bookstore.query.filter(Bookstore.admin_voca_book_id.in_(book_ids)).all():
                bs_map[bs.admin_voca_book_id] = bs

        items = []
        for b in books:
            bs = bs_map.get(b.id)
            items.append({
                'id': b.id,
                'book_nm': b.book_nm,
                'language': b.language,
                'source': b.source,
                'category': b.category,
                'username': b.username,
                'word_count': b.word_count,
                'updated_at': b.updated_at.isoformat() if b.updated_at else None,
                'book_type': 'admin',
                'is_registered': bs is not None,
                'bookstore_id': bs.id if bs else None,
                'bookstore_name': bs.name if bs else None,
            })

        # type_counts: q 적용, type 무관 전체 기준
        admin_cnt = AdminVocaBook.query.filter(
            AdminVocaBook.book_nm.ilike(f'%{q}%') if q else literal(True)
        ).count()
        legacy_cnt = VocaBook.query.filter(
            VocaBook.book_nm.ilike(f'%{q}%') if q else literal(True)
        ).count()

        return jsonify({
            'code': 200,
            'data': {
                'items': items,
                'total': total,
                'page': page,
                'page_size': page_size,
                'type_counts': {
                    'all': admin_cnt + legacy_cnt,
                    'admin': admin_cnt,
                    'legacy': legacy_cnt,
                },
            },
        }), 200

    if book_type == 'legacy':
        model = VocaBook
        q_obj = model.query
        if q:
            q_obj = q_obj.filter(model.book_nm.ilike(f'%{q}%'))

        if sort_by == 'is_registered':
            is_reg_expr = case(
                (Bookstore.book_id.isnot(None), literal(1)),
                else_=literal(0),
            )
            q_obj = q_obj.outerjoin(Bookstore, Bookstore.book_id == model.id)
            order_col = is_reg_expr.asc() if sort_dir == 'asc' else is_reg_expr.desc()
        elif sort_by == 'book_type':
            order_col = model.id.desc()
        else:
            raw_col = getattr(model, sort_by, model.updated_at)
            order_col = raw_col.asc() if sort_dir == 'asc' else raw_col.desc()

        total = q_obj.count()
        books = q_obj.order_by(order_col, model.id.desc()).limit(page_size).offset(offset).all()

        book_ids = [b.id for b in books]
        bs_map = {}
        if book_ids:
            for bs in Bookstore.query.filter(Bookstore.book_id.in_(book_ids)).all():
                bs_map[bs.book_id] = bs

        items = []
        for b in books:
            bs = bs_map.get(b.id)
            items.append({
                'id': b.id,
                'book_nm': b.book_nm,
                'language': b.language,
                'source': b.source,
                'category': b.category,
                'username': b.username,
                'word_count': b.word_count,
                'updated_at': b.updated_at.isoformat() if b.updated_at else None,
                'book_type': 'legacy',
                'is_registered': bs is not None,
                'bookstore_id': bs.id if bs else None,
                'bookstore_name': bs.name if bs else None,
            })

        admin_cnt = AdminVocaBook.query.filter(
            AdminVocaBook.book_nm.ilike(f'%{q}%') if q else literal(True)
        ).count()
        legacy_cnt = VocaBook.query.filter(
            VocaBook.book_nm.ilike(f'%{q}%') if q else literal(True)
        ).count()

        return jsonify({
            'code': 200,
            'data': {
                'items': items,
                'total': total,
                'page': page,
                'page_size': page_size,
                'type_counts': {
                    'all': admin_cnt + legacy_cnt,
                    'admin': admin_cnt,
                    'legacy': legacy_cnt,
                },
            },
        }), 200

    # ── type=all : union_all 서브쿼리 + DB 레벨 limit/offset ──────────
    admin_stmt = _build_admin_select(q)
    legacy_stmt = _build_legacy_select(q)

    union_stmt = union_all(admin_stmt, legacy_stmt).subquery('unified')

    # 정렬 컬럼 결정
    if sort_by == 'updated_at':
        # NULL last: desc → NULL을 뒤로(is null asc), asc → NULL을 뒤로(is null asc)
        null_order = union_stmt.c.updated_at.is_(None).asc()
        primary = (
            union_stmt.c.updated_at.asc() if sort_dir == 'asc'
            else union_stmt.c.updated_at.desc()
        )
        order_exprs = [null_order, primary, union_stmt.c.id.desc()]
    else:
        col = union_stmt.c[sort_by]
        primary = col.asc() if sort_dir == 'asc' else col.desc()
        order_exprs = [primary, union_stmt.c.updated_at.desc(), union_stmt.c.id.desc()]

    base_q = select(union_stmt).order_by(*order_exprs)

    # 전체 count (서브쿼리 감싸기)
    count_subq = base_q.subquery('cnt_wrap')
    total = db.session.execute(
        select(func.count()).select_from(count_subq)
    ).scalar()

    # 페이지 슬라이스
    rows = db.session.execute(
        base_q.limit(page_size).offset(offset)
    ).fetchall()

    # Bookstore 조회 (슬라이스 결과에 대해서만)
    admin_ids = [r.id for r in rows if r.book_type == 'admin']
    legacy_ids = [r.id for r in rows if r.book_type == 'legacy']

    admin_bs_map = {}
    if admin_ids:
        for bs in Bookstore.query.filter(Bookstore.admin_voca_book_id.in_(admin_ids)).all():
            admin_bs_map[bs.admin_voca_book_id] = bs

    legacy_bs_map = {}
    if legacy_ids:
        for bs in Bookstore.query.filter(Bookstore.book_id.in_(legacy_ids)).all():
            legacy_bs_map[bs.book_id] = bs

    items = []
    for r in rows:
        if r.book_type == 'admin':
            bs = admin_bs_map.get(r.id)
        else:
            bs = legacy_bs_map.get(r.id)
        items.append({
            'id': r.id,
            'book_nm': r.book_nm,
            'language': r.language,
            'source': r.source,
            'category': r.category,
            'username': r.username,
            'word_count': r.word_count,
            'updated_at': r.updated_at.isoformat() if r.updated_at else None,
            'book_type': r.book_type,
            'is_registered': bool(r.is_registered),
            'bookstore_id': bs.id if bs else None,
            'bookstore_name': bs.name if bs else None,
        })

    # type_counts (q 적용, type 무관)
    admin_cnt = AdminVocaBook.query.filter(
        AdminVocaBook.book_nm.ilike(f'%{q}%') if q else literal(True)
    ).count()
    legacy_cnt = VocaBook.query.filter(
        VocaBook.book_nm.ilike(f'%{q}%') if q else literal(True)
    ).count()

    return jsonify({
        'code': 200,
        'data': {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'type_counts': {
                'all': admin_cnt + legacy_cnt,
                'admin': admin_cnt,
                'legacy': legacy_cnt,
            },
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
