"""objectstore(MinIO) 래퍼 — TTS 음성 객체 존재확인/업로드/presigned URL.

기존 dict_publish.py / dict_sync.py 패턴 재사용(minio==7.2.7).
버킷은 MINIO_BUCKET(heyvoca), 쓰기/서명은 기존 dict RW 키 재사용.
Flask app context 없이도 동작(prewarm 스크립트 공용) → os.getenv로 설정 로드.
"""
import io
import logging
import os
from datetime import timedelta
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

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
        endpoint = endpoint or os.getenv('MINIO_ENDPOINT', 'https://objectstore.ghmate.com')
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
        # 재생성(오프셋 리셋)에 필요한 접속 파라미터를 보관.
        self._endpoint_netloc = parsed.netloc
        self._secure = (parsed.scheme == 'https')
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = os.getenv('MINIO_REGION', 'us-east-1')
        self._client = self._build_client()

    def _build_client(self) -> Minio:
        # region을 명시해 GetBucketLocation 호출을 생략(키 정책이 버킷 location 조회를
        # 막아도 object 작업이 동작하도록). objectstore(MinIO)는 region 값을 검증하지 않음.
        return Minio(
            self._endpoint_netloc,
            access_key=self._access_key,
            secret_key=self._secret_key,
            secure=self._secure,
            region=self._region,
        )

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

    def presigned_get(self, key: str, ttl_seconds: int = 3600) -> str:
        return self._with_skew_retry(lambda: self._client.presigned_get_object(
            self.bucket, key, expires=timedelta(seconds=ttl_seconds)
        ))
