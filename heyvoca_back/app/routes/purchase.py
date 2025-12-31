from flask import Blueprint, jsonify, request, g
from datetime import datetime
import requests
import json
import base64
import os
from uuid import UUID
from app.routes import purchase_bp
from app.utils.jwt_utils import jwt_required
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy, RecentStudyType, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, UserVocaBook, Bookstore, Product, Purchase, GemReason
from app import db
from app.routes.common import register_gem_log


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
        
        # 필수 필드 검증
        required_fields = ['productId', 'transactionId', 'platform']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'code': 400,
                    'message': f'필수 필드가 누락되었습니다: {field}'
                }), 400

        platform = data['platform']

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

        # 상품 정보 조회
        product = Product.query.filter_by(
            product_id=data['productId'],
            platform=platform,
            is_active=True
        ).first()
        
        if not product:
            return jsonify({
                'code': 400,
                'message': '유효하지 않은 상품입니다.'
            }), 400

        # 중복 구매 검증 (같은 거래 ID로 이미 구매한 경우)
        existing_purchase = Purchase.query.filter_by(
            transaction_id=data['transactionId'],
            platform=platform
        ).first()
        
        if existing_purchase:
            return jsonify({
                'code': 400,
                'message': '이미 처리된 구매입니다.'
            }), 400

        try:
            # user_id를 UUID 객체로 변환
            user_id = UUID(g.user_id)
            
            # 구매 수량 확인 (영수증 검증 결과의 data에서 가져오거나 기본값 1)
            verification_data = verification_result.get('data', {})
            quantity = verification_data.get('quantity', data.get('quantity', 1))
            if not isinstance(quantity, int) or quantity <= 0:
                quantity = 1
            
            # 실제 지급할 보석 수량 계산 (상품 보석 수량 × 구매 수량)
            total_gem_amount = product.gem_amount * quantity
            
            # 영수증 DB 레코드 추가
            purchase_record = Purchase(
                user_id=user_id,
                product_id=data['productId'],
                transaction_id=data['transactionId'],
                platform=platform,
                gem_amount=total_gem_amount,  # 실제 지급할 보석 수량
                price=product.price * quantity,  # 실제 결제 금액
                receipt_data=json.dumps(data)  # 원본 데이터 저장
            )
            
            db.session.add(purchase_record)
            
            # 사용자 보석 업데이트
            user = User.query.get(user_id)
            if not user:
                return jsonify({
                    'code': 400,
                    'message': '사용자를 찾을 수 없습니다.'
                }), 400
            
            # 보석 추가 (수량만큼 곱해서)
            user.gem_cnt += total_gem_amount
            
            # 보석 로그 등록
            register_gem_log(user_id, total_gem_amount, GemReason.IAP_PURCHASE, f"유료 결제: {product.name}", 
                            "purchase", purchase_record.id, user.gem_cnt)
            
            # 변경사항 저장
            db.session.commit()
            
            # 검증 성공 응답
            return jsonify({
                'code': 200,
                'data': {
                    'verified': True,
                    'platform': platform,
                    'product_id': data['productId'],
                    'transaction_id': data['transactionId'],
                    'quantity': quantity,
                    'gem_added': total_gem_amount,
                    'total_gems': user.gem_cnt
                }
            }), 200
            
        except Exception as e:
            db.session.rollback()
            return jsonify({
                'code': 500,
                'message': f'구매 처리 중 오류가 발생했습니다: {str(e)}'
            }), 500

    except Exception as e:
        return jsonify({
            'code': 500,
            'message': f'서버 오류가 발생했습니다: {str(e)}'
        }), 500


@purchase_bp.route('/history', methods=['GET'])
@jwt_required
def get_purchase_history():
    """사용자 구매 내역 조회 API"""
    try:
        # user_id를 UUID 객체로 변환
        user_id = UUID(g.user_id)
        
        # 페이지네이션 파라미터
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # 구매 내역 조회
        purchases = Purchase.query.filter_by(
            user_id=user_id
        ).order_by(Purchase.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        # 응답 데이터 구성
        purchase_list = []
        for purchase in purchases.items:
            purchase_list.append({
                'id': str(purchase.id),
                'product_id': purchase.product_id,
                'transaction_id': purchase.transaction_id,
                'platform': purchase.platform,
                'gem_amount': purchase.gem_amount,
                'price': purchase.price,
                'status': purchase.status,
                'verified_at': purchase.verified_at.isoformat() if purchase.verified_at else None,
                'created_at': purchase.created_at.isoformat()
            })
        
        return jsonify({
            'code': 200,
            'message': '구매 내역을 조회했습니다.',
            'data': {
                'purchases': purchase_list,
                'pagination': {
                    'page': purchases.page,
                    'per_page': purchases.per_page,
                    'total': purchases.total,
                    'pages': purchases.pages,
                    'has_next': purchases.has_next,
                    'has_prev': purchases.has_prev
                }
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'code': 500,
            'message': f'서버 오류가 발생했습니다: {str(e)}'
        }), 500


@purchase_bp.route('/products', methods=['GET'])
def get_products():
    """상품 목록 조회 API"""
    try:
        platform = request.args.get('platform', 'all')
        
        # 플랫폼별 상품 조회
        query = Product.query.filter_by(is_active=True)
        if platform != 'all':
            query = query.filter_by(platform=platform)
        
        products = query.order_by(Product.price.asc()).all()
        
        # 응답 데이터 구성
        product_list = []
        for product in products:
            product_list.append({
                'id': product.id,
                'product_id': product.product_id,
                'name': product.name,
                'description': product.description,
                'gem_amount': product.gem_amount,
                'price': product.price,
                'platform': product.platform
            })
        
        return jsonify({
            'code': 200,
            'message': '상품 목록을 조회했습니다.',
            'data': {
                'products': product_list
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'code': 500,
            'message': f'서버 오류가 발생했습니다: {str(e)}'
        }), 500


def verify_ios_receipt(data):
    """iOS App Store 영수증 검증 (StoreKit 2 JWS 토큰 방식)"""
    try:
        # 필수 iOS 필드 검증
        required_ios_fields = ['transactionReceipt', 'originalTransactionId', 'transactionId']
        for field in required_ios_fields:
            if field not in data:
                return {'success': False, 'error': f'필수 iOS 필드 누락: {field}'}
        
        # Bundle ID 검증
        bundle_id = data.get('bundleId')
        if bundle_id and bundle_id != APPLE_BUNDLE_ID:
            return {'success': False, 'error': '잘못된 Bundle ID입니다.'}
        
        # JWS 토큰 (transactionReceipt) 디코딩
        jws_token = data['transactionReceipt']
        transaction_id = data['transactionId']
        original_transaction_id = data['originalTransactionId']
        
        # JWS 토큰은 header.payload.signature 형식
        # payload 부분 추출 및 디코딩
        try:
            parts = jws_token.split('.')
            if len(parts) != 3:
                return {'success': False, 'error': '잘못된 JWS 토큰 형식입니다.'}
            
            # payload 디코딩 (Base64 URL-safe 디코딩)
            payload_b64 = parts[1]
            # Base64 패딩 추가 (필요한 경우)
            payload_b64 += '=' * (-len(payload_b64) % 4)
            
            decoded_payload = base64.urlsafe_b64decode(payload_b64)
            purchase_info = json.loads(decoded_payload.decode('utf-8'))
            
        except (ValueError, json.JSONDecodeError, IndexError) as e:
            return {'success': False, 'error': f'JWS 토큰 디코딩 실패: {str(e)}'}
        
        # 1. Bundle ID 검증
        purchase_bundle_id = purchase_info.get('bundleId')
        if purchase_bundle_id != APPLE_BUNDLE_ID:
            return {'success': False, 'error': f'Bundle ID가 일치하지 않습니다. (받은 값: {purchase_bundle_id}, 기대값: {APPLE_BUNDLE_ID})'}
        
        # 2. 거래 ID 검증
        purchase_transaction_id = purchase_info.get('transactionId')
        if purchase_transaction_id != transaction_id:
            return {'success': False, 'error': f'거래 ID가 일치하지 않습니다. (받은 값: {purchase_transaction_id}, 기대값: {transaction_id})'}
        
        # 3. 원본 거래 ID 검증
        purchase_original_transaction_id = purchase_info.get('originalTransactionId')
        if purchase_original_transaction_id != original_transaction_id:
            return {'success': False, 'error': f'원본 거래 ID가 일치하지 않습니다. (받은 값: {purchase_original_transaction_id}, 기대값: {original_transaction_id})'}
        
        # 4. 상품 ID 검증
        purchase_product_id = purchase_info.get('productId')
        if purchase_product_id != data.get('productId'):
            return {'success': False, 'error': f'상품 ID가 일치하지 않습니다. (받은 값: {purchase_product_id}, 기대값: {data.get("productId")})'}
        
        # 5. 구매 타입 확인 (Consumable만 허용)
        purchase_type = purchase_info.get('type')
        
        # 6. 환경 확인 (Sandbox/Production)
        environment = purchase_info.get('environment', 'Production')
        
        # 7. 구매 날짜 확인
        purchase_date = purchase_info.get('purchaseDate')
        original_purchase_date = purchase_info.get('originalPurchaseDate')
        
        # 8. 수량 확인
        quantity = purchase_info.get('quantity', 1)
        
        # 검증 성공 - 디코딩된 정보 반환
        return {
            'success': True,
            'data': {
                'quantity': quantity,
                'productId': purchase_product_id,
                'transactionId': purchase_transaction_id,
                'originalTransactionId': purchase_original_transaction_id,
                'bundleId': purchase_bundle_id,
                'environment': environment,
                'purchaseDate': purchase_date,
                'originalPurchaseDate': original_purchase_date,
                'type': purchase_type,
                'decoded_receipt': purchase_info  # 전체 디코딩된 정보
            }
        }
        
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