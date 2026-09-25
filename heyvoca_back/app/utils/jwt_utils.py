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
        
        # 사전 언어 확정 — 이 요청의 사전 모델 쿼리는 user.learning_lang 사전으로 간다.
        # (before_request 에서 이미 같은 user 로 확정했으면 재조회하지 않음)
        from app.utils.dict_lang import apply_user_dict_lang
        apply_user_dict_lang(user_id)

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


def generate_refresh_token(user_id, email=None, token_version=0):
    """
    리프레시 토큰 생성
    user_id: 사용자 ID (필수)
    email: 이메일 (선택사항, 기존 코드와의 호환성을 위해)
    token_version: User.token_version 스냅샷('tv' 클레임). 로그아웃 시 User.token_version 이
        증가하므로, /auth/refresh 에서 이 값과 DB 값을 대조해 로그아웃된 토큰을 거부한다.
        호출부에서 넘기지 않으면 0(옛 사용자 호환) — DB의 실제 token_version 과 다르면
        발급 즉시 거부되는 토큰이 생기므로 반드시 user.token_version 을 넘겨야 한다.
    """
    exp_time = datetime.utcnow() + timedelta(seconds=REFRESH_TTL_SECONDS)
    payload = {
        'user_id': str(user_id),
        'tv': int(token_version or 0),
        'exp': exp_time
    }
    # 이메일이 제공되면 payload에 추가 (기존 코드와의 호환성)
    if email:
        payload['email'] = email

    token = jwt.encode(payload, REFRESH_SECRET_KEY, algorithm='HS256')
    return token


def verify_refresh_token(refresh_token):
    """
    리프레시 토큰 검증(서명·만료만). 반환값은 user_id 문자열.

    주의: 이 함수는 DB의 User.token_version 과 대조하지 않는다(순수 토큰 검증만).
    로그아웃 폐기 여부는 호출부(/auth/refresh)가 토큰의 'tv' 클레임과 User.token_version 을
    직접 비교해서 판단한다 — 이 함수만으로는 로그아웃된 토큰인지 알 수 없다.
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


def get_refresh_token_version(refresh_token):
    """리프레시 토큰의 'tv' 클레임(정수). 서명 검증에 실패하면 None.

    클레임이 없는 옛 토큰(이 컬럼 도입 이전 발급분)은 0으로 간주한다.
    """
    try:
        data = jwt.decode(refresh_token, REFRESH_SECRET_KEY, algorithms=['HS256'])
        return int(data.get('tv') or 0)
    except jwt.PyJWTError:
        return None
    except Exception:
        return None
