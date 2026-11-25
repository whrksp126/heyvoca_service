"""farm lab: layout, inventory, crop_type, farm_home_enabled

Revision ID: 256a44fed834
Revises: e5b2c8d4a1f6
Create Date: 2026-11-25 22:24:47.939981

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '256a44fed834'
down_revision = 'e5b2c8d4a1f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('user_farm_inventory',
    sa.Column('user_id', mysql.BINARY(length=16), nullable=False),
    sa.Column('item_id', sa.String(length=40), nullable=False),
    sa.Column('qty', sa.Integer(), server_default='0', nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('user_id', 'item_id')
    )
    op.create_table('user_farm_layout',
    sa.Column('user_id', mysql.BINARY(length=16), nullable=False),
    sa.Column('layout', sa.JSON(), nullable=False),
    sa.Column('version', sa.Integer(), server_default='0', nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('user_id')
    )
    with op.batch_alter_table('user_voca_book', schema=None) as batch_op:
        batch_op.add_column(sa.Column('crop_type', sa.String(length=20), nullable=True))
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('farm_home_enabled', sa.Boolean(), server_default='0', nullable=False))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('farm_home_enabled')
    with op.batch_alter_table('user_voca_book', schema=None) as batch_op:
        batch_op.drop_column('crop_type')
    op.drop_table('user_farm_layout')
    op.drop_table('user_farm_inventory')
