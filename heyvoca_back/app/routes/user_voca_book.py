import json
import re
from flask import render_template, redirect, url_for, request, session, jsonify
from sqlalchemy import text, select
from sqlalchemy.orm import joinedload, contains_eager
from app.routes import user_voca_book_bp
from app.models.models import db, VocaBook, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, Bookstore, UserVocaBook, Color

from flask_login import current_user, login_required, login_user



# @login_required
@user_voca_book_bp.route('/list', methods=['GET'])
def get_user_voca_book_list():
    user_id = current_user.id

    user_voca_book_list = db.session.query(UserVocaBook.id, UserVocaBook.name, UserVocaBook.vocabook_id, UserVocaBook.voca_list, Color.color)\
                                .join(Color, UserVocaBook.color_id == Color.id)\
                                .filter(UserVocaBook.user_id == user_id).all()
    
    data = []
    for user_voca_book in user_voca_book_list:
        vocabook_dict = {}
        vocabook_dict['id'] = user_voca_book.id
        vocabook_dict['title'] = user_voca_book.name
        vocabook_dict['words'] = json.loads(user_voca_book.voca_list) if user_voca_book.voca_list else None
        vocabook_dict['color'] = json.loads(user_voca_book.color)
        vocabook_dict['total'] = user_voca_book.total_word_cnt
        vocabook_dict['memorized'] = None       # TODO
        vocabook_dict['createdAt'] = user_voca_book.created_at
        vocabook_dict['updatedAt'] = user_voca_book.updated_at if user_voca_book.updated_at else None

    return jsonify({'code': 200, 'data': data}), 200


# @login_required
@user_voca_book_bp.route('/create', methods=['POST'])
def create_user_voca_book():
    data = request.get_json()
    name = data['title']
    color = data['color']
    user_id = current_user.id

    user_voca_book = UserVocaBook(
        user_id=user_id,
        color=json.dumps(color),
        name=name,
        total_word_cnt=0,
        voca_list=None,
        updated_at=None
    )

    db.session.add(user_voca_book)
    db.session.commit()

    data = {
        'createdAt': user_voca_book.created_at, 
        'updatedAt': user_voca_book.updated_at if user_voca_book.updated_at else None
    }

    return jsonify({'code': 200, 'data': data}), 200
