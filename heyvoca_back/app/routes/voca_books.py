import os
import json
import shutil
import datetime
import io
import re
import tempfile
import traceback
import zipfile
import sqlite3
import pandas as pd
from html import unescape as html_unescape
from flask import request, jsonify, g
from uuid import UUID, uuid4

from app.routes import voca_books_bp
from app.models.models import db, UserVocaBook, UserVocaBookMap, UserVoca, Bookstore, AdminVocaBookMap
from app.utils.jwt_utils import jwt_required
from app.routes.voca_indexs import merge_meanings, merge_examples
from app.routes.user_voca_book import parse_quizlet_pdf


# 단어(word) 길이 정책: 영단어가 50자를 넘는 경우는 사실상 없으므로,
# 50자 초과는 "문장이 word로 매핑됐다"고 간주하고 즉시 거부한다.
WORD_MAX_LEN = 50

# SM2 학습 알고리즘 초기값
DEFAULT_SM2 = {
    "ef": 2.5,
    "repetition": 0,
    "interval": 0,
    "nextReview": None,
    "lastStudyDate": None,
    "beforeScheduleCount": 0,
}


def validate_word_lengths(parsed_items):
    """
    파싱된 단어 리스트를 검증한다.
    개별 단어가 50자(WORD_MAX_LEN)를 초과하면 거부.
    문제가 없으면 None, 있으면 (status_code, message) 튜플을 반환한다.
    """
    if not parsed_items:
        return None

    for item in parsed_items:
        origin = (item.get('origin') or '').strip()
        if not origin:
            continue
        if len(origin) > WORD_MAX_LEN:
            preview = origin[:30] + ('…' if len(origin) > 30 else '')
            return (
                400,
                f'단어 필드에 너무 긴 값이 있습니다 ({len(origin)}자): "{preview}". '
                f'단어는 {WORD_MAX_LEN}자를 넘지 않도록 해주세요.'
            )

    return None


def read_csv_with_encoding_fallback(file_bytes):
    """
    CSV 파일을 인코딩 fallback과 함께 읽는다.
    1순위 utf-8-sig (BOM 포함 UTF-8), 2순위 cp949 (한국 엑셀 기본 저장 인코딩).
    둘 다 실패하면 마지막 예외를 그대로 raise.
    """
    last_error = None
    for encoding in ('utf-8-sig', 'cp949'):
        try:
            return pd.read_csv(io.BytesIO(file_bytes), header=None, encoding=encoding)
        except (UnicodeDecodeError, UnicodeError) as e:
            last_error = e
            continue
    raise last_error


def bulk_persist_vocas(user_id, voca_book_id, parsed_items):
    """
    파싱된 단어 리스트를 UserVoca / UserVocaBookMap에 벌크로 저장한다.
    같은 단어가 이미 UserVoca에 있으면 meanings/examples를 병합한다.
    반환값은 실제로 추가된 매핑 개수.
    """
    if not parsed_items:
        return 0

    origins = [item['origin'] for item in parsed_items if item.get('origin')]
    existing_vocas = db.session.query(UserVoca).filter(
        UserVoca.user_id == user_id,
        UserVoca.word.in_(origins)
    ).all()
    user_voca_dict = {uv.word: uv for uv in existing_vocas}

    new_user_vocas = []
    now = datetime.datetime.utcnow()

    for item in parsed_items:
        origin = item['origin']
        meanings = item.get('meanings', [])
        examples = item.get('examples', [])

        if origin in user_voca_dict:
            uv = user_voca_dict[origin]
            uv.voca_meanings = merge_meanings(uv.voca_meanings, meanings)
            uv.voca_examples = merge_examples(uv.voca_examples, examples)
            uv.updated_at = now
        else:
            uv = UserVoca(
                user_id=user_id,
                voca_id=None,
                word=origin,
                voca_meanings=json.dumps(meanings, ensure_ascii=False),
                voca_examples=json.dumps(examples, ensure_ascii=False),
                data=json.dumps(DEFAULT_SM2, ensure_ascii=False),
            )
            new_user_vocas.append(uv)
            user_voca_dict[origin] = uv

    if new_user_vocas:
        db.session.add_all(new_user_vocas)
        db.session.flush()

    book_maps_data = []
    seen_voca_ids = set()
    for item in parsed_items:
        origin = item['origin']
        uv = user_voca_dict.get(origin)
        if not uv or uv.id in seen_voca_ids:
            continue
        seen_voca_ids.add(uv.id)
        book_maps_data.append({
            'user_voca_book_id': voca_book_id,
            'user_voca_id': uv.id,
            'voca_meanings': json.dumps(item.get('meanings', []), ensure_ascii=False),
            'voca_examples': json.dumps(item.get('examples', []), ensure_ascii=False),
        })

    if book_maps_data:
        db.session.bulk_insert_mappings(UserVocaBookMap, book_maps_data)

    return len(book_maps_data)


def build_vocas_for_book(voca_book_id):
    """단어장에 소속된 단어 목록을 API 응답 형식으로 구성"""
    maps = db.session.query(UserVocaBookMap).filter(
        UserVocaBookMap.user_voca_book_id == voca_book_id
    ).all()

    vocas = []
    for m in maps:
        user_voca = m.user_voca
        if not user_voca:
            continue

        meanings = json.loads(m.voca_meanings) if m.voca_meanings else []
        examples = json.loads(m.voca_examples) if m.voca_examples else []
        sm2 = json.loads(user_voca.data) if user_voca.data else None

        vocas.append({
            'vocaIndexId': user_voca.id,
            'origin': user_voca.word,
            'sm2': sm2,
            'meanings': meanings,
            'examples': examples,
            'createdAt': (user_voca.created_at).isoformat() + 'Z' if user_voca.created_at else None,
            'updatedAt': (user_voca.updated_at).isoformat() + 'Z' if user_voca.updated_at else None,
        })

    return vocas


def build_voca_book_response(voca_book):
    """UserVocaBook 객체를 API 응답 형식으로 변환"""
    vocas = build_vocas_for_book(voca_book.id)

    return {
        'vocaBookId': str(voca_book.id),
        'vocaBookStoreId': voca_book.bookstore_id,
        'title': voca_book.name,
        'color': json.loads(voca_book.color) if voca_book.color else None,
        'vocaCount': len(vocas),
        'vocas': vocas,
    }


# 단어장 목록 조회
@voca_books_bp.route('', methods=['GET'])
@jwt_required
def get_voca_books():
    from sqlalchemy.orm import joinedload
    user_id = UUID(g.user_id)

    # N+1 문제 해결을 위해 UserVocaBookMap과 UserVoca를 함께 로드
    voca_books = db.session.query(UserVocaBook).options(
        joinedload(UserVocaBook.voca_maps).joinedload(UserVocaBookMap.user_voca)
    ).filter(
        UserVocaBook.user_id == user_id
    ).all()

    data = []
    for vb in voca_books:
        # 이미 로드된 데이터를 사용하여 속도 향상
        vocas = []
        for m in vb.voca_maps:
            user_voca = m.user_voca
            if not user_voca:
                continue
            
            meanings = json.loads(m.voca_meanings) if m.voca_meanings else []
            examples = json.loads(m.voca_examples) if m.voca_examples else []
            sm2 = json.loads(user_voca.data) if user_voca.data else None

            vocas.append({
                'vocaIndexId': user_voca.id,
                'origin': user_voca.word,
                'sm2': sm2,
                'meanings': meanings,
                'examples': examples,
                'createdAt': (user_voca.created_at).isoformat() + 'Z' if user_voca.created_at else None,
                'updatedAt': (user_voca.updated_at).isoformat() + 'Z' if user_voca.updated_at else None,
            })

        data.append({
            'vocaBookId': str(vb.id),
            'vocaBookStoreId': vb.bookstore_id,
            'title': vb.name,
            'color': json.loads(vb.color) if vb.color else None,
            'vocaCount': len(vocas),
            'vocas': vocas,
        })

    return jsonify({'code': 200, 'data': data}), 200


# 단어장 개별 조회
@voca_books_bp.route('/<vocaBookId>', methods=['GET'])
@jwt_required
def get_voca_book(vocaBookId):
    user_id = UUID(g.user_id)
    try:
        voca_book_id = UUID(str(vocaBookId))
    except ValueError:
        return jsonify({'code': 400, 'message': '잘못된 형식의 단어장 ID입니다.'}), 400

    voca_book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == voca_book_id,
        UserVocaBook.user_id == user_id
    ).first()

    if not voca_book:
        return jsonify({'code': 404, 'message': '해당 단어장을 찾을 수 없습니다.'}), 404

    return jsonify({'code': 200, 'data': build_voca_book_response(voca_book)}), 200


# 단어장 생성
@voca_books_bp.route('', methods=['POST'])
@jwt_required
def create_voca_book():
    user_id = UUID(g.user_id)
    req = request.get_json()

    title = req.get('title')
    color = req.get('color')
    voca_list = req.get('vocaList', [])
    bookstore_id = req.get('bookstoreId')

    if not title:
        return jsonify({'code': 400, 'message': '단어장 이름(title)은 필수입니다.'}), 400

    # 단어 길이 검증 (개별 255자 / 평균 50자)
    if voca_list:
        invalid = validate_word_lengths(voca_list)
        if invalid:
            status, msg = invalid
            return jsonify({'code': status, 'message': msg}), status

    try:
        # UserVocaBook 생성
        voca_book = UserVocaBook(
            user_id=user_id,
            bookstore_id=bookstore_id,
            color=json.dumps(color, ensure_ascii=False) if color else json.dumps({'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'}),
            name=title,
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None
        )
        db.session.add(voca_book)
        db.session.flush()

        # vocaList가 있으면 벌크 처리로 최적화
        if voca_list:
            # 1. 기존 UserVoca 한 번에 조회
            origins = [item.get('origin') for item in voca_list if item.get('origin')]
            existing_vocas = db.session.query(UserVoca).filter(
                UserVoca.user_id == user_id,
                UserVoca.word.in_(origins)
            ).all()
            user_voca_dict = {uv.word: uv for uv in existing_vocas}

            user_vocas_to_add = []
            user_vocas_to_update = []
            
            # 2. UserVoca 분류 (추가 vs 수정)
            for item in voca_list:
                origin = item.get('origin')
                if not origin: continue
                
                meanings = item.get('meanings', [])
                examples = item.get('examples', [])
                sm2 = item.get('sm2')
                voca_id = item.get('vocaId')

                if origin in user_voca_dict:
                    uv = user_voca_dict[origin]
                    uv.voca_meanings = merge_meanings(uv.voca_meanings, meanings)
                    uv.voca_examples = merge_examples(uv.voca_examples, examples)
                    if not uv.voca_id and voca_id:
                        uv.voca_id = voca_id
                    uv.updated_at = datetime.datetime.utcnow()
                    if sm2:
                        uv.data = json.dumps(sm2, ensure_ascii=False)
                    user_vocas_to_update.append(uv)
                else:
                    new_uv = UserVoca(
                        user_id=user_id,
                        voca_id=voca_id,
                        word=origin,
                        voca_meanings=json.dumps(meanings, ensure_ascii=False),
                        voca_examples=json.dumps(examples, ensure_ascii=False),
                        data=json.dumps(sm2, ensure_ascii=False) if sm2 else None
                    )
                    user_vocas_to_add.append(new_uv)

            # 새 UserVoca 삽입 및 ID 확보
            if user_vocas_to_add:
                db.session.add_all(user_vocas_to_add)
                db.session.flush()
                # 딕셔너리에 새로 추가된 객체들 병합
                for uv in user_vocas_to_add:
                    user_voca_dict[uv.word] = uv

            # 3. UserVocaBookMap 벌크 데이터 구성
            book_maps_data = []
            for item in voca_list:
                origin = item.get('origin')
                if origin not in user_voca_dict: continue
                
                uv = user_voca_dict[origin]
                book_maps_data.append({
                    'user_voca_book_id': voca_book.id,
                    'user_voca_id': uv.id,
                    'voca_meanings': json.dumps(item.get('meanings', []), ensure_ascii=False),
                    'voca_examples': json.dumps(item.get('examples', []), ensure_ascii=False)
                })

            if book_maps_data:
                db.session.bulk_insert_mappings(UserVocaBookMap, book_maps_data)
            
            added_count = len(voca_list)

        # bookstoreId가 있고 vocaList가 없으면 admin_voca_book_map에서 단어 자동 복사
        elif bookstore_id:
            bookstore = db.session.query(Bookstore).filter(Bookstore.id == bookstore_id).first()
            if bookstore and bookstore.admin_voca_book_id:
                admin_maps = db.session.query(AdminVocaBookMap).filter(
                    AdminVocaBookMap.book_id == bookstore.admin_voca_book_id
                ).all()
                
                # 1. 기존 UserVoca 조회
                admin_words = [m.voca.word for m in admin_maps if m.voca]
                existing_vocas = db.session.query(UserVoca).filter(
                    UserVoca.user_id == user_id,
                    UserVoca.word.in_(admin_words)
                ).all()
                user_voca_dict = {uv.word: uv for uv in existing_vocas}

                user_vocas_to_add = []
                
                # 2. UserVoca 분류
                for admin_map in admin_maps:
                    if not admin_map.voca: continue
                    word = admin_map.voca.word
                    meanings = json.loads(admin_map.voca_meanings) if admin_map.voca_meanings else []
                    examples = json.loads(admin_map.voca_examples) if admin_map.voca_examples else []

                    if word in user_voca_dict:
                        uv = user_voca_dict[word]
                        uv.voca_meanings = merge_meanings(uv.voca_meanings, meanings)
                        uv.voca_examples = merge_examples(uv.voca_examples, examples)
                        if not uv.voca_id and admin_map.voca_id:
                            uv.voca_id = admin_map.voca_id
                        uv.updated_at = datetime.datetime.utcnow()
                    else:
                        new_uv = UserVoca(
                            user_id=user_id,
                            voca_id=admin_map.voca_id,
                            word=word,
                            voca_meanings=json.dumps(meanings, ensure_ascii=False),
                            voca_examples=json.dumps(examples, ensure_ascii=False)
                        )
                        user_vocas_to_add.append(new_uv)

                if user_vocas_to_add:
                    db.session.add_all(user_vocas_to_add)
                    db.session.flush()
                    for uv in user_vocas_to_add:
                        user_voca_dict[uv.word] = uv

                # 3. Map 데이터 구성
                book_maps_data = []
                for admin_map in admin_maps:
                    if not admin_map.voca: continue
                    word = admin_map.voca.word
                    uv = user_voca_dict[word]
                    book_maps_data.append({
                        'user_voca_book_id': voca_book.id,
                        'user_voca_id': uv.id,
                        'voca_meanings': admin_map.voca_meanings,
                        'voca_examples': admin_map.voca_examples
                    })
                
                if book_maps_data:
                    db.session.bulk_insert_mappings(UserVocaBookMap, book_maps_data)
                
                added_count = len(admin_maps)
            else:
                added_count = 0
        else:
            added_count = 0

        # 단어 수 업데이트
        voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({'code': 201, 'data': build_voca_book_response(voca_book)}), 201

    except Exception:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'code': 500, 'message': '단어장 생성 중 오류가 발생했습니다.'}), 500


# Excel 파일 업로드로 단어장 생성
@voca_books_bp.route('/upload/excel', methods=['POST'])
@jwt_required
def upload_excel_voca_book():
    user_id = UUID(g.user_id)

    # FormData에서 파일 및 JSON 데이터 수신
    file = request.files.get('file')
    json_data_str = request.form.get('json_data', '{}')

    try:
        json_data = json.loads(json_data_str)
    except json.JSONDecodeError:
        return jsonify({'code': 400, 'message': 'JSON 데이터 형식이 올바르지 않습니다.'}), 400

    title = json_data.get('title')
    color = json_data.get('color', {'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'})

    # 검증
    if not file:
        return jsonify({'code': 400, 'message': '파일이 첨부되지 않았습니다.'}), 400
    if not title:
        return jsonify({'code': 400, 'message': '단어장 이름(title)은 필수입니다.'}), 400

    # 파일 확장자 확인
    filename = file.filename or ''
    if not filename.lower().endswith(('.xlsx', '.xls')):
        return jsonify({'code': 400, 'message': '지원하지 않는 파일 형식입니다. .xlsx 또는 .xls 파일을 업로드해주세요.'}), 400

    try:
        # Excel 파일 파싱
        file_bytes = file.read()
        df = pd.read_excel(io.BytesIO(file_bytes), header=None)

        if df.empty:
            return jsonify({'code': 400, 'message': '파일에 데이터가 없습니다.'}), 400

        # 1행은 반드시 헤더(W, M 필수 / EE, EK 선택)
        first_row_raw = df.iloc[0].tolist()
        first_row_upper = [str(v).strip().upper() if pd.notna(v) else '' for v in first_row_raw]

        col_word = col_meaning = col_ee = col_ek = None
        for i, val in enumerate(first_row_upper):
            if val in ('W', 'WORD', '단어'):
                col_word = i
            elif val in ('M', 'MEANING', '뜻'):
                col_meaning = i
            elif val in ('EE', 'EXAMPLE', '예문'):
                col_ee = i
            elif val in ('EK',):
                col_ek = i

        if col_word is None:
            return jsonify({'code': 400, 'message': '1행 헤더에 단어(W) 열이 없습니다. 양식 가이드를 확인해주세요.'}), 400
        if col_meaning is None:
            return jsonify({'code': 400, 'message': '1행 헤더에 뜻(M) 열이 없습니다. 양식 가이드를 확인해주세요.'}), 400

        df = df.iloc[1:]  # 헤더 행 스킵

        if df.empty:
            return jsonify({'code': 400, 'message': '파일에 유효한 단어 데이터가 없습니다.'}), 400

        def get_cell(row, col_idx):
            if col_idx is None or col_idx >= len(row):
                return ''
            val = row.iloc[col_idx]
            return str(val).strip() if pd.notna(val) else ''

        # 파싱: W=단어(필수), M=뜻(필수), EE=영어예문(선택), EK=예문뜻(선택)
        parsed_items = []
        skipped_count = 0
        for idx, row in df.iterrows():
            word = get_cell(row, col_word)
            meaning = get_cell(row, col_meaning)
            example_en = get_cell(row, col_ee)
            example_ko = get_cell(row, col_ek)

            if not word or not meaning:
                skipped_count += 1
                continue  # 단어 또는 뜻이 없으면 스킵

            meanings = [m.strip() for m in meaning.split(',') if m.strip()]
            # EE(영어 예문)가 비면 예문 자체를 만들지 않는다. EK만 단독 입력은 무시.
            examples = [{'origin': example_en, 'meaning': example_ko}] if example_en else []

            parsed_items.append({
                'origin': word,
                'meanings': meanings,
                'examples': examples,
            })

        if not parsed_items:
            return jsonify({'code': 400, 'message': '파싱된 단어가 없습니다. 파일 형식을 확인해주세요. (W: 단어, M: 뜻, EE: 영어예문, EK: 예문뜻)'}), 400

        # 단어 길이 검증 (개별 255자 / 평균 50자)
        invalid = validate_word_lengths(parsed_items)
        if invalid:
            status, msg = invalid
            return jsonify({'code': status, 'message': msg}), status

        # UserVocaBook 생성
        voca_book = UserVocaBook(
            user_id=user_id,
            bookstore_id=None,
            color=json.dumps(color, ensure_ascii=False),
            name=title,
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None
        )
        db.session.add(voca_book)
        db.session.flush()

        added_count = bulk_persist_vocas(user_id, voca_book.id, parsed_items)

        voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({
            'code': 201,
            'message': f'{added_count}개의 단어가 추가되었습니다.',
            'data': build_voca_book_response(voca_book)
        }), 201

    except Exception:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'code': 500, 'message': 'Excel 파일 처리 중 오류가 발생했습니다.'}), 500


# CSV 파일 업로드로 단어장 생성
@voca_books_bp.route('/upload/csv', methods=['POST'])
@jwt_required
def upload_csv_voca_book():
    user_id = UUID(g.user_id)

    # FormData에서 파일 및 JSON 데이터 수신
    file = request.files.get('file')
    json_data_str = request.form.get('json_data', '{}')

    try:
        json_data = json.loads(json_data_str)
    except json.JSONDecodeError:
        return jsonify({'code': 400, 'message': 'JSON 데이터 형식이 올바르지 않습니다.'}), 400

    title = json_data.get('title')
    color = json_data.get('color', {'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'})

    # 검증
    if not file:
        return jsonify({'code': 400, 'message': '파일이 첨부되지 않았습니다.'}), 400
    if not title:
        return jsonify({'code': 400, 'message': '단어장 이름(title)은 필수입니다.'}), 400

    # 파일 확장자 확인
    filename = file.filename or ''
    if not filename.lower().endswith('.csv'):
        return jsonify({'code': 400, 'message': '지원하지 않는 파일 형식입니다. .csv 파일을 업로드해주세요.'}), 400

    try:
        # CSV 파일 파싱 (UTF-8 → CP949 순서로 인코딩 fallback)
        file_bytes = file.read()
        try:
            df = read_csv_with_encoding_fallback(file_bytes)
        except (UnicodeDecodeError, UnicodeError):
            return jsonify({
                'code': 400,
                'message': 'CSV 파일의 인코딩을 인식할 수 없습니다. UTF-8 또는 CP949(엑셀 한국어 기본)로 저장해주세요.'
            }), 400

        if df.empty:
            return jsonify({'code': 400, 'message': '파일에 데이터가 없습니다.'}), 400

        # 1행은 반드시 헤더(W, M 필수 / EE, EK 선택)
        first_row_raw = df.iloc[0].tolist()
        first_row_upper = [str(v).strip().upper() if pd.notna(v) else '' for v in first_row_raw]

        col_word = col_meaning = col_ee = col_ek = None
        for i, val in enumerate(first_row_upper):
            if val in ('W', 'WORD', '단어'):
                col_word = i
            elif val in ('M', 'MEANING', '뜻'):
                col_meaning = i
            elif val in ('EE', 'EXAMPLE', '예문'):
                col_ee = i
            elif val in ('EK',):
                col_ek = i

        if col_word is None:
            return jsonify({'code': 400, 'message': '1행 헤더에 단어(W) 열이 없습니다. 양식 가이드를 확인해주세요.'}), 400
        if col_meaning is None:
            return jsonify({'code': 400, 'message': '1행 헤더에 뜻(M) 열이 없습니다. 양식 가이드를 확인해주세요.'}), 400

        df = df.iloc[1:]  # 헤더 행 스킵

        if df.empty:
            return jsonify({'code': 400, 'message': '파일에 유효한 단어 데이터가 없습니다.'}), 400

        def get_cell(row, col_idx):
            if col_idx is None or col_idx >= len(row):
                return ''
            val = row.iloc[col_idx]
            return str(val).strip() if pd.notna(val) else ''

        # 파싱: W=단어(필수), M=뜻(필수), EE=영어예문(선택), EK=예문뜻(선택)
        parsed_items = []
        skipped_count = 0
        for idx, row in df.iterrows():
            word = get_cell(row, col_word)
            meaning = get_cell(row, col_meaning)
            example_en = get_cell(row, col_ee)
            example_ko = get_cell(row, col_ek)

            if not word or not meaning:
                skipped_count += 1
                continue  # 단어 또는 뜻이 없으면 스킵

            meanings = [m.strip() for m in meaning.split(',') if m.strip()]
            # EE(영어 예문)가 비면 예문 자체를 만들지 않는다. EK만 단독 입력은 무시.
            examples = [{'origin': example_en, 'meaning': example_ko}] if example_en else []

            parsed_items.append({
                'origin': word,
                'meanings': meanings,
                'examples': examples,
            })

        if not parsed_items:
            return jsonify({'code': 400, 'message': '파싱된 단어가 없습니다. 파일 형식을 확인해주세요. (W: 단어, M: 뜻, EE: 영어예문, EK: 예문뜻)'}), 400

        # 단어 길이 검증 (개별 255자 / 평균 50자)
        invalid = validate_word_lengths(parsed_items)
        if invalid:
            status, msg = invalid
            return jsonify({'code': status, 'message': msg}), status

        # UserVocaBook 생성
        voca_book = UserVocaBook(
            user_id=user_id,
            bookstore_id=None,
            color=json.dumps(color, ensure_ascii=False),
            name=title,
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None
        )
        db.session.add(voca_book)
        db.session.flush()

        added_count = bulk_persist_vocas(user_id, voca_book.id, parsed_items)

        voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({
            'code': 201,
            'message': f'{added_count}개의 단어가 추가되었습니다.',
            'data': build_voca_book_response(voca_book)
        }), 201

    except Exception:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'code': 500, 'message': 'CSV 파일 처리 중 오류가 발생했습니다.'}), 500


# 퀴즐렛 PDF 업로드로 단어장 생성
@voca_books_bp.route('/upload/quizlet-pdf', methods=['POST'])
@jwt_required
def upload_quizlet_pdf_voca_book():
    user_id = UUID(g.user_id)

    file = request.files.get('file')
    json_data_str = request.form.get('json_data', '{}')

    try:
        json_data = json.loads(json_data_str)
    except json.JSONDecodeError:
        return jsonify({'code': 400, 'message': 'JSON 데이터 형식이 올바르지 않습니다.'}), 400

    title = json_data.get('title')
    color = json_data.get('color', {'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'})

    if not file:
        return jsonify({'code': 400, 'message': '파일이 첨부되지 않았습니다.'}), 400
    if not title:
        return jsonify({'code': 400, 'message': '단어장 이름(title)은 필수입니다.'}), 400
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'code': 400, 'message': 'PDF 파일만 업로드할 수 있습니다.'}), 400

    # 파일 크기 체크 (2MB)
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(0)
    if file_size > 2 * 1024 * 1024:
        return jsonify({'code': 400, 'message': '파일 크기는 2MB 이하만 가능합니다.'}), 400

    try:
        # PDF 파싱 (user_voca_book.py의 함수 재사용)
        parsed_raw, failed_lines = parse_quizlet_pdf(file)

        if not parsed_raw:
            return jsonify({
                'code': 400,
                'message': '파싱된 단어가 없습니다. 퀴즐렛에서 저장한 PDF인지 확인해주세요.'
            }), 400

        # 헬퍼 입력 형식(origin/meanings/examples)으로 정규화
        parsed_items = [
            {
                'origin': item['word'],
                'meanings': [m.strip() for m in item['meaning'].split(',') if m.strip()],
                'examples': [],
            }
            for item in parsed_raw
        ]

        # UserVocaBook 생성
        voca_book = UserVocaBook(
            user_id=user_id,
            bookstore_id=None,
            color=json.dumps(color, ensure_ascii=False),
            name=title,
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None
        )
        db.session.add(voca_book)
        db.session.flush()

        added_count = bulk_persist_vocas(user_id, voca_book.id, parsed_items)

        voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()
        db.session.commit()

        message = f'{added_count}개의 단어가 추가되었습니다.'
        if failed_lines:
            message += f' ({len(failed_lines)}개 라인 파싱 실패)'

        return jsonify({
            'code': 201,
            'message': message,
            'data': build_voca_book_response(voca_book)
        }), 201

    except Exception:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'code': 500, 'message': 'PDF 파일 처리 중 오류가 발생했습니다.'}), 500


# 단어장 수정
@voca_books_bp.route('/<vocaBookId>', methods=['PATCH'])
@jwt_required
def update_voca_book(vocaBookId):
    user_id = UUID(g.user_id)
    req = request.get_json()

    try:
        voca_book_id = UUID(str(vocaBookId))
    except ValueError:
        return jsonify({'code': 400, 'message': '잘못된 형식의 단어장 ID입니다.'}), 400

    voca_book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == voca_book_id,
        UserVocaBook.user_id == user_id
    ).first()

    if not voca_book:
        return jsonify({'code': 404, 'message': '해당 단어장을 찾을 수 없습니다.'}), 404

    try:
        if 'title' in req:
            voca_book.name = req['title']
        if 'color' in req:
            voca_book.color = json.dumps(req['color'], ensure_ascii=False)

        voca_book.updated_at = datetime.datetime.utcnow()
        db.session.commit()

        return jsonify({'code': 200, 'data': build_voca_book_response(voca_book)}), 200

    except Exception:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'code': 500, 'message': '단어장 수정 중 오류가 발생했습니다.'}), 500


# 단어장 삭제
@voca_books_bp.route('/<vocaBookId>', methods=['DELETE'])
@jwt_required
def delete_voca_book(vocaBookId):
    user_id = UUID(g.user_id)
    try:
        voca_book_id = UUID(str(vocaBookId))
    except ValueError:
        return jsonify({'code': 400, 'message': '잘못된 형식의 단어장 ID입니다.'}), 400

    voca_book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == voca_book_id,
        UserVocaBook.user_id == user_id
    ).first()

    if not voca_book:
        return jsonify({'code': 404, 'message': '해당 단어장을 찾을 수 없습니다.'}), 404

    try:
        # 1. 삭제 대상 단어장에 포함된 단어 ID(user_voca_id) 목록 수집
        voca_ids = [m.user_voca_id for m in voca_book.voca_maps if m.user_voca_id is not None]

        # 2. 단어장 삭제 (UserVocaBookMap은 cascade로 자동 삭제되거나 명시적으로 삭제)
        # 현재 models.py의 UserVocaBook 정의 시 voca_maps 관계에 cascade="all, delete-orphan"이 설정되어 있음
        db.session.delete(voca_book)
        db.session.flush()

        # 3. 수집된 단어들에 대해 다른 단어장 매핑이 있는지 확인 후 고아 단어 삭제
        if voca_ids:
            for uv_id in set(voca_ids):
                exists_other = db.session.query(UserVocaBookMap).filter(
                    UserVocaBookMap.user_voca_id == uv_id
                ).first()
                
                if not exists_other:
                    db.session.query(UserVoca).filter(
                        UserVoca.id == uv_id,
                        UserVoca.user_id == user_id
                    ).delete()

        db.session.commit()
        return jsonify({'code': 204, 'message': '단어장 삭제 성공'}), 200

    except Exception:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'code': 500, 'message': '단어장 삭제 중 오류가 발생했습니다.'}), 500


# ──────────────────────────────────────────────
# Anki (.apkg) 업로드
# ──────────────────────────────────────────────

def _clean_anki_field(raw, keep_html=False):
    """안키 필드 값 정리.
    - [sound:...], <img ...> 미디어 참조 제거
    - {{c1::answer::hint}} cloze → answer 로 변환
    - keep_html=False 이면 HTML 태그도 모두 제거
    - HTML 엔티티 디코딩
    """
    if not raw:
        return ''
    text = raw

    # 미디어 참조 제거
    text = re.sub(r'\[sound:[^\]]*\]', '', text)
    text = re.sub(r'<img[^>]*>', '', text)

    # cloze deletion: {{c1::answer::hint}} → answer
    text = re.sub(r'\{\{c\d+::(.*?)(?:::[^}]*)?\}\}', r'\1', text)

    if not keep_html:
        # <br>, <br/> → 공백
        text = re.sub(r'<br\s*/?>', ' ', text, flags=re.IGNORECASE)
        # 나머지 HTML 태그 제거
        text = re.sub(r'<[^>]+>', '', text)

    # HTML 엔티티 디코딩
    text = html_unescape(text)

    # 연속 공백 정리
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _parse_apkg(file_bytes):
    """
    .apkg 바이트 → { deckName, noteTypes: [{ noteTypeId, noteTypeName, fields, noteCount, samples }] }
    구버전(anki2: col.models JSON)과 신버전(anki21: notetypes 테이블) 모두 지원.
    """
    tmp_dir = tempfile.mkdtemp()
    try:
        # ZIP 해제
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            zf.extractall(tmp_dir)

        # SQLite DB 파일 찾기
        db_path = None
        for name in ('collection.anki21', 'collection.anki2', 'collection.anki21b'):
            candidate = os.path.join(tmp_dir, name)
            if os.path.exists(candidate):
                db_path = candidate
                break

        if db_path is None:
            raise ValueError('apkg 파일에서 Anki 데이터베이스를 찾을 수 없습니다.')

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        # ── 노트 타입(모델) 정보 추출 ──
        models = {}  # { mid: { name, fields: [field_name, ...] } }

        # 신버전: notetypes 테이블 존재 여부 확인
        table_check = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='notetypes'"
        ).fetchone()

        if table_check:
            # 신버전 (anki21)
            for row in conn.execute("SELECT id, name, config FROM notetypes"):
                mid = row['id']
                nt_name = row['name']
                # fields 테이블에서 필드 목록 가져오기
                fields_rows = conn.execute(
                    "SELECT name FROM fields WHERE ntid=? ORDER BY ord", (mid,)
                ).fetchall()
                if fields_rows:
                    field_names = [r['name'] for r in fields_rows]
                else:
                    field_names = []
                models[mid] = {'name': nt_name, 'fields': field_names}
        else:
            # 구버전 (anki2): col 테이블의 models JSON 컬럼
            col_row = conn.execute("SELECT models FROM col").fetchone()
            if col_row:
                models_json = json.loads(col_row['models'])
                for mid_str, model_data in models_json.items():
                    mid = int(mid_str)
                    nt_name = model_data.get('name', 'Unknown')
                    field_names = [f['name'] for f in model_data.get('flds', [])]
                    models[mid] = {'name': nt_name, 'fields': field_names}

        if not models:
            raise ValueError('노트 타입 정보를 찾을 수 없습니다.')

        # ── 덱 이름 추출 ──
        deck_name = 'Anki Deck'
        deck_check = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='decks'"
        ).fetchone()
        if deck_check:
            deck_row = conn.execute("SELECT name FROM decks LIMIT 1").fetchone()
            if deck_row:
                deck_name = deck_row['name']
        else:
            col_row = conn.execute("SELECT decks FROM col").fetchone()
            if col_row:
                decks_json = json.loads(col_row['decks'])
                for did, d in decks_json.items():
                    if did != '1':  # 1 = Default 덱, 실제 덱 우선
                        deck_name = d.get('name', deck_name)
                        break

        # ── 노트 데이터 추출 ──
        notes_by_mid = {}  # { mid: [ {field_name: value, ...}, ... ] }
        for row in conn.execute("SELECT mid, flds FROM notes"):
            mid = row['mid']
            if mid not in models:
                continue
            field_values = row['flds'].split('\x1f')
            field_names = models[mid]['fields']
            note_dict = {}
            for i, fname in enumerate(field_names):
                note_dict[fname] = field_values[i] if i < len(field_values) else ''
            notes_by_mid.setdefault(mid, []).append(note_dict)

        conn.close()

        # ── 응답 구성 ──
        note_types = []
        for mid, model_info in models.items():
            notes = notes_by_mid.get(mid, [])
            if not notes:
                continue  # 노트가 없는 타입은 제외
            # 샘플 5개 (HTML 제거하여 미리보기용)
            samples = []
            for n in notes[:5]:
                samples.append({k: _clean_anki_field(v) for k, v in n.items()})

            # 필드별 길이 통계 (전체 노트 기준): 매핑 단계에서 평균 길이 가드 검증용
            field_stats = {}
            for fname in model_info['fields']:
                lengths = []
                for n in notes:
                    cleaned = _clean_anki_field(n.get(fname, ''))
                    if cleaned:
                        lengths.append(len(cleaned))
                if lengths:
                    field_stats[fname] = {
                        'avgLen': sum(lengths) / len(lengths),
                        'maxLen': max(lengths),
                        'nonEmptyCount': len(lengths),
                    }
                else:
                    field_stats[fname] = {'avgLen': 0, 'maxLen': 0, 'nonEmptyCount': 0}

            note_types.append({
                'noteTypeId': mid,
                'noteTypeName': model_info['name'],
                'fields': model_info['fields'],
                'noteCount': len(notes),
                'samples': samples,
                'fieldStats': field_stats,
            })

        return {'deckName': deck_name, 'noteTypes': note_types}

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# 안키 미리보기 (파싱)
@voca_books_bp.route('/upload/anki/preview', methods=['POST'])
@jwt_required
def upload_anki_preview():
    file = request.files.get('file')
    if not file:
        return jsonify({'code': 400, 'message': '파일이 첨부되지 않았습니다.'}), 400

    filename = file.filename or ''
    if not filename.lower().endswith('.apkg'):
        return jsonify({'code': 400, 'message': '지원하지 않는 파일 형식입니다. .apkg 파일을 업로드해주세요.'}), 400

    try:
        file_bytes = file.read()
        result = _parse_apkg(file_bytes)

        if not result['noteTypes']:
            return jsonify({'code': 400, 'message': '파일에 단어 데이터가 없습니다.'}), 400

        return jsonify({'code': 200, 'data': result}), 200

    except ValueError as e:
        return jsonify({'code': 400, 'message': str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({'code': 500, 'message': 'Anki 파일 처리 중 오류가 발생했습니다.'}), 500


# 안키 최종 업로드 (필드 매핑 적용하여 단어장 생성)
@voca_books_bp.route('/upload/anki', methods=['POST'])
@jwt_required
def upload_anki_voca_book():
    user_id = UUID(g.user_id)

    file = request.files.get('file')
    json_data_str = request.form.get('json_data', '{}')

    try:
        json_data = json.loads(json_data_str)
    except json.JSONDecodeError:
        return jsonify({'code': 400, 'message': 'JSON 데이터 형식이 올바르지 않습니다.'}), 400

    title = json_data.get('title')
    color = json_data.get('color', {'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'})
    mapping = json_data.get('mapping', {})
    selected_note_type_id = json_data.get('selectedNoteTypeId')

    # 검증
    if not file:
        return jsonify({'code': 400, 'message': '파일이 첨부되지 않았습니다.'}), 400
    if not title:
        return jsonify({'code': 400, 'message': '단어장 이름(title)은 필수입니다.'}), 400
    if not mapping.get('word') or not mapping.get('meaning'):
        return jsonify({'code': 400, 'message': '영단어(word)와 뜻(meaning) 필드 매핑은 필수입니다.'}), 400

    filename = file.filename or ''
    if not filename.lower().endswith('.apkg'):
        return jsonify({'code': 400, 'message': '지원하지 않는 파일 형식입니다. .apkg 파일을 업로드해주세요.'}), 400

    try:
        file_bytes = file.read()
        parsed = _parse_apkg(file_bytes)

        # 선택된 노트 타입 찾기
        target_nt = None
        for nt in parsed['noteTypes']:
            if nt['noteTypeId'] == selected_note_type_id:
                target_nt = nt
                break

        if target_nt is None:
            # 노트 타입이 1개면 자동 선택
            if len(parsed['noteTypes']) == 1:
                target_nt = parsed['noteTypes'][0]
            else:
                return jsonify({'code': 400, 'message': '노트 타입을 선택해주세요.'}), 400

        # 매핑 필드명
        field_word = mapping['word']
        field_meaning = mapping['meaning']
        field_pronunciation = mapping.get('pronunciation')
        field_example = mapping.get('example')
        field_example_meaning = mapping.get('exampleMeaning')

        # 원본 노트 다시 파싱 (샘플이 아닌 전체 데이터)
        tmp_dir = tempfile.mkdtemp()
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                zf.extractall(tmp_dir)

            db_path = None
            for name in ('collection.anki21', 'collection.anki2', 'collection.anki21b'):
                candidate = os.path.join(tmp_dir, name)
                if os.path.exists(candidate):
                    db_path = candidate
                    break

            conn = sqlite3.connect(db_path)
            field_names = target_nt['fields']
            mid = target_nt['noteTypeId']

            parsed_items = []
            for row in conn.execute("SELECT flds FROM notes WHERE mid=?", (mid,)):
                field_values = row[0].split('\x1f')
                note = {}
                for i, fname in enumerate(field_names):
                    note[fname] = field_values[i] if i < len(field_values) else ''

                # 매핑 적용
                word = _clean_anki_field(note.get(field_word, ''))
                meaning = _clean_anki_field(note.get(field_meaning, ''))

                if not word or not meaning:
                    continue

                meanings = [m.strip() for m in meaning.split(',') if m.strip()]

                examples = []
                if field_example and note.get(field_example, '').strip():
                    ex_origin = _clean_anki_field(note[field_example], keep_html=True)
                    ex_meaning = ''
                    if field_example_meaning and note.get(field_example_meaning, '').strip():
                        ex_meaning = _clean_anki_field(note[field_example_meaning])
                    examples = [{'origin': ex_origin, 'meaning': ex_meaning}]

                item = {
                    'origin': word,
                    'meanings': meanings,
                    'examples': examples,
                }

                # 발음이 매핑되어 있으면 origin에 추가하지 않고 별도 보관 (향후 확장용)
                # 현재 heyvoca 구조에서 pronunciation은 UserVoca에 별도 컬럼 없으므로
                # 뜻 앞에 붙여서 저장하는 방식으로 처리
                if field_pronunciation and note.get(field_pronunciation, '').strip():
                    pron = _clean_anki_field(note[field_pronunciation])
                    meanings.insert(0, f'[{pron}]')

                parsed_items.append(item)

            conn.close()
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

        if not parsed_items:
            return jsonify({'code': 400, 'message': '매핑 결과 유효한 단어가 없습니다. 필드 매핑을 확인해주세요.'}), 400

        # 중복 단어 병합 (같은 origin을 가진 노트들의 뜻/예문을 합침)
        merged = {}
        for item in parsed_items:
            key = item['origin']
            if key in merged:
                existing = merged[key]
                for m in item['meanings']:
                    if m not in existing['meanings']:
                        existing['meanings'].append(m)
                for ex in item['examples']:
                    if ex not in existing['examples']:
                        existing['examples'].append(ex)
            else:
                merged[key] = item
        parsed_items = list(merged.values())

        # 단어 길이 검증 (개별 255자 / 평균 50자)
        invalid = validate_word_lengths(parsed_items)
        if invalid:
            status, msg = invalid
            return jsonify({'code': status, 'message': msg}), status

        # UserVocaBook 생성 (기존 CSV 업로드와 동일한 패턴)
        voca_book = UserVocaBook(
            user_id=user_id,
            bookstore_id=None,
            color=json.dumps(color, ensure_ascii=False),
            name=title,
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None
        )
        db.session.add(voca_book)
        db.session.flush()

        added_count = bulk_persist_vocas(user_id, voca_book.id, parsed_items)

        voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({
            'code': 201,
            'message': f'{added_count}개의 단어가 추가되었습니다.',
            'data': build_voca_book_response(voca_book)
        }), 201

    except ValueError as e:
        db.session.rollback()
        return jsonify({'code': 400, 'message': str(e)}), 400
    except Exception:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'code': 500, 'message': 'Anki 파일 처리 중 오류가 발생했습니다.'}), 500
