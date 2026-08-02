"""
store_version.py — 앱 업데이트 안내값(app_ios_version / app_android_version)을 **스토어 실조회**로 채운다.

왜 필요한가: 이 값들은 지금까지 `routes/version.py` 에 손으로 적어 왔다. 손으로 관리하면 두 방향으로
모두 사고가 난다.

  · 낮게 방치 → 새 버전을 출시해도 사용자가 "업데이트하세요" 안내를 못 받는다. 구버전 앱이 계속
    남고, 그 구버전에 없는 네이티브 기능을 최신 웹이 부르면서 "버그처럼 보이는 무반응"이 생긴다.
    (2026-08-01 실측: 스토어는 1.0.5 인데 안내값은 1.0.1 이라 1.0.2~1.0.4 사용자에게 안내가 0건이었다.)
  · 게시 전에 미리 올림 → 사용자가 아직 존재하지 않는 버전으로 안내받는다. 스토어에 가도 그 버전이
    없으니 업데이트를 못 하고, 앱을 다시 열면 또 안내가 뜬다 = 무한 업데이트 모달.

그래서 **사람이 적는 값이 아니라 스토어가 말하는 값**을 쓴다. 스토어에 실제로 올라간 뒤에야 값이
올라가므로 위 두 사고가 구조적으로 불가능해진다.

안전 규율(전부 CodingPT 에서 실측으로 얻은 것):
  1. **캐시버스터 필수.** iTunes lookup 은 같은 URL 로 반복 조회하면 CDN 이 낡은 값을 무기한 고정한다.
     `_cb=<epoch>` 를 붙이면 즉시 최신이 나온다(반복 재현).
  2. **조회 실패는 값을 내리지 않는다.** 실패하면 마지막 성공값 → env → 하드코딩 폴백 순으로 내려가고,
     그 어느 것도 현재보다 낮으면 채택하지 않는다. "모르면 그대로 둔다" 가 항상 안전한 쪽이다.
  3. **Play 는 공식 공개 조회 API 가 없다.** 상세 페이지의 내장 데이터를 긁는 부서지기 쉬운 경로라,
     실패하면 조용히 폴백한다(파싱이 깨져도 최악이 "기존 동작 유지").
  4. 요청 경로에서 절대 오래 붙잡지 않는다(앱 시작이 느려진다). 짧은 타임아웃 + 캐시.
"""
import os
import re
import time

import requests

from app import cache

# ── 대상 ──────────────────────────────────────────────────────────────
IOS_APP_ID = os.getenv('APP_STORE_APP_ID', '6751544570')
PLAY_PACKAGE = os.getenv('PLAY_PACKAGE', 'com.ghmate.heyvoca')

# 조회가 전부 실패했을 때의 최종 폴백. **스토어에 실제로 게시된 적이 있는 값만** 적을 것
#  (여기에 미출시 버전을 적으면 무한 업데이트 모달이 된다). env 로 덮어쓸 수 있다.
FALLBACK_IOS = os.getenv('APP_LATEST_IOS', '1.0.5')
FALLBACK_ANDROID = os.getenv('APP_LATEST_ANDROID', '1.0.5')

_FRESH_TTL = 60 * 60        # 스토어 재조회 주기(1시간) — 게시 반영 자체가 수십 분 단위라 충분하다
_LAST_GOOD_TTL = 7 * 24 * 3600  # 마지막 성공값 보관(7일) — 스토어가 잠시 죽어도 안내가 무너지지 않게
_HTTP_TIMEOUT = 2.5         # 앱 시작 경로다 — 길게 잡으면 첫 사용자가 그만큼 기다린다

_KEY_FRESH = 'store_version:fresh:{}'
_KEY_LAST_GOOD = 'store_version:last_good:{}'


def _parse(version):
    """'1.2.3' → (1, 2, 3). 비교용. 숫자가 아닌 조각은 0 으로 본다."""
    parts = []
    for chunk in str(version or '').split('.'):
        digits = ''.join(ch for ch in chunk if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts) if parts else (0,)


def _higher(a, b):
    """a 가 b 보다 높으면 a, 아니면 b. 안내값이 **내려가지 않게** 하는 유일한 관문."""
    if not a:
        return b
    if not b:
        return a
    return a if _parse(a) > _parse(b) else b


def _fetch_ios():
    """App Store 게시 버전. 실패하면 None."""
    try:
        res = requests.get(
            'https://itunes.apple.com/lookup',
            # ⚠ _cb 없으면 iTunes CDN 이 낡은 값을 고정한다(실측). country 는 게시 지역.
            params={'id': IOS_APP_ID, 'country': 'kr', '_cb': int(time.time())},
            timeout=_HTTP_TIMEOUT,
        )
        if res.status_code != 200:
            return None
        results = (res.json() or {}).get('results') or []
        return (results[0].get('version') or None) if results else None
    except Exception:
        return None


_PLAY_VERSION_RE = re.compile(r'"141":\[\[\["([0-9.]+)"\]\]')


def _fetch_android():
    """
    Play 게시 버전. 공식 공개 API 가 없어 상세 페이지 내장 데이터에서 읽는다.
    ⚠ 부서지기 쉬운 경로다 — 페이지 구조가 바뀌면 None 이 되고 폴백이 받는다(그게 정상 동작이다).
       정확한 값이 꼭 필요하면 서비스계정 API(scripts/store/play.mjs)를 쓸 것.
    """
    try:
        res = requests.get(
            'https://play.google.com/store/apps/details',
            params={'id': PLAY_PACKAGE, 'hl': 'ko', '_cb': int(time.time())},
            headers={'User-Agent': 'Mozilla/5.0'},
            timeout=_HTTP_TIMEOUT,
        )
        if res.status_code != 200:
            return None
        match = _PLAY_VERSION_RE.search(res.text)
        return match.group(1) if match else None
    except Exception:
        return None


def _resolve(platform, fetcher, fallback):
    """
    한 플랫폼의 안내값을 정한다. 반환: (version, source)
      source 는 **진단 전용**이다 — 클라이언트가 이걸로 기능을 분기하면 안 된다.
    """
    fresh_key = _KEY_FRESH.format(platform)
    good_key = _KEY_LAST_GOOD.format(platform)

    cached = None
    try:
        cached = cache.get(fresh_key)
    except Exception:
        cached = None
    if cached:
        return cached, 'cache'

    fetched = fetcher()
    if fetched:
        # 스토어가 폴백보다 낮은 값을 말하는 일은 정상적으로는 없다(지역 미출시 등 이상 상황).
        #  그럴 때 값을 내리면 사용자가 구버전으로 안내받으므로 높은 쪽을 택한다.
        value = _higher(fetched, fallback)
        try:
            cache.set(fresh_key, value, timeout=_FRESH_TTL)
            cache.set(good_key, value, timeout=_LAST_GOOD_TTL)
        except Exception:
            pass
        return value, 'store'

    try:
        last_good = cache.get(good_key)
    except Exception:
        last_good = None
    if last_good:
        return _higher(last_good, fallback), 'last_good'

    return fallback, 'fallback'


def get_ios_version():
    return _resolve('ios', _fetch_ios, FALLBACK_IOS)


def get_android_version():
    return _resolve('android', _fetch_android, FALLBACK_ANDROID)


def get_versions():
    """
    안내값 한 벌. 조회가 어떻게 되든 **항상 값을 돌려준다**(예외를 밖으로 던지지 않는다) —
    이 API 가 실패하면 앱이 시작 화면에서 멈추므로, 여기서는 어떤 경우에도 응답이 나가야 한다.
    """
    try:
        ios, ios_src = get_ios_version()
    except Exception:
        ios, ios_src = FALLBACK_IOS, 'fallback'
    try:
        android, android_src = get_android_version()
    except Exception:
        android, android_src = FALLBACK_ANDROID, 'fallback'
    return {
        'ios': ios,
        'android': android,
        'source': {'ios': ios_src, 'android': android_src},
    }
