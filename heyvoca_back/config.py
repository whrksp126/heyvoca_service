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

    # Database (사용자 데이터: heyvoca_user)
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///test.db')

    # Database (사전 데이터: heyvoca_dict, 별도 schema)
    # 모델에 __bind_key__ = 'dict'이 설정된 클래스가 이 connection 사용
    SQLALCHEMY_BINDS = {
        'dict': os.getenv('DATABASE_URL_DICT', SQLALCHEMY_DATABASE_URI),
    }

    # MinIO (사전 dump 저장소)
    MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'https://objectstore.ghmate.com')
    MINIO_BUCKET = os.getenv('MINIO_BUCKET', 'heyvoca-dict')
    MINIO_DICT_RO_KEY = os.getenv('MINIO_DICT_RO_KEY')
    MINIO_DICT_RO_SECRET = os.getenv('MINIO_DICT_RO_SECRET')
    MINIO_DICT_RW_KEY = os.getenv('MINIO_DICT_RW_KEY')
    MINIO_DICT_RW_SECRET = os.getenv('MINIO_DICT_RW_SECRET')

    # 사전 자동 갱신 토글
    APP_ENV = os.getenv('APP_ENV', 'local')  # local/dev/stg/prod
    DICT_AUTO_RESET = os.getenv('DICT_AUTO_RESET', 'true').lower() == 'true'
    DICT_AUTO_RESET_ALLOW_PROD = os.getenv('DICT_AUTO_RESET_ALLOW_PROD', 'false').lower() == 'true'

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
