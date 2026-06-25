from flask import Blueprint, jsonify
from datetime import datetime

from app.routes import version_bp

@version_bp.route('/get_version', methods=['GET'])
def get_version():
  """현재 앱 및 웹의 버전 정보를 반환합니다."""
  version_info = {
      # ⚠️ 아래 두 값은 "실제 스토어에 출시된 최신 버전"과 항상 일치해야 함.
      # 클라이언트는 자신의 버전 < 이 값이면 "권장 업데이트" 모달을 띄움.
      # 스토어에 새 버전을 실제로 출시한 직후에만 올릴 것 (아직 심사/롤아웃 중이면 절대 올리지 말 것 — 무한 업데이트 모달 발생).
      "app_android_version": "1.0.1",  # Play Store 출시 버전 (versionName)
      "app_ios_version": "1.0.1",  # App Store 출시 버전 (MARKETING_VERSION)
      "web_version": "1.0.3",  # 웹 버전 (FSRS 코어 정정·복습일정/학습설정, 테스트 재출제 완료버그 픽스·듣기버튼 유지, 홈 격려 메시지 다양화, 구매/보석 시트·예문 스피커 QA — 기존 사용자 reload 트리거)
      "release_date": datetime.now().isoformat(),
      "api_status": "stable",
      "min_app_version": "1.0.0",  # 앱의 최소 요구 버전 (이 값 미만이면 강제 업데이트)
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
