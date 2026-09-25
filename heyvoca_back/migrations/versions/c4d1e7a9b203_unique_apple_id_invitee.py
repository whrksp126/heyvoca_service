"""unique user.apple_id, invite_map.invitee_id

동시성 전수 점검(2026-09) — 체크-후-삽입 경로의 DB 최종 방어선.
  - user.apple_id: Apple 로그인은 apple_id 로 계정을 찾는다. 같은 sub 의 계정이 둘이면 로그인 대상이
    비결정적이 된다(NULL 은 여러 개 허용).
  - invite_map.invitee_id: 한 사람은 한 번만 초대받는다(User.invited_by 1개). 코드는 User 잠금 안에서
    invited_by 로 막지만, 관계 행 자체에도 같은 규칙을 건다.

배포 전 확인: scripts/check_unique_candidates.py 의 2절 두 줄이 [OK] 여야 한다(중복이 있으면 upgrade 실패).

Revision ID: c4d1e7a9b203
Revises: 8ea52cdd0bd7
Create Date: 2026-09-26 16:00:00

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'c4d1e7a9b203'
down_revision = '8ea52cdd0bd7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_user_apple_id', ['apple_id'])
    with op.batch_alter_table('invite_map', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_invite_map_invitee', ['invitee_id'])


def downgrade():
    with op.batch_alter_table('invite_map', schema=None) as batch_op:
        batch_op.drop_constraint('uq_invite_map_invitee', type_='unique')
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_constraint('uq_user_apple_id', type_='unique')
