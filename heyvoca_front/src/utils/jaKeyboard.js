/**
 * jaKeyboard.js — 일본어 키보드 게이트의 판정부(화면 없음).
 *
 * 일본어 학습에는 직접 써 보는 문제가 있어 일본어 키보드가 필요하다. 학습을 시작하기 전에
 *  1) 통과 기록(localStorage)이 있고 네이티브가 "없음"이라 하지 않으면 통과,
 *  2) 앱(1.1.7+)이면 네이티브에 키보드 설치 여부를 물어 enabled 면 통과(기록 저장),
 *  3) 없음/모름이면 안내 시트(JaKeyboardGateNewBottomSheet)가 뜬다.
 *
 * 네이티브 규격(정본 docs/WEBVIEW_BRIDGE_CONTRACT.md):
 *  - 요청 {type:'getKeyboardStatus', lang:'ja'} → 응답 {type, lang, status:'enabled'|'missing'|'unknown', platform:'ios'|'android'}
 *  - 요청 {type:'openKeyboardSettings'} → 응답 {type, ok, target:'keyboard'|'app'}
 *  - 앱이 포그라운드로 돌아오면 {type:'appForeground'} 를 보낸다.
 */
import { canUseNative, requestNative, getNativeEnv } from './nativeBridge';

const STORAGE_KEY = 'heyvoca:jaKeyboardReady';
const STATUS_TIMEOUT_MS = 2500;

export const isJaKeyboardReady = () => {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
};

export const markJaKeyboardReady = () => {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) { /* noop */ }
};

export const clearJaKeyboardReady = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* noop */ }
};

const unwrap = (res) => {
  const d = res?.data;
  return d && typeof d === 'object' && d.data && typeof d.data === 'object' ? { ...d, ...d.data } : (d || {});
};

/**
 * 네이티브에 일본어 키보드 상태를 묻는다.
 * @returns {Promise<{status:'enabled'|'missing'|'unknown', platform:string|null}>} 절대 reject 하지 않는다 —
 *   브릿지가 없거나(웹·구버전 앱) 응답이 없으면 'unknown'.
 */
export const getJaKeyboardStatus = async () => {
  const env = getNativeEnv();
  const fallback = { status: 'unknown', platform: env.platform || null };
  if (!canUseNative('getKeyboardStatus')) return fallback;
  try {
    const res = await requestNative('getKeyboardStatus', { lang: 'ja' }, {
      expect: ['getKeyboardStatus'], timeout: STATUS_TIMEOUT_MS,
    });
    const d = unwrap(res);
    const status = d.status === 'enabled' || d.status === 'missing' ? d.status : 'unknown';
    return { status, platform: d.platform || env.platform || null };
  } catch (_) {
    return fallback;
  }
};

/** 키보드 설정 열기. @returns {Promise<{ok:boolean, target:'keyboard'|'app'|null}>} 절대 reject 하지 않는다. */
export const openJaKeyboardSettings = async () => {
  if (!canUseNative('openKeyboardSettings')) return { ok: false, target: null };
  try {
    const res = await requestNative('openKeyboardSettings', {}, {
      expect: ['openKeyboardSettings'], timeout: STATUS_TIMEOUT_MS,
    });
    const d = unwrap(res);
    return { ok: d.ok !== false, target: d.target === 'keyboard' ? 'keyboard' : 'app' };
  } catch (_) {
    return { ok: false, target: null };
  }
};

/** 입력값에 실제 히라가나/가타카나가 들어 있는가(조합 완료 후 값 기준). */
export const hasKanaChar = (text) => /[ぁ-ゖァ-ヺ]/.test(String(text ?? ''));
