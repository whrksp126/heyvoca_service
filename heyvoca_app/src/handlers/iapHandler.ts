import { Platform } from 'react-native';
import { appAsyncStore, getCookieFromAsyncStorage } from '../utils/asyncStorage';

import Config from 'react-native-config';
const BACK_URL = Config.BACK_URL;

import { 
  initConnection, 
  purchaseUpdatedListener, 
  purchaseErrorListener,
  requestPurchase,
  finishTransaction,
  type Purchase,
  type PurchaseError
} from 'react-native-iap';

// 전역 변수들
let isInitialized = false;
let currentWebViewRef: any = null;
let purchaseUpdateSubscription: any = null;
let purchaseErrorSubscription: any = null;

// 웹뷰의 전역 함수를 호출하여 토큰 갱신
const requestTokenRefresh = async (): Promise<boolean> => {
  try {
    console.log('웹의 refreshUserToken() 함수 호출 중...');
    
    if (!currentWebViewRef?.current) {
      console.error('WebView ref가 없습니다');
      return false;
    }

    // 웹뷰에서 window.refreshUserToken() 실행
    const script = `
      (async function() {
        try {
          if (typeof window.refreshUserToken === 'function') {
            const token = await window.refreshUserToken();
            console.log('토큰 갱신 결과:', token ? '성공' : '실패');
            return true;
          } else {
            console.error('refreshUserToken 함수가 없습니다');
            return false;
          }
        } catch (error) {
          console.error('토큰 갱신 오류:', error);
          return false;
        }
      })();
    `;

    // 웹뷰에서 스크립트 실행 (반환값 없이)
    currentWebViewRef.current.injectJavaScript(script);
    
    // 웹이 토큰 갱신하고 AsyncStorage에 저장할 시간 대기 (3초)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ 토큰 갱신 대기 완료');
    return true;
  } catch (error) {
    console.error('❌ 토큰 갱신 오류:', error);
    return false;
  }
};

// 서버에 영수증 검증 요청
const verifyPurchaseWithServer = async (purchase: Purchase, retryCount = 0): Promise<{ success: boolean; data?: any; error?: string; needsRetry?: boolean }> => {
  try {

    // const androidPurchase = {
    //   autoRenewingAndroid: false,
    //   dataAndroid: "{\"orderId\":\"GPA.3325-8739-9908-67004\",\"packageName\":\"com.ghmate.heyvoca\",\"productId\":\"com.heyvoca.gems_10\",\"purchaseTime\":1760454682971,\"purchaseState\":0,\"purchaseToken\":\"hnkiiplgllmfbhdpkpooabdc.AO-J1OyU4zMfGFTORn4nKBJHqKjiVgP2xB9H7bIIgxm8JOC2QjEnR5Jm7pX415tlhX9hfGsTlex5J_GBGbUakwdtss44ey_tuQ\",\"quantity\":1,\"acknowledged\":false}",
    //   id: "GPA.3325-8739-9908-67004",
    //   isAcknowledgedAndroid: false,
    //   isAutoRenewing: false,
    //   obfuscatedAccountIdAndroid: "",
    //   obfuscatedProfileIdAndroid: "",
    //   packageNameAndroid: "com.ghmate.heyvoca",
    //   platform: "android",
    //   productId: "com.heyvoca.gems_10",
    //   purchaseState: "purchased",
    //   purchaseToken: "hnkiiplgllmfbhdpkpooabdc.AO-J1OyU4zMfGFTORn4nKBJHqKjiVgP2xB9H7bIIgxm8JOC2QjEnR5Jm7pX415tlhX9hfGsTlex5J_GBGbUakwdtss44ey_tuQ",
    //   quantity: 1,
    //   signatureAndroid: "NU93fHnHVrhMNuw9+idEEdyEzr22eyGZZotxMFN5kkDz5WOhXbvl1HJjVOKBc55cEwg8wqM2msHGPBVHIAzdw4rLkGUG+lgMmsiNyqiF04jK8RNwvUVm9LwyZmUWZaXQoilXoO2YhYnWuxaCOGrd4uOGZ8chmQom3CirWdok3iAbLpY8GvV2AMrhxaQXh+8IloeCmhRV/cUR3h3A19Gn37lWcaVeNOnd4XdtFGfMBTLQ1l5He2ILag97AM0dddoi3xxov4ipUahv5jpwJK4WMMH6w1/x6SnjVVGSISTu/1X1BHYJ7uDoxbjFPPuPoNJU7QA58u5aViqcQbGKJTV8vQ==",
    //   transactionDate: 1760454682971,
    // }



    // AsyncStorage에서 userAccessToken 쿠키 가져오기
    const accessToken = await getCookieFromAsyncStorage('userAccessToken');
    
    console.log('AsyncStorage에서 가져온 accessToken:', accessToken);

    if (!accessToken) {
      throw new Error('액세스 토큰이 없습니다');
    }

    // 서버 API 엔드포인트 (실제 서버 주소로 변경 필요)
    const serverUrl = `${BACK_URL}/purchase/verify`;
    
    const receiptData = {
      // 기본 구매 정보
      productId: purchase.productId,
      quantity: purchase.quantity || 1,
      transactionId: purchase.id, // Android에서는 id 필드 사용
      transactionDate: purchase.transactionDate,
      platform: purchase.platform || Platform.OS,
      
      // 플랫폼별 영수증 데이터
      ...(Platform.OS === 'ios' ? {
        // iOS App Store 영수증 검증용
        transactionReceipt: (purchase as any).transactionReceipt,
        originalTransactionId: (purchase as any).originalTransactionId,
        bundleId: 'com.ghmate.heyvoca',
      } : {
        // Android Google Play 영수증 검증용
        purchaseToken: purchase.purchaseToken,
        packageName: (purchase as any).packageNameAndroid,
        orderId: purchase.id, // Android에서는 id가 orderId와 동일
        dataAndroid: (purchase as any).dataAndroid,
        signatureAndroid: (purchase as any).signatureAndroid,
      })
    };

    console.log('서버로 전송할 영수증 데이터:', receiptData);

    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(receiptData),
    });

    // 401 에러 처리: 토큰 만료
    if (response.status === 401) {
      console.log('401 에러: 액세스 토큰 만료');
      
      // 재시도 횟수 체크 (최대 1번만 재시도)
      if (retryCount >= 1) {
        console.error('토큰 갱신 후에도 401 에러 발생');
        return { 
          success: false, 
          error: '인증 실패: 로그인이 필요합니다',
          needsRetry: false
        };
      }

      // 웹의 전역 함수로 토큰 갱신 요청
      console.log('웹에 토큰 갱신 요청...');
      const refreshSuccess = await requestTokenRefresh();
      
      if (!refreshSuccess) {
        console.error('토큰 갱신 실패');
        return { 
          success: false, 
          error: '토큰 갱신 실패',
          needsRetry: false
        };
      }
      
      // 갱신된 토큰으로 재시도
      console.log('토큰 갱신 완료, 재시도 중...');
      return verifyPurchaseWithServer(purchase, retryCount + 1);
    }

    if (response.ok) {
      const result = await response.json();
      console.log('서버 검증 성공:', result);
      return { success: true, data: result };
    } else {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('서버 검증 실패:', response.status, errorData);
      return { 
        success: false, 
        error: errorData.error || '서버 검증 실패',
        needsRetry: false
      };
    }
  } catch (error: any) {
    console.error('서버 검증 요청 실패:', error);
    return { 
      success: false, 
      error: error.message || '네트워크 오류',
      needsRetry: false
    };
  }
};

// 인앱결제 초기화
const initializeIAP = async (webViewRef: any) => {
  try {
    if (isInitialized) {
      return true;
    }

    currentWebViewRef = webViewRef;
    
    console.log('인앱 결제 초기화 중...');
    
    // IAP 연결 초기화
    await initConnection();
    console.log('인앱 결제 연결 성공!');
    
    // 구매 업데이트 리스너 설정
    purchaseUpdateSubscription = purchaseUpdatedListener(
      (purchase: Purchase) => {
        console.log(`구매 업데이트: ${purchase.productId}`);
        handlePurchaseUpdate(purchase);
      }
    );

    // 구매 에러 리스너 설정
    purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        console.log(`구매 에러: ${error.message}`);
        handlePurchaseError(error);
      }
    );

    isInitialized = true;
    console.log('IAP 초기화 완료');
    
    return true;
  } catch (error: any) {
    console.error('IAP 초기화 에러:', error);
    return false;
  }
};

// 구매 업데이트 처리
const handlePurchaseUpdate = async (purchase: Purchase) => {
  try {
    console.log('구매 완료:', purchase);

    // 1단계: 서버에서 영수증 검증
    console.log('서버 검증 시작...');
    const serverResult = await verifyPurchaseWithServer(purchase);
    
    if (!serverResult.success) {
      console.error('서버 검증 실패:', serverResult.error);
      
      // 서버 검증 실패 시 웹으로 에러 전송
      const errorData = {
        type: 'iap_purchase_error',
        data: {
          error: 'SERVER_VERIFICATION_FAILED',
          message: serverResult.error || '서버 검증 실패'
        }
      };
      
      if (currentWebViewRef?.current) {
        currentWebViewRef.current.postMessage(JSON.stringify(errorData));
      }
      return;
    }
    
    console.log('서버 검증 성공:', serverResult.data);

    // 2단계: 구매 완료 처리 (소모품)
    await finishTransaction({
      purchase: purchase,
      isConsumable: true,
    });
    console.log('구매 완료 처리 성공');

    
    // 3단계: 웹으로 성공 결과 전송 (서버 검증 결과 포함)
    const successData = {
      type: 'iap_purchase_success',
      data: {
        ...serverResult.data,
      }
    };
    
    if (currentWebViewRef?.current) {
      currentWebViewRef.current.postMessage(JSON.stringify(successData));
    }
    console.log('결제 성공 데이터 전송:', successData);
    
  } catch (error: any) {
    console.error('구매 완료 처리 실패:', error);
    
    // 웹으로 실패 결과 전송
    const errorData = {
      type: 'iap_purchase_error',
      data: {
        error: 'PURCHASE_PROCESSING_FAILED',
        message: error instanceof Error ? error.message : '알 수 없는 오류'
      }
    };
    
    if (currentWebViewRef?.current) {
      currentWebViewRef.current.postMessage(JSON.stringify(errorData));
    }
    console.log('결제 실패 데이터 전송:', errorData);
  }
};

// 구매 에러 처리
const handlePurchaseError = (error: PurchaseError) => {
  // 웹으로 에러 결과 전송
  const errorData = {
    type: 'iap_purchase_error',
    data: {
      error: error.code || 'PURCHASE_ERROR',
      message: error.message
    }
  };
  
  if (currentWebViewRef?.current) {
    currentWebViewRef.current.postMessage(JSON.stringify(errorData));
  }
  console.log('결제 에러 데이터 전송:', errorData);
};

export const executePurchase = async (itemId: string, webViewRef: any) => {
  console.log('executePurchase 시작');
  console.log('itemId:', itemId);
  
  try {
    // IAP 초기화 확인
    const initialized = await initializeIAP(webViewRef);
    if (!initialized) {
      throw new Error('인앱결제 초기화 실패');
    }
    
    console.log('requestPurchase 호출 시작');
    // 구매 요청
    await requestPurchase({
      request: {
        ios: {
          sku: itemId,
        },
        android: {
          skus: [itemId],
        },
      },
      type: 'in-app',
    });
    
    console.log('requestPurchase 호출 완료');
    
    // 웹으로 구매 시작 알림
    webViewRef.current.postMessage(JSON.stringify({
      type: 'iap_purchase_started',
      data: { itemId }
    }));
    console.log('구매 시작 알림 전송');
    
  } catch (error: any) {
    console.error('구매 실행 실패:', error);
    
    // 웹으로 실패 결과 전송
    webViewRef.current.postMessage(JSON.stringify({
      type: 'iap_purchase_error',
      data: {
        error: error.code || 'PURCHASE_FAILED',
        message: error.message
      }
    }));
    console.log('구매 실패 데이터 전송');
  }
};