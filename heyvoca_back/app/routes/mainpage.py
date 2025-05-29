from flask import render_template, redirect, url_for, request, session, jsonify
from app import db
from app.routes import mainpage_bp
from app.models.models import User, DailySentence, UserGoals
from datetime import datetime, timedelta
from sqlalchemy import func

from flask_login import current_user, login_required, login_user, logout_user

import io
import json


@mainpage_bp.route('/')
@login_required
def get_user_goals():
    user_id = current_user.id
    goals = db.session.query(UserGoals).filter(UserGoals.user_id == user_id).all()

    data = []
    return {'code' : 200, 'data' : data}


