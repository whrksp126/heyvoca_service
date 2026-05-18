# 사전 데이터 변경 이력

`scripts/dict_publish.py` 실행 시 자동으로 항목이 추가됩니다. 수동 보완도 가능.

| 버전 | 날짜 | 작업자 | 추가 | 수정 | 삭제 | 비고 |
|------|------|--------|------|------|------|------|
| (초기 상태) | - | - | - | - | - | dict_publish.py 첫 실행 전 |
| 20260506-1 | 2026-05-06 | unknown | - | - | - | 초기 사전 dump (DB 분리 후 첫 발행) (voca=51259, voca_meaning=133458, voca_book=12773) |
| 20260507-1 | 2026-05-07 | unknown | - | - | - | 기초부터 차근차근 영어단어 7탄 카테고리(수능) 적용 (voca=51259, voca_meaning=133458, voca_book=12773) |
| 20260509-1 | 2026-05-09 | unknown | - | - | - | voca: 예문에 target-word 강조 태그 적용 (15,518 vocas, 26,590 examples) (voca=51259, voca_meaning=133458, voca_book=12773) |
| 20260513-1 | 2026-05-13 | unknown | - | - | - | voca: batch 0777-0860 예문 강조 적용 (1675 vocas / 1886 examples) (voca=51259, voca_meaning=133458, voca_book=12773) |
| 20260518-1 | 2026-05-18 | unknown | - | - | - | AI 생성 admin 단어장 예문 강조 적용 (4187 rows) (voca=51259, voca_meaning=133458, voca_book=12773) |
| 20260518-2 | 2026-05-18 | unknown | - | - | - | bookstore: AI 52개 + 직접제작 6개 일괄 등록 (총 60개 노출) (voca=51259, voca_meaning=133458, voca_book=12773) |
