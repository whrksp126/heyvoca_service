import os
from dotenv import load_dotenv

# 환경에 맞는 .env 파일 로드
env = os.getenv('FLASK_ENV', 'development')
env_file = f'.env.{env}' if env != 'production' else '.env'

if os.path.exists(env_file):
    load_dotenv(env_file)
else:
    load_dotenv('.env')

FRONT_END_URL = os.getenv('FRONT_END_URL')
GOOGLE_WEB_CLIENT_ID = os.getenv('GOOGLE_WEB_CLIENT_ID')
ACCESS_SECRET = os.getenv('ACCESS_SECRET')
REFRESH_SECRET = os.getenv('REFRESH_SECRET')
OAUTH_CLIENT_SECRET = os.getenv('OAUTH_CLIENT_SECRET')

class Config:
    """Base configuration"""
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_AS_ASCII = False

    # JWT
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key')
    ACCESS_SECRET = os.getenv('ACCESS_SECRET')
    REFRESH_SECRET = os.getenv('REFRESH_SECRET')
    ACCESS_TTL_SECONDS = int(os.getenv('ACCESS_TTL_SECONDS', 3600))

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///test.db')

    # Redis
    REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
    REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))

    # Google OAuth
    GOOGLE_WEB_CLIENT_ID = os.getenv('GOOGLE_WEB_CLIENT_ID')
    GOOGLE_ANDROID_CLIENT_ID = os.getenv('GOOGLE_ANDROID_CLIENT_ID')
    GOOGLE_IOS_CLIENT_ID = os.getenv('GOOGLE_IOS_CLIENT_ID')
    OAUTH_CLIENT_SECRET = os.getenv('OAUTH_CLIENT_SECRET')

    # Apple OAuth
    APPLE_CLIENT_ID = os.getenv('APPLE_CLIENT_ID')
    APPLE_SHARED_SECRET = os.getenv('APPLE_SHARED_SECRET')
    APPLE_APP_STORE_CONNECT_ISSUER_ID = os.getenv('APPLE_APP_STORE_CONNECT_ISSUER_ID')
    APPLE_APP_STORE_CONNECT_KEY_ID = os.getenv('APPLE_APP_STORE_CONNECT_KEY_ID')
    APPLE_APP_STORE_CONNECT_PRIVATE_KEY = os.getenv('APPLE_APP_STORE_CONNECT_PRIVATE_KEY')

    # FCM
    FCM_API_KEY = os.getenv('FCM_API_KEY')

    # Google Play
    GOOGLE_PLAY_SERVICE_ACCOUNT_KEY = os.getenv('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY')

class LocalConfig(Config):
    """Local development configuration"""
    DEBUG = True
    TESTING = False

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class StagingConfig(Config):
    """Staging configuration"""
    DEBUG = False
    TESTING = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
