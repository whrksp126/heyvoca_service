import json
import re
import tempfile
import pdfplumber
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


# ===== 퀴즐렛 PDF 업로드 =====

# 퀴즐렛 PDF 노이즈 판별
def is_quizlet_noise(text):
    """퀴즐렛 PDF에서 단어-뜻이 아닌 노이즈 텍스트를 판별"""
    if not text or not text.strip():
        return True
    text = text.strip()
    noise_patterns = [
        r'^\d+\s*/\s*\d+$',                # 페이지 번호 (1 / 7)
        r'^https?://',                       # URL
        r'^Dtpø',                            # 퀴즐렛 헤더 깨진 문자
        r'^quizlet\.com',                    # 퀴즐렛 URL
        r'이 세트의',                         # 퀴즐렛 UI
        r'학습하기',                           # 퀴즐렛 UI
        r'정답을 고르세요',                    # 퀴즐렛 UI
        r'모르시겠어요',                       # 퀴즐렛 UI
        r'미리보기',                           # 퀴즐렛 UI
        r'^저장됨$',                           # 퀴즐렛 UI
        r'^저장$',                             # 퀴즐렛 UI
        r'^그룹$',                             # 퀴즐렛 UI
        r'학생들은 다음',                      # 퀴즐렛 UI
        r'^\d+\s*단어$',                      # "50 단어"
        r'학습하기 모드로',                    # 퀴즐렛 UI
        r'연습 문제',                          # 퀴즐렛 UI
        r'^테스트$',                           # 퀴즐렛 UI
    ]
    return any(re.search(p, text) for p in noise_patterns)


def parse_quizlet_pdf(file_storage):
    """
    퀴즐렛 PDF를 파싱하여 단어-뜻 쌍을 추출합니다.

    지원 레이아웃:
    1. 표(grid): 번호 + 단어 + 뜻 (3컬럼 테이블)
    2. 작게/중간/크게/내단어장: 단어 + 뜻 (2컬럼 테이블)
    3. 용어(word): "번호. 단어: 뜻" 텍스트

    Returns:
        tuple: (parsed_items, failed_lines)
    """
    parsed_items = []
    failed_lines = []

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=True) as tmp:
        file_storage.save(tmp)
        tmp.flush()
        # print(f"[PDF DEBUG] 임시 파일 저장 완료: {tmp.name}")

        with pdfplumber.open(tmp.name) as pdf:
            # print(f"[PDF DEBUG] 총 페이지 수: {len(pdf.pages)}")

            word_section_started = False  # '이 세트의 단어' 마커 이후만 파싱

            for page_idx, page in enumerate(pdf.pages):
                # print(f"\n[PDF DEBUG] ===== 페이지 {page_idx + 1} =====")

                # 1차: 테이블 감지
                tables = page.extract_tables()
                # print(f"[PDF DEBUG] 테이블 감지 수: {len(tables) if tables else 0}")

                if tables:
                    for t_idx, table in enumerate(tables):
                        # print(f"[PDF DEBUG]   테이블[{t_idx}] 행 수: {len(table)}")
                        for r_idx, row in enumerate(table):
                            if not row:
                                # print(f"[PDF DEBUG]     행[{r_idx}]: None (스킵)")
                                continue

                            # 원본 행 출력
                            # print(f"[PDF DEBUG]     행[{r_idx}] 원본: {row}")

                            # 셀 정리: None/빈값 제거
                            cells = [cell.strip() if cell else '' for cell in row]
                            cells = [cell for cell in cells if cell]
                            # print(f"[PDF DEBUG]     행[{r_idx}] 정리후({len(cells)}셀): {cells}")

                            if len(cells) == 3:
                                num, word, meaning = cells
                                is_num = re.match(r'^\d+\.?$', num.strip())
                                # print(f"[PDF DEBUG]     3컬럼 - 번호:'{num}' (is_num={bool(is_num)}), 단어:'{word}', 뜻:'{meaning}'")
                                if is_num:
                                    noise_w = is_quizlet_noise(word)
                                    noise_m = is_quizlet_noise(meaning)
                                    # print(f"[PDF DEBUG]     노이즈체크 - word={noise_w}, meaning={noise_m}")
                                    if not noise_w and not noise_m:
                                        parsed_items.append({"word": word.strip(), "meaning": meaning.strip()})
                                        # print(f"[PDF DEBUG]     -> 추가됨!")
                                else:
                                    word_candidate = cells[0]
                                    meaning_candidate = cells[1]
                                    noise_w = is_quizlet_noise(word_candidate)
                                    noise_m = is_quizlet_noise(meaning_candidate)
                                    # print(f"[PDF DEBUG]     번호아님 -> word:'{word_candidate}', meaning:'{meaning_candidate}', 노이즈:{noise_w},{noise_m}")
                                    if not noise_w and not noise_m:
                                        parsed_items.append({"word": word_candidate.strip(), "meaning": meaning_candidate.strip()})
                                        # print(f"[PDF DEBUG]     -> 추가됨!")
                            elif len(cells) == 2:
                                word, meaning = cells
                                noise_w = is_quizlet_noise(word)
                                noise_m = is_quizlet_noise(meaning)
                                # print(f"[PDF DEBUG]     2컬럼 - 단어:'{word}', 뜻:'{meaning}', 노이즈:{noise_w},{noise_m}")
                                if not noise_w and not noise_m:
                                    parsed_items.append({"word": word.strip(), "meaning": meaning.strip()})
                                    # print(f"[PDF DEBUG]     -> 추가됨!")
                            elif len(cells) == 1:
                                # 셀 내 여러 줄 단위로 재처리
                                cell_lines = cells[0].split('\n')
                                for cell_line in cell_lines:
                                    cell_line = cell_line.strip()
                                    if not cell_line:
                                        continue
                                    # '이 세트의 단어 (n)' 마커 감지 → 이후부터 파싱 시작
                                    if re.search(r'이 세트의 단어', cell_line):
                                        word_section_started = True
                                        # print(f"[PDF DEBUG]     1컬럼 단어섹션 시작 감지: '{cell_line[:60]}'")
                                        continue
                                    if not word_section_started:
                                        # print(f"[PDF DEBUG]     1컬럼 섹션前 스킵: '{cell_line[:60]}'")
                                        continue
                                    if is_quizlet_noise(cell_line):
                                        continue
                                    # "단어 뜻(비ASCII 시작)" 패턴으로 분리
                                    m = re.match(r'^(.+?)\s+([^\x00-\x7F].+)$', cell_line)
                                    if m:
                                        word = m.group(1).strip()
                                        meaning = m.group(2).strip()
                                        if word and meaning and not is_quizlet_noise(word) and not is_quizlet_noise(meaning):
                                            parsed_items.append({"word": word, "meaning": meaning})
                                            # print(f"[PDF DEBUG]     1컬럼 파싱 -> word:'{word}', meaning:'{meaning}'")
                                    # else:
                                        # print(f"[PDF DEBUG]     1컬럼 매칭실패: '{cell_line[:60]}'")
                                # 마커가 한 번이라도 발견된 페이지 이후부터는 플래그 유지
                                continue
                            # else:
                                # print(f"[PDF DEBUG]     {len(cells)}컬럼 - 예상외 (스킵): {cells}")
                    continue  # 테이블 있으면 텍스트 모드 스킵

                # 2차: 좌표 기반 단어 추출 (x좌표로 좌/우 컬럼 분리)
                words_on_page = page.extract_words(keep_blank_chars=True, x_tolerance=3, y_tolerance=3)
                if words_on_page:
                    page_width = page.width
                    mid_x = page_width / 2
                    # print(f"[PDF DEBUG] 좌표모드 - 단어 수: {len(words_on_page)}, 페이지 폭: {page_width}, mid_x: {mid_x}")

                    # y좌표로 같은 행 그룹핑 (tolerance 5px)
                    rows_by_y = {}
                    for w in words_on_page:
                        y_key = round(w['top'] / 5) * 5
                        if y_key not in rows_by_y:
                            rows_by_y[y_key] = []
                        rows_by_y[y_key].append(w)

                    coord_parsed = 0
                    for y_key in sorted(rows_by_y.keys()):
                        row_words = rows_by_y[y_key]
                        left_parts = []
                        right_parts = []
                        for w in sorted(row_words, key=lambda x: x['x0']):
                            if w['x0'] < mid_x:
                                left_parts.append(w['text'])
                            else:
                                right_parts.append(w['text'])

                        left_text = ' '.join(left_parts).strip()
                        right_text = ' '.join(right_parts).strip()

                        if not left_text or not right_text:
                            continue

                        # 번호 제거 (예: "1." "12.")
                        word_clean = re.sub(r'^\d+\.\s*', '', left_text).strip()

                        if not word_clean or is_quizlet_noise(word_clean) or is_quizlet_noise(right_text):
                            continue

                        parsed_items.append({"word": word_clean, "meaning": right_text})
                        coord_parsed += 1

                    # print(f"[PDF DEBUG] 좌표모드 결과: {coord_parsed}개 파싱")
                    if coord_parsed > 0:
                        continue  # 좌표모드로 파싱 성공 시 텍스트 모드 스킵

                # 3차: 텍스트 모드 (용어 레이아웃 등)
                text = page.extract_text()
                if not text:
                    # print(f"[PDF DEBUG] 텍스트 없음 (스킵)")
                    continue

                lines = text.split('\n')
                # print(f"[PDF DEBUG] 텍스트 모드 - 총 {len(lines)}줄")
                for line_idx, line in enumerate(lines):
                    line = line.strip()
                    if not line:
                        continue
                    if is_quizlet_noise(line):
                        # print(f"[PDF DEBUG]   줄[{line_idx}] 노이즈: '{line[:60]}'")
                        continue

                    # 패턴 1: "번호. 단어: 뜻" (용어 레이아웃)
                    match = re.match(r'^\d+\.\s*(.+?):\s*(.+)$', line)
                    if match:
                        word = match.group(1).strip()
                        meaning = match.group(2).strip()
                        # print(f"[PDF DEBUG]   줄[{line_idx}] 패턴1(번호.단어:뜻) -> word:'{word}', meaning:'{meaning}'")
                        if word and meaning:
                            parsed_items.append({"word": word, "meaning": meaning})
                        continue

                    # 패턴 2: "번호. 단어    뜻" (표 레이아웃이 텍스트로 추출된 경우)
                    match = re.match(r'^\d+\.\s*(.+?)\s{2,}(.+)$', line)
                    if match:
                        word = match.group(1).strip()
                        meaning = match.group(2).strip()
                        # print(f"[PDF DEBUG]   줄[{line_idx}] 패턴2(번호.단어  뜻) -> word:'{word}', meaning:'{meaning}'")
                        if word and meaning:
                            parsed_items.append({"word": word, "meaning": meaning})
                        continue

                    # 패턴 4: "번호. 단어 뜻" (단일 공백, 뜻이 비ASCII로 시작 — 예: 터키어/한국어)
                    match = re.match(r'^\d+\.\s*(.+?)\s+([^\x00-\x7F].+)$', line)
                    if match:
                        word = match.group(1).strip()
                        meaning = match.group(2).strip()
                        # print(f"[PDF DEBUG]   줄[{line_idx}] 패턴4(번호.단어 비ASCII뜻) -> word:'{word}', meaning:'{meaning}'")
                        if word and meaning:
                            parsed_items.append({"word": word, "meaning": meaning})
                        continue

                    # 패턴 3: "단어    뜻" (공백 2개 이상으로 구분)
                    match = re.match(r'^(.+?)\s{2,}(.+)$', line)
                    if match:
                        word = match.group(1).strip()
                        meaning = match.group(2).strip()
                        noise_w = is_quizlet_noise(word)
                        noise_m = is_quizlet_noise(meaning)
                        # print(f"[PDF DEBUG]   줄[{line_idx}] 패턴3(단어  뜻) -> word:'{word}', meaning:'{meaning}', 노이즈:{noise_w},{noise_m}")
                        if word and meaning and not noise_w and not noise_m:
                            parsed_items.append({"word": word, "meaning": meaning})
                        continue

                    # 매칭 안되면 실패 라인으로 기록
                    # print(f"[PDF DEBUG]   줄[{line_idx}] 매칭실패: '{line[:80]}'")
                    failed_lines.append(f"페이지 {page_idx + 1}: '{line[:50]}'")

    # print(f"\n[PDF DEBUG] ===== 파싱 완료 =====")
    # print(f"[PDF DEBUG] 파싱 성공: {len(parsed_items)}개")
    # print(f"[PDF DEBUG] 파싱 실패: {len(failed_lines)}개")
    # if parsed_items[:3]:
    #     print(f"[PDF DEBUG] 처음 3개: {parsed_items[:3]}")
    # if failed_lines[:5]:
    #     print(f"[PDF DEBUG] 실패 라인 (처음 5개): {failed_lines[:5]}")

    return parsed_items, failed_lines