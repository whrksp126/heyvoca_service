"""add bookstore_category for category sort order

Revision ID: 734eb6582cee
Revises: 68edda4a50b7
Create Date: 2026-05-24 01:25:27.220829

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '734eb6582cee'
down_revision = '68edda4a50b7'
branch_labels = None
depends_on = None


# 카테고리 기본 정렬 — admin이 DB의 sort_order를 직접 수정해 변경 가능
DEFAULT_CATEGORIES = [
    ('수능', 100),
    ('일상생활', 200),
    ('비즈니스', 300),
    ('여행', 400),
    ('음식', 500),
    ('의료', 600),
    ('교육', 700),
    ('기타', 999),
]


def upgrade():
    op.create_table('bookstore_category',
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('name'),
        info={'bind_key': 'dict'}
    )

    bookstore_category = sa.table(
        'bookstore_category',
        sa.column('name', sa.String),
        sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(
        bookstore_category,
        [{'name': n, 'sort_order': o} for n, o in DEFAULT_CATEGORIES],
    )


def downgrade():
    op.drop_table('bookstore_category')
