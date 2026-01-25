import json
import re
from flask import render_template, redirect, url_for, request, session, jsonify, g
from sqlalchemy import text, select
from sqlalchemy.orm import joinedload, contains_eager
# from datetime import datetime, timedelta
import datetime, time, random
from uuid import uuid4, UUID

from app.routes import user_voca_book_bp
from app.models.models import db, User, VocaBook, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, Bookstore, UserVocaBook
from app.routes.mainpage import update_user_goal
from app.utils.jwt_utils import jwt_required



@user_voca_book_bp.route('/list', methods=['GET'])
@jwt_required
def get_user_voca_book_list():
    user_id = UUID(g.user_id)  # JWT에서 온 문자열을 UUID로 변환

    user_voca_book_list = db.session.query(UserVocaBook)\
                                .filter(UserVocaBook.user_id == user_id).all()
    print("###user_voca_book_list : ",user_voca_book_list)
    
    data = []
    for user_voca_book in user_voca_book_list:
        vocabook_dict = {}
        vocabook_dict['id'] = user_voca_book.id
        vocabook_dict['bookstore_id'] = user_voca_book.bookstore_id
        vocabook_dict['title'] = user_voca_book.name
        vocabook_dict['words'] = json.loads(user_voca_book.voca_list) if user_voca_book.voca_list else []
        vocabook_dict['color'] = json.loads(user_voca_book.color)
        vocabook_dict['total'] = user_voca_book.total_word_cnt
        vocabook_dict['memorized'] = user_voca_book.memorized_word_cnt
        vocabook_dict['createdAt'] = user_voca_book.created_at + datetime.timedelta(hours=9)
        vocabook_dict['updatedAt'] = user_voca_book.updated_at + datetime.timedelta(hours=9) if user_voca_book.updated_at else user_voca_book.created_at + datetime.timedelta(hours=9)

        data.append(vocabook_dict)

    return jsonify({'code': 200, 'data': data}), 200


# 단어장 생성
@user_voca_book_bp.route('/create', methods=['POST'])
@jwt_required
def create_user_voca_book():
    data = request.get_json()
    bookstore_id = data.get('bookstore_id')
    name = data['title']
    color = data['color']
    user_id = UUID(g.user_id)  # JWT에서 온 문자열을 UUID로 변환

    user = db.session.query(User).filter(User.id == user_id).first()
    print("###user : ",user)

    try:
        user_voca_book = UserVocaBook(
            user_id=user_id,
            bookstore_id=bookstore_id,
            color=json.dumps(color),
            name=name,
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None
        )
        db.session.add(user_voca_book)

        message = ''
        if bookstore_id:
            # 유료 단어장인 경우 다운로드 카운트만 증가
            bookstore_item = db.session.query(Bookstore).filter(Bookstore.id == bookstore_id).first()
            if bookstore_item:
                bookstore_item.downloads += 1
            message = '단어장이 생성되었습니다.'
        else:
            # 무료 단어장인 경우 book_cnt 차감
            if user.book_cnt < 1:
                db.session.rollback()
                return jsonify({
                    'code': 400, 
                    'message': '최대 단어장 생성 개수를 초과했습니다.'
                }), 400
            user.book_cnt -= 1
            message = '단어장이 생성되었습니다.'

        # 독서왕 업적 업데이트 (서점 단어장 추가 시)
        reading_goal_complete, reading_goal_reward_count, reading_goal_badge_img, reading_goal_level = None, None, None, None
        before_gem_cnt = user.gem_cnt
        if bookstore_id:
            reading_goal_complete, reading_goal_reward_count, reading_goal_badge_img, reading_goal_level = update_user_goal('독서왕')

        db.session.commit() 
        
        # 사용자 정보 최신화 (업적 보상 반영됨)
        user = db.session.query(User).filter(User.id == user_id).first()
        after_gem_cnt = user.gem_cnt

        data = {
            'id': user_voca_book.id,
            'createdAt': user_voca_book.created_at + datetime.timedelta(hours=9), 
            'book_cnt': user.book_cnt,
            'gem': {
                'before': before_gem_cnt,
                'after': after_gem_cnt
            },
            'goals': []
        }

        if reading_goal_complete:
            data['goals'].append({
                'name' : '독서왕',
                'type' : '독서왕',
                'level' : reading_goal_level,
                'badge_img' : reading_goal_badge_img,
                'completed_at' : reading_goal_complete.completed_at + datetime.timedelta(hours=9),
            })

        return jsonify({'code': 200, 'message': message, 'data': data}), 200
    
    except Exception as e:
        print("###error : ",e)
        db.session.rollback()
        return jsonify({'code': 400, 'message': f'단어장 생성 중 오류가 발생했습니다: {str(e)}'})


# 단어장 수정
@user_voca_book_bp.route('/update', methods=['PATCH'])
@jwt_required
def update_user_voca_book():
    data = request.get_json()
    print("###단어장 수정 data : ",data)
    user_voca_book_id = UUID(data.get('id'))
    print("###단어장 수정 user_voca_book_id : ",user_voca_book_id)
    if not user_voca_book_id:
        return jsonify({'code': 400, 'message': 'ID가 필요합니다.'}), 400

    user_voca_book = db.session.query(UserVocaBook).filter(UserVocaBook.id == user_voca_book_id).first()
    print("###단어장 수정 user_voca_book : ",user_voca_book)
    if not user_voca_book:
        return jsonify({'code': 404, 'message': '해당 단어장이 존재하지 않습니다.'}), 404

    # 넘어온 key만 업데이트
    if 'title' in data:
        user_voca_book.name = data['title']
    if 'color' in data:
        user_voca_book.color = json.dumps(data['color'])
    if 'words' in data:
        user_voca_book.voca_list = json.dumps(data['words'])
    if 'total' in data:
        user_voca_book.total_word_cnt = data['total']
    if 'memorized' in data and data['memorized'] is not None:
        user_voca_book.memorized_word_cnt = data['memorized']

    user_voca_book.updated_at = datetime.datetime.utcnow()
    db.session.commit()

    data = {
        'createdAt': user_voca_book.created_at + datetime.timedelta(hours=9), 
        'updatedAt': user_voca_book.updated_at + datetime.timedelta(hours=9) if user_voca_book.updated_at else None
    }

    return jsonify({'code': 200, 'data': data}), 200


@user_voca_book_bp.route('/delete', methods=['DELETE'])
@jwt_required
def delete_user_voca_book():
    data = request.get_json()
    user_voca_book_id = UUID(data['id'])

    user_voca_book = db.session.query(UserVocaBook).filter(UserVocaBook.id == user_voca_book_id).first()
    db.session.delete(user_voca_book)
    db.session.commit()

    return jsonify({'code': 200, 'data': {}}), 200


###############################
# 퀴즐렛 데이터 업로드 관련 함수
################################
# # 구분자 자동 감지 함수
def detect_delimiters(text):
    """
    퀴즐렛 텍스트에서 카드 구분자와 단어/뜻 구분자를 자동으로 감지합니다.
    
    로직:
    1. 카드 구분자: \n (줄바꿈) 또는 ; (쌍반점)
    2. 단어/뜻 구분자: \t (탭) 우선, 없으면 , (반점)
    
    Returns:
        tuple: (card_delimiter, term_delimiter)
    """
    # 카드 구분자 감지
    newline_count = text.count('\n')
    semicolon_count = text.count(';')
    
    card_delimiter = '\n' if newline_count >= semicolon_count else ';'
    
    # 단어/뜻 구분자 감지 (탭 우선)
    tab_count = text.count('\t')
    
    if tab_count > 0:
        term_delimiter = '\t'
    else:
        # 탭이 없으면 반점 사용
        term_delimiter = ','
    return card_delimiter, term_delimiter

# 퀴즐렛 데이터 파싱 함수
def parse_quizlet_data(text, card_delimiter, term_delimiter):
    """
    구분자를 사용하여 퀴즐렛 텍스트를 파싱합니다.
    
    Args:
        text: 파싱할 원본 텍스트
        card_delimiter: 카드 구분자
        term_delimiter: 단어/뜻 구분자
    
    Returns:
        list: [{"word": "단어", "meaning": "뜻"}, ...]
    """
    parsed_items = []
    failed_lines = []
    
    # 카드별로 분리
    cards = text.split(card_delimiter)
    
    for idx, card in enumerate(cards):
        # 빈 줄 무시
        card = card.strip()
        if not card:
            continue
        # 단어/뜻 분리 (첫 번째 구분자만 사용)
        if term_delimiter == ',':
            # 반점의 경우 첫 번째만 사용 (뜻에 반점이 포함될 수 있음)
            parts = card.split(',', 1)
        else:
            # 탭의 경우에도 첫 번째만 사용 (여러 탭이 있을 수 있음)
            parts = card.split(term_delimiter, 1)
        # 유효성 검사
        if len(parts) != 2:
            failed_lines.append(f"라인 {idx + 1}: '{card[:50]}...'")
            continue
        
        word = parts[0].strip()
        meaning = parts[1].strip()
        
        # 빈 값 체크
        if not word or not meaning:
            failed_lines.append(f"라인 {idx + 1}: 단어 또는 뜻이 비어있음")
            continue
        
        parsed_items.append({
            "word": word,
            "meaning": meaning
        })
    
    return parsed_items, failed_lines

# 파싱된 데이터를 프론트 형식으로 변환하는 함수
def convert_to_frontend_format(parsed_items):
    """
    퀴즐렛 파싱 데이터를 프론트엔드 형식으로 변환
    
    Args:
        parsed_items: [{"word": "단어", "meaning": "뜻"}, ...]
    
    Returns:
        프론트엔드 형식의 단어 리스트
    """
    
    formatted_items = []
    current_time = datetime.datetime.now(datetime.timezone.utc).isoformat() + 'Z'
    # print("###current_time : ",current_time)
    
    for item in parsed_items:
        # 고유 ID 생성 (프론트엔드 방식과 유사)
        timestamp = int(time.time() * 1000)
        random_str = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=9))
        unique_id = f"{timestamp}-{random_str}-{timestamp}"
        
        # 뜻을 배열로 변환 (반점으로 구분된 경우 분리)
        meanings = [m.strip() for m in item['meaning'].split(',')]
        
        formatted_item = {
            "id": unique_id,
            "ef": 2.5,  # SM-2 알고리즘 초기값
            "repetition": 0,
            "interval": 0,
            "nextReview": None,
            "lastStudyDate": None,
            "createdAt": current_time,
            "updatedAt": current_time,
            "dictionaryId": None,
            "origin": item['word'],
            "meanings": meanings,
            "examples": []
        }
        formatted_items.append(formatted_item)
    
    return formatted_items

### 외부 단어장 업로드 API
# 퀴즐렛 데이터 업로드
@user_voca_book_bp.route('/upload/quizlet', methods=['POST'])
@jwt_required
def upload_user_voca_book():
    data = request.get_json()
    title = data.get('title') # 단어장 이름
    voca_list = data.get('text') # 단어 데이터
    color = data.get('color', {'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'})  # 색상 (기본값)

    try:
        user_id = UUID(g.user_id)
    except Exception as e:
        print(f"###user_id 변환 실패: {e}")
        return jsonify({
            'code': 400, 
            'message': f'사용자 ID 변환 실패: {str(e)}'
        }), 400

    try:
        # 입력 데이터 검증
        if not voca_list or not voca_list.strip():
            return jsonify({
                'code': 400, 
                'message': '업로드할 단어 데이터가 비어있습니다.'
            }), 400

        # 제목 검증
        if not title:
            return jsonify({
                'code': 400,
                'message': '단어장 이름이 필요합니다.'
            }), 400
        
        # 구분자 자동 감지
        card_delimiter, term_delimiter = detect_delimiters(voca_list)
        
        # 데이터 파싱
        parsed_items, failed_lines = parse_quizlet_data(voca_list, card_delimiter, term_delimiter)
        
        # 파싱 결과 검증
        if not parsed_items:
            return jsonify({
                'code': 400,
                'message': '파싱된 단어가 없습니다. 데이터 형식을 확인해주세요.'
            }), 400

        # 프론트엔드 형식으로 변환
        frontend_format_items = convert_to_frontend_format(parsed_items)
        print("###frontend_format_items : ",frontend_format_items)

        ### 1. 단어장 생성 (create_user_voca_book 로직 재사용)
        user = db.session.query(User).filter(User.id == user_id).first()

        user_voca_book = UserVocaBook(
            user_id=user_id,
            bookstore_id=None,
            color=json.dumps(color),
            name=title,
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None
        )
        db.session.add(user_voca_book)

        # book_cnt 차감
        if user.book_cnt < 1:
            db.session.rollback()
            return jsonify({
                'code': 400, 
                'message': '최대 단어장 생성 개수를 초과했습니다.'
            }), 400
        user.book_cnt -= 1

        db.session.commit()
        book_id = user_voca_book.id # 생성된 단어장 ID

        # ### 2. 단어장 업데이트
        user_voca_book.voca_list = json.dumps(frontend_format_items)
        user_voca_book.total_word_cnt = len(frontend_format_items)
        user_voca_book.updated_at = datetime.datetime.utcnow()
        db.session.commit()

        # 성공 메시지
        message = f'{len(parsed_items)}개의 단어가 파싱되었습니다.'
        if failed_lines:
            message += f' ({len(failed_lines)}개 라인 파싱 실패)'
        
        # 결과 반환
        response_data = {
            "id": book_id,
            "title": title,
            "color": color,
            "total": len(frontend_format_items),
            "memorized": 0,
            "bookstore_id": None,
            "createdAt": user_voca_book.created_at + datetime.timedelta(hours=9),
            "updatedAt": user_voca_book.updated_at + datetime.timedelta(hours=9) if user_voca_book.updated_at else None,
            'words': frontend_format_items,
            'book_cnt': user.book_cnt,
            'goals': []
        }

        # print("###response_data : ",response_data)

        response = jsonify({
            'code': 200, 
            'message': message,
            'data': response_data
        })
        return response, 200
    
    except Exception as e:
        print("###error : ",e)
        db.session.rollback()
        return jsonify({'code': 400, 'message': f'단어장 업로드 중 오류가 발생했습니다: {str(e)}'})