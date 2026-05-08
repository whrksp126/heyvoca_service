from flask import Blueprint, jsonify
from sqlalchemy import text
import os
import redis as redis_lib

from app.routes import health_bp

APP_VERSION = os.getenv('APP_VERSION', '1.0.0')


@health_bp.route('/health', methods=['GET'])
def health_check():
    """헬스체크 엔드포인트 — 인증 없음. DB + Redis 상태를 함께 반환."""
    status = {'db': 'ok', 'redis': 'ok'}
    http_code = 200

    # DB ping
    try:
        from app import db
        db.session.execute(text('SELECT 1'))
    except Exception as e:
        status['db'] = f'error: {e}'
        http_code = 503

    # Redis ping — 직접 redis 클라이언트로 접근 (Flask-Caching 내부 구조에 무관)
    try:
        _redis_host = os.getenv('REDIS_HOST', 'redis')
        _redis_port = int(os.getenv('REDIS_PORT', 6379))
        r = redis_lib.Redis(host=_redis_host, port=_redis_port, db=0, socket_timeout=2)
        r.ping()
    except Exception as e:
        status['redis'] = f'error: {e}'
        http_code = 503

    return jsonify({
        'status': 'ok' if http_code == 200 else 'error',
        'db': status['db'],
        'redis': status['redis'],
        'version': APP_VERSION,
    }), http_code
