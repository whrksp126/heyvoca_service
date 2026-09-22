"""objectstore(MinIO) 래퍼 — TTS 음성 객체 존재확인/업로드/presigned URL.

기존 dict_publish.py / dict_sync.py 패턴 재사용(minio==7.2.7).
버킷은 MINIO_BUCKET(heyvoca), 쓰기/서명은 기존 dict RW 키 재사용.

엔드포인트는 둘로 나뉜다(app/services/objectstore_endpoint.py):
  - 객체 작업(exists/put/get): MINIO_INTERNAL_ENDPOINT가 있으면 그 주소(서버↔서버).
  - presigned 서명: 항상 MINIO_ENDPOINT(공개) — URL을 요청하는 주체가 사용자 기기다.
Flask app context 없이도 동작(prewarm 스크립트 공용) → os.getenv로 설정 로드.
"""
import io
import json
import logging
import os
from datetime import timedelta
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from ..objectstore_endpoint import internal_endpoint, public_endpoint
from .base import TTSConfigError

logger = logging.getLogger(__name__)

# 객체 없음으로 간주할 S3 에러 코드
_NOT_FOUND_CODES = {'NoSuchKey', 'NoSuchObject', 'NotFound', 'ResourceNotFound'}

# 시계 오차(호스트 시각이 objectstore와 15분 이상 어긋남) 에러 코드.
# 정전 재부팅 직후 잠깐 틀어진 시계로 서명하면 발생. 싱글턴 Minio 클라이언트가
# 낡은 시각 오프셋을 캐시하면 시계 복구 후에도 계속 실패 → 클라이언트 재생성으로 리셋.
_SKEW_CODES = {'RequestTimeTooSkewed'}


class TTSStorage:
    """role='ro': 존재확인/presigned 서명용(RO 키 우선, 없으면 RW).
    role='rw': 업로드(put)용 — RW 키 필수.
    """

    def __init__(self, role='rw', endpoint=None, bucket=None, access_key=None, secret_key=None):
        # 서버 측 객체 작업(exists/put/get)은 내부 엔드포인트로 — 같은 호스트의 MinIO를
        # 공개 도메인(Cloudflare)으로 왕복하지 않게 한다. MINIO_INTERNAL_ENDPOINT가
        # 없으면 공개 엔드포인트와 같은 값이라 기존 동작 그대로.
        # endpoint를 명시로 넘기면(테스트/스크립트) 서명까지 그 주소를 쓴다.
        explicit_endpoint = endpoint is not None
        endpoint = endpoint or internal_endpoint()
        sign_endpoint = endpoint if explicit_endpoint else public_endpoint()
        self.bucket = bucket or os.getenv('MINIO_BUCKET', 'heyvoca')
        if access_key and secret_key:
            pass
        elif role == 'ro':
            # 서명/조회는 RO로 충분 — RO 우선, 없으면 RW로 폴백
            access_key = os.getenv('MINIO_DICT_RO_KEY') or os.getenv('MINIO_DICT_RW_KEY')
            secret_key = os.getenv('MINIO_DICT_RO_SECRET') or os.getenv('MINIO_DICT_RW_SECRET')
        else:
            access_key = os.getenv('MINIO_DICT_RW_KEY')
            secret_key = os.getenv('MINIO_DICT_RW_SECRET')
        if not (access_key and secret_key):
            need = 'RW(MINIO_DICT_RW_KEY/SECRET)' if role == 'rw' else 'RO 또는 RW'
            raise TTSConfigError(f'MinIO {need} 키 미설정.')
        parsed = urlparse(endpoint)
        signed = urlparse(sign_endpoint)
        # 재생성(오프셋 리셋)에 필요한 접속 파라미터를 보관.
        self._endpoint_netloc = parsed.netloc
        self._secure = (parsed.scheme == 'https')
        # presigned 서명 전용 접속 파라미터(항상 공개 엔드포인트).
        self._sign_netloc = signed.netloc
        self._sign_secure = (signed.scheme == 'https')
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = os.getenv('MINIO_REGION', 'us-east-1')
        self._client = self._build_client()
        self._sign_client = None   # 내부≠공개일 때만 따로 생성(lazy)

    def _build_client(self, netloc=None, secure=None) -> Minio:
        # region을 명시해 GetBucketLocation 호출을 생략(키 정책이 버킷 location 조회를
        # 막아도 object 작업이 동작하도록). objectstore(MinIO)는 region 값을 검증하지 않음.
        return Minio(
            netloc if netloc is not None else self._endpoint_netloc,
            access_key=self._access_key,
            secret_key=self._secret_key,
            secure=self._secure if secure is None else secure,
            region=self._region,
        )

    def _signing_client(self) -> Minio:
        """presigned URL 서명 전용 클라이언트 — **반드시 공개 엔드포인트**.

        presigned URL은 서명에 호스트가 들어가고, 그 URL을 실제로 요청하는 주체는
        사용자 기기다. 내부 주소(http://minio:9000)로 서명하면 기기에서 접근 불가 →
        내부/공개가 다를 때만 별도 클라이언트를 만들어 서명한다.
        """
        if (self._sign_netloc == self._endpoint_netloc
                and self._sign_secure == self._secure):
            return self._client
        if self._sign_client is None:
            self._sign_client = self._build_client(self._sign_netloc, self._sign_secure)
        return self._sign_client

    def _with_skew_retry(self, fn):
        # RequestTimeTooSkewed는 싱글턴 클라이언트가 낡은 시각 오프셋을 캐시해 생기므로,
        # 클라이언트를 새로 만들어(오프셋 리셋) 1회 재시도하면 시계 복구 후 자동 회복된다.
        try:
            return fn()
        except S3Error as e:
            if getattr(e, 'code', '') in _SKEW_CODES:
                logger.warning('MinIO RequestTimeTooSkewed 감지 → 클라이언트 재생성 후 1회 재시도')
                self._client = self._build_client()
                return fn()
            raise

    def exists(self, key: str) -> bool:
        # stat_object(HeadObject)는 이 objectstore/Cloudflare 경로에서 간헐적 stale 403을
        # 반환해 멱등성이 깨진다(캐시된 객체가 '없음'으로 오판 → 불필요한 재생성/404).
        # ListObjects(강한 일관성, HEAD 캐싱 영향 없음)로 정확히 존재를 판정한다.
        def _do() -> bool:
            for obj in self._client.list_objects(self.bucket, prefix=key, recursive=True):
                if obj.object_name == key:
                    return True
            return False
        try:
            return self._with_skew_retry(_do)
        except S3Error:
            # 조회 자체 실패 시 보수적으로 '없음'(생성 경로의 put이 멱등하게 덮어씀)
            return False

    def put_audio(self, key: str, data: bytes, content_type: str = 'audio/mpeg',
                  metadata: dict = None) -> None:
        # metadata는 x-amz-meta-* 사용자 메타데이터로 저장됨(값은 ASCII만 허용 →
        # 한글 등은 호출측에서 URL-encode해 전달). 키 자체는 해시라 어떤 파일인지
        # 콘솔/프로그램에서 확인하려면 이 메타데이터(text/lang/provider/voice)를 본다.
        # data는 재시도 시 재사용되므로 매 시도마다 새 BytesIO로 감싼다(스트림 소진 방지).
        def _do() -> None:
            self._client.put_object(
                self.bucket,
                key,
                io.BytesIO(data),
                length=len(data),
                content_type=content_type,
                metadata=metadata or None,
            )
        self._with_skew_retry(_do)

    def put_json(self, key: str, obj) -> None:
        """단어 타이밍(alignment) 등 JSON 메타를 오디오와 나란히 저장.

        object_key_json_for()로 오디오 key에서 파생한 key를 넘긴다.
        """
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')

        def _do() -> None:
            self._client.put_object(
                self.bucket,
                key,
                io.BytesIO(data),
                length=len(data),
                content_type='application/json',
            )
        self._with_skew_retry(_do)

    def get_json(self, key: str):
        """JSON 객체를 읽어 파싱해 반환. 없으면(또는 파싱 실패) None."""
        def _do():
            response = self._client.get_object(self.bucket, key)
            try:
                return json.loads(response.read())
            finally:
                response.close()
                response.release_conn()
        try:
            return self._with_skew_retry(_do)
        except S3Error as e:
            if getattr(e, 'code', '') in _NOT_FOUND_CODES:
                return None
            logger.warning('TTS alignment JSON 조회 실패(%s): %s', key, e)
            return None
        except Exception as e:
            logger.warning('TTS alignment JSON 파싱 실패(%s): %s', key, e)
            return None

    def presigned_get(self, key: str, ttl_seconds: int = 3600) -> str:
        # 클라이언트에 그대로 전달되는 URL → 서명은 공개 엔드포인트로만.
        def _do():
            return self._signing_client().presigned_get_object(
                self.bucket, key, expires=timedelta(seconds=ttl_seconds)
            )
        try:
            return _do()
        except S3Error as e:
            if getattr(e, 'code', '') in _SKEW_CODES:
                logger.warning('MinIO RequestTimeTooSkewed(서명) 감지 → 클라이언트 재생성 후 1회 재시도')
                self._sign_client = None
                self._client = self._build_client()
                return _do()
            raise
