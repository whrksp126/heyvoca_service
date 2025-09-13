import os
from flask import Flask
from config import DevelopmentConfig, StagingConfig, ProductionConfig
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from sqlalchemy.ext.declarative import declarative_base
from contextlib import contextmanager
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine, text
from flask_cors import CORS
from flask_caching import Cache
import json

from app.login_manager import load_user, unauthorized_callback
from werkzeug.middleware.proxy_fix import ProxyFix

# 로컬 테스트 전용
env_file = os.environ.get('FLASK_ENV_FILE')
if env_file == 'local':
  os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'


db = SQLAlchemy()
login_manager = LoginManager()
cache = Cache()

def create_app():
  app = Flask(__name__, static_folder='static', static_url_path='')
  CORS(app, origins=[
      "https://heyvoca-front.ghmate.com",
      "https://stg-heyvoca-front.ghmate.com",
      "https://dev-heyvoca-front.ghmate.com",
      "http://localhost:3000",
      "http://10.0.2.2:3000",
  ], supports_credentials=True)

  
  config_class = os.environ.get('FLASK_CONFIG') or 'development'
  if config_class == 'production':
    app.config.from_object(ProductionConfig)
  elif config_class == 'staging':
    app.config.from_object(StagingConfig)
  else:
    app.config.from_object(DevelopmentConfig) 

  app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

  app.config['JSON_AS_ASCII'] = False

  # Redis 캐시 설정
  app.config['CACHE_TYPE'] = 'redis'
  app.config['CACHE_REDIS_HOST'] = os.getenv('REDIS_HOST', 'redis')
  app.config['CACHE_REDIS_PORT'] = int(os.getenv('REDIS_PORT', 6379))
  app.config['CACHE_REDIS_DB'] = 0

  # 추가적인 초기화 코드 (블루프린트 등록 등)
  db.init_app(app)
  login_manager.init_app(app)
  cache.init_app(app)
  # login_manager.login_view = "main_login.html"

  login_manager.user_loader(load_user)
  login_manager.unauthorized_handler(unauthorized_callback)

  # # 모든 모델 클래스들을 한번에 import
  from app.models import models  
  from app.routes.auth import auth_bp
  from app.routes.search import search_bp
  from app.routes.tts import tts_bp
  from app.routes.fcm import fcm_bp
  from app.routes.drive import drive_bp
  from app.routes.mainpage import mainpage_bp
  from app.routes.version import version_bp
  from app.routes.user_voca_book import user_voca_book_bp
  
  app.register_blueprint(auth_bp)
  app.register_blueprint(search_bp)
  app.register_blueprint(tts_bp)
  app.register_blueprint(fcm_bp)
  app.register_blueprint(drive_bp)
  app.register_blueprint(mainpage_bp)
  app.register_blueprint(version_bp)
  app.register_blueprint(user_voca_book_bp)

  return app
