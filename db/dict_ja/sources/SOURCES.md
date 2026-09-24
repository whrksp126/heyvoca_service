# 일한 사전 원본 소스 (scripts/00_download.sh 로 받음, 2026-09-24)

재다운로드: `docker exec heyvoca_dictja_work bash scripts/00_download.sh` (있으면 건너뜀, `FORCE=1` 로 강제).

| 파일 | URL | 용량 | 라이선스 / 출처 표기 |
|---|---|---:|---|
| `jmdict/jmdict-eng.json.zip` → `jmdict-eng.json` | GitHub API `scriptin/jmdict-simplified` releases/latest 의 `jmdict-eng-<ver>.json.zip` (이번: 3.6.2+20260921173324, dictDate 2026-09-21) | 11.5MB / 118MB | JMdict © EDRDG, **CC BY-SA 4.0** (https://www.edrdg.org/edrdg/licence.html). jmdict-simplified 변환물 CC BY-SA 4.0 |
| `tatoeba/jpn_sentences.tsv(.bz2)` | https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2 | 3.4MB / 16.6MB (248,909 문장) | Tatoeba **CC BY 2.0 FR** (일부 CC0) |
| `tatoeba/eng_sentences.tsv(.bz2)` | https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2 | 24.9MB / 108.7MB | CC BY 2.0 FR |
| `tatoeba/kor_sentences.tsv(.bz2)` | https://downloads.tatoeba.org/exports/per_language/kor/kor_sentences.tsv.bz2 | 0.2MB / 0.9MB | CC BY 2.0 FR (참고용: 일-한 대역 소량) |
| `tatoeba/jpn-eng_links.tsv(.bz2)` | https://downloads.tatoeba.org/exports/per_language/jpn/jpn-eng_links.tsv.bz2 | 1.5MB / 4.1MB | CC BY 2.0 FR |
| `tatoeba/jpn-kor_links.tsv(.bz2)` | https://downloads.tatoeba.org/exports/per_language/jpn/jpn-kor_links.tsv.bz2 | 14KB / 36KB (2,262 링크) | CC BY 2.0 FR |
| `tatoeba/jpn_indices.tar.bz2` → `jpn_indices.csv` | https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2 | 2.9MB / 17.4MB (150,075 문장) | CC BY 2.0 FR (Tanaka Corpus 색인, JMdict 기준) |
| `kanjium/accents.txt` | https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt | 3.2MB (124,137행) | Kanjium **CC BY-SA 4.0** |
| `jlpt/n5..n1.csv` | https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/main/original_data/nX.csv | 432KB 합 | 저장소 **CC BY-SA 4.0**, 원 데이터 Jonathan Waller(tanos.co.uk) **CC BY** |

## JLPT 소스 선택

`stephenmk/yomitan-jlpt-vocab` 의 `original_data/*.csv` (컬럼 `jmdict_seq,kana,kanji,waller_definition`) 사용.
tanos 리스트 각 단어에 **JMdict sequence id** 를 붙인 데이터라 표기 매칭 없이 id 로 조인한다.
id 없는 행 14개(대부분 한자 단음 읽기 항목: 依【い】 등)만 (kanji, kana) 로 매칭 시도.

| 급수 | 행 | 급수 내 고유 id |
|---|---:|---:|
| N5 | 684 | 667 |
| N4 | 640 | 635 |
| N3 | 1,730 | 1,710 |
| N2 | 1,812 | 1,794 |
| N1 | 3,427 | 3,399 |
| 합 | 8,293 | 8,205 (급수 간 중복 제거 후 7,747, 쉬운 급수 채택) |

## 형식 메모

- `jpn_indices.csv`: `jpn_sentence_id \t eng_sentence_id(-1=없음) \t 색인` — 색인 토큰은 공백 구분,
  `표제어(읽기)[뜻번호]{문장 내 표층형}~` (괄호부 모두 선택적, `~` = 검수된 좋은 예문).
- `accents.txt`: `표기 \t 읽기(가나 표제면 빈칸) \t 액센트` (복수값 `0,2`, 품사별 `(副)0,(名)3` 존재).
- `sources/krdict/` 는 이 스크립트가 받은 것이 아님(별도 작업).
