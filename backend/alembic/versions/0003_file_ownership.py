"""files can belong to a user directly (avatars)

Revision ID: 0003_file_ownership
Revises: 0002_profiles_content
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0003_file_ownership"
down_revision: str | None = "0002_profiles_content"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("files", "project_id", nullable=True)
    op.add_column(
        "files", sa.Column("owner_id", UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_files_owner_id",
        "files",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_files_owner_id", "files", ["owner_id"])
    op.create_check_constraint(
        "ck_files_project_or_owner",
        "files",
        "project_id IS NOT NULL OR owner_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_files_project_or_owner", "files", type_="check")
    op.drop_index("ix_files_owner_id", table_name="files")
    op.drop_constraint("fk_files_owner_id", "files", type_="foreignkey")
    op.drop_column("files", "owner_id")
    op.execute("DELETE FROM files WHERE project_id IS NULL")
    op.alter_column("files", "project_id", nullable=False)
