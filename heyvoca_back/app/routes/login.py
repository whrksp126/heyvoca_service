from flask import render_template, redirect, url_for, request, session, jsonify
from app import db
from app.routes import login_bp
from app.models.models import User

from flask_login import current_user, login_required, login_user, logout_user
import requests

import json
from werkzeug.security import generate_password_hash, check_password_hash

import io
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaFileUpload, MediaIoBaseDownload
from urllib.parse import urlencode

from requests_oauthlib import OAuth2Session
# from config import OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI

from dotenv import load_dotenv
import os
OAUTH_CLIENT_ID = os.getenv('OAUTH_CLIENT_ID')
OAUTH_CLIENT_SECRET = os.getenv('OAUTH_CLIENT_SECRET')
OAUTH_REDIRECT_URI = os.getenv('OAUTH_REDIRECT_URI')


@login_bp.route('/')
@login_required
def index():
    return render_template('main_login.html')


# 로그인 라우트: 구글 OAuth2 인증 요청
@login_bp.route('/google')
def login_google():
    device_type = request.args.get('device_type', 'web')
    session['device_type'] = device_type
    # OAuth2Session 생성
    oauth = OAuth2Session(OAUTH_CLIENT_ID, redirect_uri=OAUTH_REDIRECT_URI, 
                          scope=[
                              'https://www.googleapis.com/auth/userinfo.profile', 
                              'https://www.googleapis.com/auth/userinfo.email', 
                              'openid',
                              'https://www.googleapis.com/auth/drive.file'
                            ]
                        )

    # 인증 요청을 생성합니다.
    authorization_url, state = oauth.authorization_url(
        'https://accounts.google.com/o/oauth2/auth',
        access_type="offline",
        prompt="consent"
    )

    # 상태(state)를 세션에 저장
    session['oauth_state'] = state

    return redirect(authorization_url)


# 인증 콜백 라우트: OAuth2 인증 완료 후 실행
@login_bp.route('/login_google/callback')
def authorize_google():
    state = session.pop('oauth_state', None)
    authorization_response = request.url
    if state is None or state != request.args.get('state'):
        return 'Invalid OAuth state', 400

    oauth = OAuth2Session(
        OAUTH_CLIENT_ID,
        redirect_uri=OAUTH_REDIRECT_URI,
        state=state,
        scope=[
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'openid',
            'https://www.googleapis.com/auth/drive.file'
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

    # 기존 사용자 조회
    user = User.query.filter_by(google_id=userinfo['id']).first()
    if user is None:
        user = User(
            email=userinfo['email'],
            google_id=userinfo['id'],
            name=userinfo.get('name', ''),
            phone=None,
            refresh_token=token['refresh_token'],
        )
        db.session.add(user)
    else:
        user.refresh_token = token['refresh_token']
    db.session.commit()

    # 세션에 사용자 ID와 액세스 토큰 저장
    session['user_id'] = user.google_id
    session['access_token'] = token['access_token']
    session['os'] = 'web'
    login_user(user)

    # 리다이렉트 URL 생성
    front_end_url = 'https://voca.ghmate.com/html/login.html'
    query_params = {
        'googleId': user.id,
        'email': user.email,
        'name': user.name,
        'type': 'web',
        'status': 200
    }
    redirect_url = f"{front_end_url}?{urlencode(query_params)}"
    return redirect(redirect_url)

# 앱 로그인 처리
@login_bp.route('/login_google/callback/app', methods=['POST'])
def login_google_app():
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
            email = email,
            google_id = google_id,
            name = name,
            phone = None,
            refresh_token = refresh_token
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

# 토큰 갱신 함수
def refresh_access_token(user):
    token_url = "https://accounts.google.com/o/oauth2/token"
    data = {
        'client_id': OAUTH_CLIENT_ID,
        'client_secret': OAUTH_CLIENT_SECRET,
        'refresh_token': user.refresh_token,
        'grant_type': 'refresh_token'
    }
    response = requests.post(token_url, data=data)
    if response.ok:
        new_access_token = response.json().get('access_token')
        session['access_token'] = new_access_token
        return new_access_token
    return None


@login_bp.route("/logout")
@login_required
def logout():
    session.pop('access_token', None)
    session.pop('user_id', None)
    session.pop('os', None)
    logout_user()
    return render_template('index.html')
