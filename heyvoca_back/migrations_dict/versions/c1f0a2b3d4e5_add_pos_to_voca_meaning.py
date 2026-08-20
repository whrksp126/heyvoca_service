"""add pos to voca_meaning

뜻별 품사(LLM 산출) 컬럼 추가. voca_label.pos(spaCy)/pos_wordnet과 교차검증용.

Revision ID: c1f0a2b3d4e5
Revises: a3f21c9d5e04
Create Date: 2026-07-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1f0a2b3d4e5'
down_revision = 'a3f21c9d5e04'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('voca_meaning', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pos', sa.String(length=16), nullable=True))
        batch_op.create_index(batch_op.f('ix_voca_meaning_pos'), ['pos'], unique=False)


def downgrade():
    with op.batch_alter_table('voca_meaning', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_voca_meaning_pos'))
        batch_op.drop_column('pos')
