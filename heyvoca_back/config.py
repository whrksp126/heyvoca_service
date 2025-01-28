import os
from dotenv import load_dotenv
from pathlib import Path

# .env 파일 경로 설정
env_path = Path('/var/www/heyvoca_back')
config_env = os.getenv('FLASK_CONFIG', 'development')

# 환경별 .env 파일 로드
if config_env == 'development':
  load_dotenv(dotenv_path=env_path / '.env.dev')
elif config_env == 'staging':
  load_dotenv(dotenv_path=env_path / '.env.stg')
else:
  load_dotenv(dotenv_path=env_path / '.env')

class Config:
  SECRET_KEY = os.environ.get('SECRET_KEY') or 'hard_to_guess_secret_key'
  SQLALCHEMY_TRACK_MODIFICATIONS = False

class DevelopmentConfig(Config):
  DEBUG = True
  SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'mysql+pymysql://root:password@localhost/mydatabase'

class StagingConfig(Config):
  DEBUG = False
  SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'mysql+pymysql://root:password@localhost/mydatabase'

class ProductionConfig(Config):
  DEBUG = False
  SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'mysql+pymysql://root:password@localhost/mydatabase'


# Google OAuth2 정보 설정
OAUTH_CLIENT_ID = os.environ.get('OAUTH_CLIENT_ID')
OAUTH_CLIENT_SECRET = os.environ.get('OAUTH_CLIENT_SECRET')
OAUTH_REDIRECT_URI = os.environ.get('OAUTH_REDIRECT_URI')

# FCM
FCM_API_KEY = os.environ.get('FCM_API_KEY')