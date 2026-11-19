"""user_voca.meaning_pos — 사용자 입력 뜻의 명시 품사

뜻 텍스트에 섞여 들어오던 품사 약어("n. 환불", "[동] 환불하다")를 저장할 때 떼어 내고,
떼어 낸 품사를 {뜻 텍스트: UD 태그} JSON 으로 남긴다. NULL 허용 — 기존 행은 "명시 품사 없음".

Revision ID: c4e8a2f1d9b7
Revises: b3d5f7a9c112
Create Date: 2026-11-19 12:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = 'c4e8a2f1d9b7'
down_revision = 'b3d5f7a9c112'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_voca', schema=None) as batch_op:
        batch_op.add_column(sa.Column('meaning_pos', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_voca', schema=None) as batch_op:
        batch_op.drop_column('meaning_pos')
