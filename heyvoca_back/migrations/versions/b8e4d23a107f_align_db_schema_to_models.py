"""align DB schema to models (legacy drift 정리)

verify_schema.py가 발견한 모델 ↔ DB 불일치를 모델 기준으로 정렬.
- cross-schema FK 잔재 (heyvoca_user → heyvoca_dict 참조) 제거 — 환경별 잔재 차이 있음
- user_voca.word VARCHAR(50) → VARCHAR(255)
- user_voca_book.voca_list LONGTEXT → TEXT
- nullable 정합성 6건
- user.code NULL 허용 → NOT NULL (사전 점검: NULL 행 dev/stg/prod 모두 0)

데이터 안전 확인:
- user.code NULL 행: 0
- voca_list 65535 초과: 0
- voca_list MAX length: 0 (실사용 거의 없음)

Revision ID: b8e4d23a107f
Revises: a7b3c12e9f04
Create Date: 2026-05-07 10:50:00.000000
"""
from alembic import op
from sqlalchemy import text


revision = 'b8e4d23a107f'
down_revision = 'a7b3c12e9f04'
branch_labels = None
depends_on = None


def _drop_fk_if_exists(table, column):
    """환경별 FK 이름이 다를 수 있어 information_schema에서 조회 후 drop."""
    conn = op.get_bind()
    rows = conn.execute(text("""
        SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :tbl
          AND COLUMN_NAME = :col
          AND REFERENCED_TABLE_NAME IS NOT NULL
    """), {'tbl': table, 'col': column}).fetchall()
    for (fk_name,) in rows:
        op.execute(f"ALTER TABLE {table} DROP FOREIGN KEY {fk_name}")


def upgrade():
    # 1. cross-schema FK 잔재 정리 (모델은 이미 FK 제거. DB 잔재만 정리)
    #    user_voca.voca_id → voca (heyvoca_dict)
    #    user_voca_book.bookstore_id → bookstore (heyvoca_dict)
    _drop_fk_if_exists('user_voca', 'voca_id')
    _drop_fk_if_exists('user_voca_book', 'bookstore_id')

    # 2. user_voca.word 길이 확장
    op.execute("ALTER TABLE user_voca MODIFY COLUMN word VARCHAR(255) NULL")

    # 3. user_voca_book.voca_list 타입 정합 (LONGTEXT → TEXT)
    op.execute("ALTER TABLE user_voca_book MODIFY COLUMN voca_list TEXT NULL")

    # 4. nullable 완화
    op.execute("ALTER TABLE goal_type MODIFY COLUMN description VARCHAR(36) NULL")
    op.execute("ALTER TABLE goals MODIFY COLUMN description VARCHAR(512) NULL")
    op.execute("ALTER TABLE goals MODIFY COLUMN badge_img VARCHAR(128) NULL")
    op.execute("ALTER TABLE user MODIFY COLUMN refresh_token VARCHAR(512) NULL")
    op.execute("ALTER TABLE user_voca_book_map MODIFY COLUMN user_voca_book_id BINARY(16) NULL")
    op.execute("ALTER TABLE user_voca_book_map MODIFY COLUMN user_voca_id INT NULL")

    # 5. user.code NOT NULL 강제 (사전 검증: NULL 행 0건)
    op.execute("ALTER TABLE user MODIFY COLUMN code VARCHAR(36) NOT NULL")


def downgrade():
    op.execute("ALTER TABLE user MODIFY COLUMN code VARCHAR(36) NULL")
    op.execute("ALTER TABLE user_voca_book_map MODIFY COLUMN user_voca_id INT NOT NULL")
    op.execute("ALTER TABLE user_voca_book_map MODIFY COLUMN user_voca_book_id BINARY(16) NOT NULL")
    op.execute("ALTER TABLE user MODIFY COLUMN refresh_token VARCHAR(512) NOT NULL")
    op.execute("ALTER TABLE goals MODIFY COLUMN badge_img VARCHAR(128) NOT NULL")
    op.execute("ALTER TABLE goals MODIFY COLUMN description VARCHAR(512) NOT NULL")
    op.execute("ALTER TABLE goal_type MODIFY COLUMN description VARCHAR(36) NOT NULL")
    op.execute("ALTER TABLE user_voca_book MODIFY COLUMN voca_list LONGTEXT NULL")
    op.execute("ALTER TABLE user_voca MODIFY COLUMN word VARCHAR(50) NULL")
    # FK는 cross-schema라 복구하지 않음 (모델에 이미 없음)
