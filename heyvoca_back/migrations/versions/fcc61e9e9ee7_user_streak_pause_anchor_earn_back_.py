"""user_streak: pause anchor, earn back, pending notice

연속 학습 보호권 개편(2026-09). 멈춤(paused) 기준일, 다시 잇기 도전(Earn Back) 상태,
1회 표시 정산 안내(notice)를 user_streak 에 추가한다. 전부 NULL 허용 — 기존 행은
"멈춤 아님 / 도전 없음 / 안내 없음"으로 시작한다. 이미 옛 48시간 복구 창(recovery_deadline)이
열린 행은 코드(`streak_v2._upgrade_legacy_window`)가 첫 정산 때 새 멈춤 형태로 옮긴다.

autogenerate 가 함께 잡은 무관한 drift(user_study_log 코멘트, user_voca_book_map 인덱스/FK 등)는
이번 변경과 무관해 제거했다.

Revision ID: fcc61e9e9ee7
Revises: 9fdc12f3733a
Create Date: 2026-09-25 05:56:08.209079

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'fcc61e9e9ee7'
down_revision = '9fdc12f3733a'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_streak', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pause_anchor_day', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('earn_back_status', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('earn_back_from_streak', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('earn_back_offered_on', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('earn_back_start_day', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('earn_back_last_start_day', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('pending_notice', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_streak', schema=None) as batch_op:
        batch_op.drop_column('pending_notice')
        batch_op.drop_column('earn_back_last_start_day')
        batch_op.drop_column('earn_back_start_day')
        batch_op.drop_column('earn_back_offered_on')
        batch_op.drop_column('earn_back_from_streak')
        batch_op.drop_column('earn_back_status')
        batch_op.drop_column('pause_anchor_day')
