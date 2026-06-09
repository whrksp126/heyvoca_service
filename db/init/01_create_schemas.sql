-- heyvoca DB 분리: 두 개의 schema 자동 생성
-- mysql 컨테이너 첫 기동 시 1회 자동 실행 (/docker-entrypoint-initdb.d/)
--
-- heyvoca_dict : 사전 데이터 (Voca, VocaMeaning, VocaExample, VocaBook,
--                AdminVocaBook, Bookstore, DailySentence + 매핑 테이블)
-- heyvoca_user : 사용자 데이터 (User, Purchase, UserVocaBook, UserVoca 등)
--
-- 기존 단일 schema(heyvoca)에서 분리 이행하는 환경에서는
-- migrate_to_split.sh가 별도로 실행되어야 함.

CREATE DATABASE IF NOT EXISTS heyvoca_user
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS heyvoca_dict
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON heyvoca_user.* TO 'voca'@'%';
GRANT ALL PRIVILEGES ON heyvoca_dict.* TO 'voca'@'%';
-- dict_sync.py는 사전 갱신 시 임시 schema heyvoca_dict_new 를 CREATE/import 후
-- heyvoca_dict 로 swap 한다. voca 유저가 그 임시 schema에도 권한이 있어야
-- swap 단계에서 ERROR 1044 (Access denied to 'heyvoca_dict_new') 가 안 난다.
-- heyvoca_ 로 시작하는 모든 schema(heyvoca_user/heyvoca_dict/heyvoca_dict_new 등) 커버.
GRANT ALL PRIVILEGES ON `heyvoca\_%`.* TO 'voca'@'%';
FLUSH PRIVILEGES;
