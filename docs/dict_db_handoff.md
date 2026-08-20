# 사전 DB 인수인계 문서

> 작성일: 2026-08-21 · 현재 담당자 → 팀원 인계용

---

## 1. 현재 상황 요약

### 로컬 DB 버전: `20260713-1` (= objectstore와 동일)

오늘(08-20) `docker compose up --build` 시 **`DICT_AUTO_RESET=true`** 설정으로 인해  
dict_sync가 자동으로 objectstore의 `20260713-1` dump를 내려받아 **로컬 DB를 덮어씌웠음**.

> 결과: 07-13 이후 로컬 DB에 작업했던 데이터가 모두 소실됨.

---

## 2. 날아간 데이터

| 작업 | 내용 | CSV 복구 가능? |
|------|------|------|
| 비정상 단어 삭제/교정 | 434개 (commit `2ac956a`, 07-13) | ✅ `db/cleanup/delete_final.csv`, `fix_final.csv` |
| 기호 오염 단어 2차 정리 | 190개 (commit `872fd9c`, 07-13) | ✅ 위 CSV에 포함 |
| 중복 단어 병합 | 1,687개 (commit `abb19d6`, 07-27) | ✅ `db/case_merge/auto_merge.csv`, `llm_review.csv` 등 |
| 발음부호 변형 병합 | 9개 (commit `a635640`, 07-27) | ✅ `db/case_merge/accent_merge.csv` |
| **품사 라벨링** | **131,757개 전수** (07-29~31, AI 작업) | ❌ CSV 없음 — **재작업 필요** |

> **스키마 변경**(pos 컬럼 추가, bookstore level 컬럼 제거 등)은 Alembic 마이그레이션으로  
> 앱 시작 시 자동 복원되므로 문제없음.

---

## 3. 왜 날아갔나 — 원인

```
docker compose up
  → 백엔드 컨테이너 시작
  → dict_sync 자동 실행 (DICT_AUTO_RESET=true)
  → 로컬 DB sha ≠ objectstore sha (작업 데이터가 추가되어 달라짐)
  → "동기화 필요" → objectstore dump 덮어씌움 💥
```

**`DICT_AUTO_RESET=true`는 "내 로컬 DB가 objectstore dump와 다르면 무조건 덮어쓴다"는 설정.**  
→ 발행 전에 로컬 작업이 쌓여 있으면, 다음 재시작 때 항상 날아갈 위험이 있음.

### 재발 방지

작업 중에는 `.env.local`에서 아래 설정으로 자동 덮어쓰기를 차단:
```
DICT_AUTO_RESET=false
```
작업 완료 후 발행(`dict_publish.py`)까지 마친 뒤 다시 `true`로 복원.

---

## 4. 재작업 순서 (팀원이 해야 할 일)

> 아래 순서대로 진행 후 발행할 것.

### Step 1. DICT_AUTO_RESET 끄기
```
# heyvoca_back/.env.local
DICT_AUTO_RESET=false
```

### Step 2. cleanup 재적용
```bash
# db/cleanup/ 의 CSV를 보고 voca_cleanup.py 로 재적용
python scripts/voca_cleanup.py --apply
```
- 기준 파일: `db/cleanup/delete_final.csv`, `db/cleanup/fix_final.csv`

### Step 3. case_merge 재적용
```bash
python scripts/voca_case_merge.py --apply
```
- 기준 파일: `db/case_merge/auto_merge.csv`, `db/case_merge/accent_merge.csv`, `db/case_merge/llm_review.csv`

### Step 4. 품사 라벨링 재작업
- `voca_meaning.pos` 컬럼에 131,757개 전수 태깅 필요
- 이전에는 AI (Claude Code 세션)에서 300개 단위 배치로 직접 판정함 (비용 0원)
- 또는 `scripts/label_meaning_pos.py --sync` (ANTHROPIC_API_KEY 필요, 비용 발생)
- 참고: [voca_meaning_pos_report.md](../../docs/voca_meaning_pos_report.md)

### Step 5. 발행
```bash
python scripts/dict_publish.py
```
- 버전명 예시: `20260821-1`
- 발행 후 `db/dict/CHANGELOG.md` 업데이트

---

## 5. 발행을 지금 해야 하나?

**No.** 지금 발행하면 안 됩니다.

현재 로컬 DB = objectstore `20260713-1` dump 그대로 (위의 날아간 데이터 없음).  
지금 발행해도 서버에는 이미 `20260713-1`이 올라가 있어서 의미 없음.

**Step 2~4 재작업을 완료한 뒤 발행해야** 의미 있는 버전이 올라감.

---

## 6. 관련 파일 경로

| 파일 | 설명 |
|------|------|
| `db/dict/dict_pointer.json` | objectstore 최신 버전 포인터 |
| `db/dict/CHANGELOG.md` | 버전 이력 |
| `db/cleanup/` | cleanup 작업 결과 CSV |
| `db/case_merge/` | 중복 병합 작업 결과 CSV |
| `scripts/voca_cleanup.py` | cleanup 적용 스크립트 |
| `scripts/voca_case_merge.py` | 중복 병합 적용 스크립트 |
| `scripts/label_meaning_pos.py` | 품사 라벨링 스크립트 (API 필요) |
| `scripts/dict_publish.py` | objectstore 발행 스크립트 |
| `docs/voca_meaning_pos_report.md` | 품사 라벨링 작업 보고서 |
