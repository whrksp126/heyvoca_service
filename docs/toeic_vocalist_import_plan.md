# 토익 단어장(dummy_vocalist) DB 적재 — 작업 계획 / 인수인계

> 작성일: 2026-08-20 / 상태: **착수 전 (계획 확정)**
> 대상 DB: `heyvoca_dict`
> 소스: `dummy_vocalist/*.json` 120개 (git 제외 — `.gitignore:dummy_vocalist/`, 로컬 `~/Downloads/dummy_vocalist`)
>
> 이 문서는 2026-07-22자 `docs/voca_json_import_plan.md`(보류 상태, **gitignore 대상이라 레포에 없음**)를
> 대체한다. 그 문서의 유효한 조사 결과는 여기에 흡수했고, 틀린 수치는 §11에 정정 내역을 남겼다.

---

## 0. 한눈에 보기

`dummy_vocalist` JSON 120개(토익 단어 4,359개)를 사전 DB에 병합 적재하고, **파일 단위로 단어장 120개**를 만든다.

단, 그 전에 **선행 작업(Phase 0)** 이 있다. `admin_voca_book_map`이 뜻/예문을 **텍스트 스냅샷**으로
들고 있어서 사전(`voca_meaning` / `voca_example`)과 완전히 단절돼 있는데, 이걸 **id 조인 테이블**로
정규화한다. 적재 전에 해야 하는 이유는 §4.2.

```
Phase 0  조인 테이블 분리 + 기존 6,619행 백필      ← 반드시 선행
Phase 1  스키마 변경 (voca.word_type, 토익 카테고리)
Phase 2  JSON 전처리
Phase 3  사전 병합 적재 (voca / voca_meaning / voca_example)
Phase 4  단어장 120개 생성 + 서점 노출 4개
Phase 5  dict DB publish → 각 환경 apply
```

**작업 범위 경계**
- ✅ DB 데이터 정리 + 스키마 추가
- ❌ 코드 수정 (별도 작업으로 분리 — §10)

코드를 나중에 바꾸므로 기존 `admin_voca_book_map.voca_meanings` / `voca_examples` TEXT 컬럼은
**삭제하지 않고 조인 테이블과 병행 유지**한다. → **§4.4 이중 쓰기 주의사항 필독.**

---

## 1. 이 커밋에 포함된 파일 — 인수인계자가 왜 필요한가

작업 착수 전에 아래 파일들이 레포에 있어야 한다. 넷은 **서로 물려 있어 부분 커밋하면 깨진다.**

| 파일 | 내용 | 없으면 생기는 문제 |
|---|---|---|
| `heyvoca_back/app/models/models.py` | `VocaMeaning.pos` 컬럼 정의 (+5줄) | 모델↔DB 불일치. 다음 `flask db migrate`가 이미 있는 `pos` 컬럼을 **또 만들려는 마이그레이션을 생성**한다 |
| `heyvoca_back/migrations_dict/versions/c1f0a2b3d4e5_add_pos_to_voca_meaning.py` | `voca_meaning.pos` 마이그레이션 | **dict DB의 현재 head.** 없으면 Phase 0/1 마이그레이션을 이 위에 쌓을 수 없다 (`down_revision` 체인 끊김) |
| `scripts/label_meaning_pos.py` | 뜻별 품사 LLM 라벨링 배치 | Phase 3에서 **신규 뜻 4,109개의 pos를 채울 때 그대로 재사용**한다. 적재 스크립트 작성 스타일(멱등 / `--dry-run` / `--limit`)의 기준 |
| `heyvoca_back/requirements.txt` | `anthropic>=0.40` (+1줄) | 위 스크립트가 import 실패 |
| `scripts/analyze_toeic_vocalist.py` | 사전 조사 스크립트 (신규) | 이 문서의 모든 수치를 재현·재검증하는 근거. §12 |
| `docs/toeic_vocalist_import_plan.md` | 이 문서 | — |

> `.mcp.json`은 `.gitignore` 대상이라 커밋되지 않는다. context7 MCP를 쓰려면 각자 로컬에서
> `{"type":"http","url":"https://mcp.context7.com/mcp"}` 형태로 설정해야 한다
> (`command: curl` 형태는 MCP 프로토콜을 못 타서 `-32000 Connection closed`로 실패).

### 1.1 인수인계 체크리스트 — git 푸시만으로는 부족하다

**git으로 전달되는 것**

- [x] 이 문서 + `scripts/analyze_toeic_vocalist.py`
- [x] `voca_meaning.pos` 관련 4개 파일 (§1 표)

**git으로 전달되지 않는 것 — 별도 조치 필요**

| 항목 | 왜 | 조치 |
|---|---|---|
| **소스 JSON 120개** | `.gitignore`에 `dummy_vocalist/` → 레포에 아예 없음 | **파일을 직접 전달** (약 2MB). 받는 사람은 아무 경로에 두고 `--src`로 지정 |
| `heyvoca_dict` 데이터 | DB는 git에 없음 | 컨테이너 시작 시 `dict_sync.py`가 MinIO에서 자동 동기화 (§9.2). `.env.local`에 `MINIO_DICT_RO_*` 필요 |
| `.env.local` | `.gitignore`에 `.env` | 별도 전달. `DATABASE_URL_DICT` / `MINIO_DICT_*` / `ANTHROPIC_API_KEY`(pos 라벨링용) |
| `.mcp.json` | gitignore | 위 참고 |

**아직 안 만들어진 것 — 담당자가 작성해야 함**

- [ ] Phase 0 마이그레이션 (조인 테이블 2개) — §4.3에 DDL 있음
- [ ] Phase 1 마이그레이션 (`voca.word_type`) — §5.1에 DDL 있음
- [ ] `scripts/migrate_admin_map_to_ids.py` — §4.5
- [ ] `scripts/backfill_word_type.py` — §5.1
- [ ] `scripts/import_toeic_vocalist.py` — §6~8

> **즉, "마이그레이션 해두고 브랜치 푸시하면 끝"이 아니다.**
> 현재 커밋에는 **계획과 조사 스크립트만** 있고 마이그레이션 파일은 없다.
> 담당자가 §4.3 / §5.1의 DDL로 마이그레이션을 직접 작성하는 것부터 시작한다.
> 스키마를 미리 만들어 넘기고 싶다면 그 2개를 먼저 작성해 커밋할 것.

**작업 완료 후 반영 절차** (§9.2 — 여기도 git이 관여한다)

```
적재 완료 → scripts/dict_publish.py → db/dict/dict_pointer.json 갱신
         → pointer 커밋 & 푸시 → 각 환경 컨테이너 재시작
```

`dict_pointer.json` 커밋을 빼먹으면 MinIO에 dump는 올라갔는데 어느 환경도 받지 못한다.

---

## 2. 사전 조사 결과 (실측값)

모든 수치는 `scripts/analyze_toeic_vocalist.py`로 재현 가능하다 (§12).

### 2.1 현재 DB 규모

| 테이블 | 행 수 |
|---|---|
| `voca` | 50,634 |
| `voca_meaning` | 131,757 |
| `voca_example` | 28,477 |
| `voca_meaning_map` | 133,769 |
| `voca_example_map` | 28,477 |
| `voca_book` | 12,773 (레거시) |
| `voca_book_map` | 1,485,320 (레거시) |
| `admin_voca_book` | 65 |
| `admin_voca_book_map` | 6,619 |
| `bookstore` | 60 |

### 2.2 서점은 `admin_voca_book`을 쓴다 (`voca_book` 아님)

- `bookstore.admin_voca_book_id` → **60/60 채워짐**
- `bookstore.book_id` → **0/60** (전부 NULL)

→ `voca_book`(12,773개)은 레거시. **신규 단어장은 `admin_voca_book`에 만든다.**

### 2.3 `admin_voca_book_map`의 실제 저장 형태

| 컬럼 | 형태 | 행 수 | 생성 경로 |
|---|---|---|---|
| `voca_meanings` | `["사과","과일의 일종"]` — **문자열 배열** | 6,619 (100%) | — |
| `voca_examples` | `[{"en":…,"ko":…}]` — **구버전 키** | 3,787 | `admin.py:544 _process_word_into_book` (엑셀/AI 업로드) |
| `voca_examples` | `[{"origin":…,"meaning":…}]` — 신버전 키 | 400 | `admin_voca_books.py _normalize_examples` |
| `voca_examples` | `[]` | 2,432 | — |

`admin_voca_books.py:344 _normalize_examples()`가 `en`/`ko` → `origin`/`meaning` 하위호환 변환으로 버티는 중.

### 2.4 🚨 `en`/`ko` 3,787행은 프론트에서 예문 문제가 출제되지 않는다

`heyvoca_front/src/plugins/questionTypes/index.js:5-9`:

```javascript
const TARGET_WORD_RE = /<strong[^>]*class="target-word"[^>]*>(.*?)<\/strong>/;

export const hasFillInTheBlankExample = (word) =>
  Array.isArray(word?.examples) && word.examples.some(ex => TARGET_WORD_RE.test(ex?.origin ?? ''));
```

프론트는 **`ex.origin`** 을 읽는다. 그리고 저장 → 소비까지 키 변환이 없다 (passthrough):

```
admin_voca_book_map.voca_examples → (다운로드) user_voca_book_map.voca_examples
→ API 응답 (voca_books.py:294,349 / services/recommend/pool.py:129) → 프론트
```

→ `en`/`ko`로 저장된 3,787행은 `ex.origin`이 `undefined`라 **빈칸채우기 출제가 안 된다.**
이번 적재와 별개인 **기존 버그**이며, Phase 0의 키 통일로 함께 해소된다.

### 2.5 재활용 가능 컬럼 조사 — 전부 부적합

| 컬럼 | 실측 상태 | 판단 |
|---|---|---|
| `voca.is_active` | 코드에 **필터 없음**. `is_active=0` 행 **0개** | 숙어 구분에 **사용 불가** |
| `admin_voca_book_map.level` | 6,519 NULL / 100행이 `0` — 사실상 미사용 | 단어장을 day 단위로 쪼개므로 **불필요** |
| `bookstore_category` | 수능100 · 일상생활200 · 비즈니스300 · 여행400 · 음식500 · 의료600 · 교육700 · 기타999 | **'토익' 없음 → 신설** |

`level_id`는 `heyvoca_user` 스키마의 `level` 테이블 참조: 1 초등 / 2 중등 / 3 고등 / 4 대학생.
기존 사례(`기초부터 차근차근 영어단어 N탄`)는 `level_id=3`.
단, `bookstore.level_id`는 커밋 `0bf9897`에서 **전부 NULL로 초기화**되고 기준 재정립 대기 중 → 이번엔 NULL.

### 2.6 소스 JSON

```
120개 파일 = day_1~30 × 4 카테고리
총 엔트리 5,171 / 고유 단어 4,359
  → 중복 발생 812회 (중복된 고유 단어 572개, 최대 8개 파일에 중복: 'be aware of')
  토익_기초 839 · 핵심_빈출 1,205 · 800점_완성 2,136 · 900점_완성 991
```

스키마: `origin` / `pronunciations{us,uk}` / `meanings[{pos,text}]` / `notes` / `examples[]`

| 항목 | 값 |
|---|---|
| 발음 보유 | 1,198 (us==uk 199 / us!=uk 435 / us만 564 / uk만 0) |
| 예문 보유 | 1,174 엔트리 |
| `notes` 보유 | 536 → **버림 (결정사항)** |
| 뜻 2개 이상 | 192 |
| pos 분포 | `n` 1570 · `phr` 1253 · `v` 946 · `adj` 865 · **`''`(빈값) 503** · `adv` 252 · `prep` 17 · `conj` 1 |

### 2.7 소스 JSON 스키마 오염 — Phase 2에서 정규화 필수

| 케이스 | 건수 | 예시 |
|---|---|---|
| meaning dict에 품사키가 직접 박힘 | 16 | `{"pos":"n","text":"더미","v":"쌓아 올리다"}` ← `stack` |
| `pos_2`/`text_2` | 27 | 두 번째 뜻이 별도 키 |
| `pos_3`/`text_3` | 1 | |
| example 키 = `origin` + `meaning` | 835 | |
| example 키 = `origin` + **`translation`** | 501 | 한국어 키가 3종으로 갈림 |
| example 키 = `origin` + **`text`** | 18 | **예문 아님** (`{"origin":"meal preference","text":"선호하는 메뉴"}`) → 제외 |
| `media` 키 | 1 | `src` 빈값 → 무시 |

### 2.8 🚨 예문 강조 태그 — 후속 작업 필요

| 대상 | 영문 태그 | 한국어 태그 |
|---|---|---|
| **소스 JSON** (1,336 예문) | 940 O / **396 X** | **0 O / 1,336 X** |
| **기존 DB** (28,477 예문) | 28,477 O | 28,464 O |

두 가지 문제:

1. **한국어 태그가 전무하다.** 기존 DB는 99.95%가 태그를 갖고 있어 UI가 일관되지 않게 된다.
   → `app/utils/example_tagging.py:apply_emphasis()`로 후속 태깅. 이미 강조된 항목은 skip하고
   `word` / `meanings` / `examples`만 있으면 동작하므로, **적재 후 `book_id` 기준으로 순회해도 결과가 같다.**
   Kiwi 1차 처리 실패분은 GPT 배치(OpenAI 유료)로 넘어가므로 **비용 판단 필요.**
2. **영문 태그 396건 누락** → 그 단어들은 빈칸채우기 출제 불가 (§2.4의 정규식 조건).

→ **`scripts/tag_examples.py` 후속 작업으로 분리.** 이번 적재는 JSON 원문 그대로 넣는다.

### 2.9 기존 DB와 대조

**단어 매칭 (고유 4,359개)**

| 구분 | 건수 |
|---|---|
| 철자 완전일치 | 2,780 |
| 대소문자만 다름 | 34 |
| **DB에 없음 (신규)** | **1,545** |

**뜻** — DB는 뜻을 **낱개로 쪼개** 저장(`showroom` → '진열실', '전시실' 2행)하는데
JSON은 콤마로 묶여 있음(`"진열실, 전시실"`). **콤마 split 후** 비교해야 정확하다.

**pos — 손대지 않는다 (중요)**

```
JSON pos vs DB pos → 일치 3,287 / 불일치 9 / DB가 NULL 0
```

`voca_meaning.pos`는 이미 100% 채워져 있고(`scripts/label_meaning_pos.py`),
불일치 9건도 **대부분 JSON이 틀린 쪽**:

| 단어 | 뜻 | DB | JSON |
|---|---|---|---|
| `waste` | 쓰레기 | `NOUN` ✅ | `v` ❌ |
| `appeal` | 매력 | `NOUN` ✅ | `v` ❌ |
| `report` | 보도 | `NOUN` ✅ | `v` ❌ |
| `contract` | 수축하다 | `VERB` ✅ | `n` ❌ |
| `extra`/`single`/`several` | 추가의/단 하나의/몇몇의 | `DET` (UD 기준) | `adj` |

→ **기존 뜻의 pos는 절대 덮어쓰지 않는다.** JSON pos는 신규 뜻 insert 시에만 사용.

**예문** — JSON 예문 중 DB와 겹치는 것 **0개** (전부 신규).

### 2.10 ⚠️ 대소문자 중복 `voca` 행

DB에 같은 철자가 2행인 경우가 **1,511쌍**, 그중 JSON에 등장하는 것이 **387개**.

```
happy      → id 5     'happy'     발음 'hǽpi'
           → id 47937 'Happy'     발음 NULL
beautiful  → id 12    'beautiful' 발음 'bjúːtəfəl'
           → id 48239 'Beautiful' 발음 NULL
```

**행 선택 규칙 (위에서부터 순서대로 적용)**
1. 소문자 철자가 완전일치하는 행
2. `pronunciation`이 NOT NULL인 행
3. `voca_meaning_map` 연결 수가 많은 행
4. `id`가 작은 행

> 커밋 `abb19d6`에서 중복 병합을 일부 진행했으나 미완. 별도 정리 과제 (§10).

---

## 3. 확정된 의사결정

| # | 항목 | 결정 |
|---|---|---|
| 1 | 숙어(구) 1,545개 | **`voca.word_type` 컬럼 신설.** 단어장 map에는 **전부 넣고** 조회 API에서 필터. 나중에 확장 시 필터만 해제 → **재적재 불필요** |
| 2 | `notes` 536개 | **버린다.** DB 컬럼 추가 안 함 (JSON은 남아있으니 나중에 재적재 가능) |
| 3 | 뜻/예문 매핑 | **조인 테이블 분리.** DB에 있으면 기존 id 재사용, 없으면 신규 insert 후 id 매핑. **`en`/`ko` → `origin`/`meaning` 통일** |
| 4 | 단어장 구성 | **파일 단위 120개.** 카테고리 '토익' 신설. 서점 노출은 **day 1의 4개만** |
| 5 | 작업 순서 | **Phase 0(조인 테이블) 먼저**, 완료 후 나머지 |
| 6 | 발음 | `us`, `uk` **중복 제거 후 콤마 조인.** DB가 NULL일 때만 백필 |
| 7 | 예문 강조 태깅 | 이번 범위 밖. 후속 `scripts/tag_examples.py` (§2.8) |

**단어장 이름 규칙**

```
day_{n}_{이름1}_{이름2}_단어장.json  →  "{이름1} {이름2} 단어장 (day {n})"
```

| 파일 | 단어장명 |
|---|---|
| `day_1_토익_기초_단어장.json` | `토익 기초 단어장 (day 1)` |
| `day_1_핵심_빈출_단어장.json` | `핵심 빈출 단어장 (day 1)` |
| `day_1_800점_완성_단어장.json` | `800점 완성 단어장 (day 1)` |
| `day_30_900점_완성_단어장.json` | `900점 완성 단어장 (day 30)` |

120개 파일 전부 이 패턴에 일치함(검증 완료). 중간 이름 4종: `토익_기초` / `핵심_빈출` / `800점_완성` / `900점_완성` (각 30개).

> **⚠️ macOS NFD 함정**: `glob`으로 읽은 파일명은 한글이 NFD(자모 분리)라서
> 정규식 `_단어장$`(NFC)에 **매칭 실패**한다. 반드시:
> ```python
> unicodedata.normalize('NFC', os.path.basename(f))
> ```
> 빼먹으면 120개 전부 패턴 불일치로 조용히 스킵된다. (`analyze_toeic_vocalist.py:book_name()` 참고)

---

## 4. Phase 0 — 조인 테이블 분리 (선행 필수)

### 4.1 왜 하는가

1. **사전과 완전 단절** — `voca_example` 28,477개가 있는데 단어장 예문과 아무 관계 없음. 재사용률 0%
2. **3중 복제** — `admin_voca_book_map` → `user_voca` → `user_voca_book_map`으로 텍스트가 3번 복사
3. **수정 전파 불가** — 사전 뜻의 오타를 고쳐도 단어장에 반영 안 됨
4. **스키마 드리프트 + 실제 버그** — `en`/`ko` 3,787행은 예문 문제가 출제되지 않음 (§2.4)

### 4.2 왜 적재보다 먼저인가

지금 적재하면 **4,359단어 × (뜻 6,958 + 예문 1,331)** 을 TEXT 스냅샷으로 넣고,
나중에 그걸 **다시 id로 역매칭**해야 한다. 같은 일을 두 번 하고, 그 사이 드리프트가 더 벌어진다.
먼저 구조를 바꾸고 적재하면 한 번에 끝난다.

### 4.3 스키마

```sql
CREATE TABLE admin_voca_book_map_meaning (
  map_id      INT NOT NULL,
  meaning_id  INT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, meaning_id),
  KEY ix_avbmm_map_sort (map_id, sort_order),
  KEY ix_avbmm_meaning (meaning_id),
  CONSTRAINT fk_avbmm_map     FOREIGN KEY (map_id)     REFERENCES admin_voca_book_map(id) ON DELETE CASCADE,
  CONSTRAINT fk_avbmm_meaning FOREIGN KEY (meaning_id) REFERENCES voca_meaning(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE admin_voca_book_map_example (
  map_id      INT NOT NULL,
  example_id  INT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, example_id),
  KEY ix_avbme_map_sort (map_id, sort_order),
  KEY ix_avbme_example (example_id),
  CONSTRAINT fk_avbme_map     FOREIGN KEY (map_id)     REFERENCES admin_voca_book_map(id) ON DELETE CASCADE,
  CONSTRAINT fk_avbme_example FOREIGN KEY (example_id) REFERENCES voca_example(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`meaning_ids` JSON 컬럼 대안 대비 선택 이유:
- FK `ON DELETE CASCADE`로 뜻/예문 삭제 시 자동 정리 (JSON id 배열은 dangling id 발생)
- `sort_order`로 단어장별 뜻 순서 유지 — 기존 JSON 배열 순서와 동일한 표현력
- **골라담기 기능 그대로 유지** — `celebrate`의 DB 뜻 5개 중 '축하하다'만 연결 가능
- 역방향 조회 가능 ("이 예문을 쓰는 단어장 목록")
- 읽기 성능: `selectinload`로 총 3쿼리. 현재는 map 행마다 `json.loads()` 2회 = 조인이 더 빠를 수 있음

### 4.4 ⚠️⚠️ 이중 쓰기 주의사항 (가장 중요)

**코드 전환 전까지 TEXT 컬럼과 조인 테이블이 동시에 존재한다.**

현재 코드(`admin_voca_books.py`, `admin.py`, `voca_books.py`, `auth.py`, `onboarding.py`,
`voca_indexs.py`)는 **TEXT만 읽고 쓴다.** 이 상태에서 admin 화면으로 단어를 추가/수정하면
**TEXT만 갱신되고 조인 테이블은 드리프트.**

**대책 (둘 중 하나)**
- (a) 코드 전환까지 admin 단어 편집 동결
- (b) **백필 스크립트를 멱등(재실행 안전)하게 작성**하고, 코드 전환 직전에 한 번 더 돌려 재동기화 ← **권장**

**그리고 Phase 3~4의 신규 적재는 조인 테이블 + TEXT 둘 다 채워야 한다.**
조인 테이블만 채우면 현재 코드가 TEXT를 읽으므로 **새 단어장 120개가 앱에서 뜻/예문 없이 빈 화면으로 보인다.**

### 4.5 백필 절차 (기존 6,619행)

**meanings** (문자열 배열 → `voca_meaning.id`)

| 상황 | 처리 |
|---|---|
| 해당 `voca_id`의 뜻 중 동일 문자열 존재 | 그 `meaning_id` 연결 |
| 없음 | `voca_meaning` insert(+`voca_meaning_map` 연결) → 신규 id 연결 |

`sort_order`는 원래 JSON 배열 순서(0-based).

**examples** (`{en,ko}` 또는 `{origin,meaning}` → `voca_example.id`)

| 상황 | 처리 |
|---|---|
| 키 정규화 | `en`→`origin`, `ko`→`meaning` (3,787행) |
| 해당 `voca_id`의 예문 중 `exam_en` 일치 | 그 `example_id` 연결 |
| 없음 | `voca_example` insert(+`voca_example_map` 연결) → 신규 id 연결 |

**비교 시 HTML 태그를 제거하고 대조**한다: `re.sub(r'<[^>]+>', '', s).strip()`
(태그 위치가 달라도 같은 예문인 경우가 있음)

**추가 작업**: 기존 `voca_examples` TEXT 컬럼도 `en`/`ko` → `origin`/`meaning`으로
**UPDATE 통일** (3,787행). 결정사항 #3. §2.4의 기존 버그가 이 시점에 해소된다.

### 4.6 ⚠️ user 쪽(`user_voca_book_map` / `user_voca`)은 건드리지 않는다

user 쪽 스냅샷은 **버그가 아니라 기능**이다. 사용자가 다운로드한 시점의 뜻이 고정돼야
FSRS 학습 이력과 어긋나지 않는다. 관리자가 사전 뜻을 삭제했다고 사용자가 외우던 단어의
뜻이 사라지면 안 된다.

→ **admin 쪽만 id 정규화.** 다운로드 시점에 id를 텍스트로 구워서(bake) user 테이블에 복사하도록
코드를 나중에 바꾼다 (`voca_books.py:509`). 프론트 응답 형태는 그대로 유지되므로 **프론트 수정 불필요.**

> 프론트는 `meanings`를 `String(m).trim()`으로 다룬다
> (`questionTypes/index.js:26-27`) → API 응답은 **문자열 배열을 유지**해야 한다.

---

## 5. Phase 1 — 스키마 변경

### 5.1 `voca.word_type` 추가

```sql
ALTER TABLE voca
  ADD COLUMN word_type VARCHAR(16) NOT NULL DEFAULT 'word',
  ADD KEY ix_voca_word_type (word_type);
```

**판정 규칙**: JSON `pos == 'phr'` **또는** `origin`에 공백 포함 → `'phrase'`

기존 50,634개도 같은 규칙으로 백필 (공백 포함 **996개**가 `phrase`가 됨).

**적재 후 예상**: `word` 2,796 / `phrase` 1,563 (신규 4,359 기준)

판정 검증 결과:
- 공백 있으나 `pos != 'phr'` → **373개**. 전부 `pos=''`인 복합명사(`acid rain`, `climate change`, `global warming`). **지금은 단어만 노출하므로 `phrase`로 두는 게 맞다**
- `pos == 'phr'`인데 공백 없음 → 2개 (`all-out`, `must-see`). 하이픈 단어이므로 `phrase` 처리
- 하이픈 단어(`part-time`, `window-shopping`)는 공백이 없어 `word`로 분류 — 의도한 동작

**조회 API 필터 (코드 작업은 나중에)**

```python
# 지금
.filter(Voca.word_type == 'word')
# 숙어 확장 시 → 이 줄만 제거 (또는 include_phrase 파라미터)
```

**⚠️ word_count 부작용**: 숨긴 숙어까지 세면 "70단어"인데 60개만 보인다.
`admin_voca_book.word_count`는 `word_type='word'`만 카운트하고, 확장 시 재계산 배치를 함께 준비할 것.

### 5.2 서점 카테고리 '토익' 추가

```sql
INSERT INTO bookstore_category (category, sort_order) VALUES ('토익', 150);
```

`sort_order=150` → 수능(100) 다음, 일상생활(200) 앞.

---

## 6. Phase 2 — JSON 전처리

정규화 함수는 **`scripts/analyze_toeic_vocalist.py`에 이미 구현되어 있다.** 적재 스크립트는
`norm_meanings()` / `norm_examples()` / `join_pronunciation()` / `split_ko()` / `is_phrase()`를
그대로 가져다 쓴다 (조사와 적재가 같은 규칙을 쓰도록 — 어긋나면 예상 수치가 틀어진다).

**pos 매핑 (신규 뜻에만 적용)**

| JSON | DB (`voca_meaning.pos`, UD 태그) |
|---|---|
| `n` | `NOUN` |
| `v` | `VERB` |
| `adj` | `ADJ` |
| `adv` | `ADV` |
| `prep` | `ADP` |
| `conj` | `CCONJ` |
| `phr` | `NULL` |
| `''` (빈값, 503개) | `NULL` |

`NULL`로 남는 뜻은 적재 후 `scripts/label_meaning_pos.py`로 채운다 (`pos IS NULL`만 처리하므로 그대로 실행하면 됨).

**발음 조인** — `voca.pronunciation`은 `String(100)` 단일 컬럼이고 기존 데이터도 콤마로
이형을 표기한다(`interested` → `"íntərəstid, -tərèst-"`, 그런 행 1,696개).
프론트는 `WordDetailNewFullSheet.jsx:118`에서 `/{pronunciation}/`으로 통째 렌더링한다.

| 입력 | 결과 |
|---|---|
| `congestion` us == uk | `kəndʒéstʃən` |
| `purchase` us != uk | `pə́ːrtʃəs, pə́ːtʃəs` |
| `price` uk 없음 | `prais` |

---

## 7. Phase 3 — 사전 병합 적재

### 7.1 처리 규칙

| 대상 | 규칙 |
|---|---|
| `voca` | 있으면 재사용(§2.10 행 선택 규칙). 없으면 신규 insert + `word_type` 판정 + `is_active=True` |
| `voca.pronunciation` | **DB가 NULL일 때만** `join_pronunciation()` 결과로 채움 (**5건**) |
| `voca_meaning` | 콤마 split 후 해당 `voca_id`에 동일 문자열 있으면 **id 재사용**, 없으면 insert + `voca_meaning_map` 연결 |
| `voca_meaning.pos` | **기존 뜻은 절대 안 건드림.** 신규 insert에만 §6 매핑 적용 |
| `voca_example` | 태그 제거 후 `exam_en` 비교. 없으면 insert + `voca_example_map` 연결. `origin`→`exam_en`, `meaning`→`exam_ko` |
| `notes` | 버림 |
| `media` | 무시 |

### 7.2 ⚠️ `admin.py:544 _process_word_into_book`을 그대로 쓰면 안 된다

기존에 voca / voca_meaning(+map) / voca_example(+map) / admin_voca_book_map을 한 번에 넣는
로직이 있지만 재사용 불가:

1. `voca_examples`를 **`{"en","ko"}` 키로 저장**한다 (`admin.py:593-594`) → §2.4 버그를 재생산
2. `pronunciation`을 저장하지 않는다 — `Voca(word=word_text)`만 호출 (`admin.py:573`)
3. `Voca.level`, `is_active`, (신규) `word_type`도 세팅하지 않는다
4. 조인 테이블을 모른다

→ **`scripts/import_toeic_vocalist.py` 신규 스크립트**로 간다.

**참고로 검토했던 기존 API (전부 이번 용도로는 부적합, 현재 라인번호 확인됨)**

| 엔드포인트 | 위치 | 부적합 이유 |
|---|---|---|
| `POST /admin/admin_voca_book/from_ai` | `admin.py:599` | 내부에서 `_process_word_into_book`을 쓴다 → 위 4가지 문제 그대로. `examples`를 `{en,ko}`로 받는다 |
| `POST /admin/voca-books/<id>/words` | `admin_voca_books.py:431` | 단어 1건씩. 5,165행을 HTTP로 넣는 건 비현실적이고 동명이의어 409 분기를 매번 처리해야 함 |

### 7.3 적재 예상 수치 (실측 기반)

| 테이블 | 기존 id 재사용 | 신규 insert |
|---|---|---|
| `voca` | 2,814 | **1,545** |
| `voca_meaning` | 2,849 | **4,109** |
| `voca_example` | 0 | **1,331** |

> `voca_example` 신규가 1,331인 이유: JSON 예문 1,354개 중 `text` 키 18개 제외,
> 중복 제거 후 1,331. DB와 겹치는 것은 0개.

---

## 8. Phase 4 — 단어장 생성 + 서점 노출

### 8.1 `admin_voca_book` 120개

| 필드 | 값 |
|---|---|
| `book_nm` | `"{이름1} {이름2} 단어장 (day {n})"` (§3 규칙) |
| `language` | `'영어'` |
| `source` | `'직접 제작'` (기존 관례) |
| `category` | `'토익'` |
| `word_count` | `word_type='word'`인 단어 수만 |
| `updated_at` | 적재 시각 |

### 8.2 `admin_voca_book_map` — 5,165행

파일 내 중복 단어 제거 후 총 **5,165행** (엔트리 5,171 − 파일 내 중복 6).

| 필드 | 값 |
|---|---|
| `voca_id` | Phase 3에서 확정된 id |
| `book_id` | 해당 `admin_voca_book.id` |
| `level` | `NULL` (미사용 컬럼) |
| `voca_meanings` | **JSON 뜻만** 스냅샷 — 문자열 배열 (TEXT, 현재 코드용) |
| `voca_examples` | **JSON 예문만** 스냅샷 — **`origin`/`meaning` 키** (TEXT, 현재 코드용) |

**+ 조인 테이블 동시 기입** (§4.4):
- `admin_voca_book_map_meaning` — JSON 뜻에 해당하는 `meaning_id`만, `sort_order` 부여
- `admin_voca_book_map_example` — JSON 예문에 해당하는 `example_id`만, `sort_order` 부여

> **스냅샷 범위 = JSON 뜻/예문만.** `celebrate`는 DB에 뜻이 5개(기념하다/축하하다/찬양하다/맞이하다/경축하다)
> 있지만 이 단어장에서는 JSON의 **'축하하다'만** 보여준다. 토익 시험에 나오는 뜻에 집중.

### 8.3 `bookstore` — day 1의 4개만 노출

| `admin_voca_book` | `category` | `hide` |
|---|---|---|
| `토익 기초 단어장 (day 1)` | `'토익'` | `'N'` |
| `핵심 빈출 단어장 (day 1)` | `'토익'` | `'N'` |
| `800점 완성 단어장 (day 1)` | `'토익'` | `'N'` |
| `900점 완성 단어장 (day 1)` | `'토익'` | `'N'` |

- `name` → 단어장명과 동일
- `category_id` → §5.2에서 만든 '토익' 카테고리 id
- `admin_voca_book_id` → 해당 단어장 id
- `book_id` → `NULL` (레거시 컬럼)
- `level_id` → `NULL` (§2.5 — 기준 재정립 대기 중)
- `gem` / `downloads` → **미결정** (§10). 기존 값: 체험판 10, 일반 20
- **나머지 116개는 `bookstore`에 행을 만들지 않는다** (단어장만 존재)

**기존 API로 등록해도 된다** — `POST /admin/voca-books/<book_id>/bookstore/toggle`
(`admin_voca_books.py:587`, 핸들러 `toggle_bookstore`)

| 구분 | 필드 |
|---|---|
| 신규 생성 시 **필수** | `gem`(int), `category`(str, 50자 절단) — `_BOOKSTORE_REQUIRED_ON_CREATE` (L584) |
| 선택 (기본값) | `name`(기본 `book.book_nm`, 100자 절단) · `downloads`(0) · `color`(NULL) · `category_id`(NULL) · `level_id`(NULL, 정수여야 함) |
| 서버가 세팅 | `hide='N'` · `book_id=NULL` · `admin_voca_book_id=book_id` · `created_at`/`updated_at` |

> ⚠️ **이미 `bookstore` 행이 있으면 payload를 전부 무시하고 `hide`만 토글한다** (L638-641).
> 값을 고치려면 이 API가 아니라 직접 UPDATE해야 한다.
> 그리고 토글은 엄격한 N↔Y 반전이 아니라 **`'N'` 외의 모든 값(NULL 포함)이 `'N'`(노출)로 바뀐다.**

---

## 9. Phase 5 — 환경 반영 (마이그레이션 + publish/apply)

### 9.1 두 경로가 따로 있다

| 대상 | 경로 |
|---|---|
| **스키마 변경** (§4.3 조인 테이블, §5.1 `word_type`) | `migrations_dict/` alembic. 컨테이너 시작 시 `flask db upgrade` 자동 실행 |
| **데이터** (적재 결과) | **MinIO 허브 publish/sync** — 아래 9.2 |

**데이터는 마이그레이션으로 옮기지 않는다.** git에 SQL을 올리지도 않는다.

### 9.2 데이터 전파 — publish 하고 `dict_pointer.json`을 커밋해야 한다

메커니즘이 **두 개** 있다. 혼동하지 말 것.

| 경로 | 트리거 | 파일 |
|---|---|---|
| **(A) git 기반 자동 동기화** ← 실제로 쓰는 것 | 컨테이너 시작 시 `docker-entrypoint.sh:6-9`가 자동 호출 | `scripts/dict_publish.py` / `scripts/dict_sync.py` / **`db/dict/dict_pointer.json`** |
| (B) admin UI publish/apply | 관리자가 화면에서 버튼 클릭 | `app/services/dict_manage.py` |

**(A)의 흐름 — 이 순서를 지켜야 반영된다:**

```
1. 로컬에 적재 (Phase 0~4)
2. scripts/dict_publish.py 실행
     → MinIO에 dump 업로드
     → db/dict/dict_pointer.json 갱신 (version, sha256)   ← git 추적 대상!
3. dict_pointer.json 을 커밋 & 푸시                        ← 빼먹으면 아무 환경도 못 받는다
4. 각 환경 컨테이너 재시작
     → docker-entrypoint.sh → scripts/dict_sync.py
     → pointer의 sha256 vs dict_meta 비교 → 다르면 MinIO에서 받아 import & swap
```

🚨 **`dict_pointer.json` 커밋을 빼먹는 것이 가장 흔한 실수다.** MinIO에 dump는 올라갔지만
각 환경은 여전히 옛 pointer를 보고 있어 "publish 했는데 반영이 안 된다"가 된다.

- `dict_sync.py`는 **실패 시 컨테이너 부팅을 중단**시킨다 (`docker-entrypoint.sh:9`) → 잘못된 dump를 올리면 배포가 멈춘다
- prod는 swap 전 자동 백업, 검증 실패 시 복원 (`dict_sync.py` 흐름 4·10)
- `db/dict/CHANGELOG.md`도 git 추적 대상 → 변경 내역을 남길 것
- `DICT_AUTO_RESET=false`면 자동 동기화를 건너뛴다 (환경별 토글 확인)

### 9.3 마이그레이션

- 위치: `heyvoca_back/migrations_dict/versions/`
- **현재 dict DB head: `c1f0a2b3d4e5`** (= `add_pos_to_voca_meaning`)
- 새 마이그레이션은 `down_revision = 'c1f0a2b3d4e5'`로 체인
- **아직 작성되지 않았다.** 아래 2개를 직접 만들어야 한다.

| 순서 | 내용 |
|---|---|
| 1 | `admin_voca_book_map_meaning` / `admin_voca_book_map_example` 생성 (§4.3) |
| 2 | `voca.word_type` 추가 + 인덱스 (§5.1) |

데이터 백필/적재는 마이그레이션이 아니라 **`scripts/` 하위 파이썬 스크립트**로 작성
(레포 루트 `scripts/`. 기존 `label_voca.py`, `label_meaning_pos.py`, `voca_cleanup.py` 관례를 따른다.
`heyvoca_back/scripts/`는 `bootstrap_user_db.py` / `seed_test_users.py` 2개만 있는 별개 디렉토리다.)

```
scripts/migrate_admin_map_to_ids.py    # Phase 0 백필 (멱등, 재실행 안전)
scripts/backfill_word_type.py          # Phase 1 기존 50,634개 판정
scripts/import_toeic_vocalist.py       # Phase 2~4 (전처리 + 병합 적재 + 단어장 생성)
```

**적재 스크립트 안전장치 (전부 필수)**

- `--dry-run` — 집계만 출력하고 커밋하지 않음 (신규/재사용 voca · 신규 뜻 · 신규 예문 · skip 건수)
- 파일 단위 **단일 트랜잭션**, 실패 시 rollback
- **같은 `book_nm`의 `admin_voca_book`이 이미 있으면 중단** — 중복 실행 방지. 120개를 순회하므로 중간 실패 후 재실행이 흔하다
- 생성한 신규 id 전량을 `scripts/out/import_toeic_ids_{timestamp}.json`에 기록 (§11.3 롤백용)
- 종료 시 요약 리포트 출력

### 9.4 🚨 publish/apply의 함정 — alembic 리비전이 덮어써진다

`dict_manage.py`를 직접 확인한 결과:

- publish는 **스키마 전체를 mysqldump**한다 (테이블 목록 기반이 아님, `_dump()` L111-117)
- apply는 **temp DB에 import 후 `heyvoca_dict`를 DROP하고 스왑**한다 (L327-348)

**따라서:**

✅ **새 테이블은 자동으로 전파된다.** mysqldump가 `CREATE TABLE`을 포함하므로 조인 테이블 2개를
어디에 등록할 필요가 없다.

> `TRACKED_TABLES`(L35)는 이 모듈에서 **한 번도 참조되지 않는 죽은 코드**다.
> 실제로 쓰이는 건 `COUNT_TABLES`(L42)뿐이고, UI의 단어 수 비교에만 쓴다.
> (`scripts/dict_publish.py:37`에 같은 이름의 다른 리스트가 있고 거기선 실제로 쓰인다 — 두 리스트는 이미 드리프트됨)
> 2026-07-22자 선행 문서가 "TRACKED_TABLES에 대상 테이블이 전부 포함되어 있다"고 적었지만,
> 그 사실이 중요한 게 아니라 **whole-schema dump라서 무관**한 것이다.

🚨 **`alembic_version` 테이블도 dump에 포함된다.** apply하면 **대상 환경의 alembic 리비전이
소스 환경 값으로 조용히 덮어써진다.** 그리고 apply는 마이그레이션을 실행하지도, 스키마 버전을
확인하지도 않는다.

→ **순서를 반드시 지킬 것:**
1. 코드(마이그레이션 파일)를 먼저 배포해 **모든 환경에서 `flask db upgrade`가 끝난 상태**로 만든다
2. 그 다음에 publish → apply

거꾸로 하면 대상 환경 코드가 모르는 리비전이 `alembic_version`에 박히고, 이후 `flask db upgrade`가
"리비전을 찾을 수 없다"로 실패한다. 복구는 `alembic_version` 수동 정정.

- apply 전 자동 백업: `/tmp/dict_backup_<ts>.sql` (L319-324), 예외 시 롤백 재import (L355-360)
- 손상 방지 가드는 `voca` 행 수만 확인 (L331) → **새 테이블은 보호받지 못한다**

---

## 10. 미결정 / 후속 과제

| 항목 | 내용 |
|---|---|
| `bookstore.gem` / `downloads` | day 1의 4개 단어장 가격. 기존 관례는 체험판 10 / 일반 20 |
| **코드 전환** | 조인 테이블을 읽도록 `admin_voca_books.py` / `admin.py` / `voca_books.py` / `auth.py` / `onboarding.py` 수정. 다운로드 시 id→텍스트 bake (§4.6) |
| TEXT 컬럼 제거 | 코드 전환 완료 후 별도 마이그레이션으로 `voca_meanings` / `voca_examples` DROP |
| **예문 강조 태깅** | `scripts/tag_examples.py` — 한국어 태그 0/1,336 (§2.8). Kiwi 1차 + GPT 배치, **비용 판단 필요** |
| 영문 태그 누락 396건 | 빈칸채우기 출제 불가. 태깅 작업에 포함 |
| 숙어 노출 | `word_type` 필터 해제 + `word_count` 재계산 배치 |
| `notes` | 필요해지면 JSON에서 재적재 (536개) |
| 나머지 116개 단어장 | 서점 노출 방식 (묶음 구매? 코스 UI?) 미정 |
| 대소문자 중복 `voca` | 1,511쌍 잔존. 커밋 `abb19d6`에서 일부 병합했으나 미완 |

---

## 11. 검증 / 롤백

### 11.1 Phase 0 완료 후

```sql
-- 조인 테이블 행 수
SELECT COUNT(*) FROM admin_voca_book_map_meaning;
SELECT COUNT(*) FROM admin_voca_book_map_example;

-- 뜻이 하나도 연결되지 않은 map (있으면 백필 실패)
SELECT m.id, m.voca_id, m.voca_meanings
FROM admin_voca_book_map m
LEFT JOIN admin_voca_book_map_meaning j ON j.map_id = m.id
WHERE j.map_id IS NULL
  AND m.voca_meanings IS NOT NULL AND m.voca_meanings != '[]';

-- en/ko 키 잔존 확인 (기대: 0)
SELECT COUNT(*) FROM admin_voca_book_map WHERE voca_examples LIKE '%"en"%';
```

### 11.2 Phase 3~4 완료 후

```sql
-- 단어장 120개 / map 5,165행
SELECT COUNT(*) FROM admin_voca_book WHERE category = '토익';
SELECT COUNT(*) FROM admin_voca_book_map m
  JOIN admin_voca_book b ON b.id = m.book_id WHERE b.category = '토익';

-- 서점 노출 4개
SELECT id, name, category, hide, admin_voca_book_id FROM bookstore WHERE category = '토익';

-- word_type 분포
SELECT word_type, COUNT(*) FROM voca GROUP BY word_type;

-- TEXT와 조인 테이블 정합성 (개수 불일치 = 버그)
SELECT m.id, JSON_LENGTH(m.voca_meanings) txt_cnt, COUNT(j.meaning_id) join_cnt
FROM admin_voca_book_map m
JOIN admin_voca_book b ON b.id = m.book_id AND b.category = '토익'
LEFT JOIN admin_voca_book_map_meaning j ON j.map_id = m.id
GROUP BY m.id HAVING txt_cnt != join_cnt;
```

프론트 확인: 서점 노출 → 다운로드 → **예문 문제(빈칸채우기) 출제** → 발음 렌더링.

### 11.3 백업 / 롤백

```bash
docker exec heyvoca_mysql_local bash -c \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" heyvoca_dict' \
  > db/backups/heyvoca_dict_전_$(date +%Y%m%d_%H%M).sql
```

| Phase | 롤백 방법 |
|---|---|
| 0 | 조인 테이블 2개 `DROP` (TEXT 컬럼 그대로라 서비스 영향 없음). 단 `en`/`ko`→`origin`/`meaning` UPDATE는 되돌리기 어려움 → **이 UPDATE 전에 별도 백업** |
| 1 | `voca.word_type` 컬럼 `DROP` |
| 3 | 생성한 신규 id를 `scripts/out/import_toeic_ids_{timestamp}.json`에 기록하고 역순 삭제. `voca_meaning`/`voca_example`은 map부터 |
| 4 | `bookstore` 4행 + `admin_voca_book` 120행 삭제 (map은 FK CASCADE) |
| 5 | apply 실패 시 `/tmp/dict_backup_<ts>.sql`로 자동 롤백. publish는 이전 버전 객체가 남아있어 재apply 가능 |

### 11.4 선행 문서(`docs/voca_json_import_plan.md`) 정정 내역

| 항목 | 선행 문서 (2026-07-22) | 실측 (2026-08-20) |
|---|---|---|
| `notes` | "현재 전부 빈 문자열" | **536개에 내용 있음** (토익 학습 팁 HTML) |
| 발음 us==uk 비율 | "80.7%" | **16.6%** (199/1,198). us!=uk 435, us만 564 |
| 영문 예문 태그 | "이미 강조 태그가 있음" | **940/1,336만 있음** (396건 누락) |
| `TRACKED_TABLES` | "대상 테이블이 전부 포함되어 있다" | `dict_manage.py`에서는 죽은 코드. whole-schema dump라 무관 (§9.4) |
| 데이터 전파 방법 | "admin의 올리기(publish)를 실행" | 그건 (B) 경로. 실제 운영은 **(A) `dict_publish.py` + `dict_pointer.json` 커밋 + 컨테이너 재시작**이다 (§9.2) |
| 스크립트 선례 경로 | "`scripts/`에 `bootstrap_user_db.py` 선례" | 그 둘은 **`heyvoca_back/scripts/`**. 루트 `scripts/`에는 `label_voca.py` 등 14개가 있고 이번 스크립트는 루트로 간다 (§9.3) |
| `bookstore/toggle` 위치 | `admin_voca_books.py:586` | 현재 **587** (드리프트) |
| 임포트 범위 (미결) | 팀 논의 대기 | 파일 단위 120개로 확정 |
| `en`/`ko` 키 (미결) | 신규는 origin/meaning 제안 | 신규 + 기존 3,787행 모두 통일로 확정 |
| pos 저장 (결정) | "pos는 버리고 text만" | 조인 테이블 전환으로 무관 — pos는 `voca_meaning.pos`에 이미 있음 |

---

## 12. 조사 재현 — `scripts/analyze_toeic_vocalist.py`

이 문서의 모든 수치를 재생산하는 **읽기 전용** 스크립트. DB에 아무것도 쓰지 않는다.

```bash
# 전체
./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py

# 섹션별
./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --section db      # DB 현황
./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --section source  # JSON 분석
./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --section diff    # 대조 + 적재예상

# JSON 폴더 위치가 다르면
./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --src /path/to/dummy_vocalist
```

DB/소스가 바뀌었거나 표의 숫자가 의심되면 이걸 먼저 돌려 확인할 것.
**적재 스크립트는 이 파일의 정규화 함수를 재사용해야 한다** (§6).

---

## 부록 A. 로컬 환경

```bash
# DB 접속 (dict)
mysql -h 127.0.0.1 -P 3310 -u voca -p'voca!@34' heyvoca_dict

# 파이썬 (pymysql 설치돼 있음)
./heyvoca_back/.venv/bin/python

# 마이그레이션
docker exec -it heyvoca_back_local bash -c "flask db current"
docker exec -it heyvoca_back_local bash -c "flask db upgrade"
```

`.env.local`의 `DATABASE_URL_DICT`에 접속 정보가 있다 (비밀번호가 URL 인코딩돼 있어
`urllib.parse.unquote` 필요 — `analyze_toeic_vocalist.py:db_connect()` 참고).

## 부록 B. 참고 코드 위치

| 내용 | 위치 |
|---|---|
| 모델 정의 | `heyvoca_back/app/models/models.py` — `Voca` 173, `VocaLabel` 204, `VocaMeaning` 235, `VocaExample` 251, `Bookstore` 263, `AdminVocaBook` 628, `AdminVocaBookMap` 644 |
| admin 단어장 API (신) | `heyvoca_back/app/routes/admin_voca_books.py` |
| `_normalize_meanings` / `_normalize_examples` | `admin_voca_books.py:329, 344` |
| 기존 적재 로직 (재사용 불가, §7.2) | `heyvoca_back/app/routes/admin.py:544 _process_word_into_book` |
| 서점 다운로드 → user 복사 | `heyvoca_back/app/routes/voca_books.py:509` |
| user 사전 조회 | `heyvoca_back/app/routes/voca_indexs.py` |
| 예문 강조 | `heyvoca_back/app/utils/example_tagging.py:155 apply_emphasis` |
| dict DB publish/apply | `heyvoca_back/app/services/dict_manage.py` (`_dump` 111, `apply_version` 327) |
| 예문 문제 출제 — `ex.origin` 의존 | `heyvoca_front/src/plugins/questionTypes/index.js:5-9, 26-27` |
| 발음 렌더링 | `heyvoca_front/src/components/newfullsheet/WordDetailNewFullSheet.jsx:118` |
| 라벨링 스크립트 (스타일 기준) | `scripts/label_voca.py`, `scripts/label_meaning_pos.py` |
