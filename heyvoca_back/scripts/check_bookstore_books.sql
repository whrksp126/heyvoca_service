-- 서점 단어장 구매 가능성 점검 (읽기 전용). 이슈 #15 JLPT N3 구매 실패 재발 감시용.
-- 실행: docker exec -i heyvoca_mysql_<env> bash -c "mysql --default-character-set=utf8mb4 -u root -p... -t" < scripts/check_bookstore_books.sql
-- 각 사전 schema(heyvoca_dict=영어, heyvoca_dict_ja=일본어)마다
--   dup_words : 같은 표기(바이너리 비교) 단어가 여러 사전 항목으로 들어간 수.
--               2026-10 이전 코드는 이 값이 0보다 크면 단어장 생성이 uq_userbook_voca 충돌로 500.
--               지금은 생성 시 한 단어로 합쳐 담으므로 경고만(합쳐진 만큼 단어 수가 줄어든다).
--   orphan    : 사전 단어가 지워진 맵(담기지 않고 빠지는 단어).
--   is_empty  : 단어 0개 또는 admin_voca_book 미연결(구매해도 빈 단어장).
SET NAMES utf8mb4;
SELECT 'en' lang, b.id, b.name, b.hide, COUNT(m.id) maps,
       COUNT(v.id) - COUNT(DISTINCT CAST(v.word AS BINARY)) dup_words,
       SUM(m.id IS NOT NULL AND v.id IS NULL) orphan,
       (b.admin_voca_book_id IS NULL OR COUNT(m.id) = 0) is_empty
FROM heyvoca_dict.bookstore b
LEFT JOIN heyvoca_dict.admin_voca_book_map m ON m.book_id = b.admin_voca_book_id
LEFT JOIN heyvoca_dict.voca v ON v.id = m.voca_id
GROUP BY b.id
HAVING dup_words > 0 OR orphan > 0 OR is_empty
UNION ALL
SELECT 'ja', b.id, b.name, b.hide, COUNT(m.id) maps,
       COUNT(v.id) - COUNT(DISTINCT CAST(v.word AS BINARY)) dup_words,
       SUM(m.id IS NOT NULL AND v.id IS NULL) orphan,
       (b.admin_voca_book_id IS NULL OR COUNT(m.id) = 0) is_empty
FROM heyvoca_dict_ja.bookstore b
LEFT JOIN heyvoca_dict_ja.admin_voca_book_map m ON m.book_id = b.admin_voca_book_id
LEFT JOIN heyvoca_dict_ja.voca v ON v.id = m.voca_id
GROUP BY b.id
HAVING dup_words > 0 OR orphan > 0 OR is_empty
ORDER BY lang, id;

-- 보석은 빠졌는데 단어장이 없는 서점 구매(옛 2단계 흐름의 피해자). description 이 '단어장 구매: <이름>'.
SELECT HEX(g.user_id) user_id, g.description, g.amount, g.created_at
FROM heyvoca_user.gem_log g
WHERE g.reason = 'BOOK_PURCHASE' AND g.source_type = 'bookstore'
  AND NOT EXISTS (
    SELECT 1 FROM heyvoca_user.user_voca_book ub
    WHERE ub.user_id = g.user_id AND ub.bookstore_id IS NOT NULL
      AND CONCAT('단어장 구매: ', ub.name) COLLATE utf8mb4_unicode_ci = g.description COLLATE utf8mb4_unicode_ci
  )
  AND NOT EXISTS (
    SELECT 1 FROM heyvoca_user.gem_log r
    WHERE r.user_id = g.user_id AND r.reason IN ('REFUND','ADMIN_ADJUST') AND r.description COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', SUBSTRING(g.description, 9), '%') COLLATE utf8mb4_unicode_ci
  )
ORDER BY g.created_at;
