import logging
import os
import re
import json
from functools import wraps
from datetime import datetime
from io import BytesIO

import pandas as pd
from flask import request, jsonify

from app.routes import admin_bp
from app.models.models import (
    db,
    Bookstore, BookstoreCategory, Level,
    VocaBook, AdminVocaBook,
    Voca, VocaMeaning, VocaExample,
    VocaBookMap, AdminVocaBookMap,
    VocaMeaningMap, VocaExampleMap,
    UserVocaBook,
)

# Strong 태그 삽입 헬퍼는 app/utils/example_tagging.py 로 이동 (voca_books 와 공용)
from app.utils.example_tagging import (
    _tag_en, _tag_ko, _tag_batch_gpt, tag_example_pair, apply_emphasis, STRONG,
)


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = request.headers.get('X-Admin-API-Key')
        if not api_key or api_key != os.getenv('ADMIN_API_KEY'):
            return jsonify({'code': 401, 'message': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


# ──────────────────────────────────────────
# Level / Category
# ──────────────────────────────────────────

@admin_bp.route('/level', methods=['GET'])
@admin_required
def get_levels():
    levels = Level.query.order_by(Level.level).all()
    data = [{'id': l.id, 'level': l.level, 'level_name': l.level_name, 'level_description': l.level_description} for l in levels]
    return jsonify({'code': 200, 'data': data})


@admin_bp.route('/category', methods=['GET'])
@admin_required
def get_categories():
    categories = BookstoreCategory.query.order_by(BookstoreCategory.sort_order, BookstoreCategory.category).all()
    data = [{'id': c.id, 'category': c.category, 'sort_order': c.sort_order} for c in categories]
    return jsonify({'code': 200, 'data': data})


# ──────────────────────────────────────────
# Bookstore
# ──────────────────────────────────────────

@admin_bp.route('/bookstore', methods=['GET'])
@admin_required
def get_bookstores():
    bookstores = Bookstore.query.order_by(Bookstore.created_at.desc()).all()
    data = []
    for b in bookstores:
        category_name = '-'
        if b.category_id and b.bookstore_category:
            category_name = b.bookstore_category.category
        data.append({
            'id': b.id,
            'name': b.name,
            'downloads': b.downloads,
            'category': b.category,
            'category_id': b.category_id,
            'category_name': category_name,
            'color': b.color,
            'gem': b.gem,
            'hide': b.hide,
            'level': b.level,
            'level_id': b.level_id,
            'book_id': b.book_id,
            'admin_voca_book_id': b.admin_voca_book_id,
            'created_at': b.created_at.isoformat() if b.created_at else None,
            'updated_at': b.updated_at.isoformat() if b.updated_at else None,
        })
    return jsonify({'code': 200, 'data': data})


@admin_bp.route('/bookstore', methods=['POST'])
@admin_required
def create_bookstore():
    data = request.json
    color = data.get('color', '')
    if isinstance(color, dict):
        color = json.dumps(color)

    bookstore = Bookstore(
        name=data['name'],
        downloads=data.get('order', 0),
        category=data.get('category', ''),
        color=color,
        hide='N' if data.get('is_visible', True) else 'Y',
        gem=data.get('gem', 0),
        level=data.get('level_name'),
        level_id=data['level_id'],
        book_id=data.get('book_id'),
        admin_voca_book_id=data.get('admin_voca_book_id'),
        category_id=data.get('category_id'),
    )
    db.session.add(bookstore)
    db.session.commit()
    return jsonify({'code': 200, 'data': {'id': bookstore.id}})


@admin_bp.route('/bookstore/<int:bookstore_id>', methods=['PATCH'])
@admin_required
def update_bookstore(bookstore_id):
    bookstore = Bookstore.query.get_or_404(bookstore_id)
    data = request.json

    bookstore.name = data.get('name', bookstore.name)

    if 'color' in data:
        color = data['color']
        if isinstance(color, dict):
            color = json.dumps(color)
        bookstore.color = color

    bookstore.hide = 'N' if data.get('is_visible', True) else 'Y'
    bookstore.gem = data.get('gem', bookstore.gem)
    bookstore.updated_at = datetime.utcnow()

    if 'category_id' in data:
        bookstore.category_id = data['category_id'] if data['category_id'] else None

    db.session.commit()
    return jsonify({'code': 200, 'data': {'success': True}})


@admin_bp.route('/bookstore/<int:bookstore_id>', methods=['DELETE'])
@admin_required
def delete_bookstore(bookstore_id):
    bookstore = Bookstore.query.get_or_404(bookstore_id)

    user_voca_book = UserVocaBook.query.filter_by(bookstore_id=bookstore_id).first()
    if user_voca_book:
        bookstore.hide = 'Y'
        db.session.commit()
        return jsonify({'code': 200, 'data': {'message': '유저가 사용 중인 북스토어이므로 숨김 처리되었습니다.'}})
    else:
        db.session.delete(bookstore)
        db.session.commit()
        return jsonify({'code': 200, 'data': {'message': '북스토어가 삭제되었습니다.'}})


# ──────────────────────────────────────────
# VocaBook 목록
# ──────────────────────────────────────────

@admin_bp.route('/voca_books', methods=['GET'])
@admin_required
def get_voca_books_list():
    search = request.args.get('search', '')
    category = request.args.get('category', '')

    registered_bookstores = Bookstore.query.with_entities(
        Bookstore.book_id, Bookstore.admin_voca_book_id, Bookstore.id, Bookstore.name
    ).all()
    registered_legacy = {b.book_id: {'id': b.id, 'name': b.name} for b in registered_bookstores if b.book_id}
    registered_admin = {b.admin_voca_book_id: {'id': b.id, 'name': b.name} for b in registered_bookstores if b.admin_voca_book_id}

    voca_query = VocaBook.query
    if search:
        voca_query = voca_query.filter(VocaBook.book_nm.ilike(f'%{search}%'))
    if category:
        voca_query = voca_query.filter(VocaBook.category == category)
    legacy_books = voca_query.all()

    admin_query = AdminVocaBook.query
    if search:
        admin_query = admin_query.filter(AdminVocaBook.book_nm.ilike(f'%{search}%'))
    if category:
        admin_query = admin_query.filter(AdminVocaBook.category == category)
    admin_books = admin_query.all()

    def book_to_dict(book, book_type, registered_map):
        reg_info = registered_map.get(book.id)
        return {
            'id': book.id,
            'book_nm': book.book_nm,
            'language': book.language,
            'source': book.source,
            'category': book.category,
            'username': book.username,
            'word_count': book.word_count,
            'updated_at': book.updated_at.isoformat() if book.updated_at else None,
            'book_type': book_type,
            'is_registered': bool(reg_info),
            'bookstore_id': reg_info['id'] if reg_info else None,
            'bookstore_name': reg_info['name'] if reg_info else None,
        }

    legacy_data = [book_to_dict(b, 'legacy', registered_legacy) for b in legacy_books]
    admin_data = [book_to_dict(b, 'admin', registered_admin) for b in admin_books]

    return jsonify({'code': 200, 'data': {'legacy': legacy_data, 'admin': admin_data}})


# ──────────────────────────────────────────
# VocaBook CRUD
# ──────────────────────────────────────────

@admin_bp.route('/voca_book', methods=['POST'])
@admin_required
def create_voca_book():
    try:
        book_nm = request.form.get('book_nm', '').strip()
        language = request.form.get('language', '').strip()
        source = request.form.get('source', '').strip()
        category = request.form.get('category', '').strip()
        username = request.form.get('username', '').strip()

        if not book_nm or not language or not source:
            return jsonify({'code': 400, 'message': '필수 항목(이름, 언어, 소스)을 입력해주세요.'}), 400

        if 'excel_file' not in request.files or request.files['excel_file'].filename == '':
            return jsonify({'code': 400, 'message': '엑셀 파일을 업로드해주세요.'}), 400

        voca_book = VocaBook(
            book_nm=book_nm, language=language, source=source,
            category=category if category else None,
            username=username if username else None,
            word_count=0, updated_at=datetime.utcnow(),
        )
        db.session.add(voca_book)
        db.session.flush()

        df = pd.read_excel(BytesIO(request.files['excel_file'].read()), header=None)
        word_count = 0

        for _, row in df.iterrows():
            if pd.isna(row[0]):
                continue
            word = str(row[0]).strip()
            if not word:
                continue

            voca = Voca(word=word)
            db.session.add(voca)
            db.session.flush()
            db.session.add(VocaBookMap(voca_id=voca.id, book_id=voca_book.id))

            if len(row) > 1 and pd.notna(row[1]):
                for mt in [m.strip() for m in str(row[1]).split(',') if m.strip()]:
                    vm = VocaMeaning(meaning=mt)
                    db.session.add(vm)
                    db.session.flush()
                    db.session.add(VocaMeaningMap(voca_id=voca.id, meaning_id=vm.id))

            col_idx = 2
            while col_idx < len(row):
                if pd.isna(row[col_idx]):
                    col_idx += 2
                    continue
                exam_en = str(row[col_idx]).strip()
                if not exam_en:
                    col_idx += 2
                    continue
                exam_ko = str(row[col_idx + 1]).strip() if col_idx + 1 < len(row) and pd.notna(row[col_idx + 1]) else ''
                ve = VocaExample(exam_en=exam_en, exam_ko=exam_ko)
                db.session.add(ve)
                db.session.flush()
                db.session.add(VocaExampleMap(voca_id=voca.id, example_id=ve.id))
                col_idx += 2

            word_count += 1

        voca_book.word_count = word_count
        db.session.commit()
        return jsonify({'code': 200, 'data': {'id': voca_book.id, 'word_count': word_count}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('voca_book 업로드 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/voca_book/<int:voca_book_id>', methods=['PATCH'])
@admin_required
def update_voca_book(voca_book_id):
    try:
        data = request.json
        voca_book = VocaBook.query.get_or_404(voca_book_id)

        for field in ('book_nm', 'language', 'source'):
            if field in data:
                setattr(voca_book, field, data[field])
        if 'category' in data:
            voca_book.category = data['category'] if data['category'] else None
        if 'username' in data:
            voca_book.username = data['username'] if data['username'] else None

        voca_book.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'code': 200, 'data': {'success': True}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('voca_book 수정 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/voca_book/<int:voca_book_id>/words', methods=['GET'])
@admin_required
def get_voca_book_words(voca_book_id):
    voca_book = VocaBook.query.get_or_404(voca_book_id)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    total_count = VocaBookMap.query.filter_by(book_id=voca_book_id).count()

    word_maps = db.session.query(VocaBookMap, Voca).join(
        Voca, VocaBookMap.voca_id == Voca.id
    ).filter(VocaBookMap.book_id == voca_book_id).order_by(VocaBookMap.voca_id).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    voca_ids = [v.id for _, v in word_maps]
    meanings_dict = {}
    examples_dict = {}
    if voca_ids:
        for mm, m in db.session.query(VocaMeaningMap, VocaMeaning).join(
            VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id
        ).filter(VocaMeaningMap.voca_id.in_(voca_ids)).all():
            meanings_dict.setdefault(mm.voca_id, []).append(m.meaning)

        for em, e in db.session.query(VocaExampleMap, VocaExample).join(
            VocaExample, VocaExampleMap.example_id == VocaExample.id
        ).filter(VocaExampleMap.voca_id.in_(voca_ids)).all():
            examples_dict.setdefault(em.voca_id, []).append({'exam_en': e.exam_en, 'exam_ko': e.exam_ko})

    words = [{'voca_id': v.id, 'word': v.word, 'pronunciation': v.pronunciation,
               'meanings': meanings_dict.get(v.id, []), 'examples': examples_dict.get(v.id, [])}
             for _, v in word_maps]

    return jsonify({'code': 200, 'data': {
        'voca_book': {'id': voca_book.id, 'book_nm': voca_book.book_nm, 'language': voca_book.language, 'word_count': total_count},
        'words': words,
        'pagination': {'page': page, 'per_page': per_page, 'total': total_count,
                       'pages': (total_count + per_page - 1) // per_page,
                       'has_next': page * per_page < total_count, 'has_prev': page > 1},
    }})


@admin_bp.route('/voca_book/<int:voca_book_id>/word', methods=['POST'])
@admin_required
def add_word_to_voca_book(voca_book_id):
    try:
        data = request.json
        word_text = data.get('word', '').strip()
        if not word_text:
            return jsonify({'code': 400, 'message': '단어를 입력해주세요.'}), 400

        existing_voca = Voca.query.filter_by(word=word_text).first()
        if existing_voca:
            voca_id = existing_voca.id
        else:
            new_voca = Voca(word=word_text, pronunciation=data.get('pronunciation'))
            db.session.add(new_voca)
            db.session.flush()
            voca_id = new_voca.id

        if VocaBookMap.query.filter_by(book_id=voca_book_id, voca_id=voca_id).first():
            return jsonify({'code': 400, 'message': '이미 단어장에 포함된 단어입니다.'}), 400

        db.session.add(VocaBookMap(book_id=voca_book_id, voca_id=voca_id))

        voca_book = VocaBook.query.get(voca_book_id)
        if voca_book:
            voca_book.word_count = VocaBookMap.query.filter_by(book_id=voca_book_id).count()
            voca_book.updated_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'code': 200, 'data': {'message': '단어가 추가되었습니다.'}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('voca_book 단어 추가 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/voca_book/<int:voca_book_id>/word/<int:voca_id>', methods=['DELETE'])
@admin_required
def remove_word_from_voca_book(voca_book_id, voca_id):
    try:
        word_map = VocaBookMap.query.filter_by(book_id=voca_book_id, voca_id=voca_id).first()
        if not word_map:
            return jsonify({'code': 404, 'message': '단어를 찾을 수 없습니다.'}), 404

        db.session.delete(word_map)

        voca_book = VocaBook.query.get(voca_book_id)
        if voca_book:
            voca_book.word_count = VocaBookMap.query.filter_by(book_id=voca_book_id).count()
            voca_book.updated_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'code': 200, 'data': {'message': '단어가 제거되었습니다.'}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('voca_book 단어 제거 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


# ──────────────────────────────────────────
# AdminVocaBook CRUD
# ──────────────────────────────────────────

@admin_bp.route('/admin_voca_book', methods=['POST'])
@admin_required
def create_admin_voca_book():
    try:
        book_nm = request.form.get('book_nm', '').strip()
        language = request.form.get('language', '').strip()
        source = request.form.get('source', '').strip()
        category = request.form.get('category', '').strip()
        username = request.form.get('username', '').strip()

        if not book_nm or not language or not source:
            return jsonify({'code': 400, 'message': '필수 항목(이름, 언어, 소스)을 입력해주세요.'}), 400

        if 'excel_file' not in request.files or request.files['excel_file'].filename == '':
            return jsonify({'code': 400, 'message': '엑셀 파일을 업로드해주세요.'}), 400

        avb = AdminVocaBook(
            book_nm=book_nm, language=language, source=source,
            category=category if category else None,
            username=username if username else None,
            word_count=0, updated_at=datetime.utcnow(),
        )
        db.session.add(avb)
        db.session.flush()

        df = pd.read_excel(BytesIO(request.files['excel_file'].read()), header=None)
        word_count = 0

        for _, row in df.iterrows():
            if pd.isna(row[0]):
                continue
            word = str(row[0]).strip()
            if not word:
                continue

            meanings_list = []
            if len(row) > 1 and pd.notna(row[1]):
                meanings_list = [m.strip() for m in str(row[1]).split(',') if m.strip()]

            examples_list = []
            col_idx = 2
            while col_idx < len(row):
                if pd.isna(row[col_idx]):
                    col_idx += 2
                    continue
                exam_en = str(row[col_idx]).strip()
                if not exam_en:
                    col_idx += 2
                    continue
                exam_ko = str(row[col_idx + 1]).strip() if col_idx + 1 < len(row) and pd.notna(row[col_idx + 1]) else ''
                examples_list.append({'en': exam_en, 'ko': exam_ko})
                col_idx += 2

            if _process_word_into_book(word, meanings_list, examples_list, avb.id):
                word_count += 1

        avb.word_count = word_count
        db.session.commit()
        return jsonify({'code': 200, 'data': {'id': avb.id, 'word_count': word_count}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('admin_voca_book 업로드 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/admin_voca_book/<int:admin_voca_book_id>', methods=['PATCH'])
@admin_required
def update_admin_voca_book(admin_voca_book_id):
    try:
        data = request.json
        avb = AdminVocaBook.query.get_or_404(admin_voca_book_id)

        for field in ('book_nm', 'language', 'source'):
            if field in data:
                setattr(avb, field, data[field])
        if 'category' in data:
            avb.category = data['category'] if data['category'] else None
        if 'username' in data:
            avb.username = data['username'] if data['username'] else None

        avb.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'code': 200, 'data': {'success': True}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('admin_voca_book 수정 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/admin_voca_book/<int:admin_voca_book_id>/words', methods=['GET'])
@admin_required
def get_admin_voca_book_words(admin_voca_book_id):
    avb = AdminVocaBook.query.get_or_404(admin_voca_book_id)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    total_count = AdminVocaBookMap.query.filter_by(book_id=admin_voca_book_id).count()

    word_maps = db.session.query(AdminVocaBookMap, Voca).join(
        Voca, AdminVocaBookMap.voca_id == Voca.id
    ).filter(AdminVocaBookMap.book_id == admin_voca_book_id).order_by(AdminVocaBookMap.id).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    words = []
    for bm, v in word_maps:
        words.append({
            'voca_id': v.id, 'map_id': bm.id, 'word': v.word, 'pronunciation': v.pronunciation,
            'meanings': json.loads(bm.voca_meanings) if bm.voca_meanings else [],
            'examples': json.loads(bm.voca_examples) if bm.voca_examples else [],
        })

    return jsonify({'code': 200, 'data': {
        'voca_book': {'id': avb.id, 'book_nm': avb.book_nm, 'language': avb.language, 'word_count': total_count},
        'words': words,
        'pagination': {'page': page, 'per_page': per_page, 'total': total_count,
                       'pages': (total_count + per_page - 1) // per_page,
                       'has_next': page * per_page < total_count, 'has_prev': page > 1},
    }})


def _process_word_into_book(word_text, meanings_list, examples_list, book_id):
    """단어를 Voca/관리자사전 체크 후 AdminVocaBookMap에 추가. 이미 있으면 skip."""
    existing_voca = Voca.query.filter_by(word=word_text).first()
    if existing_voca:
        voca_id = existing_voca.id
        existing_meanings = {
            VocaMeaning.query.get(mm.meaning_id).meaning
            for mm in VocaMeaningMap.query.filter_by(voca_id=voca_id).all()
            if VocaMeaning.query.get(mm.meaning_id)
        }
        for mt in meanings_list:
            if mt not in existing_meanings:
                vm = VocaMeaning(meaning=mt)
                db.session.add(vm)
                db.session.flush()
                db.session.add(VocaMeaningMap(voca_id=voca_id, meaning_id=vm.id))

        existing_examples = {
            (VocaExample.query.get(em.example_id).exam_en, VocaExample.query.get(em.example_id).exam_ko)
            for em in VocaExampleMap.query.filter_by(voca_id=voca_id).all()
            if VocaExample.query.get(em.example_id)
        }
        for ex in examples_list:
            if (ex['en'], ex['ko']) not in existing_examples:
                ve = VocaExample(exam_en=ex['en'], exam_ko=ex['ko'])
                db.session.add(ve)
                db.session.flush()
                db.session.add(VocaExampleMap(voca_id=voca_id, example_id=ve.id))
    else:
        voca = Voca(word=word_text)
        db.session.add(voca)
        db.session.flush()
        voca_id = voca.id
        for mt in meanings_list:
            vm = VocaMeaning(meaning=mt)
            db.session.add(vm)
            db.session.flush()
            db.session.add(VocaMeaningMap(voca_id=voca_id, meaning_id=vm.id))
        for ex in examples_list:
            ve = VocaExample(exam_en=ex['en'], exam_ko=ex['ko'])
            db.session.add(ve)
            db.session.flush()
            db.session.add(VocaExampleMap(voca_id=voca_id, example_id=ve.id))

    if AdminVocaBookMap.query.filter_by(book_id=book_id, voca_id=voca_id).first():
        return False  # 이미 존재

    db.session.add(AdminVocaBookMap(
        voca_id=voca_id, book_id=book_id,
        voca_meanings=json.dumps(meanings_list, ensure_ascii=False) if meanings_list else None,
        voca_examples=json.dumps(examples_list, ensure_ascii=False) if examples_list else None,
    ))
    return True


@admin_bp.route('/admin_voca_book/from_ai', methods=['POST'])
@admin_required
def create_admin_voca_book_from_ai():
    try:
        data = request.json or {}
        book_nm = (data.get('book_nm') or '').strip()
        language = (data.get('language') or '').strip()
        source = (data.get('source') or '').strip()
        category = (data.get('category') or '').strip()
        username = (data.get('username') or '').strip()
        words = data.get('words', [])

        if not book_nm or not language or not source:
            return jsonify({'code': 400, 'message': '필수 항목(이름, 언어, 소스)을 입력해주세요.'}), 400

        avb = AdminVocaBook(
            book_nm=book_nm, language=language, source=source,
            category=category if category else None,
            username=username if username else None,
            word_count=0, updated_at=datetime.utcnow(),
        )
        db.session.add(avb)
        db.session.flush()

        word_count = 0
        for w in words:
            word_text = str(w.get('word', '')).strip()
            if not word_text:
                continue
            meanings_list = [m.strip() for m in w.get('meanings', []) if str(m).strip()]
            examples_list = [
                {'en': str(ex.get('en', '')).strip(), 'ko': str(ex.get('ko', '')).strip()}
                for ex in w.get('examples', [])
                if ex.get('en') or ex.get('ko')
            ]
            if _process_word_into_book(word_text, meanings_list, examples_list, avb.id):
                word_count += 1

        avb.word_count = word_count
        db.session.commit()
        return jsonify({'code': 200, 'data': {'id': avb.id, 'word_count': word_count}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('admin_voca_book JSON 업로드 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/admin_voca_book/<int:admin_voca_book_id>/word', methods=['POST'])
@admin_required
def add_word_to_admin_voca_book(admin_voca_book_id):
    try:
        data = request.json
        word_text = data.get('word', '').strip()
        if not word_text:
            return jsonify({'code': 400, 'message': '단어를 입력해주세요.'}), 400

        existing_voca = Voca.query.filter_by(word=word_text).first()
        meanings_list = []
        examples_list = []

        if existing_voca:
            voca_id = existing_voca.id
            for mm in VocaMeaningMap.query.filter_by(voca_id=voca_id).all():
                mo = VocaMeaning.query.get(mm.meaning_id)
                if mo:
                    meanings_list.append(mo.meaning)
            for em in VocaExampleMap.query.filter_by(voca_id=voca_id).all():
                eo = VocaExample.query.get(em.example_id)
                if eo:
                    examples_list.append({'en': eo.exam_en, 'ko': eo.exam_ko})
        else:
            new_voca = Voca(word=word_text, pronunciation=data.get('pronunciation'))
            db.session.add(new_voca)
            db.session.flush()
            voca_id = new_voca.id

        if AdminVocaBookMap.query.filter_by(book_id=admin_voca_book_id, voca_id=voca_id).first():
            return jsonify({'code': 400, 'message': '이미 단어장에 포함된 단어입니다.'}), 400

        db.session.add(AdminVocaBookMap(
            voca_id=voca_id, book_id=admin_voca_book_id,
            voca_meanings=json.dumps(meanings_list, ensure_ascii=False) if meanings_list else None,
            voca_examples=json.dumps(examples_list, ensure_ascii=False) if examples_list else None,
        ))

        avb = AdminVocaBook.query.get(admin_voca_book_id)
        if avb:
            avb.word_count = AdminVocaBookMap.query.filter_by(book_id=admin_voca_book_id).count()
            avb.updated_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'code': 200, 'data': {'message': '단어가 추가되었습니다.'}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('admin_voca_book 단어 추가 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/admin_voca_book/<int:admin_voca_book_id>/word/<int:voca_id>', methods=['DELETE'])
@admin_required
def remove_word_from_admin_voca_book(admin_voca_book_id, voca_id):
    try:
        word_map = AdminVocaBookMap.query.filter_by(book_id=admin_voca_book_id, voca_id=voca_id).first()
        if not word_map:
            return jsonify({'code': 404, 'message': '단어를 찾을 수 없습니다.'}), 404

        db.session.delete(word_map)

        avb = AdminVocaBook.query.get(admin_voca_book_id)
        if avb:
            avb.word_count = AdminVocaBookMap.query.filter_by(book_id=admin_voca_book_id).count()
            avb.updated_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'code': 200, 'data': {'message': '단어가 제거되었습니다.'}})

    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('admin_voca_book 단어 제거 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


# ──────────────────────────────────────────
# Voca
# ──────────────────────────────────────────

@admin_bp.route('/voca', methods=['GET'])
@admin_required
def get_voca_list():
    page = request.args.get('page', 1, type=int)
    per_page = 50
    q = request.args.get('q', '')

    query = Voca.query
    if q:
        query = query.filter(Voca.word.ilike(f'%{q}%'))

    pagination = query.order_by(Voca.word).paginate(page=page, per_page=per_page, error_out=False)
    vocas = []
    for v in pagination.items:
        meanings = []
        for mm in VocaMeaningMap.query.filter_by(voca_id=v.id).all():
            mo = VocaMeaning.query.get(mm.meaning_id)
            if mo:
                meanings.append(mo.meaning)
        examples = []
        for em in VocaExampleMap.query.filter_by(voca_id=v.id).all():
            eo = VocaExample.query.get(em.example_id)
            if eo:
                examples.append({'exam_en': eo.exam_en or '', 'exam_ko': eo.exam_ko or ''})
        vocas.append({
            'id': v.id,
            'word': v.word,
            'pronunciation': v.pronunciation,
            'verb_forms': v.verb_forms,
            'meanings': meanings,
            'examples': examples,
        })

    return jsonify({'code': 200, 'data': {
        'vocas': vocas,
        'pagination': {'page': page, 'per_page': per_page, 'total': pagination.total,
                       'pages': pagination.pages, 'has_next': pagination.has_next, 'has_prev': pagination.has_prev},
    }})


@admin_bp.route('/voca/autocomplete', methods=['GET'])
@admin_required
def voca_autocomplete():
    q = request.args.get('q', '').strip()
    if not q or len(q) < 2:
        return jsonify({'code': 200, 'data': []})

    vocas = Voca.query.filter(Voca.word.ilike(f'%{q}%')).limit(10).all()
    words = []
    for v in vocas:
        first_meaning = None
        mm = VocaMeaningMap.query.filter_by(voca_id=v.id).first()
        if mm:
            mo = VocaMeaning.query.get(mm.meaning_id)
            if mo:
                first_meaning = mo.meaning
        words.append({'id': v.id, 'word': v.word, 'pronunciation': v.pronunciation, 'meaning': first_meaning})

    return jsonify({'code': 200, 'data': words})


@admin_bp.route('/voca/<int:voca_id>', methods=['GET'])
@admin_required
def get_voca(voca_id):
    voca = Voca.query.get_or_404(voca_id)

    meanings = [{'id': mm.meaning.id, 'meaning': mm.meaning.meaning} for mm in voca.voca_meanings]
    examples = [{'id': em.example.id, 'exam_en': em.example.exam_en or '', 'exam_ko': em.example.exam_ko or ''}
                for em in voca.voca_examples]

    return jsonify({'code': 200, 'data': {
        'id': voca.id, 'word': voca.word,
        'pronunciation': voca.pronunciation or '',
        'verb_forms': voca.verb_forms or '',
        'meanings': meanings, 'examples': examples,
    }})


@admin_bp.route('/voca/<int:voca_id>', methods=['PATCH'])
@admin_required
def update_voca(voca_id):
    data = request.json
    voca = Voca.query.get_or_404(voca_id)

    voca.word = data.get('word', voca.word)
    voca.pronunciation = data.get('pronunciation', voca.pronunciation)
    voca.verb_forms = data.get('verb_forms', voca.verb_forms)
    if 'level' in data:
        voca.level = data.get('level') if data.get('level') else None

    if 'meanings' in data:
        VocaMeaningMap.query.filter_by(voca_id=voca_id).delete()
        for md in data['meanings']:
            mt = md.get('meaning', '').strip()
            if not mt:
                continue
            vm = VocaMeaning(meaning=mt)
            db.session.add(vm)
            db.session.flush()
            db.session.add(VocaMeaningMap(voca_id=voca_id, meaning_id=vm.id))

    if 'examples' in data:
        # 저장 시 강조 안 된 예문 자동 태깅 (spacy/kiwi 1차 → 잔여분 GPT)
        if 'meanings' in data:
            ex_meanings = [m.get('meaning', '').strip() for m in data.get('meanings', [])
                           if isinstance(m, dict) and m.get('meaning', '').strip()]
        else:
            ex_meanings = [mm.meaning.meaning for mm in voca.voca_meanings]
        apply_emphasis(voca.word, ex_meanings, data['examples'], 'exam_en', 'exam_ko')

        VocaExampleMap.query.filter_by(voca_id=voca_id).delete()
        for ed in data['examples']:
            exam_en = (ed.get('exam_en') or '').strip()
            exam_ko = (ed.get('exam_ko') or '').strip()
            if not exam_en and not exam_ko:
                continue
            ve = VocaExample(exam_en=exam_en or None, exam_ko=exam_ko or None)
            db.session.add(ve)
            db.session.flush()
            db.session.add(VocaExampleMap(voca_id=voca_id, example_id=ve.id))

    db.session.commit()

    # 저장된(태깅 반영된) 예문을 응답으로 반환 → 프론트가 즉시 강조 결과 표시
    saved_examples = [
        {'id': em.example.id, 'exam_en': em.example.exam_en or '', 'exam_ko': em.example.exam_ko or ''}
        for em in voca.voca_examples
    ]
    return jsonify({'code': 200, 'data': {'success': True, 'examples': saved_examples}})


@admin_bp.route('/voca/<int:voca_id>/hide', methods=['PATCH'])
@admin_required
def hide_voca(voca_id):
    voca = Voca.query.get_or_404(voca_id)
    voca.is_active = False
    db.session.commit()
    return jsonify({'code': 200, 'data': {'success': True}})


@admin_bp.route('/voca/<int:voca_id>/show', methods=['PATCH'])
@admin_required
def show_voca(voca_id):
    voca = Voca.query.get_or_404(voca_id)
    voca.is_active = True
    db.session.commit()
    return jsonify({'code': 200, 'data': {'success': True}})


@admin_bp.route('/voca/<int:voca_id>/tag_examples', methods=['POST'])
@admin_required
def tag_voca_examples(voca_id):
    """사전 단어(Voca) 예문에 <strong class="target-word"> 자동 삽입 후 미리보기 반환.
    저장은 별도 엔드포인트 없이 기존 PATCH /voca/<id> 로 처리한다.
    spacy/kiwipiepy 1차 처리 → 실패 잔여분만 GPT 배치."""
    try:
        voca = Voca.query.get_or_404(voca_id)
        word = voca.word
        meanings = [mm.meaning.meaning for mm in voca.voca_meanings]

        results = []
        gpt_batch = []
        gpt_refs = []  # (result_idx, mode) mode: 'en'|'ko'|'both'

        for em in voca.voca_examples:
            ex = em.example
            en_orig = ex.exam_en or ''
            ko_orig = ex.exam_ko or ''
            tagged_en, tagged_ko, need_gpt_en, need_gpt_ko = tag_example_pair(
                word, meanings, en_orig, ko_orig)

            ri = len(results)
            if need_gpt_en or need_gpt_ko:
                gpt_batch.append({'word': word, 'meanings': meanings, 'en': en_orig, 'ko': ko_orig})
                mode = 'both' if (need_gpt_en and need_gpt_ko) else ('en' if need_gpt_en else 'ko')
                gpt_refs.append((ri, mode))

            results.append({'id': ex.id, 'exam_en': tagged_en, 'exam_ko': tagged_ko})

        # GPT fallback: 30개씩 배치 처리
        BATCH = 30
        for start in range(0, len(gpt_batch), BATCH):
            chunk = gpt_batch[start:start + BATCH]
            refs = gpt_refs[start:start + BATCH]
            tagged_chunk = _tag_batch_gpt(chunk)
            for j, (ri, mode) in enumerate(refs):
                if mode in ('both', 'en'):
                    results[ri]['exam_en'] = tagged_chunk[j]['en']
                if mode in ('both', 'ko'):
                    results[ri]['exam_ko'] = tagged_chunk[j]['ko']

        return jsonify({'code': 200, 'data': {'examples': results}})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


# ──────────────────────────────────────────
# Strong 태그 삽입 (AdminVocaBook)
# ──────────────────────────────────────────

@admin_bp.route('/admin_voca_book/<int:admin_voca_book_id>/tag_examples', methods=['POST'])
@admin_required
def tag_admin_voca_book_examples(admin_voca_book_id):
    """예문에 <strong class="target-word"> 태그 자동 삽입 (spacy/kiwipiepy + GPT fallback)"""
    try:
        AdminVocaBook.query.get_or_404(admin_voca_book_id)

        word_maps = db.session.query(AdminVocaBookMap, Voca).join(
            Voca, AdminVocaBookMap.voca_id == Voca.id
        ).filter(AdminVocaBookMap.book_id == admin_voca_book_id).order_by(AdminVocaBookMap.id).all()

        results = []
        gpt_batch = []
        gpt_refs = []   # (result_idx, ex_idx, mode) mode: 'en'|'ko'|'both'

        for bm, v in word_maps:
            examples = json.loads(bm.voca_examples) if bm.voca_examples else []
            meanings = json.loads(bm.voca_meanings) if bm.voca_meanings else []
            word = v.word
            tagged_exs = []

            for ex in examples:
                en_orig = ex.get('en', '')
                ko_orig = ex.get('ko', '')
                STRONG = '<strong class="target-word">'

                # 이미 태그된 예문은 재처리 스킵
                if STRONG in en_orig:
                    tagged_en = en_orig
                else:
                    tagged_en = _tag_en(word, en_orig) if en_orig else en_orig

                if STRONG in ko_orig:
                    tagged_ko = ko_orig
                else:
                    tagged_ko = _tag_ko(meanings, ko_orig) if ko_orig else ko_orig

                need_gpt_en = tagged_en is None and bool(en_orig)
                need_gpt_ko = tagged_ko is None and bool(ko_orig)

                ri = len(results)
                ei = len(tagged_exs)

                if need_gpt_en or need_gpt_ko:
                    gpt_batch.append({'word': word, 'meanings': meanings, 'en': en_orig, 'ko': ko_orig})
                    if need_gpt_en and need_gpt_ko:
                        mode = 'both'
                    elif need_gpt_en:
                        mode = 'en'
                    else:
                        mode = 'ko'
                    gpt_refs.append((ri, ei, mode))

                tagged_exs.append({
                    'en': tagged_en if tagged_en is not None else en_orig,
                    'ko': tagged_ko if tagged_ko is not None else ko_orig,
                })

            results.append({'map_id': bm.id, 'word': word, 'meanings': meanings, 'examples': tagged_exs})

        # GPT fallback: 30개씩 배치 처리
        BATCH = 30
        for start in range(0, len(gpt_batch), BATCH):
            chunk = gpt_batch[start:start + BATCH]
            refs = gpt_refs[start:start + BATCH]
            tagged_chunk = _tag_batch_gpt(chunk)
            for j, (ri, ei, mode) in enumerate(refs):
                if mode in ('both', 'en'):
                    results[ri]['examples'][ei]['en'] = tagged_chunk[j]['en']
                if mode in ('both', 'ko'):
                    results[ri]['examples'][ei]['ko'] = tagged_chunk[j]['ko']

        return jsonify({'code': 200, 'data': {'results': results}})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/admin_voca_book/tag_examples_from_excel', methods=['POST'])
def tag_examples_from_excel():
    """[임시] /app/heyvoca_skincare_vocab.xlsx 데이터로 strong 태그 삽입 후 결과를 엑셀에 저장"""
    try:
        xlsx_path = '/app/heyvoca_skincare_vocab.xlsx'
        df = pd.read_excel(xlsx_path)
        # 컬럼 순서: 단어, 뜻, 영어 예문, 한국어 예문

        results = []
        gpt_batch = []
        gpt_refs = []  # (result_idx, mode)
        STRONG = '<strong class="target-word">'

        for i, row in df.iterrows():
            word = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ''
            meaning_raw = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ''
            en_orig = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ''
            ko_orig = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else ''
            meanings = [m.strip() for m in re.split(r'[,，]', meaning_raw) if m.strip()]

            tagged_en = _tag_en(word, en_orig) if en_orig and STRONG not in en_orig else en_orig
            tagged_ko = _tag_ko(meanings, ko_orig) if ko_orig and STRONG not in ko_orig else ko_orig

            need_gpt_en = tagged_en is None and bool(en_orig)
            need_gpt_ko = tagged_ko is None and bool(ko_orig)

            ri = len(results)
            if need_gpt_en or need_gpt_ko:
                gpt_batch.append({'word': word, 'meanings': meanings, 'en': en_orig, 'ko': ko_orig})
                mode = 'both' if (need_gpt_en and need_gpt_ko) else ('en' if need_gpt_en else 'ko')
                gpt_refs.append((ri, mode))

            results.append({
                'word': word,
                'en': tagged_en if tagged_en is not None else en_orig,
                'ko': tagged_ko if tagged_ko is not None else ko_orig,
                'gpt_used': False,
            })

        BATCH = 30
        for start in range(0, len(gpt_batch), BATCH):
            chunk = gpt_batch[start:start + BATCH]
            refs = gpt_refs[start:start + BATCH]
            tagged_chunk = _tag_batch_gpt(chunk)
            for j, (ri, mode) in enumerate(refs):
                if mode in ('both', 'en'):
                    results[ri]['en'] = tagged_chunk[j]['en']
                if mode in ('both', 'ko'):
                    results[ri]['ko'] = tagged_chunk[j]['ko']
                results[ri]['gpt_used'] = True

        df['태그된 영어 예문'] = [r['en'] for r in results]
        df['태그된 한국어 예문'] = [r['ko'] for r in results]
        df['gpt_used'] = [r['gpt_used'] for r in results]
        df.to_excel(xlsx_path, index=False)

        return jsonify({'code': 200, 'data': {'total': len(results), 'results': results}})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@admin_bp.route('/admin_voca_book/<int:admin_voca_book_id>/save_tagged_examples', methods=['PATCH'])
@admin_required
def save_tagged_examples(admin_voca_book_id):
    """태그된 예문을 DB에 저장"""
    try:
        items = (request.json or {}).get('items', [])
        for item in items:
            map_id = item.get('map_id')
            bm = AdminVocaBookMap.query.filter_by(id=map_id, book_id=admin_voca_book_id).first()
            if not bm:
                continue
            bm.voca_examples = json.dumps(
                [{'en': ex.get('en', ''), 'ko': ex.get('ko', '')} for ex in item.get('examples', [])],
                ensure_ascii=False
            )
        db.session.commit()
        return jsonify({'code': 200, 'data': {'success': True}})
    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('save_tagged_examples 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


# ──────────────────────────────────────────
# TTS 모니터링 (ElevenLabs quota + fallback 통계)
# ──────────────────────────────────────────

@admin_bp.route('/tts/quota', methods=['GET'])
@admin_required
def get_tts_quota():
    """ElevenLabs 문자(토큰) 잔량/사용량 조회.

    조회 실패도 HTTP 200 + data.ok=False 로 반환한다. 5xx로 주면 Cloudflare가
    자체 Bad Gateway 페이지로 덮어써 원인 메시지(message)가 화면에 전달되지 않는다.
    """
    from app.services.tts.registry import get_provider
    from app.services.tts.base import TTSConfigError, TTSGenerationError
    try:
        provider = get_provider('elevenlabs')
        sub = provider.get_subscription()
    except TTSConfigError as e:
        return jsonify({'code': 200, 'data': {
            'ok': False, 'reason': 'config', 'message': str(e),
        }})
    except TTSGenerationError as e:
        sc = getattr(e, 'status_code', None)
        reason = {401: 'permission', 403: 'permission',
                  402: 'quota', 429: 'rate_limit'}.get(sc, 'api_error')
        return jsonify({'code': 200, 'data': {
            'ok': False, 'reason': reason, 'status_code': sc, 'message': str(e),
        }})

    limit = sub.get('character_limit') or 0
    used = sub.get('character_count') or 0
    remaining = max(limit - used, 0)
    return jsonify({'code': 200, 'data': {
        'ok': True,
        'character_limit': limit,
        'character_count': used,
        'character_remaining': remaining,
        'usage_ratio': round(used / limit, 4) if limit else None,
        'tier': sub.get('tier'),
        'status': sub.get('status'),
        'next_reset_unix': sub.get('next_character_count_reset_unix'),
    }})


@admin_bp.route('/tts/stats', methods=['GET'])
@admin_required
def get_tts_stats():
    """최근 N일 TTS 생성/fallback 일별 통계(Redis 카운터)."""
    from datetime import timedelta
    from app import cache
    try:
        days = min(max(int(request.args.get('days', 7)), 1), 14)
    except (TypeError, ValueError):
        days = 7

    def _get(key):
        try:
            return int(cache.get(key) or 0)
        except Exception:
            return 0

    daily = []
    total_gen = total_fb = 0
    for i in range(days):
        d = (datetime.utcnow() - timedelta(days=i)).strftime('%Y%m%d')
        gen = _get(f'tts:gen:{d}')
        fb = _get(f'tts:fallback:{d}')
        total_gen += gen
        total_fb += fb
        daily.append({
            'date': d,
            'gen': gen,
            'fallback': fb,
            'gen_en': _get(f'tts:gen:en:{d}'),
            'gen_ko': _get(f'tts:gen:ko:{d}'),
            'fallback_en': _get(f'tts:fallback:en:{d}'),
            'fallback_ko': _get(f'tts:fallback:ko:{d}'),
        })
    return jsonify({'code': 200, 'data': {
        'days': days,
        'total_gen': total_gen,
        'total_fallback': total_fb,
        'daily': daily,  # 최신일 우선(index 0 = 오늘)
    }})


# ──────────────────────────────────────────
# TTS 테스트(미리듣기) — 무료 엔진 voice/옵션 비교 (admin 전용)
# ──────────────────────────────────────────

# gTTS 영어 악센트(tld). gTTS는 목소리 1종이고 악센트/속도만 조절 가능.
_GTTS_ACCENTS = [
    {'tld': 'com', 'label': '미국 (US)'},
    {'tld': 'co.uk', 'label': '영국 (UK)'},
    {'tld': 'com.au', 'label': '호주 (AU)'},
    {'tld': 'ca', 'label': '캐나다 (CA)'},
    {'tld': 'co.in', 'label': '인도 (IN)'},
    {'tld': 'ie', 'label': '아일랜드 (IE)'},
    {'tld': 'co.za', 'label': '남아공 (ZA)'},
]


@admin_bp.route('/tts/voices', methods=['GET'])
@admin_required
def get_tts_voices():
    """미리듣기 옵션 목록. engine=edge → 신경망 voice 목록, gtts → 악센트 목록."""
    engine = request.args.get('engine', 'edge')
    language = request.args.get('language', 'en')

    if engine == 'gtts':
        accents = _GTTS_ACCENTS if language == 'en' else [{'tld': 'com', 'label': '기본'}]
        return jsonify({'code': 200, 'data': {'engine': 'gtts', 'accents': accents}})

    # edge: list_voices (Redis 6시간 캐시)
    from app import cache
    ck = f'tts:edge_voices:{language}'
    try:
        cached = cache.get(ck)
    except Exception:
        cached = None
    if cached:
        return jsonify({'code': 200, 'data': {'engine': 'edge', 'voices': json.loads(cached)}})

    try:
        import asyncio
        import edge_tts
        all_voices = asyncio.run(edge_tts.list_voices())
    except Exception as e:
        return jsonify({'code': 200, 'data': {'engine': 'edge', 'voices': [], 'error': str(e)}})

    voices = [
        {
            'short_name': v['ShortName'],
            'gender': v['Gender'],
            'locale': v['Locale'],
            'label': f"{v['ShortName'].split('-', 2)[-1].replace('Neural', '')} · {v['Locale']} · {v['Gender']}",
        }
        for v in all_voices if v['Locale'].startswith(language)
    ]
    voices.sort(key=lambda x: (x['locale'], x['short_name']))
    try:
        cache.set(ck, json.dumps(voices, ensure_ascii=False), timeout=6 * 3600)
    except Exception:
        pass
    return jsonify({'code': 200, 'data': {'engine': 'edge', 'voices': voices}})


@admin_bp.route('/tts/preview', methods=['POST'])
@admin_required
def tts_preview():
    """입력 텍스트를 지정 엔진/옵션으로 즉석 합성해 audio/mpeg 반환(캐싱 없음).

    실패는 4xx+message로 반환(5xx는 Cloudflare가 가로채 메시지가 가려짐).
    """
    from flask import Response as FlaskResponse
    data = request.json or {}
    text = (data.get('text') or '').strip()
    engine = data.get('engine', 'edge')
    language = data.get('language', 'en')

    if not text:
        return jsonify({'code': 400, 'message': '텍스트를 입력하세요.'}), 400
    if len(text) > 500:
        return jsonify({'code': 400, 'message': '텍스트가 너무 깁니다(최대 500자).'}), 400

    try:
        if engine == 'gtts':
            from gtts import gTTS
            tld = data.get('tld') or 'com'
            slow = bool(data.get('slow'))
            buf = BytesIO()
            gTTS(text=text, lang=language, tld=tld, slow=slow).write_to_fp(buf)
            audio = buf.getvalue()
        elif engine == 'edge':
            import asyncio
            import edge_tts
            voice = data.get('voice') or 'en-US-AriaNeural'
            rate = data.get('rate') or '+0%'
            pitch = data.get('pitch') or '+0Hz'

            async def _run():
                comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                b = bytearray()
                async for chunk in comm.stream():
                    if chunk.get('type') == 'audio':
                        b += chunk['data']
                return bytes(b)
            audio = asyncio.run(_run())
        else:
            return jsonify({'code': 400, 'message': f'알 수 없는 엔진: {engine}'}), 400
    except Exception as e:
        return jsonify({'code': 400, 'message': f'생성 실패: {e}'}), 400

    if not audio:
        return jsonify({'code': 400, 'message': '빈 음성이 생성되었습니다.'}), 400
    return FlaskResponse(audio, mimetype='audio/mpeg')
