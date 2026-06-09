-- heyvoca_user 사용자 DB baseline (구조 + 참조 데이터 + alembic head 스탬프)
--
-- 목적: mysql 컨테이너 첫 기동 시 빈 heyvoca_user를 head(348f2b6afb1c) 상태로
--       바로 부트스트랩한다. 이게 없으면 entrypoint의 flask db upgrade가
--       baseline 마이그레이션(6c8175362eee)부터 돌리는데, 그 마이그레이션은
--       구 단일 heyvoca schema를 전제로 drop/alter만 하므로 빈 DB에서 실패한다.
--
-- 이 파일 import 후 flask db upgrade는 이미 head라 no-op.
-- 신규 사용자 마이그레이션이 추가되면 그 위에 자동 적용된다.
-- 01_create_schemas.sql 다음(알파벳 순)에 1회 자동 실행된다 (fresh volume 한정).
--
-- 갱신법: 모델/마이그레이션 변경 후 깨끗한 heyvoca_user에서 재덤프 →
--   mysqldump --no-data heyvoca_user  +  reference 테이블 INSERT + alembic_version

USE heyvoca_user;


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `alembic_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `check_in`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `check_in` (
  `user_id` binary(16) NOT NULL,
  `attendence_date` date NOT NULL,
  `today_study_complete` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`,`attendence_date`) USING BTREE,
  CONSTRAINT `FK_check_in_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `gem_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gem_log` (
  `id` binary(16) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `amount` int NOT NULL,
  `reason` enum('IAP_PURCHASE','BOOK_PURCHASE','ACHIEVEMENT','ADMIN_ADJUST','REFUND','REFERRAL') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_type` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_id` binary(16) DEFAULT NULL,
  `balance_after` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `ix_gemlog_src` (`user_id`,`source_type`,`source_id`),
  CONSTRAINT `fk_gemlog_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `goal_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `goal_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(36) NOT NULL,
  `description` varchar(36) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `goals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `goals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type_id` int NOT NULL,
  `level` int NOT NULL,
  `goal` int NOT NULL,
  `reward_count` int NOT NULL,
  `description` varchar(512) DEFAULT NULL,
  `badge_img` varchar(128) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `goal_text` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_goals_goal_type` (`type_id`),
  CONSTRAINT `FK_goals_goal_type` FOREIGN KEY (`type_id`) REFERENCES `goal_type` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=77 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invite_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invite_map` (
  `inviter_id` binary(16) NOT NULL,
  `invitee_id` binary(16) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`inviter_id`,`invitee_id`),
  KEY `FK_invite_map_user_2` (`invitee_id`),
  CONSTRAINT `FK_invite_map_user` FOREIGN KEY (`inviter_id`) REFERENCES `user` (`id`),
  CONSTRAINT `FK_invite_map_user_2` FOREIGN KEY (`invitee_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `level`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `level` (
  `id` int NOT NULL AUTO_INCREMENT,
  `level` int NOT NULL,
  `level_name` varchar(36) NOT NULL,
  `level_description` varchar(256) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '상품 고유 ID',
  `product_id` varchar(100) NOT NULL COMMENT '스토어 상품 ID (예: com.heyvoca.gems.100)',
  `name` varchar(100) NOT NULL COMMENT '상품명 (예: 보석 100개)',
  `description` varchar(500) DEFAULT NULL COMMENT '상품 설명',
  `gem_amount` int NOT NULL COMMENT '지급할 보석 수량',
  `price` int NOT NULL COMMENT '가격 (원)',
  `platform` varchar(20) NOT NULL COMMENT '플랫폼 (ios, android)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  `updated_at` datetime DEFAULT NULL COMMENT '수정일시',
  `bonus` int DEFAULT '0' COMMENT '보너스 보석 수량',
  `image_url` varchar(500) DEFAULT NULL COMMENT '상품 이미지 URL (S3 경로)',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `purchase`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase` (
  `id` binary(16) NOT NULL COMMENT '구매 기록 고유 ID (UUID)',
  `product_id` varchar(100) NOT NULL COMMENT '스토어 상품 ID',
  `transaction_id` varchar(200) NOT NULL COMMENT '스토어 거래 ID',
  `platform` varchar(20) NOT NULL COMMENT '플랫폼 (ios, android)',
  `gem_amount` int NOT NULL COMMENT '구매한 보석 수량',
  `price` int NOT NULL COMMENT '구매 가격',
  `status` varchar(20) NOT NULL DEFAULT 'completed' COMMENT '구매 상태 (completed, refunded, failed)',
  `receipt_data` text COMMENT '영수증 원본 데이터 (JSON)',
  `verified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '검증 완료 시간',
  `updated_at` datetime DEFAULT NULL COMMENT '수정일시',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  `user_id` binary(16) NOT NULL COMMENT '사용자 ID (외래키)',
  PRIMARY KEY (`id`),
  KEY `purchase_user_FK` (`user_id`),
  CONSTRAINT `purchase_user_FK` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` binary(16) NOT NULL,
  `email` varchar(128) NOT NULL,
  `google_id` varchar(128) DEFAULT NULL,
  `apple_id` varchar(128) DEFAULT NULL,
  `level_id` int DEFAULT NULL,
  `name` varchar(32) NOT NULL,
  `username` varchar(36) DEFAULT NULL,
  `code` varchar(36) NOT NULL,
  `xp` int NOT NULL DEFAULT '0',
  `phone` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `book_cnt` int NOT NULL DEFAULT '3',
  `gem_cnt` int NOT NULL DEFAULT '0',
  `set_goal_cnt` int NOT NULL DEFAULT '3',
  `invite_code` varchar(36) DEFAULT NULL,
  `invited_by` binary(16) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `last_logged_at` datetime DEFAULT NULL,
  `refresh_token` varchar(512) DEFAULT NULL,
  `tts_voices` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`),
  KEY `FK_user_level` (`level_id`),
  KEY `FK_user_user` (`invited_by`),
  CONSTRAINT `FK_user_level` FOREIGN KEY (`level_id`) REFERENCES `level` (`id`),
  CONSTRAINT `FK_user_user` FOREIGN KEY (`invited_by`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_goals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_goals` (
  `user_id` binary(16) NOT NULL,
  `goal_id` int NOT NULL,
  `current_value` int NOT NULL,
  `is_completed` tinyint NOT NULL DEFAULT '0',
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`,`goal_id`),
  KEY `goal_id` (`goal_id`),
  CONSTRAINT `FK_user_goals_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `user_goals_ibfk_2` FOREIGN KEY (`goal_id`) REFERENCES `goals` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_has_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_has_token` (
  `user_id` binary(16) NOT NULL,
  `token` varchar(256) NOT NULL DEFAULT '',
  `is_message_allowed` tinyint NOT NULL DEFAULT '1',
  `is_marketing_allowed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`,`token`),
  CONSTRAINT `FK_user_has_token_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_question_type_stat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_question_type_stat` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` binary(16) NOT NULL,
  `question_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'multipleChoice|multipleChoiceListening|fillInTheBlank|cardMatch|cardMatchListening',
  `total_count` int NOT NULL DEFAULT '0',
  `correct_count` int NOT NULL DEFAULT '0',
  `avg_time_taken_ms` int NOT NULL DEFAULT '0' COMMENT 'EWMA: new_avg = 0.9*old + 0.1*new',
  `last_30d_correct_rate` float DEFAULT NULL COMMENT '배치(refresh_question_type_stats.py)로 갱신',
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_qtype` (`user_id`,`question_type`),
  KEY `ix_user_question_type_stat_user_id` (`user_id`),
  CONSTRAINT `fk_uqts_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_recent_study`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_recent_study` (
  `id` binary(16) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `type` enum('TEST','EXAM','TODAY','QUICK') NOT NULL,
  `study_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `status` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `progress_index` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`,`type`),
  CONSTRAINT `FK_user_recent_study_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_study_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_study_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` binary(16) NOT NULL,
  `user_voca_id` int NOT NULL,
  `voca_id` int DEFAULT NULL COMMENT '사전 DB 단어 참조 (cross-schema, FK 없음)',
  `user_voca_book_id` binary(16) DEFAULT NULL,
  `session_id` binary(16) NOT NULL COMMENT 'user_study_session.id 참조 (FK 없음)',
  `test_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'test|exam|today|quick',
  `question_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'multipleChoice|multipleChoiceListening|fillInTheBlank|cardMatch|cardMatchListening',
  `was_correct` tinyint(1) NOT NULL,
  `q_score` int NOT NULL COMMENT 'SM2 점수: 0/3/4/5',
  `rating` int DEFAULT NULL COMMENT 'FSRS: 1=Again,2=Hard,3=Good,4=Easy (Phase 1.2부터 채움)',
  `time_taken_ms` int NOT NULL,
  `word_length` int DEFAULT NULL,
  `state_before` text COLLATE utf8mb4_unicode_ci COMMENT 'FSRS state JSON (적용 전)',
  `state_after` text COLLATE utf8mb4_unicode_ci COMMENT 'FSRS state JSON (적용 후)',
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`,`created_at`),
  KEY `user_voca_book_id` (`user_voca_book_id`),
  KEY `user_voca_id` (`user_voca_id`),
  KEY `ix_usl_session` (`session_id`),
  KEY `ix_usl_user_created` (`user_id`,`created_at`),
  KEY `ix_usl_user_voca` (`user_id`,`user_voca_id`)
) ENGINE=InnoDB AUTO_INCREMENT=296 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
/*!50100 PARTITION BY RANGE (year(`created_at`))
(PARTITION p2026 VALUES LESS THAN (2027) ENGINE = InnoDB,
 PARTITION p2027 VALUES LESS THAN (2028) ENGINE = InnoDB,
 PARTITION p2028 VALUES LESS THAN (2029) ENGINE = InnoDB,
 PARTITION p2029 VALUES LESS THAN (2030) ENGINE = InnoDB,
 PARTITION p2030 VALUES LESS THAN (2031) ENGINE = InnoDB,
 PARTITION p_future VALUES LESS THAN MAXVALUE ENGINE = InnoDB) */;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_study_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_study_session` (
  `id` binary(16) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `test_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'test|exam|today|quick',
  `book_ids` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON 배열: ["uuid",...]',
  `question_count` int NOT NULL DEFAULT '0',
  `correct_count` int NOT NULL DEFAULT '0',
  `started_at` datetime NOT NULL,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_user_study_session_user_id` (`user_id`),
  CONSTRAINT `user_study_session_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_voca`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_voca` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` binary(16) NOT NULL,
  `voca_id` int DEFAULT NULL,
  `word` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voca_meanings` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `voca_examples` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `data` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_user_voca_voca` (`voca_id`),
  KEY `FK_user_voca_user` (`user_id`),
  CONSTRAINT `FK_user_voca_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3508 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_voca_book`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_voca_book` (
  `id` binary(16) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `bookstore_id` int DEFAULT NULL,
  `name` varchar(36) NOT NULL,
  `color` varchar(256) NOT NULL,
  `total_word_cnt` int NOT NULL DEFAULT '0',
  `memorized_word_cnt` int NOT NULL DEFAULT '0',
  `voca_list` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_user_voca_book_user` (`user_id`),
  KEY `vocabook_id` (`bookstore_id`) USING BTREE,
  CONSTRAINT `FK_user_voca_book_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_voca_book_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_voca_book_map` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_voca_book_id` binary(16) DEFAULT NULL,
  `user_voca_id` int DEFAULT NULL,
  `level` int DEFAULT NULL,
  `voca_meanings` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'admin 사전의 voca일 경우 null',
  `voca_examples` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'admin 사전의 voca일 경우 null',
  `memory_status` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_userbook_voca` (`user_voca_book_id`,`user_voca_id`) USING BTREE,
  KEY `ix_uvbm_userbook` (`user_voca_book_id`),
  KEY `ix_uvbm_voca` (`user_voca_id`) USING BTREE,
  CONSTRAINT `FK_user_voca_book_map_user_voca` FOREIGN KEY (`user_voca_id`) REFERENCES `user_voca` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uvbm_userbook` FOREIGN KEY (`user_voca_book_id`) REFERENCES `user_voca_book` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3569 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


-- ===== 참조 데이터 (level/goal_type/goals/product) + alembic head 스탬프 =====

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `alembic_version` WRITE;
/*!40000 ALTER TABLE `alembic_version` DISABLE KEYS */;
INSERT INTO `alembic_version` (`version_num`) VALUES ('348f2b6afb1c');
/*!40000 ALTER TABLE `alembic_version` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `level` WRITE;
/*!40000 ALTER TABLE `level` DISABLE KEYS */;
INSERT INTO `level` (`id`, `level`, `level_name`, `level_description`) VALUES (1,1,'초등','초등학생'),(2,2,'중등','중학생'),(3,3,'고등','고등학생'),(4,4,'대학생','대학생');
/*!40000 ALTER TABLE `level` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `goal_type` WRITE;
/*!40000 ALTER TABLE `goal_type` DISABLE KEYS */;
INSERT INTO `goal_type` (`id`, `type`, `description`, `created_at`) VALUES (1,'암기왕','만점 학습 횟수 업적','2025-05-22 23:52:29'),(2,'출석왕','출석 일수 업적','2025-05-22 23:52:29'),(3,'노력왕','학습 종료 횟수 업적','2025-05-22 23:52:29'),(5,'끈기왕','연속 학습 일수 업적','2025-05-22 23:52:29'),(6,'독서왕','서점에서 단어장 추가 수 업적','2025-05-22 23:52:29'),(7,'초대왕','친구 초대 수 기반 업적','2025-11-02 19:33:20');
/*!40000 ALTER TABLE `goal_type` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `goals` WRITE;
/*!40000 ALTER TABLE `goals` DISABLE KEYS */;
INSERT INTO `goals` (`id`, `type_id`, `level`, `goal`, `reward_count`, `description`, `badge_img`, `created_at`, `goal_text`) VALUES (1,1,1,1,2,'만점 1회 달성하여 암기왕 업적을 획득했습니다.','암기왕01.png','2025-05-22 23:54:18','만점 1회 달성'),(2,1,2,2,2,'만점 2회 달성하여 암기왕 업적을 획득했습니다.','암기왕02.png','2025-05-22 23:54:18','만점 2회 달성'),(3,1,3,3,3,'만점 3회 달성하여 암기왕 업적을 획득했습니다.','암기왕03.png','2025-05-22 23:54:18','만점 3회 달성'),(4,1,4,5,4,'만점 5회 달성하여 암기왕 업적을 획득했습니다.','암기왕04.png','2025-05-22 23:54:18','만점 5회 달성'),(5,1,5,7,5,'만점 7회 달성하여 암기왕 업적을 획득했습니다.','암기왕05.png','2025-05-22 23:54:18','만점 7회 달성'),(6,1,6,10,6,'만점 10회 달성하여 암기왕 업적을 획득했습니다.','암기왕06.png','2025-05-22 23:54:18','만점 10회 달성'),(7,1,7,20,7,'만점 20회 달성하여 암기왕 업적을 획득했습니다.','암기왕07.png','2025-05-22 23:54:18','만점 20회 달성'),(8,1,8,35,8,'만점 35회 달성하여 암기왕 업적을 획득했습니다.','암기왕08.png','2025-05-22 23:54:18','만점 35회 달성'),(9,1,9,60,9,'만점 60회 달성하여 암기왕 업적을 획득했습니다.','암기왕09.png','2025-05-22 23:54:18','만점 60회 달성'),(10,1,10,100,10,'만점 100회 달성하여 암기왕 업적을 획득했습니다.','암기왕10.png','2025-05-22 23:54:18','만점 100회 달성'),(11,2,1,1,2,'출석 1일 달성하여 출석왕 업적을 획득했습니다.','출석왕01.png','2025-05-22 23:54:34','출석 1일 달성'),(12,2,2,7,3,'출석 7일 달성하여 출석왕 업적을 획득했습니다.','출석왕02.png','2025-05-22 23:54:34','출석 7일 달성'),(13,2,3,30,4,'출석 30일 달성하여 출석왕 업적을 획득했습니다.','출석왕03.png','2025-05-22 23:54:34','출석 30일 달성'),(14,2,4,50,5,'출석 50일 달성하여 출석왕 업적을 획득했습니다.','출석왕04.png','2025-05-22 23:54:34','출석 50일 달성'),(15,2,5,100,6,'출석 100일 달성하여 출석왕 업적을 획득했습니다.','출석왕05.png','2025-05-22 23:54:34','출석 100일 달성'),(16,2,6,200,7,'출석 200일 달성하여 출석왕 업적을 획득했습니다.','출석왕06.png','2025-05-22 23:54:34','출석 200일 달성'),(17,2,7,365,8,'출석 365일 달성하여 출석왕 업적을 획득했습니다.','출석왕07.png','2025-05-22 23:54:34','출석 365일 달성'),(18,2,8,500,10,'출석 500일 달성하여 출석왕 업적을 획득했습니다.','출석왕08.png','2025-05-22 23:54:34','출석 500일 달성'),(19,2,9,700,12,'출석 700일 달성하여 출석왕 업적을 획득했습니다.','출석왕09.png','2025-05-22 23:54:34','출석 700일 달성'),(20,2,10,1000,15,'출석 1000일 달성하여 출석왕 업적을 획득했습니다.','출석왕10.png','2025-05-22 23:54:34','출석 1000일 달성'),(26,3,1,1,2,'학습 1회 달성하여 노력왕 업적을 획득했습니다.','노력왕01.png','2025-05-22 23:54:40','학습 1회 달성'),(27,3,2,10,3,'학습 10회 달성하여 노력왕 업적을 획득했습니다.','노력왕02.png','2025-05-22 23:54:40','학습 10회 달성'),(28,3,3,30,4,'학습 30회 달성하여 노력왕 업적을 획득했습니다.','노력왕03.png','2025-05-22 23:54:40','학습 30회 달성'),(29,3,4,50,5,'학습 50회 달성하여 노력왕 업적을 획득했습니다.','노력왕04.png','2025-05-22 23:54:40','학습 50회 달성'),(30,3,5,100,6,'학습 100회 달성하여 노력왕 업적을 획득했습니다.','노력왕05.png','2025-05-22 23:54:40','학습 100회 달성'),(31,3,6,200,7,'학습 200회 달성하여 노력왕 업적을 획득했습니다.','노력왕06.png','2025-05-22 23:54:40','학습 200회 달성'),(32,3,7,300,8,'학습 300회 달성하여 노력왕 업적을 획득했습니다.','노력왕07.png','2025-05-22 23:54:40','학습 300회 달성'),(33,3,8,500,10,'학습 500회 달성하여 노력왕 업적을 획득했습니다.','노력왕08.png','2025-05-22 23:54:40','학습 500회 달성'),(34,3,9,700,12,'학습 700회 달성하여 노력왕 업적을 획득했습니다.','노력왕09.png','2025-05-22 23:54:40','학습 700회 달성'),(35,3,10,1000,15,'학습 1000회 달성하여 노력왕 업적을 획득했습니다.','노력왕10.png','2025-05-22 23:54:40','학습 1000회 달성'),(42,5,1,1,2,'연속 학습 1일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕01.png','2025-05-22 23:54:59','연속 학습 1일 달성'),(43,5,2,3,3,'연속 학습 3일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕02.png','2025-05-22 23:54:59','연속 학습 3일 달성'),(44,5,3,7,4,'연속 학습 7일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕03.png','2025-05-22 23:54:59','연속 학습 7일 달성'),(45,5,4,14,5,'연속 학습 14일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕04.png','2025-05-22 23:54:59','연속 학습 14일 달성'),(46,5,5,21,6,'연속 학습 21일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕05.png','2025-05-22 23:54:59','연속 학습 21일 달성'),(47,5,6,30,7,'연속 학습 30일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕06.png','2025-05-22 23:54:59','연속 학습 30일 달성'),(48,5,7,50,8,'연속 학습 50일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕07.png','2025-05-22 23:54:59','연속 학습 50일 달성'),(49,5,8,100,10,'연속 학습 100일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕08.png','2025-05-22 23:54:59','연속 학습 100일 달성'),(50,5,9,200,12,'연속 학습 200일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕09.png','2025-05-22 23:54:59','연속 학습 200일 달성'),(51,5,10,365,15,'연속 학습 365일 달성하여 끈기왕 업적을 획득했습니다.','끈기왕10.png','2025-05-22 23:54:59','연속 학습 365일 달성'),(57,6,1,1,2,'서점 단어장 구매 1개 달성하여 독서왕 업적을 획득했습니다.','독서왕01.png','2025-05-22 23:55:06','서점 단어장 구매 1개 달성'),(58,6,2,3,3,'서점 단어장 구매 3개 달성하여 독서왕 업적을 획득했습니다.','독서왕02.png','2025-05-22 23:55:06','서점 단어장 구매 3개 달성'),(59,6,3,5,4,'서점 단어장 구매 5개 달성하여 독서왕 업적을 획득했습니다.','독서왕03.png','2025-05-22 23:55:06','서점 단어장 구매 5개 달성'),(60,6,4,10,5,'서점 단어장 구매 10개 달성하여 독서왕 업적을 획득했습니다.','독서왕04.png','2025-05-22 23:55:06','서점 단어장 구매 10개 달성'),(61,6,5,15,6,'서점 단어장 구매 15개 달성하여 독서왕 업적을 획득했습니다.','독서왕05.png','2025-05-22 23:55:06','서점 단어장 구매 15개 달성'),(62,7,1,1,2,'친구 초대 1명 달성하여 초대왕 업적을 획득했습니다.','초대왕01.png','2025-11-02 19:33:20','친구 초대 1명 달성'),(63,7,2,2,3,'친구 초대 2명 달성하여 초대왕 업적을 획득했습니다.','초대왕02.png','2025-11-02 19:33:20','친구 초대 2명 달성'),(64,7,3,4,4,'친구 초대 4명 달성하여 초대왕 업적을 획득했습니다.','초대왕03.png','2025-11-02 19:33:20','친구 초대 4명 달성'),(65,7,4,6,5,'친구 초대 6명 달성하여 초대왕 업적을 획득했습니다.','초대왕04.png','2025-11-02 19:33:20','친구 초대 6명 달성'),(66,7,5,8,6,'친구 초대 8명 달성하여 초대왕 업적을 획득했습니다.','초대왕05.png','2025-11-02 19:33:20','친구 초대 8명 달성'),(67,7,6,10,7,'친구 초대 10명 달성하여 초대왕 업적을 획득했습니다.','초대왕06.png','2025-11-02 19:33:20','친구 초대 10명 달성'),(68,7,7,12,8,'친구 초대 12명 달성하여 초대왕 업적을 획득했습니다.','초대왕07.png','2025-11-02 19:33:20','친구 초대 12명 달성'),(69,7,8,15,10,'친구 초대 15명 달성하여 초대왕 업적을 획득했습니다.','초대왕08.png','2025-11-02 19:33:20','친구 초대 15명 달성'),(70,7,9,18,12,'친구 초대 18명 달성하여 초대왕 업적을 획득했습니다.','초대왕09.png','2025-11-02 19:33:20','친구 초대 18명 달성'),(71,7,10,20,15,'친구 초대 20명 달성하여 초대왕 업적을 획득했습니다.','초대왕10.png','2025-11-02 19:33:20','친구 초대 20명 달성'),(72,6,6,20,7,'서점 단어장 구매 20개 달성하여 독서왕 업적을 획득했습니다.','독서왕06.png','2026-01-25 22:11:44','서점 단어장 구매 20개 달성'),(73,6,7,30,8,'서점 단어장 구매 30개 달성하여 독서왕 업적을 획득했습니다.','독서왕07.png','2026-01-25 22:11:44','서점 단어장 구매 30개 달성'),(74,6,8,40,10,'서점 단어장 구매 40개 달성하여 독서왕 업적을 획득했습니다.','독서왕08.png','2026-01-25 22:11:44','서점 단어장 구매 40개 달성'),(75,6,9,50,12,'서점 단어장 구매 50개 달성하여 독서왕 업적을 획득했습니다.','독서왕09.png','2026-01-25 22:11:44','서점 단어장 구매 50개 달성'),(76,6,10,60,15,'서점 단어장 구매 60개 달성하여 독서왕 업적을 획득했습니다.','독서왕10.png','2026-01-25 22:11:44','서점 단어장 구매 60개 달성');
/*!40000 ALTER TABLE `goals` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `product` WRITE;
/*!40000 ALTER TABLE `product` DISABLE KEYS */;
INSERT INTO `product` (`id`, `product_id`, `name`, `description`, `gem_amount`, `price`, `platform`, `is_active`, `created_at`, `updated_at`, `bonus`, `image_url`) VALUES (1,'com.heyvoca.gems_10','보석 10개','보석 10개를 구매합니다',10,1100,'android',1,'2025-10-17 09:55:55',NULL,0,'https://s3.ghmate.com/heyvoca/product/gems/gem10.png'),(2,'com.heyvoca.gems_35','보석 35개','보석 35개를 구매합니다',35,3300,'android',1,'2025-10-17 09:58:32',NULL,5,'https://s3.ghmate.com/heyvoca/product/gems/gem35.png'),(3,'com.heyvoca.gems_110','보석 110개','보석 110개를 구매합니다 (10% 보너스)',110,9900,'android',1,'2025-10-17 09:59:32',NULL,10,'https://s3.ghmate.com/heyvoca/product/gems/gem110.png'),(4,'com.heyvoca.gems_10','보석 10개','보석 10개를 구매합니다',10,1100,'ios',1,'2025-12-31 01:10:05',NULL,0,'https://s3.ghmate.com/heyvoca/product/gems/gem10.png'),(5,'com.heyvoca.gems_35','보석 35개','보석 35개를 구매합니다',35,3300,'ios',1,'2025-12-31 01:11:21',NULL,5,'https://s3.ghmate.com/heyvoca/product/gems/gem35.png'),(6,'com.heyvoca.gems_110','보석 110개','보석 110개를 구매합니다 (10% 보너스)',110,9900,'ios',1,'2025-12-31 01:11:21',NULL,10,'https://s3.ghmate.com/heyvoca/product/gems/gem110.png');
/*!40000 ALTER TABLE `product` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

