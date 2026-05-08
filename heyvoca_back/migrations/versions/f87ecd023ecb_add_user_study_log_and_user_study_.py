"""add user_study_log and user_study_session

Revision ID: f87ecd023ecb
Revises: b8e4d23a107f
Create Date: 2026-05-07 23:32:30.266609

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = 'f87ecd023ecb'
down_revision = 'b8e4d23a107f'
branch_labels = None
depends_on = None


def upgrade():
    # user_study_session: 학습 세션 컨테이너
    op.create_table(
        'user_study_session',
        sa.Column('id', sa.BINARY(16), nullable=False),
        sa.Column('user_id', sa.BINARY(16), nullable=False),
        sa.Column('test_type', sa.String(length=16), nullable=False, comment='test|exam|today|quick'),
        sa.Column('book_ids', sa.TEXT(), nullable=True, comment='JSON 배열: ["uuid",...]'),
        sa.Column('question_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('correct_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('user_study_session', schema=None) as batch_op:
        batch_op.create_index('ix_user_study_session_user_id', ['user_id'], unique=False)

    # user_study_log: 단어 1회 응답 로그
    op.create_table(
        'user_study_log',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BINARY(16), nullable=False),
        sa.Column('user_voca_id', sa.Integer(), nullable=False),
        sa.Column('voca_id', sa.Integer(), nullable=True,
                  comment='사전 DB 단어 참조 (cross-schema, FK 없음)'),
        sa.Column('user_voca_book_id', sa.BINARY(16), nullable=True),
        sa.Column('session_id', sa.BINARY(16), nullable=False,
                  comment='user_study_session.id 참조 (FK 없음)'),
        sa.Column('test_type', sa.String(length=16), nullable=False,
                  comment='test|exam|today|quick'),
        sa.Column('question_type', sa.String(length=32), nullable=False,
                  comment='multipleChoice|multipleChoiceListening|fillInTheBlank|cardMatch|cardMatchListening'),
        sa.Column('was_correct', sa.Boolean(), nullable=False),
        sa.Column('q_score', sa.Integer(), nullable=False,
                  comment='SM2 점수: 0/3/4/5'),
        sa.Column('rating', sa.Integer(), nullable=True,
                  comment='FSRS: 1=Again,2=Hard,3=Good,4=Easy (Phase 1.2부터 채움)'),
        sa.Column('time_taken_ms', sa.Integer(), nullable=False),
        sa.Column('word_length', sa.Integer(), nullable=True),
        sa.Column('state_before', sa.TEXT(), nullable=True,
                  comment='FSRS state JSON (적용 전)'),
        sa.Column('state_after', sa.TEXT(), nullable=True,
                  comment='FSRS state JSON (적용 후)'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.ForeignKeyConstraint(['user_voca_book_id'], ['user_voca_book.id']),
        sa.ForeignKeyConstraint(['user_voca_id'], ['user_voca.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.create_index('ix_usl_session',      ['session_id'],              unique=False)
        batch_op.create_index('ix_usl_user_created', ['user_id', 'created_at'],   unique=False)
        batch_op.create_index('ix_usl_user_voca',    ['user_id', 'user_voca_id'], unique=False)


def downgrade():
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.drop_index('ix_usl_user_voca')
        batch_op.drop_index('ix_usl_user_created')
        batch_op.drop_index('ix_usl_session')
    op.drop_table('user_study_log')

    with op.batch_alter_table('user_study_session', schema=None) as batch_op:
        batch_op.drop_index('ix_user_study_session_user_id')
    op.drop_table('user_study_session')
