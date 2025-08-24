import os, jwt
from functools import wraps
from flask import request, jsonify, g
from jwt import ExpiredSignatureError, InvalidTokenError
from uuid import UUID

ACCESS_SECRET = os.getenv("ACCESS_SECRET")

# JWT 토큰 검증 데코레이터
def jwt_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        print('auth : ', auth)
        if not auth or not auth.startswith('Bearer '):
            return jsonify({'code': 401, 'message': '유효하지 않은 토큰입니다.'}), 401
        token = auth.split(' ', 1)[1]
        try:
            payload = jwt.decode(token, ACCESS_SECRET, algorithms=['HS256'])
            user_id = payload.get('id')
            if not user_id:
                return jsonify({'code': 401, 'message': '토큰에 사용자 ID가 없습니다.'}), 401
            
            # UUID 문자열을 UUID 객체로 변환
            try:
                user_uuid = UUID(user_id)
                g.user_id = user_uuid
            except ValueError:
                return jsonify({'code': 401, 'message': '유효하지 않은 사용자 ID 형식입니다.'}), 401
                
        except ExpiredSignatureError:
            return jsonify({'code': 401, 'message': '토큰이 만료되었습니다.'}), 401
        except InvalidTokenError:
            return jsonify({'code': 401, 'message': '유효하지 않은 토큰입니다.'}), 401
        except Exception:
            return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500
        return fn(*args, **kwargs)
    return wrapper