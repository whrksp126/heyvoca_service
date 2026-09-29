"""add user_script_progress (글자 밭 — 문자 숙달)

Revision ID: 1a2b3c4d5e6f
Revises: 60b182320ce1
Create Date: 2026-09-29 00:00:00.000000

'글자 밭' 기능 — 일본어(히라가나/가타카나)·영어(알파벳) 문자 학습. 문자 데이터셋
(어떤 글자가 있는지, 순서 등) 자체는 프론트 정적 JSON이 정본이고, 서버는 사용자별
글자 숙달(level 0~5)과 간격 반복 스케줄만 저장한다.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1a2b3c4d5e6f'
down_revision = '60b182320ce1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_script_progress',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BINARY(16), nullable=False),
        sa.Column('script', sa.String(length=16), nullable=False,
                  comment='hiragana|katakana|alphabet'),
        sa.Column('char', sa.String(length=8), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('correct_cnt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('wrong_cnt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_studied_at', sa.DateTime(), nullable=True),
        sa.Column('next_review_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_usp_user'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'script', 'char', name='uq_user_script_char'),
    )
    with op.batch_alter_table('user_script_progress', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_user_script_progress_user_script'),
            ['user_id', 'script'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('user_script_progress', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_script_progress_user_script'))

    op.drop_table('user_script_progress')
