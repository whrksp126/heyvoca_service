# 웹뷰 브릿지 계약 — 구버전 앱과 최신 웹이 만나는 지점

작성 2026-08-01 · 대상: `heyvoca_front`(항상 최신) ↔ `heyvoca_app`(사용자가 구버전에 머묾)

## 왜 계약이 필요한가

프론트/백엔드는 배포 즉시 최신이 되지만 **앱은 사용자가 업데이트해야 최신이 된다.** 그래서 최신 웹이
구버전 앱에 없는 네이티브 기능을 부르는 조합이 항상 존재한다. 지금 앱은 모르는 메시지를 받으면
`console.log` 만 하고 끝나므로(`heyvoca_app/src/handlers/webviewMessageHandler.ts` 의 `default:`)
웹은 **오지 않을 응답을 영원히 기다린다.** 에러가 아니라 무반응이라 사용자에겐 멈춘 화면이고
개발자에겐 아무 신호도 남지 않는다.

실제로 그렇게 갇히던 자리가 둘 있었다(2026-08-01 수정):

- **보석 결제 시트** — backdrop·드래그 닫기가 꺼져 있고 확인 버튼도 `disabled={isLoading}` 라
  응답이 없으면 **빠져나갈 수 없었다.** 순수 웹 브라우저에서는 `postMessage` 가 조용히 무시돼
  100% 재현됐다.
- **사전 OCR 촬영** — `ocrResult/ocrCancel/ocrError` 중 하나가 와야만 촬영 대기가 풀렸다.

## 규율 3개

CodingPT 의 caps 교리(`codingpt_back/config/caps.js`)를 웹뷰 2자 구조로 줄인 것이다.

1. **조용히 실패하지 않는다.** 응답을 기다리는 요청은 반드시 끝난다 — 성공이든 거절이든.
2. **폴백은 언제나 "쓸 수 있는 상태"** 로의 복귀다. 실패가 화면을 부수면 안 된다.
3. **아는 것만 막는다.** 표에 있는 타입만 버전으로 선차단하고, 모르는 타입은 보내 보고 시계가 잡는다.
   과잉 차단은 멀쩡한 기능을 죽이지만, 과소 차단은 시계가 구제한다.

## 웹 쪽 (구현 완료 — 앱 배포 불필요)

`heyvoca_front/src/utils/nativeBridge.js`

| API | 용도 |
|---|---|
| `canUseNative(type)` | 지금 환경에서 이 네이티브 기능을 쓸 수 있는가 |
| `nativeUnavailableReason(type)` | 못 쓰면 사유 객체, 쓸 수 있으면 `null` (요청 **보내기 전** 차단용) |
| `requestNative(type, props, {expect, ack, ackTimeout, timeout})` | 응답을 기다리는 요청. 반드시 끝난다 |
| `describeBridgeError(err, fallback)` | 사유별 사용자 문구("앱에서 이용" vs "업데이트") |

거절 코드: `NO_NATIVE`(웹 브라우저) · `UNSUPPORTED`(구버전 앱) · `NO_ACK`(시작 신호 없음) ·
`TIMEOUT`(결과 없음) · `SEND_FAILED`.

`postMessageManager.waitFor(type, cb)` 는 기존 `addListener` 와 **별도 채널**이다. 같은 타입에 여러
대기자를 붙일 수 있고 기존 화면 콜백을 밀어내지 않는다(리스너 Map 은 타입당 1개라 거기에 끼워 넣으면
남의 콜백을 덮어쓴다 — `setupAppGoogleLogout`/`setupAppGoogleWithdraw` 가 같은 타입을 쓴다).

### 시계를 고를 때

시계는 **교착을 푸는 그물**이지 느린 작업을 끊는 도구가 아니다. 사진 고르기·결제 승인은 몇 분씩
걸리므로 짧게 끊으면 정상 흐름을 죽인다. 끊은 뒤에 결과가 오면 그 결과는 갈 곳이 없어 작업이 날아간다.

| 자리 | 값 | 근거 |
|---|---|---|
| 결제 ack(`iap_purchase_started`) | 15초 | 네이티브가 `requestPurchase` 직후 바로 보낸다 |
| 결제 결과 | 5분 | 카드·가족 승인 대기. 넘어도 **결제를 취소하지 않고 화면만 열어 준다** |
| OCR 전체 | 10분 | 오탐이 사실상 불가능한 길이. 10분 무신호 = 네이티브가 죽은 것 |

## 앱 쪽 (아직 안 함 — 다음 앱 배포에 실을 것)

### 1. 모르는 메시지에 정직하게 회신

```ts
default:
  webViewRef.current?.postMessage(JSON.stringify({
    type: 'unsupported_message',
    requestType: messageData.type,   // ★ 반드시 되돌려줄 것
    appVersion: DeviceInfo.getVersion(),
  }));
```

`requestType` 이 없으면 웹이 **어느 요청의 실패인지 귀속할 수 없어** 남의 실패를 가로채거나 무시한다.
웹은 이 회신을 **이미 받을 수 있다**(`requestNative` 가 처리) — 앱만 보내면 즉시 정확도가 올라간다.

### 2. 능력 선언 (버전 추론 없애기)

```ts
// 핸들러를 { type: handler } 레지스트리로 바꾸고 목록을 **파생**시킨다
const NATIVE_CAPS = Object.keys(handlerRegistry);
webViewRef.current?.injectJavaScript(
  `window.__HEYVOCA_NATIVE__ = ${JSON.stringify({ version, build, platform, caps: NATIVE_CAPS })};true;`
);
```

★ **목록을 손으로 적지 말 것.** CodingPT 는 손으로 적은 선언과 실제 구현이 어긋나 "선언은 정직한데
발현이 0" 인 상태를 몇 주 방치했다(`caps.js:28-39` 사건 기록). 선언은 구현에서 파생돼야 어긋날 수 없다.

이게 들어오면 `NATIVE_HANDLER_MIN_VERSION` 표는 **구버전 앱 추론용 폴백**으로만 남는다.

## `NATIVE_HANDLER_MIN_VERSION` 표 유지 규칙

`nativeBridge.js` 의 표는 "이 핸들러가 처음 들어간 앱 버전"이다. 근거는 추측이 아니라 실측이다:

```bash
cd heyvoca_app
git log --reverse --format=%H -S"case '<type>'" -- src/handlers/webviewMessageHandler.ts | head -1
git show <commit>:android/app/build.gradle | grep versionName
```

스토어 최초 출시가 1.0.0 이라 그 이전 값은 `'1.0.0'`(= 모든 출시본에 존재)으로 정규화했다.
**앱에 새 핸들러를 추가하면 이 표에도 추가한다.** 빠뜨리면 과소 차단(=무반응)으로 기울고 시계가 잡는다.

이 방법으로 뽑은 값은 기존에 손으로 유지되던 상수 2개(`NOTIF_PERMISSION_MIN_APP_VERSION='1.0.3'`,
`LAB_MIN_APP_VERSION='1.1.0'`)와 정확히 일치했다 — 방법이 교차검증된 셈이다.

## 아직 남은 것

- **백엔드가 클라이언트 버전을 전혀 모른다** — 요청 헤더에도 DB 에도 없다. 그래서 "구버전 앱 사용자가
  몇 %인가"를 알 수 없고, **폴백을 언제 지워도 되는지 판단할 근거가 없다.** `X-Client` 헤더를 받아
  기록만 하는 것(분기 금지)이 다음 단계.
- 앱이 직접 호출하는 백엔드 API 2개(`/study/log`, `/mainpage/user_study_history`)는 앱 릴리스와 수명이
  묶인다 → **응답 필드 삭제·이름변경 금지, 추가만.**
- 조용한 실패를 서버로 리포트하는 경로(어떤 앱 버전이 어떤 기능을 못 썼는지).
