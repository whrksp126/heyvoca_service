"""db: 온보딩 미션 완료 기록 테이블 + gem_log reason 확장

온보딩 행동 기반 미션(ai_test/make_book/buy_book/search_word/focus_study) 완료 기록용
user_onboarding_mission 테이블 신설. 완료 보상 gem_log에 기록할 사유
ONBOARDING_MISSION을 gem_log.reason ENUM에 추가(기존 값 순서 보존, 뒤에만 추가).

autogenerate가 함께 잡아낸 기존 스키마 drift(admin 테이블, 컬럼 comment 등)는
이번 변경과 무관하므로 이 마이그레이션에는 포함하지 않는다.

Revision ID: 28a510ca5076
Revises: 270f588d04f8
Create Date: 2026-07-16 04:09:46.468000
"""
from alembic import op
import sqlalchemy as sa


revision = '28a510ca5076'
down_revision = '270f588d04f8'
branch_labels = None
depends_on = None

_OLD = ("'IAP_PURCHASE','BOOK_PURCHASE','ACHIEVEMENT','ADMIN_ADJUST','REFUND','REFERRAL',"
        "'COMBO_PROTECT','ITEM_PURCHASE','FARM_REWARD'")
_NEW = _OLD + ",'ONBOARDING_MISSION'"


def upgrade():
    op.create_table(
        'user_onboarding_mission',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BINARY(length=16), nullable=False),
        sa.Column('mission_key', sa.String(length=32), nullable=False,
                  comment='ai_test|make_book|buy_book|search_word|focus_study'),
        sa.Column('completed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'mission_key', name='uq_user_onboarding_mission'),
    )
    with op.batch_alter_table('user_onboarding_mission', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_user_onboarding_mission_user_id'), ['user_id'], unique=False)

    op.execute(
        "ALTER TABLE gem_log "
        f"MODIFY COLUMN reason ENUM({_NEW}) NOT NULL"
    )


def downgrade():
    # 신규 사유(ONBOARDING_MISSION)로 기록된 행이 있으면 실패함 — 해당 행 정리 후 실행할 것
    op.execute(
        "ALTER TABLE gem_log "
        f"MODIFY COLUMN reason ENUM({_OLD}) NOT NULL"
    )

    with op.batch_alter_table('user_onboarding_mission', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_onboarding_mission_user_id'))

    op.drop_table('user_onboarding_mission')
