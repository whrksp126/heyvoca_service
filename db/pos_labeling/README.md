# voca_meaning 뜻별 품사 라벨

- 원본 형식: `meaning_id<TAB>UD_POS`
- 한 배치: 300개
- 판정 기준: 영어 표제어가 아니라 한국어 뜻풀이의 문법 형태
- 허용값: `NOUN VERB ADJ ADV PRON DET ADP CCONJ SCONJ NUM INTJ PART AUX PROPN X`
- 적용 전 `scripts/apply_meaning_pos.py <tsv> --dry-run`
- 적용 시 `scripts/apply_meaning_pos.py <tsv> --apply`

배치 TSV가 복구 가능한 원본이며 DB는 그 적용 결과다. 50배치마다 전체 사전 dump를
사용자 기기의 `db/local-dict-archives/` 아래에 날짜·시간과 `UNUSED` 표시를 붙여 보관한다.
