from flask import Blueprint, jsonify, request, g
from datetime import datetime
import requests
import json
import base64
import os
from app.routes import purchase_bp
from app.utils.jwt_utils import jwt_required
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy, RecentStudyType, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, UserVocaBook, Bookstore


# 환경 변수
GOOGLE_PLAY_PACKAGE_NAME = "com.ghmate.heyvoca"
APPLE_BUNDLE_ID = "com.ghmate.heyvoca"

# Google Play Console API 설정 (실제 서비스 키로 교체 필요)
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY = os.getenv('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY')
# Apple App Store Connect API 설정 (실제 키로 교체 필요)
APPLE_APP_STORE_CONNECT_KEY_ID = os.getenv('APPLE_APP_STORE_CONNECT_KEY_ID')
APPLE_APP_STORE_CONNECT_ISSUER_ID = os.getenv('APPLE_APP_STORE_CONNECT_ISSUER_ID')
APPLE_APP_STORE_CONNECT_PRIVATE_KEY = os.getenv('APPLE_APP_STORE_CONNECT_PRIVATE_KEY')

@purchase_bp.route('/verify', methods=['POST'])
@jwt_required
def verify_purchase():
    """구매 영수증 검증 API - 각 스토어 검증만 수행"""
    try:
        data = request.get_json()
        
        print("data")
        # 필수 필드 검증
        required_fields = ['productId', 'transactionId', 'platform']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'code': 400,
                    'message': f'필수 필드가 누락되었습니다: {field}'
                }), 400

        platform = data['platform']
        
        print("platform")

        # 플랫폼별 영수증 검증
        verification_result = None
        if platform == 'ios':
            verification_result = verify_ios_receipt(data)
        elif platform == 'android':
            verification_result = verify_android_receipt(data)
        else:
            return jsonify({
                'code': 400,
                'message': '지원하지 않는 플랫폼입니다.'
            }), 400

        if not verification_result['success']:
            return jsonify({
                'code': 400,
                'message': f'영수증 검증 실패: {verification_result["error"]}'
            }), 400


        # 검증 성공 보석 업데이트 (근지님 작업.. 부탁해요)
        user_id = UUID(g.user_id)  # 문자열을 UUID로 변환
        

        # 검증 성공 응답
        return jsonify({
            'code': 200,
            'message': '영수증 검증이 완료되었습니다.',
            'data': {
                'verified': True,
                'platform': platform,
                'product_id': data['productId'],
                'transaction_id': data['transactionId']
                # 보석 추가 게수
                # 총 보석 개수
            }
        }), 200

    except Exception as e:
        return jsonify({
            'code': 500,
            'message': f'서버 오류가 발생했습니다: {str(e)}'
        }), 500


def verify_ios_receipt(data):
    """iOS App Store 영수증 검증"""
    try:
        # 필수 iOS 필드 검증
        required_ios_fields = ['transactionReceipt', 'originalTransactionId']
        for field in required_ios_fields:
            if field not in data:
                return {'success': False, 'error': f'필수 iOS 필드 누락: {field}'}
        
        # Bundle ID 검증
        if data.get('bundleId') != APPLE_BUNDLE_ID:
            return {'success': False, 'error': '잘못된 Bundle ID입니다.'}
        
        # Apple App Store 영수증 검증
        receipt_data = data['transactionReceipt']
        original_transaction_id = data['originalTransactionId']
        
        # Apple의 영수증 검증 서버에 요청
        verification_url = "https://buy.itunes.apple.com/verifyReceipt"  # Production
        sandbox_url = "https://sandbox.itunes.apple.com/verifyReceipt"   # Sandbox
        
        # 먼저 Production 서버에 요청
        shared_secret = os.getenv('APPLE_SHARED_SECRET', '')
        if not shared_secret:
            return {'success': False, 'error': 'Apple Shared Secret이 설정되지 않았습니다'}
            
        payload = {
            'receipt-data': receipt_data,
            'password': shared_secret,  # App Store Connect에서 생성한 공유 비밀번호
            'exclude-old-transactions': True
        }
        
        response = requests.post(verification_url, json=payload, timeout=30)
        
        # Production에서 실패하면 Sandbox로 재시도
        if response.status_code != 200 or response.json().get('status') == 21007:
            response = requests.post(sandbox_url, json=payload, timeout=30)
        
        if response.status_code != 200:
            return {'success': False, 'error': 'Apple 서버 응답 오류'}
        
        result = response.json()
        
        # 영수증 검증 상태 확인
        if result.get('status') != 0:
            error_messages = {
                21000: 'App Store가 영수증 데이터를 읽을 수 없습니다',
                21002: '영수증 데이터가 손상되었습니다',
                21003: '영수증을 인증할 수 없습니다',
                21004: '공유 비밀번호가 잘못되었습니다',
                21005: '영수증이 유효하지 않습니다',
                21006: '영수증이 인증되었지만 서버가 다운되었습니다',
                21007: 'Sandbox 영수증이 Production 서버로 전송되었습니다',
                21008: 'Production 영수증이 Sandbox 서버로 전송되었습니다',
                21010: '영수증이 존재하지 않습니다'
            }
            error_msg = error_messages.get(result.get('status'), f'알 수 없는 오류: {result.get("status")}')
            return {'success': False, 'error': f'Apple 영수증 검증 실패: {error_msg}'}
        
        # 영수증 정보 추출
        receipt = result.get('receipt', {})
        in_app_purchases = receipt.get('in_app', [])
        
        # 해당 거래 ID 찾기
        transaction_found = False
        for purchase in in_app_purchases:
            if purchase.get('original_transaction_id') == original_transaction_id:
                transaction_found = True
                # 거래 상태 확인
                if purchase.get('cancellation_date'):
                    return {'success': False, 'error': '취소된 구매입니다'}
                break
        
        if not transaction_found:
            return {'success': False, 'error': '영수증에서 해당 거래를 찾을 수 없습니다'}
        
        # Bundle ID 재검증
        if receipt.get('bundle_id') != APPLE_BUNDLE_ID:
            return {'success': False, 'error': 'Bundle ID가 일치하지 않습니다'}
        
        return {'success': True, 'data': result}
        
    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'Apple 서버 응답 시간 초과'}
    except requests.exceptions.RequestException as e:
        return {'success': False, 'error': f'Apple 서버 통신 오류: {str(e)}'}
    except Exception as e:
        return {'success': False, 'error': f'iOS 영수증 검증 오류: {str(e)}'}


def verify_android_receipt(data):
    """Android Google Play 영수증 검증"""
    try:

        # 필수 Android 필드 검증
        required_android_fields = ['purchaseToken', 'packageName', 'orderId']
        for field in required_android_fields:
            if field not in data:
                return {'success': False, 'error': f'필수 Android 필드 누락: {field}'}
        
        # Package Name 검증
        if data.get('packageName') != GOOGLE_PLAY_PACKAGE_NAME:
            return {'success': False, 'error': '잘못된 Package Name입니다.'}
        
        # Google Play Console API를 사용한 영수증 검증
        purchase_token = data['purchaseToken']
        product_id = data.get('productId')
        order_id = data['orderId']
        
        # Google Play Developer API 라이브러리 사용
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            
            # 서비스 계정 인증
            if not GOOGLE_PLAY_SERVICE_ACCOUNT_KEY or not os.path.exists(GOOGLE_PLAY_SERVICE_ACCOUNT_KEY):
                return {'success': False, 'error': 'Google Play 서비스 계정 키 파일이 필요합니다.'}
            
            
            credentials = service_account.Credentials.from_service_account_file(
                GOOGLE_PLAY_SERVICE_ACCOUNT_KEY,
                scopes=['https://www.googleapis.com/auth/androidpublisher']
            )
            
            # Android Publisher API 서비스 생성
            service = build('androidpublisher', 'v3', credentials=credentials)
            
            # 구매 검증
            result = service.purchases().products().get(
                packageName=GOOGLE_PLAY_PACKAGE_NAME,
                productId=product_id,
                token=purchase_token
            ).execute()
            
            
            # 구매 상태 확인
            purchase_state = result.get('purchaseState')
            if purchase_state != 0:  # 0 = 구매됨
                return {'success': False, 'error': '구매가 완료되지 않았습니다'}
            
            # 소비 상태 확인
            consumption_state = result.get('consumptionState')
            if consumption_state == 1:  # 1 = 소비됨
                return {'success': False, 'error': '이미 소비된 구매입니다'}
            
            # 주문 ID 검증
            api_order_id = result.get('orderId')
            if api_order_id != order_id:
                return {'success': False, 'error': '주문 ID가 일치하지 않습니다'}
            
            return {'success': True, 'data': result}
            
        except ImportError:
            return {'success': False, 'error': 'google-api-python-client 라이브러리가 설치되지 않았습니다'}
        except Exception as e:
            return {'success': False, 'error': f'Google Play API 오류: {str(e)}'}
        
    except Exception as e:
        return {'success': False, 'error': f'Android 영수증 검증 오류: {str(e)}'}