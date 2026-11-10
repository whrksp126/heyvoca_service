"""사용자 일별 접속 기록 (이슈 #25 12차, 어드민 '유저 관리' 대시보드용).

before_request 훅(`record_user_activity`)이 유효한 Bearer 토큰 요청마다 호출된다.
DB 쓰기는 사용자·날짜(KST)·플랫폼별로 Redis 플래그가 없을 때만 한다 — 하루 첫 요청에 행을 만들고,
그 뒤엔 ACTIVITY_TOUCH_SEC 간격으로만 last_at·req_cnt 를 올린다. Redis 가 죽어 있으면
프로세스 메모리 dict 로 같은 간격을 지킨다.

요청 트랜잭션과 섞이지 않게 별도 커넥션(engine.begin)으로 쓰고, 어떤 예외도 요청을 막지 않는다.
"""
import datetime as dt
import logging
import time
from uuid import UUID

from flask import g, request
from sqlalchemy import text

from app.utils.app_version import current_app_version

logger = logging.getLogger(__name__)

KST = dt.timedelta(hours=9)
ACTIVITY_TOUCH_SEC = 30 * 60
_local_seen = {}


def kst_today():
    return (dt.datetime.utcnow() + KST).date()


def request_platform():
    """'ios'|'android'|'web'. 앱 UA/X-App-Version 에서 못 읽으면 X-Platform 헤더, 그다음 web."""
    info = current_app_version()
    plat = (info or {}).get('platform')
    if plat:
        return plat.lower(), (info or {}).get('version')
    hdr = (request.headers.get('X-Platform') or '').strip().lower()
    if hdr in ('ios', 'android', 'web'):
        return hdr, (info or {}).get('version')
    ua = (request.headers.get('User-Agent') or '')
    # 앱 네이티브 fetch(구버전)는 UA 가 okhttp/CFNetwork 등 — 브라우저가 아니면 플랫폼 미상
    if 'okhttp' in ua.lower():
        return 'android', (info or {}).get('version')
    if 'cfnetwork' in ua.lower() or 'darwin' in ua.lower():
        return 'ios', (info or {}).get('version')
    return 'web', (info or {}).get('version')


def _should_write(key):
    now = time.time()
    try:
        from app import cache
        # add 는 키가 없을 때만 True — 여러 워커가 동시에 와도 하나만 쓴다
        return bool(cache.add(key, 1, timeout=ACTIVITY_TOUCH_SEC))
    except Exception:
        last = _local_seen.get(key)
        if last and now - last < ACTIVITY_TOUCH_SEC:
            return False
        if len(_local_seen) > 50000:
            _local_seen.clear()
        _local_seen[key] = now
        return True


def touch_activity(user_id, platform=None, app_version=None):
    """user_id(str|UUID) 의 오늘 접속을 기록. 실패해도 조용히 넘어간다."""
    try:
        uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    except (ValueError, TypeError):
        return
    today = kst_today()
    if not _should_write(f'act:{uid.hex}:{today.isoformat()}:{platform or "-"}'):
        return
    now = dt.datetime.utcnow()
    try:
        from app import db
        with db.engine.begin() as conn:
            conn.execute(text(
                'INSERT INTO user_daily_activity '
                '(user_id, activity_date, platform, app_version, first_at, last_at, req_cnt) '
                'VALUES (:uid, :d, :p, :v, :now, :now, 1) '
                'ON DUPLICATE KEY UPDATE last_at = :now, req_cnt = req_cnt + 1, '
                'platform = COALESCE(:p, platform), app_version = COALESCE(:v, app_version)'
            ), {'uid': uid.bytes, 'd': today, 'p': platform, 'v': (app_version or None) and str(app_version)[:32],
                'now': now})
    except Exception:
        logger.warning('접속 기록 실패', exc_info=True)


def record_user_activity():
    """before_request 훅 — 유효한 Bearer 토큰이 있는 요청만 기록."""
    if request.method == 'OPTIONS' or 'Authorization' not in request.headers:
        return
    path = request.path or ''
    if path.startswith('/admin') or path.startswith('/health'):
        return
    try:
        uid = g.get('_dict_lang_user')
        if not uid:
            from app.utils.jwt_utils import optional_user_id
            uid = optional_user_id()
        if not uid:
            return
        platform, version = request_platform()
        touch_activity(uid, platform, version)
    except Exception:
        logger.warning('접속 기록 훅 오류', exc_info=True)
