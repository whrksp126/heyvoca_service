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
| 20260519-1 | 2026-05-19 | unknown | - | - | - | 온보딩 단어장 재구성: 중/고/대학 100개씩 교체 + 강조 처리 + 사전 예문 18개 추가 (voca=51259, voca_meaning=133458, voca_book=12773) |
| 20260523-1 | 2026-05-23 | unknown | - | - | - | bookstore: id=36 가격 1→10, bookstore_category 테이블 추가 (카테고리 정렬) (voca=51259, voca_meaning=133458, voca_book=12773) |
| 20260604-1 | 2026-06-04 | unknown | - | - | - | voca: aapple 테스트 더미 단어 삭제 (voca=51258, voca_meaning=133457, voca_book=12773) |
| 20260903-1 | 2026-09-03 | unknown | - | - | - | voca_meaning.pos 품사 라벨링 100% 완료 (131,834건) + 동일 뜻풀이 판정 정합성 통일 (voca=50163, voca_meaning=131834, voca_book=12773) |
| 20260907-1 | 2026-09-07 | unknown | - | - | - | dict: 레벨 기초 단어장 4권 서점 등록 + 기초 카테고리 (voca=49873, voca_meaning=131631, voca_book=12773) |
| 20260921-1 | 2026-09-21 | claude | - | voca_meaning_concept 364,392행 | - | dict: 유사 뜻 개념 그룹 매핑 테이블 추가·시딩(45,059그룹) (voca=49873, voca_meaning=131631, voca_book=12773) |
| 20260921-2 | 2026-09-21 | claude | voca_example 3,236건(구·숙어 1,618개 신규 예문) | admin_voca_book_map 6,464행 예문 채움 + 3,784행 en/ko→origin/meaning | - | dict: 서점 단어장 예문 전량 보강(예문 없는 행 0) (voca=49873, voca_meaning=131631, voca_book=12773) |
| 20260922-1 | 2026-09-22 | claude | voca_example +2(preferred) −16(파생어 메모형 가짜 예문) | admin_voca_book_map 719행 정규화(빈 해석 527 채움·한글 태그 287·span/중첩 302·불일치 26행 교체) | - | dict: 빈칸 채우기 양방향 출제 기반 — 서점 예문 전량 origin/meaning 양쪽 강조 태그 확보 (voca=49873, voca_meaning=131631, voca_book=12773) |
