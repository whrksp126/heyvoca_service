import os
from flask import Flask, request, g
from config import DevelopmentConfig, StagingConfig, ProductionConfig, LocalConfig, FRONT_END_URL
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from sqlalchemy.ext.declarative import declarative_base
from contextlib import contextmanager
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine, text
from flask_cors import CORS
from flask_caching import Cache
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    _limiter_available = True
except ImportError:
    _limiter_available = False
import json
import re

from app.login_manager import load_user, unauthorized_callback
from werkzeug.middleware.proxy_fix import ProxyFix

# Sentry 초기화 (prod/stg 환경에서 SENTRY_DSN 환경변수가 있을 때만 활성화)
# sentry-sdk가 아직 미설치인 환경에서도 앱 기동이 실패하지 않도록 try-except 처리
try:
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration as _FlaskIntegration
    _sentry_dsn = os.getenv('SENTRY_DSN')
    _flask_config_env = os.getenv('FLASK_CONFIG', '')
    if _sentry_dsn and _flask_config_env in ('production', 'staging'):
        sentry_sdk.init(
            dsn=_sentry_dsn,
            environment=_flask_config_env,
            integrations=[_FlaskIntegration()],
            traces_sample_rate=0.1,
            send_default_pii=False,
        )
except ImportError:
    pass

# 로컬 테스트 전용
env_file = os.environ.get('FLASK_ENV_FILE')
if env_file == 'local':
  os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'


db = SQLAlchemy()
login_manager = LoginManager()
cache = Cache()


if _limiter_available:
    def _rate_limit_key():
        """인증된 사용자면 user_id, 아니면 IP 기반으로 rate limit 키 결정.

        Cloudflare → nginx → backend 체인이라 request.remote_addr은 매번 다른
        Cloudflare edge IP가 됨. CF-Connecting-IP/X-Forwarded-For 첫 항목이
        진짜 클라이언트 IP.
        """
        user_id = getattr(g, 'user_id', None)
        if user_id:
            return f'user:{user_id}'
        cf_ip = request.headers.get('CF-Connecting-IP')
        if cf_ip:
            return cf_ip
        xff = request.headers.get('X-Forwarded-For', '').strip()
        if xff:
            return xff.split(',')[0].strip()
        return get_remote_address()

    limiter = Limiter(
        key_func=_rate_limit_key,
        default_limits=['60 per minute'],
        # storage_uri는 create_app()에서 app.config['RATELIMIT_STORAGE_URL']로 설정
    )
else:
    # Flask-Limiter 미설치 시 no-op 더미 객체
    class _NoopLimiter:
        def init_app(self, app):
            pass
        def limit(self, *args, **kwargs):
            def decorator(f):
                return f
            return decorator
        def exempt(self, f):
            return f
    limiter = _NoopLimiter()

def create_app():
  app = Flask(__name__, static_folder='static', static_url_path='')

  flask_config = os.environ.get('FLASK_CONFIG', 'development')

  # CORS origins 리스트 구성
  cors_origins = [
      "https://heyvoca-front.ghmate.com",
      "https://stg-heyvoca-front.ghmate.com",
      "https://dev-heyvoca-front.ghmate.com",
      "https://heyvoca.ghmate.com",
      "http://localhost:3000",
      "http://10.0.2.2:3000",
      "http://localhost:4321",
  ]

  # local / dev 환경에서만 localhost 임의 포트 허용. 광역 사설망 대역(192.168/8, 10/8)은
  # 제거 — 특정 LAN IP는 아래 FRONT_END_URL(local-setup이 현재 IP로 설정)로 정확히 커버됨.
  if flask_config in ('local', 'development'):
      cors_origins += [
          re.compile(r"^http://localhost:\d+$"),
          re.compile(r"^http://127\.0\.0\.1:\d+$"),
      ]

  # .env의 FRONT_END_URL이 있으면 추가
  if FRONT_END_URL:
      cors_origins.append(FRONT_END_URL)

  CORS(app, origins=cors_origins, supports_credentials=True)

  
  config_class = os.environ.get('FLASK_CONFIG') or 'development'
  if config_class == 'production':
    app.config.from_object(ProductionConfig)
  elif config_class == 'staging':
    app.config.from_object(StagingConfig)
  elif config_class == 'local':
    app.config.from_object(LocalConfig)
  else:
    app.config.from_object(DevelopmentConfig)

  # 시크릿 fail-fast — prod/staging에서 JWT 시크릿이 비어 있으면 위조 가능한 약한 키로
  # 기동되는 것을 막기 위해 즉시 중단. 전 환경 .env에 키 존재 확인됨(정상 배포엔 무영향).
  # local/dev는 개발 편의상 검사 제외.
  if config_class in ('production', 'staging'):
    _missing_secrets = [k for k in ('SECRET_KEY', 'ACCESS_SECRET', 'REFRESH_SECRET')
                        if not app.config.get(k)]
    if _missing_secrets:
      raise RuntimeError(
          f"필수 시크릿 환경변수 누락: {_missing_secrets} — '{config_class}' 기동 중단. "
          f".env에 해당 키를 설정하세요."
      )

  app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

  app.config['JSON_AS_ASCII'] = False

  # 요청 본문 크기 백스톱 — 거대 페이로드를 프레임워크 레벨에서 차단(413).
  # 단어장 업로드(≤5MB)·OCR JSON 등 실사용보다 충분히 큰 32MB. nginx(300m)보다 타이트.
  app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

  # Redis 캐시 설정
  _redis_host = os.getenv('REDIS_HOST', 'redis')
  _redis_port = int(os.getenv('REDIS_PORT', 6379))
  app.config['CACHE_TYPE'] = 'redis'
  app.config['CACHE_REDIS_HOST'] = _redis_host
  app.config['CACHE_REDIS_PORT'] = _redis_port
  app.config['CACHE_REDIS_DB'] = 0

  # Rate limiter — Redis DB 1 사용 (캐시 DB 0과 분리)
  # Flask-Limiter 3.x config key는 RATELIMIT_STORAGE_URL (URI 아님)
  app.config['RATELIMIT_STORAGE_URL'] = f'redis://{_redis_host}:{_redis_port}/1'

  # 추가적인 초기화 코드 (블루프린트 등록 등)
  db.init_app(app)
  from flask_migrate import Migrate as _Migrate
  _Migrate(app, db)
  login_manager.init_app(app)
  cache.init_app(app)
  limiter.init_app(app)
  # login_manager.login_view = "main_login.html"

  login_manager.user_loader(load_user)
  login_manager.unauthorized_handler(unauthorized_callback)

  # # 모든 모델 클래스들을 한번에 import
  from app.models import models
  from app.routes.health import health_bp
  from app.routes.auth import auth_bp
  from app.routes.search import search_bp
  from app.routes.tts import tts_bp
  from app.routes.fcm import fcm_bp
  from app.routes.drive import drive_bp
  from app.routes.mainpage import mainpage_bp
  from app.routes.version import version_bp
  from app.routes.user_voca_book import user_voca_book_bp
  from app.routes.purchase import purchase_bp
  from app.routes.ocr import ocr_bp
  from app.routes.voca_indexs import voca_indexs_bp
  from app.routes.voca_books import voca_books_bp
  from app.routes.study import study_bp
  from app.routes.study_insights import insights_bp
  from app.routes.onboarding import onboarding_bp
  from app.routes.game import game_bp
  from app.routes.admin import admin_bp
  from app.routes.admin_voca_books import admin_voca_books_bp
  from app.routes import admin_dashboard  # noqa: F401  (admin_bp에 라우트 등록 — Blueprint 별도 없음. `import app.routes...`는 함수 내 지역변수 app(Flask)을 모듈로 가려 register_blueprint 깨짐)
  from app.routes import dict_admin  # noqa: F401  (사전 동기화 — admin_bp에 /dict/* 라우트 등록)

  app.register_blueprint(health_bp)
  app.register_blueprint(auth_bp)
  app.register_blueprint(search_bp)
  app.register_blueprint(tts_bp)
  app.register_blueprint(fcm_bp)
  app.register_blueprint(drive_bp)
  app.register_blueprint(mainpage_bp)
  app.register_blueprint(version_bp)
  app.register_blueprint(user_voca_book_bp)
  app.register_blueprint(purchase_bp)
  app.register_blueprint(ocr_bp)
  app.register_blueprint(voca_indexs_bp)
  app.register_blueprint(voca_books_bp)
  app.register_blueprint(study_bp)
  app.register_blueprint(insights_bp)
  app.register_blueprint(onboarding_bp)
  app.register_blueprint(game_bp)
  app.register_blueprint(admin_bp)
  app.register_blueprint(admin_voca_books_bp)

  # FCM 스케줄러 시작
  from app.routes.fcm import create_scheduler
  create_scheduler(app)

  return app
