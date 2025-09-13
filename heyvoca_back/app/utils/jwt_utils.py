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


def generate_access_token(user_id):
    """
    액세스 토큰 생성 (30분 유효)
    """
    exp_time = datetime.utcnow() + timedelta(minutes=30)  # 30분으로 설정 (일반적인 값)
    payload = {
        'user_id': str(user_id),
        'exp': exp_time
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    return token


def generate_refresh_token(user_id, email=None):
    """
    리프레시 토큰 생성 (14일 유효)
    user_id: 사용자 ID (필수)
    email: 이메일 (선택사항, 기존 코드와의 호환성을 위해)
    """
    exp_time = datetime.utcnow() + timedelta(days=14)
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
        
        # 기존 코드와의 호환성을 위해 'id' 키 사용
        if 'id' not in data:
            return None
            
        user_id = data['id']
        return user_id
    except jwt.ExpiredSignatureError:
        print("⏰ 리프레시 토큰 만료됨 - 재로그인 필요")
        return None
    except jwt.InvalidTokenError:
        return None
    except Exception:
        return None
