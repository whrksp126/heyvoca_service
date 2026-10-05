// src/lib/feel/haptics.js
//
// 공통 햅틱 피드백 — "손맛" 시스템의 진동 담당.
//
// 【왜 새 메시지를 만들지 않았나】 이 앱은 이미 utils/osFunction.jsx 의 vibrate() 로
// RN 브릿지(postMessage {type:'vibrate', props:{type, duration, cancel}})와
// navigator.vibrate 폴백을 갖고 있다. 그리고 heyvoca_app 쪽 핸들러
// (heyvoca_app/src/handlers/webviewMessageHandler.ts 의 'vibrate' case, 212~ 행)는
// props.type 을 react-native-haptic-feedback 트리거 이름
// (impactLight/impactMedium/impactHeavy/notificationSuccess/notificationWarning/
// notificationError/selection) 으로 그대로 넘겨 네이티브 햅틱을 울린다.
// 실제로 components/takeTest/Main.jsx 채점 지점이 이미
// `vibrate({ type: 'notificationSuccess' })` / `vibrate({ type: 'notificationError' })`
// 형태로 이 다리를 쓰고 있다(cardMatch/fillInTheBlank 플러그인도 동일).
//
// 그래서 이 모듈은 `{type:'haptic', kind}`라는 새 스키마를 발명해 앱에 없는 핸들러를
// 부르는 대신, kind 를 **이미 있는 hapticType 이름**으로 매핑해 같은 vibrate() 다리를
// 재사용한다 — 앱 쪽 코드를 한 줄도 바꾸지 않고 바로 연결된다.
//
// 【앱 쪽 상태 — 중요, 보고 참고】 heyvoca_app/src/handlers/webviewMessageHandler.ts 의
// 'vibrate' 케이스는 `const HAPTIC_ENABLED = false` 로 게이트돼 있다(주석: "햅틱 일시
// 비활성화 토글: true로 바꾸면 다시 켜짐"). 즉 지금은 이 함수가 무슨 kind 를 보내도
// **앱 안에서는 실제 진동이 울리지 않는다**(코드 경로는 맞게 연결돼 있다). 이 작업 지시상
// 앱 코드는 건드리지 않으므로, 앱 팀이 그 플래그를 되돌리면 아무 웹 코드 변경 없이 바로
// 살아난다.
//
// 순수 웹(WebView 아님 — 모바일 브라우저로 접속 등)에서는 navigator.vibrate 패턴으로
// 직접 폴백한다. vibrate() 유틸은 이 환경에서 duration 하나만 받는 단순 형태라 kind별
// on/off 패턴(success=[10,40,15] 등)을 표현할 수 없어, 그 경우만 여기서 따로 분기한다.
//
// ─────────────────────────────────────────────────────────────────────────
// kind 사용 규표 — 새로 추가할 때도 이 표를 따를 것 (흩뿌리지 말고 이 표에 없는 새
// 지점을 추가하려면 먼저 표부터 늘릴 것)
//
//   light      가벼운 탭 — 선택지 버튼, 카드 탭, 일반 CTA, 슬라이드 넘기기
//   medium     의미 있는 전환 — 게이지 진화, 당겨서 새로고침 ready 진입
//   heavy      드물게, 강한 확정 — 현재 미사용(예약)
//   success    정답, 구매 성공, 콤보 신기록, 결과 화면의 좋은 소식 슬라이드 등장
//   warning    경고성 확인 — 현재 미사용(예약)
//   error      오답, 구매 실패
//   selection  탭바 전환, 결과 화면 슬라이드 전환처럼 "여러 개 중 하나로 바뀜"
// ─────────────────────────────────────────────────────────────────────────

import { vibrate, getDevicePlatform } from '../../utils/osFunction';
import postMessageManager from '../../utils/postMessageManager';
import { getHapticPattern, KIND_FALLBACK, eventsToWebPattern } from './hapticPatterns';
import { canUseNative } from '../../utils/nativeBridge';
import { getHapticMode, applyStrength } from './hapticSettings';

// kind → react-native-haptic-feedback 트리거 이름 (앱 브릿지로 그대로 전달됨)
const HAPTIC_TYPE_MAP = {
  light: 'impactLight',
  medium: 'impactMedium',
  heavy: 'impactHeavy',
  success: 'notificationSuccess',
  warning: 'notificationWarning',
  error: 'notificationError',
  selection: 'selection',
};

// 순수 웹(비 WebView) navigator.vibrate 폴백 패턴(ms) — 숫자는 단발, 배열은 [on,off,on...]
const WEB_VIBRATE_PATTERN = {
  light: 8,
  medium: 15,
  heavy: 25,
  success: [10, 40, 15],
  // 스펙에 명시되지 않아 success(강)·error(약) 사이 세기로 추정해 채움 — 보고 참고
  warning: [20, 40, 20],
  error: [30, 50, 30],
  selection: 5,
};

const DEBOUNCE_MS = 60;
const lastFiredAt = {};

/**
 * 손맛 진동 하나를 울린다. 모든 사용자에게 항상 적용한다(설정 토글 없음).
 * - 같은 kind 는 60ms 내 중복 호출을 무시한다(연타 방지).
 * - 앱(WebView) 이면 기존 vibrate() 브릿지에 hapticType 을 실어 보낸다.
 * - 순수 웹이면 navigator.vibrate 패턴으로 폴백한다(기기의 시스템 진동/무음 모드는
 *   OS/브라우저 레벨에서 알아서 존중됨 — 여기서 따로 판단하지 않는다).
 *
 * @param {'light'|'medium'|'heavy'|'success'|'warning'|'error'|'selection'} kind
 */
export function haptic(kind) {
  if (!HAPTIC_TYPE_MAP[kind]) return;

  const now = Date.now();
  if (now - (lastFiredAt[kind] || 0) < DEBOUNCE_MS) return;
  lastFiredAt[kind] = now;

  const isApp = typeof window !== 'undefined'
    && getDevicePlatform() !== 'web'
    && !!window.ReactNativeWebView;

  if (isApp) {
    vibrate({ type: HAPTIC_TYPE_MAP[kind] });
    return;
  }

  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  navigator.vibrate(WEB_VIBRATE_PATTERN[kind]);
}

// ─────────────────────────────────────────────────────────────────────────
// 커스텀 패턴 — 앱 1.1.2 부터 `haptic_pattern` / `haptic_warmup` 브릿지가 생긴다(응답 없음).
//   {type:'haptic_pattern', props:{events, delayMs, cancelPrevious}}
//     events 1~32개·총 길이 ≤3000ms·구간 비중첩(어기면 앱이 통째로 무시), delayMs 0~500 은 앱이 모든
//     이벤트 time 에 더해 **네이티브 시간축**에서 지연시킨다(JS 타이머 아님),
//     cancelPrevious 는 이전 패턴을 끊는다 — iOS 는 stop 이 엔진을 내려 다음 재생이 늦어지므로
//     **기본 false**, 길게 울리는 complete 를 끊어야 할 때처럼 꼭 필요한 큐에서만 true.
//   {type:'haptic_warmup'} (props 없음) — 햅틱 엔진 예열. 학습 화면 진입 시 1회.
// 지원 여부는 utils/nativeBridge.js 의 NATIVE_HANDLER_MIN_VERSION 표(haptic_pattern: 1.1.2)로 판정한다.
// 미만 앱은 이 메시지를 모르므로(보내면 무반응) 보내지 않고 기존 kind 매핑으로 폴백한다.
// ─────────────────────────────────────────────────────────────────────────
const isAppWebView = () => typeof window !== 'undefined'
  && getDevicePlatform() !== 'web'
  && !!window.ReactNativeWebView;

/** 이 앱이 커스텀 진동 패턴 브릿지를 갖고 있는가(1.1.2+). 순수 웹/구버전은 false. */
export function supportsHapticPattern() {
  return isAppWebView() && canUseNative('haptic_pattern');
}

let warmedUp = false;
/** 햅틱 엔진 예열 — 지원 앱에서만, 페이지 수명 동안 1회. */
export function hapticWarmup() {
  if (warmedUp || !supportsHapticPattern() || !canUseNative('haptic_warmup')) return;
  warmedUp = true;
  postMessageManager.sendMessageToReactNative('haptic_warmup');
  ensureHapticCaps();
}

/**
 * 앱 햅틱 능력 조회 — {type:'haptic_caps'} 요청 → {type:'haptic_caps', data:{platform, apiLevel,
 * hasAmplitudeControl, supportsPrebaked}} 회신. 구버전 앱/웹은 회신이 없으므로 타임아웃(1.5초)에 null.
 * 손맛 테스트 화면 표시 전용.
 * @returns {Promise<null|{platform:string, apiLevel:number, hasAmplitudeControl:boolean, supportsPrebaked:boolean}>}
 */
export function requestHapticCaps(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!isAppWebView()) { resolve(null); return; }
    let done = false;
    let off = () => {};
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off();
      if (v) cachedCaps = v; // 손맛 테스트에서 조회해도 이후 feel() 이 같은 재생 방식을 쓰게 한다
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    off = postMessageManager.waitFor('haptic_caps', (msg) => finish(msg?.data ?? null));
    if (!postMessageManager.sendMessageToReactNative('haptic_caps')) finish(null);
  });
}

// 학습 화면 진입 시 1회 조회해 캐시한다(hapticWarmup 이 호출). 회신 전·실패 시 null → effect 패턴이 기본
// (앱이 미지원이면 자체 폴백). Android 에서 supportsPrebaked===false 면 hapticPattern 이 waveform 변형을 보낸다.
let cachedCaps = null;
let capsRequested = false;
export function getCachedHapticCaps() { return cachedCaps; }
export function ensureHapticCaps() {
  if (capsRequested || !supportsHapticPattern()) return;
  capsRequested = true;
  requestHapticCaps().then((v) => { if (v) cachedCaps = v; });
}

const PATTERN_DEBOUNCE_MS = 40;
const patternLastAt = {};
const MAX_NATIVE_DELAY_MS = 500;

/**
 * 지금 쓸 패턴 변형 — 'ios' | 'android'(프리베이크 effect) | 'android-waveform'(진폭 제어).
 * Android 기본(auto)은 진폭 제어가 되면 waveform, 아니면 프리베이크. 프리베이크 미지원이면 항상 waveform.
 * 손맛 테스트의 재생 방식(feel.hapticMode)이 auto 가 아니면 그 값을 강제한다.
 */
export function resolveHapticVariant(caps = cachedCaps) {
  if (getDevicePlatform() !== 'android') return 'ios';
  const mode = getHapticMode();
  if (mode === 'waveform') return 'android-waveform';
  if (mode === 'prebaked') return 'android';
  if (caps?.hasAmplitudeControl) return 'android-waveform';
  if (caps && caps.supportsPrebaked === false) return 'android-waveform';
  return 'android';
}

/**
 * 이름 붙은 진동 패턴을 울린다. 저장된 오버라이드·전역 세기가 여기서 반영된다.
 * @param {string} name  hapticPatterns.js 의 패턴 이름
 * @param {{delayMs?:number, n?:number, cancelPrevious?:boolean, events?:object[], force?:boolean}} opts
 *   delayMs 는 소리와 맞추기 위한 시작 지연(cue.js 가 계산). n 은 combo 세기.
 *   events 를 주면 그 이벤트를 그대로(세기만 적용) 울린다 — 편집기 미리 듣기용. force 는 디바운스 무시 + 이전 패턴 끊기.
 */
export function hapticPattern(name, { delayMs = 0, n, cancelPrevious = false, events: given, force = false } = {}) {
  const base = given || getHapticPattern(name, { n, platform: resolveHapticVariant() });
  if (!base || base.length === 0) return;
  const events = applyStrength(base);

  const now = Date.now();
  if (!force) {
    if (now - (patternLastAt[name] || 0) < PATTERN_DEBOUNCE_MS) return;
    patternLastAt[name] = now;
  }

  const delay = Math.max(0, Math.round(delayMs));

  if (supportsHapticPattern()) {
    postMessageManager.sendMessageToReactNative('haptic_pattern', {
      events,
      delayMs: Math.min(delay, MAX_NATIVE_DELAY_MS),
      cancelPrevious: force || cancelPrevious,
    });
    return;
  }

  const run = () => {
    if (isAppWebView()) {
      // 구버전 앱 — 가장 가까운 기존 kind. 기존 haptic() 의 60ms 디바운스를 그대로 탄다.
      const kind = KIND_FALLBACK[name];
      if (kind) haptic(kind);
      return;
    }
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    navigator.vibrate(eventsToWebPattern(events));
  };
  if (delay > 4) setTimeout(run, delay); else run();
}

export default haptic;
