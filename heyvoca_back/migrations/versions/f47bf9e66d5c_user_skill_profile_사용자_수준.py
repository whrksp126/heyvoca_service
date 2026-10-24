"""user_skill_profile 사용자 수준

이슈 #16 — 학습 언어별 사용자 능력치(θ)·유형별·실수 유형별 집계.
정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §2

Revision ID: f47bf9e66d5c
Revises: e3c5a7d91b20
Create Date: 2026-10-25 01:21:03.797939

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f47bf9e66d5c'
down_revision = 'e3c5a7d91b20'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('user_skill_profile',
    sa.Column('user_id', sa.BINARY(length=16), nullable=False, comment='user.id 참조 (FK 없음)'),
    sa.Column('lang', sa.String(length=8), nullable=False, comment='en|ja'),
    sa.Column('theta', sa.Float(), nullable=False, comment='0~100 능력치(예문 score 와 같은 척도)'),
    sa.Column('answers', sa.Integer(), nullable=False),
    sa.Column('type_stats', sa.JSON(), nullable=True, comment='{questionType: {n, correct, ewma}}'),
    sa.Column('error_stats', sa.JSON(), nullable=True, comment='{typo, form, distractor, order, wrong_choice, timeout}'),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('user_id', 'lang')
    )


def downgrade():
    op.drop_table('user_skill_profile')
