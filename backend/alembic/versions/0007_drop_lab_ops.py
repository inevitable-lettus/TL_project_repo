"""drop lab-ops tables (machines/bookings/tools/issues moved out of scope)

Revision ID: 0007_drop_lab_ops
Revises: 0006_checkouts_issues
Create Date: 2026-08-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0007_drop_lab_ops"
down_revision: str | None = "0006_checkouts_issues"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_issues_status", table_name="issues")
    op.drop_table("issues")
    op.drop_index("ix_checkouts_status_due", table_name="checkouts")
    op.drop_table("checkouts")
    op.drop_index("ix_bookings_machine_date", table_name="bookings")
    op.drop_table("bookings")


def downgrade() -> None:
    """Recreate the tables exactly as 0005/0006 built them. Rows are not
    restored — this only makes the schema change reversible."""
    op.create_table(
        "bookings",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("machine_slug", sa.String, nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("purpose", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_bookings_machine_date", "bookings", ["machine_slug", "date"])

    op.create_table(
        "checkouts",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("category", sa.String, nullable=False),
        sa.Column("tool_name", sa.String, nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="out"),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_checkouts_status_due", "checkouts", ["status", "due_date"])

    op.create_table(
        "issues",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "reporter_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("machine_slug", sa.String, nullable=True),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("severity", sa.String, nullable=False),
        sa.Column("description", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="open"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_issues_status", "issues", ["status"])
