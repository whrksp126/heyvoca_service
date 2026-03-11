from flask import Blueprint, jsonify
from datetime import datetime

from app.routes import version_bp

@version_bp.route('/get_version', methods=['GET'])
def get_version():
  """현재 앱 및 웹의 버전 정보를 반환합니다."""
  version_info = {
      "app_android_version": "1.1.14",  # 앱 안드로이드 버전
      "app_ios_version": "1.0.0",  # 앱 아이폰 버전
      "web_version": "1.0.0",  # 웹 버전
      "release_date": datetime.now().isoformat(),
      "api_status": "stable",
      "min_app_version": "1.0.0",  # 앱의 최소 요구 버전
      "min_web_version": "1.0.0",  # 웹의 최소 요구 버전

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
  return jsonify({'code': 200, 'data': version_info}), 200