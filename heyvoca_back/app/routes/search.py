import json
import re
import os
from flask import render_template, redirect, url_for, request, session, jsonify, g
from sqlalchemy import text, select, case, func
from sqlalchemy.orm import joinedload, contains_eager
from app.routes import search_bp
from app.models.models import db, VocaBook, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, Bookstore
from flask_caching import Cache
import redis

cache = Cache()

# @login_required
@search_bp.route('/')
def index():
    # 부분 입력에 따른 단어 검색 기능
    return render_template('index.html')

################
# 사전 검색 API #
################
## 영어(단어) 전체 검색
@search_bp.route('/en', methods=['GET'])
def search_voca_word_en():

    word = request.args.get('word')
    print('word : ', word)
    

    if not word:
        return jsonify(['잘못된 요청'])

    # 서브 쿼리 : 해당 단어와 완전히 일치하는 id 검색 (오름차순 기준 최대 10개까지)
    subquery = (db.session.query(Voca.id)
                .filter(Voca.word == word)  # 완전 일치 검색
                .order_by(Voca.word.asc())
                .limit(10)
                .subquery())

    # 메인 쿼리 : word, meaning 조인해서 서브 쿼리에 포함된 word id의 데이터만 검색
    results = (db.session.query(Voca, VocaMeaning)
               .outerjoin(VocaMeaningMap, Voca.id == VocaMeaningMap.voca_id)
               .outerjoin(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)
               .filter(Voca.id.in_(subquery))
               .all())
    
    # 단어별로 뜻을 매핑하여 결과 생성
    data = []  # 최종 데이터 담는 리스트
    word_meaning_map = {}
    for word, meaning in results:
        # 예문 데이터 처리
        example_data = []
        for example_map in db.session.query(VocaExampleMap).filter_by(voca_id=word.id).all():
            example = db.session.query(VocaExample).filter_by(id=example_map.example_id).first()
            if example:
                example_data.append({"id": example.id, "origin": example.exam_en, "meaning": example.exam_ko})

        # 단어 및 뜻 데이터 처리
        if word.id not in word_meaning_map:
            word_meaning_map[word.id] = {
                'word': word.word,
                'pronunciation': word.pronunciation,
                'examples': example_data,
                'meanings': []
            }

        if meaning:
            word_meaning_map[word.id]['meanings'].append(meaning.meaning)

    for word_data in word_meaning_map.values():
        data.append(word_data)
    
    
    return jsonify({'code': 200, 'data': data}), 200

## 영어(단어) 부분 검색
@search_bp.route('/partial/en', methods=['GET'])
def search_word_en():

    partial_word = request.args.get('word')

    if not partial_word:
        return jsonify(['잘못된 요청'])

    search_pattern = f'{partial_word}%'

    # 유사도 순 정렬: 완전 일치 > 짧은 단어(쿼리에 가까움) > 알파벳 순
    id_rows = (db.session.query(Voca.id)
               .filter(Voca.word.like(search_pattern))
               .order_by(
                   case((Voca.word == partial_word, 0), else_=1),
                   func.length(Voca.word).asc(),
                   Voca.word.asc()
               )
               .limit(10)
               .all())
    voca_ids = [r[0] for r in id_rows]

    if not voca_ids:
        return jsonify({'code': 200, 'data': []}), 200

    # 단어와 발음 가져오기
    words = db.session.query(Voca).filter(Voca.id.in_(voca_ids)).all()

    # 뜻 가져오기
    meanings = (db.session.query(VocaMeaningMap.voca_id, VocaMeaning.meaning)
                .join(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)
                .filter(VocaMeaningMap.voca_id.in_(voca_ids))
                .all())

    # 예문 가져오기
    examples = (db.session.query(VocaExampleMap.voca_id, VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko)
                .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
                .filter(VocaExampleMap.voca_id.in_(voca_ids))
                .all())

    # 단어별로 뜻과 예문을 매핑하여 결과 생성
    word_map = {word.id: {
        'word': word.word,
        'pronunciation': word.pronunciation,
        'meanings': [],
        'examples': []
    } for word in words}

    # 뜻 추가
    for voca_id, meaning in meanings:
        if meaning not in word_map[voca_id]['meanings']:
            word_map[voca_id]['meanings'].append(meaning)

    # 예문 추가
    for voca_id, example_id, exam_en, exam_ko in examples:
        example_data = {"id": example_id, "origin": exam_en, "meaning": exam_ko}
        if example_data not in word_map[voca_id]['examples']:
            word_map[voca_id]['examples'].append(example_data)

    # voca_ids 순서(유사도순)대로 최종 데이터 구성
    data = [word_map[vid] for vid in voca_ids if vid in word_map]

    return jsonify({'code': 200, 'data': data}), 200


## 한글(뜻) 부분 검색
# 1. 초성만 검색('ㄱ')  2. 글자+초성 검색('구ㄱ')  3. 글자 검색('구급차')
@search_bp.route('/partial/ko', methods=['GET'])
def search_word_korean():
    partial_word = request.args.get('word')
    word_split = list(partial_word) if partial_word else [] # 한 글자씩 담기

    if not partial_word:
        return jsonify({'code': 400, 'message': '잘못된 요청입니다.'}), 400

    first_char = word_split[0]
    last_char = word_split[-1]

    if identify_character(first_char) == '초성':
        # 전체 초성인 경우
        regex_pattern = '^' + ''.join(get_unicode_range_for_initial(w) for w in word_split)
    elif identify_character(first_char) == '한글' and identify_character(last_char) == '초성':
        # 마지막 글자만 초성일 경우
        regex_pattern = '^' + re.escape(''.join(partial_word[:-1])) + get_unicode_range_for_initial(last_char)
    elif identify_character(first_char) == '한글' and identify_character(last_char) == '한글':
        # 한글인 경우
        regex_pattern = re.escape(partial_word) + '.*'
    else:
        return jsonify({'code': 400, 'message': '잘못된 요청입니다.'}), 400
    
    # 1. 매치된 meaning들을 유사도 순으로 가져와서 voca_id 순서 추출 (중복 제거, 최대 10개 voca)
    match_query = text("""
        SELECT voca_meaning.meaning, voca_meaning_map.voca_id
        FROM voca_meaning
        JOIN voca_meaning_map ON voca_meaning.id = voca_meaning_map.meaning_id
        WHERE REPLACE(voca_meaning.meaning, ' ', '') REGEXP :pattern
        ORDER BY
            CASE WHEN REPLACE(voca_meaning.meaning, ' ', '') = :exact THEN 0 ELSE 1 END,
            CASE WHEN REPLACE(voca_meaning.meaning, ' ', '') LIKE :starts_with THEN 0 ELSE 1 END,
            CHAR_LENGTH(voca_meaning.meaning) ASC,
            voca_meaning.meaning ASC
        LIMIT 30
    """)
    matched = db.session.execute(match_query, {
        'pattern': regex_pattern,
        'exact': partial_word,
        'starts_with': f'{partial_word}%',
    }).fetchall()

    # 유사도 순으로 중복 없이 voca_id 수집 (매치된 대표 의미도 기억)
    voca_ids = []
    matched_meaning_map = {}  # voca_id -> 매치된 의미(첫 번째, 가장 유사도 높음)
    for row in matched:
        if row.voca_id not in matched_meaning_map:
            matched_meaning_map[row.voca_id] = row.meaning
            voca_ids.append(row.voca_id)
        if len(voca_ids) >= 10:
            break

    if not voca_ids:
        return jsonify({'code': 200, 'data': []}), 200

    # 2. voca들의 전체 정보(모든 meanings + examples) 조회
    words = db.session.query(Voca).filter(Voca.id.in_(voca_ids)).all()

    all_meanings = (db.session.query(VocaMeaningMap.voca_id, VocaMeaning.meaning)
                    .join(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)
                    .filter(VocaMeaningMap.voca_id.in_(voca_ids))
                    .all())

    all_examples = (db.session.query(VocaExampleMap.voca_id, VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko)
                    .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
                    .filter(VocaExampleMap.voca_id.in_(voca_ids))
                    .all())

    # 3. 단어별로 뜻/예문 그룹핑
    word_map = {w.id: {
        'word': w.word,
        'pronunciation': w.pronunciation,
        'meanings': [],
        'examples': [],
    } for w in words}

    for voca_id, meaning in all_meanings:
        if meaning not in word_map[voca_id]['meanings']:
            word_map[voca_id]['meanings'].append(meaning)

    for voca_id, exam_id, exam_en, exam_ko in all_examples:
        ex = {"id": exam_id, "origin": exam_en, "meaning": exam_ko}
        if ex not in word_map[voca_id]['examples']:
            word_map[voca_id]['examples'].append(ex)

    # 4. 각 단어의 meanings에서 매치된 의미를 맨 앞으로 이동 (검색한 의미가 우선 노출)
    for vid, w in word_map.items():
        matched_meaning = matched_meaning_map.get(vid)
        if matched_meaning and matched_meaning in w['meanings']:
            w['meanings'].remove(matched_meaning)
            w['meanings'].insert(0, matched_meaning)

    # 5. voca_ids 순서(유사도순)대로 최종 데이터 구성
    data = [word_map[vid] for vid in voca_ids if vid in word_map]

    return jsonify({'code': 200, 'data': data}), 200


# 한글 자음 리스트
#CHO = [chr(i) for i in range(0x1100, 0x1113)]  # 초성
CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
        'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

# 초성인지 확인하는 함수
# 맞으면 True, 아니면 False 반환
def is_initial(char):
    return char in CHO

# 글자인지 확인하는 함수
# 맞으면 True, 아니면 False 반환
def is_hangul(char):
    return '가' <= char <= '힣'

def identify_character(char):
    if is_initial(char):
        return '초성'
    elif is_hangul(char):
        return '한글'
    else:
        return '기타'

# 초성에 해당하는 유니코드 범위 반환 함수
def get_unicode_range_for_initial(char):
    initial_index = CHO.index(char)
    start = chr(0xAC00 + initial_index * 21 * 28) # 가
    end = chr(0xAC00 + (initial_index + 1) * 21 * 28 - 1) # 깋
    return f'[{start}-{end}]' # [가-깋]


##############
## 서점 검색 ##
##############


## 서점 단어 검색 API (사전 페이지 전용)
@search_bp.route('/bookstore/word', methods=['GET'])
def search_bookstore_word():
    partial_word = request.args.get('word')
    if not partial_word or len(partial_word) < 2:
        return jsonify({'code': 400, 'message': '잘못된 요청'}), 400

    search_pattern = f'{partial_word}%'

    query = text("""
        SELECT
            bs.id AS bookstore_id,
            bs.name AS bookstore_name,
            bs.color,
            v.word,
            v.pronunciation,
            GROUP_CONCAT(DISTINCT vm.meaning ORDER BY vm.id SEPARATOR '|||') AS meanings
        FROM bookstore bs
        JOIN admin_voca_book avb ON bs.admin_voca_book_id = avb.id
        JOIN admin_voca_book_map avbm ON avb.id = avbm.book_id
        JOIN voca v ON avbm.voca_id = v.id
        LEFT JOIN voca_meaning_map vmm ON v.id = vmm.voca_id
        LEFT JOIN voca_meaning vm ON vmm.meaning_id = vm.id
        WHERE v.word LIKE :pattern
          AND bs.hide = 0
        GROUP BY bs.id, v.id
        LIMIT 10
    """)
    results = db.session.execute(query, {'pattern': search_pattern}).fetchall()

    data = []
    for row in results:
        meanings = row.meanings.split('|||') if row.meanings else []
        data.append({
            'bookstore_id': row.bookstore_id,
            'bookstore_name': row.bookstore_name,
            'color': row.color,
            'word': row.word,
            'pronunciation': row.pronunciation,
            'meanings': meanings
        })

    return jsonify({'code': 200, 'data': data}), 200


## 서점 데이터 API
# bookstore, admin_voca_book, admin_voca_book_map 테이블의 데이터를 가져옴
@search_bp.route('/bookstore', methods=['GET'])
def search_bookstore_all():
    # MySQL용 쿼리 (단어 목록 제외)
    query = text("""
        SELECT
            bs.id AS bookstore_id,
            bs.name AS bookstore_name,
            bs.downloads,
            bs.category,
            bs.color,
            bs.hide,
            bs.gem,
            COALESCE(avb.word_count, 0) AS word_count
        FROM bookstore bs
        JOIN admin_voca_book avb ON bs.admin_voca_book_id = avb.id
        GROUP BY bs.id
    """)

    # 데이터 조회
    rows = db.session.execute(query).fetchall()

    # 결과 가공
    final_results = []
    for row in rows:
        # color 처리
        color_data = row.color
        if isinstance(color_data, str):
            color_data = json.loads(color_data)

        final_results.append({
            "id": row.bookstore_id,
            "name": row.bookstore_name,
            "downloads": row.downloads,
            "category": row.category,
            "color": color_data,
            "hide": row.hide,
            "gem": row.gem,
            "vocaCount": row.word_count
        })

    return jsonify({'code': 200, 'data': final_results}), 200


## 서점 단어장 상세 데이터 API
@search_bp.route('/bookstore/<int:bookstoreId>', methods=['GET'])
def get_bookstore_detail(bookstoreId):
    # 서점 및 연결된 단어장 정보 조회
    bookstore = db.session.query(Bookstore).filter_by(id=bookstoreId).first()
    
    if not bookstore:
        return jsonify({'code': 404, 'message': '해당하는 서점이 없습니다.'}), 404

    # 단어 목록 조회
    query = text("""
        SELECT
            v.id,
            v.word AS origin,
            v.pronunciation,
            CAST(avbm.voca_meanings AS JSON) AS meanings,
            CAST(avbm.voca_examples AS JSON) AS examples
        FROM admin_voca_book_map avbm
        JOIN voca v ON avbm.voca_id = v.id
        WHERE avbm.book_id = :admin_voca_book_id
    """)

    rows = db.session.execute(query, {'admin_voca_book_id': bookstore.admin_voca_book_id}).fetchall()

    # 결과 가공
    vocas = []
    for row in rows:
        vocas.append({
            "id": row.id,
            "origin": row.origin,
            "pronunciation": row.pronunciation,
            "meanings": json.loads(row.meanings) if row.meanings else [],
            "examples": json.loads(row.examples) if row.examples else []
        })

    # color 처리
    color_data = bookstore.color
    if isinstance(color_data, str):
        color_data = json.loads(color_data)

    return jsonify({
        'code': 200,
        'data': {
            "id": bookstore.id,
            "name": bookstore.name,
            "category": bookstore.category,
            "downloads": bookstore.downloads,
            "gem": bookstore.gem,
            "color": color_data,
            "vocaCount": bookstore.admin_voca_book.word_count,
            "words": vocas
        }
    }), 200


# 서점 다운로드 수 증가
@search_bp.route('/bookstore/download', methods=['POST'])
def bookstore_download():
    data = request.json
    id = data.get('id')

    if not id:
        return jsonify({'code': 400, 'message': '없는 ID 입니다.'}), 400
    
    try:
        # id에 해당하는 bookstore 검색
        bookstore = db.session.query(Bookstore).filter_by(id=id).first()

        if not bookstore:
            return jsonify({'code': 404, 'message': '해당하는 서점이 없습니다.'}), 404

        # downloads 값 1 증가
        bookstore.downloads = (bookstore.downloads or 0) + 1
        print(bookstore.downloads)
        db.session.commit()

        return jsonify({'code': 200, 'data': {'id': id, 'downloads': bookstore.downloads}}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': 'Internal Server Error'}), 500

## 서점 단어장 색상 샘플
# {"main":"#FF8DD4", "sub":"#FFD2EF", "background":"#FFEFFA"}
# {"main":"#CD8DFF", "sub":"#EAD2FF", "background":"#F6EFFF"}
# {"main":"#74D5FF", "sub":"#C6ECFF", "background":"#EAF6FF"}
# {"main":"#42F98B", "sub":"#B2FDCC", "background":"#E2FFE8"}
# {"main":"#FFBD3C", "sub":"#FFE5AE", "background":"#FFF6DF"}
