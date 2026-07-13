"""projects get a client-generated cover thumbnail

Revision ID: 0004_cover_thumb
Revises: 0003_file_ownership
Create Date: 2026-07-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004_cover_thumb"
down_revision: str | None = "0003_file_ownership"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("cover_thumb_file_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_projects_cover_thumb_file_id",
        "projects",
        "files",
        ["cover_thumb_file_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_projects_cover_thumb_file_id", "projects", type_="foreignkey"
    )
    op.drop_column("projects", "cover_thumb_file_id")
