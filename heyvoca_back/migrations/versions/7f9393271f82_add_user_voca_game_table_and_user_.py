"""add user_voca_game table and user.revive_item_cnt

Revision ID: 7f9393271f82
Revises: c9d2e15a7b30
Create Date: 2026-07-05 04:01:13.435651

당근 농장(트랙 ④) — 게임 레이어 전용 테이블 + 부활템 카운트.
autogenerate가 잡은 기존 스키마 드리프트(인덱스/코멘트/FK 재정렬)는
이 트랙과 무관하므로 제외하고, 신규 2건만 반영한다.
"""
from alembic import op
import sqlalchemy as sa
from app.models.models import BinaryUUID


# revision identifiers, used by Alembic.
revision = '7f9393271f82'
down_revision = 'c9d2e15a7b30'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_voca_game',
        sa.Column('user_voca_id', sa.Integer(), nullable=False),
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('life', sa.String(length=8), nullable=False, server_default='ALIVE'),
        sa.Column('died_at', sa.DateTime(), nullable=True),
        sa.Column('death_seen', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('deaths_cnt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('revives_cnt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('carrot_rewarded', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['user_voca_id'], ['user_voca.id'], ),
        sa.PrimaryKeyConstraint('user_voca_id'),
    )
    op.create_index('ix_user_voca_game_user_id', 'user_voca_game', ['user_id'], unique=False)

    op.add_column('user', sa.Column('revive_item_cnt', sa.Integer(), server_default='0', nullable=False))


def downgrade():
    op.drop_column('user', 'revive_item_cnt')
    # drop_table이 인덱스·FK를 함께 제거 (인덱스 단독 드롭은 FK가 잡고 있어 불가)
    op.drop_table('user_voca_game')
