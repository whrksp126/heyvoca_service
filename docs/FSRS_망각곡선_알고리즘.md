# heyvoca 망각곡선(FSRS) 알고리즘 — 현황 · 문제점 · 고도화 작업 가이드

> **범위**: 복습 스케줄링 **알고리즘**만 다룬다 (수식, rating 추론, 추천 정렬, 스케줄 정책, 데이터 품질). 복습 유도 UI/UX는 별도 트랙.
> **근거**: 백엔드 `app/services/fsrs/`·`app/services/recommend/`·`app/routes/study.py` + 프론트 시간측정 코드 직접 정독, prod 실데이터(2026-07-04 조회).
> 작성일: 2026-07-04

---

## 3줄 요약

1. FSRS 수식 구현 자체는 표준과 일치하고 정확하다. 문제는 **수식에 들어가는 입력(rating)과 수식에서 나온 값(R)을 다루는 주변부**에 있다.
2. 확정 결함 3개: **① rating의 70%가 Hard로 쏠림**(시간 측정·기준 결함), **② 저장된 retrievability가 항상 1.0**이라 "망각 임박 순" 정렬이 무동작, **③ 그 결과 모델이 실제 기억을 크게 과소평가**(50% 기억 예측 구간의 실제 정답률 91.7%) → 간격이 필요보다 짧다.
3. 작업 순서: **rating 수리 → R 읽기 시점 재계산 → 정책 공백 보완**. 파라미터 ML 최적화(Phase 3.1)는 rating 수리 *이후의* 로그가 쌓인 다음이다 — **수리 전 로그는 오염 데이터**이므로 `rating_version` 마킹이 필수.

---

# Part 1. 지금 어떻게 동작하나

## 1-1. FSRS 개념 (1분 요약)

단어마다 기억 상태를 3개 변수로 추적한다.

| 변수 | 의미 |
|------|------|
| **D** (Difficulty, 1~10) | 이 단어가 이 사용자에게 얼마나 어려운가 |
| **S** (Stability, 일수) | 기억이 얼마나 오래 가는가 — "기억 확률이 90%로 떨어지기까지 걸리는 일수" |
| **R** (Retrievability, 0~1) | **지금 이 순간** 떠올릴 수 있을 확률. 시간이 지날수록 떨어진다 |

```
R(t) = (1 + 0.2346·t/S)^-0.5        # t = 마지막 복습 후 경과 일수
다음 복습 간격 = S                    # 목표 유지율(desired_retention) 0.9 기준
```

- 맞히면 S가 커져 간격이 늘고, 틀리면 S가 깎여 간격이 줄어든다.
- **오래 잊고 있다가(R 낮음) 맞히면 S가 더 크게 증가**한다 — 어려운 회상일수록 기억이 강해지는 효과(desirable difficulty)를 수식이 반영.
- 목표 유지율은 0.9 하드코딩(`core.py:103`), 간격 clamp 1일~100년, fuzz(간격 랜덤화) 없음.

> 버전 주의: 코드 주석은 "FSRS-5"지만 실제 수식·파라미터는 **FSRS-4.5(17개)**다. FSRS-5(19개)의 당일 재복습(short-term) 항은 없다. 상세 수식은 부록 C.

## 1-2. 학습 1회의 데이터 흐름

```
[프론트] 채점 → was_correct + time_taken_ms 전송 (rating은 안 보냄)
   ↓ POST /study/log (study.py:157)
[백엔드] ① UserVoca row 락 (동시성 안전)
         ② rating 추론: 오답→Again / 정답→응답속도로 Hard·Good·Easy 판정 (ratings.py)
         ③ FSRS 계산 (scheduler.review → core.fsrs_review) — 오답이면 소프트 lapse 보정
         ④ 저장: UserVoca.data(v3) + UserStudyLog(state_before/after 스냅샷)
              + UserQuestionTypeStat(유형별 정답률·EWMA 응답시간) + 추천 캐시 무효화
```

- **첫 학습도 동일하게 실제 추론 rating을 쓴다** (S0: Again 0.41 / Hard 1.18 / Good 3.13 / Easy 15.47일). `schedule_initial()`은 호출처 없는 데드코드.
- 4단계 버튼(Again/Hard/Good/Easy)이 UX에 없기 때문에 rating을 시간으로 추론하는 것 — 이 커스텀이 현재 최대 문제 지점(Part 2 결함 B).
- 세션 내 오답 재출제(2~3문제 뒤 재삽입, 정답까지 최대 10회)는 프론트 전용 로직이며 **재시도 결과는 FSRS에 반영되지 않는다** (`isRetry` 로깅 스킵).

### rating 추론 규칙 (ratings.py)

```
오답 → 1 (Again)
정답: expected_ms = 1500 + 120·단어길이 + 200·난이도
      실제시간/expected ≤ 0.5 → Easy / ≤ 1.0 → Good / 초과 → Hard
```

### 소프트 lapse (scheduler.py) — 의도적 커스텀

표준 FSRS는 오답 시 S를 크게 깎는다. 초보 이탈 방지를 위해 완화했다:
`첫 lapse S×0.3 / 연속 lapse S×0.1 / 직전 5건 정답률 ≥0.8이면 감소율 ×0.5 / 최종 = max(soft, 표준값)`.
`FSRS_SOFT_LAPSE=false`로 표준 복귀 가능. Part 2의 calibration 결과("모델이 기억을 과소평가")와 방향이 배치되지 않으므로 당분간 유지, 정식 검증은 데이터 축적 후.

## 1-3. 추천 세션 구성 (`GET /study/recommend`)

1. **bucket 분류** (pool.py): 전 단어를 `new`(미학습) / `overdue`(복습일 지남) / `today` / `short`(S<10) / `medium`(S<60) / `long`으로 분류. 여기에 composer가 최근 48시간 내 오답 단어를 `lapse` 버킷으로 재분류(단어별 최신 로그가 오답인 것만 — 정답으로 회복하면 빠짐).
2. **버킷별 정렬** (ranking.py): overdue=오래된 순, lapse/short/medium=R 낮은 순(→ 결함 A 때문에 현재 무동작), new/today=셔플.
3. **슬롯 분배** (composer.py): lapse→overdue→today 우선, 잔여는 최근 7일 정답률 기반 능력별 가중치(상: new 55%/short 25%/medium 20%, 중: 30/40/30, 하: 10/55/35). 신규는 `daily_new_limit`(기본 20/일) 캡 + overdue가 세션을 독식하지 못하게 신규/단기 floor 예약. 마지막에 유사 단어 인접 회피 인터리빙.

## 1-4. 잘 되어 있는 것 (검증 완료 — 건드릴 필요 없음)

- FSRS-4.5 수식 자체 (표준과 대조 확인).
- 타임존/학습일 경계: KST + 새벽 4시 컷오프(Anki식)를 due 판정·오늘 집계·신규 캡이 **단일 소스**(`study_day.py`)로 공유 — 경계 skew 없음.
- 동시성(row 락), 중복 로깅 방지, lapse 버킷의 회복 처리, state_before/after 로그 축적(향후 ML 학습 데이터).
- 데이터 마이그레이션: prod 전원 schema v3, 레거시 잔존 없음.

---

# Part 2. 무엇이 문제인가 (확정 결함 3 + 정책 공백)

## 결함 B — rating의 70%가 'Hard'로 쏠린다 ★ 최우선

**현상** (prod 로그 714건): Again 10% / **Hard 70%** / Good 17% / Easy 3%. 정답 중 Hard 비율이 문제 유형에 따라 극단적으로 갈린다.

| 유형 | 정답 중 Hard | 평균 응답 |
|------|-------------|-----------|
| cardMatchListening | **99.4%** | 18.2s |
| cardMatch | **91.3%** | 14.3s |
| multipleChoiceListening | 76.5% | 7.2s |
| multipleChoice | 44.1% | 6.1s |

**원인 2가지**:
1. **측정 결함**: cardMatch류의 단어별 타이머가 **세트 시작 시각** 기준(`CardMatchQuestion.jsx:144`, Listening 동일). 세트에서 2·3·4번째로 맞춘 단어는 앞 단어들 시간이 전부 누적 → 실제 인지 속도와 무관하게 후반 단어는 무조건 Hard.
2. **기준 결함**: 기대시간 공식(평균 ~3.2초)이 "보고 바로 고르는" 객관식 기준 하나뿐. 카드 짝맞추기·음성 재생이 포함된 유형은 형식 자체가 오래 걸리는데 그게 전부 "느리게 맞힘"으로 해석된다.

**영향** (측정됨): Hard 패널티(×0.25)가 S 성장을 체계적으로 억제 →
- 첫 학습 평균 간격 **1.2일** (Good이면 3일이어야 정상)
- reps별 간격이 3~5회차 17~20일에서 정체 후 **오히려 감소**
- 장기기억(S≥60) 단어가 559개 중 **3개**

## 결함 A·C — 저장 R이 항상 1.0 → "망각 임박 순" 정렬 무동작

**원인**: `core.py:185`가 복습 **직후**의 R(=정확히 1.0)을 저장하고, 이후 시간이 지나도 재계산하는 코드가 없다. R은 시간의 함수인데 스냅샷만 저장한 것.

**영향**: `ranking.py:28`이 이 저장값으로 정렬하므로 —
- lapse/short/medium 버킷의 "R 낮은 순" → 전원 동률(1.0) → **DB 적재 순서 그대로** (사실상 무정렬)
- long 버킷의 (R,S) 복합 정렬 → S 단독 정렬로 퇴화
- `/study/recommend` 응답의 `retrievability`도 항상 1.0
- overdue(날짜순)·new/today(셔플)만 의도대로 동작 중

**수정 방향**: 정렬·응답 시점에 `R = (1+0.2346·경과일/S)^-0.5`를 **읽기 시점 재계산**. `core._retrievability()`가 이미 있으므로 노출해서 쓰면 된다.
(프론트 클라이언트 정렬 `forgettingPriority.js`는 next_review 날짜 기준이라 무관)

## 발견 ③ — 모델이 실제 기억을 크게 과소평가한다 (calibration)

로그의 `state_before`(S, last_review)로 복습 시점 R을 재계산해 실제 정답률과 비교했다:

| 모델의 기억 예측 | n | 실제 정답률 |
|-----------------|---|------------|
| "96% 기억할 것" (R 0.95+) | 118 | 95.8% ✅ 잘 맞음 |
| "87% 기억할 것" (R 0.80~0.90) | 78 | **98.7%** |
| "66% 기억할 것" (R 0.60~0.80) | 40 | **95.0%** |
| "52% 기억할 것" (R <0.60) | 72 | **91.7%** |

30일 이상 밀린 단어조차 9할을 맞혔다. **모델이 생각하는 것보다 사용자 기억이 훨씬 강하다 = 현재 복습 간격은 필요보다 짧다.**

*해석 주의*: ① 문제가 재인(recognition)형이라 회상형보다 정답률이 높게 나옴, ② 복습하러 돌아온 사용자만 표본(selection bias), ③ cardMatch는 소거법 효과 있음, ④ Hard 편향(결함 B)이 S를 억눌러 R 예측을 낮춘 것과 얽혀 있음. → **결함 B 수리 후 재측정**해서 desired_retention 조정 판단의 근거로 쓸 것.

## 정책 공백 (설계 미결정 사항)

| 항목 | 현재 동작 | 문제 |
|------|-----------|------|
| 당일 재복습 | 매번 FSRS 재계산. S는 +0.01 수준(무해)이지만 last_review·next_review가 계속 밀림 | FSRS-4.5에 당일 항이 없어 동작이 미정의. prod에서 단어당 최대 9회/일 관측 |
| client_now | 클라이언트 시각을 검증 없이 신뢰 (`study.py:222`) | 기기 시계가 틀어지면 S/D 오염 |
| 간격 fuzz | 없음 | 같은 날 배운 단어들이 같은 날 몰려 돌아옴 |
| 단어/단어장 삭제 | UserVoca 삭제 시 FSRS 상태 소실 | 재추가하면 처음부터. 보존 여부 미결정 |
| desired_retention | 0.9 고정 | 사용자 목표별 조정 불가. calibration상 하향(0.85~0.87) 검토 여지 |

> **결정(2026-07-04): 분 단위 복습 스케줄은 도입하지 않는다.** 세션 내 오답 재출제(2~3문제 뒤, 정답까지)가 이미 그 역할을 하고 있고, 세션 기반 UX에서 서버 스케줄을 분 단위로 잡으면 overdue만 늘린다. FSRS-4.5 수식도 단기 재복습을 받아줄 항이 없다. 대신 **재시도 로그를 `is_retry` 플래그로 기록만** 해두면(스케줄 미반영) 향후 FSRS-5(w17/w18) 도입 시 학습 데이터가 된다.

---

# Part 3. 고도화 작업 목록 (우선순위 순)

## P0 — 확정 결함 수리

### 작업 1. rating 추론 수리 ← 가장 임팩트 큰 단일 작업

- [ ] **1a. cardMatch 타이머 수정**: `CardMatchQuestion.jsx` / `CardMatchListeningQuestion.jsx`의 단어별 타이머 기준을 세트 시작(:144 `questionStartRef`) → **직전 매칭 완료 시점**으로.
- [ ] **1b. 유형별 기대시간**: 단기적으로 `ratings.py` 상수를 question_type별로 분화(듣기 유형은 음성 재생 시간 차감 고려). 중기적으로는 `UserQuestionTypeStat.avg_time_taken_ms`(이미 EWMA 축적 중)를 사용자×유형 기준선으로 쓰는 상대속도 판정이 개인차·유형차를 동시에 흡수해서 더 좋다.
- [ ] **1c. `rating_version` 마킹**: UserStudyLog에 rating 로직 버전 기록. 수리 전후 로그 구분용 — **Phase 3.1 데이터 오염 방지의 핵심**.
- 검증: 배포 후 유형별 rating 분포(Hard 비율), 첫 학습 평균 간격(1.2일 → 3일+ 기대), reps별 간격 성장 곡선을 재측정.

### 작업 2. R 읽기 시점 재계산 (결함 A·C 동시 해소)

- [ ] `core._retrievability()`를 공개 → pool/ranking/recommend 응답에서 경과일 기반 실시간 계산.
- [ ] overdue 백로그 정렬 정책 결정: 현행 "오래된 순" vs "R 높은 순(아직 기억날 확률 높은 것부터)" — calibration 근거로는 후자가 복습 재개 성공률에 유리.
- [ ] 저장 R 필드는 "복습 직후 스냅샷"임을 주석 명시 (또는 필드 제거 검토).

## P1 — 정책 공백 보완 (각각 독립 작업, 순서 무관)

- [ ] **3. 당일 재복습 정책**: 당일 재복습은 로그만 남기고 스케줄 갱신 1일 1회 제한. (FSRS-5 short-term 파라미터 도입은 P2에서 함께 검토)
- [ ] **4. 재시도 로그 수집**: 세션 내 재출제 결과를 `is_retry` 플래그로 기록 (스케줄 미반영). 위 결정사항 참조.
- [ ] **5. client_now clamp**: 서버 시각 ±10분 초과 시 서버 시각 사용.
- [ ] **6. 간격 fuzz**: ±5% 랜덤.
- [ ] **7. desired_retention 옵션화 + 기본값 재검토**: 작업 1 수리 후 calibration 재측정 → 0.85~0.87 하향 여부 결정.
- [ ] **8. 삭제 정책 결정**: 단어 재추가 시 학습 이력 복원 여부.
- [ ] **9. 소소한 정리**: `schedule_initial()` 데드코드, 프론트 죽은 q_score 계산(`Main.jsx:371,426`), `handleClickNext`의 endTime 설정 전 시간 계산(:354 — 실행되면 음수 전송 가능, 현재는 미사용 경로).

## P2 — 데이터 누적 후 (상세: `POST_LAUNCH_TODO.md`)

- **Phase 3.1 파라미터 ML 최적화**: 트리거 10,000 reviews — 현재 714건(7%)로 시기상조. `state_before/after` 로그로 17개 파라미터를 학습하되 **작업 1c의 `rating_version`으로 수리 이후 로그만 사용**.
- **FSRS-5 업그레이드 검토** (w17/w18 short-term): 재시도 로그(작업 4)가 쌓이면 당일/단기 재복습을 수식에 정식 반영할 수 있다.
- **소프트 lapse Brier 검증**: 중간 R 구간 로그 축적 후 표준 FSRS 대비 예측 오차 비교. 악화 시 env로 즉시 롤백.
- Phase 3.2(사용자별 파라미터, 200+ reviews 사용자 100명 — 현재 1명), Phase 3.3(임베딩 R&D).

---

# 부록

## A. 결함 위치 요약

| ID | 내용 | 위치 | 검증 |
|----|------|------|------|
| A | 저장 R 항상 1.0 (갱신 없음) | `core.py:185` | prod 확인 |
| B | cardMatch 타이머 세트 시작 기준 → 후반 단어 무조건 Hard | `CardMatchQuestion.jsx:144` (Listening 동일) | prod 확인 (Hard 91~99%) |
| C | "R 낮은 순" 정렬 무동작 (A의 파생) | `ranking.py:28-35` | 코드 확인 |
| — | client_now 무검증 | `study.py:222-230` | 잠재 |
| — | handleClickNext 시간 계산 순서 | `takeTest/Main.jsx:354` | 잠재 (실데이터 무해 확인) |

## B. prod 데이터 스냅샷 (2026-07-04 — 효과 측정의 베이스라인)

| 지표 | 값 |
|------|-----|
| 학습 로그 / 사용자 | 714건 / 19명 (78%가 첫 학습, 진짜 재복습 ~200건) |
| rating 분포 | Again 10% / Hard 70% / Good 17% / Easy 3% |
| 학습된 단어 상태 | review 311 / learning 240 / relearning 7 · stability: short 446 / medium 110 / **long 3** |
| 첫 학습 평균 간격 | 1.2일 |
| reps별 평균 간격 | 1→1.2d, 2→12d, 3~5→17~20d 정체, 6+→감소 |
| 복습 예정 중 overdue | 89% (30일+ 지연 317개) |
| lapse rate (30일) | 0.117 |
| 당일 재복습 S 변화 | +0.89 (익일 이후 +13.8) |

## C. 핵심 수식 (core.py — 표준 FSRS-4.5와 일치 확인)

```python
# 초기값 (첫 학습, rating별)
S0 = w[rating-1]                         # Again 0.41 / Hard 1.18 / Good 3.13 / Easy 15.47
D0 = w[4] - exp(w[5]·(rating-1)) + 1     # clamp 1~10

# 정답: R 낮을수록·D 낮을수록 S가 크게 증가
SInc  = exp(w[8])·(11-D)·S^(-w[9])·(exp((1-R)·w[10])-1) · hard_penalty(0.25) · easy_bonus(2.99)
S_new = max(S·(1+SInc), S+0.01)

# 오답 (lapse)
S_new = w[11]·D^(-w[12])·((S+1)^w[13]-1)·exp(w[14]·(1-R))    # 최소 0.1, 이후 소프트 lapse 보정

# 난이도: mean-reversion (D0(Easy) 방향)
D_new = w[7]·D0(4) + (1-w[7])·(D - w[6]·(rating-3)·(10-D)/9)
```

상태 전이: new→(Again)→learning / new→(성공)→review / review·learning→(Again)→relearning(lapses+1) / any→(성공)→review

## D. 튜닝 환경변수 (응급 롤백용)

| 변수 | 기본값 | 효과 |
|------|--------|------|
| `RATINGS_USE_TIME_CALIBRATION` | true | off → 5/10초 단순 컷오프 rating |
| `FSRS_SOFT_LAPSE` | true | off → 표준 FSRS lapse |
| `APP_TZ` / `APP_DAY_CUTOFF_HOUR` | Asia/Seoul / 4 | 학습일 경계 |

## E. 파일 맵

```
heyvoca_back/app/
├── services/fsrs/
│   ├── core.py         # 수식 (:103 dr 하드코딩, :185 결함 A)
│   ├── scheduler.py    # 소프트 lapse 래퍼 — 진입점 review()
│   ├── ratings.py      # 시간→rating 추론 (작업 1b 대상)
│   ├── state.py        # UserVoca.data v3 직렬화
│   └── converter.py    # SM2→FSRS (역할 종료)
├── services/recommend/
│   ├── pool.py         # bucket 분류
│   ├── ranking.py      # 버킷별 정렬 (:28 결함 C — 작업 2 대상)
│   └── composer.py     # 슬롯 분배 + daily_new_limit + 인터리빙
├── services/study_day.py    # 학습일 경계 단일 소스
└── routes/study.py           # /study/log(:157) · recommend(:686) · review-schedule(:423)

heyvoca_front/src/
├── components/takeTest/Main.jsx              # 채점·시간측정·재출제 (:354 잠재결함)
├── plugins/questionTypes/cardMatch/*.jsx     # :144 결함 B — 작업 1a 대상
└── utils/forgettingPriority.js               # 클라 정렬 (next_review 기준, 무관)

heyvoca_service/docs/POST_LAUNCH_TODO.md      # Phase 3.x 상세 · 응급 롤백 시나리오
```
