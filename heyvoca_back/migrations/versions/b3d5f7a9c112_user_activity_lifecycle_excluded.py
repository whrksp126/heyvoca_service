"""사용자 일별 접속·생애 이벤트·통계 제외 이메일 (어드민 유저 관리 대시보드)

이슈 #25 12차 — 어드민 '유저 관리' 마케팅 대시보드용.
  user_daily_activity  : 인증 요청 기준 하루 1행(KST 날짜, 플랫폼·앱 버전)
  user_lifecycle_event : 탈퇴(withdraw)·FCM 토큰 무효(fcm_unregistered) 기록 — user 행이 지워져도 남는다
  admin_excluded_email : 집계에서 뺄 관리자·테스트 계정 이메일

Revision ID: b3d5f7a9c112
Revises: a7c1e4b9d203
Create Date: 2026-11-10 18:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = 'b3d5f7a9c112'
down_revision = 'a7c1e4b9d203'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_daily_activity',
        sa.Column('user_id', sa.BINARY(16), nullable=False, comment='user.id 참조 (FK 없음)'),
        sa.Column('activity_date', sa.Date(), nullable=False, comment='KST 날짜'),
        sa.Column('platform', sa.String(16), nullable=True, comment='ios|android|web'),
        sa.Column('app_version', sa.String(32), nullable=True),
        sa.Column('first_at', sa.DateTime(), nullable=False),
        sa.Column('last_at', sa.DateTime(), nullable=False),
        sa.Column('req_cnt', sa.Integer(), nullable=False, server_default='1'),
        sa.PrimaryKeyConstraint('user_id', 'activity_date'),
    )
    op.create_index('ix_uda_date', 'user_daily_activity', ['activity_date'])

    op.create_table(
        'user_lifecycle_event',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BINARY(16), nullable=False, comment='user.id 참조 (FK 없음)'),
        sa.Column('event', sa.String(32), nullable=False, comment='withdraw|fcm_unregistered'),
        sa.Column('email', sa.String(128), nullable=True, comment='탈퇴자 관리자 제외 판정용'),
        sa.Column('user_created_at', sa.DateTime(), nullable=True, comment='가입 시각(탈퇴 시점 스냅샷)'),
        sa.Column('platform', sa.String(16), nullable=True),
        sa.Column('meta', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ule_event_created', 'user_lifecycle_event', ['event', 'created_at'])
    op.create_index('ix_ule_user', 'user_lifecycle_event', ['user_id'])

    op.create_table(
        'admin_excluded_email',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(128), nullable=False),
        sa.Column('memo', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', name='uq_admin_excluded_email'),
    )


def downgrade():
    op.drop_table('admin_excluded_email')
    op.drop_index('ix_ule_user', table_name='user_lifecycle_event')
    op.drop_index('ix_ule_event_created', table_name='user_lifecycle_event')
    op.drop_table('user_lifecycle_event')
    op.drop_index('ix_uda_date', table_name='user_daily_activity')
    op.drop_table('user_daily_activity')
