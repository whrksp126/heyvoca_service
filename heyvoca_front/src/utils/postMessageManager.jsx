/**
 * 포스트메시지 관리 유틸리티
 * 앱과 웹 간의 통신을 담당합니다.
 */

class PostMessageManager {
  constructor() {
    this.listeners = new Map();
    // 응답 대기자(waiter) — `listeners` 와 **완전히 분리된 채널**이다.
    //  왜 분리했나: `listeners` 는 타입당 1개만 유지되는 Map 이라(addListener 가 덮어쓴다)
    //  여기에 대기자를 끼워 넣으면 기존 화면의 콜백을 조용히 밀어낸다. 반대로 Set 으로 바꿔
    //  여러 개를 허용하면 오늘 "덮어쓰기"에 의존하는 곳(setupAppGoogleLogout /
    //  setupAppGoogleWithdraw 는 같은 타입을 쓴다)이 이중 실행된다. 그래서 채널을 하나 더 판다.
    this.waiters = new Map(); // type -> Set<fn>
    this.isInitialized = false;
  }

  /**
   * 포스트메시지 리스너 초기화
   */
  init() {
    if (this.isInitialized) {
      return;
    }

    // React Native WebView 환경 확인
    const isReactNativeWebView = window.ReactNativeWebView !== undefined;

    // React Native WebView 환경에서는 모든 플랫폼에서 동일한 방식 사용
    if (isReactNativeWebView) {
      // 모든 가능한 이벤트 리스너를 등록
      const setupListeners = () => {
        // 1. window.addEventListener (일반적인 방법)
        window.addEventListener('message', this.handleMessage.bind(this));

        // 2. document.addEventListener (Android용)
        document.addEventListener('message', this.handleMessage.bind(this));

        // 3. ReactNativeWebView.onMessage (iOS용)
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.onMessage = (message) => {
            this.handleMessage({ data: message });
          };
        }

        // 4. window.webkit.messageHandlers (iOS WebKit용)
        if (window.webkit && window.webkit.messageHandlers) {
          window.webkit.messageHandlers.postMessage = {
            postMessage: (message) => {
              this.handleMessage({ data: message });
            }
          };
        }
      };

      setupListeners();
      this.listenerType = 'ReactNativeWebView.multiple';
    } else {
      // 일반 웹 환경: window.addEventListener 사용
      window.addEventListener('message', this.handleMessage.bind(this));
      this.listenerType = 'window.addEventListener';
    }

    this.isInitialized = true;
  }

  /**
   * 앱 구글 OAuth 콜백 등록 (전역 함수)
   * @param {Function} callback - 로그인 처리 콜백 함수
   */
  setupAppGoogleAuth(callback) {
    // 포스트메시지 매니저 초기화
    this.init();

    // 앱 구글 OAuth 콜백 리스너 등록
    this.addListener('google_oauth_app_callback', callback);
  }

  /**
   * 앱 구글 OAuth 콜백 제거
   */
  removeAppGoogleAuth() {
    this.removeListener('google_oauth_app_callback');
  }

  /**
   * 앱 Apple OAuth 콜백 등록 (전역 함수)
   * @param {Function} callback - 로그인 처리 콜백 함수
   */
  setupAppAppleAuth(callback) {
    this.init();
    this.addListener('apple_oauth_app_callback', callback);
  }

  /**
   * 앱 Apple OAuth 콜백 제거
   */
  removeAppAppleAuth() {
    this.removeListener('apple_oauth_app_callback');
  }

  /**
   * 앱 구글 로그아웃 콜백 등록
   * @param {Function} callback - 로그아웃 처리 콜백 함수
   */
  setupAppGoogleLogout(callback) {
    // 포스트메시지 매니저 초기화
    this.init();

    // 앱 구글 로그아웃 콜백 리스너 등록
    this.addListener('google_logout_app_callback', callback);
  }

  /**
   * 앱 구글 로그아웃 콜백 제거
   */
  removeAppGoogleLogout() {
    this.removeListener('google_logout_app_callback');
  }

  /**
   * 앱 구글 회원 탈퇴 콜백 등록
   * @param {Function} callback - 회원 탈퇴 처리 콜백 함수
   */
  setupAppGoogleWithdraw(callback) {
    // 포스트메시지 매니저 초기화
    this.init();

    // 앱 구글 회원 탈퇴 콜백 리스너 등록 (로그아웃과 동일한 콜백 사용)
    this.addListener('google_logout_app_callback', callback);
  }

  /**
   * 앱 구글 회원 탈퇴 콜백 제거
   */
  removeAppGoogleWithdraw() {
    this.removeListener('google_logout_app_callback');
  }

  /**
   * 인앱 결제 성공 콜백 등록
   * @param {Function} callback - 결제 성공 처리 콜백 함수
   */
  setupIAPPurchaseSuccess(callback) {
    // 포스트메시지 매니저 초기화
    this.init();

    // 인앱 결제 성공 콜백 리스너 등록
    this.addListener('iap_purchase_success', callback);
  }

  /**
   * 인앱 결제 실패 콜백 등록
   * @param {Function} callback - 결제 실패 처리 콜백 함수
   */
  setupIAPPurchaseError(callback) {
    // 포스트메시지 매니저 초기화
    this.init();

    // 인앱 결제 실패 콜백 리스너 등록
    this.addListener('iap_purchase_error', callback);
  }

  /**
   * 인앱 결제 성공 콜백 제거
   */
  removeIAPPurchaseSuccess() {
    this.removeListener('iap_purchase_success');
  }

  /**
   * 인앱 결제 실패 콜백 제거
   */
  removeIAPPurchaseError() {
    this.removeListener('iap_purchase_error');
  }

  /**
   * 구글 스프레드시트 인증 콜백 등록
   * @param {Function} callback - 구글 시트 accessToken 처리 콜백 함수
   */
  setupGoogleSheetAuth(callback) {
    this.init();
    this.addListener('google_sheet_auth_callback', callback);
  }

  /**
   * 구글 스프레드시트 인증 콜백 제거
   */
  removeGoogleSheetAuth() {
    this.removeListener('google_sheet_auth_callback');
  }

  /**
   * OCR 결과 콜백 등록
   * @param {Function} callback - OCR 결과 처리 콜백 함수
   */
  setupOCRResult(callback) {
    console.log('OCR 결과 콜백 등록 시작');
    console.log(callback);
    // 포스트메시지 매니저 초기화
    this.init();

    // OCR 결과 콜백 리스너 등록
    this.addListener('ocrResult', callback);
    console.log('OCR 결과 콜백 등록 완료');
    console.log(this.listeners);
  }

  /**
   * OCR 결과 콜백 제거
   */
  removeOCRResult() {
    this.removeListener('ocrResult');
  }

  /**
   * FCM 토큰 수신 콜백 등록
   * @param {Function} callback - FCM 토큰 처리 콜백 함수
   */
  setupFcmToken(callback) {
    this.init();
    this.addListener('fcm_token_received', callback);
  }

  /**
   * FCM 토큰 수신 콜백 제거
   */
  removeFcmToken() {
    this.removeListener('fcm_token_received');
  }

  /**
   * 포스트메시지 처리 핸들러
   * @param {MessageEvent} event - 포스트메시지 이벤트
   */
  handleMessage(event) {
    console.log(`🎯 포스트메시지 받음!`);

    try {
      // React Native WebView에서는 event.data를 사용
      const messageData = event.data;

      if (!messageData) {
        console.log(`❌ 메시지 데이터가 없습니다.`);
        return;
      }

      const data = JSON.parse(messageData);
      console.log(`✅ 메시지 파싱 성공: ${data.type}`);

      // 등록된 리스너들 실행
      this.listeners.forEach((callback, messageType) => {
        if (data.type === messageType) {
          console.log(`🚀 리스너 실행: ${messageType}`);
          callback(data);
        }
      });

      // 응답 대기자 전달(별도 채널 — 위 리스너와 서로 영향 없음)
      this._dispatchWaiters(data);
    } catch (error) {
      console.error(`❌ 포스트메시지 파싱 오류:`, error);
      console.error(`📝 원본 데이터:`, event.data);
    }
  }

  /**
   * 특정 메시지 타입에 대한 리스너 등록
   * @param {string} messageType - 메시지 타입
   * @param {Function} callback - 콜백 함수
   */
  addListener(messageType, callback) {
    this.listeners.set(messageType, callback);
  }

  /**
   * 응답 대기자 등록 — 같은 타입에 **여러 개**를 붙일 수 있고, 기존 addListener 콜백을 건드리지 않는다.
   *  주로 nativeBridge.requestNative() 가 쓴다(요청 1건의 수명 동안만 살아 있는 임시 대기자).
   * @param {string} messageType
   * @param {Function} callback
   * @returns {Function} 해제 함수 — 반드시 호출할 것(안 하면 화면을 떠난 뒤에도 콜백이 남는다)
   */
  waitFor(messageType, callback) {
    this.init();
    if (!this.waiters.has(messageType)) this.waiters.set(messageType, new Set());
    this.waiters.get(messageType).add(callback);
    return () => {
      const set = this.waiters.get(messageType);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) this.waiters.delete(messageType);
    };
  }

  /**
   * 대기자 전달. 한 대기자가 던져도 나머지가 굶지 않도록 개별로 감싼다
   * (여기서 예외가 새면 이 메시지를 기다리던 다른 요청이 영원히 안 끝난다 = 우리가 없애려는 그 증상).
   */
  _dispatchWaiters(data) {
    const set = this.waiters.get(data?.type);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      try {
        fn(data);
      } catch (error) {
        console.error(`❌ 대기자 처리 오류(${data?.type}):`, error);
      }
    }
  }

  /**
   * 특정 메시지 타입의 리스너 제거
   * @param {string} messageType - 메시지 타입
   */
  removeListener(messageType) {
    this.listeners.delete(messageType);
  }

  /**
   * 모든 리스너 제거
   */
  clearAllListeners() {
    this.listeners.clear();
  }

  /**
   * React Native로 메시지 전송
   * @param {string} type - 메시지 타입
   * @param {Object} data - 전송할 데이터
   * @returns {boolean} 실제로 전송됐는지. **false 를 무시하면 호출부가 오지 않을 응답을 기다린다** —
   *   순수 웹 브라우저에서 정확히 그 일이 벌어진다(예전에는 console.warn 만 하고 true/false 구분이 없었다).
   */
  sendMessageToReactNative(type, data = {}) {
    const message = {
      type: type,
      props: data
    };

    try {
      // React Native WebView 환경 확인
      if (window.ReactNativeWebView) {
        // React Native WebView로 메시지 전송
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
        console.log(`📤 React Native로 메시지 전송: ${type}`, message);
        // alert('메시지 전송 완료');
        return true;
      }
      console.warn('⚠️ React Native WebView 환경이 아닙니다. 메시지 전송이 불가능합니다.');
      return false;
    } catch (error) {
      console.error('❌ React Native 메시지 전송 실패:', error);
      return false;
    }
  }

  /**
   * 포스트메시지 매니저 정리
   */
  destroy() {
    if (this.isInitialized) {
      if (this.listenerType === 'ReactNativeWebView.multiple') {
        // 모든 리스너 제거
        window.removeEventListener('message', this.handleMessage.bind(this));
        document.removeEventListener('message', this.handleMessage.bind(this));

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.onMessage = null;
        }

        if (window.webkit && window.webkit.messageHandlers) {
          delete window.webkit.messageHandlers.postMessage;
        }
      } else if (this.listenerType === 'window.addEventListener') {
        // 일반 웹: window.removeEventListener
        window.removeEventListener('message', this.handleMessage.bind(this));
      }

      this.clearAllListeners();
      this.isInitialized = false;
      this.listenerType = null;
    }
  }
}

// 싱글톤 인스턴스 생성
const postMessageManager = new PostMessageManager();

export default postMessageManager;
