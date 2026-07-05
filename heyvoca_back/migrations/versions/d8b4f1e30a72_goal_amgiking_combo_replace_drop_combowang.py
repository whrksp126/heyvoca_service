"""goal: 암기왕 콤보 기준으로 교체, 콤보왕 GoalType 삭제

암기왕 정의 변경: 만점 세션 횟수 → 연속 정답 콤보 최고치.
Goals 임계값을 콤보왕과 동일한 스케일로 교체.
콤보왕 GoalType 및 관련 Goals, UserGoals 삭제.

주의: 기존 '암기왕' UserGoals(만점 기준 진행분)와
'콤보왕' UserGoals가 삭제된다.
프로덕션 27명의 해당 업적 진행 데이터가 초기화됨. (2026-07-06)

Revision ID: d8b4f1e30a72
Revises: a9f3c7e21b50
Create Date: 2026-07-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'd8b4f1e30a72'
down_revision = 'a9f3c7e21b50'
branch_labels = None
depends_on = None

# 신규 암기왕 Goals — 콤보왕과 동일 스케일 (콤보 최고치 기준)
_NEW_AMGIKING_LEVELS = [
    (1,   5, 2),
    (2,  10, 3),
    (3,  20, 4),
    (4,  30, 5),
    (5,  50, 6),
    (6,  70, 7),
    (7, 100, 8),
    (8, 150, 10),
    (9, 200, 12),
    (10, 300, 15),
]  # (level, goal, reward_count)

# 구 암기왕 Goals — downgrade 시 원복용 (UserGoals 복원 불가)
_OLD_AMGIKING_LEVELS = [
    (1,   1, 2, '암기왕01.png'),
    (2,   2, 2, '암기왕02.png'),
    (3,   3, 3, '암기왕03.png'),
    (4,   5, 4, '암기왕04.png'),
    (5,   7, 5, '암기왕05.png'),
    (6,  10, 6, '암기왕06.png'),
    (7,  20, 7, '암기왕07.png'),
    (8,  35, 8, '암기왕08.png'),
    (9,  60, 9, '암기왕09.png'),
    (10, 100, 10, '암기왕10.png'),
]  # (level, goal, reward_count, badge_img)

# 콤보왕 Goals — downgrade 시 재삽입용
_COMBO_LEVELS = [
    (5, 2), (10, 3), (20, 4), (30, 5), (50, 6),
    (70, 7), (100, 8), (150, 10), (200, 12), (300, 15),
]  # (goal, reward_count)


def upgrade():
    conn = op.get_bind()

    # ── 암기왕 처리 ─────────────────────────────────────────────
    amgi_row = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '암기왕' LIMIT 1")
    ).fetchone()
    if not amgi_row:
        # 암기왕 GoalType 자체가 없으면 스킵 (환경 불일치 방어)
        pass
    else:
        amgi_type_id = amgi_row[0]

        # 1. 기존 암기왕 UserGoals 삭제 (만점 기준 진행분 — 재생성 예정)
        #    프로덕션 27명의 암기왕 업적 진행 데이터가 초기화됨.
        conn.execute(sa.text(
            "DELETE ug FROM user_goals ug "
            "JOIN goals g ON ug.goal_id = g.id "
            "WHERE g.type_id = :tid"
        ), {'tid': amgi_type_id})

        # 2. 기존 암기왕 Goals 삭제 (만점 기준 임계값)
        conn.execute(sa.text(
            "DELETE FROM goals WHERE type_id = :tid"
        ), {'tid': amgi_type_id})

        # 3. 암기왕 Goals 재삽입 (콤보 기준 임계값, badge 파일명 유지)
        for level, goal, reward in _NEW_AMGIKING_LEVELS:
            conn.execute(sa.text(
                "INSERT INTO goals "
                "(type_id, level, goal, reward_count, goal_text, description, badge_img, created_at) "
                "VALUES (:tid, :level, :goal, :reward, :text, NULL, :badge, NOW())"
            ), {
                'tid':    amgi_type_id,
                'level':  level,
                'goal':   goal,
                'reward': reward,
                'text':   f'연속 정답 콤보 {goal}회 달성',
                'badge':  f'암기왕{level:02d}.png',
            })

    # ── 콤보왕 삭제 ─────────────────────────────────────────────
    combo_row = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '콤보왕' LIMIT 1")
    ).fetchone()
    if combo_row:
        combo_type_id = combo_row[0]

        # 4. 콤보왕 UserGoals 삭제
        conn.execute(sa.text(
            "DELETE ug FROM user_goals ug "
            "JOIN goals g ON ug.goal_id = g.id "
            "WHERE g.type_id = :tid"
        ), {'tid': combo_type_id})

        # 5. 콤보왕 Goals 삭제
        conn.execute(sa.text(
            "DELETE FROM goals WHERE type_id = :tid"
        ), {'tid': combo_type_id})

        # 6. 콤보왕 GoalType 삭제
        conn.execute(sa.text(
            "DELETE FROM goal_type WHERE id = :tid"
        ), {'tid': combo_type_id})


def downgrade():
    """downgrade: 구조만 원복. 삭제된 UserGoals는 복원 불가."""
    conn = op.get_bind()

    # ── 암기왕 원복 (만점 기준 임계값) ──────────────────────────
    amgi_row = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '암기왕' LIMIT 1")
    ).fetchone()
    if amgi_row:
        amgi_type_id = amgi_row[0]

        # 콤보 기준 Goals 삭제
        conn.execute(sa.text(
            "DELETE FROM goals WHERE type_id = :tid"
        ), {'tid': amgi_type_id})

        # 만점 기준 Goals 재삽입 (UserGoals 복원 불가)
        for level, goal, reward, badge in _OLD_AMGIKING_LEVELS:
            conn.execute(sa.text(
                "INSERT INTO goals "
                "(type_id, level, goal, reward_count, goal_text, description, badge_img, created_at) "
                "VALUES (:tid, :level, :goal, :reward, NULL, NULL, :badge, NOW())"
            ), {
                'tid':    amgi_type_id,
                'level':  level,
                'goal':   goal,
                'reward': reward,
                'badge':  badge,
            })

    # ── 콤보왕 재삽입 ────────────────────────────────────────────
    combo_exists = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '콤보왕' LIMIT 1")
    ).fetchone()
    if not combo_exists:
        conn.execute(sa.text(
            "INSERT INTO goal_type (type, description, created_at) "
            "VALUES ('콤보왕', '연속 정답 콤보', NOW())"
        ))

    combo_type_id = conn.execute(
        sa.text("SELECT id FROM goal_type WHERE type = '콤보왕' LIMIT 1")
    ).fetchone()[0]

    for level, (goal, reward) in enumerate(_COMBO_LEVELS, start=1):
        conn.execute(sa.text(
            "INSERT INTO goals "
            "(type_id, level, goal, reward_count, goal_text, description, badge_img, created_at) "
            "VALUES (:tid, :level, :goal, :reward, :text, NULL, :badge, NOW())"
        ), {
            'tid':    combo_type_id,
            'level':  level,
            'goal':   goal,
            'reward': reward,
            'text':   f'연속 정답 {goal}회 달성',
            'badge':  f'콤보왕{level:02d}.png',
        })
