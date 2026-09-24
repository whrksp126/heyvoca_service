# 배치 입출력 규격 (한국어화 파이프라인)

`PLAN.md` 파이프라인 4단계(`30_make_batches.py` / `35_apply_batches.py`)에서 만들고 소비하는
배치 파일의 경로·형식·검증·재시도 규칙. 내용(번역·판정 규칙)은 `PROMPT_meaning.md`,
`PROMPT_example.md`를 따르고, 이 문서는 그 두 프롬프트가 공유하는 **파일 스키마**를 정본으로
고정한다. 실제 배치 파일은 `db/dict_ja/.gitignore`에 따라 git 추적 대상이 아니다(원본 재생성 가능).

## 디렉토리 / 파일명

```
db/dict_ja/batches/
├── meaning/           # 뜻 한국어화 (PROMPT_meaning.md)
│   ├── batch_0001.txt
│   ├── batch_0001_out.txt
│   ├── batch_0001_retry1.txt        # 검증 실패분만 재추출 (있을 때만)
│   ├── batch_0001_retry1_out.txt
│   ├── manifest.json                # 배치별 순번→jmdict_id (출력 파싱 시 id 복원)
│   └── ...
├── example/           # 예문 해석 — 변형 A (PROMPT_example.md 변형 A)
│   ├── batch_0001.txt
│   ├── batch_0001_out.txt
│   └── ...
└── example_gen/        # 예문 생성 — 변형 B (PROMPT_example.md 변형 B)
    ├── batch_0001.txt
    ├── batch_0001_out.txt
    └── ...
```

- 배치 파일명은 `batch_NNNN.txt` (4자리, 0 채움, 1부터). 결과는 같은 이름 + `_out.txt`.
- 재시도는 `_retryK`(K=1,2,3)를 파일명에 삽입한다: `batch_NNNN_retryK.txt` /
  `batch_NNNN_retryK_out.txt`.
- 세 하위 디렉토리(`meaning/`, `example/`, `example_gen/`)는 완전히 독립된 순번 체계를 쓴다
  (같은 `batch_0001.txt`라도 디렉토리가 다르면 다른 배치).
- 각 하위 디렉토리의 `manifest.json` = `{"kind", "batches": {"0001": [키, ...]}}`. 키 목록의
  i번째가 순번 i 의 키다: meaning·example_gen 은 `jmdict_id`, example 은 `[jmdict_id, tatoeba_ja_id]`.
  entries/examples 가 재생성돼도(항목 수 변동) 기존 배치는 이 키로 적용되므로 영향이 없다.
  `30_make_batches.py` 는 manifest 에 없는 키만 새 번호 배치로 추가한다(기존 배치 파일은 절대
  다시 쓰지 않음).
- `_out.txt`가 이미 존재하는 배치는 처리 완료로 간주하고 건너뛴다(병렬 서브에이전트가 중복
  작업하지 않도록 매번 처리 직전에 다시 확인한다 — `admin_emphasis` 컨벤션과 동일).

## 배치 크기

| 디렉토리 | 배치 1개당 크기 |
|---|---|
| `meaning/` | 단어 100개 |
| `example/` | 예문 최대 150문장 (같은 항목 예문은 한 배치에 인접 — 항목을 쪼개지 않아 150 미만일 수 있음) |
| `example_gen/` | 단어 50개 (= 예문 100개 생성, 단어당 2개) |

크기를 넘기지 않는다. 마지막 배치만 크기가 작을 수 있다(빈 배치 생성 금지).
배치 순서: meaning 은 항상 JLPT N5→N1→나머지(각 그룹 안은 jmdict_id 순). example/example_gen 은
`--jlpt-first` 를 주면 같은 순서, 아니면 jmdict_id 순.

입력 1개 크기(실측, 2026-09-24 테스트): meaning 약 19~29k자(≈10~15k 토큰, sense 230~360개) →
출력 ≈ 4~7k자(≈3~5k 토큰). example 150문장 약 18~19k자(≈9~10k 토큰) → 출력 ≈ 9k자(≈5~6k 토큰).
example_gen 50단어 약 2~3k자(≈1.5k 토큰) → 출력 100줄 ≈ 11k자(≈6~7k 토큰).

## 입력 라인 형식

모든 배치 파일은 UTF-8, 줄바꿈 `\n`, 파일 끝 빈 줄 없음. 필드 구분자는 **탭(`\t`)**.
필드 안에 탭이 들어가는 원본 데이터는 없다고 가정한다(있으면 로더 버그이므로
`40_verify.py` 쪽에서 걸러야 함 — 이 배치 스키마에서는 다루지 않는다).

### `meaning/` — 1줄 = 단어 1개

```
순번\t표제어\t읽기\tsenses\tkrdict후보
```

- `senses` = sense를 `||`로 이어 붙인 것. sense 1개 = `sense_no:JMdict품사(,품사...):gloss1,gloss2,...[:예문]`
  - `JMdict품사`는 콤마 구분 복수 가능(`v5r,vi`).
  - `gloss`는 콤마 구분, 영어 원문 그대로.
  - 마지막 `:예문`은 선택 필드(콜론+일본어 문장). 없으면 생략.
- `krdict후보` = 국립국어원 한국어기초사전 일본어 대역을 역방향으로 뒤집은 대조표
  (`build/krdict_ja_reverse.json`, 일본어 키 약 5.9만 개)에서 이 표제어로 찾은 한국어 후보.
  `한국어단어(품사):짧은뜻풀이`를 `;`로 이어 붙인다(뜻풀이는 생성 단계에서 40자 이내로 자름).
  후보가 없으면 필드 값은 `-` 한 글자(생략 불가 — 컬럼 자체는 항상 존재해야 함).
  조회 키: `word` + `kanji_forms` 전체(한자 표기). 가나 표기(`kana_forms`·reading)는 동음이의어가
  섞이므로 uk(가나 표제) 항목이거나 한자 표기 조회가 비었을 때만 쓴다. 정렬: 한자 키 > 가나 키,
  그 안에서 krdict reading 이 항목 읽기와 일치 > reading 없음 > 불일치. (한국어, 품사) 중복 제거 후
  최대 6개. 품사가 없으면 `(미상)`.
- sense 의 `:예문` 은 examples.jsonl 에서 sense_no 가 일치하는 예문의 ja_plain. sense 미지정 예문은
  1번 sense 에만 붙인다(다른 sense 에 붙이면 오해 유발).
- 상세 활용 규칙·예시는 `PROMPT_meaning.md`("krdict 후보 활용 규칙" 절) 참조.

### `example/` — 1줄 = 예문 1개 (해석 + sense 판정 + 거부)

```
순번\t표제어\t읽기\t뜻목록\t일본어원문(강조 포함)\t영어참고번역\tko_ref
```

- `뜻목록` = meaning 단계 결과(`build/meanings.jsonl`)를 sense_no 별로 `|` 로 이은 것.
  sense 1개 = `sense_no:뜻1/뜻2`. 예: `1:먹다/섭취하다|2:살다/생계를 잇다`.
  Tatoeba 색인이 이미 sense_no 를 준 예문은 그 sense 앞에 `*` 를 붙인다(`*2:살다`). 힌트일 뿐이다.
- 예문의 약 80%는 색인이 단어 단위(sense 없음)이고, 보충 매칭(`span_method=unindexed`) 예문에는
  동형어 오인이 섞여 있다. 그래서 이 배치가 **sense 판정과 부적합 예문 거부**까지 맡는다.
- 뜻목록은 모든 sense 의 뜻이 meanings.jsonl 에 있는 항목만 배치에 들어간다(`30_make_batches.py`
  기본 동작; 수동검수로 일부 sense 가 빠진 항목은 `--partial-meanings` 로 포함 가능).
- `영어참고번역`·`ko_ref`(Tatoeba 한국어 번역, 약 0.5%)는 없으면 `-`.
- `일본어원문`에는 이미 `<strong class="target-word">…</strong>`가 정확히 1개 있다
  (`20_build_examples.py` 산출물 전제, 전각 영숫자는 반각화됨).

### `example_gen/` — 1줄 = 단어 1개 (예문은 출력에서 2줄로 늘어남)

```
순번\t표제어\t읽기\tJLPT급수\t뜻목록
```

- `JLPT급수`는 `N5|N4|N3|N2|N1` 또는 `-`(급수 없음 — 길이 규칙은 N3 이상과 같게 적용).
- `뜻목록`은 example 과 같은 형식(`*` 없음), 항목의 **모든 sense**.
- 대상: `build/need_generation.json`(예문 0개 항목) + `--fill-senses` 로 추가되는 항목
  (예문 해석 적용이 끝났는데 거부되지 않은 sense 1 예문이 하나도 없는 항목 — 전부 X 로 거부된 항목 포함).

## 출력 라인 형식 / 파싱 규칙

| 디렉토리 | 출력 형식 | 줄 수 |
|---|---|---|
| `meaning/` | `순번\|sense_no\|뜻1=POS1;뜻2=POS2` | 입력 단어당 **sense 개수만큼** (누락 금지) |
| `example/` | `순번\|sense_no\|한국어해석` 또는 거부 `순번\|X\|사유` | 입력 줄당 정확히 1줄 |
| `example_gen/` | `순번\|sense_no\|일본어\|한국어` 또는 거부 `순번\|X\|사유` | 입력 단어당 정확히 2줄 (같은 순번 2회 등장), 거부면 1줄 |

파서는 `|`로 split하되 **최대 분할 횟수를 필드 개수-1로 제한**한다(meaning·example 최대 2회,
example_gen 최대 3회; meaning 세 번째 필드 안의 `|` 는 검증 실패).
파일 안의 줄 순서는 중요하지 않다(파서가 `순번`/`sense_no`로 매칭한다). 빈 줄, 코드펜스
(``` ` ``` ```), 설명 텍스트가 섞여 있으면 해당 줄은 무시하지 않고 **파싱 실패로 처리**한다
(조용히 skip하면 누락을 못 잡는다).

## 검증 규칙

배치 결과를 적재(`35_apply_batches.py`)하기 전에 반드시 통과해야 하는 자동 검증. 하나라도
실패하면 그 줄(해당 순번/항목)만 재시도 대상으로 뺀다 — 배치 전체를 버리지 않는다.

입력(배치 생성 시점, `30_make_batches.py`) 검증 — `meaning/`:
- **컬럼 수**: 탭 기준 정확히 **5컬럼**(`순번/표제어/읽기/senses/krdict후보`). 4컬럼짜리 구버전
  배치가 섞여 들어오면 실패로 간주하고 재생성한다.
- **krdict후보 형식**: 5번째 컬럼은 `-` 이거나, `한국어단어(품사):뜻풀이`를 `;`로 이어 붙인
  형식이어야 한다. 항목마다 `(`와 `)`, `:`가 정확히 있어야 하고 뜻풀이는 40자(한글 기준) 이하.
  형식이 깨진 후보는 그 항목만 제거하고 나머지는 유지(배치 생성 자체를 실패시키지 않는다).

공통:
- **순번 누락**: 입력에 있던 모든 순번(및 `meaning`은 sense_no 조합)이 출력에 최소 1번 존재.
- **순번 중복**: 같은 (순번, sense_no)(`meaning/`) 또는 같은 순번(`example/`)이 2번 이상 나오면
  실패, `example_gen/`은 순번당 정확히 2줄(마지막 값 채택 금지, 재시도로 보낸다).
- **sense_no**: 입력 행에 있던 sense 집합(meaning=senses 컬럼, example/example_gen=뜻목록) 안의
  값이어야 한다.
- **형식 불일치 줄**(코드펜스, 설명문, 빈 줄, 입력에 없는 순번)은 `audit/warn_<kind>.txt` 의
  "형식 오류"로 기록되고, 그 때문에 빠진 순번은 "출력 누락"으로 실패 처리된다.
- **필드 개수**: 구분자 `|` 기준 필드 개수가 정확히 일치.
- **빈 값 금지**: 뜻/해석/일본어 문장이 공백뿐이면 실패.

`meaning/` 전용:
- **POS 허용값**: `NOUN,VERB,ADJ,ADV,PRON,DET,ADP,CCONJ,SCONJ,NUM,INTJ,PART,AUX,PROPN,X` 15종
  외 값이 있으면 실패 (`heyvoca_back/app/models/models.py`의 `ck_voca_meaning_pos` 제약과 동일).
- **뜻 개수**: sense당 1~3개(`;` 개수 0~2).
- **길이**: 뜻 1개당 20자(한글 기준) 초과 시 실패.
- **한글 포함 여부**: 뜻 문자열에 한글 완성형 음절(`[가-힣]`)이 최소 1자 이상 포함되어야
  한다(영어만 있거나 일본어 원문을 그대로 복사한 경우 검출).
- **금지 문자**: 뜻 안에 영문 알파벳 3자 이상 연속(`[A-Za-z]{3,}`) 발견 시 실패(영어 병기 금지 위반
  의심 — 로마자 고유명사 등 예외는 사람 검수로 넘긴다).

`example/` 전용:
- **거부 줄** `순번|X|사유`: 사유는 1~10자. 거부는 정상 결과로 적재된다(`rejected:true`).

`example/`, `example_gen/` 공통:
- **strong 태그 정확히 1쌍**: 해당 언어 문자열에 `<strong class="target-word">`와 `</strong>`이
  각각 정확히 1개. 정규식 `<strong class="target-word">` 매치 수와 `</strong>` 매치 수가 둘 다 1이
  아니면 실패. (`example/`는 한국어 쪽만 검사 — 일본어 원문 태그는 입력 그대로 통과해야 하므로
  입력과 동일한지 별도 diff 검사)
- **한글 포함 여부**: 한국어 해석에 한글 완성형 음절이 최소 1자 이상.
- **마침표 포함 강조 금지**: 강조 태그 안에 `.`, `。`, `,`, `、`가 없어야 한다.
- **다른 태그/꺾쇠 금지**: strong 두 태그를 뺀 나머지에 `<`·`>` 가 있으면 실패.
- **조사 포함 의심**: 한국어 강조 태그 **안의 마지막 글자**가 어미로는 드문 조사 음절
  (`을,를,에,의,와,과`)이면 조사가 태그 안까지 삼켜졌을 가능성 — `audit/warn_<kind>.txt`
  경고로만 기록(자동 실패 아님; 조사 표제어 `より→~보다` 등은 오탐).

`example_gen/` 추가:
- **문장 길이**: JLPT 급수별 글자 수 범위(N5·N4: 8~15자, N3 이상·급수 없음: 8~30자, 구두점·공백
  제외)를 벗어나면 실패. 표제어가 5자 이상이면 상한을 (표제어 길이−4)만큼 늘린다(긴 가타카나어).
- **표제어 등장 여부**: 일본어 강조 구간 안에 표제어 표기(한자/가나 이형태 전체, 반각화)가
  있거나, fugashi 기본형 매칭(`20_build_examples.lemma_span`, 활용형 허용)이 강조 구간과 겹쳐야
  한다. 아니면 실패.
- **두 예문 동일 금지**.
- **강조 구간 형태소 경계**: 일본어 강조 양끝이 fugashi 형태소 경계여야 한다(勢力 의 勢, 眼科 의 科만
  강조하면 실패 → 재시도). 예외: `N日` 표제어의 `N日間`(日間 한 형태소). 재생성 배치
  (`build/example_gen_regen_manifest.json`)가 맡은 단어는 원 배치에서 이 검사를 경고로만 남긴다(중복 재시도 방지).
- **거부 `순번|X|사유`**(사유 1~10자): 한 글자·접사·약어 표제어로 단독 용법이 없을 때만(PROMPT 변형 B 규칙 12).
  그 순번의 유일한 줄이어야 하고(예문과 혼재 시 실패), 통과하면 그 단어는 생성 예문 0개로 적재된다.
- 적용 시 `reading_tokens` 는 `20_build_examples.reading_tokens()` 를 import 해 생성한다
  (tatoeba 예문과 같은 규칙: 한자 토큰 `[표층, 한자부분읽기, 오쿠리가나]`, 나머지 `[표층, null]`).

## 적용(`35_apply_batches.py`)과 산출물

매 실행마다 해당 kind 의 모든 `_out.txt`(+retryK)를 다시 파싱해 누적 산출물을 **통째로 재작성**한다
(상태 = 배치 파일, 멱등). 검증 단위: meaning=단어(한 sense 라도 실패하면 그 단어 전체 재시도),
example=문장, example_gen=단어(2줄).

| kind | 산출물 | 레코드 |
|---|---|---|
| meaning | `build/meanings.jsonl` | `{jmdict_id, sense_no, meanings:[{meaning,pos}], batch}` |
| example | `build/examples_ko.jsonl` | `{jmdict_id, tatoeba_ja_id, sense_no, ko, rejected, reason, batch}` |
| example_gen | `build/examples_generated.jsonl` | `{jmdict_id, seq(1·2), sense_no, ja(강조), ja_plain, ko, reading_tokens, batch}` |

**meaning 정정 오버레이**: `build/meaning_overrides.jsonl`(`{jmdict_id, sense_no, meanings:[{meaning,pos}], reason}`,
`41_build_meaning_overrides.py` 가 생성)이 있으면 meaning 적용 직후 해당 (jmdict_id, sense_no) 의 뜻 목록을
통째로 교체한다. `_out.txt` 원본은 수정하지 않는다. 오버레이 행도 위 `meaning/` 검증을 그대로 받되, 표제어
(entries.word)에 라틴 문자가 있으면 영문 3자 검사만 생략한다(`DVD 플레이어`, `JR 그룹` — 한글 포함 규칙은 유지).
검증 실패·대상 없음·중복 행은 적용하지 않고 `audit/warn_meaning.txt` 형식 오류 절에 남긴다.

**example 정정 층**(뒤가 우선, `_out.txt` 원본은 수정하지 않음):
1. `build/example_overrides.jsonl`(`{jmdict_id, tatoeba_ja_id, sense_no, ko, rejected, reason, fix_reason}`,
   `44_build_example_overrides.py` 가 생성 — 끝 부호 보강, 「」→"", ・→·, 강조 안 조사·서술격 분리) 로
   (jmdict_id, tatoeba_ja_id) 결과를 교체.
2. 재번역 배치 `batches/example/batch_fix_NNNN.txt`(원 7컬럼 형식, 순번 새로 부여) → `batch_fix_NNNN_out.txt`.
   순번→키는 `build/example_fix_manifest.json`(`{"batches": {"fix_0001": [[jmdict_id, tatoeba_ja_id], ...]}}`).
   출력이 있으면 원 배치·오버레이보다 우선. 재시도 파일은 만들지 않고 실패 줄은 warn 에 남긴다(원 결과 유지).
두 층 모두 일반 example 과 같은 검증을 받고, 적용된 레코드에는 `fix`(사유 또는 `batch_fix_NNNN`) 필드가 붙는다.
example_gen 은 `build/example_gen_overrides.jsonl`(`{jmdict_id, seq(1·2) 또는 ja_plain, sense_no, ja, ko, fix_reason}`)이
있으면 해당 예문을 교체한다(v_gen 과 같은 검증, reading_tokens 재생성). `{jmdict_id, seq, rejected:true, reason}` 행은
그 예문을 뺀다. 이 파일에는 두 출처가 섞인다:
1. 결정론적 정정(`fix_reason: ko_particle_split` 등 — 한국어 강조 안 조사 분리).
2. **재생성 배치** `batches/example_gen/batch_regen_NNNN.txt`(원 5컬럼 형식, 순번 새로; 키는
   `build/example_gen_regen_manifest.json` `{"batches": {"regen_0001": [jmdict_id, ...]}}`) →
   `batch_regen_NNNN_out.txt` 를 `scripts/47_apply_regen.py` 가 v_gen 검증(경계 검사 엄격) 후 해당 단어의
   생성 예문 2개 교체 행(`fix_reason: batch_regen_NNNN`, X 면 rejected 2행)으로 쓴다. 47 은 매번 regen 행을
   통째로 다시 쓰고, 재생성이 통과한 단어의 1번 정정 행은 뺀다. 실패분은 `batch_regen_NNNN_retryK.txt`(K≤3).
   `batch_regen_*` 파일명은 `batch_NNNN` 규칙과 달라 35 의 일반 배치 목록에 잡히지 않는다.
적용 순서: `47_apply_regen.py` → `35_apply_batches.py --kind example_gen`.

**후리가나 적재 시점 보정**: `50_load_mysql.py` 는 적재 직전 `scripts/reading_fix.py` 로 Tatoeba·생성 예문의
표제어(강조) 구간 reading_tokens 를 사전 읽기로 고정한다(jsonl 원본은 그대로; 규칙은 reading_fix.py 머리말).

부산물: `audit/manual_review_<kind>.txt`(3회 재시도 후 실패), `audit/warn_<kind>.txt`(시도별 검증
실패 사유 / 형식 오류 줄 / 조사 경고). `--status` 는 파일을 만들지 않고 요약만 출력한다.

## 실패 시 재시도 정책

1. `35_apply_batches.py` 가 검증 실패 단위만 모아 `batch_NNNN_retry1.txt`를 만든다(원본과 같은 입력
   형식, **원래 순번 유지** — manifest 로 키 복원).
2. 같은 프롬프트로 재처리 → `batch_NNNN_retry1_out.txt`.
3. 다시 `35` 실행 → 검증. 또 실패하면 `retry2`, `retry3`까지 반복(최대 3회 재시도, 총 4회 시도).
4. 3회 재시도 후에도 실패한 단위는 `audit/manual_review_<meaning|example|example_gen>.txt`
   에 (batch/순번/키/표제어/실패 사유)로 기록하고 자동 파이프라인에서는 제외한다 — 사람이 확인한다.
5. 재시도 배치는 크기 제한과 무관하게 실패분 개수만큼만 만든다(작아도 됨).
6. 규칙 변경 등으로 더 이상 필요 없어진 미처리(`_out` 없는) 재시도 입력은 `35` 가 지운다.

## 서브에이전트 실행 지시문 템플릿

배치 1개 = 서브에이전트 1개(`admin_emphasis` 컨벤션과 동일하게 여러 배치를 병렬로 여러
서브에이전트에 동시 할당해도 된다). 아래 템플릿에 프롬프트 파일 경로와 배치 파일 경로만
채워서 그대로 전달한다.

```
아래 두 파일을 읽어라:
1) 규칙: db/dict_ja/PROMPT_meaning.md   (또는 PROMPT_example.md)
2) 입력 배치: db/dict_ja/batches/meaning/batch_0001.txt   (또는 example/, example_gen/)

규칙 파일의 지침(입력/출력 형식, 스타일, 금지사항)을 그대로 따라 배치 파일의 모든 줄을
처리하고, 결과를 같은 디렉토리에 batch_0001_out.txt 로 저장하라(입력 파일과 같은 이름 +
_out.txt, 입력은 그대로 둘 것).

- 예문 해석(example)이면 PROMPT_example.md의 "변형 A" 절, 예문 생성(example_gen)이면 "변형 B" 절만 따른다.
- 결과 파일 외에 다른 설명은 쓰지 말 것. 저장 후 "done <처리한 줄/항목 수>" 한 줄로만 보고.
- 이미 batch_0001_out.txt 가 존재하면 이미 처리된 것이니 건드리지 말고 즉시 "skip"으로 보고.
- Read/Write/Edit/Glob/Bash만 사용. 외부 번역 API·스크립트 호출 금지 — 네가 직접 판단해서 쓴다.
```

병렬 처리 시 조율(코디네이터가 여러 서브에이전트를 띄울 때):
1. Glob으로 `batches/<종류>/batch_*.txt` 전체 목록 확보.
2. 그중 같은 번호의 `_out.txt`가 없는 배치만 미처리로 간주.
3. 미처리 중 N개(예: 5개)를 골라 서브에이전트에 동시 할당.
4. 한 라운드 끝나면 다시 Glob으로 재확인 후 남은 게 있으면 반복 — 미처리 0이 될 때까지.
5. 라운드가 끝날 때마다 `35_apply_batches.py --kind <종류>` 를 돌려 실패분을 `retryN` 배치로 뽑고,
   `_out` 없는 `batch_*_retry*.txt` 를 같은 방식으로 재할당.
