"""add quick to RecentStudyType

Revision ID: cff28fdbef00
Revises: 6c8175362eee
Create Date: 2026-04-17 05:09:58.579564

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'cff28fdbef00'
down_revision = '6c8175362eee'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE user_recent_study MODIFY COLUMN type ENUM('test', 'exam', 'today', 'quick') NOT NULL"
    )


def downgrade():
    op.execute(
        "ALTER TABLE user_recent_study MODIFY COLUMN type ENUM('test', 'exam', 'today') NOT NULL"
    )
