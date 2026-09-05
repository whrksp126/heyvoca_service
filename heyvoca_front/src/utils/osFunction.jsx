import { refreshAccessToken, getCookie } from './common';
import { AppHistory } from './appHistory';
import postMessageManager from './postMessageManager';

// 기기 타입 조회
export function getDevicePlatform() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isAppWebView = userAgent.includes('HeyVoca');

  if (isAppWebView) {
    if (userAgent.includes('Android')) {
      return 'android';
    } else if (userAgent.includes('iOS')) {
      return 'ios';
    } else {
      return 'app';
    }
  } else {
    return 'web';
  }
}

// 앱 WebView의 userAgent에서 버전/빌드 번호 파싱
// - 앱: { platform: 'iOS'|'Android', version: '1.0.1', build: '14' }
// - 웹 브라우저: null
export function parseAppVersion() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const m = ua.match(/HeyVoca (iOS|Android)\/([\d.]+)(?:\s*\(build\s*([^)]+)\))?/);
  if (!m) return null;
  return { platform: m[1], version: m[2], build: m[3] || null };
}

// "x.y.z" 단순 semver 비교: a >= b 면 true (빌드/프리릴리스 무시).
function isVersionGte(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return true; // 동일
}

// 현재 앱(WebView) 버전이 minVersion 이상인지. 순수 웹 브라우저면 false(네이티브 기능 없음).
// 웹앱 구조상, 웹이 의존하는 네이티브 기능이 특정 앱 버전부터 존재할 때 이 함수로 분기한다.
// (앱 심사/업데이트 지연으로 구버전 앱이 남아있을 수 있으므로, 버전 미달 시 구버전 동작으로 폴백)
export function isAppVersionAtLeast(minVersion) {
  const info = parseAppVersion();
  if (!info || !info.version) return false;
  return isVersionGte(info.version, minVersion);
}

// OS 알림 권한 네이티브 핸들러(checkNotificationPermission)가 포함된 최소 앱 버전.
// PushNotificationsNewFullSheet.jsx의 동일 상수와 맞춰야 함 — 네이티브 응답 포맷 변경 시 함께 확인.
const NOTIF_PERMISSION_MIN_APP_VERSION = '1.0.3';

// 현재 OS 알림 권한이 "이미 허용"된 상태인지 확인한다 (권한 요청 프롬프트 없이 상태만 조회).
// 반환값: true(허용됨) | false(거부/미허용) | null(확인 불가 — 구버전 앱, 응답 지연 등).
// 호출부는 null을 "확인 불가"로 취급해 안전하게 기존 동작(프롬프트 노출)을 유지해야 한다.
export function checkNotificationPermissionGranted() {
  return new Promise((resolve) => {
    const isRNWebView = typeof window !== 'undefined' && !!window.ReactNativeWebView;

    if (isRNWebView) {
      if (!isAppVersionAtLeast(NOTIF_PERMISSION_MIN_APP_VERSION)) {
        resolve(null); // 구버전 앱 — 네이티브 핸들러 없음
        return;
      }
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        postMessageManager.removeListener('notification_permission_status');
        resolve(value);
      };
      postMessageManager.addListener('notification_permission_status', (data) => {
        finish(!!data.granted);
      });
      postMessageManager.sendMessageToReactNative('checkNotificationPermission', {});
      // 네이티브 응답이 오지 않는 경우를 대비한 안전장치
      setTimeout(() => finish(null), 1500);
      return;
    }

    // 순수 웹(비앱) 환경 폴백: 브라우저 Notification API
    if (typeof Notification !== 'undefined' && Notification.permission) {
      resolve(Notification.permission === 'granted');
      return;
    }

    resolve(null);
  });
}

// 외부 브라우저로 URL 열기
// - 앱(WebView): 네이티브에 메시지 전달 → Linking.openURL
// - 웹: 새 탭으로 열기
export function openExternalUrl(url) {
  if (getDevicePlatform() !== 'web' && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'openUrl', props: { url } }));
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
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

/*
  토스트 — 화면 아래에 잠깐 떴다 사라지는 알림.

  【왜 웹에서 그리는가】 예전에는 앱(Android/iOS)에서 네이티브로 넘겨
  `react-native-toast-message` 의 기본형(`type:'info'`)을 띄웠다. 그 기본형은 라이브러리가
  들고 있는 파란 줄 + 흰 카드라 우리 디자인과 무관하고, 무엇보다 **다크 모드를 따르지 않아**
  검은 화면 한가운데 흰 카드가 튀었다. 앱 쪽 스타일을 고치면 스토어 배포를 기다려야 하지만,
  여기서 그리면 웹 배포만으로 두 플랫폼에 같이 반영되고 나머지 화면과 같은 토큰을 쓴다.

  【형태】 상태 바(FarmStatusBar)와 같은 '떠 있는 작은 면' 규격이다 —
  라이트는 흰 면 + 얇은 테두리 + 옅은 그림자, 다크는 #2E2E2E 면에 테두리·그림자 없음.
  다크 여부는 만들 때 한 번 읽는다. 토스트는 2초짜리라 그 사이 테마가 바뀔 일이 없고,
  layout 토큰(--layout-white/black)은 다크에서 값이 뒤집히지 않아 var 로는 잴 수 없다.
*/

const TOAST_ID = 'heyvoca-toast';
const TOAST_HOLD_MS = 2000;
const TOAST_IN_MS = 200;
const TOAST_OUT_MS = 260;

function createWebToast(message) {
  if (typeof document === 'undefined') return;

  // 이미 떠 있으면 갈아 끼운다 — 두 장이 겹치면 뒤엣것이 앞엣것을 가린다
  const prev = document.getElementById(TOAST_ID);
  if (prev) prev.remove();

  const isDark = document.documentElement.classList.contains('dark');

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    left: 50%;
    bottom: calc(var(--safe-area-bottom, 0px) + 88px);
    max-width: calc(100% - 40px);
    padding: 13px 18px;
    border-radius: 14px;
    background: ${isDark ? '#2E2E2E' : 'var(--layout-white)'};
    color: ${isDark ? 'var(--layout-white)' : 'var(--layout-black)'};
    /* border 토큰(#DDDDDD)은 tailwind.config 에 리터럴로만 있어 CSS 변수가 없다 —
       같은 값인 --layout-gray-100 으로 잰다 */
    border: ${isDark ? 'none' : '1px solid var(--layout-gray-100)'};
    box-shadow: ${isDark ? 'none' : '0 6px 20px rgba(0,0,0,0.10)'};
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.45;
    text-align: center;
    white-space: pre-line;
    z-index: 10000;
    pointer-events: none;
    opacity: 0;
    transform: translate(-50%, 12px);
    transition: opacity ${TOAST_IN_MS}ms ease-out, transform ${TOAST_IN_MS}ms ease-out;
  `;
  document.body.appendChild(toast);

  // 다음 프레임에 등장시켜야 transition 이 걸린다(같은 프레임에 바꾸면 최종값으로 그냥 그려진다)
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 0)';
  });

  setTimeout(() => {
    toast.style.transition = `opacity ${TOAST_OUT_MS}ms ease-in, transform ${TOAST_OUT_MS}ms ease-in`;
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 8px)';
    setTimeout(() => toast.remove(), TOAST_OUT_MS);
  }, TOAST_HOLD_MS);
}

// 토스트 메시지 표시 함수 — 웹·앱 모두 위 웹 토스트로 그린다(네이티브 위임 없음)
export async function showToast(message) {
  createWebToast(message);
}

// 진동 함수
// 사용 예시:
// 1. 지정된 시간 진동 (예: 100ms):
//    vibrate({ duration: 100 });
//
// 2. 기본 진동 (400ms):
//    vibrate();  // 또는 vibrate({})
//
// 3. 진동 취소:
//    vibrate({ cancel: true });
export async function vibrate(props = null) {
  if (getDevicePlatform() === 'web') {
    // 웹 환경에서는 navigator.vibrate API 사용
    if ('vibrate' in navigator) {
      if (props && props.cancel) {
        // 진동 취소
        navigator.vibrate(0);
      } else if (props && props.duration) {
        // 지정된 시간 진동
        navigator.vibrate(props.duration);
      } else {
        // 기본 진동 (400ms)
        navigator.vibrate(400);
      }
    }
  } else {
    // 앱 환경에서는 ReactNativeWebView를 통해 네이티브에 요청
    if (window.ReactNativeWebView) {
      // props가 없거나 빈 객체면 기본 진동
      const hasProps = props && (props.duration || props.cancel || props.type);

      if (hasProps) {
        // duration, cancel 또는 type이 있는 경우: props 포함
        await window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'vibrate',
          props: props
        }));
      } else {
        // 기본 진동: props 없이 type만 전송
        await window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'vibrate'
        }));
      }
    }
  }
}

// 앱 종료 함수
export async function closeApp() {
  if (getDevicePlatform() === 'web') {
    window.close();
  } else {
    await window.ReactNativeWebView.postMessage(JSON.stringify({ 'type': 'closeApp' }));
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

// 구글 회원 탈퇴 함수 (로그아웃과 동일하게 구글 계정 선택 팝업 표시)
export async function launchGoogleWithdraw() {
  if (getDevicePlatform() === 'web') {
    // 웹 환경에서는 처리하지 않음 (웹 회원 탈퇴는 별도로 처리)
    return;
  } else {
    // 앱 환경에서는 앱에 로그아웃 요청 전송 (회원 탈퇴도 동일한 구글 계정 선택 팝업 사용)
    if (window.ReactNativeWebView) {
      await window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'launchGoogleLogout' // 회원 탈퇴도 동일한 구글 계정 선택 팝업 사용
      }));
    }
  }
}

export async function getDeviceOs() {
  if (getDevicePlatform() === 'web') {
    return 'web';
  } else {
    // 앱 환경에서는 앱에 로그아웃 요청 전송
    if (window.ReactNativeWebView) {
      return await window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'getDeviceOs'
      }));
    }
  }
}

// 앱 종료 더블탭을 위한 변수
let appExitPressed = false;
let appExitTimeout = null;

// 안드로이드 하드웨어 백 / iOS 스와이프 백에서 호출되는 함수
// options.direction === 'horizontal' 이면 등장 방향이 가로인 요소(풀시트/페이지)만 처리하고
// 하단에서 등장하는 바텀시트는 건너뛴다(바텀시트는 아래로 드래그로 닫음).
export function onBackPressed(options = {}) {
  const horizontal = options.direction === 'horizontal';
  const currentPath = AppHistory.getCurrentPath();

  const hasBottomSheet =
    window.newBottomSheetContext && window.newBottomSheetContext.stack.length > 0;

  if (hasBottomSheet) {
    if (horizontal) {
      // 가로 스와이프는 바텀시트를 닫지 않음 (아래로 드래그 제스처 영역)
      return;
    }
    window.newBottomSheetContext.popNewBottomSheet();
    return;
  }


  if (window.newFullSheetContext && window.newFullSheetContext.stack.length > 0) {
    window.newFullSheetContext.popNewFullSheet();
    return;
  }

  // 5. 앱 종료가 필요한 상황인지 확인 (정규식 사용)
  const shouldExitApp = /^\/(home|vocabulary-sheets|book-store|class|mypage|dictionary)\/?$/.test(currentPath);

  if (shouldExitApp) {
    // iOS 가로(엣지) 스와이프는 루트 페이지(홈/단어장/사전/상점/마이페이지)에서 아무 동작도 하지 않음.
    // (풀시트가 열렸거나 한 스텝 들어간 경우에만 위에서 처리됨)
    if (horizontal) {
      return;
    }
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
    } else if (!horizontal) {
      // 히스토리가 없으면 앱 종료 요청 (가로 스와이프는 앱을 종료하지 않음)
      closeApp();
    }
  }
}

// window.is_backable = is_backable;
window.onBackPressed = onBackPressed

