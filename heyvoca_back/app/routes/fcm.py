import logging

from flask import render_template, redirect, url_for, request, session, jsonify, send_file, send_from_directory
from app import db
from app.routes import fcm_bp
from app.models.models import db, UserHasToken
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
from firebase_admin import exceptions as fb_exceptions
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import atexit

from flask import g
from app.utils.jwt_utils import jwt_required
from app.services.fcm_context import query_message_allowed_users, build_push_contexts
from app.services.fcm_messages import classify_user, select_message, URGENT_CATEGORIES

@fcm_bp.route('/fcm_html')
def fcm_html():
    return render_template('fcm3.html')


@fcm_bp.route('/firebase-messaging-sw.js')
def firebase_messaging_sw():
    return send_from_directory('static', 'firebase-messaging-sw.js')


@fcm_bp.route('/send_notification_test', methods=['POST'])
@jwt_required
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
        logging.getLogger(__name__).error('FCM 메시지 전송 오류', exc_info=True)
        return jsonify({'success': False, 'error': '서버 오류가 발생했습니다.'}), 500
    

import threading
@fcm_bp.route('/get_token', methods=['POST'])
@jwt_required
def get_token():
    # 인증된 사용자의 ID만 사용 (@jwt_required가 g.user_id 보장).
    # 클라이언트 body의 user_id 폴백은 IDOR 위험이라 제거.
    user_id = g.user_id
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


def _send_with_token_cleanup(title, body, token):
    """발송 + 무효 토큰이면 UserHasToken에서 삭제."""
    try:
        send_push_notification(title, body, token)
    except messaging.UnregisteredError:
        _delete_token(token)
    except fb_exceptions.InvalidArgumentError:
        _delete_token(token)
    except Exception:
        pass  # 일시 오류는 다음 cron에서 재시도


def _delete_token(token):
    try:
        UserHasToken.query.filter_by(token=token).delete()
        db.session.commit()
    except Exception:
        db.session.rollback()


def run_reminder(app, time_slot: str, urgent_only: bool = False):
    """학습 리마인더 푸시 발송.

    time_slot in {'1pm','4pm','9pm','11pm'}.
    urgent_only=True 면 streak_emergency / danger 카테고리만 발송 (스팸 방지).
    """
    with app.app_context():
        try:
            user_data = query_message_allowed_users()
            ctxs = build_push_contexts(user_data)
        except Exception as e:
            print(f"[FCM {time_slot}] context build failed:", e)
            return

        sent, skipped = 0, 0
        for user_id, ctx in ctxs.items():
            try:
                category = classify_user(ctx, time_slot)
            except Exception as e:
                print(f"[FCM {time_slot}] classify failed for {user_id}:", e)
                continue

            if urgent_only and category not in URGENT_CATEGORIES:
                skipped += 1
                continue

            try:
                title, body = select_message(category, time_slot, ctx)
            except Exception as e:
                print(f"[FCM {time_slot}] select failed for {user_id}:", e)
                continue

            for token in ctx.get('tokens') or []:
                _send_with_token_cleanup(title, body, token)
            sent += 1

        print(f"[FCM {time_slot}] sent={sent} skipped={skipped} urgent_only={urgent_only}")


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
    KST = 'Asia/Seoul'
    # 고정 발송: 오후 1시 / 저녁 9시 — 사용자 상태에 맞춰 카테고리 분기
    scheduler.add_job(lambda: run_reminder(app, '1pm'),
                      CronTrigger(hour=13, minute=0, timezone=KST))
    scheduler.add_job(lambda: run_reminder(app, '9pm'),
                      CronTrigger(hour=21, minute=0, timezone=KST))
    # 긴급 추가 발송: 16시(복습 20개↑) / 23시(streak 끊김 임박) — 해당 사용자에게만
    scheduler.add_job(lambda: run_reminder(app, '4pm', urgent_only=True),
                      CronTrigger(hour=16, minute=0, timezone=KST))
    scheduler.add_job(lambda: run_reminder(app, '11pm', urgent_only=True),
                      CronTrigger(hour=23, minute=0, timezone=KST))

    # Phase 2.1 — 문제 유형별 정답률 30일 집계 (매일 04:00 KST)
    def _refresh_qstat():
        from jobs.refresh_question_type_stats import run as _run_refresh
        with app.app_context():
            _run_refresh()

    scheduler.add_job(
        _refresh_qstat,
        CronTrigger(hour=4, minute=0, timezone='Asia/Seoul'),
        id='refresh_qstat',
    )

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
