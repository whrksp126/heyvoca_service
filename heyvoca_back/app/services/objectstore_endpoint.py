"""objectstore(MinIO) 엔드포인트 결정 — 내부 전송용 / 공개(서명)용 분리.

- ``MINIO_ENDPOINT``          : 공개 엔드포인트(기본 https://objectstore.ghmate.com).
  Cloudflare를 거치며, **최종 사용자 기기가 실제로 요청하는 호스트**다.
- ``MINIO_INTERNAL_ENDPOINT`` : (선택) 같은 호스트의 MinIO에 직접 붙는 내부 주소
  (예: ``http://minio:9000``). **서버 ↔ objectstore 전송에만** 쓴다.

왜 나누나:
  사전 dump(50MB+)나 TTS 객체를 공개 호스트로 주고받으면 같은 머신에 있는
  MinIO인데도 트래픽이 CDN을 왕복한다(실측: 51MB 다운로드 93초, 업로드 503+재시도).
  내부 주소를 쓰면 이 왕복이 사라진다.

왜 presigned만은 공개 주소여야 하나:
  presigned URL은 "그 URL이 요청될 호스트"에 대해 서명된다. 내부 주소로 서명하면
  앱/브라우저에서 접근 자체가 안 되거나 SignatureDoesNotMatch가 난다.
  따라서 **클라이언트에 반환되는 URL을 만드는 경로는 항상 공개 엔드포인트**를 쓴다.

``MINIO_INTERNAL_ENDPOINT``가 없으면 내부=공개 → 기존 동작과 완전히 동일하다.
"""
import os

DEFAULT_PUBLIC_ENDPOINT = 'https://objectstore.ghmate.com'


def public_endpoint() -> str:
    """앱/브라우저가 접근하는 공개 엔드포인트. presigned 서명은 반드시 이 값으로."""
    return os.getenv('MINIO_ENDPOINT') or DEFAULT_PUBLIC_ENDPOINT


def internal_endpoint() -> str:
    """서버 측 객체 전송용 엔드포인트. 미설정이면 공개 엔드포인트와 동일."""
    return os.getenv('MINIO_INTERNAL_ENDPOINT') or public_endpoint()


def has_internal_endpoint() -> bool:
    """내부 엔드포인트가 따로 설정되어 있는지(= 공개와 다른지)."""
    return internal_endpoint() != public_endpoint()
