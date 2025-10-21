import { refreshAccessToken, getCookie } from './common';
import { AppHistory } from './appHistory';

// 기기 타입 조회
export function getDevicePlatform() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isAppWebView = userAgent.includes('HeyVoca');
  if (isAppWebView) {
    return 'app'
  }else{
    return 'web';
  }
}

// 토큰 갱신 함수 (앱에서 직접 호출)
export async function refreshUserToken() {
  console.log('🔄 토큰 갱신 시작 (앱에서 호출됨)');
  try {
    const success = await refreshAccessToken();
    if (success) {
      const newAccessToken = getCookie('userAccessToken');
      console.log('✅ 토큰 갱신 성공');
      return newAccessToken;
    } else {
      console.warn('⚠️ 토큰 갱신 실패');
      return null;
    }
  } catch (error) {
    console.error('❌ 토큰 갱신 오류:', error);
    return null;
  }
}

// 전역으로 등록 (앱에서 window.refreshUserToken() 으로 호출 가능)
if (typeof window !== 'undefined') {
  window.refreshUserToken = refreshUserToken;
}

// 토스트 메시지 표시 함수
export async function showToast(message) {
  if (DEVICE_DATA().OS === 'BROWSER') {
    createWebToast(message);
  } else {
    // Android/iOS에서는 WEBVIEW_API_MAP 사용
    if(!WEBVIEW_API_MAP[DEVICE_DATA().OS] || !WEBVIEW_API_MAP[DEVICE_DATA().OS].show_toast){
      setWebViewApiMap();
    }
    await WEBVIEW_API_MAP[DEVICE_DATA().OS].show_toast(message);
  }
}

// 앱 종료 함수
export async function closeApp() {
  if (DEVICE_DATA().OS === 'BROWSER') {
    // 웹에서는 창 닫기
    window.close();
  } else {
    if(!WEBVIEW_API_MAP[DEVICE_DATA().OS] || !WEBVIEW_API_MAP[DEVICE_DATA().OS].close_app){
      setWebViewApiMap();
    }
    // Android/iOS에서는 WEBVIEW_API_MAP 사용
    await WEBVIEW_API_MAP[DEVICE_DATA().OS].close_app();
  }
}

// 앱 종료 더블탭을 위한 변수
let appExitPressed = false;
let appExitTimeout = null;

// 안드로이드 onBackPressed에서 호출되는 함수
export function onBackPressed() {
  const currentPath = AppHistory.getCurrentPath();
  
  // 1. Alert이 열려있으면 Alert pop
  if (window.alertContext && window.alertContext.stack.length > 0) {
    window.alertContext.popAlert();
    return;
  }
  
  // 2. ImagePreview가 열려있으면 pop
  if (window.imagePreviewContext && window.imagePreviewContext.stack.length > 0) {
    window.imagePreviewContext.popImagePreview();
    return;
  }
  
  // 3. Modal이 열려있으면 Modal pop
  if (window.modalContext && window.modalContext.stack.length > 0) {
    window.modalContext.popModal();
    return;
  }
  
  // 4. HamburgerOverlay가 열려있으면 닫기
  if (window.hamburgerOverlayContext && window.hamburgerOverlayContext.isHamburgerOpen) {
    window.hamburgerOverlayContext.closeHamburger();
    return;
  }
  
  // 5. 앱 종료가 필요한 상황인지 확인 (정규식 사용)
  const shouldExitApp = /^\/(home|login|reviewNote|diyExam|voca)\/?$/.test(currentPath);
  
  if (shouldExitApp) {
    // 앱 종료가 필요한 상황에서는 더블탭 방식
    if (!appExitPressed) {
      // 첫 번째 뒤로가기: 토스트 표시
      appExitPressed = true;
      showToast('한번 더 뒤로가기를 누르면 앱이 종료됩니다.');
      
      // 3초 후 초기화
      appExitTimeout = setTimeout(() => {
        appExitPressed = false;
      }, 3000);
    } else {
      // 두 번째 뒤로가기: 실제 앱 종료
      appExitPressed = false;
      if (appExitTimeout) {
        clearTimeout(appExitTimeout);
        appExitTimeout = null;
      }
      closeApp();
    }
  } else {
    // 6. 일반 페이지에서는 바로 뒤로가기
    if (AppHistory.canGoBack()) {
      const lastPage = AppHistory.pop();
      if (lastPage) {
        // React의 navigate 함수 사용 (SPA 방식)
        if (window.reactNavigate) {
          window.reactNavigate(lastPage.path);
        } else {
          // navigate가 없으면 fallback으로 location.href 사용
          window.location.href = lastPage.path;
        }
      }
    } else {
      // 히스토리가 없으면 앱 종료 요청
      closeApp();
    }
  }
}

// window.is_backable = is_backable;
window.onBackPressed = onBackPressed;

