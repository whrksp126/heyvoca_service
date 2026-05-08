"""
admin /progress 엔드포인트의 next_action.command_for_claude 풀 프롬프트.

박스 표시는 command_short(짧은 라벨), 복사 버튼은 command_for_claude(아래 풀 프롬프트).
새 세션에서 그대로 붙여넣으면 컨텍스트 없이도 즉시 실행 가능하도록 작성.
"""

PHASE_1_4 = """\
heyvoca 단어 학습 알고리즘 고도화 작업의 Phase 1.4 (레거시 정리)를 진행해줘.

## 컨텍스트
heyvoca의 단어 학습 알고리즘은 SM2 → FSRS-5로 베타 단계에서 전환 완료(Phase 1.1~2.3). 정식 오픈 후 충분한 기간 무탈 운영되어 폴백 코드를 제거하는 단계.

가이드 문서: heyvoca_service/docs/POST_LAUNCH_TODO.md (Phase 1.4 섹션)
원본 플랜: ~/.claude/plans/vivid-beaming-pillow.md
프로젝트 메모리: ~/.claude/projects/-Users-whrksp126-other-project-heyvoca/memory/project_fsrs_migration.md

## 작업 목록

### 1. 클라이언트 폴백 코드 제거
- heyvoca_front/src/utils/common.jsx:341-591 — updateSM2, analyzeLearningPattern 함수 삭제
- heyvoca_front/src/utils/forgettingPriority.js — 파일 삭제
- heyvoca_front/src/components/takeTest/Main.jsx — 폴백 분기(`studySessionRef.current === null` 케이스) 제거
- heyvoca_front/src/components/takeTest/SaveStudyData.jsx — 폴백 분기 제거
- heyvoca_front/src/pages/TakeTest.jsx — legacyLocalSelection 함수 제거, 추천 API 실패 시 에러 안내로 변경
- heyvoca_front/src/utils/common.jsx의 deriveSm2FromFsrs는 유지 (다른 화면에서 폴백 가능)

### 2. 백엔드 SM2 호환성 제거
- heyvoca_back/app/routes/voca_indexs.py:193-219 — PATCH /vocaIndexs/<id>의 sm2 처리 제거
- 응답에 Sunset / Deprecation 헤더 추가 후 4주 모니터링 → 호출 0건이면 200 OK + no-op으로 변경
- heyvoca_back/app/services/fsrs/state.py — v1 호환 코드(parse_user_voca_data의 v1 분기, migrate_v1_to_v2) 제거 가능 여부 검토

### 3. UserVoca.data 정리 스크립트
- heyvoca_back/jobs/finalize_fsrs_migration.py 신설 — schema_version=3으로 올리고 sm2/schema_version/params_version 외 모든 키 제거
- 단어당 ~200B 절감
- argparse: --dry-run, --batch-size, idempotent
- 결과 리포트 JSON 저장
- 기존 jobs/migrate_sm2_to_fsrs.py, rollback_fsrs_to_sm2.py 패턴 따름

### 4. 검증
- 백엔드 pytest 전부 통과 (현재 336/336)
- 프론트 npm run build 성공
- finalize_fsrs_migration.py --dry-run으로 변환 대상 확인

## 주의사항
- .env*, db/backups/, db/batches/ 절대 건드리지 말 것
- finalize 스크립트 실행 전 백업(MinIO archive) 권장
- 폴백 코드 제거 후 1주 모니터링 — admin /admin/progress에서 patch_voca_indexs_sm2_calls_7d=0 유지 확인
"""

PHASE_3_1 = """\
heyvoca 단어 학습 알고리즘 고도화 작업의 Phase 3.1 (FSRS 글로벌 파라미터 ML 최적화)를 진행해줘.

## 컨텍스트
SM2 → FSRS-5 전환 완료(Phase 1.1~2.3). 학습 로그가 충분히 누적(10,000+ reviews)되어 FSRS-5의 17개 파라미터를 데이터로 fitting하는 단계. 기본값 대신 데이터 기반 파라미터로 망각곡선 예측 정확도 향상.

가이드 문서: heyvoca_service/docs/POST_LAUNCH_TODO.md (Phase 3.1 섹션)
원본 플랜: ~/.claude/plans/vivid-beaming-pillow.md
프로젝트 메모리: ~/.claude/projects/-Users-whrksp126-other-project-heyvoca/memory/project_fsrs_migration.md

## 작업 목록

### 1. 신규 모델 (사용자 DB)
heyvoca_back/app/models/models.py:
```python
class FSRSParamSet(db.Model):
    __tablename__ = 'fsrs_param_set'
    id = Column(Integer, primary_key=True, autoincrement=True)
    scope = Column(String(16), nullable=False)        # 'global' | 'cohort' | 'user'
    scope_key = Column(String(64), nullable=True)
    params = Column(TEXT, nullable=False)             # 17 floats JSON
    train_log_count = Column(Integer, nullable=False)
    metric_loss = Column(Float, nullable=True)
    metric_brier = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=False)
    version = Column(String(32), nullable=False)
    bucket_range = Column(String(16), nullable=True)  # A/B '0-49' / '50-99'
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
```
User에 `experiment_bucket` Integer (0~99) 컬럼 추가 (A/B 테스트용).

### 2. 마이그레이션
docker exec -it heyvoca_back_local flask db migrate -m "add fsrs_param_set and user.experiment_bucket"
docker exec -it heyvoca_back_local flask db upgrade
자동 감지 시 다른 모델 drift 노이즈 제거.

### 3. 배치 스크립트 heyvoca_back/jobs/fsrs_optimize.py
- 90일치 UserStudyLog 로드
- scipy.optimize.minimize로 17개 파라미터 NLL/Brier 최적화 (목적함수: |R_predicted - R_actual|^2 합)
- 검증셋(20%) Brier < 0.18 통과 시 is_active=True
- FSRSParamSet INSERT
- argparse: --scope global|cohort|user, --dry-run, --user-id (user scope용)
- 출력: 콘솔 메트릭 리포트 + .optimization_report_<ts>.json

### 4. APScheduler 등록
heyvoca_back/app/routes/fcm.py의 create_scheduler 패턴 따라:
주1회 일요일 03:00 KST CronTrigger로 fsrs_optimize.run('global') 자동 실행
gunicorn 멀티워커 소켓 락 공유.

### 5. fsrs/scheduler.py 변경
- review() 호출 시 params 우선순위: user → cohort → global → 기본값
- Redis 캐시 key `fsrs:params:<user_id>` (TTL 1시간)
- UserVoca.data.fsrs.params_version에 어떤 파라미터로 계산됐는지 기록

### 6. A/B 테스트 인프라
- POST /study/log에서 user.experiment_bucket으로 활성 FSRSParamSet 조회 (bucket_range 매칭)
- 50:50 분기 (예: '0-49' = old global, '50-99' = new global)
- /admin/fsrs/health에 A/B별 retention, 정답률, 학습일수 비교 추가

### 7. requirements.txt
scipy, numpy 추가. 컨테이너 재빌드 필요 (docker compose -f docker-compose.local.yml up --build -d back).

### 8. 단위 테스트
- tests/test_fsrs_optimize.py: 가짜 학습 로그 생성 → fit 동작, Brier 계산, 검증셋 통과 케이스
- tests/test_param_priority.py: review() 호출 시 user > cohort > global > 기본 순서 검증
- 기존 336개 테스트 모두 통과 유지

## 주의사항
- 기본값 대비 retention 향상이 검증되지 않으면 is_active=True 절대 설정 X
- A/B 테스트는 stg에서 먼저 1주 검증 후 prod 적용
- .env*, db/backups/, db/batches/ 절대 건드리지 말 것
- 새 마이그레이션은 dev/stg/prod 컨테이너 entrypoint에서 자동 적용 (flask db upgrade)
"""

PHASE_3_2 = """\
heyvoca 단어 학습 알고리즘 고도화 작업의 Phase 3.2 (사용자별 FSRS 파라미터)를 진행해줘.

## 컨텍스트
Phase 3.1 글로벌 파라미터 운영 중. 200+ reviews 누적 사용자가 100명 이상이라 사용자별 망각곡선이 통계적으로 의미 있게 드러나는 단계. 개별 사용자에게 user-specific 파라미터를 적용하면 글로벌보다 retention 향상 기대.

가이드 문서: heyvoca_service/docs/POST_LAUNCH_TODO.md (Phase 3.2 섹션)
프로젝트 메모리: ~/.claude/projects/-Users-whrksp126-other-project-heyvoca/memory/project_fsrs_migration.md

## 작업 목록

### 1. fsrs_optimize.py 확장
- --scope user 지원 (기존 Phase 3.1에서 만들어진 골격 활용)
- 200+ reviews 또는 30일+ 학습자만 대상 (그 미만은 절대 user-specific 적용 X — cohort/global 폴백)
- 각 사용자별로 17개 파라미터 fit
- 검증셋(20%) Brier < 0.18 통과 못하면 is_active=False (활성화 거부)
- 결과 리포트에 활성화/거부 사용자 수 명시

### 2. APScheduler 추가
주1회 월요일 04:00 KST에 user-specific fit 자동 실행 (글로벌과 다른 시간대로 분산)

### 3. 캐시 무효화
- fsrs_optimize.py가 사용자 파라미터 갱신 시 Redis fsrs:params:<user_id> 즉시 무효화
- POST /study/log에서 활성 파라미터 변경 감지 시 UserVoca.data.fsrs.params_version 자동 업데이트

### 4. admin 모니터링 확장
- /admin/fsrs/health에 추가:
  - user_specific_active_count (활성 사용자 수)
  - user_specific_avg_brier (평균 Brier)
  - user_specific_vs_global_retention_diff (글로벌 대비 retention 차이)
- /admin/progress의 Phase 3.2 진행률 자동 업데이트 (users_with_user_specific_params)

### 5. 단위 테스트
- tests/test_fsrs_optimize_user.py: 가짜 사용자 로그 생성 → user fit + Brier 검증 통과/실패 케이스
- tests/test_param_priority_user.py: 동일 사용자에게 user > cohort > global 순서 동작 검증
- 임계 미달 사용자(< 200 reviews)에게 user-specific 적용 X 검증

### 6. 운영 준비
- stg에서 1주 A/B 테스트 (user-specific 50% vs 글로벌 50%)
- retention 향상 통계적 유의미하면 prod 100% 롤아웃
- 그 외 케이스는 글로벌 유지

## 주의사항
- 데이터 부족 사용자에게 절대 user-specific 적용 X (과적합)
- Brier 검증 통과 못하면 절대 is_active=True 설정 X
- 사용자가 학습 일정에 만족하던 paradigm shift는 부정적 신호 가능 → A/B 모니터링 신중
- .env*, db/backups/, db/batches/ 절대 건드리지 말 것
- 기존 테스트 모두 통과 유지
"""

PHASE_3_3 = """\
heyvoca 단어 학습 알고리즘 고도화 작업의 Phase 3.3 (임베딩 R&D POC)를 진행해줘.

## 컨텍스트
Phase 1~3.2 완료. 임베딩 기반 추천 고도화는 정식 오픈 6개월 후 별도 의사결정 후 진행하는 R&D POC 단계. 정식 배포 결정은 별도 리뷰 후.

가이드 문서: heyvoca_service/docs/POST_LAUNCH_TODO.md (Phase 3.3 섹션)
프로젝트 메모리: ~/.claude/projects/-Users-whrksp126-other-project-heyvoca/memory/project_fsrs_migration.md

## 작업 목록 (POC 수준)

### 1. 단어 임베딩
- multilingual MiniLM (sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) 또는 GloVe 영어 사전훈련 모델 사용
- 모든 Voca의 word를 임베딩 → 384차원 벡터
- 저장 위치: 사전 DB(heyvoca_dict)에 voca_embedding 테이블 신설 (voca_id PK, embedding BLOB)
- 마이그레이션: --directory migrations_dict 플래그 필수
- 배치 스크립트 heyvoca_back/jobs/build_word_embeddings.py
  - 모든 Voca 순회, 임베딩 계산, BLOB로 저장
  - 신규 단어 추가 시에만 새로 빌드 (incremental)

### 2. 클러스터링 기반 인터리빙
- composer.py의 인터리빙(현재 첫 3글자 휴리스틱)을 임베딩 코사인 유사도 기반으로 교체
- A/B 테스트: 기존 휴리스틱 vs 임베딩
- 환경변수 EMBEDDING_INTERLEAVE=true일 때만 활성

### 3. 객관식 distractor 단어 선정
- 정답 단어와 코사인 유사도 0.6~0.8 범위 단어를 오답 선택지로 우선 (변별력 높음)
- 백엔드 추천 응답 items[].distractors 필드 추가
- 프론트 buildSingleWordQuestion에서 활용

### 4. 사용자 임베딩 (POC만)
- Matrix Factorization (사용자 × 단어 정답률 매트릭스)
- 사용자 임베딩 → 비슷한 사용자가 자주 학습한 단어를 신규 단어로 추천 (협업 필터링)
- POC 수준 — 정식 배포는 별도 의사결정

### 5. 운영 인프라
- requirements.txt에 sentence-transformers 또는 torch 추가 시 이미지 사이즈 폭증 — Docker 멀티스테이지 검토
- CPU 추론: 첫 호출 시 모델 로드 (~5초), 이후 Redis 캐시
- 메모리 사용량 모니터링 (admin/fsrs/health에 model_memory_mb 추가)
- 환경변수 EMBEDDING_RECOMMEND=true일 때만 활성. 기본 false

### 6. POC 환경
- stg에서만 활성화 (prod는 별도 의사결정 후)
- A/B 테스트: 기존 추천 vs 임베딩 추천 retention 비교
- 1개월 데이터 수집 후 정식 배포 의사결정

## 주의사항
- POC 수준이라 실패해도 즉시 환경변수 OFF로 폴백 가능해야 함
- 모델 로드 실패 시 기존 휴리스틱으로 graceful degrade
- requirements.txt 변경 시 컨테이너 재빌드 + 이미지 크기 변화 보고
- .env*, db/backups/, db/batches/ 절대 건드리지 말 것
- 정식 배포 의사결정 전까지는 stg에서만 동작
"""

PHASE_PROMPTS = {
    '1.4': PHASE_1_4,
    '3.1': PHASE_3_1,
    '3.2': PHASE_3_2,
    '3.3': PHASE_3_3,
}
