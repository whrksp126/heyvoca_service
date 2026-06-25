"""user: daily_new_limit 컬럼 추가 (AI추천 일일 신규 상한)

Revision ID: 56029e444493
Revises: 348f2b6afb1c
Create Date: 2026-06-24 22:01:38.597516

주의: autogenerate가 끌어온 인덱스 삭제/FK 재생성/컬럼 코멘트 노이즈는
모두 제거하고, 실제 의도한 user.daily_new_limit 컬럼 추가만 남김.
server_default='20' → 기존 사용자 행도 20으로 백필.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '56029e444493'
down_revision = '348f2b6afb1c'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('daily_new_limit', sa.Integer(), server_default='20', nullable=False)
        )


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('daily_new_limit')
