"""add_added_at_to_project_plants

Revision ID: c7a2e4f19b3d
Revises: b4f98d0a28a6
Create Date: 2026-11-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7a2e4f19b3d'
down_revision: Union[str, None] = 'b4f98d0a28a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Plants already in a project get the migration time (no earlier record exists)
    op.add_column(
        'projectplants',
        sa.Column('added_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('projectplants', 'added_at')
