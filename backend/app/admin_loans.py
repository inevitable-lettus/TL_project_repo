"""Staff view of the borrowing log: list, mark returned, CSV export.

Loans are never edited or deleted, so there are no such routes here."""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from .auth import require_staff
from .config import settings
from .db import get_db
from .loans import (
    LoanOut,
    LoanType,
    ProjectRef,
    ReturnNote,
    Status,
    lab_today,
    load_loan,
    loan_status,
    mark_returned,
)
from .models import Loan, User

router = APIRouter(prefix="/admin/loans", tags=["admin-loans"])

FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


class PersonRef(BaseModel):
    id: uuid.UUID
    name: str
    email: str


class PhotoRef(BaseModel):
    file_id: uuid.UUID
    stage: str
    position: int


class AdminLoanOut(BaseModel):
    id: uuid.UUID
    type: LoanType
    item_name: str
    description: str
    quantity: int
    unit: str
    borrower: PersonRef
    project: ProjectRef | None
    due_date: date | None
    borrowed_at: datetime
    returned_at: datetime | None
    returned_by: PersonRef | None
    return_note: str | None
    status: Status
    photos: list[PhotoRef]


class AdminLoanPage(BaseModel):
    items: list[AdminLoanOut]
    total: int


class AdminReturnIn(BaseModel):
    photo_file_id: uuid.UUID | None = None
    note: ReturnNote = ""


@dataclass
class LoanFilters:
    status: Status | None = None
    type: LoanType | None = None
    q: str = ""
    date_from: date | None = None
    date_to: date | None = None


def loan_filters(
    status: Status | None = None,
    type: LoanType | None = None,
    q: str = Query(default="", max_length=200),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
) -> LoanFilters:
    return LoanFilters(status, type, q.strip(), date_from, date_to)


def lab_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=ZoneInfo(settings.lab_timezone))


def apply_filters(query: Select, filters: LoanFilters) -> Select:
    today = lab_today()
    open_equipment = (Loan.type == "equipment") & Loan.returned_at.is_(None)
    by_status = {
        "used": Loan.type == "material",
        "returned": (Loan.type == "equipment") & Loan.returned_at.is_not(None),
        "out": open_equipment & (Loan.due_date >= today),
        "overdue": open_equipment & (Loan.due_date < today),
    }
    if filters.status:
        query = query.where(by_status[filters.status])
    if filters.type:
        query = query.where(Loan.type == filters.type)
    if filters.q:
        query = query.join(User, Loan.borrower_id == User.id).where(
            or_(
                Loan.item_name.icontains(filters.q, autoescape=True),
                User.name.icontains(filters.q, autoescape=True),
                User.email.icontains(filters.q, autoescape=True),
            )
        )
    if filters.date_from:
        query = query.where(Loan.borrowed_at >= lab_day_start(filters.date_from))
    if filters.date_to:
        end = lab_day_start(filters.date_to + timedelta(days=1))
        query = query.where(Loan.borrowed_at < end)
    return query


def filtered_loans(filters: LoanFilters) -> Select:
    query = select(Loan).options(
        selectinload(Loan.photos),
        selectinload(Loan.project),
        selectinload(Loan.borrower),
        selectinload(Loan.returned_by),
    )
    # id breaks ties so pages never repeat or skip rows.
    return apply_filters(query, filters).order_by(
        Loan.borrowed_at.desc(), Loan.id.desc()
    )


def person_ref(user: User | None) -> PersonRef | None:
    return PersonRef(id=user.id, name=user.name, email=user.email) if user else None


def to_admin_loan(loan: Loan, today: date) -> AdminLoanOut:
    return AdminLoanOut(
        id=loan.id,
        type=loan.type,
        item_name=loan.item_name,
        description=loan.description,
        quantity=loan.quantity,
        unit=loan.unit,
        borrower=person_ref(loan.borrower),
        project=ProjectRef(id=loan.project.id, title=loan.project.title)
        if loan.project
        else None,
        due_date=loan.due_date,
        borrowed_at=loan.borrowed_at,
        returned_at=loan.returned_at,
        returned_by=person_ref(loan.returned_by),
        return_note=loan.return_note,
        status=loan_status(loan, today),
        photos=[
            PhotoRef(file_id=p.file_id, stage=p.stage, position=p.position)
            for p in loan.photos
        ],
    )


def csv_cell(value: object) -> object:
    """Stop Excel running a text cell as a formula."""
    if isinstance(value, str) and value.startswith(FORMULA_STARTS):
        return "'" + value
    return value


def lab_time(moment: datetime | None) -> str:
    if moment is None:
        return ""
    return moment.astimezone(ZoneInfo(settings.lab_timezone)).strftime("%Y-%m-%d %H:%M")


def photo_links(loan: Loan, stage: str) -> str:
    base = settings.public_url.rstrip("/")
    return " ".join(
        f"{base}/loans/photo/{photo.file_id}"
        for photo in loan.photos
        if photo.stage == stage
    )


CSV_HEADER = [
    "Borrowed at",
    "Borrower",
    "Borrower email",
    "Type",
    "Item",
    "Quantity",
    "Unit",
    "Project",
    "Description",
    "Due date",
    "Status",
    "Returned at",
    "Returned by",
    "Return note",
    "Borrow photos",
    "Return photo",
]


def csv_row(loan: Loan, today: date) -> list[object]:
    return [
        lab_time(loan.borrowed_at),
        loan.borrower.name,
        loan.borrower.email,
        loan.type,
        loan.item_name,
        loan.quantity,
        loan.unit,
        loan.project.title if loan.project else "",
        loan.description,
        loan.due_date.isoformat() if loan.due_date else "",
        loan_status(loan, today),
        lab_time(loan.returned_at),
        loan.returned_by.name if loan.returned_by else "",
        loan.return_note or "",
        photo_links(loan, "borrow"),
        photo_links(loan, "return"),
    ]


@router.get("", response_model=AdminLoanPage)
def list_loans(
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
    filters: LoanFilters = Depends(loan_filters),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AdminLoanPage:
    query = filtered_loans(filters)
    total = db.execute(
        select(func.count()).select_from(query.order_by(None).subquery())
    ).scalar_one()
    loans = db.scalars(query.limit(limit).offset(offset)).all()
    today = lab_today()
    return AdminLoanPage(
        items=[to_admin_loan(loan, today) for loan in loans], total=total
    )


@router.get("/export.csv")
def export_loans(
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
    filters: LoanFilters = Depends(loan_filters),
) -> Response:
    today = lab_today()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(CSV_HEADER)
    for loan in db.scalars(filtered_loans(filters)):
        writer.writerow([csv_cell(cell) for cell in csv_row(loan, today)])
    return Response(
        # The BOM makes Excel read the file as UTF-8.
        content="﻿" + out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="loans-{today}.csv"'},
    )


@router.post("/{loan_id}/return", response_model=LoanOut)
def staff_return_loan(
    loan_id: uuid.UUID,
    body: AdminReturnIn,
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
) -> LoanOut:
    loan = load_loan(db, loan_id, lock=True)
    if loan is None:
        raise HTTPException(status_code=404, detail="Loan not found")
    return mark_returned(db, loan, staff, body.photo_file_id, body.note)
