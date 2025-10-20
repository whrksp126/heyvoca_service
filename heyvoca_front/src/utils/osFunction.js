import { refreshAccessToken, getCookie } from './common.js';

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
