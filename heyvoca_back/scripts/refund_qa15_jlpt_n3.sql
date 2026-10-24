-- 이슈 #15: 2026-10-11 JLPT N3 1·2권 구매 실패(보석만 차감, 단어장 미생성) 20개 환불. prod 1회 실행.
SET NAMES utf8mb4;
START TRANSACTION;
SET @u = UNHEX('3B00EE712FD54851848C13B810AFDB40');
SELECT gem_cnt INTO @g FROM heyvoca_user.user WHERE id=@u FOR UPDATE;
UPDATE heyvoca_user.user SET gem_cnt = @g + 20 WHERE id=@u;
INSERT INTO heyvoca_user.gem_log (id, user_id, amount, reason, description, source_type, balance_after, created_at)
VALUES (UUID_TO_BIN(UUID()), @u, 20, 'REFUND', '구매 실패 환불: JLPT N3 단어 1권, JLPT N3 단어 2권', 'bookstore', @g + 20, UTC_TIMESTAMP());
COMMIT;
SELECT gem_cnt FROM heyvoca_user.user WHERE id=@u;
