# 스토어 제출 자동화 (헤이보카) — 어디까지 되고 어디부터 사람이 필요한가

결론부터: **심사 제출·상태 확인·승인 후 출시가 전부 자동화된다.** 업로드도 자동이다.
사람이 반드시 필요한 건 **최초 1회 세팅(콘텐츠 등급·App Privacy 설문)** 과 **거절 사유 읽기**뿐이다.

CodingPT 에서 실전 완주한 스크립트를 이식한 것이다(원본: `codingpt_service/scripts/store/`).
아래 함정들은 전부 그쪽에서 실측으로 알아낸 것이므로 **다시 조사하지 말 것.**

## 자격증명 (이미 갖춰져 있다 — 사용자에게 다시 묻지 말 것)

> ⚠ **이 리포는 공개(public)다.** 키 ID·Issuer ID 같은 식별자도 여기 적지 않는다(비밀은 아니지만
> 유출된 키와 짝을 맞춰 주는 정보다). 실제 값은 로컬 `.claude/skills/release/SKILL.md` 에 있다.

| 자격 | 위치 | 상태 |
|---|---|---|
| App Store Connect API 키 | `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` | ✅ 헤이보카 실호출 확인 |
| ASC Issuer ID | App Store Connect → 사용자 및 액세스 → 통합 상단 | ✅ |
| Play 서비스계정 JSON | `~/other/secrets/play/service-account.json` | ✅ 헤이보카 권한 부여됨 |
| Apple 배포 인증서 | 키체인의 `iPhone Distribution: …` | ✅ **팀 단위라 다른 앱과 공유** |
| 프로비저닝 프로파일 | `HeyVoca AppStore Auto` (2026-08-01 발급) | ✅ |
| Android 키스토어 | `heyvoca_app/android/app/release-key.keystore` (+ `keystore.properties`) | ✅ |

⚠ 같은 폴더의 `SubscriptionKey_*.p8` 는 **인앱결제 전용**이라 앱 관리 API 에 쓰면 401 이 난다.
`AuthKey_*.p8` 를 쓸 것.

값은 **env 로만** 넘긴다(명령줄 인자로 타이핑하면 셸 히스토리·프로세스 목록에 남는다):

```bash
export ASC_KEY_ID=<키 ID — AuthKey_XXXX.p8 의 XXXX>
export ASC_ISSUER_ID=<Issuer UUID>
```

## 대상

- iOS 번들ID `com.ghmate.heyvoca` · App Store id `6751544570` · 팀 `BB8GGQPRRX`
- Android 패키지 `com.ghmate.heyvoca`

`asc.mjs` 는 `ASC_BUNDLE_ID`, `play.mjs` 는 `PLAY_PKG`/`--pkg` 로 다른 앱을 가리킬 수 있다(기본은 헤이보카).

## 명령

```bash
node heyvoca_service/scripts/store/asc.mjs status      # 버전별 심사 상태(한국어 해설)
node heyvoca_service/scripts/store/asc.mjs builds      # 업로드된 빌드 처리 상태
node heyvoca_service/scripts/store/asc.mjs prepare 1.1.0 --build 19 --notes "..."
node heyvoca_service/scripts/store/asc.mjs compliance  # 수출규정 신고(이미 올라간 빌드용)
node heyvoca_service/scripts/store/asc.mjs preflight   # 제출해도 되는지 점검(무해)
node heyvoca_service/scripts/store/asc.mjs submit --yes
node heyvoca_service/scripts/store/asc.mjs cancel --yes
node heyvoca_service/scripts/store/asc.mjs release --yes
node heyvoca_service/scripts/store/asc.mjs watch [--interval 600]

node heyvoca_service/scripts/store/play.mjs status     # 트랙별 심사 상태
node heyvoca_service/scripts/store/play.mjs watch [--interval 900]
node heyvoca_service/scripts/store/play.mjs upload --aab <경로> --track production --notes "..." --yes

node heyvoca_service/scripts/store/asc.mjs availability JPN            # 판매 국가(앱+인앱상품) 조회
node heyvoca_service/scripts/store/asc.mjs availability --add JPN --yes  # 앱+인앱상품에 국가 추가
node heyvoca_service/scripts/store/play.mjs availability JP            # Play 판매 국가 조회(변경 API 없음)
```

### 판매 국가 (2026-10-23 일본 추가 때 실측)

- **앱과 인앱상품의 판매 국가는 따로다(양 스토어 모두).** Apple 은 앱을 열어도 인앱상품이 KOR 만이면
  그 나라 사용자는 보석을 못 산다 → `availability --add` 가 둘 다 처리한다. 인앱상품 가용성 POST 는
  **전체 교체**라 기존 국가를 빠뜨리면 그 나라 판매가 꺼진다(스크립트가 기존+신규로 보낸다).
- Apple 국가 추가는 **심사 없음**(PROCESSING_TO_AVAILABLE → 최대 24시간). 가격은 기준 국가에서 자동 환산
  (보석 4/10/35/110 → JPN 50/100/300/1000엔). 막힌 국가는 `contentStatuses` 가 이유를 말한다
  (예: CHN=MISSING_GRN). 그냥 `CANNOT_SELL` 하나면 "선택 안 함" 이라는 뜻일 뿐이다.
- **Play 는 국가 변경 API 가 없다**(`edits.countryavailability` 는 get 뿐, 트랙 `countryTargeting` 은
  단계적 출시 전용). Play Console → 프로덕션 → 국가/지역 에서 사람이 추가하고 '게시 개요' 에서 검토 전송.
  ⚠ 헤이보카(`com.ghmate.heyvoca`)는 브라우저에 로그인된 'ghmate' 개발자 계정에 **없다**(그쪽엔 구
  vocaandgo/voca/order 앱만) — 헤이보카가 있는 개발자 계정으로 로그인해야 한다.
- Play 인앱상품은 이미 174개국 판매 설정이라 국가만 열면 바로 결제된다.

조회는 자유, **바깥으로 나가는 행위(제출·출시·업로드)는 `--yes` 를 요구**한다. Apple 제출은
`cancel --yes` 로 되돌릴 수 있다.

### 상태 표

| Apple | 뜻 | 다음 행동 |
|---|---|---|
| `PREPARE_FOR_SUBMISSION` | 아직 심사에 안 보냄 | `preflight` → `submit --yes` |
| `WAITING_FOR_REVIEW` / `IN_REVIEW` | 대기열 / 심사 중 | `watch` |
| `PENDING_DEVELOPER_RELEASE` | **승인됨, 출시만 남음** | `release --yes` |
| `READY_FOR_DISTRIBUTION`(구 `READY_FOR_SALE`) | 게시 완료 | 안내값(version.py) 갱신 |
| `REJECTED` | 거절 | 사유는 API 에 없음 — 사람이 ASC 웹에서 확인 |

| Play | 뜻 |
|---|---|
| `IN_REVIEW` | 심사 중 |
| `APPROVED_NOT_PUBLISHED` | 승인됨, 게시 대기 |
| `PUBLISHED` | 게시됨 |
| `NOT_APPROVED` | 거절(사유는 Play Console) |

## 스토어 스크린샷 (`screenshots.mjs`, 세트는 `screenshots/<세트>/`)

```bash
node heyvoca_service/scripts/store/screenshots.mjs list                     # 두 스토어 현재 스크린샷 요약(읽기 전용)
node heyvoca_service/scripts/store/screenshots.mjs download --out <dir>     # 현재 스크린샷 내려받기
node heyvoca_service/scripts/store/screenshots/build.mjs 2026-10-ko         # slides.json + src/ 캡처 → ios-65 / play-phone / play-feature 합성
node heyvoca_service/scripts/store/screenshots.mjs upload-play --dir <세트>/play-phone --lang ko-KR --type phoneScreenshots --yes   # seven/tenInch 도 같은 폴더
node heyvoca_service/scripts/store/screenshots.mjs upload-ios  --dir <세트>/ios-65 --locale ko --display APP_IPHONE_65 --yes
```

- **iOS 는 게시된 버전의 스크린샷을 못 바꾼다.** `asc.mjs prepare` 로 새 버전을 만든 직후 올린다.
  2026-10-ko 세트는 Play 만 반영(2026-10-23), **iOS 는 다음 버전 prepare 때 위 upload-ios 를 실행**할 것.
- 업로드는 대상 세트(로케일·기기)를 **교체**한다(기존 삭제 후 업로드). `--yes` 없으면 계획만 출력.
- 원본 캡처(`src/`)는 로컬 데모 계정(`dev-login`, 실사용자 아님)을 414x896@3x 로 찍은 것이다.

## 실측 함정 — 여기서 시간 쓰지 말 것

1. **iOS 아카이브에 Xcode GUI 가 필요 없다.** 단, `xcodebuild -allowProvisioningUpdates`(클라우드
   서명)는 "No signing certificate iOS Distribution found" 로 막힌다. 같은 키로 REST
   `POST /v1/certificates` 는 201 이다 → `ios-signing.sh` 가 CSR 을 직접 만들어 발급받고
   **수동 서명(manual)** 으로 export 한다(`heyvoca_app/ios/exportOptions-auto.plist`).
2. **PKCS12 는 `openssl pkcs12 -export -legacy` 필수.** OpenSSL 3 기본값은 macOS `security import`
   가 암호가 맞아도 "MAC verification failed" 로 거부한다.
3. **수출규정 미답변이면 심사가 시작조차 안 한다**(`WAITING_FOR_EXPORT_COMPLIANCE`), 그것도 **매 빌드**.
   헤이보카는 build 13~17 이 전부 `usesNonExemptEncryption=false`(면제)로 신고돼 있다.
   → `Info.plist` 에 `ITSAppUsesNonExemptEncryption=false` 를 박아 영구 해결한다.
   값은 **법적 신고**이므로 암호화 사용이 바뀌면 사람이 다시 판단해야 한다.
   이미 업로드된 빌드는 `asc.mjs compliance --exempt` 로 처리.
4. **Apple 상태 enum 이 이중이다.** 같은 버전이 구 `appStoreState=READY_FOR_SALE` 와 신
   `appVersionState=READY_FOR_DISTRIBUTION` 로 동시에 온다 → `asc.mjs` 는 신 필드를 우선하고
   양쪽 이름을 모두 해석한다. 구 이름만 매칭하면 언젠가 조용히 실패한다.
5. **Play 403 은 권한이 아니라 쿼터일 때가 있다.** `tracks/*/releases` 는 쿼터가 빡빡해
   "Listing releases quota exceeded" 가 `PERMISSION_DENIED` 로 온다. 기본 조회는 production 한
   트랙만(전부 보려면 `--all-tracks`), `watch` 는 만나면 2배 백오프한다.
6. **Play commit 에 `changesInReviewBehavior=ERROR_IF_IN_REVIEW` 필수.** 기본값
   (`CANCEL_IN_REVIEW_AND_SUBMIT`)은 진행 중인 심사를 취소하고 대기열 순번을 잃는다. 실패하면
   열어둔 edit 을 반드시 지운다(안 그러면 다음 시도가 "이미 edit 이 있다" 로 막힌다 — `play.mjs` 는 자동).
7. **iTunes lookup 은 캐시버스터(`_cb=`) 없으면 낡은 버전을 무기한 고정한다**(반복 재현).
   `release-status.sh`/`verify-deploy.sh` 둘 다 붙인다.
8. ASC JWT 는 만료 20분 이내여야 한다(이 스크립트는 15분). 시계가 틀어지면 401.
   401 이 계속 나면 대개 Issuer ID 오타이거나 키 권한이 "앱 관리자" 미만이다.
9. **Xcode 27(iOS 27 SDK) 빌드는 UIScene 생명주기가 필수다.** 미채택이면 iOS 27 기기에서 런치 즉시
   assert("UIScene life cycle is required for apps built with this SDK", TN3187)로 죽고, 심사는 자동 메시지
   "2.1.0 App Completeness — crashed on launch" 로 거절된다(2026-09-25, 1.1.1 build 19). RN 0.80 은 씬 지원이
   없어 `ios/heyvoca/SceneDelegate.swift` + `UIApplicationSceneManifest` 로 직접 채택했다(앱 커밋 ccfb637).
   Xcode 메이저 상향 뒤 첫 스토어 빌드는 최신 iOS 시뮬레이터에서 Release 런치를 먼저 본다 — 단 ML Kit pods 가
   arm64 시뮬레이터 슬라이스를 안 실어 iOS 26+ 시뮬레이터엔 그대로 못 올린다. 검증 때만 `react-native.config.js`
   로 `@react-native-ml-kit/text-recognition` 을 iOS 에서 제외하고 `pod install` 후 `ARCHS=arm64 EXCLUDED_ARCHS=`
   로 빌드, 끝나면 config 삭제·Podfile.lock 복구·`pod install`. 거절 사유 자체는 API 로 못 읽는다 — 콘솔 확인.

## 자동화 안 되는 구간

- **거절 사유는 양 스토어 API 어디에도 없다.** "거절됨" 까지만 안다. 발견하면 추측으로 재제출하지
  말고 사용자에게 알린다.
- Play 콘텐츠 등급(IARC)·앱 콘텐츠 선언, Apple App Privacy 설문 — 최초 1회, 사람이 콘솔에서.
- 권한 분류기가 배포/수출규정 명령을 막을 때가 있다. 막히면 사용자에게 `!` 로 직접 실행을 요청한다.

## 안내값(version.py)은 **게시 후에만** 올린다

`heyvoca_back/app/routes/version.py` 의 `app_ios_version` / `app_android_version` 은 손으로 관리한다
(CodingPT 와 달리 스토어 실조회 자동 반영이 없다). **스토어 게시를 확인하기 전에 올리면** 사용자가
아직 없는 버전으로 안내받아 업데이트 모달이 무한 반복된다. `verify-deploy.sh` 가 이 역전을 FAIL 로 잡는다.
