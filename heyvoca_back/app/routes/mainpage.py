from flask import render_template, redirect, url_for, request, session, jsonify
from app import db
from app.routes import mainpage_bp
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy
from datetime import datetime, timedelta
from sqlalchemy import func, and_

from flask_login import current_user, login_required, login_user, logout_user

import io
import json
from uuid import UUID



@mainpage_bp.route('/user_goals', methods=['GET'])
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


@mainpage_bp.route('/user_dates', methods=['GET'])
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


@mainpage_bp.route('/gem_cnt', methods=['GET'])
@login_required
def api_gem_cnt():
    user_id = current_user.id

    user_gem_cnt = db.session.query(User.gem_cnt).filter(User.id == user_id).scalar()

    return {'code' : 200, 'data' : user_gem_cnt}


@mainpage_bp.route('user_recent_study_data', methods=['GET'])
@login_required
def api_user_recent_study_data():
    user_id = current_user.id
    recent_data = db.session.query(UserRecentStudy).filter(UserRecentStudy.user_id == user_id).first()

    if recent_data:
        data = {
            'id': recent_data.id,
            'study_data': json.loads(recent_data.study_data),
            'status': recent_data.status,
            'progress_index': recent_data.progress_index,
            'created_at': recent_data.created_at + timedelta(hours=9),
            'updated_at': recent_data.updated_at + timedelta(hours=9) if recent_data.updated_at is not None else None,
        }
    else:
        data = {
            'id': None,
            'study_data': None,
            'status': None,
            'progress_index': None,
            'created_at': None,
            'updated_at': None,
        }

    return {'code': 200, 'data': data}


@mainpage_bp.route('user_recent_study_create_update', methods=['POST'])
@login_required
def api_user_recent_study_create_update():
    data = request.json
    id = data['id']
    study_data = data['study_data']
    status = data['status']
    progress_index = data['progress_index']

    user_id = current_user.id

    study_data = json.dumps(study_data) if study_data is not None else None

    # update
    if id is not None:
        recent_data = db.session.query(UserRecentStudy)\
                            .filter(UserRecentStudy.id == UUID(id))\
                            .filter(UserRecentStudy.user_id == user_id)\
                            .first()
        recent_data.study_data = study_data
        recent_data.status = status
        recent_data.progress_index = progress_index
        recent_data.updated_at = datetime.utcnow()

        db.session.commit()
    
    # create
    else:
        recent_data = UserRecentStudy(
            user_id=user_id, study_data=study_data, status=status,
            progress_index=progress_index, updated_at=None
        )
        db.session.add(recent_data)
        db.session.commit()

    data = {
        'id': recent_data.id,
        'study_data': json.loads(recent_data.study_data) if recent_data.study_data is not None else None,
        'status': recent_data.status,
        'progress_index': recent_data.progress_index,
        'created_at': recent_data.created_at + timedelta(hours=9),
        'updated_at': recent_data.updated_at + timedelta(hours=9) if recent_data.updated_at is not None else None,
    }

    return {'code': 200, 'data': data}