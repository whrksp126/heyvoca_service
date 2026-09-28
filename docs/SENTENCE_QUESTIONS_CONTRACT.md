# 출제형 문제 1단계 계약 — 문장 조립·타이핑 4종

작성 2026-09-28 · 백엔드 구현 완료(`heyvoca_back`) · 프론트 구현 대기(`heyvoca_front`)

## 배경

기존 문제 유형(사지선다·카드매칭·빈칸 고르기)에 이어, 문장을 직접 조립하거나 타이핑하는
4종을 추가한다. 데이터 정본은 사전 테이블 `voca_example_puzzle`(dict schema)이고,
**서버가 조각을 섞고 방해 조각을 샘플링하고 prefix/suffix를 계산해서** 완성된 payload를
내려준다 — 프론트는 이 payload를 그대로 렌더링/채점하면 된다(직접 조립할 필요 없음).

## 1. 새 question_type 4개

단일 소스: `heyvoca_back/app/constants/question_types.py`

| id | 난이도(tier) | 설명 |
|---|---|---|
| `sentenceArrangePartial` | 3 | 한글 해석을 보고 목표 단어 주변 3~5조각만 조립(앞뒤는 고정 텍스트) |
| `sentenceArrange` | 4 | 한글 해석을 보고 문장 전체(8조각 이하) 또는 목표 단어 중심 최대 7조각을 조립 |
| `listenArrange` | 4 | 영어 음성을 듣고 조립. **원문 어순만 정답**(대체 어순 불허) |
| `fillInTheBlankTyping` | 5 | 기존 `fillInTheBlank`와 같은 예문, 사지선다 대신 타이핑으로 정답 입력 |

이 4종은 **puzzle 데이터가 있는 단어에서만 출제된다.** 데이터가 없으면 추천 알고리즘이
자동으로 더 낮은 tier의 다른 유형으로 대체한다(3절 참고) — 프론트가 이 사실을 신경 쓸
필요는 없다(항상 출제 가능한 유형만 내려온다).

사용자가 설정 시트에서 유형을 직접 고르는 테스트(예: "조립 문제만")에도 이 4개를 선택지에
추가해도 된다 — `RECOMMENDABLE_QUESTION_TYPES`, `/study/log`의 `ALLOWED_QUESTION_TYPES`
화이트리스트 둘 다 이미 포함. **직접 고른 유형만 나오게 하려면 `/study/recommend`
요청에 `question_types` 파라미터를 반드시 실어야 한다(7절)** — 예전에는 이 파라미터가
없어서 서버가 우연히 그 유형을 배정한 단어만 새 유형으로 나오고 나머지는 사지선다로
대체됐다.

## 2. `/study/recommend` 응답 — 문항 필드 추가

기존 필드(`user_voca_id`, `word`, `meanings`, `examples`, `fsrs`, `priority_bucket`,
`suggested_question_type`, `reason` 등)는 그대로다. 추가된 필드:

```jsonc
{
  "tier_target": 3,        // 이 단어의 "정해진 난이도"(1~5). 설정 시트로 유형을 직접
                            // 고른 테스트(target_states 지정 등)에서는 항상 null.
  "tier_shown": 3,         // 실제로 이 문제에 배정된 난이도(1~5). tier_target보다 쉬울 수
                            // 있음(30% 확률로 더 쉬운 tier를 섞어 보여줌). 역시 null 가능.
  "question_payload": {}   // suggested_question_type이 새 4종 중 하나일 때만 채워짐(아래 3절).
                            // 그 외 유형이거나 puzzle이 없으면 {} (빈 객체).
}
```

**`/study/log`로 결과를 보낼 때 `tier_target`/`tier_shown`을 그대로 되돌려 보내야 한다**
(4절) — 다음 세션에서 이 단어의 난이도를 얼마나 올릴지 판단하는 유일한 입력이다.

## 3. `question_payload` 모양

### 3-1. 조립형 (`sentenceArrangePartial` / `sentenceArrange` / `listenArrange`)

```jsonc
{
  "arrange": {
    "bank":       ["for", "check", "book", "cancel", "in", "to"],   // 섞인 조각(정답 조각 + 방해 조각)
    "prefix":     "i need",              // 조립 영역 앞에 고정 표시할 텍스트("" 이면 없음)
    "suffix":     "my flight online",    // 조립 영역 뒤에 고정 표시할 텍스트("" 이면 없음)
    "accepted":   [["to", "check", "in", "for"]],  // 정답으로 인정하는 조각 순서(들).
                                                     // sentenceArrangePartial/sentenceArrange는
                                                     // 원문 어순 + (매핑 가능한) 대체 어순이 여러 개
                                                     // 나올 수 있다. listenArrange는 항상 원소 1개.
    "answer_text": "I need to <strong class=\"target-word\">check in</strong> for my flight online.",
                                          // 문장 전체 원문(정답 공개/하이라이트 표시용, 강조 태그 포함)
    "ko": "비행기 온라인 체크인을 해야 해요.",  // 한국어 해석(조립 프롬프트).
                                              // listenArrange는 이 값 대신 TTS로 answer_text를
                                              // 읽어주는 쪽을 쓸 것(아래 3-2 참고).
    "target_tokens_count": 2             // 목표 단어가 차지하는 조각 수(참고용, 채점에 필수 아님)
  }
}
```

**채점(프론트 담당):**
사용자가 조립 영역에 배열한 조각 시퀀스가 `accepted` 안의 어떤 리스트와도
정확히 일치하면 정답. `listenArrange`는 `accepted`가 항상 원문 어순 1개뿐이라 자연히
"원문 어순만 정답"이 강제된다.

**표시 규칙:**
- 최종 문장을 복원하려면 `prefix + " " + (사용자가 배열한 조각들 join) + " " + suffix`
  순서로 이어붙이면 된다(둘 다 없으면 공백 생략).
- 조각의 대소문자는 서버가 이미 "문장 중간 표기"로 정규화해서 내려준다(모두 소문자,
  고유명사·`I`만 대문자 유지) — 프론트가 별도로 casing을 만질 필요 없음.
- 조립 구간은 항상 목표 단어를 중심에 두고 `prefix`/`suffix` **양쪽 다** 고정 텍스트가
  될 수 있다(2026-09 2차 보완). `sentenceArrangePartial`은 3~5조각, `sentenceArrange`/
  `listenArrange`는 8조각 이하면 전체, 넘으면 7조각으로 상한이 **항상** 지켜진다 —
  목표 단어가 문장 맨 앞/뒤에 있어도 마찬가지다(한쪽 fix가 비고 반대쪽이 늘어나는 게
  아니라 목표 단어 위치에 따라 자연스럽게 앞/뒤 어느 한쪽만 비거나 둘 다 채워진다).
- `listenArrange`는 `ko` 대신 오디오를 들려줘야 한다. 오디오 소스는 `answer_text`를
  기존 TTS 파이프라인(`GET /tts/resolve?text=...&language=en`, `heyvoca_back` 기존
  엔드포인트)에 그대로 넘기면 된다 — 이 계약에서 새 TTS API를 만들지 않았다.
  (`answer_text`에는 `<strong>` 태그가 남아 있으니 TTS 요청 전에 태그를 벗겨낼 것.)

### 3-2. 타이핑 (`fillInTheBlankTyping`)

```jsonc
{
  "typing": {
    "blank_text":    "I need to ____ for my flight online.",  // 빈칸 표시용 평문(태그 제거됨)
    "answer_text":   "check in",     // 정답(활용형, blankFill) — 채점 기준
    "base_form":     "check in",     // 기본형(item.word) — "형태 안내용"으로만 노출, 정답 아님
    "ko":            "비행기 온라인 <strong class=\"target-word\">체크인</strong>을 해야 해요.",
    "blocked_typos": ["chick", "checkin"]   // 정답과 편집거리 1(치환·인접 전치·삽입·삭제)이면서
                                             // 사전에 실제로 존재하는 다른 단어들
  }
}
```

**채점(프론트 담당):**
1. 입력값을 정규화(trim + lowercase)해 `answer_text`와 완전히 같으면 정답.
2. 다르면 정답과 편집거리 1인지 확인(치환·인접 전치·삽입·삭제 중 하나) — 같으면 "오타"
   후보. 이때 **입력값이 `blocked_typos`에 있으면 오답 처리**, 없으면 오타로 보고
   정답 처리하되 `/study/log`에 `"typo": true`를 실어 보낸다(4절).
3. 기본형(`base_form`)을 그대로 입력한 경우는 오답이다(활용형과 다르면 정답과
   편집거리가 1을 넘는 게 보통이라 자연히 오답 처리되지만, `base_form == answer_text`인
   경우도 있으니 별도 분기는 필요 없다 — 같으면 어차피 정답).
4. `blocked_typos`는 영문 단일 토큰 답에만 채워진다. `answer_text`에 공백이 있는
   구동사/숙어(`check in` 등)는 항상 `[]` — 이런 경우 프론트는 오타 허용 로직을
   생략하고 완전 일치만 정답으로 봐도 된다(서버가 이미 그렇게 판단하고 빈 배열을 줌).

## 4. `/study/log` 추가 필드

```jsonc
POST /study/log
{
  "session_id": "...",
  "user_voca_id": 5990,
  "question_type": "sentenceArrange",
  "was_correct": true,
  "time_taken_ms": 8200,

  "tier_target": 3,   // 이 문항의 /study/recommend 응답에서 받은 값을 그대로 되돌려준다.
  "tier_shown":  3,   // 위와 동일. 설정 시트 테스트 등 tier가 없던 문항이면 둘 다 생략(null).
  "typo": false       // fillInTheBlankTyping에서 오타 허용으로 정답 처리했으면 true.
                       // 그 외 유형은 항상 생략하거나 false.
}
```

- `tier_target`/`tier_shown`은 1~5 범위를 벗어나거나 정수가 아니면 서버가 조용히
  무시(null 저장)한다 — 필수 아님, 없어도 요청은 성공한다.
- `typo: true`면 서버가 FSRS 자동 평가를 **Hard(2)로 고정**한다(정답이어도 Good/Easy로
  올라가지 않음 — 형태를 완전히 맞히지 못했기 때문).
- 조립/타이핑류는 사지선다보다 오래 걸리는 게 정상이라 "느려서 Hard로 깎이는" 것을
  막기 위해 서버가 유형별 기대 시간에 배수를 곱한다(`sentenceArrangePartial×1.8`,
  `sentenceArrange×2.5`, `listenArrange×3.0`, `fillInTheBlankTyping×2.0`) — 프론트는
  신경 쓸 필요 없이 `time_taken_ms`를 있는 그대로 보내면 된다.

## 5. 난이도(tier) 오르내리기 규칙 — 자동 출제(AI 추천) 전용

설정 시트로 유형을 직접 고른 테스트에는 적용되지 않는다(그 경로는 기존처럼 프론트가
고른 유형 그대로 나간다. `tier_target`/`tier_shown`도 항상 null).

**난이도표** (`app/constants/question_types.py` `QUESTION_TYPE_TIER`):

| tier | 유형 |
|---|---|
| 1 | `multipleChoice`, `cardMatch` |
| 2 | `reverseMultipleChoice`, `multipleChoiceListening`, `cardMatchListening` |
| 3 | `fillInTheBlank`, `sentenceArrangePartial` |
| 4 | `sentenceArrange`, `listenArrange` |
| 5 | `fillInTheBlankTyping` |

**작물 단계가 여는 최고 tier** (`CROP_STAGE_MAX_TIER`): unlearned=1, seed=2, sprout=3,
leaf=4, carrot=5.

**단어별 "정해진 난이도"(tier_target) 계산** — 그 단어의 마지막 tier 상태 기준:

- 기록이 없으면(처음 보는 단어) `max(1, 최고tier - 1)`.
- 마지막 결과가 정답이고 `tier_shown == tier_target`이었으면 `+1`.
- 마지막 결과가 정답이지만 그때 더 쉬운 tier를 보여줬었으면(`tier_shown < tier_target`) 유지.
- 마지막 결과가 오답이면 `-1`.
- `[1, 최고tier]`로 자른다(작물 단계가 오르내리면 여기서 같이 재보정됨).

**정본은 `user_voca.tier_target`/`tier_shown`/`tier_correct` 컬럼이다**(2026-09 2차
보완). `/study/log`가 매번 이 세 컬럼을 갱신하고, `/study/recommend`는 매번 이 컬럼을
읽어 계산한다 — 로그 조회 윈도우가 아니다. (예전에는 최근 7일 `UserStudyLog` 윈도우로
근사했는데, FSRS 간격상 상급 단어(carrot 등)는 복습 주기가 7일을 훌쩍 넘어가서 매번
"처음 보는 단어"로 리셋돼 tier가 사실상 오르지 않는 버그가 있었다. `UserStudyLog`의
`tier_target`/`tier_shown` 컬럼은 여전히 존재하지만 이제 기록/감사용일 뿐, 다음
tier 계산에는 쓰이지 않는다.)

**출제 시 tier 선택**: 70%는 `tier_target` 그대로, 30%는 그보다 쉬운 tier에서 균등
무작위(`tier_target == 1`이면 항상 `tier_target`). 그 tier 안에서 유형은 약점 유형을
우선하고, 아니면 무작위(같은 세션에서 이미 나온 유형은 가능하면 피함 — 기존 avoid 로직
유지). 그 단어가 그 tier의 어떤 유형도 못 쓰면(puzzle 없음 등) 가장 가까운 낮은 tier로
내려가며 재시도한다.

## 6. 세션 안 재출제 — `GET /study/requeue-easier`

오답 후 "더 쉬운 문제로 다시" 재출제는 **로컬에서 만들지 말고 이 엔드포인트를 호출**하라
— 조립/타이핑류는 서버가 조각을 새로 섞고 payload를 다시 조립해야 하기 때문에 프론트가
로컬 데이터만으로는 만들 수 없다.

```
GET /study/requeue-easier?user_voca_id=5990&from_tier=3&exclude_types=multipleChoice,fillInTheBlank
```

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `user_voca_id` | O | 재출제할 단어 |
| `from_tier` | X | 방금 실패한 문제의 tier. 없으면 그 단어의 `최고tier - 1`에서 시작 |
| `exclude_types` | X | 콤마 구분 — 이번 세션에서 이미 시도해 실패한 유형(같은 유형 반복 방지) |

응답은 `/study/recommend`의 `items[]` 원소 하나와 **완전히 같은 모양**(`question_payload`
포함, `tier_target`은 항상 `null` — 재출제는 자동 tier 진행에 영향을 주지 않는 1회성
시도). `code: 404`면 재출제할 문제가 없다는 뜻(그 tier 이하에 이 단어가 쓸 수 있는
유형이 하나도 없음) — 프론트는 이 경우 다음 단어로 넘어가면 된다.

이 호출로 얻은 문제를 다시 틀리거나 맞혀도 `/study/log`에는 원래 문항과 동일하게
`tier_target`/`tier_shown`을 실어 보내면 된다(`requeue-easier` 응답의 `tier_shown` 값 사용,
`tier_target`은 `null`로 보내거나 생략).

## 7. 설정 시트 유형 직접 선택 — `question_types` 파라미터

**설정 시트에서 유형을 하나 이상 직접 골라 시작하는 테스트는 반드시 이 파라미터를
같이 보내야 한다.** 안 보내면(2026-09 이전 동작) 서버가 tier/가중치 로직으로 유형을
"제안"할 뿐이라 사용자가 고른 유형이 우연히 배정된 단어만 그 유형으로 나오고 나머지는
사지선다 등으로 대체돼 버린다 — "문장 만들기만 골랐는데 사지선다가 섞여 나온다"는
문제가 이것이었다.

```
GET /study/recommend?count=20&question_types=sentenceArrange,listenArrange
```

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `question_types` | X | 콤마 구분 question_type id 목록. 지정되면 **tier 로직을 완전히 건너뛴다.** |

동작:

1. 각 단어에 대해 `question_types`로 지정된 유형 중 **그 단어가 실제로 쓸 수 있는
   것만** 후보로 좁힌다(`_item_can_use_question_type` — 예: 조립형은 puzzle 데이터가
   있어야, `fillInTheBlank`류는 강조 태그가 있어야 함).
2. 후보가 하나 이상이면: 약점 유형 우선 → 없으면 후보 안에서 기존
   `_QUESTION_TYPE_WEIGHTS` 가중치 랜덤(여러 유형을 골랐을 때 비율 배정) → 같은
   세션에서 이미 나온 유형은 가능하면 회피(기존 avoid 로직 재사용).
3. **후보가 하나도 없으면**(그 단어가 지정된 유형을 하나도 못 씀 — 예: "조립 문제만"을
   골랐는데 그 단어에 puzzle 데이터가 없음) **완전 폴백**: 기존 전체 유형 가중치
   배정(`_assign_suggested_question_type`)으로 넘어간다. 즉 "요청한 유형을 쓸 수
   있는 단어는 예외 없이 전부 그 유형으로 나오고, 못 쓰는 단어만 다른 유형으로
   대체된다" — 예전처럼 "쓸 수 있는데도 우연히 다른 유형이 나오는" 일은 없다.
4. 이 경로에서는 `tier_target`/`tier_shown`이 **항상 `null`** — `UserVoca`의 tier
   진행 상태를 전혀 읽지도 쓰지도 않는다(5절의 자동 tier 오르내리기와 완전히 분리).
5. `suggested_question_type`이 새 4종 중 하나로 배정되면 `question_payload`도
   평소와 동일하게 채워진다(2절·3절과 동일 로직 재사용 — 이 파라미터 전용 처리 없음).
6. 모르는 id는 조용히 무시하고, 남는 게 하나도 없으면 파라미터를 안 준 것과 동일하게
   취급한다(기존 tier/가중치 동작 그대로).
7. `selection=random`에서도 동일하게 동작한다(랜덤으로 뽑힌 단어들도 같은 규칙으로
   유형이 배정됨).

## 8. 알려진 제약/트레이드오프

- **en 전용.** 이 4종은 영어 학습 모드에서만 나온다(`voca_example_puzzle`이 영한 사전
  전용, 일한 사전에는 없음). `ja` 모드 아이템은 `example_puzzles`가 항상 비어 있어
  자동으로 후보에서 빠진다 — 프론트가 language로 분기할 필요 없음.
- **puzzle 매칭은 문장 텍스트 해시 기반.** 사용자가 단어장 예문을 손으로 고친 경우
  puzzle을 못 찾을 수 있다(정상 동작 — 해당 예문에 조립형 4종이 안 나올 뿐).
- **`alt_orders` 매핑 규칙.** 조립 영역이 `prefix`/`suffix`로 잘렸을 때(문장이 길어
  일부만 조립하는 경우), 데이터의 `alt_orders`(문장 전체 재배열)는 그 `prefix`·`suffix`
  구간이 원문과 똑같이 유지되는 경우에만 윈도우에 매핑해 `accepted`에 추가한다.
  그렇지 않은 alt_order는 이 문제에서는 쓰이지 않는다(정답을 놓치는 게 아니라, 그
  변형이 애초에 이 윈도우 구성과 맞지 않는 것).
- **`blocked_typos`는 프로세스 메모리 캐시.** 사전 발행 직후 즉시 반영되지 않을 수
  있다(컨테이너 재시작 전까지, `app/services/typing_guard.py`). 실사용 빈도상 문제
  없다고 판단해 자동 무효화 훅은 만들지 않았다.
- **`sentenceArrangePartial`/`sentenceArrange`의 `accepted`가 여러 개일 수 있다** —
  반드시 배열로 다루고 "포함되는지"로 채점할 것(첫 원소만 보지 말 것).

## 9. 관련 파일

| 파일 | 역할 |
|---|---|
| `app/constants/question_types.py` | 유형/tier 단일 소스 |
| `app/models/models.py::VocaExamplePuzzle` | 사전 테이블(dict schema) |
| `app/models/models.py::UserVoca.tier_target/tier_shown/tier_correct` | 단어별 tier 진행 상태 정본(사용자 DB) |
| `app/services/sentence_puzzle.py` | 정규화/해시, puzzle 배치 조회, 조립 payload 빌더(target 중심 윈도우) |
| `app/services/fill_blank_typing.py` | 타이핑 payload 빌더 |
| `app/services/typing_guard.py` | `blocked_typos` 계산(편집거리 1) |
| `app/services/recommend/pool.py` | `CandidateItem.example_puzzles` 배치 로딩 |
| `app/services/recommend/composer.py` | tier 배정(`_assign_tiered_question_type`), `question_types` 배정(`_assign_restricted_question_type`) |
| `app/routes/study.py` | `/study/recommend`, `/study/log`, `/study/requeue-easier` |
| `app/services/fsrs/ratings.py` | `typo`/`question_type` 보정 |
| `scripts/import_example_puzzles.py`(top-level `heyvoca_service/scripts/`) | puzzle 데이터 upsert(dry-run 기본) |
| `tests/test_sentence_puzzle_payload.py`, `tests/test_tier_difficulty.py` | 순수 함수 테스트 |
