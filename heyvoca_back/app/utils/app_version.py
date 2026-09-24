"""앱(네이티브/WebView) 버전 판정 — 프론트 `utils/osFunction.jsx` 의 parseAppVersion/isAppVersionAtLeast 백엔드판.

앱 버전 문자열 출처(우선순위)
  1) `X-App-Version` 헤더: "1.1.1" 또는 "iOS/1.1.1"
  2) User-Agent 의 `HeyVoca (iOS|Android)/x.y.z (build n)` (앱 WebView UA 형식)

주의: 네이티브 fetch(apiClient.authorizedFetch)는 1.1.0 까지 위 UA/헤더를 붙이지 않는다.
버전을 못 읽으면 None → `is_app_version_at_least` 는 False(=구버전 취급)로 안전하게 폴백한다.
"""
import re

from flask import has_request_context, request

_UA_RE = re.compile(r'HeyVoca (iOS|Android)/([\d.]+)(?:\s*\(build\s*([^)]+)\))?')
_VER_RE = re.compile(r'(?:(iOS|Android)/)?(\d+(?:\.\d+)*)')


def parse_app_version(user_agent=None, header_value=None):
    """{'platform','version','build'} 또는 None."""
    if header_value:
        m = _VER_RE.search(str(header_value))
        if m:
            return {'platform': m.group(1), 'version': m.group(2), 'build': None}
    m = _UA_RE.search(user_agent or '')
    if not m:
        return None
    return {'platform': m.group(1), 'version': m.group(2), 'build': m.group(3)}


def current_app_version():
    """현재 요청의 앱 버전 정보(없으면 None)."""
    if not has_request_context():
        return None
    return parse_app_version(
        request.headers.get('User-Agent', ''),
        request.headers.get('X-App-Version'),
    )


def version_gte(a, b):
    """'x.y.z' 단순 비교: a >= b."""
    pa = [int(n) if n.isdigit() else 0 for n in str(a or '').split('.')]
    pb = [int(n) if n.isdigit() else 0 for n in str(b or '').split('.')]
    for i in range(max(len(pa), len(pb))):
        d = (pa[i] if i < len(pa) else 0) - (pb[i] if i < len(pb) else 0)
        if d:
            return d > 0
    return True


def is_app_version_at_least(min_version, info=None):
    """현재 요청 앱 버전이 min_version 이상인지. 버전을 알 수 없으면 False."""
    info = info if info is not None else current_app_version()
    if not info or not info.get('version'):
        return False
    return version_gte(info['version'], min_version)
