"""purchase transaction_id platform unique

Revision ID: 8ea52cdd0bd7
Revises: fcc61e9e9ee7
Create Date: 2026-09-26 06:04:28.162833

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '8ea52cdd0bd7'
down_revision = 'fcc61e9e9ee7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('purchase', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_purchase_transaction_platform', ['transaction_id', 'platform'])


def downgrade():
    with op.batch_alter_table('purchase', schema=None) as batch_op:
        batch_op.drop_constraint('uq_purchase_transaction_platform', type_='unique')
