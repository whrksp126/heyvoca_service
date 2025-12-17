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

// 웹 토스트 메시지 생성 함수
function createWebToast(message) {
  // 간단한 웹 토스트 구현
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 10000;
    font-size: 14px;
    pointer-events: none;
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 2000);
}

// 토스트 메시지 표시 함수
export async function showToast(message) {
  if (getDevicePlatform() === 'web') {
    createWebToast(message);
  } else {
    // Android/iOS에서는 WEBVIEW_API_MAP 사용
    await window.ReactNativeWebView.postMessage(JSON.stringify({'type': 'showToast', 'props': {message: message}}));
  }
}

// 앱 종료 함수
export async function closeApp() {
  if (getDevicePlatform() === 'web') {
    window.close();
  } else {
    await window.ReactNativeWebView.postMessage(JSON.stringify({'type': 'closeApp'}));
  }
}

// 구글 로그아웃 함수
export async function launchGoogleLogout() {
  if (getDevicePlatform() === 'web') {
    // 웹 환경에서는 처리하지 않음 (웹 로그아웃은 별도로 처리)
    return;
  } else {
    // 앱 환경에서는 앱에 로그아웃 요청 전송
    if (window.ReactNativeWebView) {
      await window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'launchGoogleLogout'
      }));
    }
  }
}

// 앱 종료 더블탭을 위한 변수
let appExitPressed = false;
let appExitTimeout = null;

// 안드로이드 onBackPressed에서 호출되는 함수
export function onBackPressed() {
  const currentPath = AppHistory.getCurrentPath();
  
  if (window.newBottomSheetContext && window.newBottomSheetContext.stack.length > 0) {
    window.newBottomSheetContext.popNewBottomSheet();
    return;
  }
  
  
  if (window.newFullSheetContext && window.newFullSheetContext.stack.length > 0) {
    window.newFullSheetContext.popNewFullSheet();
    return;
  }
  
  // 5. 앱 종료가 필요한 상황인지 확인 (정규식 사용)
  const shouldExitApp = /^\/(home|vocabulary-sheets|book-store|class|mypage)\/?$/.test(currentPath);
  
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
window.onBackPressed = onBackPressed

