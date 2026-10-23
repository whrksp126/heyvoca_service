# 일별 실사용자(전환) 리포트

> 2026-10-23 도입 (이슈 #13). "스토어 다운로드는 조금씩 느는데, 그 사람들이 실제 사용자가 됐나?"를
> 하루 단위로 본다. 읽기 전용(SELECT 만), 출력에는 집계 수치만 넣고 이메일·이름은 넣지 않는다.

| 위치 | 역할 |
|---|---|
| `heyvoca_back/app/services/daily_report.py` | 집계 단일 소스 (`build_report`, `render_markdown`) |
| `heyvoca_back/scripts/daily_active_report.py` | CLI — Markdown / JSON 출력 |
| `GET /admin/report/daily-active` | 어드민 API (`X-Admin-API-Key`), `app/routes/admin_daily_report.py` |

## 지표 정의

하루 경계는 **KST 자정**(APP_TZ 기본값과 같음). DB 시각은 UTC 로 저장돼 있어 변환해서 센다.

| 지표 | 정의 | 근거 |
|---|---|---|
| 신규 가입 | `user.created_at` 이 그날(KST)인 사용자 | 소셜 로그인 첫 성공 시 `User` 가 만들어진다(`routes/auth.py`) |
| 로그인 수단 | `google_id`/`apple_id` 유무 → google · apple · google+apple · other | Apple 로그인이 같은 이메일의 기존 계정에 붙으면 둘 다 생긴다 |
| 플랫폼 | **Apple = iOS 확정, 나머지 미상** | 가입 플랫폼 컬럼이 없다. Apple 로그인은 iOS 앱(`heyvoca_app` `Platform.OS==='ios'`)에만 있고, Google 은 iOS·Android·웹 공통이라 구분 불가 |
| 가입 설정(온보딩) 완료 | `user.onboarding_ver == '1'` (현재 상태) | `/onboarding/migrate` 가 레벨·목표 저장 후 세팅 |
| 온보딩 미션 | 미션 1개 이상 시작 / 6단계 종료 미션(`free_test`) 완료 | `user_onboarding_mission` |
| 가입 당일 첫 학습 | 가입한 날 **정규 학습 답안**이 1개 이상 | 아래 '학습'의 정의 |
| D1 / D7 재방문 | 가입일 +1일 / +7일 **그날**에 학습한 가입자 수 | 고전적 Dn 리텐션. 그날이 아직 안 끝났으면 `-`(미확정) |
| 1주 내 재방문(w1) | 가입일 +1 ~ +7일 중 하루라도 학습 | 표본이 작아 D7 정확일보다 덜 흔들린다 (JSON·요약에만) |
| DAU | 그날 정규 학습 답안이 1개 이상인 사용자 수 (신규/기존 분리) | **로그인·앱 실행은 세지 않는다** — `last_logged_at` 은 Apple 로그인에서만 채워져 신뢰 불가 |
| 세션 수 | 그날 시작해 완료(`finished_at`)된 정규 세션 | `user_study_session` |
| 문항 수·정답률 | 그날 정규 학습 답안 수와 정답 비율 | `user_study_log` |

**학습(정규)** = `user_study_log` 행 중 온보딩 맛보기 세션(`user_study_session.is_onboarding=True`)에
속하지 않는 것. 맛보기 세션은 가입 직전 게스트 답안을 옮겨 적은 것이라 "가입 후 실제로 써 봤다"가 아니다.

글자 학습(`user_script_progress`)은 마지막 학습 시각만 남아 날짜별로 셀 수 없어 DAU 에 넣지 않았다.

### 제외 규칙 (테스트·팀 계정)

| 구분 | 규칙 |
|---|---|
| 팀 | 팀 3명 이메일. 저장소가 공개라 원문 대신 `sha256(소문자 이메일)` 앞 16자를 `TEAM_EMAIL_SHA16` 에 둔다 |
| 봇 | `@cloudtestlabaccounts.com` (Firebase Test Lab·Play 사전 출시 보고서 기기) |
| 봇 | `이름성.5자리숫자@gmail.com` 형태 (Play 사전 출시 보고서 로봇 계정, 예 `abcdef.01234@gmail.com`) |
| 추가 | env `REPORT_EXCLUDE_EMAILS`(쉼표 구분) 또는 CLI `--exclude-email` |

- 제외 계정 수는 리포트 머리말에, 제외 계정의 학습 활동은 JSON `dau_excluded_accounts` 에 따로 남는다.
- Apple 심사관 계정은 privaterelay 이메일이라 구분할 수 없다. 심사 기간에 가입 1명이 튀면 의심할 것.
- **2026-08-12 prod 사용자 전원 초기화**가 있었다. 그 이전 날짜를 조회하면 0 이 나오는 게 정상이고,
  개편 전 기준선(가입→첫 학습 68%, 7일 이상 재방문 2명)은 그때 백업에서 뽑은 값이다.

## 스토어 다운로드 수 — 아직 자동 수집 불가 (2026-10-23 실호출로 확인)

| 스토어 | 결과 | 필요한 것 |
|---|---|---|
| App Store | 현재 키(`AuthKey_*`, 앱 관리 역할)로 `GET /v1/apps/{id}/analyticsReportRequests` → **403** "The API key in use does not allow this request". `GET /v1/salesReports` 는 판매자 번호(vendor number)가 필요한데 저장소·로컬 어디에도 없음 | ① ASC → 사용자 및 액세스 → 통합에서 **Sales 또는 Finance 역할** 키 발급(또는 기존 키 역할 추가) ② ASC '지급 및 재무 보고서' 상단의 **판매자 번호**. 그러면 `salesReports?filter[reportType]=SALES&filter[frequency]=DAILY` 의 `Units`(Product Type `1F`=신규 설치)로 일별 다운로드를 받을 수 있다 |
| Google Play | `androidpublisher` API 에는 설치 통계가 없다(Play Developer Reporting API 도 vitals 뿐). 설치 수는 Cloud Storage 버킷 `pubsite_prod_rev_…/stats/installs/installs_com.ghmate.heyvoca_YYYYMM_overview.csv` 로만 제공 | ① Play Console → 보고서 다운로드 → 통계 화면의 **버킷 URI** ② 서비스계정에 '앱 정보 보기 및 대량 보고서 다운로드' 권한 ③ `devstorage.read_only` 스코프로 CSV 읽기(일 1회, 하루~이틀 지연) |

두 가지가 갖춰지면 `daily_report.py` 의 `store_downloads` 를 채우고 "다운로드 → 가입 전환율"을 추가한다.
그 전까지 전환율은 스토어 콘솔의 다운로드 수와 이 리포트의 가입 수를 눈으로 나눠 본다.

## 실행

`docker-compose*.yml` 이 `./scripts` 를 `/app/scripts` 에 ro 마운트해서 컨테이너 안의
`heyvoca_back/scripts` 가 가려진다 → **stdin 으로 넣어 실행**한다.

```bash
# heyvoca_service/ 에서. 기본 = 어제 하루, Markdown
docker exec -i -w /app heyvoca_back_local python3 - --days 14 < heyvoca_back/scripts/daily_active_report.py

# 서비스 모듈이 아직 배포되지 않은 서버 — 둘을 이어 붙인다(스크립트의 import 가드가 처리)
cat heyvoca_back/app/services/daily_report.py heyvoca_back/scripts/daily_active_report.py \
  | ssh -i ~/.ssh/ghmate_server -p 222 ghmate@ghmate.iptime.org \
    'docker exec -i -w /app heyvoca_back_prod python3 - --days 14 --format both 2>/dev/null'
```

인자: `--date YYYY-MM-DD`(끝 날짜, 기본 어제) · `--days N` · `--start YYYY-MM-DD` ·
`--format md|json|both` · `--exclude-email a@b`(반복).

API (배포 후):

```
GET /admin/report/daily-active?days=14            # JSON {code, data}
GET /admin/report/daily-active?start=2026-10-01&end=2026-10-14&format=md
```

최대 92일. 헤더 `X-Admin-API-Key` 필수(없으면 401).

## 매일 아침 보고 (CodingPT 자동화)

CodingPT `cpt auto` 로 **매일 09:00 KST** 에 작업 에이전트가 위 prod 명령을 `--days 7` 로 실행해
`~/heyvoca_reports/daily/<어제>.md` 에 저장하고 세 줄 요약을 `cpt notify` 로 알린다.

- `cpt auto` 에는 셸 액션이 없어 `task.create`(새 워크트리 에이전트)로만 가능하다. 에이전트는
  **메인 체크아웃의 파일 절대경로**를 읽는다 — 워크트리는 커밋된 것만 있어서다.
- 자동화는 이 PC 에 산다. PC 가 꺼져 있거나 잠들면 그날은 건너뛰고(`missed: once` 로 깨어난 뒤 1회),
  확인·정지는 `cpt auto list` / `cpt auto pause <id>`.
- 표 해석: 오늘 리포트의 맨 아래 줄이 어제다. D1 은 그제 줄, D7 은 8일 전 줄이 새로 확정된다.

## 다음에 하면 좋은 것 (모델 변경 필요 — 결정 대기)

- `user.signup_platform`(ios/android/web) + 가입 시 앱 버전 저장 — 지금은 Google 가입자의 플랫폼을 모른다.
  앱은 이미 `User-Agent`/`X-App-Version` 을 보내므로(`app/utils/app_version.py`) 가입 시점에 기록만 하면 된다.
- 스토어 다운로드 자동 수집(위 표의 자격 확보 후).
