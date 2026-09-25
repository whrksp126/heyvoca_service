# 일한(日韓) 사전 구축 계획 — heyvoca_dict_ja

작성 2026-09-24. 영한 사전(heyvoca_dict)과 같은 구조로, 즉시 서비스에 쓸 수 있는 일본어→한국어 사전을 만든다.

## 결정 사항 (사용자 확정)
- 범위: JMdict 상용어 최대(약 2만 이상) + JLPT N5~N1 전체
- 저장: **별도 스키마 `heyvoca_dict_ja`** (영한 테이블 구조 복제 + 일본어 전용 컬럼). 앱 연동(언어 라우팅·TTS ja)은 2단계.
- 예문: Tanaka/Tatoeba 코퍼스 우선, 부족분만 LLM 생성. 한국어 해석은 전부 LLM.
- 후리가나: 예문별 토큰 읽기 데이터를 별도 컬럼에 저장.

## 원칙
- 골격(표제어·읽기·품사·예문 원문·강조 위치·급수·빈도·액센트)은 검증된 공개 사전에서 **결정론적으로** 생성. 크롤링 없음.
- LLM(Claude Code 서브에이전트: 생성=Sonnet, 심사=Opus)은 **한국어화**에만 사용. 규칙 기반 자동 판정으로 뜻/품사를 정하지 않는다.
- 검증 3중: 자동 규칙 → 외부 대조(국립국어원 한-일 학습사전 역방향 등) → 독립 심사(현재 값을 감추고 재판정 + 패턴 탐지).
- 호스트에 pip 설치 금지. 모든 스크립트는 컨테이너 `heyvoca_dictja_work`(python:3.11-slim, `/work` = `db/dict_ja`) 안에서 실행.

## 데이터 소스와 라이선스
| 소스 | 용도 | 라이선스 |
|---|---|---|
| JMdict (jmdict-simplified JSON, EDRDG) | 표제어·읽기·품사·영어 gloss·상용 태그·misc(uk 등) | CC BY-SA 4.0 (출처 표기 필요) |
| Tatoeba `jpn_indices` + 문장 | 일-영 예문 + 단어 색인(`표제어(읽기)[뜻번호]{활용형}~`) | CC BY 2.0 FR |
| JLPT 리스트 (tanos / yomitan-jlpt-vocab) | 급수 | CC BY |
| Kanjium accents.txt | 피치 액센트 | CC BY-SA 4.0 |
| fugashi + unidic-lite, pykakasi | 형태소 분석(활용형→기본형, 읽기), 로마자 | BSD / MIT 계열 |
| Edge TTS `ja-JP-*Neural` | 음성(2단계) | 무료 |

앱 설정에 출처 표기 페이지 필요(2단계).

## 스키마 (heyvoca_dict_ja) — 영한과 동일 + 확장
- `voca`: id, word(표기; uk면 가나), pronunciation(=히라가나 읽기), level, is_active
  - 확장 `voca_ja`: voca_id PK, reading(히라가나), romaji, kanji_forms(JSON), kana_forms(JSON), jlpt(N1~N5), freq_rank, accent(피치), jmdict_id, uk(bool)
- `voca_meaning`: id, meaning(한국어), pos(UD 15종) + 확장 `sense_no`(JMdict 뜻 번호), `en_gloss`(감사용, 앱 미노출)
- `voca_example`: id, exam_en(→일본어 원문, 컬럼명은 영한과 호환 유지), exam_ko(한국어 해석) + 확장 `reading(JSON 토큰 읽기)`, `source`(tatoeba id / generated), `sense_no`
- 매핑 테이블 3종, voca_label·voca_meaning_concept는 동일 구조로 생성만(빈 채로).
- 강조: 영한과 동일 `<strong class="target-word">…</strong>`, 원문·해석 각 1곳.

## 파이프라인
1. `scripts/00_download.sh` — 소스 내려받기 (`sources/`)
2. `scripts/10_build_entries.py` — 표제어 선정 + 골격 → `build/entries.jsonl`
3. `scripts/20_build_examples.py` — 예문 매칭·강조·후리가나 → `build/examples.jsonl`
4. `scripts/30_make_batches.py` — 한국어화 배치(`batches/`) 생성 / `35_apply_batches.py` 적용
5. `scripts/40_verify.py` — 자동 검증 + 외부 대조 리포트(`audit/`)
6. `scripts/50_load_mysql.py` — heyvoca_dict_ja 적재 → dump 발행
7. `scripts/60_make_jlpt_books.py` — JLPT 급수별 분권 서점(bookstore_category/admin_voca_book/admin_voca_book_map/bookstore). 멱등, `--reset` 은 이 4테이블만 비우고 재생성
   - **재적재 시 서점이 사라진다**(50 `--reset` 은 스키마 DROP, `--truncate` 는 voca 재적재) → 50 에 `--with-books` 를 붙이면 적재 직후 60 `--reset` 을 자동 실행. 붙이지 않았으면 50 이 경고를 내고, 60 `--reset` 을 따로 돌린 뒤 dump 한다.
   - 권장: `50 --truncate --with-books --verify` → `51_dump_upload.sh --build-version <버전>` (또는 한 번에 `51_dump_upload.sh --truncate --with-books --verify --build-version <버전>`)

## 진행 로그
- 2026-09-24: 조사 완료, 결정 확정, 작업 컨테이너 준비.
- 2026-09-24: 1단계 완료 — 00_download.sh(JMdict 3.6.2+20260921, Tatoeba, Kanjium, yomitan-jlpt-vocab) + 10_build_entries.py → build/entries.jsonl 23,152항목/37,571 sense (common 22,639 ∪ JLPT 7,748, JLPT 7,735 부착, accent 92.8%). 통계·우려점 build/stats_entries.md.
- 2026-09-24: 1단계 보정 — jlpt_overrides.json(20건), 전각→반각 정규화, kanji_forms/kana_forms 객체 배열({text,tags,common}; kana 는 +appliesToKanji)로 변경. 23,149항목.
- 2026-09-24: 2단계 완료 — 20_build_examples.py(38s) → build/examples.jsonl 48,433예문(항목당 ≤4, 16,660항목=72.0%; N5 99.6%·N4 99.0%·N3 98.8%·N2 94.3%·N1 87.7%), 색인 토큰 1,178,438 중 90.7% 해석, 색인 0개 항목은 전체 jpn_sentences 형태소 (표기,읽기) 유일 매칭으로 1,635항목 보충(span_method=unindexed, verified=false). 예문 0개 6,489항목 → build/need_generation.json. 풀 97,269(examples_pool.jsonl). 통계 build/stats_examples.md. 1단계 JLPT 오부착 의심 10건(これ/そう/ああ/こと/もし/やや/しばしば/だんだん 등 dup_headword 쪽에 급수) 발견.
- 2026-09-24: 2단계 보정 재실행 — jlpt_overrides.json +16건(これ/もし/やや/しばしば/だんだん/そう/こと 급수 이관, レバー(lever) N1 추가; ああ·か 는 매핑 정상이라 제외) → entries 23,143. 예문: 상한 4→3(sense 다양성 최우선), 원문 전각 영숫자 반각화, reading_tokens 3원소([surface, 한자부 읽기, 송가나] / 비한자 [surface, null]), unidic 오독 보정표(私·言う·何). 선정 39,394예문, 16,656항목(72.0%), need_generation 6,487.
- 2026-09-24: 6단계 적재 스크립트 — scripts/schema_dict_ja.sql(heyvoca_dict 16테이블 SHOW CREATE 복제, DDL 비교 차이 0, alembic_version=6efb3b1f9711 stamp + 확장 voca_ja/voca_meaning_ja/voca_example_ja) + scripts/50_load_mysql.py(jmdict_id 순 결정론 id, --reset/--truncate/--allow-missing-meanings/--verify/--verify-only/--selftest). --selftest 전부 통과(heyvoca_dict_ja_selftest 생성→DROP). 로컬 heyvoca_dict_ja 에 entries 만 적재: voca/voca_ja 23,143, 뜻·예문 0(meanings/examples_ko 미생성), level 1=667·3=630·5=1,649·7=1,738·9=3,047·10=15,412.
- 2026-09-24: 3단계 스크립트 완료 — scripts/30_make_batches.py(meaning 100/example ≤150/example_gen 50, manifest.json 으로 순번→jmdict_id(+tatoeba id) 키, 멱등 추가) + 35_apply_batches.py(검증·재시도 retry1~3·manual_review·--status, 누적 산출물 매번 재작성) + batch_common.py. 예문 배치가 sense 판정·X 거부까지 맡도록 PROMPT_example.md(변형 A/B)·BATCH_FORMAT.md 개정. 시뮬레이션(meaning 1·example 1·example_gen 1 배치, 의도적 오류 포함) 통과 후 테스트 산출물 전부 삭제. 예상 규모 meaning 232·example ≈270·example_gen 130(+fill-senses) 배치.
- 2026-09-24: 뜻 한국어화 232배치 완료(23,143항목·37,554 sense, Sonnet 코디네이터 10배치/에이전트 + 하위 병렬). 중간 블라인드 감사(Opus, 120 sense): 품사 일치 98.3%, 오역 ~2~3%, ADJ `~다` 종결 80건 → 오버레이 정정 진행. 예문 배치 266개 생성·해석 진행 중, 예문 생성 130배치 대기.
  실행 템플릿: RUN_TEMPLATE_meaning.md / RUN_TEMPLATE_example.md / RUN_TEMPLATE_example_gen.md (코디네이터 1개에 배치 10개, 하위 4개 병렬; 세션 동시 한도 20).
- 2026-09-24: 생성 예문 감사 후속 — scripts/reading_fix.py(표제어 구간 후리가나 사전 읽기 고정, 50 적재 시점 적용·--verify 검사·--build-only 집계; Tatoeba 776·생성 426 교체), example_gen_overrides.jsonl(한국어 강조 안 조사 분리 12건), カーン 뜻 정정(meaning_overrides), 재생성 배치 batch_regen_0001(78단어) + 47_apply_regen.py, 35 example_gen 검증에 강조 형태소 경계·`순번|X|사유` 거부 추가, PROMPT_example.md 변형 B 규칙 11~14.
- TODO(적재 전): 성적·비속 표제어 필터 — JMdict misc(vulg/X)로 sense는 걸렀지만 표제어 자체가 성적인 항목(예: フェラチオ)이 남아 있음. gloss 키워드 + LLM 분류로 목록화해 `is_active=false` 처리(삭제 대신 비활성).

## 결과 (2026-09-24 완료, 사전 버전 20260924-1)
- 적재 완료: 로컬 `heyvoca_dict_ja` — voca 23,143 / 뜻 53,613 / 예문 53,909(Tatoeba 38,921 + 생성 14,988) / 비활성 20. 뜻 없는 항목 0, 예문 없는 항목 23(접사·단독 용법 없음).
- dump: `build/heyvoca_dict_ja_v20260924-1.sql.gz` → objectstore `heyvoca/dict_ja/` + `dict_ja/index.json`. 포인터 `dict_ja_pointer.json`.
- 품질 감사(Opus 블라인드): 뜻 품사 일치 98.3%·오역 ~2~3%, 예문 해석 심각 오류 ~2%, 생성 예문 오류 ~3%. 정정 오버레이(뜻 128행, 예문 1,087행+재번역 22, 생성 168행) 반영. 후리가나는 적재 시 표제어 구간을 사전 읽기로 고정(Tatoeba 776·생성 426 교정).
- 재현: 전 산출물은 `batches/`(_out.txt)와 `build/*_overrides.jsonl`에서 `35 → 50` 으로 결정론적으로 재생성 가능(`50 --reset --verify --dump`).

## 서점 단어장 (2026-09-25, 사전 버전 20260925-1)
- JLPT 활성 7,731단어 → 25권(N5 2·N4 2·N3 5·N2 6·N1 10), 권당 289~334단어. 분권은 `--split even`(기본: 권수=round(n/300), 크기 균등). `--split greedy`(300씩 + 꼬리 <150 합침)는 N3 마지막 권이 449가 돼서 기본에서 뺐다.
- map: 뜻 배열(중복 제거) + 예문 최대 3개 `{origin, meaning, reading_tokens}` 20,786개. 예문 없는 JLPT 단어 9개는 빈 배열로 포함.
- bookstore: category 'JLPT'(sort 0, id 1), gem 10, hide 'N', color = 영한 테마 토큰 5색(primary-main/purple/blue/mint/yellow) 순환.
- `51_dump_upload.sh --build-version 20260925-1 --with-books` 로 재발행(50 은 `--build-version` 명시 시 dict_meta.build_version 을 갱신한 뒤 dump). 포인터 갱신.

## 남은 일 (2단계)
1. ~~MinIO 정책~~ 불필요 — RO·RW 키 모두 `heyvoca/*` 전체 읽기 가능(2026-09-25 objectstore 담당 확인). HEAD 403 은 presigned GET URL 을 HEAD 로 친 SigV4 메서드 불일치였고, 50 스크립트는 list 기반 검증으로 교체함.
2. **앱 연동**: 언어 라우팅(검색·단어장·TTS `ja` 추가, `_SUPPORTED_LANGS`), Flask 모델 `bind_key='dict_ja'`, 후리가나 표시(reading_tokens 3원소 → ruby), JLPT 필터, 출처 표기 페이지(JMdict/EDRDG CC BY-SA, Tatoeba CC BY, Kanjium CC BY-SA, 국립국어원 CC BY-SA).
3. dev/prod 에 스키마 생성 후 dump import(50 의 import 검증은 MySQL 8 로컬에서 확인됨).
4. 사람 검수 권장: `audit/inactive_review.md` 경계 사례(성 관련 의학 용어 keep 방침), 예문 없는 23항목, 생성 예문 문체 편중(평서체 97%).

## 2단계 앱 연동 (2026-09-25 dev 배포 완료, 커밋 7415584)
- 규격: `INTEGRATION_SPEC.md`. 사용자 학습 언어 전환 모드(실험실 `multi_lang` 베타 플래그), 홈 언어 칩·전환 시트.
- dev·prod: `heyvoca_dict_ja` 부트스트랩(20260925-1, dev 16초·prod 28초) + 사용자 DB 리비전 `9fdc12f3733a` 적용(2026-09-25 prod 배포 완료, 커밋 b7b0e87).
- prod 절차: `./deploy.sh prod` → `docker exec heyvoca_back_prod python3 -c "...dm.apply_version('20260925-1', lang='ja', publisher='me@prod')"` → `docker restart heyvoca_back_prod` → `dm.get_status(lang='ja')` in_sync 확인.
- 앱: 커밋 9a372c5(TTS ja·채팅 언어·OCR ja·X-App-Version). 릴리스 시 `bump-version.sh app 1.1.1`(웹 게이트 `openImagePickerLang`/`CHAT_JA_MIN_APP_VERSION`=1.1.1).
- 앱 1.1.1 릴리스(2026-09-25): iOS 빌드 19 제출 → WAITING_FOR_REVIEW, Android versionCode 23 → IN_REVIEW(앱 커밋 eb48d5a·12fc99e). 빌드 함정 2건: Xcode 27에서 fmt 11.0.2 consteval 실패 → Podfile에서 fmt 타깃만 C++17; Play가 targetSdk 35 AAB를 403 거부(2026-08-31 정책) → compile/target/buildTools 36. Play는 06:26 자동 게시(안내값 android=1.1.1 자동 반영, verify-deploy 통과). iOS는 20:49 REJECTED — 사유는 App Store Connect 해결 센터에서 사람이 확인해야 함(API 불가). 수정 후 `bump-version.sh app-build` → 재업로드 → `prepare 1.1.1 --build <n>` → `submit --yes`.
- 남은 일: 일본어 TTS 사전 프리워밍(`scripts/tts_prewarm.py` ja), origin/local 브랜치 동기화, admin 화면 언어 선택 UI(현재 `?lang=` 만).
