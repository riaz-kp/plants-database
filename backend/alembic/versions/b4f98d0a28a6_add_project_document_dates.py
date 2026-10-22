"""add_project_document_dates

Revision ID: b4f98d0a28a6
Revises: 91fcc5a198f0
Create Date: 2026-10-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4f98d0a28a6'
down_revision: Union[str, None] = '91fcc5a198f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('boq_date', sa.Date(), nullable=True))
    op.add_column('projects', sa.Column('quotation_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'quotation_date')
    op.drop_column('projects', 'boq_date')
