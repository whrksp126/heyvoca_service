"""user_study_log에 example_hash 추가

Revision ID: c319aa43d917
Revises: 8bb493d1d132
Create Date: 2026-09-30 03:55:00.334127

이 리비전은 손으로 정리했다 — autogenerate가 이 변경과 무관한 기존 drift(테이블
comment 재작성, admin 테이블 drop, user_voca_book_map FK 재생성 등)를 잔뜩 같이
잡아냈다. 그 drift는 이 작업(FRESH_SENTENCE_CONTRACT.md) 범위 밖이라 여기 담지
않는다 — user_study_log.example_hash 컬럼 + 조회용 인덱스만 추가한다.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c319aa43d917'
down_revision = '8bb493d1d132'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'example_hash', sa.String(length=64), nullable=True,
            comment='이 문제에 쓰인 예문의 sentence_hash(app/services/sentence_puzzle.py). '
                    '문장형 문제만 값이 있고, 없으면 NULL(구버전 앱/문장 없는 유형). '
                    '2026-09-30 "매번 새 문장" 계약 — 최근 본 문장 회피 판정에 사용.',
        ))
        batch_op.create_index(
            'ix_usl_user_voca_created', ['user_id', 'user_voca_id', 'created_at'], unique=False,
        )


def downgrade():
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.drop_index('ix_usl_user_voca_created')
        batch_op.drop_column('example_hash')
