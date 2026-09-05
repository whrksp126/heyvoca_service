"""checkin: 출석 보상 지급 플래그(attend_rewarded) 추가

자동 생성본에는 인덱스·FK·컬럼 코멘트 드리프트가 잔뜩 딸려 나왔다(모델과 실제 DB가
오래 어긋난 자리들). 이 마이그레이션은 컬럼 추가만 한다 — 무관한 드리프트를 여기서
같이 고치면 실패 시 원인을 가릴 수 없다.

Revision ID: 7913016c5fcf
Revises: ea58e0dbd47f
Create Date: 2026-08-14 20:48:07.164124

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '7913016c5fcf'
down_revision = 'ea58e0dbd47f'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('check_in', sa.Column(
        'attend_rewarded', sa.Boolean(), server_default='0', nullable=False))


def downgrade():
    op.drop_column('check_in', 'attend_rewarded')
