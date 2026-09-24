-- =====================================================================
-- heyvoca_dict_ja — 일한(日韓) 사전 스키마
-- =====================================================================
-- 생성: scripts/50_load_mysql.py 가 이 파일을 읽어 실행한다(스키마명 치환 가능).
--   직접 실행도 가능: mysql -h 127.0.0.1 -P 3310 -u root -p < scripts/schema_dict_ja.sql
--
-- [1] 기본 테이블 16개 = heyvoca_dict(영한) 의 SHOW CREATE TABLE 결과를 그대로 복제
--     (2026-09-24, alembic head 6efb3b1f9711 기준. AUTO_INCREMENT 값만 제거,
--      CREATE TABLE → CREATE TABLE IF NOT EXISTS). 컬럼·인덱스·FK·CHECK·collation 동일.
--     영한 스키마가 바뀌면(migrations_dict 새 리비전) 이 절도 다시 뽑아야 한다.
--     alembic_version 도 포함하고 같은 리비전으로 stamp 한다 → 나중에 이 스키마를
--     dict bind 로 붙여 `flask db upgrade --directory migrations_dict` 를 돌려도
--     "테이블 이미 있음" 으로 깨지지 않고 이후 리비전만 적용된다.
--     (주의: 확장 테이블 *_ja 는 alembic 모델에 없으므로 이 스키마에 대고
--      `flask db migrate` autogenerate 를 돌리면 DROP 이 생성된다 — 돌리지 말 것.)
--
-- [2] 영한 컬럼의 일한 의미 매핑 (컬럼명은 코드 호환을 위해 그대로 둔다)
--     voca.word            = 표기 (JMdict 대표 표기, uk 항목이면 가나)
--     voca.pronunciation   = 히라가나 읽기 (가타카나어는 가타카나 그대로)
--     voca.verb_forms      = NULL (미사용)
--     voca.level           = JLPT 기준 임시 규칙 (영한 0~10 난이도 스케일에 맞춤)
--                            N5→'1', N4→'3', N3→'5', N2→'7', N1→'9', 없음→'10'
--                            (50_load_mysql.py 의 JLPT_TO_LEVEL 상수)
--     voca.is_active       = 1
--     voca_meaning.meaning = 한국어 뜻,  voca_meaning.pos = UD 15종 (영한과 같은 CHECK)
--     voca_example.exam_en = 일본어 원문 (강조 <strong class="target-word">…</strong> 포함)
--     voca_example.exam_ko = 한국어 해석 (강조 포함)
--     뜻·예문 행은 voca 마다 별도(voca 간 공유 안 함), 매핑 테이블로 연결 — 영한과 동일.
--
-- [3] 확장 테이블 (영한 테이블 구조는 건드리지 않고 1:1 별도 테이블로 확장)
--     voca_ja          (voca_id 1:1)    JMdict id·읽기·로마자·표기 변형·JLPT·빈도·액센트
--     voca_meaning_ja  (meaning_id 1:1) JMdict sense 번호·영어 gloss(감사용)·JMdict 품사
--     voca_example_ja  (example_id 1:1) sense 번호·후리가나 토큰·출처(tatoeba/generated)
--     voca_label / voca_meaning_concept / voca_book* / bookstore* / daily_sentence 는
--     구조만 만들고 비워 둔다.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `heyvoca_dict_ja` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `heyvoca_dict_ja`;

-- ---------------------------------------------------------------------
-- [1] 영한 heyvoca_dict 복제
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `bookstore_category` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_book` (
  `id` int NOT NULL AUTO_INCREMENT,
  `book_nm` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `language` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `word_count` int DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_voca_book` (
  `id` int NOT NULL AUTO_INCREMENT,
  `book_nm` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `language` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `word_count` int DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca` (
  `id` int NOT NULL AUTO_INCREMENT,
  `word` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pronunciation` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verb_forms` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `level` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_voca_word` (`word`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_meaning` (
  `id` int NOT NULL AUTO_INCREMENT,
  `meaning` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pos` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_voca_meaning_pos` (`pos`),
  CONSTRAINT `ck_voca_meaning_pos` CHECK (((`pos` is null) or (`pos` in (_utf8mb4'NOUN',_utf8mb4'VERB',_utf8mb4'ADJ',_utf8mb4'ADV',_utf8mb4'PRON',_utf8mb4'DET',_utf8mb4'ADP',_utf8mb4'CCONJ',_utf8mb4'SCONJ',_utf8mb4'NUM',_utf8mb4'INTJ',_utf8mb4'PART',_utf8mb4'AUX',_utf8mb4'PROPN',_utf8mb4'X'))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_example` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_en` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `exam_ko` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_meaning_map` (
  `voca_id` int NOT NULL,
  `meaning_id` int NOT NULL,
  PRIMARY KEY (`voca_id`,`meaning_id`),
  KEY `meaning_id` (`meaning_id`),
  CONSTRAINT `voca_meaning_map_ibfk_1` FOREIGN KEY (`meaning_id`) REFERENCES `voca_meaning` (`id`) ON DELETE CASCADE,
  CONSTRAINT `voca_meaning_map_ibfk_2` FOREIGN KEY (`voca_id`) REFERENCES `voca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_example_map` (
  `voca_id` int NOT NULL,
  `example_id` int NOT NULL,
  PRIMARY KEY (`voca_id`,`example_id`),
  KEY `example_id` (`example_id`),
  CONSTRAINT `voca_example_map_ibfk_1` FOREIGN KEY (`example_id`) REFERENCES `voca_example` (`id`) ON DELETE CASCADE,
  CONSTRAINT `voca_example_map_ibfk_2` FOREIGN KEY (`voca_id`) REFERENCES `voca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_book_map` (
  `voca_id` int NOT NULL,
  `book_id` int NOT NULL,
  PRIMARY KEY (`voca_id`,`book_id`),
  KEY `book_id` (`book_id`),
  CONSTRAINT `voca_book_map_ibfk_1` FOREIGN KEY (`book_id`) REFERENCES `voca_book` (`id`) ON DELETE CASCADE,
  CONSTRAINT `voca_book_map_ibfk_2` FOREIGN KEY (`voca_id`) REFERENCES `voca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_voca_book_map` (
  `id` int NOT NULL AUTO_INCREMENT,
  `voca_id` int DEFAULT NULL,
  `book_id` int DEFAULT NULL,
  `level` int DEFAULT NULL,
  `voca_meanings` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `voca_examples` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_voca_book_map_book_voca` (`book_id`,`voca_id`),
  KEY `book_id` (`book_id`),
  KEY `voca_id` (`voca_id`),
  CONSTRAINT `fk_admin_voca_book_map_book` FOREIGN KEY (`book_id`) REFERENCES `admin_voca_book` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_admin_voca_book_map_voca` FOREIGN KEY (`voca_id`) REFERENCES `voca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bookstore` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `downloads` int NOT NULL,
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` int DEFAULT NULL,
  `color` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gem` int NOT NULL,
  `hide` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_id` int DEFAULT NULL,
  `book_id` int DEFAULT NULL,
  `admin_voca_book_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `admin_voca_book_id` (`admin_voca_book_id`),
  KEY `book_id` (`book_id`),
  KEY `fk_bookstore_category_id` (`category_id`),
  CONSTRAINT `bookstore_ibfk_1` FOREIGN KEY (`admin_voca_book_id`) REFERENCES `admin_voca_book` (`id`),
  CONSTRAINT `bookstore_ibfk_2` FOREIGN KEY (`book_id`) REFERENCES `voca_book` (`id`),
  CONSTRAINT `fk_bookstore_category_id` FOREIGN KEY (`category_id`) REFERENCES `bookstore_category` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_label` (
  `voca_id` int NOT NULL,
  `cefr` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cefr_source` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `freq_zipf` float DEFAULT NULL,
  `pos` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pos_wordnet` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lemma` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sense_count` int DEFAULT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`voca_id`),
  KEY `ix_voca_label_cefr` (`cefr`),
  KEY `ix_voca_label_freq_zipf` (`freq_zipf`),
  KEY `ix_voca_label_lemma` (`lemma`),
  CONSTRAINT `voca_label_ibfk_1` FOREIGN KEY (`voca_id`) REFERENCES `voca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_meaning_concept` (
  `meaning_id` int NOT NULL,
  `concept_id` int NOT NULL,
  PRIMARY KEY (`meaning_id`,`concept_id`),
  KEY `ix_voca_meaning_concept_concept_id` (`concept_id`),
  CONSTRAINT `voca_meaning_concept_ibfk_1` FOREIGN KEY (`meaning_id`) REFERENCES `voca_meaning` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dict_meta` (
  `key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `daily_sentence` (
  `date` date NOT NULL,
  `sentence` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `meaning` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`date`,`sentence`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `alembic_version` (
  `version_num` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `alembic_version` (`version_num`) VALUES ('6efb3b1f9711');

-- ---------------------------------------------------------------------
-- [3] 일한 확장 테이블
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `voca_ja` (
  `voca_id` int NOT NULL,
  `jmdict_id` int NOT NULL,
  `reading` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '히라가나 읽기(가타카나어는 가타카나)',
  `romaji` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kanji_forms` json DEFAULT NULL COMMENT '[{text,tags,common}]',
  `kana_forms` json DEFAULT NULL COMMENT '[{text,tags,common,appliesToKanji}]',
  `jlpt` varchar(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'N1~N5, 없으면 NULL',
  `freq_rank` int DEFAULT NULL,
  `accent` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Kanjium 피치 액센트(예: 0, 0,2)',
  `uk` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'usually kana — 가나 표제',
  `common` tinyint(1) NOT NULL DEFAULT '0',
  `flags` json DEFAULT NULL COMMENT '10_build_entries 품질 플래그',
  PRIMARY KEY (`voca_id`),
  UNIQUE KEY `uq_voca_ja_jmdict_id` (`jmdict_id`),
  KEY `ix_voca_ja_jlpt` (`jlpt`),
  KEY `ix_voca_ja_reading` (`reading`),
  CONSTRAINT `fk_voca_ja_voca` FOREIGN KEY (`voca_id`) REFERENCES `voca` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_voca_ja_jlpt` CHECK (((`jlpt` is null) or (`jlpt` in (_utf8mb4'N1',_utf8mb4'N2',_utf8mb4'N3',_utf8mb4'N4',_utf8mb4'N5'))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_meaning_ja` (
  `meaning_id` int NOT NULL,
  `sense_no` int DEFAULT NULL COMMENT 'JMdict sense 번호(같은 뜻이 여러 sense 에 있으면 첫 sense)',
  `en_gloss` text COLLATE utf8mb4_unicode_ci COMMENT '영어 gloss "; " 연결 — 감사용, 앱 미노출',
  `jmdict_pos` json DEFAULT NULL COMMENT 'JMdict 품사 태그 배열',
  PRIMARY KEY (`meaning_id`),
  KEY `ix_voca_meaning_ja_sense_no` (`sense_no`),
  CONSTRAINT `fk_voca_meaning_ja_meaning` FOREIGN KEY (`meaning_id`) REFERENCES `voca_meaning` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `voca_example_ja` (
  `example_id` int NOT NULL,
  `sense_no` int DEFAULT NULL,
  `reading_tokens` json DEFAULT NULL COMMENT '20_build_examples 의 reading_tokens 그대로(후리가나용, 예: [[표층, 한자부 읽기, 송가나] | [표층, null]])',
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'tatoeba | generated',
  `tatoeba_ja_id` int DEFAULT NULL,
  `tatoeba_en_id` int DEFAULT NULL,
  `verified` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Tatoeba 색인 ~ (검수된 예문)',
  `span_method` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'headword|surface|lemma|lemma_retry|unindexed|generated',
  PRIMARY KEY (`example_id`),
  KEY `ix_voca_example_ja_tatoeba_ja_id` (`tatoeba_ja_id`),
  KEY `ix_voca_example_ja_source` (`source`),
  CONSTRAINT `fk_voca_example_ja_example` FOREIGN KEY (`example_id`) REFERENCES `voca_example` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_voca_example_ja_source` CHECK ((`source` in (_utf8mb4'tatoeba',_utf8mb4'generated')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
