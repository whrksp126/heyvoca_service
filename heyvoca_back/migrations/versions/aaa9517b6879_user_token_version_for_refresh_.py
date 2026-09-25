"""user: token_version for refresh revocation

Revision ID: aaa9517b6879
Revises: c4d1e7a9b203
Create Date: 2026-09-26 07:50:47.382202

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'aaa9517b6879'
down_revision = 'c4d1e7a9b203'
branch_labels = None
depends_on = None


def upgrade():
    # 자동 감지된 무관한 drift(다른 테이블의 index/comment/FK 변경)는 제거하고
    # 이 마이그레이션의 목적인 컬럼 추가만 남긴다.
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('token_version', sa.Integer(), server_default='0', nullable=False))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('token_version')
