## 변경 요약

<!-- 1-2줄로 무엇이 왜 바뀌는지 -->

## 체크리스트

### 사용자 DB 모델 변경
- [ ] `app/models/models.py`의 사용자 영역 모델 수정 (User, UserVocaBook, Purchase 등)
- [ ] `migrations/versions/`에 마이그레이션 파일 포함됨 (`flask db migrate`)
- [ ] 마이그레이션이 `flask db upgrade`로 정상 적용 확인됨

### 사전 DB 모델 변경 (`__bind_key__='dict'`)
- [ ] `app/models/models.py`의 사전 영역 모델 수정 (Voca, VocaBook, AdminVocaBook 등)
- [ ] `migrations_dict/versions/`에 마이그레이션 파일 포함됨 (`flask db migrate --directory migrations_dict`)
- [ ] 마이그레이션이 `flask db upgrade --directory migrations_dict`로 정상 적용 확인됨

### 사전 데이터 변경 (단어/뜻/예문/단어장 카탈로그)
- [ ] `python scripts/dict_publish.py -m "..."` 실행 → MinIO 업로드 완료
- [ ] `db/dict/dict_pointer.json` 변경됨 (sha256, version 갱신)
- [ ] `db/dict/CHANGELOG.md`에 항목 자동 추가됨
- [ ] (스키마 변경도 동반된 경우) 같은 PR에 `migrations_dict/`도 포함

### 회귀 테스트
- [ ] 회원가입 → 기본 단어장 시드 (auth.py)
- [ ] 단어 검색 (search.py)
- [ ] 단어장 구매 (voca_books.py)
- [ ] 사용자 단어장 CRUD (user_voca_book.py)

### 기타
- [ ] `.env*` 파일은 commit하지 않음
- [ ] PR 제목에 prefix 사용: `dict:`, `db:`, `feat:`, `fix:` 등

## 스크린샷/로그

<!-- UI 변경 또는 동작 검증 캡처 -->
