"""realign user_recent_study.type enum (add QUICK)

dev/stg/prod에서 alembic head는 d1a3f9b2c405이지만 실제 컬럼은
ENUM('TEST','EXAM','TODAY')로 QUICK이 빠져있어 빠른 복습이 INSERT 실패.
멱등 ALTER로 정렬 맞춤.

Revision ID: a7b3c12e9f04
Revises: d1a3f9b2c405
Create Date: 2026-05-07 10:00:00.000000
"""
from alembic import op


revision = 'a7b3c12e9f04'
down_revision = 'd1a3f9b2c405'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE user_recent_study "
        "MODIFY COLUMN type ENUM('TEST','EXAM','TODAY','QUICK') NOT NULL"
    )


def downgrade():
    op.execute(
        "ALTER TABLE user_recent_study "
        "MODIFY COLUMN type ENUM('TEST','EXAM','TODAY') NOT NULL"
    )
