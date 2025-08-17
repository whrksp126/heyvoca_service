from flask import render_template, redirect, url_for, request, session, jsonify
from app import db
from app.routes import mainpage_bp
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy, RecentStudyType, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, UserVocaBook
from datetime import datetime, timedelta
from sqlalchemy import func, and_

from flask_login import current_user, login_required, login_user, logout_user

import io
import json
from uuid import UUID



@mainpage_bp.route('/user_goals', methods=['GET'])
@login_required
def api_user_goals():
    user_id = current_user.id

    goal_types = [r[0] for r in db.session.query(GoalType.type).all()]

    completed_rows = (
        db.session.query(
            GoalType.type.label('goal_type'),
            func.max(Goals.level).label('max_level')
        )
        .select_from(UserGoals)
        .join(Goals, UserGoals.goal_id == Goals.id)
        .join(GoalType, Goals.type_id == GoalType.id)
        .filter(UserGoals.user_id == user_id)
        .filter(UserGoals.completed_at.isnot(None))
        .group_by(GoalType.type)
        .all()
    )

    completed_dict = {row.goal_type: row.max_level for row in completed_rows}

    data = [
        {'type': gt, 'level': completed_dict.get(gt, 0)}
        for gt in goal_types
    ]

    return {'code': 200, 'data': data}

@mainpage_bp.route('/user_dates', methods=['GET'])
@login_required
def api_user_dates():
    user_id = current_user.id

    kst_now = datetime.utcnow() + timedelta(hours=9)
    today = kst_now.date()

    this_sunday = today - timedelta(days=(today.weekday() + 1) % 7)
    this_saturday = this_sunday + timedelta(days=6)

    # 이번 주 체크인 전체 조회
    checkins = (
        db.session.query(CheckIn)
        .filter(
            and_(
                CheckIn.user_id == user_id,
                CheckIn.attendence_date >= this_sunday,
                CheckIn.attendence_date <= this_saturday,
            )
        )
        .all()
    )

    # 날짜 → 체크인 레코드 매핑
    by_date = {c.attendence_date: c for c in checkins}

    days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    data = []
    for i in range(7):
        d = this_sunday + timedelta(days=i)
        ci = by_date.get(d)
        data.append({
            'date': days[i],
            'attend': True if ci else False,
            'daily_mission': bool(ci.today_study_complete) if ci else False,
        })

    return {'code' : 200, 'data' : data}


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
    recent_data = db.session.query(UserRecentStudy)\
                .filter(UserRecentStudy.user_id == user_id)\
                .all()

    data_dict = {}
    for recent in recent_data:
        data = {
            'id': recent.id,
            'status': recent.status,
            'progress_index': recent.progress_index,
            'type': recent.type.value,
            'study_data': json.loads(recent.study_data) if recent.study_data is not None else None,
            'created_at': (recent.created_at + timedelta(hours=9)),
            'updated_at': (recent.updated_at + timedelta(hours=9)) if recent.updated_at else None,
        }
        data_dict[recent.type.value] = data

    return {'code': 200, 'data': data_dict}


@mainpage_bp.route('user_recent_study_create_update', methods=['POST'])
@login_required
def api_user_recent_study_create_update():
    data = request.json
    id = data.get('id', None)
    study_data = data.get('study_data', None)
    status = data.get('status', None)
    progress_index = data.get('progress_index', None)
    type = data['type']

    user_id = current_user.id
    study_data = json.dumps(study_data) if study_data is not None else None

    # update
    if id is not None:
        recent_data = db.session.query(UserRecentStudy)\
                            .filter(UserRecentStudy.id == UUID(id))\
                            .filter(UserRecentStudy.user_id == user_id)\
                            .first()
        
        if RecentStudyType(type.lower()) != recent_data.type:
            return {'code': 400, 'message': 'type 변경 불가능'}
        
        recent_data.study_data = study_data
        recent_data.status = status
        recent_data.progress_index = progress_index
        # recent_data.type = type
        recent_data.updated_at = datetime.utcnow()

        db.session.commit()
    
    # create
    else:
        recent_data = UserRecentStudy(
            user_id=user_id, study_data=study_data, status=status,
            progress_index=progress_index, type=RecentStudyType(type.lower()), updated_at=None
        )
        db.session.add(recent_data)
        db.session.commit()

    data = {
        'id': recent_data.id,
        'study_data': json.loads(recent_data.study_data) if recent_data.study_data is not None else None,
        'status': recent_data.status,
        'progress_index': recent_data.progress_index,
        'type': recent_data.type.value,
        'created_at': recent_data.created_at + timedelta(hours=9),
        'updated_at': recent_data.updated_at + timedelta(hours=9) if recent_data.updated_at is not None else None,
    }

    return {'code': 200, 'data': data}


def update_user_goal(goal_type_name: str):
    user_id = current_user.id
    
    # 현재 유저가 달성 중인 해당 업적 조회
    current_user_goal = db.session.query(UserGoals)\
                            .join(Goals, UserGoals.goal_id == Goals.id)\
                            .join(GoalType, Goals.type_id == GoalType.id)\
                            .filter(UserGoals.user_id == user_id)\
                            .filter(GoalType.type == goal_type_name)\
                            .filter(UserGoals.is_completed == False)\
                            .first()
    
    # 진행중 목표 없음 → 마지막 레벨까지 다 했는지 확인
    if not current_user_goal:
        # 이 타입의 최대 레벨 찾기
        max_level = (
            db.session.query(func.max(Goals.level))
            .join(GoalType, Goals.type_id == GoalType.id)
            .filter(GoalType.type == goal_type_name)
            .scalar()
        )

        # 유저가 그 max_level을 완료했는지 확인
        last_goal_done = (
            db.session.query(UserGoals)
            .join(Goals, UserGoals.goal_id == Goals.id)
            .join(GoalType, Goals.type_id == GoalType.id)
            .filter(UserGoals.user_id == user_id)
            .filter(GoalType.type == goal_type_name)
            .filter(Goals.level == max_level)
            .filter(UserGoals.is_completed == True)
            .first()
        )

        if last_goal_done:
            return None, None, None  
    
    # Goal 조회
    goal = db.session.query(Goals)\
                .filter(Goals.id == current_user_goal.goal_id)\
                .first()

    # current_value 증가
    current_user_goal.current_value += 1

    # 목표 도달 시 완료 처리
    goal_complete = False
    if current_user_goal.current_value >= goal.goal:
        goal_complete = True
        current_user_goal.is_completed = True
        current_user_goal.completed_at = datetime.utcnow()

        # 다음 레벨 목표 존재 여부 확인
        current_goal = db.session.query(Goals).filter(Goals.id == current_user_goal.goal_id).first()
        next_goal = db.session.query(Goals)\
                        .filter(Goals.type_id == current_goal.type_id)\
                        .filter(Goals.level == current_goal.level + 1)\
                        .first()
        if next_goal:
            next_user_goal = UserGoals(
                user_id=user_id,
                goal_id=next_goal.id,
                current_value=0,
                is_completed=False,
                completed_at=None
            )
            db.session.add(next_user_goal)

    if goal_complete:
        return current_user_goal, goal.reward_count, current_goal.badge_img
    else:
        return None, None, None
    


@mainpage_bp.route('/user_study_history', methods=['POST'])
@login_required
def api_user_study_history():
    data = request.json
    today_study_complete = data['today_study_complete']
    correct_cnt = int(data.get('correct_cnt') or 0)
    incorrect_cnt = int(data.get('incorrect_cnt') or 0)

    user_id = current_user.id

    # 1. 경험치 업데이트
    add_xp = correct_cnt * 5 + incorrect_cnt * 2
    user = db.session.query(User).filter(User.id == user_id).first()
    user.xp += add_xp

    # 2. 오늘의 미션 업데이트
    is_today_study_complete = False
    if today_study_complete:
        today = (datetime.utcnow() + timedelta(hours=9)).date()
        checkin = db.session.query(CheckIn)\
                    .filter(CheckIn.user_id == user_id)\
                    .filter(CheckIn.attendence_date == today)\
                    .first()
        
        if checkin.today_study_complete == False:
            is_today_study_complete = True
            checkin.today_study_complete = True

    # 3.업적(암기왕, 노력왕) 업데이트
    memory_goal_complete, memory_goal_reward_count, memory_goal_badge_img = update_user_goal('암기왕')
    effort_goal_complete, effort_goal_reward_count, effort_goal_badge_img = update_user_goal('노력왕')

    # 4. 보석 업데이트
    add_gem = 0
    if is_today_study_complete:
        add_gem += 1
    if memory_goal_reward_count:
        add_gem += memory_goal_reward_count
    if effort_goal_reward_count:
        add_gem += effort_goal_reward_count
    user.gem_cnt += add_gem

    db.session.commit()

    goals = []
    if memory_goal_complete:
        goals.append({
            'name' : '암기왕',
            'badge_img' : memory_goal_badge_img,
            'completed_at' : memory_goal_complete.completed_at + timedelta(hours=9),
        })
    if effort_goal_complete:
        goals.append({
            'name' : '노력왕',
            'badge_img' : effort_goal_badge_img,
            'completed_at' : effort_goal_complete.completed_at + timedelta(hours=9),
        })

    return {
        'code': 200,
        'data': {
            'exp': {
                'before' : user.xp - add_xp,
                'after' : user.xp,
            },
            'gem': {
                'before': user.gem_cnt - add_gem,
                'after': user.gem_cnt
            },
            'today_study_complete': today_study_complete,
            'goals': goals
        }
    }


@mainpage_bp.route('/checkin', methods=['GET'])
@login_required
def checkin():
    user_id = current_user.id
    today = (datetime.utcnow() + timedelta(hours=9)).date()
    exists = db.session.query(CheckIn).filter(
                    CheckIn.user_id == user_id, 
                    CheckIn.attendence_date == today
                ).first()
    
    goals = []
    before_gem_cnt = 0
    after_gem_cnt = 0
    user = db.session.query(User).filter(User.id == user_id).first()
    if not exists:
        db.session.add(CheckIn(user_id=user_id, attendence_date=today, today_study_complete=False))
        db.session.commit()

        attendance_goal_complete, attendance_goal_reward_count, attendance_goal_badge_img = update_user_goal('출석왕')
        if attendance_goal_complete:
            goals.append({
                'name' : '출석왕',
                'badge_img' : attendance_goal_badge_img,
                'completed_at' : attendance_goal_complete.completed_at + timedelta(hours=9),
            })
        
        user.gem_cnt += attendance_goal_reward_count
        db.session.commit()

        before_gem_cnt = user.gem_cnt - attendance_goal_reward_count
        after_gem_cnt = user.gem_cnt
    else:
        before_gem_cnt = user.gem_cnt
        after_gem_cnt = user.gem_cnt

    return {
        'code': 200,
        'data': {
            'gem': {
                'before': before_gem_cnt,
                'after': after_gem_cnt
            },
            'goals': goals
        }
    }


@mainpage_bp.route('/user_book_cnt_check', methods=['GET'])
@login_required
def user_book_cnt_check():
    user_id = current_user.id
    user_item = db.session.query(User).filter(User.id == user_id).first()
    
    can_add_book = True if user_item.book_cnt > 0 else False
    
    return jsonify({
        'code': 200,
        'data': {
            'can_add_book': can_add_book
        }
    })


