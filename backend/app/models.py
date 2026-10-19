import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


def created_at_col() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, server_default="student")
    bio: Mapped[str | None] = mapped_column(String)
    program: Mapped[str | None] = mapped_column(String)
    enrollment_year: Mapped[int | None] = mapped_column(Integer)
    # use_alter breaks the users -> files -> projects -> users FK cycle.
    avatar_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "files.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_users_avatar_file_id",
        )
    )
    created_at: Mapped[datetime] = created_at_col()

    projects: Mapped[list["Project"]] = relationship(back_populates="owner")


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index(
            "ix_projects_featured_rank",
            "featured_rank",
            postgresql_where=text("featured_rank IS NOT NULL"),
        ),
        Index(
            "ix_projects_slider_pinned",
            "slider_pinned",
            postgresql_where=text("slider_pinned"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), index=True
    )
    # TipTap document; media nodes reference File ids, never URLs.
    content: Mapped[dict | None] = mapped_column(JSONB)
    cover_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "files.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_projects_cover_file_id",
        )
    )
    # Small browser-generated copy of the cover for cards/slider; falls back
    # to cover_file_id when NULL.
    cover_thumb_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "files.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_projects_cover_thumb_file_id",
        )
    )
    featured_rank: Mapped[int | None] = mapped_column(Integer)
    slider_pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = created_at_col()

    owner: Mapped[User] = relationship(back_populates="projects")
    files: Mapped[list["File"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        foreign_keys="File.project_id",
    )


class File(Base):
    __tablename__ = "files"
    __table_args__ = (
        Index("ix_files_status_created_at", "status", "created_at"),
        CheckConstraint(
            "project_id IS NOT NULL OR owner_id IS NOT NULL",
            name="ck_files_project_or_owner",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # Either project-scoped (blog media / attachments) or user-scoped (avatar).
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", name="fk_files_owner_id"),
        index=True,
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    object_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="pending"
    )
    # 'media' renders inside the blog content; 'attachment' lists in the
    # project's downloads area.
    kind: Mapped[str] = mapped_column(
        String, nullable=False, server_default="attachment"
    )
    created_at: Mapped[datetime] = created_at_col()

    project: Mapped[Project | None] = relationship(
        back_populates="files", foreign_keys=[project_id]
    )


# Units a loan quantity can be counted in. Not a limit, so no env var.
LOAN_UNITS = ("pcs", "m", "g", "kg", "sheets", "ml", "l")
_UNIT_LIST = ", ".join(f"'{unit}'" for unit in LOAN_UNITS)


class Loan(Base):
    """One borrowing-log entry. Never edited or deleted after submit; status is
    derived from the dates (loans.loan_status), never stored."""

    __tablename__ = "loans"
    __table_args__ = (
        CheckConstraint("type IN ('equipment', 'material')", name="ck_loans_type"),
        CheckConstraint(f"unit IN ({_UNIT_LIST})", name="ck_loans_unit"),
        CheckConstraint(
            "char_length(item_name) BETWEEN 1 AND 120", name="ck_loans_item_name"
        ),
        CheckConstraint(
            "char_length(description) BETWEEN 1 AND 500", name="ck_loans_description"
        ),
        CheckConstraint("quantity BETWEEN 1 AND 99999", name="ck_loans_quantity"),
        CheckConstraint(
            "(type = 'equipment' AND due_date IS NOT NULL)"
            " OR (type = 'material' AND due_date IS NULL)",
            name="ck_loans_due_date_by_type",
        ),
        CheckConstraint(
            "type = 'equipment' OR returned_at IS NULL",
            name="ck_loans_material_never_returned",
        ),
        CheckConstraint(
            "return_note IS NULL OR char_length(return_note) <= 500",
            name="ck_loans_return_note",
        ),
        Index("ix_loans_borrower_borrowed_at", "borrower_id", text("borrowed_at DESC")),
        Index("ix_loans_borrowed_at", "borrowed_at"),
        Index(
            "ix_loans_open_equipment_due",
            "due_date",
            postgresql_where=text("type = 'equipment' AND returned_at IS NULL"),
        ),
    )

    # Client-generated so a retried submit can't create a duplicate.
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    borrower_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    item_name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL")
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    borrowed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    return_note: Mapped[str | None] = mapped_column(String)

    project: Mapped[Project | None] = relationship()
    borrower: Mapped[User] = relationship(foreign_keys=[borrower_id])
    returned_by: Mapped[User | None] = relationship(foreign_keys=[returned_by_id])
    photos: Mapped[list["LoanPhoto"]] = relationship(order_by="LoanPhoto.position")


class LoanPhoto(Base):
    """Links a loan_photo File to its loan. A photo belongs to one loan."""

    __tablename__ = "loan_photos"
    __table_args__ = (
        CheckConstraint("stage IN ('borrow', 'return')", name="ck_loan_photos_stage"),
    )

    file_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"), primary_key=True
    )
    loan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("loans.id", ondelete="RESTRICT"), nullable=False
    )
    stage: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
