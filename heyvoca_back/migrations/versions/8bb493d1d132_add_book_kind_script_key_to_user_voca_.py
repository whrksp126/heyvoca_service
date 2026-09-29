"""add book_kind/script_key to user_voca_book

Revision ID: 8bb493d1d132
Revises: 1a2b3c4d5e6f
Create Date: 2026-09-30 00:11:54.274952

글자 밭(히라가나/가타카나/알파벳) 재설계 — 글자 전용 단어장을 일반 단어장과 구분하기
위한 컬럼 2개만 추가한다. `flask db migrate`가 이 모델 변경과 무관한 기존 drift
(주석 차이, 인덱스/FK 이름 차이, admin 테이블 등)도 함께 감지했지만, 그건 이 변경의
책임이 아니라서 수동으로 걷어내고 user_voca_book 변경만 남겼다
(heyvoca_service/.claude/rules/db-migration.md "생성된 파일 검토 후 commit" 참고).
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '8bb493d1d132'
down_revision = '1a2b3c4d5e6f'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_voca_book', schema=None) as batch_op:
        batch_op.add_column(sa.Column('book_kind', sa.String(length=16),
                                      server_default='normal', nullable=False))
        batch_op.add_column(sa.Column('script_key', sa.String(length=16), nullable=True))
        batch_op.create_index(batch_op.f('ix_user_voca_book_book_kind'), ['book_kind'], unique=False)


def downgrade():
    with op.batch_alter_table('user_voca_book', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_voca_book_book_kind'))
        batch_op.drop_column('script_key')
        batch_op.drop_column('book_kind')
