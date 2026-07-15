"""add is_onboarding marker to user_study_session

Revision ID: 270f588d04f8
Revises: 6b3391e55d5b
Create Date: 2026-07-16 01:05:19.697974

온보딩 가입 세션(/onboarding/migrate)을 정규 학습 세션과 구분하는 마커 컬럼 추가.
unlock_status의 완료 세션(정규 학습 횟수) 카운트에서 온보딩 세션을 제외하기 위함.

주의: `flask db migrate`가 자동 생성한 원본 파일에는 기존 스키마 drift(무관한 테이블
drop/index/comment 변경 다수)가 함께 잡혔으나, 이번 변경과 무관해 전부 제거하고
`user_study_session.is_onboarding` 컬럼 추가만 남겼다.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '270f588d04f8'
down_revision = '6b3391e55d5b'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_study_session', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_onboarding', sa.Boolean(), server_default='0', nullable=False))


def downgrade():
    with op.batch_alter_table('user_study_session', schema=None) as batch_op:
        batch_op.drop_column('is_onboarding')
