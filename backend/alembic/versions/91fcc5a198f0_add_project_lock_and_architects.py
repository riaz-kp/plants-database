"""add_project_lock_and_architects

Revision ID: 91fcc5a198f0
Revises: 8d5f907b2aa3
Create Date: 2026-10-22 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '91fcc5a198f0'
down_revision: Union[str, None] = '8d5f907b2aa3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('landscape_architect', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('architect', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('is_locked', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column('projects', 'is_locked')
    op.drop_column('projects', 'architect')
    op.drop_column('projects', 'landscape_architect')
