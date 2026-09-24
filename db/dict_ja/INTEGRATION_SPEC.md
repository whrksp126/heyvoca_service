# 일본어 학습 연동 규격 (2단계) — 모든 도메인 에이전트 공통 계약

작성 2026-09-25. 사용자 결정: **사용자 학습 언어 전환 모드** + 실험실(베타) 플래그 + JLPT 분권 서점. 새 UI는 (1) 실험실 토글 "다른 언어 학습하기", (2) 홈 왼쪽 상단 현재 언어 표시, (3) 언어 전환 바텀시트 뿐. 나머지 화면은 현재 언어에 맞춰 그대로 동작한다.

## 1. 언어 코드·값
- 언어 코드: `'en'`(영어, 기본) / `'ja'`(일본어). 향후 확장 가능하도록 상수 `SUPPORTED_LEARNING_LANGS = ('en','ja')`.
- 표시명: en=영어, ja=일본어. 이모지·국기 금지(디자인 규칙), 아이콘은 Phosphor `Translate`.

## 2. 사용자 DB (heyvoca_user) — 마이그레이션 1개, 전부 기본값 'en' 백필
| 테이블 | 컬럼 | 비고 |
|---|---|---|
| user | `learning_lang VARCHAR(8) NOT NULL DEFAULT 'en'` | 현재 학습 언어 |
| user_voca_book | `language VARCHAR(8) NOT NULL DEFAULT 'en'` + index | 단어장 언어 |
| user_voca | `dict_lang VARCHAR(8) NOT NULL DEFAULT 'en'` + index(user_id, dict_lang) | voca_id 가 어느 사전인지 |
| user_study_log | `dict_lang VARCHAR(8) NOT NULL DEFAULT 'en'` + index | 통계 필터용 |
- 중복 제거 키: UserVoca `(user_id, word)` → `(user_id, dict_lang, word)`.
- 새로 만드는 단어장/단어/로그는 항상 `current_user.learning_lang` 을 기록한다.

## 3. 백엔드 라우팅 (heyvoca_back)
- `g.dict_lang`: `token_required` 가 current_user 를 정하면 `g.dict_lang = current_user.learning_lang`. 비인증 엔드포인트(온보딩 게스트, tts 게스트, admin)는 `?lang=` 쿼리(없으면 헤더 `X-Dict-Lang`, 없으면 'en'). admin 프록시는 헤더를 버리므로 admin 은 항상 `?lang=`.
- 사전 바인드 라우팅: `SQLAlchemy` 서브클래스 → `create_session` 에서 `SignallingSession` 서브클래스 사용, `get_bind()` 결과가 dict 엔진이고 `g.dict_lang=='ja'` 이면 `dict_engine.execution_options(schema_translate_map={None: config.DICT_SCHEMA_JA})` (모듈 캐시) 반환. `g` 없으면 'en'. **한 요청에 두 언어 사전을 섞어 읽지 않는다**(identity map 충돌).
- 확장 테이블 모델(`bind_key='dict'`, `info={'ja_only': True}`): `VocaJa(voca_ja)`, `VocaMeaningJa(voca_meaning_ja)`, `VocaExampleJa(voca_example_ja)` — 컬럼은 `db/dict_ja/scripts/schema_dict_ja.sql` 참조. migrations_dict autogenerate 와 `scripts/verify_schema.py` 는 `info.ja_only` 테이블을 제외한다.
- 원시 SQL 의 `heyvoca_dict.` 접두어(search.py 5블록)는 `dict_schema()` 헬퍼(현재 언어 스키마명)로 치환.
- `config.py`: `DICT_SCHEMA_JA = os.getenv('DICT_SCHEMA_JA', 'heyvoca_dict_ja')`.
- 사전 발행/적용(`dict_manage`): 상수를 언어별 dict 로(`{'en': {schema:'heyvoca_dict', prefix:'dict', index:'dict/dict_index.json'}, 'ja': {schema:'heyvoca_dict_ja', prefix:'dict_ja', index:'dict_ja/index.json'}}`), 모든 함수에 `lang='en'` 인자, `dict_admin` 4개 엔드포인트 `?lang=`. ja 인덱스 형식은 `db/dict_ja/dict_ja_pointer.json`·objectstore `dict_ja/index.json`(`{latest, versions:[{version,key,sha256,size,counts,created_at}]}`) — key 가 `.sql.gz` 이므로 apply 시 gunzip 필요.
- `docker-entrypoint.sh`: `flask db upgrade --directory migrations_dict` 를 ja 스키마에도 실행(`DICT_BIND_LANG=ja` 환경변수로 env.py 가 translate 엔진 사용). 스키마가 없으면 건너뛰고 경고(로컬/서버 최초는 dump import 로 생성).

## 4. API 계약 (프론트·앱이 의존)
- `GET /auth/me`(또는 사용자 프로필 응답)에 `learning_lang` 포함. `PATCH /auth/me`(기존 updateUserInfo 경로)에 `learning_lang` 허용(값 검증).
- 실험실: `/lab/settings` features 에 `multi_lang` 플래그 추가(기본 off). 백엔드는 플래그와 무관하게 learning_lang 을 존중(프론트가 노출만 게이트).
- **단어 객체 공통 필드**(사전 검색·서점·단어장·추천·학습 모든 응답): `language`('en'|'ja'), ja 이면 추가 `reading`(히라가나), `romaji`, `jlpt`('N5'..'N1'|null). `pronunciation` 은 ja 에서 reading 과 동일 값. 예문 객체: `{origin, meaning, reading_tokens?}` — `reading_tokens` 는 ja 예문에만, 형식 `[[surface, reading|null(, okurigana)]...]`(dict_ja `voca_example_ja.reading_tokens` 그대로).
- 단어장 객체: `language` 필드. `GET /vocaBooks`·`/vocaIndexs`·`/study/*`·`/stats`·`/farm/*`·홈 피드는 **현재 learning_lang 것만** 반환.
- 사전 검색: 기존 엔드포인트 유지. ja 모드에서 `/search/partial/en` 은 `voca.word LIKE 'q%'` OR `voca_ja.reading LIKE 'q%'`(가나 입력)로 검색하고 결과에 reading/jlpt 포함. `/search/partial/ko` 는 뜻 검색(그대로). 최소 길이 ja=1.
- 서점·온보딩 레벨 단어장: 스키마 라우팅으로 ja 서점이 자동 노출. 온보딩(가입 전)은 영어 고정. ja 로 처음 전환 시 서점에 JLPT 분권 책이 있으므로 별도 레벨 단어장 불필요.
- TTS: `language=ja` 허용(Edge `ja-JP-NanamiNeural` 기본, gTTS 폴백 ja), `/tts/voice-options` 에 ja 큐레이션 3~4개, `_exists_in_dict` ja 분기(공백 규칙 대신 `voca.word`/`voca_ja.reading`/예문 포함 검사).
- 채팅 학습 `/study/chat-session`: 각 question 에 `language` 포함. 앱이 ja 를 지원하지 않는 버전(브릿지 계약 버전 미달)이면 ja 모드에서 `{"available": false, "reason": "app_update_required"}` 반환.
- OCR `/ocr/words`: `?lang=` 또는 현재 언어로 사전 대조(ja 는 소문자화 금지).

## 5. 프론트 (heyvoca_front)
- `UserContext`: `learningLang`(기본 'en'), `setLearningLang(lang)` → PATCH 후 VocabularyContext·StatsContext·ExampleSettings 등 전부 재조회(`reloadAll`).
- 헬퍼 `utils/lang.js`: `wordLang(word, fallback=learningLang)`, `LANG_LABEL`, `isJa`. 모든 `'en'` 하드코딩을 `wordLang(word)` 로.
- TTS 화이트리스트(`utils/common.jsx` 3곳, `api/tts.jsx` 2곳) → `SUPPORTED_TTS_LANGS=['en','ko','ja']`. `collect*Texts` 는 단어 언어 사용. `WORD_TOKEN_RE` 는 ja 예문 건너뜀. GET 파라미터 URL 인코딩 수정.
- 실험실: 토글 "다른 언어 학습하기(베타)" — `features.multi_lang`. 켜지면 홈 헤더 왼쪽 상단에 `Translate` 아이콘 + 현재 언어명 칩. 탭 → 바텀시트 "학습 언어" 목록(영어/일본어, 현재 표시). 선택 → `setLearningLang` → 토스트 "일본어 학습으로 전환했어요".
- 단어 UI: ja 단어는 발음 줄 자리에 `reading`(romaji 는 표시 안 함, 데이터만), 단어 옆 JLPT 배지(VerifyMark 배지 스타일 복제, `text-[10px] font-[800]`, 색은 secondary.blue 계열). 예문은 `FuriganaText`(reading_tokens → `<ruby>surface<rt>reading</rt></ruby>`, 송가나는 rt 밖, `target-word` strong 유지). 설정 "예문 보기" 옆에 "후리가나 표시" 토글(localStorage, 기본 켬). `index.css` 에 ruby/rt 스타일(rt: 10px, gray-300), 폰트 스택에 `"Noto Sans JP","Hiragino Sans","Yu Gothic"` 폴백 추가, ja 텍스트 요소에 `lang="ja"`.
- 사전(dictionary/Main): ja 모드면 detectLang 이 가나·한자 → 'en' 엔드포인트(ja 사전), 최소 길이 1, 내 단어 매칭은 dictionaryId 우선. 담기(PickPlot/AddWord)에 `vocaId`/`reading`/`language` 전달, AddWord 자동완성 엔드포인트 언어 분기.
- 단어장 생성·업로드 payload 에 `language: learningLang`(UI 선택 없음). 업로드 시트의 영어 문구(`Aa`, `영어 보고 한글`)는 ja 모드에서 `あ`, `일본어 보고 한글`.
- 문제 유형: fillInTheBlank 토큰화는 ja 에서 문자 단위 탭 비활성(reading_tokens 있으면 토큰 단위 탭 + 말풍선), 단어 수 판정은 ja 에서 문자 수. cardMatch 등은 TTS 언어만.
- 학습 추천 매핑(`pages/TakeTest.jsx` 화이트리스트)에 `language, reading, jlpt, pronunciation` 추가.
- 음성 설정에 `ja: '일본어'`.

## 6. 앱 (heyvoca_app) — 이번엔 코드만, 릴리스는 별도
- `ttsService.ts` language 타입에 'ja'. `ChatStudyScreen` 은 `question.language` 사용. `ocrHelper.ts` `recognize(path, script)` — `openImagePicker` props `{source, lang}` → ja 면 'Japanese' 스크립트 + 가나·한자 필터. 브릿지 계약 버전 상향(웹이 감지).

## 7. 데이터 (db/dict_ja)
- JLPT 분권 서점 생성 스크립트 `scripts/60_make_jlpt_books.py`: `voca_ja.jlpt` 기준 N5→N1, 300단어 내외 분권(jmdict_id 순), `admin_voca_book`(language='일본어', source='JLPT'), `admin_voca_book_map`(voca_meanings JSON = 뜻 문자열 배열, voca_examples JSON = `[{origin, meaning, reading_tokens}]`), `bookstore`(category 'JLPT', gem 기본값, color 팔레트 순환), `bookstore_category`. 이후 dump 재발행(20260925-1).
