import logging

from flask import Blueprint, jsonify, request, g
from datetime import datetime
import requests
import json
import base64
import os
from uuid import UUID
from app.routes import purchase_bp
from app.utils.jwt_utils import jwt_required
from app import limiter
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy, RecentStudyType, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, UserVocaBook, Bookstore, Product, Purchase, GemReason, GemLog
from app import db
from sqlalchemy.exc import IntegrityError
from app.utils.db_lock import retry_on_deadlock
from app.utils.gem import InsufficientGem, change_gem, start_user_tx

MYSQL_DUP_ENTRY = 1062
PURCHASE_TX_PLATFORM_UNIQUE = 'uq_purchase_transaction_platform'


def _is_duplicate_transaction(exc: IntegrityError) -> bool:
    """`(transaction_id, platform)` 유니크 제약 위반(1062)인지 판별한다.

    다른 IntegrityError(예: 예상치 못한 스키마 문제)까지 "이미 처리된 구매"로 삼켜 버리지
    않도록 제약 이름까지 확인한다.
    """
    orig = getattr(exc, 'orig', None)
    args = getattr(orig, 'args', None) or ()
    if not args or args[0] != MYSQL_DUP_ENTRY:
        return False
    detail = str(args[1]) if len(args) > 1 else ''
    return PURCHASE_TX_PLATFORM_UNIQUE in detail


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
@limiter.limit("5 per minute")
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

        # 중복 구매 빠른 거절(잠금 없이) — 최종 판정은 아래 잠금 안에서 다시 한다.
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

            # 스토어 검증(외부 호출)은 위에서 끝났다. 여기부터는 DB 만 — 교착 시 이 부분만 재시도한다.
            result = _grant_iap_gems(
                user_id, data, platform, product, quantity, total_gem_amount)
            if result is None:
                return jsonify({
                    'code': 400,
                    'message': '이미 처리된 구매입니다.'
                }), 400
            if result is False:
                return jsonify({
                    'code': 400,
                    'message': '사용자를 찾을 수 없습니다.'
                }), 400

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
                    'total_gems': result
                }
            }), 200
            
        except Exception as e:
            db.session.rollback()
            logging.getLogger(__name__).error('구매 처리 오류 (verify)', exc_info=True)
            return jsonify({
                'code': 500,
                'message': '구매 처리 중 오류가 발생했습니다.'
            }), 500

    except Exception as e:
        logging.getLogger(__name__).error('서버 오류 (verify)', exc_info=True)
        return jsonify({
            'code': 500,
            'message': '서버 오류가 발생했습니다.'
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
        logging.getLogger(__name__).error('구매 내역 조회 오류', exc_info=True)
        return jsonify({
            'code': 500,
            'message': '서버 오류가 발생했습니다.'
        }), 500


@purchase_bp.route('/gem-history', methods=['GET'])
@jwt_required
def get_gem_history():
    """사용자 보석 적립/사용 내역 조회 API (GemLog)"""
    try:
        user_id = UUID(g.user_id)

        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        logs = GemLog.query.filter_by(
            user_id=user_id
        ).order_by(GemLog.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )

        log_list = []
        for log in logs.items:
            log_list.append({
                'id': str(log.id),
                'amount': log.amount,            # 적립=양수, 사용=음수
                'reason': log.reason.value if hasattr(log.reason, 'value') else log.reason,
                'description': log.description,
                'balance_after': log.balance_after,
                'created_at': log.created_at.isoformat() if log.created_at else None
            })

        return jsonify({
            'code': 200,
            'message': '보석 내역을 조회했습니다.',
            'data': {
                'logs': log_list,
                'pagination': {
                    'page': logs.page,
                    'per_page': logs.per_page,
                    'total': logs.total,
                    'pages': logs.pages,
                    'has_next': logs.has_next,
                    'has_prev': logs.has_prev
                }
            }
        }), 200

    except Exception as e:
        logging.getLogger(__name__).error('보석 내역 조회 오류', exc_info=True)
        return jsonify({
            'code': 500,
            'message': '서버 오류가 발생했습니다.'
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
        logging.getLogger(__name__).error('상품 목록 조회 오류', exc_info=True)
        return jsonify({
            'code': 500,
            'message': '서버 오류가 발생했습니다.'
        }), 500


@retry_on_deadlock
def _grant_iap_gems(user_id, data, platform, product, quantity, total_gem_amount):
    """영수증 기록 + 보석 지급을 한 트랜잭션으로 커밋한다. 스토어 API 는 부르지 않는다.

    반환: 지급 후 잔액(int) / 이미 처리된 거래면 None / 사용자 없음이면 False.

    - User 행을 먼저 잠그고(전역 잠금 순서 첫 번째) 잔액에 더한다 — 다른 보석 변경과 엇갈려도
      지급분이 사라지지 않는다.
    - 중복 거래 검사를 **잠금 안에서 다시** 한다. 같은 영수증이 같은 계정으로 동시에 두 번
      들어와도(앱 재시도·중복 탭) 두 번째는 여기서 멈춘다. 재시도(1213) 때도 이 검사를 다시
      지나므로 이중 지급이 없다(롤백된 첫 시도는 흔적이 남지 않는다).
    - 이 위의 검사는 **같은 계정** 안에서만 효과가 있다(User 잠금이 계정 단위라서). 같은
      transaction_id 를 **다른 두 계정**이 동시에 제출하면 둘 다 이 검사를 통과할 수 있다 —
      최종 방어선은 DB 의 `(transaction_id, platform)` 유니크 제약이다. 먼저 커밋한 쪽이
      이기고, 진 쪽은 flush/commit 시 IntegrityError(1062)를 받는다 — 그 경우도 "이미 처리된
      구매"와 같은 결과(None)로 맞춰 준다.
    """
    from uuid import uuid4

    # 새 트랜잭션에서 잠금부터 — 위의 빠른 중복 검사가 잡아 둔 스냅샷을 버려야, 잠금 뒤의
    # 중복 검사가 앞서 커밋된 같은 거래를 본다(`start_user_tx` 주석).
    user = start_user_tx(user_id)
    if user is None:
        db.session.rollback()
        return False

    dup = Purchase.query.filter_by(
        transaction_id=data['transactionId'], platform=platform
    ).first()
    if dup is not None:
        db.session.rollback()
        return None

    purchase_record = Purchase(
        user_id=user_id,
        product_id=data['productId'],
        transaction_id=data['transactionId'],
        platform=platform,
        gem_amount=total_gem_amount,  # 실제 지급할 보석 수량
        price=product.price * quantity,  # 실제 결제 금액
        receipt_data=json.dumps(data)  # 원본 데이터 저장
    )
    # id 는 flush 때 채워지는 기본값이라, 미리 넣어 두지 않으면 원장의 source_id 가 비었다.
    purchase_record.id = uuid4()
    db.session.add(purchase_record)

    try:
        _, balance = change_gem(user_id, total_gem_amount, GemReason.IAP_PURCHASE,
                                f"유료 결제: {product.name}",
                                source_type="purchase", source_id=purchase_record.id,
                                user=user)
        # change_gem 안의 add_gem_log 가 이미 flush 를 한 번 하므로, 유니크 위반이면 여기가
        # 아니라 그 flush 시점에 날 수도 있다 — 그래서 commit 뿐 아니라 위 change_gem 호출까지
        # 함께 감싼다.
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        if _is_duplicate_transaction(e):
            # 다른 계정이 같은 transaction_id 를 먼저 커밋했다 — 우리 쪽은 지급하지 않고
            # 기존 "이미 처리된 구매" 분기와 동일하게 취급한다(호출부에서 None → 400).
            return None
        raise
    return balance


# 단어장 1개당 차감되는 보석 단가
BOOK_PRICE_PER_UNIT = 3
# 한 번에 구매 가능한 최대 단어장 수
BOOK_PURCHASE_MAX_AMOUNT = 100


@purchase_bp.route('/book', methods=['POST'])
@jwt_required
def purchase_book():
    """빈 단어장 구매 API - 보석 차감 후 사용자 book_cnt 증가"""
    try:
        data = request.get_json() or {}
        amount = data.get('amount')

        if not isinstance(amount, int) or amount < 1 or amount > BOOK_PURCHASE_MAX_AMOUNT:
            return jsonify({
                'code': 400,
                'message': f'amount는 1~{BOOK_PURCHASE_MAX_AMOUNT} 사이의 정수여야 합니다.'
            }), 400

        cost = amount * BOOK_PRICE_PER_UNIT
        user_id = UUID(g.user_id)

        try:
            result = _purchase_book_tx(user_id, amount, cost)
            if result == 'no_user':
                return jsonify({
                    'code': 404,
                    'message': '사용자를 찾을 수 없습니다.'
                }), 404
            if result == 'short':
                return jsonify({
                    'code': 400,
                    'message': '보석이 부족합니다.'
                }), 400

            return jsonify({
                'code': 200,
                'message': '구매가 완료되었습니다.',
                'data': result
            }), 200

        except Exception as e:
            db.session.rollback()
            logging.getLogger(__name__).error('구매 처리 오류 (purchase_book)', exc_info=True)
            return jsonify({
                'code': 500,
                'message': '구매 처리 중 오류가 발생했습니다.'
            }), 500

    except Exception as e:
        logging.getLogger(__name__).error('서버 오류 (purchase_book)', exc_info=True)
        return jsonify({
            'code': 500,
            'message': '서버 오류가 발생했습니다.'
        }), 500


@retry_on_deadlock
def _purchase_book_tx(user_id, amount, cost):
    """보석 차감 + book_cnt 증가를 한 트랜잭션으로. 잔액 검사는 User 잠금 안에서(음수 방지)."""
    user = start_user_tx(user_id)
    if user is None:
        db.session.rollback()
        return 'no_user'
    try:
        _, balance = change_gem(user_id, -cost, GemReason.BOOK_PURCHASE,
                                f"빈 단어장 {amount}개 구매",
                                source_type="vocabulary_book", user=user)
    except InsufficientGem:
        db.session.rollback()
        return 'short'
    user.book_cnt += amount
    book_cnt = user.book_cnt
    db.session.commit()
    return {'gem_cnt': balance, 'book_cnt': book_cnt}


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