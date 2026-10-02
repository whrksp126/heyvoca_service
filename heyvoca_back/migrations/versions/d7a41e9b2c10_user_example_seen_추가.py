"""user_example_seen 테이블 추가 (본 예문 노출 기록)

Revision ID: d7a41e9b2c10
Revises: c319aa43d917
Create Date: 2026-10-02

손으로 작성 — autogenerate 의 무관한 drift 는 제외하고 새 테이블만 만든다.
"""
from alembic import op
import sqlalchemy as sa
from app.models.models import BinaryUUID


revision = 'd7a41e9b2c10'
down_revision = 'c319aa43d917'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_example_seen',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', BinaryUUID(), nullable=False, comment='user.id 참조 (FK 없음)'),
        sa.Column('user_voca_id', sa.Integer(), nullable=False, comment='user_voca.id 참조 (FK 없음)'),
        sa.Column('example_hash', sa.String(length=64), nullable=False, comment='본 예문의 sentence_hash'),
        sa.Column('seen_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ues_user_voca_seen', 'user_example_seen',
                    ['user_id', 'user_voca_id', 'seen_at'], unique=False)


def downgrade():
    op.drop_index('ix_ues_user_voca_seen', table_name='user_example_seen')
    op.drop_table('user_example_seen')
