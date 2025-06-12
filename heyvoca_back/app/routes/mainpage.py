from flask import render_template, redirect, url_for, request, session, jsonify
from app import db
from app.routes import mainpage_bp
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType
from datetime import datetime, timedelta
from sqlalchemy import func, and_

from flask_login import current_user, login_required, login_user, logout_user

import io
import json


@mainpage_bp.route('/user_goals')
@login_required
def api_user_goals():
    print("#####################3 api_user_goals")
    user_id = current_user.id
    goals = db.session.query(UserGoals.current_value, GoalType.type, Goals.badge_img, Goals.level)\
                    .join(Goals, UserGoals.goal_id == Goals.id)\
                    .join(GoalType, Goals.type_id == GoalType.id)\
                    .filter(UserGoals.user_id == user_id)\
                    .all()
    
    data = []
    for goal in goals:
        data.append({
            'name' : goal.type,
            'badge_img' : goal.badge_img,
        })
    return {'code' : 200, 'data' : data}


@mainpage_bp.route('/user_dates')
@login_required
def api_user_dates():
    # user_id = current_user.id

    # kst_now = datetime.utcnow() + timedelta(hours=9)
    # today = kst_now.date()
    # this_sunday = today - timedelta(days=today.weekday() + 1 if today.weekday() != 6 else 0)
    # this_saturday = this_sunday + timedelta(days=6)

    # checkins = db.session.query(CheckIn)\
    #             .filter(
    #                 and_(
    #                     CheckIn.user_id == user_id,
    #                     CheckIn.check_date >= this_sunday,
    #                     CheckIn.check_date <= this_saturday
    #                 )
    #             ).all()
    
    # checkin_dict = {checkin.check_date: checkin for checkin in checkins}
    # days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    # data = []
    # for i in range(7):
    #     date = this_sunday + timedelta(days=i)
    #     checkin = checkin_dict.get(date)
    #     data.append({
    #         'date': days[i],
    #         'attend': bool(checkin.attendence_check) if checkin else False,
    #         'daily_mission': bool(checkin.study_complete) if checkin else False,
    #     })

    dummy = [
        {
            'date': 'SUN',
            'attend': True,
            'daily_mission': False,
        },
        {
            'date': 'MON',
            'attend': True,
            'daily_mission': False,
        },
        {
            'date': 'TUE',
            'attend': True,
            'daily_mission': False,
        },
        {
            'date': 'WED',
            'attend': True,
            'daily_mission': True,
        },
        {
            'date': 'THU',
            'attend': True,
            'daily_mission': True,
        },
        {
            'date': 'FRI',
            'attend': False,
            'daily_mission': False,
        },
        {
            'date': 'SAT',
            'attend': False,
            'daily_mission': False,
        }

    ]
    return {'code' : 200, 'data' : dummy}


