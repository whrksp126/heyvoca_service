"""partition user_study_log by created_at year

Revision ID: c3e8a10b4d22
Revises: 97950841f98d
Create Date: 2026-05-07 12:00:00.000000

변경 내용:
  1. user_study_log FK 3개 제거 (파티션 테이블에 FK 불가)
  2. PK를 (id, created_at) 복합키로 변경 (파티션 키 컬럼이 모든 UNIQUE/PK에 포함돼야 함)
  3. PARTITION BY RANGE (YEAR(created_at)) 적용 — p2026~p2030, p_future

모델:
  UserStudyLog.user_id, user_voca_id, user_voca_book_id 컬럼에서 ForeignKey 제거.
  __table_args__ 에 PrimaryKeyConstraint('id', 'created_at') 추가.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3e8a10b4d22'
down_revision = '97950841f98d'
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. FK 제거 ──────────────────────────────────────────────────────────
    # 실제 FK 이름은 information_schema에서 확인됨:
    #   user_study_log_ibfk_1 → user_id
    #   user_study_log_ibfk_2 → user_voca_book_id
    #   user_study_log_ibfk_3 → user_voca_id
    # MySQL 파티션 테이블에는 FK가 허용되지 않으므로 반드시 제거.
    for fk_name in ('user_study_log_ibfk_1', 'user_study_log_ibfk_2', 'user_study_log_ibfk_3'):
        try:
            op.drop_constraint(fk_name, 'user_study_log', type_='foreignkey')
        except Exception:
            # FK가 이미 없거나 이름이 다른 환경(dev/stg/prod) 대응
            pass

    # ── 2. PK → (id, created_at) 복합키 ────────────────────────────────────
    # MySQL PARTITION BY RANGE: 파티션 컬럼이 모든 UNIQUE/PK에 포함돼야 함.
    # AUTO_INCREMENT는 PK의 첫 번째 컬럼이 아니어도 유지 가능.
    op.execute(
        'ALTER TABLE user_study_log '
        'DROP PRIMARY KEY, '
        'ADD PRIMARY KEY (id, created_at)'
    )

    # ── 3. 파티셔닝 적용 ─────────────────────────────────────────────────────
    # p2026: YEAR(created_at) < 2027  (서비스 시작 연도 포함)
    # p_future: MAXVALUE (2031 이후 자동 수용)
    op.execute('''
        ALTER TABLE user_study_log
        PARTITION BY RANGE (YEAR(created_at)) (
            PARTITION p2026 VALUES LESS THAN (2027),
            PARTITION p2027 VALUES LESS THAN (2028),
            PARTITION p2028 VALUES LESS THAN (2029),
            PARTITION p2029 VALUES LESS THAN (2030),
            PARTITION p2030 VALUES LESS THAN (2031),
            PARTITION p_future VALUES LESS THAN MAXVALUE
        )
    ''')


def downgrade():
    # ── 파티셔닝 제거 ────────────────────────────────────────────────────────
    op.execute('ALTER TABLE user_study_log REMOVE PARTITIONING')

    # ── PK 원복 (id 단일키) ──────────────────────────────────────────────────
    op.execute(
        'ALTER TABLE user_study_log '
        'DROP PRIMARY KEY, '
        'ADD PRIMARY KEY (id)'
    )

    # ── FK 복구 ──────────────────────────────────────────────────────────────
    # downgrade 시 FK를 복구한다.
    # MySQL 환경에 따라 이미 존재할 수 있으므로 예외 무시.
    try:
        op.create_foreign_key(
            'user_study_log_ibfk_1', 'user_study_log',
            'user', ['user_id'], ['id'],
        )
    except Exception:
        pass
    try:
        op.create_foreign_key(
            'user_study_log_ibfk_2', 'user_study_log',
            'user_voca_book', ['user_voca_book_id'], ['id'],
        )
    except Exception:
        pass
    try:
        op.create_foreign_key(
            'user_study_log_ibfk_3', 'user_study_log',
            'user_voca', ['user_voca_id'], ['id'],
        )
    except Exception:
        pass
