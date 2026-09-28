"""user_study_log tier_target tier_shown 추가

Revision ID: 7f213746b98b
Revises: aaa9517b6879
Create Date: 2026-09-28 01:51:02.177481

2026-09 "출제형 문제 1단계" — 자동 출제 난이도 기록 컬럼 2개 추가.
파티션 테이블(user_study_log, PARTITION BY RANGE(YEAR(created_at)))이라 FK/PK 제약
변경은 위험하지만, nullable 컬럼 ADD COLUMN은 MySQL이 파티션별로 그대로 반영한다.

주의: `flask db migrate` autogenerate가 이 리비전 시점에 로컬 DB와 모델 사이의
기존(이 작업과 무관한) drift도 함께 잡아냈다 — admin 테이블 삭제, 여러 컬럼 comment
동기화, FK/인덱스 재생성 등. 이 작업 범위 밖이라 손으로 걷어내고 tier_target/
tier_shown 추가만 남겼다(리뷰 시 `flask db migrate`를 다시 돌리면 그 drift가 또
detected될 수 있음 — 이 파일 이슈 아님, 기존부터 있던 상태).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7f213746b98b'
down_revision = 'aaa9517b6879'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'tier_target', sa.Integer(), nullable=True,
            comment='이 단어의 "정해진 난이도"(1~5, 자동 출제 tier). '
                    '단일 소스: app/constants/question_types.py QUESTION_TYPE_TIER. '
                    '2026-09 추가, 그 이전 로그는 NULL(레거시).',
        ))
        batch_op.add_column(sa.Column(
            'tier_shown', sa.Integer(), nullable=True,
            comment='실제로 보여준 문제의 난이도(1~5) — tier_target과 달라질 수 있음'
                    '(30% 확률로 더 쉬운 tier를 섞어 보여줌). 2026-09 추가.',
        ))


def downgrade():
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.drop_column('tier_shown')
        batch_op.drop_column('tier_target')
