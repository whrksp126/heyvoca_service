import json
import datetime
import io
import pandas as pd
from flask import request, jsonify, g
from uuid import UUID, uuid4

from app.routes import voca_books_bp
from app.models.models import db, UserVocaBook, UserVocaBookMap, UserVoca, Bookstore, AdminVocaBookMap
from app.utils.jwt_utils import jwt_required
from app.routes.voca_indexs import merge_meanings, merge_examples


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

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어장 생성 중 오류가 발생했습니다: {str(e)}'}), 500


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

        # 첫 행이 헤더인지 자동 감지
        first_row_raw = df.iloc[0].tolist()
        first_row_upper = [str(v).strip().upper() if pd.notna(v) else '' for v in first_row_raw]
        header_keywords = {'W', 'M', 'EE', 'EK', 'WORD', 'MEANING', 'EXAMPLE', '단어', '뜻', '예문'}
        is_header = any(val in header_keywords for val in first_row_upper)

        # 열 인덱스 기본값 (헤더 없을 때 위치 기반)
        col_word, col_meaning, col_ee, col_ek = 0, 1, 2, 3

        if is_header:
            # 헤더 이름으로 열 인덱스 동적 매핑
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
                return jsonify({'code': 400, 'message': '헤더에 단어(W) 열이 없습니다. W 헤더를 추가하거나, 헤더 없이 1열에 단어를 입력해주세요.'}), 400
            if col_meaning is None:
                return jsonify({'code': 400, 'message': '헤더에 뜻(M) 열이 없습니다. M 헤더를 추가하거나, 헤더 없이 2열에 뜻을 입력해주세요.'}), 400

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
            examples = [{'origin': example_en, 'meaning': example_ko}] if example_en else []

            parsed_items.append({
                'origin': word,
                'meanings': meanings,
                'examples': examples,
            })

        if not parsed_items:
            return jsonify({'code': 400, 'message': '파싱된 단어가 없습니다. 파일 형식을 확인해주세요. (W: 단어, M: 뜻, EE: 영어예문, EK: 예문뜻)'}), 400


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

        # SM2 초기값
        default_sm2 = {
            "ef": 2.5,
            "repetition": 0,
            "interval": 0,
            "nextReview": None,
            "lastStudyDate": None,
            "beforeScheduleCount": 0
        }

        # 각 단어에 대해 UserVoca + UserVocaBookMap 생성
        added_count = 0
        for item in parsed_items:
            origin = item['origin']
            meanings = item['meanings']
            examples = item['examples']

            # 같은 단어가 UserVoca에 이미 있는지 확인
            user_voca = db.session.query(UserVoca).filter(
                UserVoca.user_id == user_id,
                UserVoca.word == origin
            ).first()

            if user_voca:
                user_voca.voca_meanings = merge_meanings(user_voca.voca_meanings, meanings)
                user_voca.voca_examples = merge_examples(user_voca.voca_examples, examples)
            else:
                user_voca = UserVoca()
                user_voca.user_id = user_id
                user_voca.voca_id = None
                user_voca.word = origin
                user_voca.voca_meanings = json.dumps(meanings, ensure_ascii=False)
                user_voca.voca_examples = json.dumps(examples, ensure_ascii=False)
                user_voca.data = json.dumps(default_sm2, ensure_ascii=False)
                db.session.add(user_voca)
                db.session.flush()

            # UserVocaBookMap 생성
            book_map = UserVocaBookMap()
            book_map.user_voca_book_id = voca_book.id
            book_map.user_voca_id = user_voca.id
            book_map.voca_meanings = json.dumps(meanings, ensure_ascii=False)
            book_map.voca_examples = json.dumps(examples, ensure_ascii=False)
            db.session.add(book_map)
            added_count += 1

        # 단어 수 업데이트
        voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({
            'code': 201,
            'message': f'{added_count}개의 단어가 추가되었습니다.',
            'data': build_voca_book_response(voca_book)
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'Excel 파일 처리 중 오류가 발생했습니다: {str(e)}'}), 500


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
        # CSV 파일 파싱
        file_bytes = file.read()
        df = pd.read_csv(io.BytesIO(file_bytes), header=None, encoding='utf-8')

        if df.empty:
            return jsonify({'code': 400, 'message': '파일에 데이터가 없습니다.'}), 400

        # 첫 행이 헤더인지 자동 감지
        first_row_raw = df.iloc[0].tolist()
        first_row_upper = [str(v).strip().upper() if pd.notna(v) else '' for v in first_row_raw]
        header_keywords = {'W', 'M', 'EE', 'EK', 'WORD', 'MEANING', 'EXAMPLE', '단어', '뜻', '예문'}
        is_header = any(val in header_keywords for val in first_row_upper)

        # 열 인덱스 기본값 (헤더 없을 때 위치 기반)
        col_word, col_meaning, col_ee, col_ek = 0, 1, 2, 3

        if is_header:
            # 헤더 이름으로 열 인덱스 동적 매핑
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
                return jsonify({'code': 400, 'message': '헤더에 단어(W) 열이 없습니다. W 헤더를 추가하거나, 헤더 없이 1열에 단어를 입력해주세요.'}), 400
            if col_meaning is None:
                return jsonify({'code': 400, 'message': '헤더에 뜻(M) 열이 없습니다. M 헤더를 추가하거나, 헤더 없이 2열에 뜻을 입력해주세요.'}), 400

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
            examples = [{'origin': example_en, 'meaning': example_ko}] if example_en else []

            parsed_items.append({
                'origin': word,
                'meanings': meanings,
                'examples': examples,
            })

        if not parsed_items:
            return jsonify({'code': 400, 'message': '파싱된 단어가 없습니다. 파일 형식을 확인해주세요. (W: 단어, M: 뜻, EE: 영어예문, EK: 예문뜻)'}), 400

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

        # SM2 초기값
        default_sm2 = {
            "ef": 2.5,
            "repetition": 0,
            "interval": 0,
            "nextReview": None,
            "lastStudyDate": None,
            "beforeScheduleCount": 0
        }

        # 각 단어에 대해 UserVoca + UserVocaBookMap 생성
        added_count = 0
        for item in parsed_items:
            origin = item['origin']
            meanings = item['meanings']
            examples = item['examples']

            # 같은 단어가 UserVoca에 이미 있는지 확인
            user_voca = db.session.query(UserVoca).filter(
                UserVoca.user_id == user_id,
                UserVoca.word == origin
            ).first()

            if user_voca:
                user_voca.voca_meanings = merge_meanings(user_voca.voca_meanings, meanings)
                user_voca.voca_examples = merge_examples(user_voca.voca_examples, examples)
            else:
                user_voca = UserVoca()
                user_voca.user_id = user_id
                user_voca.voca_id = None
                user_voca.word = origin
                user_voca.voca_meanings = json.dumps(meanings, ensure_ascii=False)
                user_voca.voca_examples = json.dumps(examples, ensure_ascii=False)
                user_voca.data = json.dumps(default_sm2, ensure_ascii=False)
                db.session.add(user_voca)
                db.session.flush()

            # UserVocaBookMap 생성
            book_map = UserVocaBookMap()
            book_map.user_voca_book_id = voca_book.id
            book_map.user_voca_id = user_voca.id
            book_map.voca_meanings = json.dumps(meanings, ensure_ascii=False)
            book_map.voca_examples = json.dumps(examples, ensure_ascii=False)
            db.session.add(book_map)
            added_count += 1

        # 단어 수 업데이트
        voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({
            'code': 201,
            'message': f'{added_count}개의 단어가 추가되었습니다.',
            'data': build_voca_book_response(voca_book)
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'CSV 파일 처리 중 오류가 발생했습니다: {str(e)}'}), 500


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

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어장 수정 중 오류가 발생했습니다: {str(e)}'}), 500


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

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어장 삭제 중 오류가 발생했습니다: {str(e)}'}), 500
