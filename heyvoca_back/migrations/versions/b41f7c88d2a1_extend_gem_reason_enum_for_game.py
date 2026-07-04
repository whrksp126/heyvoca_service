"""extend gem_log.reason enum for game features

콤보 보호(COMBO_PROTECT), 게임 아이템 구매(ITEM_PURCHASE),
당근 농장 보상(FARM_REWARD) 사유 추가.
기존 값 순서를 보존하고 뒤에만 추가한다 (ENUM 인덱스 안정).

Revision ID: b41f7c88d2a1
Revises: 56029e444493
Create Date: 2026-07-04 12:00:00.000000
"""
from alembic import op


revision = 'b41f7c88d2a1'
down_revision = '56029e444493'
branch_labels = None
depends_on = None

_OLD = "'IAP_PURCHASE','BOOK_PURCHASE','ACHIEVEMENT','ADMIN_ADJUST','REFUND','REFERRAL'"
_NEW = _OLD + ",'COMBO_PROTECT','ITEM_PURCHASE','FARM_REWARD'"


def upgrade():
    op.execute(
        "ALTER TABLE gem_log "
        f"MODIFY COLUMN reason ENUM({_NEW}) NOT NULL"
    )


def downgrade():
    # 신규 사유로 기록된 행이 있으면 실패함 — 해당 행 정리 후 실행할 것
    op.execute(
        "ALTER TABLE gem_log "
        f"MODIFY COLUMN reason ENUM({_OLD}) NOT NULL"
    )
