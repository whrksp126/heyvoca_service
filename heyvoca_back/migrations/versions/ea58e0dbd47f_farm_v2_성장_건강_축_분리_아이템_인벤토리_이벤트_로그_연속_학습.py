"""farm v2: 성장/건강 축 분리, 아이템 인벤토리, 이벤트 로그, 연속 학습

Revision ID: ea58e0dbd47f
Revises: d3f8ff453072
Create Date: 2026-08-02 17:13:51.940249

autogenerate 원본에서 이번 변경과 무관한 항목을 걷어냈다. 지운 것과 이유:

- `op.drop_table('admin')` — 어드민 계정 테이블이다. 모델에 선언이 없을 뿐 실제로 쓰인다.
- `user.email` / `user.google_id` 유니크 인덱스 DROP — 모델에 unique 선언이 빠져 있어
  드리프트로 잡힌 것이다. 지우면 중복 가입을 막던 마지막 방어선이 사라진다.
- `user_voca` / `user_voca_book` / `user_voca_book_map` 인덱스 DROP,
  `user_voca_book_map` · `gem_log` FK 재생성 — 재생성 과정에서 `ondelete=CASCADE` 가
  통째로 빠진다. 단어장을 지워도 매핑이 남는다.
- product / purchase / invite_map / user_study_log 의 컬럼 comment 변경 — 무해하지만
  이번 변경과 무관하다.

위 드리프트는 별도 마이그레이션에서 모델 선언을 실제 스키마에 맞추는 쪽으로 정리한다.
"""
from alembic import op
import sqlalchemy as sa

from app.models.models import BinaryUUID

# revision identifiers, used by Alembic.
revision = 'ea58e0dbd47f'
down_revision = 'd3f8ff453072'
branch_labels = None
depends_on = None


def upgrade():
    # ── 작물 상태 전이 로그 (기획 16.2) ──
    op.create_table(
        'farm_event_log',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('user_voca_id', sa.Integer(), nullable=True),
        sa.Column('event', sa.String(length=40), nullable=False),
        sa.Column('from_state', sa.String(length=16), nullable=True),
        sa.Column('to_state', sa.String(length=16), nullable=True),
        sa.Column('reason', sa.String(length=40), nullable=True),
        sa.Column('session_id', BinaryUUID(length=16), nullable=True),
        sa.Column('purchase_id', BinaryUUID(length=16), nullable=True),
        sa.Column('detail', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_fel_user'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fel_user_created', 'farm_event_log', ['user_id', 'created_at'])
    op.create_index('ix_fel_voca_created', 'farm_event_log', ['user_voca_id', 'created_at'])
    op.create_index('ix_fel_event_created', 'farm_event_log', ['event', 'created_at'])

    # ── 아이템 보유량 / 원장 ──
    op.create_table(
        'user_farm_item',
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('item_type', sa.String(length=12), nullable=False),
        sa.Column('qty', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_earned', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_spent', sa.Integer(), server_default='0', nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_ufi_user'),
        sa.PrimaryKeyConstraint('user_id', 'item_type'),
    )
    op.create_table(
        'user_farm_item_log',
        sa.Column('id', BinaryUUID(length=16), nullable=False),
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('item_type', sa.String(length=12), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('reason', sa.Enum('STAGE_REWARD', 'STREAK_REWARD', 'WEEKLY_GRANT',
                                    'GEM_PURCHASE', 'SPENT', 'MIGRATION', 'ADMIN_ADJUST',
                                    'EVENT', name='farmitemreason'), nullable=False),
        sa.Column('balance_after', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('user_voca_id', sa.Integer(), nullable=True),
        sa.Column('purchase_id', BinaryUUID(length=16), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_ufil_user'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ufil_user_created', 'user_farm_item_log', ['user_id', 'created_at'])

    # ── 사용자별 농장 기준값 (시간대 · 하루 권장 복습량) ──
    op.create_table(
        'user_farm_setting',
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('timezone', sa.String(length=40), server_default='Asia/Seoul', nullable=False),
        sa.Column('tz_changed_at', sa.DateTime(), nullable=True),
        sa.Column('daily_review_limit', sa.Integer(), server_default='60', nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_ufs_user'),
        sa.PrimaryKeyConstraint('user_id'),
    )

    # ── 연속 학습일 (기획 11) ──
    op.create_table(
        'user_streak',
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('current_streak', sa.Integer(), server_default='0', nullable=False),
        sa.Column('best_streak', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_qualified_day', sa.Date(), nullable=True),
        sa.Column('max_milestone_awarded', sa.Integer(), server_default='0', nullable=False),
        sa.Column('shield_granted_week', sa.Date(), nullable=True),
        sa.Column('protected_days_cnt', sa.Integer(), server_default='0', nullable=False),
        sa.Column('recovery_deadline', sa.DateTime(), nullable=True),
        sa.Column('recovery_from_streak', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_ustreak_user'),
        sa.PrimaryKeyConstraint('user_id'),
    )

    # ── 복귀 농장 회복 미션 (기획 7.4) ──
    op.create_table(
        'user_comeback_mission',
        sa.Column('id', BinaryUUID(length=16), nullable=False),
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('absent_days', sa.Integer(), nullable=False),
        sa.Column('rotten_snapshot', sa.Integer(), server_default='0', nullable=False),
        sa.Column('progress_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_progress_day', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=12), server_default='ACTIVE', nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('rewarded_at', sa.DateTime(), nullable=True),
        sa.Column('recovered_cnt', sa.Integer(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_ucm_user'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ucm_user_status', 'user_comeback_mission', ['user_id', 'status'])

    # ── V2 전환 1회성 기록 (기획 15) ──
    op.create_table(
        'user_farm_migration',
        sa.Column('user_id', BinaryUUID(length=16), nullable=False),
        sa.Column('migrated_at', sa.DateTime(), nullable=False),
        sa.Column('words_total', sa.Integer(), server_default='0', nullable=False),
        sa.Column('auto_recovered', sa.Integer(), server_default='0', nullable=False),
        sa.Column('shovel_granted', sa.Integer(), server_default='0', nullable=False),
        sa.Column('nutrient_granted', sa.Integer(), server_default='0', nullable=False),
        sa.Column('shield_granted', sa.Integer(), server_default='0', nullable=False),
        sa.Column('gem_granted', sa.Integer(), server_default='0', nullable=False),
        sa.Column('protect_until', sa.DateTime(), nullable=True),
        sa.Column('seen_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='fk_ufm_user'),
        sa.PrimaryKeyConstraint('user_id'),
    )

    # ── 연속 학습일 판정용 일자 컬럼 (기획 11.1) ──
    with op.batch_alter_table('check_in', schema=None) as batch_op:
        batch_op.add_column(sa.Column('correct_word_cnt', sa.Integer(),
                                      server_default='0', nullable=False))
        batch_op.add_column(sa.Column('streak_qualified', sa.Boolean(),
                                      server_default='0', nullable=False))
        batch_op.add_column(sa.Column('streak_protected', sa.Boolean(),
                                      server_default='0', nullable=False))

    # ── 성장 축 / 건강 축 분리 ──
    with op.batch_alter_table('user_voca_game', schema=None) as batch_op:
        batch_op.add_column(sa.Column('visual_stage', sa.String(length=16),
                                      server_default='UNPLANTED_SEED', nullable=False))
        batch_op.add_column(sa.Column('highest_stage', sa.String(length=16),
                                      server_default='UNPLANTED_SEED', nullable=False))
        batch_op.add_column(sa.Column('first_planted_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('planted_study_day', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('first_due_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('first_sprouted_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('sprout_rewarded', sa.Boolean(),
                                      server_default='0', nullable=False))
        batch_op.add_column(sa.Column('leaf_rewarded', sa.Boolean(),
                                      server_default='0', nullable=False))
        batch_op.add_column(sa.Column('health_state', sa.String(length=10),
                                      server_default='FRESH', nullable=False))
        batch_op.add_column(sa.Column('health_changed_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('last_health_seen_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('rot_due_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('protection_days', sa.Integer(),
                                      server_default='0', nullable=False))
        batch_op.add_column(sa.Column('rotten_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('recovery_count', sa.Integer(),
                                      server_default='0', nullable=False))
        batch_op.add_column(sa.Column('replant_count', sa.Integer(),
                                      server_default='0', nullable=False))
        batch_op.add_column(sa.Column('pending_action', sa.String(length=12), nullable=True))
        batch_op.add_column(sa.Column('pending_started_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('golden_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('golden_check_status', sa.String(length=12), nullable=True))
        batch_op.create_index('ix_uvg_user_stage', ['user_id', 'visual_stage'], unique=False)
        batch_op.create_index('ix_uvg_user_health', ['user_id', 'health_state'], unique=False)
        batch_op.create_index('ix_uvg_user_rotdue', ['user_id', 'rot_due_at'], unique=False)


def downgrade():
    with op.batch_alter_table('user_voca_game', schema=None) as batch_op:
        batch_op.drop_index('ix_uvg_user_rotdue')
        batch_op.drop_index('ix_uvg_user_health')
        batch_op.drop_index('ix_uvg_user_stage')
        for col in ('golden_check_status', 'golden_at', 'pending_started_at', 'pending_action',
                    'replant_count', 'recovery_count', 'rotten_at', 'protection_days',
                    'rot_due_at', 'last_health_seen_at', 'health_changed_at', 'health_state',
                    'leaf_rewarded', 'sprout_rewarded', 'first_sprouted_at', 'first_due_at',
                    'planted_study_day', 'first_planted_at', 'highest_stage', 'visual_stage'):
            batch_op.drop_column(col)

    with op.batch_alter_table('check_in', schema=None) as batch_op:
        batch_op.drop_column('streak_protected')
        batch_op.drop_column('streak_qualified')
        batch_op.drop_column('correct_word_cnt')

    op.drop_table('user_farm_migration')
    op.drop_index('ix_ucm_user_status', table_name='user_comeback_mission')
    op.drop_table('user_comeback_mission')
    op.drop_table('user_streak')
    op.drop_table('user_farm_setting')
    op.drop_index('ix_ufil_user_created', table_name='user_farm_item_log')
    op.drop_table('user_farm_item_log')
    op.drop_table('user_farm_item')
    op.drop_index('ix_fel_event_created', table_name='farm_event_log')
    op.drop_index('ix_fel_voca_created', table_name='farm_event_log')
    op.drop_index('ix_fel_user_created', table_name='farm_event_log')
    op.drop_table('farm_event_log')
