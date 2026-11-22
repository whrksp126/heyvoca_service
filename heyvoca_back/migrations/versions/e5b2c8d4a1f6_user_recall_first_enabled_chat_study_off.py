"""user.recall_first_enabled 추가 + 실험실 '채팅으로 학습' 전원 해제

- 실험실 '먼저 떠올려 보기' 플래그 추가(기본 off).
- '채팅으로 학습' 기능 제거에 따라 기존 사용자 chat_study_enabled 를 모두 0 으로.
  컬럼 자체는 구버전 앱/웹 호환을 위해 남긴다.

Revision ID: e5b2c8d4a1f6
Revises: c4e8a2f1d9b7
Create Date: 2026-11-23 12:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = 'e5b2c8d4a1f6'
down_revision = 'c4e8a2f1d9b7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('recall_first_enabled', sa.Boolean(), server_default='0', nullable=False))
    op.execute("UPDATE `user` SET chat_study_enabled = 0 WHERE chat_study_enabled = 1")


def downgrade():
    # chat_study_enabled 값은 복구하지 않는다(기능 제거).
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('recall_first_enabled')
