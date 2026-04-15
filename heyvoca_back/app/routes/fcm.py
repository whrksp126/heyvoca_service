from flask import render_template, redirect, url_for, request, session, jsonify, send_file, send_from_directory
from app import db
from app.routes import fcm_bp
from app.models.models import db, User, UserHasToken, UserVoca, DailySentence
from sqlalchemy import func
#from config import FCM_API_KEY

# from flask_login import current_user, login_required, login_user, logout_user

import json
from gtts import gTTS
import os
import uuid
import io
from datetime import datetime, timedelta
from uuid import UUID

import firebase_admin
from firebase_admin import credentials, messaging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import atexit
import random

from flask import g
from app.utils.jwt_utils import jwt_required

@fcm_bp.route('/fcm_html')
def fcm_html():
    return render_template('fcm3.html')


@fcm_bp.route('/firebase-messaging-sw.js')
def firebase_messaging_sw():
    return send_from_directory('static', 'firebase-messaging-sw.js')


@fcm_bp.route('/send_notification_test', methods=['POST'])
def send_notification_test():
    data = request.json
    token = data.get('token')
    message_body = data.get('message')

    # 메시지 구성
    message = messaging.Message(
        notification=messaging.Notification(
            title='Hello',
            body=message_body,
        ),
        token=token,
    )

    # 메시지 전송
    try:
        response = messaging.send(message)
        return jsonify({'success': True, 'message_id': response}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    

import threading
@fcm_bp.route('/get_token', methods=['POST'])
def get_token():
    # 인증된 사용자라면 사용자 ID 기반으로 토큰 생성
    user_id = request.json.get('user_id')
    registration_token = request.json.get('token')

    message = messaging.Message(
        notification=messaging.Notification(
            title='Hello!',
            body='This is a test message.'
        ),
        token=registration_token,
    )

    response = messaging.send(message)

    # 5초 후에 FCM 메시지를 보내기 위한 타이머 설정
    timer = threading.Timer(10.0, send_fcm, [message])
    timer.start()

    return jsonify({"status": "success", "response": response})

def send_fcm(message):
    # 실제로 FCM 메시지를 보내는 함수
    try:
        response = messaging.send(message)
        print("Successfully sent message:", response)
    except Exception as e:
        print("Error sending message:", e)




########################

# 토큰 저장 및 업데이트 API
@fcm_bp.route('/save_token', methods=['POST'])
@jwt_required
def save_token():
    fcm_token = request.json.get('fcm_token')
    
    if not fcm_token:
        return jsonify({'code': 400, 'msg': "토큰이 없습니다"})

    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({'code': 401, 'msg': "로그인이 필요합니다."})

    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id

    token_item = db.session.query(UserHasToken)\
                    .filter(UserHasToken.user_id == user_uuid)\
                    .filter(UserHasToken.token == fcm_token)\
                    .first() 
    
    if token_item is None:
        new_token_item = UserHasToken(
            user_id=user_uuid,
            token=fcm_token,
            is_message_allowed=True,
            is_marketing_allowed=False
        )
        db.session.add(new_token_item)
        db.session.commit()
        return jsonify({'code': 200, 'msg': "토큰이 성공적으로 저장되었습니다"})
    
    return jsonify({'code': 200, 'msg': "토큰이 이미 존재합니다"})


# 토큰 삭제 API (로그아웃 시)
@fcm_bp.route('/delete_token', methods=['POST'])
@jwt_required
def delete_token():
    fcm_token = request.json.get('fcm_token')
    
    if not fcm_token:
        return jsonify({'code': 400, 'msg': "토큰이 없습니다"})

    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({'code': 401, 'msg': "로그인이 필요합니다."})

    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id

    token_item = db.session.query(UserHasToken)\
                    .filter(UserHasToken.user_id == user_uuid)\
                    .filter(UserHasToken.token == fcm_token)\
                    .first() 
    
    if token_item:
        db.session.delete(token_item)
        db.session.commit()
        return jsonify({'code': 200, 'msg': "토큰이 성공적으로 삭제되었습니다"})
    
    return jsonify({'code': 404, 'msg': "토큰을 찾을 수 없습니다"})


# FCM API 키 (Firebase Console에서 확인 가능)
if not firebase_admin._apps:
    import os
    # app/routes/ 디렉토리에 있는 새 키 파일 이름으로 경로 지정
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # => heyvoca_back/app
    cred_path = os.path.join(base_dir, 'routes', 'heyvoca-466916-e70bf3dad372.json')
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)


# FCM 메시지 전송 함수
def send_push_notification(title, message, token):
    try:
        msg = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=message,
            ),
            # iOS 전용 설정 추가 (소리 및 백그라운드 활성화)
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound='default',
                        content_available=True,
                        badge=1
                    ),
                ),
            ),
            token=token,
        )
        result = messaging.send(msg)
        return result
    except Exception as e:
        raise e


def get_review_count(user_id):
    """사용자별 오늘 복습해야 할 단어 수를 반환합니다."""
    today_kst = (datetime.utcnow() + timedelta(hours=9)).date()
    today_str = today_kst.strftime('%Y-%m-%d')
    
    # UserVoca.data (TEXT) 내의 nextReview 필드를 추출하여 오늘 날짜와 비교
    count = db.session.query(UserVoca.id).filter(
        UserVoca.user_id == user_id,
        func.json_extract(UserVoca.data, '$.nextReview').isnot(None),
        func.json_unquote(func.json_extract(UserVoca.data, '$.nextReview')) <= today_str
    ).count()
    
    return count


def send_study_reminder_1pm(app):
    with app.app_context():
        today_kst = (datetime.utcnow() + timedelta(hours=9)).date()
        daily_sentence = db.session.query(DailySentence)\
                                    .filter(DailySentence.date == today_kst)\
                                    .first()

        try:
            # 알림 허용된 유저와 그들의 정보(이름 포함)를 가져오기 (사용자별 그룹화)
            tokens_query = db.session.query(UserHasToken, User.name)\
                                .join(User, UserHasToken.user_id == User.id)\
                                .filter(UserHasToken.is_message_allowed == True)\
                                .all()
            
            # 사용자별로 데이터 그룹화 {user_id: {'name': name, 'tokens': [tokens]}}
            user_data = {}
            for t, name in tokens_query:
                if t.user_id not in user_data:
                    user_data[t.user_id] = {'name': name, 'tokens': []}
                user_data[t.user_id]['tokens'].append(t.token)

            for user_id, info in user_data.items():
                review_count = get_review_count(user_id)
                user_name = info['name']
                tokens = info['tokens']
                
                # 다이나믹 타이틀 후보군
                titles = [
                    f"{user_name}님, 가볍게 머리 식힐 시간이에요! 🍰",
                    "단어 배달 왔습니다! 점심은 맛있게 드셨나요? �",
                    "헤이보카랑 잠깐 대화하실래요? 😊"
                ]
                if review_count > 0:
                    titles.append(f"지금 복습하면 딱 좋은 {review_count}개의 단어! 📚")
                    title = random.choice(titles)
                else:
                    title = random.choice(titles[:3]) # 복습 단어 없을 때

                if review_count > 0:
                    message = f"오늘 복습할 단어가 {review_count}개 있어요! 지금 가볍게 3분만 살펴볼까요? ✨"
                elif daily_sentence:
                    message = f"오늘의 문장: {daily_sentence.sentence}\n{daily_sentence.meaning}\n잠깐 짬을 내어 읽어보세요!"
                else:
                    message = "조금씩 꾸준히! 오늘 단어 학습을 시작해주세요~"

                for token in tokens:
                    try:
                        send_push_notification(title, message, token)
                    except Exception:
                        pass
            
            # print(f"1 PM fcm success for {len(user_data)} users!")
            pass
        except Exception as e:
            print("1 PM fcm failed : ", e)


def send_study_reminder_9pm(app):
    with app.app_context():
        try:
            # 알림 허용된 유저와 그들의 정보(이름 포함)를 가져오기 (사용자별 그룹화)
            tokens_query = db.session.query(UserHasToken, User.name)\
                                .join(User, UserHasToken.user_id == User.id)\
                                .filter(UserHasToken.is_message_allowed == True)\
                                .all()
            
            user_data = {}
            for t, name in tokens_query:
                if t.user_id not in user_data:
                    user_data[t.user_id] = {'name': name, 'tokens': []}
                user_data[t.user_id]['tokens'].append(t.token)

            for user_id, info in user_data.items():
                review_count = get_review_count(user_id)
                user_name = info['name']
                tokens = info['tokens']
                
                # 다이나믹 타이틀 후보군
                titles = [
                    f"오늘 하루도 수고 많으셨어요, {user_name}님! 🌙",
                    "내일의 나를 위한 1분, 복습 시작할까요? 🔥",
                    "헤이보카에서 공부의 마무리를 지어보세요! 👏"
                ]
                if review_count > 0:
                    titles.append(f"단어 {review_count}개만 더 외우고 푹 쉬어요! 🛏️")
                    title = random.choice(titles)
                else:
                    title = random.choice(titles[:3])

                if review_count > 0:
                    message = f"앗, 아직 오늘 복습할 단어가 {review_count}개 남았어요! 잊기 전에 쓱 훑어보고 주무세요! 🔥"
                else:
                    message = "오늘 학습을 모두 마치셨군요! 수고하셨습니다. 내일도 함께해요! 👏"

                for token in tokens:
                    try:
                        send_push_notification(title, message, token)
                    except Exception:
                        pass
            
            # print(f"9 PM fcm success for {len(user_data)} users!")
            pass
        except Exception as e:
            print("9 PM fcm failed : ", e)



def create_scheduler(app):
    # Gunicorn 다중 워커 환경에서 스케줄러 중복 실행 방지를 위한 소켓 락 사용
    import socket
    try:
        # 특정 포트를 바인딩하여 락 확보 시도 (사용되지 않는 높은 번호 포트 선택)
        _lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _lock_socket.bind(('127.0.0.1', 5999))
        # 소켓 객체를 전역 또는 어딘가에 유지하여 가비지 컬렉션(GC)되지 않게 함
        app.config['SCHEDULER_LOCK_SOCKET'] = _lock_socket
    except socket.error:
        # 이미 포트가 사용 중이면 다른 워커가 실행 중인 것으로 판단
        print("  -> FCM 스케줄러가 이미 다른 프로세스에서 실행 중입니다. (Socket Lock)")
        return None

    scheduler = BackgroundScheduler()
    # 사용자 요청 반영: 오후 1시(13:00)와 저녁 9시(21:00) 발송
    scheduler.add_job(lambda: send_study_reminder_1pm(app), CronTrigger(hour=13, minute=0))
    scheduler.add_job(lambda: send_study_reminder_9pm(app), CronTrigger(hour=21, minute=0))

    scheduler.start()

    atexit.register(lambda: scheduler.shutdown())
    # print("  => FCM 스케줄러가 이 프로세스(PID: {})에서 성공적으로 시작되었습니다.".format(os.getpid()))
    return scheduler


@fcm_bp.route('/admin/send_marketing', methods=['POST'])
def send_marketing():
    # 마케팅 푸시 테스트를 위한 관리자 API
    title = request.json.get('title', '깜짝 혜택 도착! 🎁')
    message = request.json.get('message', '지금 접속해서 혜택을 확인해보세요!')
    
    tokens = db.session.query(UserHasToken)\
                        .filter(UserHasToken.is_marketing_allowed == True)\
                        .all()

    results = []
    for token in tokens:
        try:
            res = send_push_notification(title, message, token.token)
            results.append(res)
        except Exception as e:
            results.append({"error": str(e), "token": token.token})

    return jsonify({"code": 200, "success": True, "results": results}), 200


@fcm_bp.route('/is_message_allowed', methods=['POST'])
@jwt_required
def is_message_allowed():
    is_study_allowed = request.json.get('is_study_allowed')
    is_marketing_allowed = request.json.get('is_marketing_allowed')
    fcm_token = request.json.get('fcm_token')
    user_id = getattr(g, 'user_id', None)

    if not user_id or not fcm_token:
        return jsonify({'code': 400, 'msg': "잘못된 요청입니다"}), 400
    
    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id

    user_has_token_item = UserHasToken.query\
                                    .filter(UserHasToken.user_id == user_uuid)\
                                    .filter(UserHasToken.token == fcm_token)\
                                    .first()

    if user_has_token_item:
        if is_study_allowed is not None:
            user_has_token_item.is_message_allowed = is_study_allowed
        if is_marketing_allowed is not None:
            user_has_token_item.is_marketing_allowed = is_marketing_allowed
            
        db.session.commit()
        return jsonify({'code': 200,'success': True}), 200
        
    return jsonify({'code': 404, 'msg': "토큰을 찾을 수 없습니다"}), 404


@fcm_bp.route('/get_notification_settings', methods=['POST'])
@jwt_required
def get_notification_settings():
    fcm_token = request.json.get('fcm_token')
    user_id = getattr(g, 'user_id', None)

    if not user_id or not fcm_token:
        return jsonify({'code': 400, 'msg': "잘못된 요청입니다"}), 400

    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
    user_has_token_item = UserHasToken.query\
                                    .filter(UserHasToken.user_id == user_uuid)\
                                    .filter(UserHasToken.token == fcm_token)\
                                    .first()

    if user_has_token_item:
        return jsonify({
            'code': 200,
            'is_study_allowed': user_has_token_item.is_message_allowed,
            'is_marketing_allowed': user_has_token_item.is_marketing_allowed
        }), 200
        
    return jsonify({'code': 404, 'msg': "토큰을 찾을 수 없습니다"}), 404
