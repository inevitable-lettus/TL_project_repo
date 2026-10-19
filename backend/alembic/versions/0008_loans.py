"""borrowing log v2: loans + loan_photos tables

Revision ID: 0008_loans
Revises: 0007_drop_lab_ops
Create Date: 2026-10-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0008_loans"
down_revision: str | None = "0007_drop_lab_ops"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UNITS = "'pcs', 'm', 'g', 'kg', 'sheets', 'ml', 'l'"


def upgrade() -> None:
    op.create_table(
        "loans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "borrower_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("item_name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "borrowed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "returned_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("return_note", sa.String(), nullable=True),
        sa.CheckConstraint("type IN ('equipment', 'material')", name="ck_loans_type"),
        sa.CheckConstraint(f"unit IN ({UNITS})", name="ck_loans_unit"),
        sa.CheckConstraint(
            "char_length(item_name) BETWEEN 1 AND 120", name="ck_loans_item_name"
        ),
        sa.CheckConstraint(
            "char_length(description) BETWEEN 1 AND 500", name="ck_loans_description"
        ),
        sa.CheckConstraint("quantity BETWEEN 1 AND 99999", name="ck_loans_quantity"),
        sa.CheckConstraint(
            "(type = 'equipment' AND due_date IS NOT NULL)"
            " OR (type = 'material' AND due_date IS NULL)",
            name="ck_loans_due_date_by_type",
        ),
        sa.CheckConstraint(
            "type = 'equipment' OR returned_at IS NULL",
            name="ck_loans_material_never_returned",
        ),
        sa.CheckConstraint(
            "return_note IS NULL OR char_length(return_note) <= 500",
            name="ck_loans_return_note",
        ),
    )
    op.create_index(
        "ix_loans_borrower_borrowed_at",
        "loans",
        ["borrower_id", sa.text("borrowed_at DESC")],
    )
    op.create_index("ix_loans_borrowed_at", "loans", ["borrowed_at"])
    op.create_index(
        "ix_loans_open_equipment_due",
        "loans",
        ["due_date"],
        postgresql_where=sa.text("type = 'equipment' AND returned_at IS NULL"),
    )
    op.create_table(
        "loan_photos",
        sa.Column(
            "file_id",
            UUID(as_uuid=True),
            sa.ForeignKey("files.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "loan_id",
            UUID(as_uuid=True),
            sa.ForeignKey("loans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.CheckConstraint(
            "stage IN ('borrow', 'return')", name="ck_loan_photos_stage"
        ),
    )


def downgrade() -> None:
    op.drop_table("loan_photos")
    op.drop_index("ix_loans_open_equipment_due", table_name="loans")
    op.drop_index("ix_loans_borrowed_at", table_name="loans")
    op.drop_index("ix_loans_borrower_borrowed_at", table_name="loans")
    op.drop_table("loans")
