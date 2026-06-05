"""objectstore(MinIO) 래퍼 — TTS 음성 객체 존재확인/업로드/presigned URL.

기존 dict_publish.py / dict_sync.py 패턴 재사용(minio==7.2.7).
버킷은 MINIO_BUCKET(heyvoca), 쓰기/서명은 기존 dict RW 키 재사용.
Flask app context 없이도 동작(prewarm 스크립트 공용) → os.getenv로 설정 로드.
"""
import io
import os
from datetime import timedelta
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from .base import TTSConfigError

# 객체 없음으로 간주할 S3 에러 코드
_NOT_FOUND_CODES = {'NoSuchKey', 'NoSuchObject', 'NotFound', 'ResourceNotFound'}


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
        # region을 명시해 GetBucketLocation 호출을 생략(키 정책이 버킷 location 조회를
        # 막아도 object 작업이 동작하도록). objectstore(MinIO)는 region 값을 검증하지 않음.
        self._client = Minio(
            parsed.netloc,
            access_key=access_key,
            secret_key=secret_key,
            secure=(parsed.scheme == 'https'),
            region=os.getenv('MINIO_REGION', 'us-east-1'),
        )

    def exists(self, key: str) -> bool:
        # stat_object(HeadObject)는 이 objectstore/Cloudflare 경로에서 간헐적 stale 403을
        # 반환해 멱등성이 깨진다(캐시된 객체가 '없음'으로 오판 → 불필요한 재생성/404).
        # ListObjects(강한 일관성, HEAD 캐싱 영향 없음)로 정확히 존재를 판정한다.
        try:
            for obj in self._client.list_objects(self.bucket, prefix=key, recursive=True):
                if obj.object_name == key:
                    return True
            return False
        except S3Error:
            # 조회 자체 실패 시 보수적으로 '없음'(생성 경로의 put이 멱등하게 덮어씀)
            return False

    def put_audio(self, key: str, data: bytes, content_type: str = 'audio/mpeg') -> None:
        self._client.put_object(
            self.bucket,
            key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    def presigned_get(self, key: str, ttl_seconds: int = 3600) -> str:
        return self._client.presigned_get_object(
            self.bucket, key, expires=timedelta(seconds=ttl_seconds)
        )
