from flask import render_template, redirect, url_for, request, session, jsonify, g, make_response
from functools import wraps
from app import db
from app.routes import auth_bp
from app.models.models import User, Bookstore, GoalType, UserGoals, Goals, InviteMap, GemReason, UserHasToken, CheckIn, UserRecentStudy, UserVocaBook, Purchase, GemLog, UserVoca, UserVocaBookMap
from app.routes.mainpage import update_user_goal
from app.routes.common import register_gem_log
from app.utils.jwt_utils import jwt_required, generate_access_token, generate_refresh_token, verify_refresh_token
from uuid import UUID

from flask_login import current_user, login_required, login_user, logout_user
import requests

from werkzeug.security import generate_password_hash, check_password_hash

import io
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaFileUpload, MediaIoBaseDownload
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from urllib.parse import urlencode

from requests_oauthlib import OAuth2Session
from jwt import PyJWKClient
from config import GOOGLE_WEB_CLIENT_ID, ACCESS_SECRET, REFRESH_SECRET, OAUTH_CLIENT_SECRET, FRONT_END_URL

from dotenv import load_dotenv
import os, time, jwt
from datetime import datetime, timedelta, timezone

# -------------------
# 환경 변수 & 기본값
# -------------------
# UTC+9 (Asia/Seoul) 기준 타임스탬프
KST = timezone(timedelta(hours=9))

# # ## 구글 로그인(앱) ##
# # # access, refresh 백엔드 처리
@auth_bp.route('/google/oauth/app', methods=['POST'])
def google_oauth_app():
    data = request.json
    id_token = data.get('id_token')
    google_id = data.get('google_id')
    email = data.get('email')
    name = data.get('name')

    try:
        try:
            # 1-2) 구글 토큰 검증
            req = google_requests.Request()

            # 3) 페이로드 추출
            payload = google_id_token.verify_oauth2_token(
                id_token, req, audience=GOOGLE_WEB_CLIENT_ID
            )
        except Exception as e:
            return jsonify({'code': 400, 'message': 'Google 토큰 검증 실패'}), 400

        # 4) 사용자 조회 또는 생성
        google_sub = payload.get("sub")         # Google 고유 ID
        email = payload.get("email")
        name = payload.get("name")

        if not email or not google_sub:
            return jsonify({'code': 400, 'message': 'Google 토큰에 email 또는 sub(google_id)가 없습니다.'}), 400

        # 4-1) 사용자 정보 확인
        user = User.query.filter_by(email=email).first()
        if user is None:
            # 사용자가 존재하지 않으면 회원가입 처리 (신규 생성)
            user = User(
                level_id=None,
                email = email,
                google_id = google_id,
                username = None,
                name = name,
                phone = None,
                refresh_token = '',
                code = '',
                book_cnt = 3,
                gem_cnt = 0,
                set_goal_cnt = 3,
                last_logged_at = None
            )
            db.session.add(user)
            try:
                db.session.commit()
            except:
                db.session.rollback()
                return jsonify({'code': 400, 'message': '사용자 저장 중 에러'}), 400
        
        # 5) JWT 발급
        access_token = generate_access_token(user.id, user.email)
        refresh_token = generate_refresh_token(user.id, user.email)

        # 5) Refresh Token DB 저장 (UPDATE)
        user.refresh_token = refresh_token
        # user.last_logged_at = datetime.now(tz=KST)
        db.session.add(user)
        db.session.commit()

        # 6) 응답 생성 - accessToken은 JSON으로, refreshToken은 httponly 쿠키로
        response = make_response(jsonify({
            "code": 200,
            "status": "success",
            "accessToken": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": getattr(user, "name", None),
            }
        }), 200)
        
        # refreshToken을 httponly 쿠키로 설정
        # local 환경만 HTTP, 나머지(development, staging, production)는 HTTPS
        is_local = os.getenv('FLASK_CONFIG') == 'local'
        response.set_cookie(
            'refresh_token',
            refresh_token,
            httponly=True,  # JavaScript에서 접근 불가 (보안 강화)
            secure=not is_local,  # local이 아니면 HTTPS 사용
            samesite='Lax',
            max_age=60*60*24*30  # 30일
        )
        
        return response

    except Exception as e:
        print('== login_google 에러 == ', e)
        return jsonify({'code': 400, 'message': '로그인 처리 오류'}), 400


# --------------------------------------------------------------------------------
# Apple 로그인 (앱)
# --------------------------------------------------------------------------------
@auth_bp.route('/apple/oauth/app', methods=['POST'])
def apple_oauth_app():
    try:
        data = request.json
        identity_token = data.get('identityToken')
        full_name = data.get('fullName')  # 선택적 (최초 로그인 시에만 올 수 있음)
        # full_name 예: {'givenName': 'Gildong', 'familyName': 'Hong'}
        # email = data.get('email') # identityToken에서 추출하는 것이 더 안전함

        if not identity_token:
            return jsonify({'code': 400, 'message': 'identityToken이 없습니다.'}), 400

        # 1. Apple Public Keys로 서명 검증 & 페이로드 디코딩
        #    audience는 앱의 Bundle ID임. 검증하려면 환경변수나 하드코딩 필요.
        #    여기서는 verify=True하되 audience는 옵션으로 처리 (환경변수 권장)
        apple_client_id = os.getenv('APPLE_CLIENT_ID') # Bundle ID
        
        jwks_client = PyJWKClient("https://appleid.apple.com/auth/keys")
        signing_key = jwks_client.get_signing_key_from_jwt(identity_token)
        
        decode_options = {"verify_exp": True}
        if apple_client_id:
            decode_options["verify_aud"] = True
            audience = apple_client_id
        else:
            decode_options["verify_aud"] = False # Client ID 미설정 시 Audience 검증 스킵
            audience = None

        payload = jwt.decode(
            identity_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            options=decode_options
        )

        # 2. 정보 추출
        apple_sub = payload.get('sub') # Apple 고유 User ID
        email = payload.get('email')
        
        if not apple_sub:
            return jsonify({'code': 400, 'message': '유효하지 않은 토큰(sub 누락)'}), 400

        # 3. 사용자 조회 (apple_id 우선, 없으면 email 체크)
        user = User.query.filter_by(apple_id=apple_sub).first()
        
        if user is None and email:
             # 기존에 같은 이메일로 가입된 유저가 있는지 확인 (Google 등)
             user = User.query.filter_by(email=email).first()
             if user:
                 # 기존 유저가 있으면 연동 (apple_id 업데이트)
                 user.apple_id = apple_sub
                 db.session.commit()

        if user is None:
            # 4. 신규 가입
            # 이름 처리: 클라이언트에서 받은 fullName 사용 또는 이메일 앞부분 등 사용
            name_str = "Apple User"
            if full_name:
                 # full_name이 dict인지 string인지 체크 (클라이언트 구현에 따라 다름)
                 # 보통 { givenName: ..., familyName: ... }
                 given = full_name.get('givenName', '')
                 family = full_name.get('familyName', '')
                 if given or family:
                    name_str = f"{family}{given}".strip()
            elif email:
                 name_str = email.split('@')[0]

            user = User(
                level_id=None,
                email = email if email else f"{apple_sub}@privaterelay.appleid.com", # 이메일 비공개 시 가짜 이메일 생성
                google_id = None, # Apple 로그인이므로 Null
                apple_id = apple_sub,
                username = None,
                name = name_str,
                phone = None,
                refresh_token = '',
                code = '',
                book_cnt = 3,
                gem_cnt = 0,
                set_goal_cnt = 3,
                last_logged_at = datetime.now(tz=KST)
            )
            db.session.add(user)
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"Apple User Creation Error: {e}")
                return jsonify({'code': 400, 'message': '사용자 생성 실패'}), 400

        # 5. 토큰 발급
        access_token = generate_access_token(user.id, user.email)
        refresh_token = generate_refresh_token(user.id, user.email)

        user.refresh_token = refresh_token
        # user.last_logged_at = datetime.now(tz=KST)
        db.session.add(user)
        db.session.commit()

        # 6. 응답
        response = make_response(jsonify({
            "code": 200,
            "status": "success",
            "accessToken": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": getattr(user, "name", None),
            }
        }), 200)

        is_local = os.getenv('FLASK_CONFIG') == 'local'
        response.set_cookie(
            'refresh_token',
            refresh_token,
            httponly=True,
            secure=not is_local,
            samesite='Lax',
            max_age=60*60*24*30
        )
        return response

    except jwt.ExpiredSignatureError:
        return jsonify({'code': 401, 'message': '토큰이 만료되었습니다.'}), 401
    except jwt.InvalidTokenError as e:
        print(f"Invalid Token: {e}")
        return jsonify({'code': 401, 'message': '유효하지 않은 토큰입니다.'}), 401
    except Exception as e:
        print(f"Apple Login Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'code': 500, 'message': '서버 오류'}), 500


# 로그인 라우트: 구글 OAuth2 인증 요청
@auth_bp.route('/google/oauth/web')
def google_oauth_web():
    print('/google')
    device_type = request.args.get('device_type', 'web')
    session['device_type'] = device_type
    # OAuth2Session 생성
    oauth = OAuth2Session(
        GOOGLE_WEB_CLIENT_ID, 
        scope=[
            'https://www.googleapis.com/auth/userinfo.profile', 
            'https://www.googleapis.com/auth/userinfo.email', 
            'openid',
        ],
        redirect_uri= request.host_url.rstrip('/') + '/auth/google/oauth/web/callback'
    )
    print('oauth:', oauth)


    # 인증 요청을 생성합니다.
    authorization_url, state = oauth.authorization_url(
        'https://accounts.google.com/o/oauth2/auth',
        access_type="offline",
        prompt="consent"
    )

    print('authorization_url:', authorization_url)

    # 상태(state)를 세션에 저장
    session['oauth_state'] = state

    print('state:', state)

    return redirect(authorization_url)


# 인증 콜백 라우트: OAuth2 인증 완료 후 실행
@auth_bp.route('/google/oauth/web/callback')
def google_oauth_web_callback():
    print('/google/web/callback')
    state = session.pop('oauth_state', None)
    authorization_response = request.url
    if state is None or state != request.args.get('state'):
        return 'Invalid OAuth state', 400

    oauth = OAuth2Session(
        GOOGLE_WEB_CLIENT_ID,
        redirect_uri= request.host_url.rstrip('/') + '/auth/google/oauth/web/callback',
        state=state,
        scope=[
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'openid',
        ]
    )
    try:
        token = oauth.fetch_token(
            'https://accounts.google.com/o/oauth2/token',
            authorization_response=authorization_response,
            client_secret=OAUTH_CLIENT_SECRET
        )
        userinfo = oauth.get('https://www.googleapis.com/oauth2/v1/userinfo').json()
    except Exception as e:
        print(f"Error during token fetch or userinfo fetch: {str(e)}")
        return f"An error occurred: {str(e)}", 500

    print('token:', token)
    print('userinfo:', userinfo)

    # 사용자 정보를 프론트엔드로 전달 (쿼리스트링)
    front_end_url = f'{FRONT_END_URL}/login'  # 프론트에서 이 경로에서 처리하도록 맞춰야 함
    query_params = {
        'googleId': userinfo.get('id'),
        'email': userinfo.get('email'),
        'name': userinfo.get('name', ''),
        'type': 'web',
        'status': 200
    }
    redirect_url = f"{front_end_url}?{urlencode(query_params)}"
    return redirect(redirect_url)

# 앱 로그인 처리
@auth_bp.route('/google/oauth/app/callback', methods=['POST'])
def google_app_callback():
    data = request.json
    google_id = data.get('google_id')
    access_token = data.get('access_token')
    refresh_token = data.get('refresh_token')
    email = data.get('email')
    name = data.get('name')

    # 사용자 정보 확인
    user = User.query.filter_by(google_id=google_id).first()
    if user is None:
        # 사용자가 존재하지 않으면 회원가입 처리
        user = User(
            level_id=None,
            email = email,
            google_id = google_id,
            username = None,
            name = name,
            phone = None,
            refresh_token = refresh_token or '',
            code = '',
            book_cnt = 3,
            gem_cnt = 0,
            set_goal_cnt = 3,
            last_logged_at = None
        )
        db.session.add(user)
    else:
        user.refresh_token = refresh_token
    db.session.commit()
    # 사용자 정보를 세션에 저장
    session['access_token'] = access_token
    session['user_id'] = google_id
    session['os'] = 'android'
    login_user(user)


    return jsonify({ 'code' : 200, 'status': 'success'})

# # 토큰 갱신 함수
# def refresh_access_token(user):
#     token_url = "https://accounts.google.com/o/oauth2/token"
#     data = {
#         'client_id': OAUTH_CLIENT_ID,
#         'client_secret': OAUTH_CLIENT_SECRET,
#         'refresh_token': user.refresh_token,
#         'grant_type': 'refresh_token'
#     }
#     response = requests.post(token_url, data=data)
#     if response.ok:
#         new_access_token = response.json().get('access_token')
#         session['access_token'] = new_access_token
#         return new_access_token
#     return None


@auth_bp.route("/logout", methods=['POST'])
@jwt_required
def logout():
    print('logout')
    try:
        
        if not g.user_id:
            return jsonify({
                'code': 400,
                'message': '사용자 ID가 없습니다.',
                'status': 'error'
            }), 400
        
        user_id = UUID(g.user_id)
        
        user = db.session.query(User).filter(User.id == user_id).first()
        
        if user:
            user.refresh_token = ''
            db.session.commit()
        response = make_response(jsonify({
            'code': 200,
            'message': '로그아웃이 성공적으로 완료되었습니다.',
            'status': 'success'
        }), 200)
        
        is_local = os.getenv('FLASK_CONFIG') == 'local'
        response.set_cookie(
            'refresh_token',
            '',
            httponly=True,
            secure=not is_local,
            samesite='Lax',
            max_age=0  # 즉시 만료
        )
        
        return response
        
    except Exception as e:
        import traceback
        db.session.rollback()
        return jsonify({
            'code': 500,
            'message': '로그아웃 처리 중 오류가 발생했습니다.',
            'status': 'error'
        }), 500

@auth_bp.route('/get_user_info', methods=['GET'])
@jwt_required
def get_user_info():
    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
    user = db.session.query(User).filter(User.id == user_id).first()

    if not user:
        return jsonify({'code': 404, 'message': '사용자 정보를 찾을 수 없습니다.'}), 404

    user_item = {
        'id' : user.id,
        'level_id' : user.level_id,
        'username' : user.username,
        'email' : user.email,
        'code' : user.code,
        'book_cnt' : user.book_cnt,
        'gem_cnt' : user.gem_cnt,
        'set_goal_cnt' : user.set_goal_cnt,
        'invite_code' : user.invite_code,
    }
    return jsonify({'code':200, 'data': user_item})


@auth_bp.route('/update_user_info', methods=['PATCH'])
@jwt_required
def update_user_info():
    data = request.json
    
    if not data:
        return jsonify({'code': 400, 'message': '요청 데이터가 없습니다.'}), 400

    user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
    user_item = db.session.query(User).filter(User.id == user_id).first()

    if not user_item:
        return jsonify({'code': 404, 'message': '사용자 정보를 찾을 수 없습니다.'}), 404

    # 변경할 필드만 업데이트
    if 'level_id' in data:
        user_item.level_id = data['level_id']
    if 'username' in data:
        user_item.username = data['username']

    try:
        db.session.commit()
        return jsonify({'code': 200, 'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


@auth_bp.route('/deduct_gem', methods=['POST'])
@jwt_required
def deduct_gem():

    data = request.json
    print('data:', data)
    if not data:
        return jsonify({'code': 400, 'message': '요청 데이터가 없습니다.'}), 400

    # 차감할 보석 개수 확인
    deduct_amount = data.get('gem_cnt')
    if deduct_amount is None:
        return jsonify({'code': 400, 'message': '차감할 보석 개수가 필요합니다.'}), 400
    
    if not isinstance(deduct_amount, int) or deduct_amount <= 0:
        return jsonify({'code': 400, 'message': '차감할 보석 개수는 양의 정수여야 합니다.'}), 400

    # 사용자 조회
    user_id = UUID(g.user_id)
    user = db.session.query(User).filter(User.id == user_id).first()

    if not user:
        return jsonify({'code': 404, 'message': '사용자 정보를 찾을 수 없습니다.'}), 404

    # 보석이 충분한지 확인
    if user.gem_cnt < deduct_amount:
        return jsonify({
            'code': 400, 
            'message': f'보석이 부족합니다. 현재 보유 보석: {user.gem_cnt}개, 필요 보석: {deduct_amount}개'
        }), 400

    # 보석 차감
    deducted_amount = deduct_amount
    user.gem_cnt -= deducted_amount
    remaining_gem = user.gem_cnt

    # bookstore_id가 제공된 경우 Bookstore 정보 조회
    bookstore_id = data.get('bookstore_id')
    reason_enum = GemReason.BOOK_PURCHASE
    description = f'보석 차감: {deducted_amount}개'
    source_type = 'bookstore'
    
    if bookstore_id:
        bookstore_item = db.session.query(Bookstore).filter(Bookstore.id == bookstore_id).first()
        if bookstore_item:
            description = f'단어장 구매: {bookstore_item.name}'
    
    try:
        register_gem_log(
            user_id=user_id,
            amount=-deducted_amount,
            reason=reason_enum,
            description=description,
            source_type=source_type,
            source_id=None,  # bookstore_id는 Integer이므로 None
            balance_after=remaining_gem
        )
        
        db.session.commit()
        return jsonify({
            'code': 200,
            'message': f'{deducted_amount}개의 보석이 차감되었습니다.',
            'data': {
                'remaining_gem_cnt': remaining_gem,
                'deducted_gem_cnt': deducted_amount
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"###error in deduct_gem: {e}")
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500

        
# 초대 코드 유효성 검사
@auth_bp.route('/validate_invite_code', methods=['POST'])
@jwt_required
def validate_invite_code():
    data = request.json
    invite_code = data.get('invite_code')
    user_id = UUID(g.user_id)
    
    if not invite_code:
        return jsonify({'code': 400, 'message': '초대 코드를 입력해주세요.'}), 400

    invite_user = db.session.query(User).filter(User.invite_code == invite_code).first()
    if invite_user is None:
        return jsonify({'code': 404, 'message': '존재하지 않는 초대 코드입니다.'}), 404
    
    if str(user_id) == str(invite_user.id):
        return jsonify({'code': 400, 'message': '자기 자신은 초대할 수 없습니다.'}), 400
        
    return jsonify({'code': 200, 'status': 'success', 'message': '유효한 코드입니다.'})

# 초대자 코드 저장 및 보상 지급
@auth_bp.route('/save_invite_code', methods=['POST'])
@jwt_required
def save_invite_code():
    data = request.json
    invite_code = data.get('invite_code')
    user_id = UUID(g.user_id)
    user = db.session.query(User).filter(User.id == user_id).first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자 정보를 찾을 수 없습니다.'}), 404

    invite_user = db.session.query(User).filter(User.invite_code == invite_code).first()
    if invite_user is None:
        return jsonify({'code': 404, 'message': '초대한 사용자 정보를 찾을 수 없습니다.'}), 404
    
    if user.id == invite_user.id:
        return jsonify({'code': 400, 'message': '자기 자신을 초대할 수 없습니다.'}), 400
    
    # 중복 초대 방지 체크 (이미 초대를 받았는지)
    if user.invited_by:
        return jsonify({'code': 400, 'message': '이미 초대 코드를 입력하셨습니다.'}), 400

    try:
        user.invited_by = invite_user.id
        invite_map = InviteMap(inviter_id=invite_user.id, invitee_id=user.id)
        db.session.add(invite_map)
        
        # --- 보상 지급 로직 ---
        # 1. 초대받은 사람(본인) 보석 10개 지급
        user.gem_cnt += 10
        db.session.flush() # user.gem_cnt 반영을 위해 flush
        
        register_gem_log(
            user_id=user.id,
            amount=10,
            reason=GemReason.REFERRAL, 
            description="초대 코드 입력 보상",
            source_type="referral",
            source_id=None,
            balance_after=user.gem_cnt
        )

        # 2. 초대한 사람 보석 10개 지급
        invite_user.gem_cnt += 10
        db.session.flush()
        
        register_gem_log(
            user_id=invite_user.id,
            amount=10,
            reason=GemReason.REFERRAL,
            description=f"초대 성공 보상 ({user.username or user.name})",
            source_type="referral",
            source_id=user.id,
            balance_after=invite_user.gem_cnt
        )
        
        # 초대왕 업적 업데이트 (초대한 사람의 업적)
        update_user_goal('초대왕', user_id=invite_user.id)

        db.session.commit()
        return jsonify({
            'code': 200, 
            'status': 'success', 
            'data': {
                'my_gem_cnt': user.gem_cnt
            }
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error in save_invite_code: {e}")
        return jsonify({'code': 500, 'message': '보상 처리 중 서버 오류가 발생했습니다.'}), 500


### (회원가입 시) 단어장 선택 레벨링
@auth_bp.route('/level_book_list', methods=['GET'])
def level_voca_list():
    level = request.args.get('level')
    
    if not level:
        return jsonify({'code': 400, 'message': '요청 데이터가 없습니다.'}), 400
    
    filtered_voca_list = db.session.query(Bookstore)\
                    .filter(Bookstore.level_id == level)\
                    .filter(Bookstore.hide == 'N')\
                    .order_by(Bookstore.downloads.desc()) \
                    .limit(4)\
                    .all()
    
    # 색상 세트 리스트
    COLOR_SETS = [
        {"main": "var(--primary-main-500)", "sub": "var(--primary-main-200)", "background": "var(--primary-main-100)"},
        {"main": "var(--secondary-purple-500)", "sub": "var(--secondary-purple-200)", "background": "var(--secondary-purple-100)"},
        {"main": "var(--secondary-blue-500)", "sub": "var(--secondary-blue-200)", "background": "var(--secondary-blue-100)"},
        {"main": "var(--secondary-yellow-500)", "sub": "var(--secondary-yellow-200)", "background": "var(--secondary-yellow-100)"},
        {"main": "var(--secondary-mint-500)", "sub": "var(--secondary-mint-200)", "background": "var(--secondary-mint-100)"},
    ]

    data = []
    for idx, vocabook in enumerate(filtered_voca_list):
        data.append({
            'id' : vocabook.id,
            'name' : vocabook.name,
            'download': vocabook.downloads,
            'category': vocabook.category,
            'color' : COLOR_SETS[idx], # 인덱스 순서대로 색상 할당
        })
    
    # 더미
    # current_dir = os.path.dirname(os.path.abspath(__file__))
    # json_path = os.path.join(current_dir, 'dummy_dict.json')
    # with open(json_path, 'r', encoding='utf-8') as f:
    #     all_data = json.load(f)
    return jsonify({'code':200, 'data': data})


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    google_id = data.get('google_id')
    email = data.get('email')
    name = data.get('name')
    if not google_id or not email:
        return jsonify({'msg': 'Missing user info'}), 400

    # DB에서 사용자 조회 또는 생성
    user = User.query.filter_by(google_id=google_id).first()
    if user is None:
        user = User(
            level_id=None,
            email=email,
            google_id=google_id,
            username=None,
            name=name or '',
            phone=None,
            last_logged_at=None,
            refresh_token='',
            code='',
            book_cnt=3,
            gem_cnt=0,
            set_goal_cnt=3
        )
        db.session.add(user)
        db.session.commit()

    # JWT 발급
    access_token = generate_access_token(user.id)
    refresh_token = generate_refresh_token(user.id, user.email)

    # 응답 및 refresh_token을 HttpOnly 쿠키로 설정 (보안 강화)
    response = make_response(jsonify({
        'access_token': access_token
    }))
    is_local = os.getenv('FLASK_CONFIG') == 'local'
    response.set_cookie(
        'refresh_token',
        refresh_token,
        httponly=True,  # JavaScript에서 접근 불가 (보안 강화)
        secure=not is_local,  # local이 아니면 HTTPS 사용
        samesite='Lax',
        max_age=60*60*24*14
    )
    return response

# 리프레시 토큰 재발급 엔드포인트
@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    print("=== 토큰 갱신 요청 시작 ===")
    
    # 쿠키에서 refresh_token 가져오기
    refresh_token = request.cookies.get('refresh_token')
    print(f"쿠키에서 가져온 refresh_token: {refresh_token[:20] if refresh_token else None}...")
    
    if not refresh_token:
        print("❌ Refresh token이 쿠키에 없음")
        return jsonify({
            'code': 401,
            'message': 'Refresh token is missing'
        }), 401
    
    # 리프레시 토큰 검증
    user_id = verify_refresh_token(refresh_token)
    print(f"검증된 user_id: {user_id}")
    
    if not user_id:
        print("❌ Refresh token 검증 실패")
        return jsonify({
            'code': 401,
            'message': 'Invalid or expired refresh token'
        }), 401
    
    # 새로운 액세스 토큰 발급
    new_access_token = generate_access_token(user_id)
    print(f"✅ 새로운 액세스 토큰 발급 성공: {new_access_token[:20]}...")
    
    return jsonify({
        'code': 200,
        'access_token': new_access_token
    }), 200


# 테스트용 엔드포인트 - 토큰 상태 확인
@auth_bp.route('/test/token-status', methods=['GET'])
@jwt_required
def test_token_status():
    """현재 액세스 토큰의 상태를 확인하는 테스트 엔드포인트"""
    import jwt
    from datetime import datetime
    
    # Authorization 헤더에서 토큰 추출
    auth_header = request.headers.get('Authorization')
    token = auth_header.split(" ")[1] if auth_header else None
    
    if not token:
        return jsonify({'error': 'No token provided'}), 400
    
    try:
        # 토큰 디코딩 (검증 없이)
        decoded = jwt.decode(token, options={"verify_signature": False})
        exp_timestamp = decoded.get('exp')
        exp_datetime = datetime.fromtimestamp(exp_timestamp) if exp_timestamp else None
        current_time = datetime.utcnow()
        
        is_expired = exp_datetime < current_time if exp_datetime else True
        
        return jsonify({
            'token': token[:20] + '...',  # 토큰의 일부만 표시
            'user_id': decoded.get('user_id'),
            'expires_at': exp_datetime.isoformat() if exp_datetime else None,
            'current_time': current_time.isoformat(),
            'is_expired': is_expired,
            'time_remaining_seconds': (exp_datetime - current_time).total_seconds() if exp_datetime and not is_expired else 0
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# -------------------
# 개발자 로그인 (Local Only)
# -------------------
@auth_bp.route('/dev-login', methods=['POST'])
def dev_login():
    # local 환경에서만 허용
    if os.getenv('FLASK_CONFIG') != 'local':
        return jsonify({'code': 403, 'message': '허용되지 않는 환경입니다.'}), 403

    data = request.json
    email = data.get('email')

    if not email:
        return jsonify({'code': 400, 'message': '이메일을 입력해주세요.'}), 400

    try:
        user = User.query.filter_by(email=email).first()
        
        if user is None:
            if email == 'test@test.com':
                # 자동 회원가입 처리
                user = User(
                    level_id=None,
                    email=email,
                    google_id=None,
                    username=None,
                    name='테스트',
                    phone=None,
                    last_logged_at=None,
                    refresh_token='',
                    code='',
                    book_cnt=3,
                    gem_cnt=0,
                    set_goal_cnt=3
                )
                db.session.add(user)
                db.session.commit()
            else:
                return jsonify({'code': 404, 'message': '존재하지 않는 계정입니다.'}), 404

        # JWT 발급
        access_token = generate_access_token(user.id, user.email)
        refresh_token = generate_refresh_token(user.id, user.email)

        user.refresh_token = refresh_token
        db.session.commit()

        response = make_response(jsonify({
            "code": 200,
            "status": "success",
            "accessToken": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": getattr(user, "name", None),
            }
        }), 200)

        is_local = os.getenv('FLASK_CONFIG') == 'local'
        response.set_cookie(
            'refresh_token',
            refresh_token,
            httponly=True,
            secure=not is_local,
            samesite='Lax',
            max_age=60*60*24*30
        )
        return response

    except Exception as e:
        db.session.rollback()
        print(f"Dev Login Error: {e}")
        return jsonify({'code': 500, 'message': '로그인 처리 중 오류가 발생했습니다.'}), 500


@auth_bp.route('/withdraw', methods=['DELETE'])
@jwt_required
def withdraw():
    """회원 탈퇴 API - 사용자 관련 모든 데이터 삭제"""
    try:
        if not g.user_id:
            return jsonify({
                'code': 400,
                'message': '사용자 ID가 없습니다.',
                'status': 'error'
            }), 400
        
        user_id = UUID(g.user_id)
        
        # 사용자 존재 확인
        user = db.session.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({
                'code': 404,
                'message': '사용자를 찾을 수 없습니다.',
                'status': 'error'
            }), 404
        
        # 트랜잭션 시작 - 모든 삭제 작업을 하나의 트랜잭션으로 처리
        try:
            # 1. UserHasToken 삭제 (FCM 토큰)
            db.session.query(UserHasToken).filter(UserHasToken.user_id == user_id).delete()
            
            # 2. InviteMap 삭제 (초대 관련 - inviter_id 또는 invitee_id가 해당 user_id인 경우)
            # BinaryUUID 타입을 사용하므로 UUID 객체를 그대로 전달 가능
            db.session.query(InviteMap).filter(
                (InviteMap.inviter_id == user_id) | (InviteMap.invitee_id == user_id)
            ).delete()
            
            # 3-1. UserVocaBookMap 삭제 (사용자 단어장 내 단어 매핑)
            # UserVocaBook이 삭제되기 전에 먼저 삭제되어야 함 (CASCADE 설정이 없을 수 있으므로 명시적 삭제)
            # UserVocaBookMap은 user_voca_book_id를 외래키로 가짐
            # 따라서 UserVocaBook을 먼저 조회해서 ID 목록을 가져오거나, join delete를 수행해야 함
            
            # 먼저 사용자의 모든 단어장 ID 조회
            user_voca_book_ids = db.session.query(UserVocaBook.id).filter(UserVocaBook.user_id == user_id).all()
            user_voca_book_ids = [row[0] for row in user_voca_book_ids]
            
            if user_voca_book_ids:
                # 해당 단어장들에 속한 맵핑 삭제
                db.session.query(UserVocaBookMap).filter(UserVocaBookMap.user_voca_book_id.in_(user_voca_book_ids)).delete(synchronize_session=False)

            # 3-2. UserVoca 삭제 (사용자 단어)
            # UserVoca는 user_id를 외래키로 가짐
            # UserVocaBookMap에서 user_voca_id를 참조할 수 있으므로, Map 삭제 후 삭제 안전
            db.session.query(UserVoca).filter(UserVoca.user_id == user_id).delete()

            # 3-3. UserVocaBook 삭제 (사용자 단어장)
            db.session.query(UserVocaBook).filter(UserVocaBook.user_id == user_id).delete()
            
            # 4. CheckIn 삭제 (출석 체크)
            db.session.query(CheckIn).filter(CheckIn.user_id == user_id).delete()
            
            # 5. UserRecentStudy 삭제 (최근 학습)
            db.session.query(UserRecentStudy).filter(UserRecentStudy.user_id == user_id).delete()
            
            # 6. UserGoals 삭제 (사용자 목표)
            db.session.query(UserGoals).filter(UserGoals.user_id == user_id).delete()
            
            # 7. Purchase 삭제 (구매 기록)
            db.session.query(Purchase).filter(Purchase.user_id == user_id).delete()
            
            # 8. GemLog 삭제 (보석 로그)
            db.session.query(GemLog).filter(GemLog.user_id == user_id).delete()
            
            # 9. User 삭제 (사용자 자체)
            db.session.delete(user)
            
            # 모든 변경사항 커밋
            db.session.commit()
            
            # 응답 생성 및 refresh_token 쿠키 제거
            response = make_response(jsonify({
                'code': 200,
                'message': '회원 탈퇴가 성공적으로 완료되었습니다.',
                'status': 'success'
            }), 200)
            
            # refresh_token 쿠키 제거
            is_local = os.getenv('FLASK_CONFIG') == 'local'
            response.set_cookie(
                'refresh_token',
                '',
                httponly=True,
                secure=not is_local,
                samesite='Lax',
                max_age=0  # 즉시 만료
            )
            
            return response
            
        except Exception as e:
            # 에러 발생 시 롤백
            db.session.rollback()
            print(f"회원 탈퇴 처리 중 오류 발생: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'code': 500,
                'message': '회원 탈퇴 처리 중 오류가 발생했습니다.',
                'status': 'error'
            }), 500
        
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({
            'code': 500,
            'message': '회원 탈퇴 처리 중 오류가 발생했습니다.',
            'status': 'error'
        }), 500


