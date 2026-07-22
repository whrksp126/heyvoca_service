"""bookstore level_id nullable 전환 + 기존 값 초기화

서점 단어장 추천 알고리즘(services/bookstore_recommend.py) 제거에 따라
기존 레벨 값(1~4, 초등/중등/고등/대학생 척도)을 전부 비운다.
새 추천 기준이 확정되면 이 컬럼에 새 척도의 값을 재부여할 예정이라
컬럼 자체는 삭제하지 않고 유지한다.

Revision ID: a3f21c9d5e04
Revises: e88a423260ff
Create Date: 2026-07-22

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f21c9d5e04'
down_revision = 'e88a423260ff'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('bookstore', schema=None) as batch_op:
        batch_op.alter_column(
            'level_id',
            existing_type=sa.Integer(),
            nullable=True,
        )

    # 기존 레벨 값 초기화 (구 척도 폐기)
    op.execute('UPDATE bookstore SET level_id = NULL')


def downgrade():
    # 구 척도 값은 복원할 수 없으므로 NOT NULL 복구를 위해 기본값 1을 채운다.
    op.execute('UPDATE bookstore SET level_id = 1 WHERE level_id IS NULL')

    with op.batch_alter_table('bookstore', schema=None) as batch_op:
        batch_op.alter_column(
            'level_id',
            existing_type=sa.Integer(),
            nullable=False,
        )
