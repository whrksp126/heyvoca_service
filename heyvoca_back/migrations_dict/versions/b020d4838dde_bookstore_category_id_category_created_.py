"""bookstore_category: id/category/created_at 컬럼 추가

Revision ID: b020d4838dde
Revises: 734eb6582cee
Create Date: 2026-06-04 02:06:17.128808

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = 'b020d4838dde'
down_revision = '734eb6582cee'
branch_labels = None
depends_on = None


def upgrade():
    # 1) 기존 데이터를 임시 테이블에 백업 (name, sort_order)
    op.execute("CREATE TABLE bookstore_category_backup AS SELECT * FROM bookstore_category")

    # 2) 새 구조로 recreate (FK 의존 있어서 DROP 전에 FK 제약 먼저 해제)
    op.execute("DROP TABLE bookstore_category")
    op.execute(
        """
        CREATE TABLE bookstore_category (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            category VARCHAR(100) NOT NULL,
            sort_order INT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )

    # 3) 데이터 복원: name → category, sort_order 유지, created_at 자동
    op.execute(
        "INSERT INTO bookstore_category (category, sort_order) "
        "SELECT name, sort_order FROM bookstore_category_backup ORDER BY sort_order"
    )

    # 4) 백업 정리
    op.execute("DROP TABLE bookstore_category_backup")

    # 5) bookstore.created_at NOT NULL + bookstore.category_id → bookstore_category.id FK
    with op.batch_alter_table('bookstore', schema=None) as batch_op:
        batch_op.alter_column(
            'created_at',
            existing_type=mysql.DATETIME(),
            nullable=False,
        )
        batch_op.create_foreign_key(
            'fk_bookstore_category_id',
            'bookstore_category',
            ['category_id'],
            ['id'],
        )


def downgrade():
    with op.batch_alter_table('bookstore', schema=None) as batch_op:
        batch_op.drop_constraint('fk_bookstore_category_id', type_='foreignkey')
        batch_op.alter_column(
            'created_at',
            existing_type=mysql.DATETIME(),
            nullable=True,
        )

    op.execute("CREATE TABLE bookstore_category_backup AS SELECT category AS name, sort_order FROM bookstore_category")
    op.execute("DROP TABLE bookstore_category")
    op.execute(
        """
        CREATE TABLE bookstore_category (
            name VARCHAR(50) NOT NULL PRIMARY KEY,
            sort_order INT NOT NULL
        ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        "INSERT INTO bookstore_category (name, sort_order) "
        "SELECT name, sort_order FROM bookstore_category_backup"
    )
    op.execute("DROP TABLE bookstore_category_backup")
