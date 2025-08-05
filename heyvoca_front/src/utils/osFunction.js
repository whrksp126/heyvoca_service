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
  