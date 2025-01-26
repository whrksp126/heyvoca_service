from flask import render_template, redirect, url_for, request, session, jsonify
from app import db
from app.routes import mainpage_bp
from app.models.models import User, DailySentence
from datetime import datetime, timedelta
from sqlalchemy import func

from flask_login import current_user, login_required, login_user, logout_user

import io
import json


# TODO: item 없으면 어떻게 보내줄까용?
@mainpage_bp.route('/')
def send_daily_sentence():
    today = (datetime.utcnow() + timedelta(hours=9)).date()
    item = DailySentence.query\
                    .filter(func.date(DailySentence.date) == today)\
                    .first()
    res = {
        'sentence': item.sentence,
        'meaning': item.meaning
    }
    return {'code' : 200, 'data' : res}
