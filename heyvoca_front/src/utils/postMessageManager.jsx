/**
 * 포스트메시지 관리 유틸리티
 * 앱과 웹 간의 통신을 담당합니다.
 */

class PostMessageManager {
  constructor() {
    this.listeners = new Map();
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
   * 인앱 결제 성공 콜백 제거
   */
  removeIAPPurchaseSuccess() {
    this.removeListener('iap_purchase_success');
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
