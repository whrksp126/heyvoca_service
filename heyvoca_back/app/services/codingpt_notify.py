"""CodingPT 알림 채널(웹훅) 전송 — 운영 장애·일일 실적 알림 (2026-11).

  notify(title, text=None, level='info', fields=None, dedupe_key=None, source=None)

- 환경변수 CODINGPT_WEBHOOK_URL 이 없으면 아무것도 하지 않는다. dev·local .env 에는 URL 을 넣지 않으므로
  자연히 prod 만 보낸다. URL 자체가 비밀이다 — 로그·코드에 남기지 않는다.
- urllib + daemon thread, timeout 3초. 모든 예외를 삼킨다 — 요청 경로를 막지도, 실패시키지도 않는다.
- 본문에 이메일·토큰·비밀값을 넣지 말 것. 사용자는 내부 id 로만 가리킨다.
- 같은 dedupe_key 는 CodingPT 쪽에서 1시간 동안 한 줄로 묶인다(채널당 분당 120건 제한).

운영 카운터(Redis INCR) — 자정 실적(app/services/ops_daily_report.py)이 읽는다.
  heyvoca:ops:5xx:<KST YYYYMMDD>   5xx 응답 수(처리된 500 포함)
  heyvoca:ops:exc:<KST YYYYMMDD>   처리되지 않은 예외 수(알림 대상)
"""
import datetime as dt
import json
import logging
import os
import threading
import urllib.request

logger = logging.getLogger(__name__)

LEVELS = ('info', 'success', 'warning', 'error', 'critical')
TIMEOUT_SEC = 3
MAX_TITLE, MAX_TEXT, MAX_SOURCE, MAX_FIELDS = 200, 8000, 60, 20
OPS_KEY_PREFIX = 'heyvoca:ops'
OPS_TTL_SEC = 3 * 24 * 3600
KST = dt.timedelta(hours=9)


def webhook_url():
    return (os.getenv('CODINGPT_WEBHOOK_URL') or '').strip()


def env_name():
    """'prod' | 'dev' | 'local' … — config.APP_ENV 가 정본, 없으면 FLASK_CONFIG 로 추정."""
    env = (os.getenv('APP_ENV') or '').strip()
    if env:
        return env
    fc = (os.getenv('FLASK_CONFIG') or '').strip()
    return {'production': 'prod', 'development': 'dev', 'local': 'local'}.get(fc, fc or 'unknown')


def build_version():
    """배포 식별값(있을 때만). 현재 이미지에는 커밋 정보가 없어 보통 None."""
    for k in ('APP_VERSION', 'GIT_COMMIT', 'GIT_SHA', 'BUILD_ID'):
        v = (os.getenv(k) or '').strip()
        if v:
            return v[:40]
    return None


def _clip(s, n):
    s = '' if s is None else str(s)
    return s if len(s) <= n else s[:n - 1] + '…'


def build_payload(title, text=None, level='info', fields=None, dedupe_key=None, source=None, url=None):
    lv = (level or 'info').lower()
    payload = {
        'title': _clip(title or '(제목 없음)', MAX_TITLE),
        'level': lv if lv in LEVELS else 'info',
        'source': _clip(source or f'heyvoca-back@{env_name()}', MAX_SOURCE),
    }
    if text:
        # 스택은 끝부분이 중요하다 — 넘치면 앞을 자른다.
        t = str(text)
        payload['text'] = t if len(t) <= MAX_TEXT else '…' + t[-(MAX_TEXT - 1):]
    if fields:
        payload['fields'] = {_clip(k, 60): _clip(v, 200)
                             for k, v in list(fields.items())[:MAX_FIELDS] if v is not None}
    if dedupe_key:
        payload['dedupeKey'] = _clip(dedupe_key, 200)
    if url:
        payload['url'] = url
    return payload


def _post(url, payload):
    try:
        req = urllib.request.Request(
            url, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'User-Agent': 'heyvoca-back'},
            method='POST')
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
            resp.read(512)
    except Exception as e:  # noqa: BLE001 — 알림 실패는 서비스와 무관
        # URL 은 비밀이라 남기지 않는다.
        logger.warning('CodingPT 알림 전송 실패: %s', type(e).__name__)


def notify(title, text=None, level='info', fields=None, dedupe_key=None, source=None, url=None,
           wait=False):
    """fire-and-forget 전송. URL 이 없으면 False. wait=True 면 전송이 끝날 때까지(최대 3초) 기다린다
    (CLI·프로세스 종료 직전처럼 daemon 스레드가 죽기 전에 보내야 할 때)."""
    try:
        hook = webhook_url()
        if not hook:
            return False
        payload = build_payload(title, text, level, fields, dedupe_key, source, url)
        th = threading.Thread(target=_post, args=(hook, payload), daemon=True, name='codingpt-notify')
        th.start()
        if wait:
            th.join(TIMEOUT_SEC + 1)
        return True
    except Exception:
        return False


# ── 운영 카운터 ─────────────────────────────────────────────

_redis = None


def _redis_client():
    global _redis
    if _redis is None:
        import redis
        _redis = redis.Redis(host=os.getenv('REDIS_HOST', 'redis'), port=int(os.getenv('REDIS_PORT', 6379)),
                             db=0, socket_timeout=0.5, socket_connect_timeout=0.5)
    return _redis


def kst_day_str(day=None):
    d = day or (dt.datetime.utcnow() + KST).date()
    return d.strftime('%Y%m%d')


def ops_key(name, day=None):
    return f'{OPS_KEY_PREFIX}:{name}:{kst_day_str(day)}'


def bump_ops_counter(name, day=None):
    """KST 날짜별 카운터 +1 (3일 보관). Redis 실패는 삼킨다."""
    try:
        r = _redis_client()
        k = ops_key(name, day)
        pipe = r.pipeline()
        pipe.incr(k)
        pipe.expire(k, OPS_TTL_SEC)
        pipe.execute()
    except Exception:
        pass


def read_ops_counter(name, day):
    """카운터 값. 키가 없으면 0, Redis 를 못 읽으면 None."""
    try:
        v = _redis_client().get(ops_key(name, day))
        return int(v) if v is not None else 0
    except Exception:
        return None


# ── Flask / APScheduler 연결 ───────────────────────────────

def _tail(tb_text, lines=40):
    return '\n'.join((tb_text or '').rstrip().splitlines()[-lines:])


def _on_request_exception(sender, exception, **extra):
    """처리되지 않은 예외(→500). HTTPException(4xx·abort)은 보내지 않는다."""
    try:
        from werkzeug.exceptions import HTTPException
        if isinstance(exception, HTTPException):
            return
        import traceback
        from flask import g, request
        bump_ops_counter('exc')
        exc_type = type(exception).__name__
        rule = request.url_rule.rule if request.url_rule else (request.endpoint or request.path)
        tb = ''.join(traceback.format_exception(type(exception), exception, exception.__traceback__))
        fields = {'route': f'{request.method} {rule}', 'env': env_name()}
        uid = getattr(g, 'user_id', None)
        if uid:
            fields['user_id'] = str(uid)
        ver = build_version()
        if ver:
            fields['version'] = ver
        notify(f'{exc_type}: {_clip(exception, 150)}', text=_tail(tb), level='error',
               fields=fields, dedupe_key=f'api:{exc_type}:{rule}')
    except Exception:
        pass


def _count_5xx(response):
    try:
        if response.status_code >= 500:
            bump_ops_counter('5xx')
    except Exception:
        pass
    return response


def init_app(app):
    """create_app() 에서 호출. 예외 알림 시그널 + 5xx 카운터."""
    from flask import got_request_exception
    # weak=False — 모듈 함수라 상관없지만 명시적으로 강한 참조
    got_request_exception.connect(_on_request_exception, app, weak=False)
    app.after_request(_count_5xx)


def attach_scheduler_listener(scheduler):
    """APScheduler 작업 실패 → error 알림."""
    try:
        from apscheduler.events import EVENT_JOB_ERROR

        def _on_job_error(event):
            try:
                exc = event.exception
                exc_type = type(exc).__name__ if exc else 'Error'
                notify(f'스케줄러 작업 실패: {event.job_id} — {exc_type}: {_clip(exc, 120)}',
                       text=_tail(event.traceback or ''), level='error',
                       fields={'job_id': event.job_id, 'env': env_name(),
                               'scheduled': str(event.scheduled_run_time)},
                       dedupe_key=f'scheduler:{event.job_id}')
            except Exception:
                pass

        scheduler.add_listener(_on_job_error, EVENT_JOB_ERROR)
    except Exception:
        logger.warning('스케줄러 알림 리스너 등록 실패', exc_info=True)
