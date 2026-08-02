/**
 * nativeBridge.js — 웹 → 네이티브 요청의 단일 창구(응답을 기다리는 요청 전용).
 *
 * 왜 필요한가: 웹(프론트/백엔드)은 항상 최신인데 **사용자의 앱은 과거 버전에 머문다.**
 * 지금 구조에서 웹이 구버전 앱에 없는 메시지를 보내면 앱은 `console.log` 만 하고 끝나므로
 * (heyvoca_app `src/handlers/webviewMessageHandler.ts` 의 `default:`) 웹은 **응답을 영원히 기다린다.**
 * 에러가 아니라 무반응이라 사용자에겐 "멈춘 화면", 개발자에겐 아무 신호도 안 남는다.
 *
 * 그래서 이 모듈의 규율은 셋이다(CodingPT `codingpt_back/config/caps.js` 교리를 웹뷰 2자 구조로 축약):
 *   1. **조용히 실패하지 않는다** — 응답이 없으면 반드시 거절(reject)한다. 무한 대기 금지.
 *   2. **폴백은 항상 기존 동작** — 거절은 화면을 부수는 게 아니라 "쓸 수 있는 상태"로 되돌리는 신호다.
 *   3. **아는 것만 막는다** — 표에 있는 타입만 버전으로 선차단하고, 모르는 타입은 보내 보고
 *      타임아웃이 잡는다(과잉 차단으로 멀쩡한 기능을 막지 않기 위해).
 *
 * ※ 이건 "웹만으로 할 수 있는 절반" 이다. 나머지 절반(앱이 자기 능력을 선언 + 모르는 메시지에
 *   `unsupported_message` 회신)은 앱 배포가 필요하다. 이 모듈은 그 회신을 **이미 받을 수 있게**
 *   준비돼 있으므로, 앱 쪽이 들어오면 웹 수정 없이 즉시 정확도가 올라간다.
 */
import postMessageManager from './postMessageManager';
import { parseAppVersion } from './osFunction';

/**
 * 네이티브 핸들러가 **처음 들어간 앱 버전**.
 *
 * 근거: heyvoca_app 리포에서 `git log -S"case '<type>'" -- src/handlers/webviewMessageHandler.ts`
 * 로 최초 커밋을 찾고, 그 커밋의 `android/app/build.gradle` versionName 을 읽어 실측했다
 * (2026-08-01). 스토어 최초 출시가 1.0.0 이므로 그 이전 버전에 들어온 핸들러는 **모든 출시본에
 * 존재**한다 → 표에서 `'1.0.0'` 으로 정규화했다.
 *
 * ⚠ 이 표는 **손으로 유지하는 사본**이다. 앱에 새 핸들러를 추가하면 여기도 추가할 것.
 *   빠뜨리면 과잉 차단이 아니라 과소 차단(= 무반응)으로 기운다 — 타임아웃이 마지막 그물이다.
 *   앱이 능력을 스스로 선언하게 되면(다음 단계) 이 표는 구버전 앱 추론용 폴백으로만 남는다.
 */
export const NATIVE_HANDLER_MIN_VERSION = {
  // 1.0.0 이전 — 모든 출시본에 존재
  log: '1.0.0',
  alert: '1.0.0',
  confirm: '1.0.0',
  setCookie: '1.0.0',
  showToast: '1.0.0',
  closeApp: '1.0.0',
  vibrate: '1.0.0',
  iapPurchase: '1.0.0',
  launchGoogleAuth: '1.0.0',
  launchGoogleLogout: '1.0.0',
  launchAppleAuth: '1.0.0',
  launchGoogleSheetAuth: '1.0.0',
  requestFcmToken: '1.0.0',
  openImagePicker: '1.0.0',
  openUrl: '1.0.0',
  // 1.0.3 — OS 알림 권한 3종
  checkNotificationPermission: '1.0.3',
  requestNotificationPermission: '1.0.3',
  openAppSettings: '1.0.3',
  // 1.0.4
  setNativeTheme: '1.0.4',
  webSplashReady: '1.0.4',
  // 1.1.0 — 실험실(채팅으로 학습). ※ 2026-08-01 기준 스토어 최신은 1.0.5 라 아직 아무에게도 없다.
  launchChatStudy: '1.1.0',
  openChatStudy: '1.1.0',
};

/** 요청 실패 사유 — 호출부는 이 코드로 분기해 폴백을 고른다. */
export const BridgeErrorCode = {
  NO_NATIVE: 'NO_NATIVE',       // 앱이 아님(순수 웹 브라우저) — 네이티브 기능 자체가 없다
  UNSUPPORTED: 'UNSUPPORTED',   // 구버전 앱 — 이 핸들러가 아직 없다(업데이트 안내 대상)
  SEND_FAILED: 'SEND_FAILED',   // postMessage 자체가 실패
  NO_ACK: 'NO_ACK',             // 요청은 갔는데 "시작했다" 신호가 안 옴 — 사실상 미지원으로 취급
  TIMEOUT: 'TIMEOUT',           // 시작은 했는데 끝내 결과가 안 옴
};

export class NativeBridgeError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'NativeBridgeError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/** 지금 실행 환경. version/build 는 앱 WebView 의 userAgent 에서 온다. */
export function getNativeEnv() {
  const info = parseAppVersion();
  const hasRN = typeof window !== 'undefined' && !!window.ReactNativeWebView;
  return {
    isApp: hasRN,
    platform: info?.platform || null,
    version: info?.version || null,
    build: info?.build || null,
  };
}

// "x.y.z" 비교: a >= b. (osFunction 의 것과 같은 규칙 — 여기서 재구현하는 대신 공개 함수를 쓰고 싶지만
//  osFunction 은 isVersionGte 를 내보내지 않는다. 규칙이 바뀌면 두 곳을 함께 고칠 것.)
function versionGte(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

/**
 * 이 네이티브 기능을 지금 쓸 수 있는가.
 * - 앱이 아니면 false(순수 웹에는 네이티브가 없다)
 * - 표에 있으면 앱 버전으로 판정
 * - 표에 없으면 true — **모르는 것을 막지 않는다.** 잘못 차단하면 멀쩡한 기능이 죽고,
 *   반대로 통과시키면 타임아웃이 잡는다(둘 중 덜 나쁜 쪽).
 */
export function canUseNative(type) {
  const env = getNativeEnv();
  if (!env.isApp) return false;
  const min = NATIVE_HANDLER_MIN_VERSION[type];
  if (!min) return true;
  if (!env.version) return true; // UA 파싱 실패 — 막지 않고 타임아웃에 맡긴다
  return versionGte(env.version, min);
}

/** 이 기능이 필요한 최소 앱 버전(모르면 null) — 업데이트 안내 문구에 쓴다. */
export function requiredAppVersion(type) {
  return NATIVE_HANDLER_MIN_VERSION[type] || null;
}

/**
 * 요청을 **보내기 전에** 막아야 할 때 쓰는 사유 객체(쓸 수 있으면 null).
 *  "웹이라서 없음" 과 "구버전이라서 없음" 은 사용자에게 할 말이 다르므로 코드로 구분한다.
 */
export function nativeUnavailableReason(type) {
  const env = getNativeEnv();
  if (!env.isApp) {
    return new NativeBridgeError(BridgeErrorCode.NO_NATIVE, `앱 환경이 아닙니다(${type})`, { type });
  }
  if (!canUseNative(type)) {
    return new NativeBridgeError(
      BridgeErrorCode.UNSUPPORTED,
      `이 앱 버전(${env.version})에는 ${type} 핸들러가 없습니다`,
      { type, appVersion: env.version, requiredVersion: requiredAppVersion(type) },
    );
  }
  return null;
}

/**
 * 네이티브에 요청을 보내고 응답을 기다린다.
 *
 * @param {string} type                 웹 → 네이티브 메시지 타입
 * @param {object} props                메시지 payload
 * @param {object} options
 *   @param {string[]} options.expect      이 중 하나가 오면 resolve(종료 신호들)
 *   @param {string}   options.ack         "처리를 시작했다" 신호(있으면 짧은 시계로 미지원을 빨리 판정)
 *   @param {number}   options.ackTimeout  ack 대기(ms). 기본 5초
 *   @param {number}   options.timeout     전체 대기(ms). 0 이면 전체 시계 없음(ack 만 감시)
 * @returns {Promise<{type:string, data:any}>}
 *
 * ⚠ timeout 은 "사용자가 오래 걸리는 작업"(사진 고르기·결제 승인)을 죽이는 용도가 아니다.
 *   그런 흐름에서는 timeout 을 넉넉히 주거나 0 으로 끄고 ack 로만 미지원을 판정할 것.
 */
export function requestNative(type, props = {}, options = {}) {
  const { expect = [], ack = null, ackTimeout = 5000, timeout = 15000 } = options;

  return new Promise((resolve, reject) => {
    const env = getNativeEnv();
    if (!env.isApp) {
      reject(new NativeBridgeError(BridgeErrorCode.NO_NATIVE, `앱 환경이 아닙니다(${type})`, { type }));
      return;
    }
    if (!canUseNative(type)) {
      reject(new NativeBridgeError(
        BridgeErrorCode.UNSUPPORTED,
        `이 앱 버전(${env.version})에는 ${type} 핸들러가 없습니다`,
        { type, appVersion: env.version, requiredVersion: requiredAppVersion(type) },
      ));
      return;
    }

    let settled = false;
    let acked = false;
    const offs = [];
    let ackTimer = null;
    let hardTimer = null;

    const cleanup = () => {
      offs.forEach((off) => { try { off(); } catch (_) { /* noop */ } });
      offs.length = 0;
      if (ackTimer) clearTimeout(ackTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };
    const done = (fn) => (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(payload);
    };
    const finish = done(resolve);
    const fail = done(reject);

    // 종료 신호들
    for (const t of expect) {
      offs.push(postMessageManager.waitFor(t, (data) => finish({ type: t, data })));
    }

    // 앱이 "그런 메시지 모른다" 고 정직하게 답하는 경우(앞으로 들어올 계약).
    //  네이티브는 반드시 requestType 을 되돌려줘야 한다 — 그래야 어느 요청의 실패인지 귀속된다.
    offs.push(postMessageManager.waitFor('unsupported_message', (data) => {
      const reqType = data?.requestType ?? data?.data?.requestType;
      if (reqType !== type) return; // 남의 실패는 가로채지 않는다
      fail(new NativeBridgeError(
        BridgeErrorCode.UNSUPPORTED,
        `앱이 ${type} 를 지원하지 않는다고 회신했습니다`,
        { type, appVersion: env.version, requiredVersion: requiredAppVersion(type) },
      ));
    }));

    if (ack) {
      offs.push(postMessageManager.waitFor(ack, () => { acked = true; }));
      ackTimer = setTimeout(() => {
        if (settled || acked) return;
        fail(new NativeBridgeError(
          BridgeErrorCode.NO_ACK,
          `${type} 요청에 앱이 응답하지 않습니다(${ackTimeout}ms)`,
          { type, appVersion: env.version },
        ));
      }, ackTimeout);
    }

    if (timeout > 0) {
      hardTimer = setTimeout(() => {
        if (settled) return;
        fail(new NativeBridgeError(
          BridgeErrorCode.TIMEOUT,
          `${type} 응답이 오지 않았습니다(${timeout}ms)`,
          { type, appVersion: env.version, acked },
        ));
      }, timeout);
    }

    const sent = postMessageManager.sendMessageToReactNative(type, props);
    if (!sent) {
      fail(new NativeBridgeError(BridgeErrorCode.SEND_FAILED, `${type} 전송 실패`, { type }));
    }
  });
}

/**
 * 실패를 사용자에게 보여줄 한 줄로. 원인마다 할 일이 다르므로 문구도 달라야 한다
 * (구버전 앱이면 "업데이트", 웹이면 "앱에서 이용", 무응답이면 "다시 시도").
 */
export function describeBridgeError(err, fallback = '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.') {
  if (!err || !err.code) return fallback;
  switch (err.code) {
    case BridgeErrorCode.NO_NATIVE:
      return '이 기능은 헤이보카 앱에서 이용할 수 있어요.';
    case BridgeErrorCode.UNSUPPORTED:
    case BridgeErrorCode.NO_ACK:
      return '앱을 최신 버전으로 업데이트하면 이용할 수 있어요.';
    case BridgeErrorCode.TIMEOUT:
    case BridgeErrorCode.SEND_FAILED:
      return fallback;
    default:
      return fallback;
  }
}
