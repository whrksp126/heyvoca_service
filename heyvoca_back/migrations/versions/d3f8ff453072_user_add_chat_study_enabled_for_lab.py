"""user: add chat_study_enabled for lab

Revision ID: d3f8ff453072
Revises: 28a510ca5076
Create Date: 2026-07-18 00:08:23.184185

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = 'd3f8ff453072'
down_revision = '28a510ca5076'
branch_labels = None
depends_on = None


def upgrade():
    # 실험실 '채팅으로 학습' ON/OFF 플래그만 추가.
    # (autogenerate가 감지한 기존 스키마 드리프트 — 인덱스/FK/comment/admin 테이블 등 —
    #  은 이 마이그레이션의 범위가 아니므로 전부 제거했다.)
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('chat_study_enabled', sa.Boolean(), server_default='0', nullable=False))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('chat_study_enabled')
