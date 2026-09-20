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

const STORAGE_KEY = 'feel.haptics';

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

/** 사용자가 손맛(햅틱)을 껐는지. 기본값은 켜짐(on). */
export function isHapticsEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** 마이페이지 설정 토글 등에서 호출 — on/off 를 localStorage 에 저장한다. */
export function setHapticsEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // 저장 실패는 무시 — 다음 세션엔 다시 기본값(켜짐)으로 동작
  }
}

/**
 * 손맛 진동 하나를 울린다.
 * - 사용자가 껐으면(feel.haptics=off) 아무 일도 하지 않는다.
 * - 같은 kind 는 60ms 내 중복 호출을 무시한다(연타 방지).
 * - 앱(WebView) 이면 기존 vibrate() 브릿지에 hapticType 을 실어 보낸다.
 * - 순수 웹이면 navigator.vibrate 패턴으로 폴백한다.
 *
 * @param {'light'|'medium'|'heavy'|'success'|'warning'|'error'|'selection'} kind
 */
export function haptic(kind) {
  if (!HAPTIC_TYPE_MAP[kind]) return;
  if (!isHapticsEnabled()) return;

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

export default haptic;
