import json
import logging
import re
import os
from flask import render_template, redirect, url_for, request, session, jsonify, g
from sqlalchemy import text, select, case, func, bindparam, or_
from sqlalchemy.orm import joinedload, contains_eager
from app.routes import search_bp
from app.models.models import db, VocaBook, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, Bookstore, UserVoca, VocaJa
from app.utils.jwt_utils import jwt_required, optional_user_id
from app.utils.dict_lang import get_dict_lang, dict_schema
from app.utils.word_payload import (
    load_ja_word_extras, load_ja_example_tokens, serialize_voca, serialize_example, apply_word_fields,
)
from app.utils.example_tagging import _get_spacy
from app.services.word_resolve import (
    clean_word_token as _clean_word_token,
    lookup_voca_exact as _lookup_voca_exact,
    word_info_suffix_candidates as _word_info_suffix_candidates,
    resolve_word_info as _resolve_word_info,
)
from flask_caching import Cache
import redis
from uuid import UUID
# NOTE: 아래 `cache = Cache()`는 어디서도 init_app 되지 않은 미사용 로컬 인스턴스라
# (Redis 미연결) 실제 캐싱에는 쓸 수 없다 — `app.__init__`의 전역 인스턴스를
# `app_cache`로 따로 가져와 word-info 캐싱에 사용한다.
from app import cache as app_cache

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

    # 해당 단어와 완전히 일치하는 id (오름차순 기준 최대 10개까지)
    id_rows = (db.session.query(Voca.id)
               .filter(Voca.word == word)  # 완전 일치 검색
               .order_by(Voca.word.asc())
               .limit(10)
               .all())
    voca_ids = [r[0] for r in id_rows]

    word_map = _build_word_objects(voca_ids)
    data = [word_map[vid] for vid in voca_ids if vid in word_map]

    return jsonify({'code': 200, 'data': data}), 200


def _like_prefix(q):
    """LIKE 접두 패턴 — 사용자 입력의 %, _ 는 리터럴로(escape='\\')."""
    return q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'


def _build_word_objects(voca_ids):
    """voca_id 목록 → {voca_id: 공통 단어 객체}. 뜻·예문·(ja)읽기/JLPT/후리가나를 일괄 조회.

    단어 객체: {word, pronunciation, meanings:[str], examples:[{id, origin, meaning, reading_tokens?}],
               vocaId, language, (ja) reading, romaji, jlpt}
    """
    if not voca_ids:
        return {}

    words = db.session.query(Voca).filter(Voca.id.in_(voca_ids)).all()

    meanings = (db.session.query(VocaMeaningMap.voca_id, VocaMeaning.meaning)
                .join(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)
                .filter(VocaMeaningMap.voca_id.in_(voca_ids))
                .all())

    examples = (db.session.query(VocaExampleMap.voca_id, VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko)
                .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
                .filter(VocaExampleMap.voca_id.in_(voca_ids))
                .all())

    extras = load_ja_word_extras(voca_ids)
    tokens_map = load_ja_example_tokens([e[1] for e in examples])

    word_map = {w.id: serialize_voca(w, extras=extras) for w in words}

    for voca_id, meaning in meanings:
        if voca_id in word_map and meaning not in word_map[voca_id]['meanings']:
            word_map[voca_id]['meanings'].append(meaning)

    for voca_id, example_id, exam_en, exam_ko in examples:
        if voca_id not in word_map:
            continue
        example_data = serialize_example(example_id, exam_en, exam_ko, tokens_map)
        if example_data not in word_map[voca_id]['examples']:
            word_map[voca_id]['examples'].append(example_data)

    return word_map

## 영어(단어) 부분 검색
@search_bp.route('/partial/en', methods=['GET'])
def search_word_en():

    partial_word = request.args.get('word')

    if not partial_word:
        return jsonify(['잘못된 요청'])

    if get_dict_lang() == 'ja':
        # 일본어 사전: 표기(voca.word) 또는 읽기(voca_ja.reading, 가나 입력) 접두 일치.
        # 정렬: 완전 일치 > JLPT 등급 있는 단어 > 짧은 표기 > 표기 순. 최소 길이 1.
        q = partial_word.strip()
        if not q:
            return jsonify({'code': 200, 'data': []}), 200
        pattern = _like_prefix(q)
        id_rows = (db.session.query(Voca.id)
                   .outerjoin(VocaJa, VocaJa.voca_id == Voca.id)
                   .filter(or_(Voca.word.like(pattern, escape='\\'),
                               VocaJa.reading.like(pattern, escape='\\')))
                   .order_by(
                       case((or_(Voca.word == q, VocaJa.reading == q), 0), else_=1),
                       case((VocaJa.jlpt.is_(None), 1), else_=0),
                       func.char_length(Voca.word).asc(),
                       Voca.word.asc(),
                   )
                   .limit(10)
                   .all())
    else:
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

    word_map = _build_word_objects(voca_ids)

    # voca_ids 순서(유사도순)대로 최종 데이터 구성
    data = [word_map[vid] for vid in voca_ids if vid in word_map]

    return jsonify({'code': 200, 'data': data}), 200


## 한글(뜻) 부분 검색
# 1. 초성만 검색('ㄱ')  2. 글자+초성 검색('구ㄱ')  3. 글자 검색('구급차')
@search_bp.route('/partial/ko', methods=['GET'])
def search_word_korean():
    partial_word = request.args.get('word')

    if not partial_word:
        return jsonify({'code': 400, 'message': '잘못된 요청입니다.'}), 400

    # 입력 검증 — 한글 음절/초성/공백만 허용(검색 의미상 충분). 정규식 메타문자 등은
    # REGEXP 패턴을 깨뜨려 DB 오류를 유발할 수 있으므로 사전 차단하고, 길이도 상한.
    if len(partial_word) > 20 or not all(
        is_hangul(c) or is_initial(c) or c.isspace() for c in partial_word
    ):
        return jsonify({'code': 400, 'message': '잘못된 요청입니다.'}), 400

    word_split = list(partial_word) # 한 글자씩 담기
    first_char = word_split[0]
    last_char = word_split[-1]

    if identify_character(first_char) == '초성':
        # 전체 초성인 경우 (초성이 아닌 글자가 섞이면 해당 글자는 그대로 escape — ValueError 방지)
        regex_pattern = '^' + ''.join(
            get_unicode_range_for_initial(w) if is_initial(w) else re.escape(w)
            for w in word_split
        )
    elif identify_character(first_char) == '한글' and identify_character(last_char) == '초성':
        # 마지막 글자만 초성일 경우
        regex_pattern = '^' + re.escape(''.join(partial_word[:-1])) + get_unicode_range_for_initial(last_char)
    elif identify_character(first_char) == '한글' and identify_character(last_char) == '한글':
        # 한글인 경우
        regex_pattern = re.escape(partial_word) + '.*'
    else:
        return jsonify({'code': 400, 'message': '잘못된 요청입니다.'}), 400
    
    # 1. 매치된 meaning들을 유사도 순으로 가져와서 voca_id 순서 추출 (중복 제거, 최대 10개 voca)
    # NOTE: 사전 schema prefix 명시(dict_schema() — 현재 언어 사전) — text()는 default bind(heyvoca_user)로 실행된다.
    S = dict_schema()
    match_query = text(f"""
        SELECT voca_meaning.meaning, voca_meaning_map.voca_id
        FROM {S}.voca_meaning
        JOIN {S}.voca_meaning_map ON voca_meaning.id = voca_meaning_map.meaning_id
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

    # 2~3. voca들의 전체 정보(모든 meanings + examples) 조회 + 단어별 그룹핑
    word_map = _build_word_objects(voca_ids)

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
    lang = get_dict_lang()
    partial_word = request.args.get('word')
    # 최소 길이: en 2자, ja 1자(한자 한 글자 단어가 흔하다)
    min_len = 1 if lang == 'ja' else 2
    if not partial_word or len(partial_word) < min_len:
        return jsonify({'code': 400, 'message': '잘못된 요청'}), 400

    # 사전 페이지에서 사용자가 선택한 단어 기준 — 완전 일치만 노출
    # (부분 일치 시 "tea"에 teamwork 등이 섞여 나옴). MySQL 기본 collation이
    # 대소문자 무시라 "tea" = "Tea" 로 매칭됨. ja 는 표기 또는 읽기 완전 일치.
    exact_word = partial_word

    # NOTE: 모든 사전 테이블에 현재 언어 사전 schema prefix — default bind는 heyvoca_user이라.
    S = dict_schema()
    if lang == 'ja':
        ja_cols = ", vj.reading, vj.romaji, vj.jlpt"
        ja_join = f"LEFT JOIN {S}.voca_ja vj ON vj.voca_id = v.id"
        where = "(v.word = :word OR vj.reading = :word)"
    else:
        ja_cols, ja_join, where = "", "", "v.word = :word"
    query = text(f"""
        SELECT
            bs.id AS bookstore_id,
            bs.name AS bookstore_name,
            bs.color,
            v.id AS voca_id,
            v.word,
            v.pronunciation,
            GROUP_CONCAT(DISTINCT vm.meaning ORDER BY vm.id SEPARATOR '|||') AS meanings
            {ja_cols}
        FROM {S}.bookstore bs
        JOIN {S}.admin_voca_book avb ON bs.admin_voca_book_id = avb.id
        JOIN {S}.admin_voca_book_map avbm ON avb.id = avbm.book_id
        JOIN {S}.voca v ON avbm.voca_id = v.id
        {ja_join}
        LEFT JOIN {S}.voca_meaning_map vmm ON v.id = vmm.voca_id
        LEFT JOIN {S}.voca_meaning vm ON vmm.meaning_id = vm.id
        WHERE {where}
          AND bs.hide = 0
        GROUP BY bs.id, v.id
        LIMIT 10
    """)
    results = db.session.execute(query, {'word': exact_word}).fetchall()

    data = []
    for row in results:
        meanings = row.meanings.split('|||') if row.meanings else []
        item = {
            'bookstore_id': row.bookstore_id,
            'bookstore_name': row.bookstore_name,
            'color': row.color,
            'word': row.word,
            'pronunciation': row.pronunciation,
            'meanings': meanings,
            'vocaId': row.voca_id,
        }
        extras = ({row.voca_id: {'reading': row.reading, 'romaji': row.romaji, 'jlpt': row.jlpt}}
                  if lang == 'ja' else None)
        data.append(apply_word_fields(item, row.voca_id, extras, lang))

    return jsonify({'code': 200, 'data': data}), 200


## 서점 데이터 API
# bookstore, admin_voca_book, admin_voca_book_map 테이블의 데이터를 가져옴
@search_bp.route('/bookstore', methods=['GET'])
def search_bookstore_all():
    # 선택적 인증 — 게스트 온보딩도 이 API를 부른다. 토큰이 없거나 무효해도 401을 내지
    # 않고 그냥 게스트로 취급한다(notOwnedCount만 null로 내려간다).
    user_id = optional_user_id()
    # 현재 언어 서점 — 인증이면 user.learning_lang, 게스트면 ?lang= (before_request 가 확정)
    lang = get_dict_lang()
    S = dict_schema()

    # MySQL용 쿼리 (단어 목록 제외)
    # NOTE: 사전 schema prefix 필수 (default bind = heyvoca_user)
    # 카테고리는 bookstore_category.sort_order 기준 정렬 (없으면 999)
    # admin_voca_book_id 는 화면에는 안 나가지만 notOwnedCount 계산에 필요해 추가했다.
    query = text(f"""
        SELECT
            bs.id AS bookstore_id,
            bs.name AS bookstore_name,
            bs.downloads,
            bs.category,
            bs.color,
            bs.hide,
            bs.gem,
            bs.admin_voca_book_id,
            COALESCE(avb.word_count, 0) AS word_count,
            COALESCE(bc.sort_order, 999) AS category_sort_order
        FROM {S}.bookstore bs
        JOIN {S}.admin_voca_book avb ON bs.admin_voca_book_id = avb.id
        LEFT JOIN {S}.bookstore_category bc ON bc.category = bs.category
        GROUP BY bs.id, bc.sort_order
        ORDER BY category_sort_order ASC, bs.id ASC
    """)

    # 데이터 조회
    rows = db.session.execute(query).fetchall()

    # 로그인 사용자만 서점별 "미보유 단어 수"를 계산한다. 서점 수만큼 쿼리를 돌리면
    # (N+1) 서점이 늘어날 때마다 이 API가 느려지므로, 사용자 보유 voca_id 집합 1쿼리 +
    # 사전 DB의 book→voca 매핑 1쿼리(IN절)로 끝내고 차집합은 파이썬에서 계산한다.
    # cross-schema(heyvoca_user ↔ heyvoca_dict) JOIN/FK는 규칙상 금지돼 있어 이 방식이 맞다.
    # voca.id 는 언어별 사전마다 따로 매겨지므로 보유 집합은 현재 언어(dict_lang) 단어로 한정한다.
    not_owned_map = {}
    if user_id:
        book_ids = [row.admin_voca_book_id for row in rows]
        if book_ids:
            owned_rows = (
                db.session.query(UserVoca.voca_id)
                .filter(UserVoca.user_id == UUID(user_id),
                        UserVoca.dict_lang == lang,
                        UserVoca.voca_id.isnot(None))
                .all()
            )
            owned_ids = {r[0] for r in owned_rows}

            map_query = text(f"""
                SELECT book_id, voca_id
                FROM {S}.admin_voca_book_map
                WHERE book_id IN :book_ids
            """).bindparams(bindparam('book_ids', expanding=True))
            map_rows = db.session.execute(map_query, {'book_ids': book_ids}).fetchall()

            book_voca_map = {}
            for book_id, voca_id in map_rows:
                book_voca_map.setdefault(book_id, set()).add(voca_id)

            for book_id, voca_ids in book_voca_map.items():
                not_owned_map[book_id] = len(voca_ids - owned_ids)

    # 결과 가공
    final_results = []
    for row in rows:
        # color 처리
        color_data = row.color
        if isinstance(color_data, str):
            color_data = json.loads(color_data)

        not_owned_count = not_owned_map.get(row.admin_voca_book_id, 0) if user_id else None

        final_results.append({
            "id": row.bookstore_id,
            "name": row.bookstore_name,
            "downloads": row.downloads,
            "category": row.category,
            "color": color_data,
            "hide": row.hide,
            "gem": row.gem,
            "vocaCount": row.word_count,
            "notOwnedCount": not_owned_count,
            "language": lang,
        })

    return jsonify({'code': 200, 'data': final_results}), 200


## 서점 단어장 상세 데이터 API
@search_bp.route('/bookstore/<int:bookstoreId>', methods=['GET'])
def get_bookstore_detail(bookstoreId):
    lang = get_dict_lang()
    # 서점 및 연결된 단어장 정보 조회
    bookstore = db.session.query(Bookstore).filter_by(id=bookstoreId).first()
    
    if not bookstore:
        return jsonify({'code': 404, 'message': '해당하는 서점이 없습니다.'}), 404

    # 단어 목록 조회 — 사전 schema prefix 필수 (default bind = heyvoca_user)
    # ja 예문(voca_examples JSON)에는 reading_tokens 가 이미 들어 있다(60_make_jlpt_books.py).
    S = dict_schema()
    if lang == 'ja':
        ja_cols = ", vj.reading, vj.romaji, vj.jlpt"
        ja_join = f"LEFT JOIN {S}.voca_ja vj ON vj.voca_id = v.id"
    else:
        ja_cols, ja_join = "", ""
    query = text(f"""
        SELECT
            v.id,
            v.word AS origin,
            v.pronunciation,
            CAST(avbm.voca_meanings AS JSON) AS meanings,
            CAST(avbm.voca_examples AS JSON) AS examples
            {ja_cols}
        FROM {S}.admin_voca_book_map avbm
        JOIN {S}.voca v ON avbm.voca_id = v.id
        {ja_join}
        WHERE avbm.book_id = :admin_voca_book_id
    """)

    rows = db.session.execute(query, {'admin_voca_book_id': bookstore.admin_voca_book_id}).fetchall()

    # 결과 가공
    vocas = []
    for row in rows:
        item = {
            "id": row.id,
            "vocaId": row.id,
            "origin": row.origin,
            "pronunciation": row.pronunciation,
            "meanings": json.loads(row.meanings) if row.meanings else [],
            "examples": json.loads(row.examples) if row.examples else []
        }
        extras = ({row.id: {'reading': row.reading, 'romaji': row.romaji, 'jlpt': row.jlpt}}
                  if lang == 'ja' else None)
        vocas.append(apply_word_fields(item, row.id, extras, lang))

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
            "language": lang,
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


####################
# 예문 단어 탭 팝업 #
####################

# 학습 화면에서 영어 예문 속 단어를 탭했을 때 뜨는 사전 요약 팝업.
# 입력은 활용형/구두점 포함 가능("kept", "desks,", "Empire.") — 정제 후
# 정확 일치 → spaCy lemma → 접미사 fallback 순으로 사전(Voca)에서 찾는다.

_WORD_INFO_CACHE_TTL = 60 * 60 * 24  # 1일
_WORD_INFO_MAX_MEANINGS = 4


def _voca_meanings(voca_id, limit=_WORD_INFO_MAX_MEANINGS):
    """voca_id의 뜻 목록(저장 순서, 최대 limit개)."""
    rows = (
        db.session.query(VocaMeaning.meaning)
        .join(VocaMeaningMap, VocaMeaningMap.meaning_id == VocaMeaning.id)
        .filter(VocaMeaningMap.voca_id == voca_id)
        .order_by(VocaMeaningMap.meaning_id.asc())
        .limit(limit)
        .all()
    )
    return [r[0] for r in rows]


## 예문 단어 탭 → 사전 요약 팝업
@search_bp.route('/word-info', methods=['GET'])
@jwt_required
def word_info():
    raw_word = request.args.get('word', '')
    cleaned = _clean_word_token(raw_word)
    if not cleaned:
        return jsonify({'code': 200, 'data': None}), 200

    # 캐시 키에 언어 포함 — en 은 기존 키 형식 유지(배포 직후 캐시 무효화 방지), ja 는 대소문자 보존.
    lang = get_dict_lang()
    if lang == 'en':
        cache_key = f'search:wordinfo:{cleaned.lower()}'
    else:
        cache_key = f'search:wordinfo:{lang}:{cleaned}'
    cached = app_cache.get(cache_key)
    if cached:
        return jsonify({'code': 200, 'data': cached}), 200

    # ja 는 word_resolve 가 영어 lemma/접미사 규칙 대신 표기/읽기 정확 일치로 찾는다.
    voca = _resolve_word_info(raw_word)
    if not voca:
        return jsonify({'code': 200, 'data': None}), 200

    data = {
        'query': raw_word,
        'word': voca.word,
        'pronunciation': voca.pronunciation,
        'meanings': _voca_meanings(voca.id),
        'voca_id': voca.id,
        'vocaId': voca.id,
    }
    extras = load_ja_word_extras([voca.id], lang) if lang == 'ja' else None
    apply_word_fields(data, voca.id, extras, lang)
    app_cache.set(cache_key, data, timeout=_WORD_INFO_CACHE_TTL)

    return jsonify({'code': 200, 'data': data}), 200
