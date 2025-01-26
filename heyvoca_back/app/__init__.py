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
import json

from app.login_manager import load_user, unauthorized_callback

db = SQLAlchemy()
login_manager = LoginManager()

def create_app():
  app = Flask(__name__, static_folder='static', static_url_path='')
  CORS(app, supports_credentials=True)
  
  config_class = os.environ.get('FLASK_CONFIG') or 'development'
  if config_class == 'production':
    app.config.from_object(ProductionConfig)
  elif config_class == 'staging':
    app.config.from_object(StagingConfig)
  else:
    app.config.from_object(DevelopmentConfig) 

  # 추가적인 초기화 코드 (블루프린트 등록 등)
  db.init_app(app)
  login_manager.init_app(app)
  # login_manager.login_view = "main_login.html"

  login_manager.user_loader(load_user)
  login_manager.unauthorized_handler(unauthorized_callback)

  # # 모든 모델 클래스들을 한번에 import
  from app.models import models  
  from app.routes.login import login_bp
  from app.routes.search import search_bp
  from app.routes.tts import tts_bp
  from app.routes.fcm import fcm_bp
  from app.routes.drive import drive_bp
  from app.routes.mainpage import mainpage_bp
  from app.routes.check import check_bp
  
  app.register_blueprint(login_bp)
  app.register_blueprint(search_bp)
  app.register_blueprint(tts_bp)
  app.register_blueprint(fcm_bp)
  app.register_blueprint(drive_bp)
  app.register_blueprint(mainpage_bp)
  app.register_blueprint(check_bp)
  
  return app
