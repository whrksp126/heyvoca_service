import os
from dotenv import load_dotenv

load_dotenv()

class Config:
  SECRET_KEY = os.environ.get('SECRET_KEY') or 'hard_to_guess_secret_key'
  SQLALCHEMY_TRACK_MODIFICATIONS = False

class DevelopmentConfig(Config):
  DEBUG = True
  SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or 'mysql+pymysql://root:password@localhost/mydatabase'

class StagingConfig(Config):
  DEBUG = False
  SQLALCHEMY_DATABASE_URI = os.environ.get('STG_DATABASE_URL') or 'mysql+pymysql://root:password@localhost/mydatabase'

class ProductionConfig(Config):
  DEBUG = False
  SQLALCHEMY_DATABASE_URI = os.environ.get('PROD_DATABASE_URL') or 'mysql+pymysql://root:password@localhost/mydatabase'


# Google OAuth2 정보 설정
OAUTH_CLIENT_ID = os.environ.get('OAUTH_CLIENT_ID')
OAUTH_CLIENT_SECRET = os.environ.get('OAUTH_CLIENT_SECRET')
OAUTH_REDIRECT_URI = os.environ.get('OAUTH_REDIRECT_URI')

# FCM
FCM_API_KEY = os.environ.get('FCM_API_KEY')