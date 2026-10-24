# 수준 맞춤 학습 · 문장 뜻 맞추기 · 학습 진입 개편 계약 (이슈 #16, 2026-10-25)

백엔드·프론트가 동시에 작업하므로 이 문서가 정본이다. 바꿀 일이 생기면 이 문서를 먼저 고친다.

## 0. 참고한 듀오링고 방식 (요약)

- **공통 척도**: 문장·사용자 모두 CEFR(A1~C2)에 맞춘 한 줄 점수(Duolingo Score 10~160 과 같은 발상).
  우리는 0~100 점, 6구간으로 쓴다: A1 0–19 / A2 20–34 / B1 35–54 / B2 55–74 / C1 75–89 / C2 90–100.
- **Birdbrain(IRT/Elo 계열)**: `P(정답) = σ(사용자 능력 θ − 문제 난이도 b)`. 답할 때마다
  `θ += K·(정답여부 − P)`, 문제 난이도도 같이 보정 가능. 세션은 **P(정답) ≈ 0.8**(조금 어렵지만 할 만한)
  문제를 고른다 = "아는 단어 + 새 것 조금(i+1)".
- **단어 기억 강도**: 듀오링고는 half-life regression, 우리는 이미 FSRS(단어별) — 그대로 둔다.
- **유형별·실수 유형별 기록**: 어떤 유형(사지선다/빈칸/조각/받아쓰기/뜻 맞추기…)을 잘 틀리는지,
  실수 종류(오타·형태 틀림·방해 조각 선택·어순)를 집계해 출제 비중과 재출제에 쓴다.

## 1. 예문 라벨 v2 (사전 DB)

### 영어 — `voca_example_meta` 컬럼 추가 (migrations_dict)
| 컬럼 | 타입 | 뜻 |
|---|---|---|
| `cefr` | TINYINT 1~6 | A1=1 … C2=6 |
| `score` | SMALLINT 0~100 | 세부 난이도 점수(위 구간표와 일치) |
| `grammar` | JSON | 문법 태그 리스트 예: `["present_simple","modal","passive","relative_clause","conditional","perfect","gerund_inf","comparative"]` |
| `label_ver` | TINYINT | 2 |

기존 `level`(1~3)은 호환용으로 유지: cefr 1–2→1, 3–4→2, 5–6→3 으로 다시 채운다.

점수 산출(코드, 전량): 내용어별 CEFR(VocaLabel.cefr, 없으면 freq_zipf 로 추정)의 상위 분위수,
희귀어 수, 문장 길이(단어 수), 문법 태그 가중치를 합성. **목표 단어 자체의 난이도는 빼고** 문장 맥락만 본다
(목표 단어는 FSRS가 따로 다룬다). Sonnet 서브에이전트로 표본(구간별 ~50문장) 감사 → 가중치 보정.

### 일본어 — `heyvoca_dict_ja` 에 `voca_example_ja_meta` (ja_only, 스키마 정본 `db/dict_ja/scripts/schema_dict_ja.sql`)
같은 컬럼(`example_id, cefr, score, word_count, words, grammar, label_ver`). 단어 수준은 JLPT(N5≈A1, N4≈A2, N3≈B1, N2≈B2, N1≈C1, 밖≈C2),
문법 태그는 일본어 패턴(て形, ない形, 受身, 使役, 条件 ば/たら, 敬語 등).

## 2. 사용자 수준 (사용자 DB)

`user_skill_profile` (user_id, lang('en'|'ja') PK 쌍)
- `theta` FLOAT — 0~100 척도의 능력치(초기값: 가입 수준/온보딩 레벨 있으면 그걸로, 없으면 20)
- `answers` INT, `updated_at`
- `type_stats` JSON — `{ "<questionType>": {"n":.., "correct":.., "ewma":0.0~1.0} }`
- `error_stats` JSON — `{ "typo":n, "form":n, "distractor":n, "order":n, "wrong_choice":n, "timeout":n }`

갱신: `/study/log` 처리 시(예문이 있는 문제면 그 예문 score 를 b 로, 없으면 단어 CEFR) Elo 갱신.
문제 유형별 난이도 보정치를 b 에 더한다(사지선다 −10 … 직접 입력/뜻 맞추기 +5 등, 백엔드가 상수로).
기존 study_log 로 1회 재생 백필(job, idempotent).

**출제 반영**: `example_select.choose_example` 의 목표 수준 = 사용자 θ 기반으로 `P≈0.8` 이 되는 score
(작물 단계는 보조). 일본어도 같은 함수 경로.

조회 API: `GET /study/skill-profile?lang=en` → `{ theta, cefr:"A2", answers, type_stats, error_stats }` (화면 노출은 이번엔 필수 아님).

## 3. 새 문제 유형 `sentenceTranslate` (문장 뜻 맞추기)

> 2026-10-25 이름 정정: 처음엔 `sentenceMeaning` 으로 설계했으나, 이슈 #15(1290295)가 같은 이름으로 4지선다 **'문장 뜻 고르기'**(프론트 로컬 조립, tier 3)를 먼저 냈다. 이 블록 나열 유형은 `sentenceTranslate`(tier 4)로 바꿨고, `sentenceMeaning` 은 4지선다 그대로다. 오답 FSRS 면제는 `sentenceTranslate` 에만, θ/type_stats 집계는 두 유형 모두(θ b 보정: sentenceMeaning −2, sentenceTranslate +5).

외국어 예문을 보고(듣기 버튼 포함) **한국어 블록을 눌러 나열**한다. 듀오링고 번역 블록과 같은 UI.

payload (기존 문제 payload 와 같은 위치에 실린다):
```json
{
  "type": "sentenceTranslate",
  "lang": "en",                      // 'en' | 'ja'
  "sentence": "I usually eat breakfast at seven.",
  "sentence_html": "I usually eat <b>breakfast</b> at seven.",   // 목표 단어 강조(있으면)
  "example_hash": "...",
  "tiles": [{"id":"t0","text":"나는"},{"id":"t1","text":"보통"}, ...],   // 정답 조각 + 방해 조각, 섞여서 옴
  "accepted": [["나는","보통","7시에","아침을","먹는다"], [...]],          // 정답으로 인정할 텍스트 순서들
  "translation": "나는 보통 7시에 아침을 먹는다.",                        // 오답 시 보여줄 정답 문장
  "cefr": 2, "score": 28
}
```
- 채점(프론트): 고른 조각의 text 배열이 `accepted` 중 하나와 같으면 정답(문장부호·공백 무시).
- 백엔드 생성 규칙: 한국어 번역을 어절 단위로 자름(문장부호 제거), 정답 어절 8개 이하인 예문만,
  방해 조각 2~4개는 비슷한 수준의 다른 예문 번역에서 가져오되 정답 어절과 같은 글자·같은 어간이면 제외.
  `accepted` 에는 원래 순서 + 동사(마지막 어절) 앞의 조사 붙은 성분끼리만 자리 바꾼 순서(최대 6개).
- 난이도 사다리: 기존 1~5 사다리에 넣는다(조각 배열 계열과 같은 칸 또는 바로 위 — 백엔드가 기존 구조에 맞춰 결정 후 이 문서에 기록).
- 새 씨앗 심기: 6단계 중 빈칸 입력 다음, 문장 만들기 앞에 끼워 7단계로. 예문 없는 단어는 기존처럼 건너뜀.
- 자유 설정 테스트: 문제 유형 칩에 '문장 뜻 맞추기' 추가.
- 로그: `/study/log` 에 `question_type='sentenceTranslate'`, `example_hash`, 실수 유형(`error_type`, 선택값) 전달.

## 4. 홈 · 학습 진입 개편 (프론트, 사용자 승인 2026-10-25)

- 홈 메인 버튼 **1개: '농사 시작'** → 바텀시트 "학습 고르기".
- **오늘 할 일 카드**: 줄만 남긴다. 카드 아래 넓은 '새 씨앗 심기' 버튼, 줄 우측 '심기'·'살리기' 버튼 **모두 제거**.
- 바텀시트 항목(위→아래), 각 항목 = 기존 작물·아이템 그림 + 제목 + 짧은 한 줄(숫자 위주, 과한 설명 금지):
  1. **썩은 단어 살리기** — 썩은 단어가 있을 때만 최상단에 나타남(기존 살리기 동작 그대로).
  2. **농장 돌보기** — 기존 메인 CTA 동작(복습 자동 추천 문제). "돌볼 단어 N개".
  3. **밭 산책하기** — 농장 돌보기와 같은 추천 단어로 **집중 반복 듣기(StudyMain)** 진행.
  4. **새 씨앗 심기** — 기존 plant 세션. "새 단어 N개". 씨앗 0개면 서점 안내.
  5. **단어장 골라 학습** — 단어장 선택 → 집중 반복 학습 / 자유 설정 테스트 (기존 VocabularySheetNewFullSheet·BookStudyType 흐름 재사용).
- 해당 없는 상태(돌볼 단어 0 등)는 흐리게 + 숫자 0, 누르면 기존 안내 시트.
- 디자인: Phosphor/토큰만, 이모지 금지, 기존 바텀시트·버튼 규격 재사용.

## 5. 백엔드 구현 기록 (2026-10-25, §1~3 확정값 — 프론트는 이 절을 기준으로)

### 5-1. 예문 라벨 v2
- 규칙 단일 소스 `heyvoca_back/app/services/example_label.py`, 전량 계산 job `heyvoca_back/jobs/label_examples_v2.py`(멱등, `--only-missing` 은 v2 미적용 행만).
- 영어 `voca_example_meta` 에 `sentence_hash`(인덱스, `/study/log` example_hash → 난이도 조회용) 도 추가. 리비전 `5d3a3c6fd998`(migrations_dict).
- 일본어 `voca_example_ja_meta`(ja_only) — 계약 컬럼 + `sentence_hash`, `rare_count`. 정본 `db/dict_ja/scripts/schema_dict_ja.sql`.
- 점수 = 내용어 등급 80% 분위수 `(r−1)×15` + 최고 등급 초과분 `×3` + C1 이상 내용어 `×4`(≤12) + 기준 길이(en 6단어 / ja 8토큰) 초과 `×1.5`(≤18) + 문법 가중치 합(≤20). 목표 단어 구간·기능어·고유명사 제외.
  - 영어 단어 등급: `voca_label.cefr`(없으면 freq_zipf 추정). 일본어: JLPT, JLPT 밖은 JMdict common=C1 / 그 외 C2. 일본어는 형태소 분석기가 없어 활용 어간→사전형 후보(い·あ·え단, 음편)로 매칭하고 가장 쉬운 표제어를 쓴다.
- 분포(로컬 전량): en A1 32.7 / A2 26.3 / B1 27.7 / B2 11.6 / C1 1.6 / C2 0.2 %, ja A1 20.1 / A2 19.1 / B1 21.1 / B2 29.3 / C1 7.7 / C2 2.6 %.
- 발행: en·ja 모두 `20261024-1`(dict_manage.publish). 호환용 `level` 은 cefr 로 다시 채웠다(1–2→1, 3–4→2, 5–6→3).

### 5-2. 사용자 수준
- 규칙 단일 소스 `heyvoca_back/app/services/skill_level.py`. 사용자 DB 리비전 `f47bf9e66d5c`(`user_skill_profile`, FK 없음, 탈퇴 시 삭제).
- `P = σ((θ − b)/10)`, `θ += K·(정답 − P)`, K = 6(답 30개 미만) / 3(200개 미만) / 1.5. 초기 θ = User.level_id 1→12, 2→25, 3→42, 4→60, 없으면 20.
- b = 예문 score(example_hash 가 v2 라벨에 있으면) → 없으면 단어 등급 대표값(A1 10, A2 27, B1 45, B2 65, C1 82, C2 95 / ja 는 JLPT 환산) + 유형 보정:
  multipleChoice·cardMatch −10, reverseMultipleChoice·multipleChoiceListening·cardMatchListening −6, fillInTheBlank −2,
  sentenceArrangePartial 0, sentenceArrange +3, listenArrange·fillInTheBlankTyping·sentenceTranslate +5. 그 밖의 유형은 θ 불변(집계만), 글자 학습(script*)·진단은 아예 제외.
- 예문 선택 목표 score = `θ − 10·ln4 − 유형 보정`(P≈0.8) + 작물 단계 보조(unlearned·seed −10, sprout −5, leaf 0, carrot +5). 빈칸·뜻 맞추기 일반 경로에만 적용(plant·문장 만들기는 기존 '쉬운 예문 우선' 유지). en·ja 동일 경로.
- `/study/log` 추가 입력: `error_type`(선택, `typo|form|distractor|order|wrong_choice|timeout`). 안 보내면 `typo=true` → typo, 보기 고르기형 오답 → wrong_choice.
  응답 `data.skill = {theta_before, theta, b}`(갱신 안 되면 null).
- `GET /study/skill-profile?lang=en|ja` → `{lang, theta, cefr, answers, type_stats, error_stats}`. 프로필이 없으면 초기값(행은 만들지 않음).
- 백필: `heyvoca_back/jobs/backfill_skill_profile.py --apply`(멱등 — 매번 처음부터 재생해 덮어씀).

### 5-3. sentenceTranslate
- 생성 `heyvoca_back/app/services/sentence_meaning.py`. payload 는 §3 모양 그대로 `question_payload` 에 평평하게 실린다(`type:'sentenceTranslate'`). 추가 키: 일본어는 사전 후리가나가 있으면 `reading_tokens`(examples 의 것과 같은 모양). `sentence_html` 은 강조 없으면 null.
- 방해 조각 원천: 같은 응답의 다른 단어 예문 번역(score ±15 우선), 모자라면 사전에서 비슷한 수준 번역을 더 가져온다. 단어 자신의 다른 예문은 쓰지 않는다.
- 난이도 사다리: **tier 3**(fillInTheBlank·sentenceArrangePartial 과 같은 칸) — 조각이 한국어라 '읽고 이해'에 해당해 영어 조립(tier 4)보다 아래. 가중치(빠른 복습 경로) 6.
- 고를 예문이 없으면 그 문항은 `multipleChoice` 로 바뀌어 나간다(빈 payload 로 나가지 않음).
- **최소 출제 보장(2026-10-25 후속)**: 실제 사다리는 tier 4(leaf 이상)라 씨앗·새싹 위주 사용자에겐 0건이었다.
  `composer._apply_translate_quota` — 농장 돌보기(full_recommend) 세션당 2(8문항 미만 1), 자유 설정 테스트에서 칩 선택 시
  `max(1~2, 문항수 // 고른 유형 수)`. 단독 문제(사지선다류·빈칸)만 바꾸고 카드 맞추기·문장 만들기는 안 건드린다. 농장 경로에서 바꾼 문항은
  tier_target/tier_shown=null(tier 진행 영향 없음). 새 씨앗 심기는 프론트(`TakeTest.jsx` PLANT_TRANSLATE_MIN=2)가 payload 있는 단어 2개를 보장.
- **긴 번역 완화**: 9~12어절은 앞부분을 `prefix`(문자열)로 미리 채워 보내고 `tiles`·`accepted` 는 뒤 8어절만. 13어절 이상은 제외
  (쓸 수 있는 예문: en 76→94%, ja 94→99%).
- **오답은 FSRS 면제**(코디네이터 결정 2026-10-25): `/study/log` 가 `question_type='sentenceTranslate'`·`was_correct=false` 면 FSRS·mastery·농장/콤보 훅을 건너뛰고(응답 `rating=null`, fsrs 는 이전 상태 그대로, combo/farm/streak null) 로그·유형 집계·θ 에만 반영한다. 정답은 다른 유형과 똑같이 FSRS 를 탄다.
- 새 씨앗 심기(mode=plant): `question_payloads.sentenceTranslate` 키 추가(없으면 키 생략).
- 자유 설정 테스트: `question_types=sentenceTranslate` 허용(RECOMMENDABLE_QUESTION_TYPES).

### 5-4. 배포 순서 (서버)
1. 코드 배포(엔트리포인트가 `migrations_dict` 5d3a3c6fd998·사용자 f47bf9e66d5c 를 올린다).
2. 사전 적용 — dev 확인 후 prod:
   `docker exec heyvoca_back_<env> python3 -c "from app import create_app; app=create_app(); ctx=app.app_context(); ctx.push(); from app.services import dict_manage as dm; print(dm.apply_version('20261024-1', publisher='me@<env>')); print(dm.apply_version('20261024-1', publisher='me@<env>', lang='ja'))"`
3. 백필: `docker exec heyvoca_back_<env> python3 jobs/backfill_skill_profile.py --apply`
