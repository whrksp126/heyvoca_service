// Google Analytics 4 (gtag.js) — 측정 ID 는 공개값이라 소스 상수로 둔다.
// 비어 있으면 아무것도 로드·전송하지 않는다(no-op). localhost 에서도 전송하지 않는다.
import { getDevicePlatform } from './osFunction';

// 측정 ID(G-XXXXXXXXXX)를 여기에 넣는다.
export const GA_MEASUREMENT_ID = 'G-2E52ET68PR';

let initialized = false;

const isEnabled = () => {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return !(h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
};


const getPlatform = () => {
  const p = getDevicePlatform();
  if (p === 'ios') return 'app_ios';
  if (p === 'android') return 'app_android';
  return 'web';
};

export function initAnalytics() {
  if (initialized || !isEnabled()) return;
  initialized = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtagFn() { window.dataLayer.push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(s);
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
  window.gtag('set', 'user_properties', { platform: getPlatform() });
}

export function trackPageView(path) {
  if (!isEnabled()) return;
  initAnalytics();
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: document.title,
    page_location: window.location.href,
  });
}

// 로그인 사용자 id(내부 id, 이메일 금지). null 이면 해제.
export function setAnalyticsUserId(userId) {
  if (!isEnabled()) return;
  initAnalytics();
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    user_id: userId ? String(userId) : null,
  });
}

// 개인정보(이메일·닉네임) 파라미터는 넣지 말 것.
export function getLoginMethod() {
  try { return localStorage.getItem('heyvoca_login_provider') || 'unknown'; } catch { return 'unknown'; }
}

export function trackEvent(name, params = {}) {
  if (!isEnabled()) return;
  initAnalytics();
  window.gtag('event', name, params);
}
