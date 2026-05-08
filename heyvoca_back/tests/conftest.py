"""
pytest 픽스처 설정.

DB 의존성 없이 순수 함수 테스트를 위한 최소한의 설정.
Flask app context가 필요한 테스트는 별도 처리.
"""
import sys
import os

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
