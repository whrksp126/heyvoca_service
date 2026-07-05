import logging

from flask import render_template, redirect, url_for, request, session, jsonify, g
from app import db
from app.routes import mainpage_bp
from app.utils.jwt_utils import jwt_required
from uuid import UUID
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy, RecentStudyType, VocaMeaning, VocaExample, VocaMeaningMap, VocaExampleMap, UserVocaBook, Bookstore, Product, GemReason
from app.routes.common import register_gem_log
from app.services.study_day import logical_today
from app.services.daily_progress import get_today_new_done, get_review_due
from datetime import datetime, timedelta, date
import calendar
from sqlalchemy import func, and_
from sqlalchemy.exc import IntegrityError

import io
import json



@mainpage_bp.route('/user_goals', methods=['GET'])
@jwt_required
def api_user_goals():
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환

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


@mainpage_bp.route('/achievement_criteria', methods=['GET'])
def api_achievement_criteria():
    """업적 달성 기준 조회 API"""
    results = (
        db.session.query(
            GoalType.type.label('type_name'),
            Goals.level,
            Goals.goal,
            Goals.reward_count,
            Goals.goal_text,
            Goals.description
        )
        .join(Goals, GoalType.id == Goals.type_id)
        .order_by(GoalType.id, Goals.level)
        .all()
    )

    achievement_criteria = {}
    for r in results:
        if r.type_name not in achievement_criteria:
            achievement_criteria[r.type_name] = []

        achievement_criteria[r.type_name].append({
            'level': r.level,
            'goal': r.goal_text or f"{r.type_name} {r.level}단계 달성",
            'target_value': r.goal,
            'reward': r.reward_count
        })

    return {'code': 200, 'data': achievement_criteria}

@mainpage_bp.route('/user_dates', methods=['GET'])
@jwt_required
def api_user_dates():
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환

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
            'attend': bool(ci),
            # daily_mission: 신규+복습 미션을 둘 다 달성한 날 (daily_mission_complete 기준)
            'daily_mission': bool(ci.daily_mission_complete) if ci else False,
        })

    return {'code' : 200, 'data' : data}


@mainpage_bp.route('/user_dates_monthly', methods=['GET'])
@jwt_required
def api_user_dates_monthly():
    user_id = UUID(g.user_id)

    kst_now = datetime.utcnow() + timedelta(hours=9)
    kst_today = kst_now.date()

    # query params 파싱 — 잘못된 값이면 현재 KST 년/월 사용
    try:
        year = int(request.args['year'])
        month = int(request.args['month'])
        if not (1 <= month <= 12):
            raise ValueError
    except (KeyError, ValueError, TypeError):
        year, month = kst_today.year, kst_today.month

    # 미래 월 요청 시 빈 데이터 반환
    if (year, month) > (kst_today.year, kst_today.month):
        return {'code': 200, 'data': []}

    _, last_day = calendar.monthrange(year, month)
    first_date = date(year, month, 1)
    last_date = date(year, month, last_day)

    checkins = (
        db.session.query(CheckIn)
        .filter(
            and_(
                CheckIn.user_id == user_id,
                CheckIn.attendence_date >= first_date,
                CheckIn.attendence_date <= last_date,
            )
        )
        .all()
    )

    by_date = {c.attendence_date: c for c in checkins}

    data = []
    for day_num in range(1, last_day + 1):
        d = date(year, month, day_num)
        ci = by_date.get(d)
        data.append({
            'date': d.isoformat(),
            'attend': bool(ci),
            # daily_mission: 신규+복습 미션을 둘 다 달성한 날 (daily_mission_complete 기준)
            'daily_mission': bool(ci.daily_mission_complete) if ci else False,
        })

    return {'code': 200, 'data': data}


@mainpage_bp.route('/user_first_checkin', methods=['GET'])
@jwt_required
def api_user_first_checkin():
    user_id = UUID(g.user_id)

    first_checkin = (
        db.session.query(CheckIn)
        .filter(CheckIn.user_id == user_id)
        .order_by(CheckIn.attendence_date.asc())
        .first()
    )

    return {
        'code': 200,
        'data': {
            'first_date': first_checkin.attendence_date.isoformat() if first_checkin else None,
        },
    }


@mainpage_bp.route('/gem_cnt', methods=['GET'])
@jwt_required
def api_gem_cnt():
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환

    user_gem_cnt = db.session.query(User.gem_cnt).filter(User.id == user_id).scalar()

    return {'code' : 200, 'data' : user_gem_cnt}


@mainpage_bp.route('user_recent_study_data', methods=['GET'])
@jwt_required
def api_user_recent_study_data():
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
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
@jwt_required
def api_user_recent_study_create_update():
    data = request.json
    id = data.get('id', None)
    study_data = data.get('study_data', None)
    status = data.get('status', None)
    progress_index = data.get('progress_index', None)
    type = data['type']

    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
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
    
    # create or upsert (id 없을 때 같은 user+type 레코드가 이미 있으면 update)
    else:
        recent_data = db.session.query(UserRecentStudy)\
            .filter(UserRecentStudy.user_id == user_id)\
            .filter(UserRecentStudy.type == RecentStudyType(type.lower()))\
            .first()
        if recent_data is not None:
            recent_data.study_data = study_data
            recent_data.status = status
            recent_data.progress_index = progress_index
            recent_data.updated_at = datetime.utcnow()
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

def update_user_goal(goal_type_name: str, user_id: UUID = None):
    if user_id is None:
        user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
    else:   # 초대왕용. 초대한 사람의 ID를 넘겨줄 경우
        user_id = UUID(user_id) if isinstance(user_id, str) else user_id
    
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
            return None, None, None, None
        
        # 진행 중인 목표도 없고 마지막 레벨도 완료하지 않은 경우 → 첫 번째 레벨 목표 생성
        goal_type = db.session.query(GoalType).filter(GoalType.type == goal_type_name).first()
        if not goal_type:
            return None, None, None, None
        
        first_goal = db.session.query(Goals)\
                        .filter(Goals.type_id == goal_type.id)\
                        .filter(Goals.level == 1)\
                        .first()
        
        if not first_goal:
            return None, None, None, None
        
        # 첫 번째 레벨 목표를 UserGoals에 생성
        current_user_goal = UserGoals(
            user_id=user_id,
            goal_id=first_goal.id,
            current_value=0,
            is_completed=False,
            completed_at=None
        )
        db.session.add(current_user_goal)
        db.session.flush()  # ID를 얻기 위해 flush
    
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
        
        # 업적 완료 시 보석 지급 및 로그 기록
        user = db.session.query(User).filter(User.id == user_id).first()
        if user and goal.reward_count > 0:
            user.gem_cnt += goal.reward_count
            register_gem_log(
                user_id=user_id,
                amount=goal.reward_count,
                reason=GemReason.ACHIEVEMENT,
                description=f"업적 완료: {goal_type_name} 레벨 {current_goal.level}",
                source_type="achievement",
                source_id=None, 
                balance_after=user.gem_cnt
            )
        return current_user_goal, goal.reward_count, current_goal.badge_img, current_goal.level
    else:
        return None, None, None, None
    


@mainpage_bp.route('/user_study_history', methods=['POST'])
@jwt_required
def api_user_study_history():
    """학습 세션 집계 — 출석, 데일리 미션, 업적을 한 번에 처리한다.

    출석(attend):
      오늘(logical day) 첫 학습이면 attend_newly=True → 출석왕 진행 + 보석 +1.

    데일리 미션 완료(daily_mission_complete):
      오늘 신규 목표(daily_new_limit) 달성 AND 복습 잔여(review_due) == 0
      → mission_newly=True 이면 끈기왕 판정 + 보석 +1.

    암기왕: 이 엔드포인트에서는 더 이상 트리거하지 않음 (콤보 기준으로 전환, combo.py 처리).
    노력왕: total_cnt > 0 이면 진행 (기존과 동일).
    """
    data = request.json
    correct_cnt = int(data.get('correct_cnt') or 0)
    incorrect_cnt = int(data.get('incorrect_cnt') or 0)
    total_cnt = correct_cnt + incorrect_cnt

    user_id = UUID(g.user_id)

    # 1. 경험치 업데이트
    add_xp = correct_cnt * 5 + incorrect_cnt * 2
    user = db.session.query(User).filter(User.id == user_id).first()
    user.xp += add_xp

    # 보석 스냅샷 (이 요청으로 지급하기 전 잔액 — 업적 보상 포함 전)
    gem_before = user.gem_cnt

    # ── (a) 출석 처리 ──────────────────────────────────────
    # 오늘(logical day) 첫 학습이면 attend_newly=True
    attend_newly = False
    today = logical_today()
    checkin = (
        db.session.query(CheckIn)
        .filter(CheckIn.user_id == user_id, CheckIn.attendence_date == today)
        .first()
    )

    if not checkin:
        checkin = CheckIn(
            user_id=user_id,
            attendence_date=today,
            today_study_complete=True,
            daily_mission_complete=False,
        )
        db.session.add(checkin)
        attend_newly = True
    elif not checkin.today_study_complete:
        checkin.today_study_complete = True
        attend_newly = True

    # 출석왕 업적 진행 + 보석 +1
    attendance_goal_complete, att_reward, att_badge, att_level = None, None, None, None
    if attend_newly:
        attendance_goal_complete, att_reward, att_badge, att_level = update_user_goal('출석왕')
        user.gem_cnt += 1  # 출석 보석

    # ── (c) 노력왕 (total_cnt > 0 이면 진행, 기존과 동일) ──
    effort_goal_complete, effort_goal_reward_count, effort_goal_badge_img, effort_goal_level = None, None, None, None
    if total_cnt > 0:
        effort_goal_complete, effort_goal_reward_count, effort_goal_badge_img, effort_goal_level = update_user_goal('노력왕')

    # ── (d) 데일리 미션 판정 ────────────────────────────────
    # /study/today-summary, /study/review-schedule 과 동일 기준의 공유 헬퍼 사용
    new_done, reviews_done = get_today_new_done(user_id)
    review_due = get_review_due(user_id)

    daily_new_limit = user.daily_new_limit if user.daily_new_limit is not None else 20
    new_target = daily_new_limit if daily_new_limit > 0 else 0

    # 신규 충족: daily_new_limit > 0 → new_done >= limit, 0 → new_done > 0
    new_met = (new_done >= daily_new_limit) if daily_new_limit > 0 else (new_done > 0)
    review_met = (review_due == 0)
    mission_met = new_met and review_met

    # 이번 세션에 처음으로 미션을 달성한 경우만 처리
    mission_newly = False
    if mission_met and not checkin.daily_mission_complete:
        mission_newly = True
        checkin.daily_mission_complete = True
        user.gem_cnt += 1  # 미션 완료 보석

    # ── (e) 끈기왕 (mission_newly일 때만 판정) ──────────────
    perseverance_goal_complete, perseverance_goal_reward_count, perseverance_goal_badge_img, perseverance_goal_level = None, None, None, None
    if mission_newly:
        yesterday = today - timedelta(days=1)
        yesterday_checkin = (
            db.session.query(CheckIn)
            .filter(CheckIn.user_id == user_id, CheckIn.attendence_date == yesterday)
            .first()
        )

        # 어제도 데일리 미션을 달성했으면 연속 성공
        if yesterday_checkin and yesterday_checkin.daily_mission_complete:
            per_done, per_reward, per_badge, per_lv = update_user_goal('끈기왕')
            perseverance_goal_complete, perseverance_goal_reward_count, perseverance_goal_badge_img, perseverance_goal_level = per_done, per_reward, per_badge, per_lv
        else:
            # 연속 끊김 → 끈기왕 진행 상태를 오늘부터 다시 1일로 리셋
            reset_goal = (
                db.session.query(UserGoals)
                .join(Goals, UserGoals.goal_id == Goals.id)
                .join(GoalType, Goals.type_id == GoalType.id)
                .filter(UserGoals.user_id == user_id)
                .filter(GoalType.type == '끈기왕')
                .filter(UserGoals.is_completed == False)
                .first()
            )
            if reset_goal:
                reset_goal.current_value = 1
            else:
                # 레코드가 없는 경우(첫 시작·전 레벨 완료 등): update_user_goal로 생성 후 +1
                update_user_goal('끈기왕')

    db.session.commit()

    # ── 응답 goals 목록 ─────────────────────────────────────
    goals = []
    if attendance_goal_complete:
        goals.append({
            'name': '출석왕',
            'type': '출석왕',
            'level': att_level,
            'badge_img': att_badge,
            'completed_at': attendance_goal_complete.completed_at + timedelta(hours=9),
        })
    if effort_goal_complete:
        goals.append({
            'name': '노력왕',
            'type': '노력왕',
            'level': effort_goal_level,
            'badge_img': effort_goal_badge_img,
            'completed_at': effort_goal_complete.completed_at + timedelta(hours=9),
        })
    if perseverance_goal_complete:
        goals.append({
            'name': '끈기왕',
            'type': '끈기왕',
            'level': perseverance_goal_level,
            'badge_img': perseverance_goal_badge_img,
            'completed_at': perseverance_goal_complete.completed_at + timedelta(hours=9),
        })

    return {
        'code': 200,
        'data': {
            'exp': {
                'before': user.xp - add_xp,
                'after': user.xp,
            },
            'gem': {
                'before': gem_before,
                'after': user.gem_cnt,
            },
            # 출석 관련
            'attend': attend_newly,
            'today_study_complete': attend_newly,        # 하위 호환 (= attend)
            # 데일리 미션 관련
            'daily_mission_complete': mission_newly,     # 이번 세션에 미션 완료됨
            'daily_progress': {
                'new_done': new_done,
                'new_target': new_target,
                'review_done': reviews_done,
                'review_due': review_due,
            },
            'goals': goals,
        },
    }


@mainpage_bp.route('/checkin', methods=['GET'])
@jwt_required
def checkin():
    """주간 출석 표시용 체크인 — 읽기 전용.

    출석(attend) 트리거 및 출석왕/보석 지급은
    POST /user_study_history 에서만 처리한다.
    이 라우트는 부작용 없이 현재 보석 수만 반환한다.
    """
    user_id = UUID(g.user_id)
    user = db.session.query(User).filter(User.id == user_id).first()
    gem_cnt = user.gem_cnt if user else 0

    return {
        'code': 200,
        'data': {
            'gem': {
                'before': gem_cnt,
                'after': gem_cnt,
            },
            'goals': [],
        },
    }


@mainpage_bp.route('/user_book_cnt_check', methods=['GET'])
@jwt_required
def user_book_cnt_check():
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
    user_item = db.session.query(User).filter(User.id == user_id).first()
    
    can_add_book = True if user_item.book_cnt > 0 else False
    
    return jsonify({
        'code': 200,
        'data': {
            'can_add_book': can_add_book
        }
    })



@mainpage_bp.route('/products', methods=['GET'])
def api_get_active_products():
    """활성화된 모든 상품 조회 API"""
    try:

        platform = request.args.get('platform', 'web')

        
        # 활성화된 상품만 조회 (is_active=True)
        query = db.session.query(Product)\
            .filter(Product.is_active == True)
        
        # 플랫폼 필터링 (platform이 'all'이 아닌 경우)
        if platform != 'web':
            query = query.filter(Product.platform == platform)
        
        products = query.order_by(Product.price.asc()).all()
        
        # 응답 데이터 구성
        product_list = []
        for product in products:
            product_list.append({
                'id': product.id,
                'product_id': product.product_id,
                'name': product.name,
                'description': product.description,
                'gem_amount': product.gem_amount,
                'price': product.price,
                'platform': product.platform,
                'bonus': product.bonus,
                'image_url': product.image_url,
                'created_at': product.created_at.isoformat() if product.created_at else None,
                'updated_at': product.updated_at.isoformat() if product.updated_at else None
            })
        
        return jsonify({
            'code': 200,
            'data': product_list
        }), 200
        
    except Exception as e:
        logging.getLogger(__name__).error('get_products 오류', exc_info=True)
        return jsonify({
            'code': 500,
            'message': '서버 오류가 발생했습니다.'
        }), 500


