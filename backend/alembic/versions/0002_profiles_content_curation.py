"""profiles, blog content, curation flags, file kind

Revision ID: 0002_profiles_content
Revises: 0001_initial
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "0002_profiles_content"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bio", sa.String(), nullable=True))
    op.add_column("users", sa.Column("program", sa.String(), nullable=True))
    op.add_column(
        "users", sa.Column("enrollment_year", sa.Integer(), nullable=True)
    )
    op.add_column(
        "users", sa.Column("avatar_file_id", UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_users_avatar_file_id",
        "users",
        "files",
        ["avatar_file_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("projects", sa.Column("content", JSONB(), nullable=True))
    op.add_column(
        "projects", sa.Column("cover_file_id", UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_projects_cover_file_id",
        "projects",
        "files",
        ["cover_file_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "projects", sa.Column("featured_rank", sa.Integer(), nullable=True)
    )
    op.add_column(
        "projects",
        sa.Column(
            "slider_pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_projects_featured_rank",
        "projects",
        ["featured_rank"],
        postgresql_where=sa.text("featured_rank IS NOT NULL"),
    )
    op.create_index(
        "ix_projects_slider_pinned",
        "projects",
        ["slider_pinned"],
        postgresql_where=sa.text("slider_pinned"),
    )

    op.add_column(
        "files",
        sa.Column(
            "kind", sa.String(), nullable=False, server_default="attachment"
        ),
    )


def downgrade() -> None:
    op.drop_column("files", "kind")

    op.drop_index("ix_projects_slider_pinned", table_name="projects")
    op.drop_index("ix_projects_featured_rank", table_name="projects")
    op.drop_column("projects", "slider_pinned")
    op.drop_column("projects", "featured_rank")
    op.drop_constraint(
        "fk_projects_cover_file_id", "projects", type_="foreignkey"
    )
    op.drop_column("projects", "cover_file_id")
    op.drop_column("projects", "content")

    op.drop_constraint("fk_users_avatar_file_id", "users", type_="foreignkey")
    op.drop_column("users", "avatar_file_id")
    op.drop_column("users", "enrollment_year")
    op.drop_column("users", "program")
    op.drop_column("users", "bio")
