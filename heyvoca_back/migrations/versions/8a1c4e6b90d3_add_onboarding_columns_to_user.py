"""add onboarding columns to user (source_channel, learning_goal, onboarding_ver)

Revision ID: 8a1c4e6b90d3
Revises: 7f9393271f82
Create Date: 2026-07-05 05:20:00.000000

온보딩(트랙 ⑤) — 유입 경로 / 학습 목표 / 온보딩 버전.
onboarding_ver NULL = 기존 사용자(전 기능 해금), '1' = 신규(점진 해금).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8a1c4e6b90d3'
down_revision = '7f9393271f82'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('source_channel', sa.String(length=50), nullable=True))
    op.add_column('user', sa.Column('learning_goal', sa.String(length=50), nullable=True))
    op.add_column('user', sa.Column('onboarding_ver', sa.String(length=20), nullable=True))


def downgrade():
    op.drop_column('user', 'onboarding_ver')
    op.drop_column('user', 'learning_goal')
    op.drop_column('user', 'source_channel')
