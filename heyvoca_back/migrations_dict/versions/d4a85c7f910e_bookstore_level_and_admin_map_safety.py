"""서점 레벨 잔재 정리 + 관리자 단어장 조인 안전장치

Revision ID: d4a85c7f910e
Revises: c9f04a1e2b7d
Create Date: 2026-08-22 06:40:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = 'd4a85c7f910e'
down_revision = 'c9f04a1e2b7d'
branch_labels = None
depends_on = None


def upgrade():
    # 기존 레벨 추천은 폐기. 컬럼은 새 기준 확정 전까지 nullable로 보류한다.
    with op.batch_alter_table('bookstore', schema=None) as batch_op:
        batch_op.alter_column(
            'level_id', existing_type=mysql.INTEGER(), nullable=True)
        batch_op.drop_column('level')
    op.execute('UPDATE bookstore SET level_id = NULL')

    # 대량 입력에서도 한 단어장에 같은 단어가 두 번 들어가지 않도록 DB가 보장한다.
    with op.batch_alter_table('admin_voca_book_map', schema=None) as batch_op:
        batch_op.drop_constraint('admin_voca_book_map_ibfk_1', type_='foreignkey')
        batch_op.drop_constraint('admin_voca_book_map_ibfk_2', type_='foreignkey')
        batch_op.create_unique_constraint(
            'uq_admin_voca_book_map_book_voca', ['book_id', 'voca_id'])
        batch_op.create_foreign_key(
            'fk_admin_voca_book_map_book', 'admin_voca_book',
            ['book_id'], ['id'], ondelete='CASCADE')
        batch_op.create_foreign_key(
            'fk_admin_voca_book_map_voca', 'voca',
            ['voca_id'], ['id'], ondelete='CASCADE')


def downgrade():
    with op.batch_alter_table('admin_voca_book_map', schema=None) as batch_op:
        batch_op.drop_constraint('fk_admin_voca_book_map_voca', type_='foreignkey')
        batch_op.drop_constraint('fk_admin_voca_book_map_book', type_='foreignkey')
        batch_op.drop_constraint('uq_admin_voca_book_map_book_voca', type_='unique')
        batch_op.create_foreign_key(
            'admin_voca_book_map_ibfk_2', 'voca', ['voca_id'], ['id'])
        batch_op.create_foreign_key(
            'admin_voca_book_map_ibfk_1', 'admin_voca_book', ['book_id'], ['id'])

    with op.batch_alter_table('bookstore', schema=None) as batch_op:
        batch_op.add_column(sa.Column('level', sa.String(length=50), nullable=True))
    op.execute('UPDATE bookstore SET level_id = 1 WHERE level_id IS NULL')
    with op.batch_alter_table('bookstore', schema=None) as batch_op:
        batch_op.alter_column(
            'level_id', existing_type=mysql.INTEGER(), nullable=False)
