# 매번 새 문장 — 예문 확장·선택 계약 (2026-09-30)

목표: 빈칸·직접 입력·문장 만들기·받아쓰기 문제에 **최근 본 문장이 다시 나오지 않고**, **사용자 수준에 맞는 문장**이 나오게 한다(듀오링고식). 실시간 AI 생성은 하지 않는다 — 예문은 사전에 대량으로 미리 만들어 둔다(서점 단어 8,167개 × 새 예문 6개, 초급·중급·상급 2개씩).

범위: 영어(`dict_lang == 'en'`) 만. 일본어는 기존 동작 그대로.

## 1. 데이터

### 사전 DB (`migrations_dict`)
새 테이블 `voca_example_meta` — `voca_example_puzzle` 처럼 FK 없는 파생 테이블.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `example_id` | INT PK (autoincrement 없음) | voca_example.id |
| `level` | TINYINT NOT NULL | 1 초급 / 2 중급 / 3 상급 |
| `word_count` | SMALLINT NOT NULL | 태그 제거 영어 평문 단어 수 |
| `rare_count` | SMALLINT NOT NULL | 목표 단어를 뺀 내용어 중 빈도 낮은(zipf < 3.5 또는 미상) 단어 수 |
| `words` | JSON NOT NULL | 목표 단어 구간과 기능어를 뺀 내용어의 원형(소문자) 리스트 — "아는 단어" 비율 계산용 |
| `source` | VARCHAR(32) NOT NULL | `dict`(기존) / `gen20260930`(이번 생성) |

- 생성분은 생성 시 정한 수준을 그대로 `level` 에 넣는다.
- 기존 예문은 스크립트가 계산: `word_count <= 8 and rare_count == 0 → 1`, `word_count <= 13 and rare_count <= 1 → 2`, 그 외 `3`.
- 채우는 스크립트: `heyvoca_back/scripts/build_example_meta.py` (전체 영어 예문 대상, 멱등 upsert, `--dry-run` 기본). 원형화는 이미 쓰는 spaCy(`/search/word-info` 의 원형 폴백)를 재사용, 빈도는 `voca_label.freq_zipf`(단어 → voca 매칭) 우선.

### 사용자 DB (`migrations`)
`user_study_log.example_hash VARCHAR(64) NULL` — 그 문제에 쓰인 예문의 `sentence_hash`(app/services/sentence_puzzle.py). 인덱스 `(user_id, user_voca_id, created_at)` 로 최근 기록 조회가 빠르게.

## 2. 후보 예문 풀 (`app/services/recommend/pool.py`)

단어 하나의 후보 예문 = **사용자 복사본(UserVocaBookMap/UserVoca.voca_examples) ∪ 사전 예문(voca_example_map → voca_example, 해당 voca_id)**, `sentence_hash` 로 중복 제거(사용자 복사본 우선 — 사용자가 고친 문장 보존).

- 사전 예문은 `{origin: exam_en, meaning: exam_ko}` 로 변환, 영어에 target 태그가 있고 한국어가 비어 있지 않은 것만.
- 풀 전체 voca_id 를 모아 **배치 쿼리 1~2번**(예문+meta, 퍼즐은 기존 `load_puzzles_by_hashes`). N+1 금지.
- 각 후보 예문에 `hash`, `puzzle`, `meta(level, words)`, `source` 를 붙인다.
- 응답의 `examples`(단어 상세 등에서 쓰는 목록)는 **기존대로 사용자 복사본만** — 응답 크기 유지.

최근 기록: 풀의 user_voca_id 들에 대해 최근 30일 `user_study_log.example_hash` 를 한 번에 조회 → 단어별 `{hash: 마지막으로 본 시각}`.

아는 단어 집합: 요청당 1회, 이 사용자의 영어 UserVoca 중 한 번 이상 학습한(FSRS reps ≥ 1) 단어 원형(소문자) 집합. 기능어·아주 흔한 단어(zipf ≥ 5.5)는 meta.words 에 애초에 안 들어가므로 따로 처리할 필요 없음.

## 3. 선택 (`app/services/example_select.py` 신규, 단일 소스)

`choose_example(item, question_type, ctx) -> example | None`

1. 자격: `fillInTheBlank`·`fillInTheBlankTyping` = 영어 target 태그 + 한국어 있음. `sentenceArrangePartial`·`sentenceArrange`·`listenArrange` = `puzzle_usable`.
2. 점수(낮을수록 우선):
   - **최근성**: 이번 세션에서 이미 쓴 hash(같은 응답 안에서 다른 문제에 쓴 것 포함) = 제외. 최근 30일에 본 문장 = 큰 벌점(오래전일수록 작게). 한 번도 안 본 문장 최우선. 전부 봤으면 가장 오래전에 본 것.
   - **수준 적합**: 목표 수준 = 작물 단계 기준 — new/plant·seed → 1, sprout → 1~2, leaf → 2, carrot 이상 → 3. `User.level_id`(1 초등~4 대학 이상)가 1이면 목표를 한 단계 낮추고(최소 1), 4면 한 단계 올린다(최대 3). |level − 목표| 에 비례한 벌점. meta 없는(사용자 직접 입력) 예문은 목표 수준과 같다고 본다.
   - **아는 단어**: `meta.words` 중 아는 단어 비율이 높을수록 가점(듀오링고 "아는 단어 + 새 단어 1개"). words 가 비면 중립.
   - 동점은 무작위.
3. 한 단어가 한 응답에서 여러 문제 유형(plant `question_payloads`)으로 나가면 **유형마다 다른 문장**을 고른다.

기존 세 규칙(프론트 랜덤, typing 첫 예문, arrange 첫 usable 퍼즐)을 이 함수 호출로 교체한다: `fill_blank_typing.build_typing_payload`, `study._build_sentence_question_payload`, 그리고 새로 `fillInTheBlank` 도 서버 payload 를 만든다.

## 4. API

`/study/recommend`·`/study/requeue-easier` 의 `question_payload`(및 plant `question_payloads`)에:

- 모든 문장 유형 payload 에 `example_hash` 추가.
- `fillInTheBlank` payload 신설: `{ example: { origin, meaning }, example_hash }` — suggested 유형이 fillInTheBlank 일 때와 plant `question_payloads.fillInTheBlank`.

`/study/log` 요청에 `example_hash`(선택, 64자 hex 검증) 추가 → `user_study_log.example_hash` 저장. 없으면 NULL(구버전 앱 호환).

## 5. 프론트

- `fillInTheBlank` 플러그인: `word.questionPayload?.example`(또는 plant 단계 payload)이 있으면 그 예문으로 문제를 만들고, 없으면 기존 랜덤 선택 그대로(사용자 설정 테스트·오프라인 호환).
- 문제 객체에 `exampleHash` 를 실어 두고, `/study/log` 를 보내는 세 곳(Main.jsx)에서 `example_hash` 로 함께 보낸다. plant 세션 종료 일괄 로그(TakeTest.jsx)는 그 단어의 마지막 문장 문제 hash 를 보낸다.
- 오답 재출제(같은 세션)는 기존 동작 유지.

## 6. 데이터 투입 순서

1. `db/sentence-gen/out/*.json` (생성 결과, `[[ ]]` 표기) → `scripts/import_generated_examples.py` 가 `<strong class="target-word">` 로 변환·재검증 후 voca_example + voca_example_map + voca_example_meta(level=위치) 삽입(로컬 dict).
2. 새 예문 조각 데이터(voca_example_puzzle) 생성 — 기존 `db/local-puzzle-work` 절차(Sonnet 워크플로 + verify_code.py).
3. `build_example_meta.py` 로 기존 예문 meta 계산.
4. admin dict_manage 로 발행 → dev → prod 적용.
