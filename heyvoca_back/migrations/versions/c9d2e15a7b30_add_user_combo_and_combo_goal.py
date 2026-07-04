"""add user_combo table and 콤보왕 goal seed

전역 콤보(AI 추천 테스트 연속 정답) 상태 테이블 + 콤보왕 업적 10레벨 시드.

Revision ID: c9d2e15a7b30
Revises: b41f7c88d2a1
Create Date: 2026-07-05 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c9d2e15a7b30'
down_revision = 'b41f7c88d2a1'
branch_labels = None
depends_on = None

# (goal, reward_count) — 기존 업적 스케일(출석왕 등)과 유사한 진행 곡선
_COMBO_LEVELS = [
    (5, 2), (10, 3), (20, 4), (30, 5), (50, 6),
    (70, 7), (100, 8), (150, 10), (200, 12), (300, 15),
]


def upgrade():
    op.create_table(
        'user_combo',
        sa.Column('user_id', sa.BINARY(16), nullable=False),
        sa.Column('current_combo', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('best_combo', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=8), nullable=False, server_default='ACTIVE'),
        sa.Column('at_risk_combo', sa.Integer(), nullable=True),
        sa.Column('at_risk_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('user_id'),
    )

    # 콤보왕 업적 시드 (idempotent — 이미 있으면 스킵)
    conn = op.get_bind()
    exists = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '콤보왕' LIMIT 1")
    ).fetchone()
    if not exists:
        conn.execute(sa.text(
            "INSERT INTO goal_type (type, description, created_at) "
            "VALUES ('콤보왕', '연속 정답 콤보', NOW())"
        ))
    type_id = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '콤보왕' LIMIT 1")
    ).fetchone()[0]

    has_goals = conn.execute(
        sa.text("SELECT id FROM goals WHERE type_id = :tid LIMIT 1"), {'tid': type_id}
    ).fetchone()
    if not has_goals:
        for level, (goal, reward) in enumerate(_COMBO_LEVELS, start=1):
            conn.execute(sa.text(
                "INSERT INTO goals (type_id, level, goal, reward_count, goal_text, "
                "description, badge_img, created_at) "
                "VALUES (:tid, :level, :goal, :reward, :text, NULL, :badge, NOW())"
            ), {
                'tid': type_id,
                'level': level,
                'goal': goal,
                'reward': reward,
                'text': f'연속 정답 {goal}회 달성',
                'badge': f'콤보왕{level:02d}.png',
            })


def downgrade():
    conn = op.get_bind()
    row = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '콤보왕' LIMIT 1")
    ).fetchone()
    if row:
        type_id = row[0]
        conn.execute(sa.text(
            "DELETE ug FROM user_goals ug JOIN goals g ON ug.goal_id = g.id "
            "WHERE g.type_id = :tid"), {'tid': type_id})
        conn.execute(sa.text("DELETE FROM goals WHERE type_id = :tid"), {'tid': type_id})
        conn.execute(sa.text("DELETE FROM goal_type WHERE id = :tid"), {'tid': type_id})
    op.drop_table('user_combo')
