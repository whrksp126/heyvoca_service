import json
import re
from flask import render_template, redirect, url_for, request, session, jsonify, g
from sqlalchemy import text, select
from sqlalchemy.orm import joinedload, contains_eager
# from datetime import datetime, timedelta
import datetime
from uuid import uuid4, UUID

from app.routes import user_voca_book_bp
from app.models.models import db, User, VocaBook, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, Bookstore, UserVocaBook
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

        # gem 사용 여부 확인
        print('bookstore_id:', bookstore_id)
        if bookstore_id:
            bookstore_item = db.session.query(Bookstore).filter(Bookstore.id == bookstore_id).first()
            print('user.gem_cnt:', user.gem_cnt)
            print('bookstore_item.gem:', bookstore_item.gem)
            if user.gem_cnt < bookstore_item.gem:
                return jsonify({'code': 400, 'message': '단어장 생성 실패'}), 400
            user.gem_cnt -= 1
            bookstore_item.downloads += 1
        else:
            if user.book_cnt < 1:
                return jsonify({'code': 400, 'message': '단어장 생성 실패'}), 400
            user.book_cnt -= 1

        db.session.commit() 

        data = {
            'id': user_voca_book.id,
            'createdAt': user_voca_book.created_at + datetime.timedelta(hours=9), 
        }

        return jsonify({'code': 200, 'data': data}), 200
    
    except Exception as e:
        print("###error : ",e)
        return jsonify({'code': 400, 'message': '단어장 생성 실패'})


@user_voca_book_bp.route('/update', methods=['PATCH'])
@jwt_required
def update_user_voca_book():
    data = request.get_json()
    user_voca_book_id = UUID(data.get('id'))

    if not user_voca_book_id:
        return jsonify({'code': 400, 'message': 'ID가 필요합니다.'}), 400

    user_voca_book = db.session.query(UserVocaBook).filter(UserVocaBook.id == user_voca_book_id).first()

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
