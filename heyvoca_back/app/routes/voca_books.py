import json
import datetime
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
            'createdAt': (m.user_voca_book.created_at + datetime.timedelta(hours=9)).strftime('%Y-%m-%d') if m.user_voca_book and m.user_voca_book.created_at else None,
            'updatedAt': (m.user_voca_book.updated_at + datetime.timedelta(hours=9)).strftime('%Y-%m-%d') if m.user_voca_book and m.user_voca_book.updated_at else None,
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
    user_id = UUID(g.user_id)

    voca_books = db.session.query(UserVocaBook).filter(
        UserVocaBook.user_id == user_id
    ).all()

    data = [build_voca_book_response(vb) for vb in voca_books]

    return jsonify({'code': 200, 'data': data}), 200


# 단어장 개별 조회
@voca_books_bp.route('/<vocaBookId>', methods=['GET'])
@jwt_required
def get_voca_book(vocaBookId):
    user_id = UUID(g.user_id)

    voca_book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == UUID(str(vocaBookId)),
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
        db.session.flush()  # ID 할당

        # bookstoreId가 있으면 admin_voca_book_map에서 단어 자동 복사
        if bookstore_id:
            bookstore = db.session.query(Bookstore).filter(Bookstore.id == bookstore_id).first()
            if bookstore and bookstore.admin_voca_book_id:
                admin_maps = db.session.query(AdminVocaBookMap).filter(
                    AdminVocaBookMap.book_id == bookstore.admin_voca_book_id
                ).all()
                for admin_map in admin_maps:
                    if not admin_map.voca:
                        continue
                    meanings = json.loads(admin_map.voca_meanings) if admin_map.voca_meanings else []
                    examples = json.loads(admin_map.voca_examples) if admin_map.voca_examples else []

                    user_voca = db.session.query(UserVoca).filter(
                        UserVoca.user_id == user_id,
                        UserVoca.word == admin_map.voca.word
                    ).first()

                    if user_voca:
                        user_voca.voca_meanings = merge_meanings(user_voca.voca_meanings, meanings)
                        user_voca.voca_examples = merge_examples(user_voca.voca_examples, examples)
                    else:
                        user_voca = UserVoca()
                        user_voca.user_id = user_id
                        user_voca.word = admin_map.voca.word
                        user_voca.voca_meanings = json.dumps(meanings, ensure_ascii=False)
                        user_voca.voca_examples = json.dumps(examples, ensure_ascii=False)
                        db.session.add(user_voca)
                        db.session.flush()

                    book_map = UserVocaBookMap()
                    book_map.user_voca_book_id = voca_book.id
                    book_map.user_voca_id = user_voca.id
                    book_map.voca_meanings = json.dumps(meanings, ensure_ascii=False)
                    book_map.voca_examples = json.dumps(examples, ensure_ascii=False)
                    db.session.add(book_map)

                voca_list = []  # 서점 단어장은 vocaList 무시

        # vocaList가 있으면 각 단어에 대해 UserVoca + UserVocaBookMap 생성
        added_count = 0
        for item in voca_list:
            origin = item.get('origin')
            meanings = item.get('meanings', [])
            examples = item.get('examples', [])
            sm2 = item.get('sm2')

            if not origin:
                continue

            # 같은 단어가 UserVoca에 이미 있는지 확인
            user_voca = db.session.query(UserVoca).filter(
                UserVoca.user_id == user_id,
                UserVoca.word == origin
            ).first()

            if user_voca:
                user_voca.voca_meanings = merge_meanings(user_voca.voca_meanings, meanings)
                user_voca.voca_examples = merge_examples(user_voca.voca_examples, examples)
                if sm2:
                    user_voca.data = json.dumps(sm2, ensure_ascii=False)
            else:
                user_voca = UserVoca()
                user_voca.user_id = user_id
                user_voca.word = origin
                user_voca.voca_meanings = json.dumps(meanings, ensure_ascii=False)
                user_voca.voca_examples = json.dumps(examples, ensure_ascii=False)
                user_voca.data = json.dumps(sm2, ensure_ascii=False) if sm2 else None
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

        # 단어 수 업데이트 (서점 경로는 admin_maps 수, vocaList 경로는 added_count)
        if bookstore_id and not voca_list:
            voca_book.total_word_cnt = db.session.query(UserVocaBookMap).filter(
                UserVocaBookMap.user_voca_book_id == voca_book.id
            ).count()
        else:
            voca_book.total_word_cnt = added_count
        voca_book.updated_at = datetime.datetime.utcnow()

        db.session.commit()

        return jsonify({'code': 201, 'data': build_voca_book_response(voca_book)}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어장 생성 중 오류가 발생했습니다: {str(e)}'}), 500


# 단어장 수정
@voca_books_bp.route('/<vocaBookId>', methods=['PATCH'])
@jwt_required
def update_voca_book(vocaBookId):
    user_id = UUID(g.user_id)
    req = request.get_json()

    voca_book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == UUID(str(vocaBookId)),
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

    voca_book = db.session.query(UserVocaBook).filter(
        UserVocaBook.id == UUID(str(vocaBookId)),
        UserVocaBook.user_id == user_id
    ).first()

    if not voca_book:
        return jsonify({'code': 404, 'message': '해당 단어장을 찾을 수 없습니다.'}), 404

    try:
        # 해당 단어장의 모든 UserVocaBookMap 삭제
        db.session.query(UserVocaBookMap).filter(
            UserVocaBookMap.user_voca_book_id == voca_book.id
        ).delete()

        # 단어장 삭제
        db.session.delete(voca_book)
        db.session.commit()

        return jsonify({'code': 204, 'message': '단어장 삭제 성공'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': f'단어장 삭제 중 오류가 발생했습니다: {str(e)}'}), 500
