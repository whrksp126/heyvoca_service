"""fix RecentStudyType enum to uppercase and add QUICK

Revision ID: d1a3f9b2c405
Revises: cff28fdbef00
Create Date: 2026-04-17 05:30:00.000000

"""
from alembic import op

revision = 'd1a3f9b2c405'
down_revision = 'cff28fdbef00'
branch_labels = None
depends_on = None


def upgrade():
    # 소문자로 저장된 기존 데이터를 대문자로 변환
    op.execute("UPDATE user_recent_study SET type = 'TEST'  WHERE type = 'test'")
    op.execute("UPDATE user_recent_study SET type = 'EXAM'  WHERE type = 'exam'")
    op.execute("UPDATE user_recent_study SET type = 'TODAY' WHERE type = 'today'")
    op.execute("UPDATE user_recent_study SET type = 'QUICK' WHERE type = 'quick'")
    # ENUM 컬럼을 SQLAlchemy가 기대하는 대문자 값으로 재정의
    op.execute(
        "ALTER TABLE user_recent_study MODIFY COLUMN type ENUM('TEST','EXAM','TODAY','QUICK') NOT NULL"
    )


def downgrade():
    op.execute("UPDATE user_recent_study SET type = 'test'  WHERE type = 'TEST'")
    op.execute("UPDATE user_recent_study SET type = 'exam'  WHERE type = 'EXAM'")
    op.execute("UPDATE user_recent_study SET type = 'today' WHERE type = 'TODAY'")
    op.execute(
        "ALTER TABLE user_recent_study MODIFY COLUMN type ENUM('test','exam','today') NOT NULL"
    )
