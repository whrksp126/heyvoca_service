from flask import render_template, redirect, url_for, request, session, jsonify, g
from app import db
from app.routes import mainpage_bp
from app.utils.jwt_utils import jwt_required
from uuid import UUID
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy, RecentStudyType, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, UserVocaBook, Bookstore, Product, GemReason
from app.routes.common import register_gem_log
from datetime import datetime, timedelta
from sqlalchemy import func, and_
from sqlalchemy.orm import aliased
from sqlalchemy.exc import IntegrityError

import io
import json

import random



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
        # 오늘 날짜인 경우 체크인이 없어도 출석한 것으로 표시
        # (이 API를 호출했다는 것 자체가 접속을 의미하므로)
        is_today = (d == today)
        # 체크인 레코드가 있거나 오늘 날짜면 출석으로 처리
        attend = bool(ci) or is_today
        data.append({
            'date': days[i],
            'attend': attend,
            'daily_mission': bool(ci.today_study_complete) if ci else False,
        })

    return {'code' : 200, 'data' : data}


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
    data = request.json
    today_study_complete = data['today_study_complete']
    correct_cnt = int(data.get('correct_cnt') or 0)
    incorrect_cnt = int(data.get('incorrect_cnt') or 0)

    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환

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
        
        # checkin이 없으면 생성
        if not checkin:
            checkin = CheckIn(
                user_id=user_id,
                attendence_date=today,
                today_study_complete=True
            )
            db.session.add(checkin)
            is_today_study_complete = True
        elif checkin.today_study_complete == False:
            is_today_study_complete = True
            checkin.today_study_complete = True

    # 4. 업적(암기왕, 노력왕, 끈기왕) 업데이트
    # 암기왕: 만점일 때만 업데이트 (모든 문제를 맞췄을 때만)
    total_cnt = correct_cnt + incorrect_cnt
    is_perfect_score = (incorrect_cnt == 0 and total_cnt > 0)  # 만점인지 확인
    
    memory_goal_complete, memory_goal_reward_count, memory_goal_badge_img, memory_goal_level = None, None, None, None
    if is_perfect_score:
        # 만점일 때만 암기왕 업적 업데이트
        memory_goal_complete, memory_goal_reward_count, memory_goal_badge_img, memory_goal_level = update_user_goal('암기왕')
    
    # 노력왕: 문제를 풀었으면 업데이트
    effort_goal_complete, effort_goal_reward_count, effort_goal_badge_img, effort_goal_level = None, None, None, None
    if total_cnt > 0:
        effort_goal_complete, effort_goal_reward_count, effort_goal_badge_img, effort_goal_level = update_user_goal('노력왕')

    # 끈기왕: 오늘 처음으로 학습을 완료했을 때만 업데이트
    perseverance_goal_complete, perseverance_goal_reward_count, perseverance_goal_badge_img, perseverance_goal_level = None, None, None, None
    if is_today_study_complete:
        today = (datetime.utcnow() + timedelta(hours=9)).date()
        yesterday = today - timedelta(days=1)
        yesterday_checkin = db.session.query(CheckIn)\
                                .filter(CheckIn.user_id == user_id)\
                                .filter(CheckIn.attendence_date == yesterday)\
                                .first()
        
        # 어제 학습을 완료했는지 확인
        if yesterday_checkin and yesterday_checkin.today_study_complete:
            # 어제도 완료했으면 연속 성공
            per_goal_done, per_reward, per_badge, per_lv = update_user_goal('끈기왕')
            perseverance_goal_complete, perseverance_goal_reward_count, perseverance_goal_badge_img, perseverance_goal_level = per_goal_done, per_reward, per_badge, per_lv
        else:
            # 연속 끊김 -> 끈기왕 진행 상태를 오늘부터 다시 1일로 리셋
            reset_goal = db.session.query(UserGoals)\
                                .join(Goals, UserGoals.goal_id == Goals.id)\
                                .join(GoalType, Goals.type_id == GoalType.id)\
                                .filter(UserGoals.user_id == user_id)\
                                .filter(GoalType.type == '끈기왕')\
                                .filter(UserGoals.is_completed == False)\
                                .first()
            if reset_goal:
                reset_goal.current_value = 1
            else:
                # 진행 중인 목표가 없는 경우(첫 시작 등) 0에서 1로 만들어주기 위해 update_user_goal 호출
                # 다만 update_user_goal은 current_value를 1 증가시키므로, 
                # 처음 시작하는 유저라면 current_value가 1이 됨.
                # reset_goal이 없다는 건 아예 레코드가 없거나 다 완료했다는 뜻.
                # update_user_goal 내부에서 레코드가 없으면 생성하고 +1 함.
                update_user_goal('끈기왕')

    # 5. 보석 업데이트 (오늘의 학습 완료 보석만 추가, 업적 보상은 update_user_goal에서 처리)
    add_gem = 0
    if is_today_study_complete:
        add_gem += 1
    # 업적 보상 보석은 update_user_goal 함수 내부에서 이미 지급됨
    user.gem_cnt += add_gem

    db.session.commit()

    goals = []
    if memory_goal_complete:
        goals.append({
            'name' : '암기왕',
            'type' : '암기왕',
            'level' : memory_goal_level,
            'badge_img' : memory_goal_badge_img,
            'completed_at' : memory_goal_complete.completed_at + timedelta(hours=9),
        })
    if effort_goal_complete:
        goals.append({
            'name' : '노력왕',
            'type' : '노력왕',
            'level' : effort_goal_level,
            'badge_img' : effort_goal_badge_img,
            'completed_at' : effort_goal_complete.completed_at + timedelta(hours=9),
        })
    if perseverance_goal_complete:
        goals.append({
            'name' : '끈기왕',
            'type' : '끈기왕',
            'level' : perseverance_goal_level,
            'badge_img' : perseverance_goal_badge_img,
            'completed_at' : perseverance_goal_complete.completed_at + timedelta(hours=9),
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
@jwt_required
def checkin():
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
    today = (datetime.utcnow() + timedelta(hours=9)).date()
    
    # 먼저 체크인 존재 여부 확인
    exists = db.session.query(CheckIn)\
                .filter(CheckIn.user_id == user_id)\
                .filter(CheckIn.attendence_date == today)\
                .first()
    
    goals = []
    before_gem_cnt = 0
    after_gem_cnt = 0
    user = db.session.query(User).filter(User.id == user_id).first()
    
    if not exists:
        try:
            # 1. 체크인 생성 시도
            new_checkin = CheckIn(user_id=user_id, attendence_date=today, today_study_complete=False)
            db.session.add(new_checkin)
            db.session.flush()

            # --- 업적 업데이트 ---
            # 2. 출석왕 업데이트
            attendance_goal_complete, attendance_goal_reward_count, attendance_goal_badge_img, attendance_goal_level = update_user_goal('출석왕')
            if attendance_goal_complete:
                goals.append({
                    'name' : '출석왕',
                    'type' : '출석왕',
                    'level' : attendance_goal_level,
                    'badge_img' : attendance_goal_badge_img,
                    'completed_at' : attendance_goal_complete.completed_at + timedelta(hours=9),
                })

            db.session.commit()
            
            # 사용자 정보 최신화 (업적 보상 반영됨)
            user = db.session.query(User).filter(User.id == user_id).first()
            before_gem_cnt = user.gem_cnt - (attendance_goal_reward_count or 0)
            after_gem_cnt = user.gem_cnt

        except IntegrityError:
            db.session.rollback()
            # 이미 다른 세션에서 생성된 경우
            user = db.session.query(User).filter(User.id == user_id).first()
            before_gem_cnt = user.gem_cnt
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


@mainpage_bp.route('/today_study_recommend', methods=['GET'])
@jwt_required
def api_today_study_recommend():
    word_count = request.args.get('word_count', 10, type=int)
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환

    uvb = aliased(UserVocaBook)

    # 유저가 가진 단어 제외 (origin 배열 기준 정확 매칭)
    json_origin_arr = func.json_extract(func.coalesce(uvb.voca_list, '[]'), '$[*].origin')
    not_owned = ~db.session.query(uvb.id).filter(
        uvb.user_id == user_id,
        func.json_contains(json_origin_arr, func.json_quote(Voca.word)) == 1
    ).exists()

    # 피벗 스캔 + 단어 id 확보
    min_id, max_id = db.session.query(func.min(Voca.id), func.max(Voca.id)).one()

    pivot = random.randint(int(min_id), int(max_id))

    # 오버샘플 팩터: 중복/필터 손실 고려해서 넉넉히
    oversample = max(6, word_count // 2)
    target = word_count * oversample

    # 1차: pivot 이상에서 voca_id만 수집
    ids_head = (
        db.session.query(Voca.id)
        .filter(not_owned, Voca.id >= pivot)
        .limit(target)
        .all()
    )
    ids = [i[0] for i in ids_head]

    # 부족하면 pivot 미만에서 보충
    if len(ids) < target:
        need = target - len(ids)
        ids_tail = (
            db.session.query(Voca.id)
            .filter(not_owned, Voca.id < pivot)
            .limit(need)
            .all()
        )
        ids += [i[0] for i in ids_tail]

    # 중복 제거
    uniq_ids = []
    voca_set = set()
    for vid in ids:
        if vid not in voca_set:
            voca_set.add(vid)
            uniq_ids.append(vid)
        if len(uniq_ids) == target:
            break

    # 최종 단어 조회
    # ---> 받을 단어 dict 만 확인해서 변경하기!!!!!
    # 1) 단어별로 book_id 하나만 선택하는 서브쿼리 (MIN 사용)
    book_pick_subq = (
        db.session.query(
            VocaBookMap.voca_id.label('v_id'),
            func.min(VocaBookMap.book_id).label('book_id')
        )
        .filter(VocaBookMap.voca_id.in_(uniq_ids))
        .group_by(VocaBookMap.voca_id)
        .subquery()
    )

    # 2) Voca 상세 + 선택된 book_id 조인 후, 최종 word_count개만 반환
    rows = (
        db.session.query(
            Voca.id.label('word_id'),
            Voca.word.label('word'),                # 네 모델에서 단어 문자열 컬럼명 (예: word/origin 등)
            Voca.pronunciation.label('pronunciation'),
            Voca.meanings.label('meanings'),        # JSON/Text라면 그대로 전달하거나 json.loads 처리
            Voca.examples.label('examples'),        # 예문(리스트/JSON/Text) 컬럼
            book_pick_subq.c.book_id.label('bookstore_id')
        )
        .join(book_pick_subq, book_pick_subq.c.v_id == Voca.id)
        .limit(word_count)
        .all()
    )

    # 3) API 응답 포맷 구성
    data = []
    for r in rows:
        data.append({
            'word_id': r.word_id,
            'bookstore_id': r.store_id if hasattr(r, 'store_id') else r.bookstore_id,  # 네 컬럼명에 맞춰 조정
            'word': r.word,
            'pronunciation': r.pronunciation,
            'meanings': r.meanings,
            'examples': r.examples
        })

    return {'code': 200, 'data': data}


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
        return jsonify({
            'code': 500,
            'message': f'서버 오류가 발생했습니다: {str(e)}'
        }), 500


