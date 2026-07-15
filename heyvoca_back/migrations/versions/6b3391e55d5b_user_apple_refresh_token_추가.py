"""user: apple_refresh_token 추가

Revision ID: 6b3391e55d5b
Revises: d8b4f1e30a72
Create Date: 2026-07-15 23:44:37.352223

Sign in with Apple refresh_token 저장 컬럼 추가 (회원 탈퇴 시 apple revoke에 사용).

주의: `flask db migrate` autogenerate가 이 변경과 무관한 기존 스키마 drift
(admin 테이블 제거, 컬럼 comment 삭제, user.email/google_id 인덱스 삭제,
gem_log/user_voca_book_map FK 이름 변경 등)까지 함께 잡아내서 수동으로 걷어내고
apple_refresh_token 컬럼 추가만 남겼다. 해당 drift는 이 마이그레이션의 목적과
무관하며 되돌리면 위험(unique index 삭제 등)하므로 별도 검토 후 처리할 것.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '6b3391e55d5b'
down_revision = 'd8b4f1e30a72'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('apple_refresh_token', sa.String(length=512), nullable=True))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('apple_refresh_token')
