from flask import Blueprint, jsonify
from datetime import datetime

from app.routes import version_bp
from app.services.store_version import get_versions as get_store_versions

@version_bp.route('/get_version', methods=['GET'])
def get_version():
  """현재 앱 및 웹의 버전 정보를 반환합니다."""
  # 앱 안내값은 **스토어 실조회**로 채운다(app/services/store_version.py).
  #  손으로 적던 시절의 사고 두 가지를 구조적으로 없앤다:
  #   · 낮게 방치 → 출시해도 업데이트 안내가 안 나감(실제로 스토어 1.0.5 / 안내 1.0.1 이었다)
  #   · 미리 올림 → 없는 버전으로 안내 → 무한 업데이트 모달
  #  조회가 실패하면 마지막 성공값 → env(APP_LATEST_*) → 아래 상수 순으로 폴백하며, **값이 내려가지는 않는다.**
  store = get_store_versions()

  version_info = {
      "app_android_version": store['android'],  # Play Store 게시 버전 (versionName)
      "app_ios_version": store['ios'],  # App Store 게시 버전 (MARKETING_VERSION)
      # 어디서 온 값인지(store|cache|last_good|fallback). **진단 전용 — 클라이언트 분기 금지.**
      "app_version_source": store['source'],
      # 웹 버전 — 스토리지 마이그레이션 트리거용으로 남겨 둔 **수기 값**이다.
      #  ⚠ "배포했는데 구버전 탭이 안 갱신됨" 을 이 값에 기대지 말 것. 프론트는 이제 자기 빌드 지문
      #    (`/version.json`, vite 가 빌드마다 생성)을 스스로 폴링해 갱신한다 — 수기 bump 를 잊어도 안전하다.
      #    이 값은 저장소 스키마를 바꿨을 때처럼 "웹 쪽 계약이 바뀌었다" 를 알릴 때만 올린다.
      "web_version": "1.0.3",
      "release_date": datetime.now().isoformat(),
      "api_status": "stable",
      # 이 값 미만이면 **강제 업데이트**(닫을 수 없는 모달). 올리면 그 미만 사용자는 스토어에 다녀오기
      #  전까지 앱을 못 쓴다 → 브릿지 계약이 깨져 정상 이용이 불가능한 버전에만 쓸 것.
      #  올리기 전에 반드시 그 버전대 사용자 비율을 확인할 것(현재는 측정 수단이 없다 — docs 참조).
      "min_app_version": "1.0.0",
      "min_web_version": "1.0.0",  # 웹의 최소 요구 버전

      # 스토어 URL (앱 업데이트 안내 모달에서 사용)
      "store_url": {
        "ios": "https://apps.apple.com/app/id6751544570",
        "android": "https://play.google.com/store/apps/details?id=com.ghmate.heyvoca"
      },

      # ✅ 웹 스토리지 버전 정보
      "web_storage_versions": {
        "localStorage": "1.0.0",
        "sessionStorage": "1.0.0",
        "indexedDB": "1.0.0"
      },

      # ✅ 앱 스토리지 버전 정보
      "app_storage_versions": {
        "asyncStorage": "1.0.0",  # AsyncStorage 데이터 구조 버전
        "secureStore": "1.0.0",   # SecureStore 데이터 구조 버전
        "sqlite": "1.0.0"         # SQLite 데이터 구조 버전
      }
  }
  resp = jsonify({'code': 200, 'data': version_info})
  resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
  resp.headers['Pragma'] = 'no-cache'
  resp.headers['Expires'] = '0'
  return resp, 200
