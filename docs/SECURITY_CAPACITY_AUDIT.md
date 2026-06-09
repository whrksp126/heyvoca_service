# heyvoca 보안 진단 + 1000명/일 용량 판단 (감사 보고서)

> 최초 작성: 2026-06-10 · 정식 오픈 전 점검 기준 문서
> 재점검/후속 작업 시 이 문서를 기준으로 갱신할 것.

## 구현 현황 (2026-06-10)

- **Wave A — stg+prod 배포 완료·검증**: C1 워커(gthread×4), C2 DB풀, S1 시크릿 fail-fast, S3 입력 크기 제한, S4 에러 마스킹. → prod health 200, `Using worker: gthread` 확인, [SCHEMA OK].
- **Wave B 백엔드 — stg+prod 배포 완료·검증**: S7 CORS 축소, S6 search 입력 검증(메타문자/영문 400 확인), S9 fcm 폴백 제거.
- **Wave B nginx(S2/C3) — 라이브 적용 완료**: 글로벌 `nginx_proxy`(`/srv/nginx-proxy/conf.d/heyvoca.conf`)에 백업→`nginx -t`→reload로 적용. prod front에 HSTS/nosniff/X-Frame/CSP-Report-Only 노출 확인, 전 사이트(admin 3개 포함) 생존 확인. **주의**: 라이브 파일은 repo와 별개였고(admin 블록 3개가 라이브에만 존재) repo를 라이브 기준으로 동기화함. `deploy.sh`는 이 글로벌 nginx를 반영하지 않으므로 향후 nginx 변경은 동일 절차로 수동 적용.
- **검증 요약**: stg/prod health 200, gthread×4, 검색 정상(200)·S6 차단(400), prod 보안헤더 노출, 모든 도메인(front/back/landing/admin) 응답 정상.
- **Wave C 미착수(운영/중기)**: C4 TTS 워밍업(선택), Docker 리소스 limit, S8 admin 키 로테이션, S5/S10 토큰 저장 전환(점진). + CSP를 Report-Only→enforce 승격(콘솔 위반 로그 확인 후).
- **부수 발견**: `heyvoca_back_local` healthcheck가 `python`(컨테이너엔 `python3`만) 호출로 항상 실패 → 컨테이너 `unhealthy` 표시(앱은 정상). 별도 수정 대상.

---

## 0. 요약 (TL;DR)

- **1000명/일(DAU)은 현재 구조로도 정상 트래픽 기준 버틴다.** 서비스가 죽는 시나리오는 raw 부하가 아니라 (a) TTS cold-generation 동시다발로 인한 gunicorn 워커 고갈, (b) 단일 홈서버 리소스 경합이다. 워커/DB풀 소폭 보강(C1·C2, 각 수 줄)으로 거의 제거 가능.
- **보안은 서비스 규모 대비 양호.** 치명적 유출 없음. 손볼 항목은 시크릿 fail-fast(S1), nginx 보안 헤더(S2), 입력 크기 제한(S3), 에러 메시지 마스킹(S4)이 우선.
- 탐색 도구가 과대평가했던 항목들은 직접 검증으로 보정 완료(아래 "보정" 참고).

### 심각도 보정 (직접 검증 완료)
- 모든 `.env*`·`google-services.json`·`GoogleService-Info.plist`는 `.gitignore` 등록 → **git 미커밋, 실제 유출 아님** (로컬 파일에 평문 시크릿이 보인 것뿐).
- `fcm.py` `/fcm_html`·`/firebase-messaging-sw.js`는 웹 푸시용 **공개가 정상**(인증 누락 아님). 실 클라이언트 엔드포인트(`get_token` 등)엔 `@jwt_required` 있음.
- `VITE_FIREBASE_*`·`google-services.json`은 **설계상 클라이언트 공개 값**(시크릿 아님). 방어선 = Firebase 보안 규칙 + API 키 application restriction.
- Rate limit 전역 `default_limits=['60 per minute']` 존재. 필수 시크릿은 전 환경 `.env`에 존재 확인됨(S1 fail-fast 안전).
- **ElevenLabs는 2026-06 호출 중단** (`app/services/tts/registry.py:19-25`). 영어·한국어 모두 Edge TTS(무료 신경망), 비상 fallback만 gTTS. → "ElevenLabs 월 쿼터" 병목은 더 이상 없음.

---

## 1. 보안 취약점 진단

| # | 심각도 | 항목 | 위치 |
|---|--------|------|------|
| S1 | High | 시크릿 env fallback (`SECRET_KEY='dev-key'`, `ACCESS/REFRESH_SECRET=None`) → 미설정 시 위조 가능 약한 키로 기동 | `heyvoca_back/config.py:25`, `app/utils/jwt_utils.py:8-12` |
| S2 | High | nginx 보안 헤더 전무(HSTS/X-Frame-Options/X-Content-Type-Options/CSP) + `ssl_protocols` 미지정 | `nginx-proxy/conf.d/heyvoca.conf` |
| S3 | Med | 입력 크기 무제한 DoS면: `/ocr/words`(배열·단어 길이 무제한), 단어장 업로드(파일/행 무제한) | `app/routes/ocr.py:8-34`, `voca_books.py:116-146` |
| S4 | Med | 에러 응답 `str(e)` 그대로 노출(DB 구조/경로 정보 유출) | 다수 라우트 `except Exception as e` |
| S5 | Med | Access Token JSON 응답 → 프론트 `sessionStorage` 저장 → XSS 시 탈취 (refresh는 httpOnly라 OK) | `auth.py:106-113`, `heyvoca_front/src/utils/auth.jsx:8-9` |
| S6 | Med | `search.py` REGEXP 쿼리에 사용자 입력(`word`) 직접 사용 → 잘못된 패턴 시 DB 에러/오작동 (SQLi는 파라미터 바인딩으로 차단됨) | `app/routes/search.py:173-189` |
| S7 | Med | CORS 정규식이 dev/local에서 `10.0.0.0/8`·`192.168.0.0/16` 전역 허용 | `app/__init__.py:107-113` |
| S8 | Med | admin API 인증이 정적 헤더키(`X-Admin-API-Key`) 단일 — 로테이션/만료 없음 (None 우회 불가 확인) | `app/routes/admin.py:28-35` |
| S9 | Low | `get_token` `g.user_id or request.json.get('user_id')` 폴백 → 잠재 IDOR (현재 `@jwt_required`라 실익 없음) | `app/routes/fcm.py:68` |
| S10 | Low | 모바일 앱 토큰 평문 AsyncStorage 저장(루팅/탈옥 시 접근) → Keychain/Keystore 권장 | `heyvoca_app/src/utils/asyncStorage.ts` |

### 운영 점검 (코드 아님)
- Firebase 콘솔: Firestore/RTDB 보안 규칙이 인증 필수인지, API 키에 앱 패키지/번들ID·HTTP referrer 제한이 걸렸는지 점검.
- 노출 이력 의심 시크릿은 로테이션 권고(현재 git 미커밋이라 필수 아님).

### 양호한 부분 (유지)
refresh token httpOnly+secure+samesite, 결제 중복 거래ID 검증(`purchase.py`), SQLAlchemy 파라미터 바인딩, JWT access/refresh 분리, Redis 기반 분산 rate limit, React 자동 escaping(dangerouslySetInnerHTML 미사용), Sentry 적용.

---

## 2. 1000명/일 용량 판단

### 부하 계산
- 1000 DAU × 세션 ~30요청 ≈ **30,000 req/day ≈ 평균 0.35 req/s**. 저녁 피크(일 15% 집중 가정) ~1.2 req/s, **순간 동시 ~3~8 요청**.
- 일반 API(DB read 50~150ms): prod gunicorn `-w 3` sync로도 이론 처리량 ~20~30 req/s → **일반 브라우징은 여유.**

### 실제 병목 (raw 처리량 아님)
1. **워커 starvation (현존 최대 위험).** 워커 3개 sync. TTS cold-gen(Edge TTS 네트워크 호출 수 초 블로킹)·Drive 다운로드·FCM 동기 호출이 워커를 통째 점유. 이런 long-call 3개만 겹쳐도 전 워커 고갈 → 나머지 사용자 타임아웃. (`heyvoca_back/Dockerfile:21` `-w 3`)
2. **TTS 쿼터 — 해소됨.** ElevenLabs 호출 중단, Edge TTS는 월 쿼터 없음(무료). 음성은 MinIO 영구 캐시 + Redis 존재플래그(7일) → 워밍업 후 신규 생성 소량. fallback gTTS도 무료.
3. **DB 풀 미튜닝.** `pool_recycle`/`pool_pre_ping` 미설정 → 유휴 후 `MySQL server has gone away` 산발 가능. (`config.py`/`__init__.py`에 풀 옵션 없음)
4. **단일 홈서버(ghmate.iptime.org)에 dev/stg/prod 12컨테이너 + MinIO 공존, 리소스 limit 전무.** noisy-neighbor(dev 작업이 prod 흔듦), iptime 가정용 업링크, 단일 장애점. Cloudflare가 정적 캐싱으로 완화.

### 판정
**1000명/일은 정상 트래픽 기준 현재 구조로도 버틴다.** 죽는 시나리오는 부하가 아니라 (a) cold-TTS 동시다발 워커 고갈, (b) 홈서버 리소스 경합. C1·C2 패치로 (a)(3)을 거의 제거하면 충분한 여유.

---

## 3. 무중단 수정 계획 (보안·용량 동등)

> 최우선 원칙: **모든 수정이 기존 사용자에게 무중단·무영향.** 각 항목에 사이드이펙트/하위호환 안전장치 명시. 적용 단위로 로컬 스모크 → stg 검증 → prod. 각 wave 독립 배포(롤백 용이).

### Wave A — 즉시 (저위험·고효율)
- **C1. gunicorn 워커 상향** — `-w 3` → `-w 4 --threads 4 --worker-class gthread --timeout 60`. 파일: `Dockerfile:21`, `Dockerfile.stg:21`(dev `-w 1` 유지). 사이드이펙트: gthread 스레드 안전 검증(scoped_session·TTS 싱글톤 stateless·APScheduler 별도 스레드). **gevent는 monkeypatch 리스크로 미채택.**
- **C2. DB 풀 튜닝** — `config.py` 베이스에 `SQLALCHEMY_ENGINE_OPTIONS={pool_size:10,max_overflow:5,pool_recycle:1800,pool_pre_ping:True}`. 순기능만, 기존 동작 변경 없음.
- **S1. 시크릿 fail-fast** — prod/stg에서 핵심 시크릿 미설정 시 `raise`, `'dev-key'` 디폴트 제거. local/dev는 제외. 전 환경 .env에 키 존재 확인됨 → 무영향.
- **S3. 입력 크기 제한** — `/ocr/words` `MAX_WORDS`·단어 ≤255자, 단어장 업로드 파일/행 상한, 앱 `MAX_CONTENT_LENGTH`. **한도는 실사용 최대치 위로** 설정.
- **S4. 에러 메시지 마스킹** — 응답은 고정 문자열, 상세는 `logger.error(exc_info=True)`. `code` 필드 유지. 프론트 `message` 의존 여부 확인.

### Wave B — 단기
- **S2. nginx 보안 헤더 + TLS** — HSTS/nosniff/X-Frame-Options + `ssl_protocols TLSv1.2 TLSv1.3`. **CSP는 report-only부터**(웹앱 깨짐 방지) → 안정 후 enforce.
- **S7. CORS 축소** — dev/local 정규식을 localhost/127.0.0.1로 한정, 필요 사설 IP만 명시 화이트리스트.
- **S6. search 입력 검증** — `word` 화이트리스트 정규식 게이트. 실제 케이스 회귀 테스트.
- **C3. nginx rate limit(엣지)** — `limit_req_zone` + 로그인/TTS에 `limit_req`(burst nodelay). 앱 limiter와 이중.
- **S9. fcm 폴백 제거** — `user_id = g.user_id`. 무영향.

### Wave C — 운영/중기
- **C4. TTS 사전 워밍업 배치(선택)** — 사전 단어 TTS 사전 생성·캐시. 쿼터 부담 없어 우선순위 낮음.
- **Docker 리소스 limit** — back/redis/mysql `mem_limit`·`cpus`, redis `maxmemory`. 현 사용량 측정 후 여유 설정.
- **S8 admin 키 로테이션 / dev·prod 호스트 분리** — 큰 작업, 후순위.
- **S5/S10 (신중)** — access token httpOnly 쿠키 전환 / 앱 Keychain. 기존 로그인 세션 강제 로그아웃 방지 위해 점진 전환(양 방식 병행)으로 분리.

---

## 검증 절차 (무중단 보장)
- 단위: C1 워커수 로그 / C2 유휴 후 재쿼리 / S1 빈 시크릿 prod→기동 실패·정상 env→토큰 정상 / S3 초과 입력 400 / S4 에러 마스킹+로그 상세 / S2 `curl -I` 헤더 / S7 비허용 origin 차단.
- 부하: `hey`/`wrk`로 `/home`·`/tts/resolve`(캐시히트) 동시 50요청 p95·에러율. cold-TTS 3개 동시 중 일반 API 응답 유지.
- 회귀 스모크(매 wave): 로그인→단어검색→TTS 재생→학습→결제검증 1사이클.
- 배포 순서: 로컬 검증 → `git push origin local:main` → `./deploy.sh stg` 검증 → prod. `.env` 변경 동반 시 서버 수동 scp + `--force-recreate`.
