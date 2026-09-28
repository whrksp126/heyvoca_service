"""user_voca tier_target tier_shown tier_correct 추가

Revision ID: 60b182320ce1
Revises: 7f213746b98b
Create Date: 2026-09-28 02:06:12.901674

2026-09 "출제형 문제 1단계" 2차 보완 — 단어별 자동 출제 난이도(tier) 진행 상태를
UserStudyLog(파티션 테이블, 기록용)가 아니라 UserVoca(정본)에 직접 저장한다.
FSRS 간격상 상급 단어는 복습 주기가 최근 로그 조회 윈도우(7일)보다 훨씬 길어져,
로그 윈도우 기반 근사치로는 매번 "처음 보는 단어"로 리셋돼 tier 오르내리기가
사실상 동작하지 않는 문제가 있었다. 정본을 UserVoca 컬럼으로 옮겨 해결한다
(app/services/recommend/composer.py::_compute_target_tier).

주의: 이 리비전 시점에도 이 작업과 무관한 기존 drift(admin 테이블, 컬럼 comment
동기화, FK/인덱스 재생성 등)가 autogenerate에 함께 잡혀 손으로 걷어냈다 —
7f213746b98b와 동일한 상황.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '60b182320ce1'
down_revision = '7f213746b98b'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_voca', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'tier_target', sa.Integer(), nullable=True,
            comment='이 단어의 마지막 "정해진 난이도"(1~5)',
        ))
        batch_op.add_column(sa.Column(
            'tier_shown', sa.Integer(), nullable=True,
            comment='마지막으로 실제 보여준 난이도(1~5)',
        ))
        batch_op.add_column(sa.Column(
            'tier_correct', sa.Boolean(), nullable=True,
            comment='마지막 tier 문제의 정답 여부',
        ))


def downgrade():
    with op.batch_alter_table('user_voca', schema=None) as batch_op:
        batch_op.drop_column('tier_correct')
        batch_op.drop_column('tier_shown')
        batch_op.drop_column('tier_target')
