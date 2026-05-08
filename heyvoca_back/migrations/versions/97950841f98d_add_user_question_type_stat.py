"""add user_question_type_stat

Revision ID: 97950841f98d
Revises: f87ecd023ecb
Create Date: 2026-05-08 00:25:17.285872

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '97950841f98d'
down_revision = 'f87ecd023ecb'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_question_type_stat',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BINARY(16), nullable=False),
        sa.Column('question_type', sa.String(length=32), nullable=False,
                  comment='multipleChoice|multipleChoiceListening|fillInTheBlank|cardMatch|cardMatchListening'),
        sa.Column('total_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('correct_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_time_taken_ms', sa.Integer(), nullable=False, server_default='0',
                  comment='EWMA: new_avg = 0.9*old + 0.1*new'),
        sa.Column('last_30d_correct_rate', sa.Float(), nullable=True,
                  comment='배치(refresh_question_type_stats.py)로 갱신'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_uqts_user'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'question_type', name='uq_user_qtype'),
    )
    with op.batch_alter_table('user_question_type_stat', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_user_question_type_stat_user_id'),
            ['user_id'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('user_question_type_stat', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_question_type_stat_user_id'))

    op.drop_table('user_question_type_stat')
