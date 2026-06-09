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

    # JWT — 시크릿은 환경변수 필수. 하드코딩 디폴트('dev-key') 제거.
    # prod/staging은 create_app()에서 미설정 시 기동 중단(fail-fast). local/dev는 제외.
    SECRET_KEY = os.getenv('SECRET_KEY')
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

    # 커넥션 풀 — 유휴 연결 stale 방지(pre_ping)로 'MySQL server has gone away' 제거,
    # 주기적 재활용(recycle). MySQL 기본 max_connections(151) 대비
    # 워커4 × (pool_size10 + overflow5)=60 으로 여유.
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'max_overflow': 5,
        'pool_recycle': 1800,
        'pool_pre_ping': True,
    }

    # MinIO (heyvoca 통합 버킷 — dict/ dump, tts/ 음성 등 폴더로 구분)
    MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'https://objectstore.ghmate.com')
    MINIO_BUCKET = os.getenv('MINIO_BUCKET', 'heyvoca')
    MINIO_DICT_RO_KEY = os.getenv('MINIO_DICT_RO_KEY')
    MINIO_DICT_RO_SECRET = os.getenv('MINIO_DICT_RO_SECRET')
    MINIO_DICT_RW_KEY = os.getenv('MINIO_DICT_RW_KEY')
    MINIO_DICT_RW_SECRET = os.getenv('MINIO_DICT_RW_SECRET')

    # TTS (외부 AI 음성 + objectstore 캐싱)
    #   provider/model/voice는 캐시 object key에 인코딩되어 교체 시 충돌 없음(다국어/다모델 확장).
    #   음성 저장은 위 MINIO_BUCKET(heyvoca)의 tts/ prefix, 기존 dict RW 키 재사용.
    TTS_PROVIDER = os.getenv('TTS_PROVIDER', 'elevenlabs')      # elevenlabs | gtts
    TTS_MODEL = os.getenv('TTS_MODEL', 'eleven_flash_v2_5')
    TTS_VOICE_EN = os.getenv('TTS_VOICE_EN')                    # ElevenLabs voice_id (영어)
    TTS_VOICE_KO = os.getenv('TTS_VOICE_KO')                    # ElevenLabs voice_id (한국어)
    ELEVENLABS_API_KEY = os.getenv('ELEVENLABS_API_KEY')
    ELEVENLABS_BASE_URL = os.getenv('ELEVENLABS_BASE_URL', 'https://api.elevenlabs.io')
    TTS_PREFIX = os.getenv('TTS_PREFIX', 'tts')                 # object key 최상위 폴더
    TTS_PRESIGN_TTL = int(os.getenv('TTS_PRESIGN_TTL', 3600))   # presigned GET URL 만료(초)
    TTS_MAX_CHARS = int(os.getenv('TTS_MAX_CHARS', 500))        # 생성 허용 텍스트 길이 상한
    TTS_GENERATE_REQUIRE_DICT = os.getenv('TTS_GENERATE_REQUIRE_DICT', 'true').lower() == 'true'
    TTS_RATE_LIMIT = os.getenv('TTS_RATE_LIMIT', '30 per minute')  # 생성(miss) 경로 rate limit
    TTS_DAILY_GEN_CAP = int(os.getenv('TTS_DAILY_GEN_CAP', 1000))  # user별 일일 생성 상한(0=무제한)

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
