from flask import render_template, redirect, url_for, request, session, jsonify, send_file, send_from_directory
from app import db
from app.routes import fcm_bp
from app.models.models import db, User, UserHasToken
#from config import FCM_API_KEY

from flask_login import current_user, login_required, login_user, logout_user

import json
from gtts import gTTS
import os
import uuid
import io
from datetime import datetime, timedelta

import firebase_admin
from firebase_admin import credentials, messaging
from pyfcm import FCMNotification
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import atexit

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

# 토큰 저장 API
@fcm_bp.route('/save_token', methods=['POST'])
def save_token():
    fcm_token = request.json.get('fcm_token')
    google_id = request.json.get('google_id')
    
    if not fcm_token:
        return jsonify({'code': 400, 'msg': "토큰이 없습니다"})

    user = db.session.query(User).filter(User.google_id == google_id).first()
    
    if not user:
        return jsonify({'code': 404, 'msg': "사용자를 찾을 수 없습니다"})

    token_item = db.session.query(UserHasToken)\
                    .filter(UserHasToken.user_id == user.id)\
                    .filter(UserHasToken.token == fcm_token)\
                    .first() 
    
    if token_item is None:
        new_token_item = UserHasToken(
            user_id=user.id,
            token=fcm_token,
            is_message_allowed=True
        )
        db.session.add(new_token_item)
        db.session.commit()
        return jsonify({'code': 200, 'msg': "토큰이 성공적으로 저장되었습니다"})
    
    return jsonify({'code': 409, 'msg': "토큰이 이미 존재합니다"})


# FCM API 키 (Firebase Console에서 확인 가능)
push_service = FCMNotification(
        service_account_file='app/config/vocaandgo-firebase-adminsdk-xyi9u-e4f0ccc423.json',
        project_id='vocaandgo'
    )


# FCM 메시지 전송 함수
def send_push_notification(title, message, token):
    result = push_service.notify(fcm_token=token, 
                                notification_title=title, 
                                notification_body=message, 
                                notification_image=None
                            )

    return result


def send_fcm_message(app):
    with app.app_context():  # Flask 애플리케이션 컨텍스트 내에서 실행

        from app.models.models import db, User, UserHasToken, DailySentence

        today_kst = (datetime.utcnow() + timedelta(hours=9)).date()

        daily_sentence = db.session.query(DailySentence)\
                                    .filter(DailySentence.date == today_kst)\
                                    .first()

        title = '공부할 시간이야🐣 오늘의 문장🌱'
        message = daily_sentence.sentence + '\n' + daily_sentence.meaning

        try:
            tokens = db.session.query(UserHasToken)\
                                .filter(UserHasToken.is_message_allowed == True)\
                                .all()

            results = []
            for token in tokens:
                try:
                    result = send_push_notification(title, message, token.token)
                    results.append(result)
                except Exception as e:
                    print(f"Error sending to token {token.token}: {e}")
                    results.append({"error": str(e), "token": token.token})

            print("fcm success!")
            return json.dumps({"results": results}), 200
        except Exception as e:
            print("fcm failed : ", e)
            return json.dumps({"error": str(e)}), 500


# def create_scheduler(app):
#     lock_file = os.path.join(app.root_path, "scheduler.lock")
#     lock = FileLock(lock_file)
    
#     with lock:
#         if "scheduler" in app.config and app.config["scheduler"].running:
#             print("Existing scheduler found, stopping it to prevent duplicates.")
#             app.config["scheduler"].shutdown()
#             app.config["scheduler"] = None

#         scheduler = BackgroundScheduler()

#         # scheduler.add_job(lambda: send_fcm_message(app), CronTrigger(minute="30"))
#         scheduler.add_job(lambda: send_fcm_message(app), CronTrigger(hour=16, minute=15))
        
#         scheduler.start()
#         atexit.register(lambda: scheduler.shutdown())
#         app.config["scheduler"] = scheduler  # 스케줄러 인스턴스 저장
#         print("Scheduler started!")  # 스케줄러가 처음 시작될 때 로그 추가


def create_scheduler(app):
    scheduler = BackgroundScheduler()
    scheduler.add_job(lambda: send_fcm_message(app), CronTrigger(hour=16, minute=15))
    scheduler.start()
    atexit.register(lambda: scheduler.shutdown())
    return scheduler


@fcm_bp.route('/is_message_allowed', methods=['POST'])
def is_message_allowed():
    is_allowed = request.json.get('is_allowed')
    fcm_token = request.json.get('fcm_token')
    user_id = current_user.id

    user_has_token_item = UserHasToken.query\
                                    .filter(UserHasToken.user_id == user_id)\
                                    .filter(UserHasToken.token == fcm_token)\
                                    .first()

    user_has_token_item.is_message_allowed = is_allowed
    db.session.add(user_has_token_item)
    db.session.commit()

    return jsonify({'code': 200,'success': True}), 200
