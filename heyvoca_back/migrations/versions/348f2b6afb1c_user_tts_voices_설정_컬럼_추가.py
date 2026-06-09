"""user: tts_voices 설정 컬럼 추가

Revision ID: 348f2b6afb1c
Revises: c3e8a10b4d22
Create Date: 2026-06-09 15:44:39.448114

주: autogenerate가 기존 스키마 drift(인덱스/FK/comment)도 감지했으나,
이 마이그레이션의 의도는 user.tts_voices 컬럼 추가뿐이므로 그 외 변경은 모두 제거함.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '348f2b6afb1c'
down_revision = 'c3e8a10b4d22'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tts_voices', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('tts_voices')
