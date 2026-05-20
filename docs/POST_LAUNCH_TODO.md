# 정식 오픈 후 진행할 작업 (FSRS 알고리즘 고도화)

> 단어 학습 알고리즘 SM2 → FSRS 전환 작업의 후속 단계.
> 베타 단계에서 Phase 1.1~2.3 완료, 정식 오픈 후 데이터/시간 누적되면 진행.

---

## 현재 상태 (베타 종료 시점)

| 영역 | 상태 |
|---|---|
| FSRS 코어 (Python 3.8 호환 직접 구현) | ✅ 완료 |
| 학습 로그 영구 테이블 (`user_study_log`, `user_study_session`) | ✅ 완료 (1년 단위 파티션) |
| 추천 엔진 (`GET /study/recommend`) | ✅ 완료 |
| SessionComposer 고도화 (동적 비율, 약점 우선, 인터리빙, intra-day) | ✅ 완료 |
| 시간 컷오프 보정 + 부드러운 lapse | ✅ 완료 |
| 약점 추적 (`UserQuestionTypeStat`, `/study/me/weakness`) | ✅ 완료 |
| 마이페이지 약점 시각화 | ✅ 완료 |
| admin 모니터링 엔드포인트 (`/admin/study/metrics`, `/admin/fsrs/health`) | ✅ 완료 |
| 데이터 마이그레이션 (715건 SM2→FSRS) | ✅ 완료 |
| 백엔드 테스트 | 286/286 통과 |
| 마이그레이션 head | `c3e8a10b4d22` |

---

## 정식 오픈 직전 체크리스트

### 1. 환경변수 추가

각 환경(`.env.local` / `.env.dev` / `.env.stg` / `.env`)에 다음을 추가:

#### 백엔드 (`heyvoca_back/.env.*`)
```
# admin 모니터링 (필수)
ADMIN_USER=ghmate
ADMIN_PASSWORD=충분히_긴_랜덤_문자열_권장_32자이상

# FSRS 동작 (선택, 기본값으로 충분)
RATINGS_USE_TIME_CALIBRATION=true
FSRS_SOFT_LAPSE=true
```

`ADMIN_PASSWORD` 없으면 `/admin/*` 엔드포인트가 503 반환. `ADMIN_USER`는 default 'ghmate'라 생략 가능.

#### 프론트 (`heyvoca_front/.env.*`)
```
# 폴백 모드 (선택, 기본 true)
VITE_RECOMMEND_BACKEND=true
VITE_FSRS_SHADOW=false
```

`false`로 두면 클라이언트 SM2 폴백 모드. 응급 롤백 시에만 사용.

### 2. 서버 FK 이름 확인 (파티셔닝 마이그레이션 전)

dev/stg/prod 배포 직전 한 번 확인:

```bash
docker exec heyvoca_mysql_dev bash -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=\"heyvoca_user\" AND TABLE_NAME=\"user_study_log\" AND REFERENCED_TABLE_NAME IS NOT NULL"'
```

마이그레이션 `c3e8a10b4d22`가 `user_study_log_ibfk_1~3` 이름을 가정함. 다르면 마이그레이션 파일에 실제 이름 추가.

### 3. 배포

```bash
./deploy.sh dev    # 마이그레이션 자동 적용 (entrypoint)
./deploy.sh stg
./deploy.sh prod
```

`docker-entrypoint.sh`가 `flask db upgrade` 자동 실행 → 새 테이블/파티션 자동 생성.

### 4. 첫 24시간 모니터링

- `GET /admin/study/metrics?days=1` — 학습 로그 누적, 평균 정답률
- `GET /admin/fsrs/health` — `lapse_rate_last_7d`, `avg_stability_distribution`, `logs_per_partition`
- 5xx 에러율 (Sentry/로그 모니터링)
- Schema drift: entrypoint의 `verify_schema.py`가 검증 통과해야 함

---

## 데이터/시간 누적 후 진행할 작업

### Phase 1.4 — 레거시 정리 ✅ 완료 (2026-05-20)

prod nginx access log 7일치(May 13 ~ 20)에서 `PATCH /vocaIndexs/<id>` 호출 0건 확인 후 정리.

**완료 작업:**
- 클라이언트
  - `heyvoca_front/src/pages/TakeTest.jsx` `legacyLocalSelection` 함수 + 3곳 호출처 제거, `VITE_RECOMMEND_BACKEND` 분기 제거
  - `heyvoca_front/src/api/study.jsx` `createStudySession` (폴백 세션 생성) 함수 + `VITE_FSRS_SHADOW` 코멘트 제거
- 백엔드
  - `heyvoca_back/app/routes/voca_indexs.py` `PATCH /vocaIndexs/<id>` 엔드포인트 제거 (이미 no-op 상태였음)
- admin
  - `heyvoca_back/app/routes/admin.py` Phase 1.4 카드 + `patch_voca_indexs_sm2_calls_7d` / `fallback_users_7d` summary 카운터 제거
  - `heyvoca_back/app/routes/admin_phase_prompts.py` `PHASE_1_4` 프롬프트 제거
  - `heyvoca_back/tests/test_admin_progress.py` 관련 테스트 제거 + phases 인덱스 갱신

**보존한 부분 (POST_LAUNCH_TODO.md 원안과 다름):**
- `common.jsx::analyzeLearningPattern` — FSRS의 difficulty/reps 기반 의심패턴 감지 UX. SM2 폴백이 아닌 정상 기능.
- `forgettingPriority.js::sortByForgettingPriority` — FSRS 기반 정렬. `StudySetupNewBottomSheet`의 "선택한 단어 학습" 흐름에서 정식 사용 중.
- UserVoca.data 정리 스크립트 (`finalize_fsrs_migration.py`) — 별도 의사결정 필요. 실행 후 SM2 복원 불가.

---

### Phase 3.1 — FSRS 글로벌 파라미터 ML 최적화

**트리거 조건:**
- `user_study_log` 누적 약 **10,000 reviews 이상**
- 또는 정식 오픈 후 **30일 경과 + DAU 100명 이상**

**작업:**
1. 신규 모델 (사용자 DB)
   ```python
   class FSRSParamSet(db.Model):
       __tablename__ = 'fsrs_param_set'
       id = Column(Integer, primary_key=True, autoincrement=True)
       scope = Column(String(16), nullable=False)         # 'global' | 'cohort' | 'user'
       scope_key = Column(String(64), nullable=True)
       params = Column(TEXT, nullable=False)              # 17 floats JSON
       train_log_count = Column(Integer, nullable=False)
       metric_loss = Column(Float, nullable=True)
       metric_brier = Column(Float, nullable=True)
       is_active = Column(Boolean, nullable=False, default=False)
       version = Column(String(32), nullable=False)
       bucket_range = Column(String(16), nullable=True)   # A/B 테스트 ('0-49', '50-99')
       created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
   ```

2. `User.experiment_bucket` (Integer, 0~99) 추가 — A/B 테스트용

3. 배치 스크립트 `heyvoca_back/jobs/fsrs_optimize.py`
   - `UserStudyLog` 90일치 로드 (DataFrame)
   - `scipy.optimize.minimize`로 17개 파라미터 NLL/Brier 최적화
   - 검증셋 Brier < 0.18 통과 시 `is_active=True`
   - APScheduler 주1회 일요일 03:00 KST (기존 `fcm.py` 패턴 따름)

4. `app/services/fsrs/scheduler.py` 변경
   - `review()` 호출 시 params 우선순위: user → cohort → global → 기본
   - Redis 캐시 `fsrs:params:<user_id>` (TTL 1시간)
   - `UserVoca.data.fsrs.params_version` 기록

5. A/B 테스트
   - 신/구 파라미터 50:50 노출
   - 주간 정답률, 지속학습일수, retention 비교
   - 신규 파라미터가 통계적으로 우월하면 100% 롤아웃

---

### Phase 3.2 — 사용자별 파라미터 최적화

**트리거 조건:**
- 개별 사용자 **200+ reviews 누적**된 케이스가 **100명 이상**
- Phase 3.1 완료 후 4주 경과

**작업:**
1. `fsrs_optimize.py` 확장 — `--scope user` 옵션
2. 사용자 200+ reviews 또는 30일+ 학습자에만 user-specific 파라미터 학습
3. Brier 검증 통과 못하면 활성화 거부 (cohort/global로 폴백)
4. `GET /admin/fsrs/metrics`에 user-specific 활성 사용자 수, Brier 분포 추가

---

### Phase 3.3 — 임베딩 R&D (POC)

**트리거 조건:** 정식 오픈 6개월 후 별도 의사결정.

**작업:**
1. **단어 임베딩** — GloVe / word2vec / multilingual BERT
   - 클러스터링 기반 인터리빙 (Phase 2.2의 첫 3글자 휴리스틱 대체)
   - 객관식 distractor 단어 선정 (변별력 높은 오답 선택지)
2. **사용자 임베딩** — Matrix Factorization
   - 협업 필터링 기반 신규 단어 추천 ("이 사용자와 비슷한 사용자가 자주 학습한 단어")

POC만 진행. 정식 배포는 별도 의사결정.

---

## Admin 대시보드 UI

운영자(=개발자 본인) 전용. 메뉴에 노출 안 되며 URL 직접 입력으로만 접근.

### 접속 URL

| 환경 | URL |
|---|---|
| 로컬 | `http://localhost:3100/admin` |
| dev  | `https://dev-heyvoca-front.ghmate.com/admin` |
| stg  | `https://stg-heyvoca-front.ghmate.com/admin` |
| prod | `https://heyvoca-front.ghmate.com/admin` |

### 첫 진입 절차

1. `.env`에 `ADMIN_USER`, `ADMIN_PASSWORD` 설정 → 백엔드 컨테이너 재시작
2. (선택) `.env`에 `LAUNCH_DATE=2026-XX-XX` 설정 → 시간 기반 임계치 활성화
3. `/admin` URL 접속 → ID/PW 입력 → `POST /admin/login` 호출 → 토큰 받아 `localStorage.heyvoca_admin_token`에 저장 → 대시보드 진입

### 대시보드 구성

- **상단 요약 카드**: 총 학습 로그 / 세션 / 활성 사용자 (30일) / 정식 오픈 후 경과일
- **Phase 카드 3개** (3.1, 3.2, 3.3): 각 카드에 임계치 3개(최소/권장/최상) 진행률 게이지
- **next_action 박스**: 임계치 달성 시 Claude Code에 입력할 명령어 (복사 버튼)
- **MetricsPanel / HealthPanel**: 분포 + lapse rate + 파티션별 row 수
- 30초 자동 새로고침 + 수동 새로고침 버튼

### Phase status 색상

- 🟢 `available` — 최소 임계치 달성. 진행 가능.
- 🟡 `blocked` — 대기 중
- ⚪ `deferred` — 보류 (Phase 3.3)
- 🔵 `completed` — 이미 완료

### 사용 흐름 (정식 오픈 후)

1. 매일/매주 admin 접속 → 진행률 확인
2. Phase X가 🟢 available 되면 next_action 박스의 명령어 복사
3. Claude Code에 그대로 붙여넣어 실행 → 후속 Phase 자동 진행

---

## 운영 모니터링 가이드

### 일일 체크 (admin 엔드포인트)

```bash
# 학습 메트릭 (정답률, 활성 사용자, 분포)
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://stg-heyvoca-back.ghmate.com/admin/study/metrics?days=1

# FSRS 건강도 (lapse rate, stability 분포, 파티션별 row 수)
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://stg-heyvoca-back.ghmate.com/admin/fsrs/health

# 최근 세션 (디버그)
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://stg-heyvoca-back.ghmate.com/admin/study/recent-sessions?limit=20
```

### 알림 임계치 (권장)

| 지표 | 정상 | 주의 | 위험 |
|---|---|---|---|
| 평균 정답률 (`avg_correct_rate`) | 0.7~0.85 | < 0.5 또는 > 0.95 | < 0.3 또는 > 0.98 |
| `lapse_rate_last_7d` | < 0.25 | 0.25~0.4 | > 0.4 |
| `GET /study/recommend` p95 | < 200ms | 200~500ms | > 500ms |
| 5xx 에러율 | < 0.1% | 0.1~1% | > 1% |
| Schema version distribution | 모두 v2 | v1이 남아있음 | v1이 다수 |

비정상 지표 발생 시 즉시 환경변수로 폴백:
- `VITE_RECOMMEND_BACKEND=false` (클라 SM2 폴백)
- `RATINGS_USE_TIME_CALIBRATION=false` (시간 보정 비활성)
- `FSRS_SOFT_LAPSE=false` (표준 FSRS 복귀)

---

## 로그 폭증 대응 (1년 후)

`user_study_log`가 1년 후 수억 row 가능. 대응:

1. **파티션 추가** — `p2031` 등 미리 추가:
   ```sql
   ALTER TABLE user_study_log REORGANIZE PARTITION p_future INTO (
     PARTITION p2031 VALUES LESS THAN (2032),
     PARTITION p_future VALUES LESS THAN MAXVALUE
   );
   ```

2. **콜드 스토리지 이전** (12개월 이전 데이터):
   - `mysqldump --where="created_at < '2027-01-01'"` 으로 export
   - parquet으로 변환 후 MinIO objectstore에 archive
   - `ALTER TABLE user_study_log DROP PARTITION p2026` 으로 삭제
   - 분석 필요 시 별도 OLAP 스택에서 parquet 직접 조회

---

## 핵심 파일 위치 참고

### 백엔드 (`heyvoca_back/`)
- `app/services/fsrs/` — FSRS 코어 (core, scheduler, converter, state, ratings)
- `app/services/recommend/` — 추천 엔진 (composer, pool, ranking)
- `app/routes/study.py` — 학습 엔드포인트 (sessions, log, recommend, weakness)
- `app/routes/admin.py` — 운영 모니터링 엔드포인트
- `app/utils/interleave.py` — 인터리빙 휴리스틱
- `jobs/migrate_sm2_to_fsrs.py` — 데이터 변환 (실행 완료)
- `jobs/rollback_fsrs_to_sm2.py` — 응급 롤백
- `jobs/refresh_question_type_stats.py` — 약점 통계 갱신 (APScheduler 04:00 KST)
- `tests/` — pytest 286개

### 프론트 (`heyvoca_front/`)
- `src/api/study.jsx` — 학습 API (createSession, logQuestion, finishSession, getRecommend, getMyWeakness)
- `src/pages/TakeTest.jsx` — 학습 화면 (백엔드 추천 + 폴백)
- `src/components/takeTest/Main.jsx` — 정답/오답 처리 (logQuestion 호출)
- `src/components/takeTest/StudyResult.jsx` — 결과 화면 (reason 칩, composition_strategy 배지)
- `src/components/myPage/WeaknessCard.jsx` — 약점 시각화
- `src/utils/common.jsx` — getWordMemoryState (FSRS 기반), deriveSm2FromFsrs 폴백
- `src/utils/questionTypeLabels.js` — 문제 유형 한국어 라벨

### 원본 플랜
- `~/.claude/plans/vivid-beaming-pillow.md` — 전체 설계 문서

---

## 응급 롤백 시나리오

### 시나리오 1: 추천 엔드포인트 장애
- 클라이언트 환경변수 `VITE_RECOMMEND_BACKEND=false` → 빌드/배포 → 클라 SM2 정렬로 폴백
- 백엔드는 그대로 (PATCH `/vocaIndexs`가 살아있어 sm2 흐름 동작)

### 시나리오 2: FSRS 알고리즘 이상 (정답률 폭락 등)
- `RATINGS_USE_TIME_CALIBRATION=false` + `FSRS_SOFT_LAPSE=false` → 컨테이너 재시작 → 표준 FSRS-5로 복귀
- 그래도 이상하면 시나리오 1로

### 시나리오 3: 데이터 정합성 문제 (UserVoca.data 손상 등)
- `docker exec heyvoca_back_<env> python3 jobs/rollback_fsrs_to_sm2.py --batch-size 500`
- v2 → v1 복원 (sm2 키만 남기고 fsrs/schema_version 제거)
- 클라 폴백 모드와 함께 사용하면 SM2 시절로 완전 복귀

### 시나리오 4: 마이그레이션 실패
- `flask db downgrade` 한 단계씩 (각 마이그레이션은 downgrade 함수 보유)
- 파티셔닝 downgrade는 `REMOVE PARTITIONING` + PK 복원

---

작업 종료일: 2026-05-07
