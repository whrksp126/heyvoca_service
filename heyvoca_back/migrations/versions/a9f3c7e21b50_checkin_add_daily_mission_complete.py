"""checkin: add daily_mission_complete column

데일리 미션(신규 목표 달성 AND 복습 잔여 0) 완료 여부 컬럼 추가.
기존 today_study_complete 는 '출석(오늘 학습함)' 의미로 계속 사용.

Revision ID: a9f3c7e21b50
Revises: 8a1c4e6b90d3
Create Date: 2026-07-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a9f3c7e21b50'
down_revision = '8a1c4e6b90d3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('check_in', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'daily_mission_complete',
                sa.Boolean(),
                nullable=False,
                server_default='0',
                comment='데일리 미션(신규+복습) 완료 여부 — 끈기왕 streak 기준',
            )
        )


def downgrade():
    with op.batch_alter_table('check_in', schema=None) as batch_op:
        batch_op.drop_column('daily_mission_complete')
