from flask import render_template, redirect, url_for, request, session, jsonify, g, make_response
from functools import wraps
from app import db
from app.routes import auth_bp
from app.models.models import User, Bookstore, GoalType, UserGoals, Goals, InviteMap
from app.utils.jwt_utils import jwt_required, generate_access_token, generate_refresh_token, verify_refresh_token

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
from config import GOOGLE_WEB_CLIENT_ID, ACCESS_SECRET, REFRESH_SECRET, OAUTH_CLIENT_SECRET, FRONT_END_URL

from dotenv import load_dotenv
import os, time, jwt
from datetime import datetime, timedelta, timezone
from uuid import UUID

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
                refresh_token = None,
                code = None,
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
            refresh_token = refresh_token,
            code = None,
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
def update_user_info():
    data = request.json
    
    if not data:
        return jsonify({'code': 400, 'message': '요청 데이터가 없습니다.'}), 400

    user_item = db.session.query(User).filter(User.id == g.user_id).first()

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


# 초대자 코드 저장
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
        return jsonify({'code': 404, 'message': '사용자 정보를 찾을 수 없습니다.'}), 404
    
    if user.id == invite_user.id:
        return jsonify({'code': 400, 'message': '자기 자신을 초대할 수 없습니다.'}), 400
    
    user.invited_by = invite_user.id
    invite_map = InviteMap(inviter_id=user.id, invitee_id=invite_user.id)
    
    db.session.add(user)
    db.session.add(invite_map)
    db.session.commit()
    return jsonify({'code': 200, 'status': 'success'})


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
        {"main": "#FF8DD4", "sub": "#FFD2EF", "background": "#FFEFFA"},
        {"main": "#CD8DFF", "sub": "#EAD2FF", "background": "#F6EFFF"},
        {"main": "#74D5FF", "sub": "#C6ECFF", "background": "#EAF6FF"},
        {"main": "#42F98B", "sub": "#B2FDCC", "background": "#E2FFE8"},
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
            email=email,
            google_id=google_id,
            name=name or '',
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


