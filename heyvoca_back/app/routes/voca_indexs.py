import json
import datetime
from flask import request, jsonify, g
from uuid import UUID

from app.routes import voca_indexs_bp
from app.models.models import db, UserVoca, UserVocaBookMap, UserVocaBook
from app.utils.jwt_utils import jwt_required
from app.services.fsrs.state import (
    parse_user_voca_data, get_fsrs_state, is_v1, migrate_v1_to_v2, DEFAULT_FSRS_NEW,
)


def _is_purchased_book_id(user_id, voca_book_id):
    """주어진 단어장 ID가 구매한 단어장(bookstore_id가 NULL이 아님)인지 확인."""
    if voca_book_id is None:
        return False
    book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == UUID(str(voca_book_id)),
        UserVocaBook.user_id == user_id
    ).first()
    return book is not None and book.bookstore_id is not None


def merge_meanings(existing_json, new_list):
    """기존 meanings JSON과 새 meanings 리스트를 합산 (중복 제거)"""
    existing = json.loads(existing_json) if existing_json else []
    merged = list(existing)
    for item in new_list:
        if item not in merged:
            merged.append(item)
    return json.dumps(merged, ensure_ascii=False)


def merge_examples(existing_json, new_list):
    """기존 examples JSON과 새 examples 리스트를 합산 (중복 제거)"""
    existing = json.loads(existing_json) if existing_json else []
    merged = list(existing)
    existing_set = {(e.get('origin', ''), e.get('meaning', '')) for e in existing}
    for item in new_list:
        key = (item.get('origin', ''), item.get('meaning', ''))
        if key not in existing_set:
            merged.append(item)
            existing_set.add(key)
    return json.dumps(merged, ensure_ascii=False)


def build_voca_index_response(user_voca):
    """UserVoca 객체를 API 응답 형식으로 변환"""
    payload = parse_user_voca_data(user_voca.data)
    if is_v1(payload):
        payload = migrate_v1_to_v2(payload)
    fsrs = get_fsrs_state(payload) or dict(DEFAULT_FSRS_NEW)

    # 해당 단어의 모든 단어장 매핑 조회
    maps = db.session.query(UserVocaBookMap).filter(
        UserVocaBookMap.user_voca_id == user_voca.id
    ).all()

    voca_books = []
    for m in maps:
        meanings = json.loads(m.voca_meanings) if m.voca_meanings else []
        examples = json.loads(m.voca_examples) if m.voca_examples else []
        voca_books.append({
            'vocaBookId': str(m.user_voca_book_id),
            'meanings': meanings,
            'examples': examples,
        })

    return {
        'origin': user_voca.word,
        'vocaIndexId': user_voca.id,
        'fsrs': fsrs,
        'vocaBooks': voca_books,
        'createdAt': (user_voca.created_at).isoformat() + 'Z' if user_voca.created_at else None,
        'updatedAt': (user_voca.updated_at).isoformat() + 'Z' if user_voca.updated_at else None,
    }


# 사용자 사전 전체 조회
@voca_indexs_bp.route('', methods=['GET'])
@jwt_required
def get_voca_indexs():
    from sqlalchemy.orm import joinedload
    user_id = UUID(g.user_id)

    # N+1 문제 해결을 위해 book_maps와 연관된 user_voca_book을 함께 로드
    user_vocas = db.session.query(UserVoca).options(
        joinedload(UserVoca.book_maps).joinedload(UserVocaBookMap.user_voca_book)
    ).filter(
        UserVoca.user_id == user_id
    ).all()

    data = []
    for uv in user_vocas:
        payload = parse_user_voca_data(uv.data)
        if is_v1(payload):
            payload = migrate_v1_to_v2(payload)
        fsrs = get_fsrs_state(payload) or dict(DEFAULT_FSRS_NEW)

        voca_books = []
        for m in uv.book_maps:
            meanings = json.loads(m.voca_meanings) if m.voca_meanings else []
            examples = json.loads(m.voca_examples) if m.voca_examples else []

            voca_books.append({
                'vocaBookId': str(m.user_voca_book_id),
                'meanings': meanings,
                'examples': examples,
            })

        data.append({
            'origin': uv.word,
            'vocaIndexId': uv.id,
            'fsrs': fsrs,
            'vocaBooks': voca_books,
            'createdAt': (uv.created_at).isoformat() + 'Z' if uv.created_at else None,
            'updatedAt': (uv.updated_at).isoformat() + 'Z' if uv.updated_at else None,
        })

    return jsonify({'code': 200, 'data': data}), 200


# 사용자 사전 단어 생성
@voca_indexs_bp.route('', methods=['POST'])
@jwt_required
def create_voca_index():
    user_id = UUID(g.user_id)
    req = request.get_json()

    origin = req.get('origin')
    voca_book_id = req.get('vocaBookId')
    meanings = req.get('meanings', [])
    examples = req.get('examples', [])

    if not origin:
        return jsonify({'code': 400, 'message': '단어(origin)는 필수입니다.'}), 400
    if not voca_book_id:
        return jsonify({'code': 400, 'message': '단어장 ID(vocaBookId)는 필수입니다.'}), 400

    try:
        # 단어장 존재 확인
        voca_book = db.session.query(UserVocaBook).filter(
            UserVocaBook.id == UUID(str(voca_book_id)),
            UserVocaBook.user_id == user_id
        ).first()
        if not voca_book:
            return jsonify({'code': 404, 'message': '해당 단어장을 찾을 수 없습니다.'}), 404

        if voca_book.bookstore_id is not None:
            return jsonify({'code': 403, 'message': '구매한 단어장에는 단어를 추가할 수 없어요.'}), 403

        # 같은 단어가 UserVoca에 이미 있는지 확인
        user_voca = db.session.query(UserVoca).filter(
            UserVoca.user_id == user_id,
            UserVoca.word == origin
        ).first()

        if user_voca:
            # 기존 단어에 meanings/examples 누적 merge
            user_voca.voca_meanings = merge_meanings(user_voca.voca_meanings, meanings)
            user_voca.voca_examples = merge_examples(user_voca.voca_examples, examples)
            user_voca.updated_at = datetime.datetime.utcnow()
        else:
            # 새 UserVoca 생성 (data=None: 첫 학습 시 /study/log 가 v3 payload로 초기화)
            user_voca = UserVoca()
            user_voca.user_id = user_id
            user_voca.word = origin
            user_voca.voca_meanings = json.dumps(meanings, ensure_ascii=False)
            user_voca.voca_examples = json.dumps(examples, ensure_ascii=False)
            user_voca.data = None
            db.session.add(user_voca)
            db.session.flush()  # ID 할당

        # UserVocaBookMap 생성
        book_map = UserVocaBookMap()
        book_map.user_voca_book_id = UUID(str(voca_book_id))
        book_map.user_voca_id = user_voca.id
        book_map.voca_meanings = json.dumps(meanings, ensure_ascii=False)
        book_map.voca_examples = json.dumps(examples, ensure_ascii=False)
        db.session.add(book_map)

        db.session.commit()

        return jsonify({'code': 201, 'data': build_voca_index_response(user_voca)}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어 생성 중 오류가 발생했습니다: {str(e)}'}), 500


# 사용자 사전 단어 메타 갱신 (학습 상태는 /study/log 만이 손댐)
@voca_indexs_bp.route('/<int:vocaIndexId>', methods=['PATCH'])
@jwt_required
def update_voca_index(vocaIndexId):
    user_id = UUID(g.user_id)

    user_voca = db.session.query(UserVoca).filter(
        UserVoca.id == vocaIndexId,
        UserVoca.user_id == user_id
    ).first()

    if not user_voca:
        return jsonify({'code': 404, 'message': '해당 단어를 찾을 수 없습니다.'}), 404

    try:
        user_voca.updated_at = datetime.datetime.utcnow()
        db.session.commit()

        return jsonify({'code': 200, 'data': build_voca_index_response(user_voca)}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어 수정 중 오류가 발생했습니다: {str(e)}'}), 500


# 사용자 단어장 단어 수정 (meanings/examples)
@voca_indexs_bp.route('/<int:vocaIndexId>/vocaBooks/<vocaBookId>', methods=['PUT'])
@jwt_required
def update_voca_index_book(vocaIndexId, vocaBookId):
    user_id = UUID(g.user_id)
    req = request.get_json()

    user_voca = db.session.query(UserVoca).filter(
        UserVoca.id == vocaIndexId,
        UserVoca.user_id == user_id
    ).first()

    if not user_voca:
        return jsonify({'code': 404, 'message': '해당 단어를 찾을 수 없습니다.'}), 404

    book_map = db.session.query(UserVocaBookMap).filter(
        UserVocaBookMap.user_voca_id == vocaIndexId,
        UserVocaBookMap.user_voca_book_id == UUID(str(vocaBookId))
    ).first()

    if not book_map:
        return jsonify({'code': 404, 'message': '해당 단어장 매핑을 찾을 수 없습니다.'}), 404

    if _is_purchased_book_id(user_id, vocaBookId):
        return jsonify({'code': 403, 'message': '구매한 단어장의 단어는 수정할 수 없어요.'}), 403

    try:
        meanings = req.get('meanings')
        examples = req.get('examples')

        if meanings is not None:
            book_map.voca_meanings = json.dumps(meanings, ensure_ascii=False)
            # UserVoca에도 누적 반영
            user_voca.voca_meanings = merge_meanings(user_voca.voca_meanings, meanings)

        if examples is not None:
            book_map.voca_examples = json.dumps(examples, ensure_ascii=False)
            user_voca.voca_examples = merge_examples(user_voca.voca_examples, examples)

        db.session.commit()

        # 응답: 해당 매핑 데이터
        response_meanings = json.loads(book_map.voca_meanings) if book_map.voca_meanings else []
        response_examples = json.loads(book_map.voca_examples) if book_map.voca_examples else []

        data = {
            'vocaIndexId': vocaIndexId,
            'vocaBookId': str(book_map.user_voca_book_id),
            'meanings': response_meanings,
            'examples': response_examples,
            'createdAt': (book_map.user_voca_book.created_at + datetime.timedelta(hours=9)).strftime('%Y-%m-%d') if book_map.user_voca_book and book_map.user_voca_book.created_at else None,
        }

        return jsonify({'code': 200, 'data': data}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어 수정 중 오류가 발생했습니다: {str(e)}'}), 500


# 사용자 사전 단어 전체 삭제
@voca_indexs_bp.route('/<int:vocaIndexId>', methods=['DELETE'])
@jwt_required
def delete_voca_index(vocaIndexId):
    user_id = UUID(g.user_id)

    user_voca = db.session.query(UserVoca).filter(
        UserVoca.id == vocaIndexId,
        UserVoca.user_id == user_id
    ).first()

    if not user_voca:
        return jsonify({'code': 404, 'message': '해당 단어를 찾을 수 없습니다.'}), 404

    # 이 단어가 구매한 단어장에 속해 있다면 전체 삭제 차단
    purchased_map_exists = db.session.query(UserVocaBookMap).join(
        UserVocaBook, UserVocaBook.id == UserVocaBookMap.user_voca_book_id
    ).filter(
        UserVocaBookMap.user_voca_id == vocaIndexId,
        UserVocaBook.bookstore_id.isnot(None)
    ).first()

    if purchased_map_exists:
        return jsonify({'code': 403, 'message': '구매한 단어장의 단어는 삭제할 수 없어요.'}), 403

    try:
        # 관련 UserVocaBookMap 모두 삭제
        db.session.query(UserVocaBookMap).filter(
            UserVocaBookMap.user_voca_id == vocaIndexId
        ).delete()

        # UserVoca 삭제
        db.session.delete(user_voca)
        db.session.commit()

        return jsonify({'code': 204, 'message': '단어 전체 삭제 성공'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어 삭제 중 오류가 발생했습니다: {str(e)}'}), 500


# 사용자 단어장 단어 연결 (이미 존재하는 단어를 단어장에 추가)
@voca_indexs_bp.route('/<int:vocaIndexId>/vocaBooks/<vocaBookId>', methods=['POST'])
@jwt_required
def link_voca_index_book(vocaIndexId, vocaBookId):
    user_id = UUID(g.user_id)
    req = request.get_json()

    # 단어 존재 및 소유권 확인
    user_voca = db.session.query(UserVoca).filter(
        UserVoca.id == vocaIndexId,
        UserVoca.user_id == user_id
    ).first()

    if not user_voca:
        return jsonify({'code': 404, 'message': '해당 단어를 찾을 수 없습니다.'}), 404

    # 단어장 존재 및 소유권 확인
    voca_book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == UUID(str(vocaBookId)),
        UserVocaBook.user_id == user_id
    ).first()

    if not voca_book:
        return jsonify({'code': 404, 'message': '해당 단어장을 찾을 수 없습니다.'}), 404

    if voca_book.bookstore_id is not None:
        return jsonify({'code': 403, 'message': '구매한 단어장에는 단어를 추가할 수 없어요.'}), 403

    # 이미 매핑되어 있는지 확인
    existing_map = db.session.query(UserVocaBookMap).filter(
        UserVocaBookMap.user_voca_id == vocaIndexId,
        UserVocaBookMap.user_voca_book_id == UUID(str(vocaBookId))
    ).first()

    if existing_map:
        return jsonify({'code': 409, 'message': '이미 해당 단어장에 등록된 단어입니다.'}), 409

    try:
        meanings = req.get('meanings', [])
        examples = req.get('examples', [])

        # 1. 새 매핑 생성
        book_map = UserVocaBookMap()
        book_map.user_voca_book_id = UUID(str(vocaBookId))
        book_map.user_voca_id = user_voca.id
        book_map.voca_meanings = json.dumps(meanings, ensure_ascii=False)
        book_map.voca_examples = json.dumps(examples, ensure_ascii=False)
        db.session.add(book_map)

        # 2. 기존 UserVoca에 데이터 병합 (누적)
        if meanings:
            user_voca.voca_meanings = merge_meanings(user_voca.voca_meanings, meanings)
        if examples:
            user_voca.voca_examples = merge_examples(user_voca.voca_examples, examples)
        
        db.session.commit()

        # 응답 데이터 구성 (프론트엔드 형식에 맞게)
        # build_voca_index_response는 전체 정보를 반환하지만, 여기서는 연결된 결과(UserVoca 정보)를 
        # 리턴하여 프론트에서 업데이트할 수 있게 함.
        return jsonify({'code': 201, 'data': build_voca_index_response(user_voca)}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어 연결 중 오류가 발생했습니다: {str(e)}'}), 500



# 사용자 단어장 단어 삭제 (특정 단어장에서만 제거)
@voca_indexs_bp.route('/<int:vocaIndexId>/vocaBooks/<vocaBookId>', methods=['DELETE'])
@jwt_required
def delete_voca_index_book(vocaIndexId, vocaBookId):
    user_id = UUID(g.user_id)

    # 소유권 확인
    user_voca = db.session.query(UserVoca).filter(
        UserVoca.id == vocaIndexId,
        UserVoca.user_id == user_id
    ).first()

    if not user_voca:
        return jsonify({'code': 404, 'message': '해당 단어를 찾을 수 없습니다.'}), 404

    book_map = db.session.query(UserVocaBookMap).filter(
        UserVocaBookMap.user_voca_id == vocaIndexId,
        UserVocaBookMap.user_voca_book_id == UUID(str(vocaBookId))
    ).first()

    if not book_map:
        return jsonify({'code': 404, 'message': '해당 단어장 매핑을 찾을 수 없습니다.'}), 404

    if _is_purchased_book_id(user_id, vocaBookId):
        return jsonify({'code': 403, 'message': '구매한 단어장의 단어는 삭제할 수 없어요.'}), 403

    try:
        # 1. 매핑 삭제
        db.session.delete(book_map)
        db.session.flush()

        # 2. 다른 단어장에도 등록되어 있는지 확인
        exists_other = db.session.query(UserVocaBookMap).filter(
            UserVocaBookMap.user_voca_id == vocaIndexId
        ).first()

        # 3. 고아 단어라면 사용자 사전(UserVoca)에서도 삭제
        if not exists_other:
            db.session.delete(user_voca)

        db.session.commit()
        return jsonify({'code': 204, 'message': '단어장 데이터 삭제 성공'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'삭제 중 오류가 발생했습니다: {str(e)}'}), 500
