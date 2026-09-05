"""voca_meaning에 한국어 뜻별 UD 품사 추가

Revision ID: c9f04a1e2b7d
Revises: fb357e514820
Create Date: 2026-08-22 05:40:00
"""
from alembic import op
import sqlalchemy as sa


revision = 'c9f04a1e2b7d'
down_revision = 'fb357e514820'
branch_labels = None
depends_on = None


VALID_POS_SQL = (
    "'NOUN','VERB','ADJ','ADV','PRON','DET','ADP','CCONJ','SCONJ',"
    "'NUM','INTJ','PART','AUX','PROPN','X'"
)


def upgrade():
    with op.batch_alter_table('voca_meaning', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pos', sa.String(length=16), nullable=True))
        batch_op.create_index('ix_voca_meaning_pos', ['pos'], unique=False)
        batch_op.create_check_constraint(
            'ck_voca_meaning_pos', f'pos IS NULL OR pos IN ({VALID_POS_SQL})')


def downgrade():
    with op.batch_alter_table('voca_meaning', schema=None) as batch_op:
        batch_op.drop_constraint('ck_voca_meaning_pos', type_='check')
        batch_op.drop_index('ix_voca_meaning_pos')
        batch_op.drop_column('pos')
