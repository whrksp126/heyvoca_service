# 학습 중 데이터 오류 신고 (2026-10)

사용자가 학습 중 뜻·예문·발음·채점·문제 오류를 탭 두 번으로 보내고, 우리가 어드민에서 확인해
고치거나 AI 에게 통째로 넘겨 처리시키는 흐름.

## 구성

| 위치 | 파일 |
|------|------|
| 테이블 | 사용자 DB `content_report` (`app/models/models.py` `ContentReport`, 마이그레이션 `e3c5a7d91b20`) — FK 없음 |
| 앱 API | `POST /report` (`app/routes/content_report.py`, `@jwt_required`) |
| 어드민 API | `GET /admin/reports`, `GET /admin/reports/summary`, `GET·PATCH /admin/reports/<id>`, `PATCH /admin/reports/bulk` |
| 앱(웹뷰) | 학습 화면 헤더 오른쪽 깃발 버튼 `components/report/ReportFlagButton.jsx` → `newBottomSheet/ContentReportNewBottomSheet.jsx` |
| 어드민 | 메뉴 '오류 신고' `heyvoca_admin/frontend/src/features/reports/` |
| 내보내기 | `heyvoca_back/scripts/export_content_reports.py` |

## 규칙

- 사유 코드: `meaning`(뜻) `example`(예문) `audio`(발음·음성) `grading`(정답 판정) `question`(문제) `other`.
  백엔드 `REASONS` · 프론트 `reportPayload.js` · 어드민 `ReportsPage.jsx` 세 곳이 같은 목록이다.
- `voca_id`·`dict_lang`·`word` 는 클라이언트 값을 믿지 않고 본인 `user_voca` 에서 정한다. 글자 학습은
  `dict_lang='script'`, `target_key='<script>:<글자>'`, 사전 id 없는 단어는 `custom`.
- 같은 사용자·같은 문항·같은 사유·같은 문제 유형을 10분 안에 다시 보내면 새 행을 만들지 않는다(메모만 갱신).
  사용자당 24시간 100건 상한. 스냅샷 20KB 상한.
- 채점 후 자동 전환이 있어 버튼은 헤더에 늘 있고, 시트가 떠 있는 동안 `holdStudyAdvance` 로 전환을 멈춘다.
  아직 안 푼 문제에서 누르면 직전에 푼 문제도 고를 수 있고, 카드 맞추기는 단어별로 고른다.

## AI 일괄 처리

```bash
# heyvoca_service/ 에서. 컨테이너 /app/scripts 는 heyvoca_service/scripts 마운트라 복사해서 실행한다.
docker cp heyvoca_back/scripts/export_content_reports.py heyvoca_back_local:/tmp/
docker exec -e PYTHONPATH=/app heyvoca_back_local python3 /tmp/export_content_reports.py 2>/dev/null > reports.md
#   --format json  --status open|resolved|rejected|all  --reason meaning  --lang en|ja|script|custom  --since 2026-10-01
```

출력은 대상(단어)별로 사전 원본(뜻 id·품사·예문 id) + 신고들(메모·신고 순간 화면·사용자 단어장 사본)과
처리 지침을 담는다. AI 결과를 받아 사전을 고친 뒤 **발행은 `.claude/rules/db-migration.md` '사전 데이터만 갱신'
절차(admin 사전 동기화)로만** 하고, 처리한 신고는 어드민에서 일괄 '수정 완료'/'기각' 또는
`PATCH /admin/reports/bulk {ids, status, resolve_note}`.
