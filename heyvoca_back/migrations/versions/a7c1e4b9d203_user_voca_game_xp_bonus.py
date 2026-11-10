"""user_voca_game xp_bonus 정답 XP 바닥 보정

이슈 #25 11차 QA — 새 씨앗을 심은 직후 같은 날 다시 맞혀도 FSRS stability 가 거의 안 변해
작물 XP 증가가 0 이었다. 정답인데 증가가 0 이면 1 을 더해 주고(같은 단어 같은 날 1회),
그 누적분을 xp_bonus 에 남긴다(app/services/game/farm_v2/xp.py).

Revision ID: a7c1e4b9d203
Revises: f47bf9e66d5c
Create Date: 2026-11-10 12:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = 'a7c1e4b9d203'
down_revision = 'f47bf9e66d5c'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_voca_game', schema=None) as batch_op:
        batch_op.add_column(sa.Column('xp_bonus', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('xp_bonus_day', sa.Date(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_voca_game', schema=None) as batch_op:
        batch_op.drop_column('xp_bonus_day')
        batch_op.drop_column('xp_bonus')
