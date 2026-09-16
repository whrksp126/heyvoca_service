from flask import request, jsonify, g
from functools import wraps
import jwt
import os
from datetime import datetime, timedelta

# JWT 시크릿 키들
ACCESS_SECRET = os.getenv("ACCESS_SECRET")
REFRESH_SECRET = os.getenv("REFRESH_SECRET")

SECRET_KEY = ACCESS_SECRET
REFRESH_SECRET_KEY = REFRESH_SECRET

# JWT 유효 시간 설정
ACCESS_TTL_SECONDS = int(os.getenv("ACCESS_TTL_SECONDS", 60 * 60))  # 기본 60분
REFRESH_TTL_SECONDS = int(os.getenv("REFRESH_TTL_SECONDS", 60 * 60 * 24 * 90))  # 기본 90일 (슬라이딩 회전: /auth/refresh 호출 시마다 재발급되어 활성 사용자는 사실상 무한 유지)


def jwt_required(f):
    """
    JWT 토큰 검증 데코레이터
    Authorization 헤더에서 Bearer 토큰을 추출하고 검증합니다.
    검증 성공 시 g.user_id에 사용자 ID를 저장합니다.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Authorization 헤더에서 토큰 추출
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]  # "Bearer <token>" 형식에서 토큰 추출
            except IndexError:
                return jsonify({'msg': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'msg': 'Token is missing'}), 401
        
        try:
            # JWT 토큰 검증
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            user_id = data['user_id']
            
            # g.user_id에 사용자 ID 저장 (기존 코드와 호환)
            g.user_id = user_id
            
        except jwt.ExpiredSignatureError:
            return jsonify({'msg': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'msg': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'msg': 'Token validation failed'}), 401
        
        return f(*args, **kwargs)
    
    return decorated


def optional_user_id():
    """Authorization 헤더가 있고 유효하면 user_id(str), 없거나 무효하면 None.

    `jwt_required` 는 검증 실패 시 401 을 내려 라우트 진입 자체를 막는다. 하지만
    `/search/bookstore` 처럼 비로그인(게스트 온보딩)도 호출하는 API에서 "로그인했으면
    개인화 필드를 얹는다"를 하려면 실패를 에러가 아니라 '게스트'로 다뤄야 한다.
    검증 로직(`jwt.decode` + SECRET_KEY + HS256)은 `jwt_required` 와 동일하게 맞춘다 —
    두 곳이 갈리면 한쪽만 통과하는 토큰이 생긴다.
    """
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None

    try:
        token = auth_header.split(" ")[1]
    except IndexError:
        return None

    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return data.get('user_id')
    except jwt.PyJWTError:
        return None
    except Exception:
        return None


def generate_access_token(user_id, email=None):
    """
    액세스 토큰 생성
    """
    exp_time = datetime.utcnow() + timedelta(seconds=ACCESS_TTL_SECONDS)
    payload = {
        'user_id': str(user_id),
        'exp': exp_time
    }
    # 이메일이 제공되면 payload에 추가 (기존 코드와의 호환성)
    if email:
        payload['email'] = email
    
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    return token


def generate_refresh_token(user_id, email=None):
    """
    리프레시 토큰 생성
    user_id: 사용자 ID (필수)
    email: 이메일 (선택사항, 기존 코드와의 호환성을 위해)
    """
    exp_time = datetime.utcnow() + timedelta(seconds=REFRESH_TTL_SECONDS)
    payload = {
        'user_id': str(user_id),
        'exp': exp_time
    }
    # 이메일이 제공되면 payload에 추가 (기존 코드와의 호환성)
    if email:
        payload['email'] = email
    
    token = jwt.encode(payload, REFRESH_SECRET_KEY, algorithm='HS256')
    return token


def verify_refresh_token(refresh_token):
    """
    리프레시 토큰 검증
    """
    try:
        data = jwt.decode(refresh_token, REFRESH_SECRET_KEY, algorithms=['HS256'])
        
        # user_id 또는 id 키 찾기 (호환성)
        user_id = data.get('user_id') or data.get('id')
        if not user_id:
            return None
            
        return user_id
    except jwt.ExpiredSignatureError:
        print("⏰ 리프레시 토큰 만료됨 - 재로그인 필요")
        return None
    except jwt.InvalidTokenError:
        return None
    except Exception:
        return None
