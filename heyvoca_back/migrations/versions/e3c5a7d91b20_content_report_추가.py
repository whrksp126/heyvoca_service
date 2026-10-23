"""content_report 테이블 추가 (학습 중 데이터 오류 신고)

Revision ID: e3c5a7d91b20
Revises: d7a41e9b2c10
Create Date: 2026-10-23

손으로 작성 — autogenerate 의 무관한 drift 는 제외하고 새 테이블만 만든다.
"""
from alembic import op
import sqlalchemy as sa
from app.models.models import BinaryUUID


revision = 'e3c5a7d91b20'
down_revision = 'd7a41e9b2c10'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'content_report',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', BinaryUUID(), nullable=False, comment='user.id 참조 (FK 없음)'),
        sa.Column('voca_id', sa.Integer(), nullable=True, comment='사전 voca id (dict_lang 기준)'),
        sa.Column('user_voca_id', sa.Integer(), nullable=True, comment='user_voca.id 참조 (FK 없음)'),
        sa.Column('dict_lang', sa.String(length=8), nullable=True, comment='en|ja|script|custom'),
        sa.Column('target_key', sa.String(length=191), nullable=True, comment='사전 id 가 없을 때 식별자(글자·단어 원문)'),
        sa.Column('word', sa.String(length=255), nullable=True, comment='신고 시점 단어 원문(목록 표시용)'),
        sa.Column('question_type', sa.String(length=48), nullable=True),
        sa.Column('test_type', sa.String(length=16), nullable=True),
        sa.Column('reason', sa.String(length=32), nullable=False, comment='meaning|example|audio|grading|question|other'),
        sa.Column('memo', sa.String(length=500), nullable=True),
        sa.Column('snapshot', sa.JSON(), nullable=True, comment='신고 시점 화면 재현 데이터'),
        sa.Column('app_version', sa.String(length=32), nullable=True),
        sa.Column('web_version', sa.String(length=64), nullable=True),
        sa.Column('platform', sa.String(length=16), nullable=True, comment='ios|android|web'),
        sa.Column('status', sa.String(length=16), server_default='open', nullable=False, comment='open|resolved|rejected'),
        sa.Column('resolve_note', sa.String(length=1000), nullable=True),
        sa.Column('resolved_by', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_content_report_status_created', 'content_report', ['status', 'created_at'], unique=False)
    op.create_index('ix_content_report_voca', 'content_report', ['dict_lang', 'voca_id'], unique=False)
    op.create_index('ix_content_report_user_created', 'content_report', ['user_id', 'created_at'], unique=False)


def downgrade():
    op.drop_index('ix_content_report_user_created', table_name='content_report')
    op.drop_index('ix_content_report_voca', table_name='content_report')
    op.drop_index('ix_content_report_status_created', table_name='content_report')
    op.drop_table('content_report')
