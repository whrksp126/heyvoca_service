"""user: learning_lang, book/voca/log dict_lang

+ user.multi_lang_enabled (실험실 multi_lang 플래그)

일본어 학습 연동(INTEGRATION_SPEC 2절). 전부 NOT NULL + server_default 'en' 이라
기존 행은 'en' 으로 백필된다.

autogenerate 가 함께 잡은 무관한 기존 drift(user_voca_book_map FK/인덱스, 레거시 인덱스
제거 등)는 이 변경과 관계없어 의도적으로 뺐다.

Revision ID: 9fdc12f3733a
Revises: 7913016c5fcf
Create Date: 2026-09-25 03:41:11.898618

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '9fdc12f3733a'
down_revision = '7913016c5fcf'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('learning_lang', sa.String(length=8), server_default='en', nullable=False))
        # 실험실 '다른 언어 학습하기(베타)' 토글 — 기존 chat_study_enabled 와 같은 방식
        batch_op.add_column(sa.Column('multi_lang_enabled', sa.Boolean(), server_default='0', nullable=False))

    with op.batch_alter_table('user_voca_book', schema=None) as batch_op:
        batch_op.add_column(sa.Column('language', sa.String(length=8), server_default='en', nullable=False))
        batch_op.create_index('ix_user_voca_book_language', ['language'], unique=False)

    with op.batch_alter_table('user_voca', schema=None) as batch_op:
        batch_op.add_column(sa.Column('dict_lang', sa.String(length=8), server_default='en', nullable=False))
        batch_op.create_index('ix_user_voca_user_dict_lang', ['user_id', 'dict_lang'], unique=False)

    # 파티션 테이블(RANGE YEAR(created_at)) — 비고유 인덱스·컬럼 추가는 제약 없음
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.add_column(sa.Column('dict_lang', sa.String(length=8), server_default='en', nullable=False,
                                      comment='voca_id 사전 언어 en|ja (통계 필터)'))
        batch_op.create_index('ix_usl_user_dict_lang', ['user_id', 'dict_lang'], unique=False)


def downgrade():
    with op.batch_alter_table('user_study_log', schema=None) as batch_op:
        batch_op.drop_index('ix_usl_user_dict_lang')
        batch_op.drop_column('dict_lang')

    with op.batch_alter_table('user_voca', schema=None) as batch_op:
        batch_op.drop_index('ix_user_voca_user_dict_lang')
        batch_op.drop_column('dict_lang')

    with op.batch_alter_table('user_voca_book', schema=None) as batch_op:
        batch_op.drop_index('ix_user_voca_book_language')
        batch_op.drop_column('language')

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('multi_lang_enabled')
        batch_op.drop_column('learning_lang')
