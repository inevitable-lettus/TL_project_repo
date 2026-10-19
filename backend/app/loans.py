"""Borrowing log, stored in Postgres (context-docs/borrowing-v2.md).

Entries are never edited or deleted after submit. Status is derived from the
dates by `loan_status`, never stored, so it can't drift."""

import uuid
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .auth import get_current_user
from .config import settings
from .db import get_db
from .models import LOAN_UNITS, File, Loan, LoanPhoto, Project, User

router = APIRouter(prefix="/loans", tags=["loans"])

LoanType = Literal["equipment", "material"]
Unit = Literal[LOAN_UNITS]
Status = Literal["used", "out", "overdue", "returned"]

ItemName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]
ReturnNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class LoanIn(BaseModel):
    # Unknown fields (e.g. borrower_id) are rejected: identity is the session.
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    type: LoanType
    item_name: ItemName
    description: Description
    quantity: int = Field(ge=1, le=99999)
    unit: Unit = "pcs"
    project_id: uuid.UUID | None = None
    due_date: date | None = None
    photo_file_ids: list[uuid.UUID]


class ReturnIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    photo_file_id: uuid.UUID
    note: ReturnNote = ""


class ProjectRef(BaseModel):
    id: uuid.UUID
    title: str


class LoanOut(BaseModel):
    id: uuid.UUID
    type: LoanType
    item_name: str
    description: str
    quantity: int
    unit: str
    project: ProjectRef | None
    due_date: date | None
    borrowed_at: datetime
    returned_at: datetime | None
    returned_by_id: uuid.UUID | None
    return_note: str | None
    status: Status
    borrow_photo_ids: list[uuid.UUID]
    return_photo_id: uuid.UUID | None


class RulesOut(BaseModel):
    max_days: int
    max_photos: int
    units: list[str]


def lab_today() -> date:
    return datetime.now(ZoneInfo(settings.lab_timezone)).date()


def loan_status(loan: Loan, today: date) -> Status:
    """The one place status is decided (endpoints and CSV alike)."""
    if loan.type == "material":
        return "used"
    if loan.returned_at is not None:
        return "returned"
    return "overdue" if loan.due_date < today else "out"


def to_loan_out(loan: Loan, today: date) -> LoanOut:
    photos = {"borrow": [], "return": []}
    for photo in loan.photos:
        photos[photo.stage].append(photo.file_id)
    return LoanOut(
        id=loan.id,
        type=loan.type,
        item_name=loan.item_name,
        description=loan.description,
        quantity=loan.quantity,
        unit=loan.unit,
        project=ProjectRef(id=loan.project.id, title=loan.project.title)
        if loan.project
        else None,
        due_date=loan.due_date,
        borrowed_at=loan.borrowed_at,
        returned_at=loan.returned_at,
        returned_by_id=loan.returned_by_id,
        return_note=loan.return_note,
        status=loan_status(loan, today),
        borrow_photo_ids=photos["borrow"],
        return_photo_id=photos["return"][0] if photos["return"] else None,
    )


def load_loan(db: Session, loan_id: uuid.UUID, *, lock: bool = False) -> Loan | None:
    query = (
        select(Loan)
        .where(Loan.id == loan_id)
        .options(selectinload(Loan.photos), selectinload(Loan.project))
    )
    if lock:
        query = query.with_for_update(of=Loan)
    return db.scalars(query).one_or_none()


def require_unlinked_loan_photo(db: Session, user: User, file_id: uuid.UUID) -> None:
    file = db.get(File, file_id)
    if (
        file is None
        or file.owner_id != user.id
        or file.kind != "loan_photo"
        or file.status != "ready"
    ):
        raise HTTPException(status_code=400, detail="photo not found")
    if db.get(LoanPhoto, file_id) is not None:
        raise HTTPException(status_code=400, detail="photo is already on a loan")


def check_photo_count(file_ids: list[uuid.UUID]) -> None:
    if not 1 <= len(file_ids) <= settings.loan_max_photos:
        raise HTTPException(
            status_code=400,
            detail=f"Add between 1 and {settings.loan_max_photos} photos.",
        )
    if len(set(file_ids)) != len(file_ids):
        raise HTTPException(status_code=400, detail="The same photo was added twice.")


def check_due_date(loan_type: str, due_date: date | None) -> None:
    if loan_type == "material":
        if due_date is not None:
            raise HTTPException(
                status_code=400, detail="Materials are used up: no return date."
            )
        return
    if due_date is None:
        raise HTTPException(status_code=400, detail="Equipment needs a return date.")
    today = lab_today()
    if due_date < today:
        raise HTTPException(status_code=400, detail="The return date is in the past.")
    if due_date > today + timedelta(days=settings.loan_max_days):
        raise HTTPException(
            status_code=400,
            detail=f"Loans can be at most {settings.loan_max_days} days long.",
        )


def check_project(db: Session, user: User, project_id: uuid.UUID | None) -> None:
    if project_id is None:
        return
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise HTTPException(status_code=400, detail="project not found")


def existing_for_retry(db: Session, user: User, loan_id: uuid.UUID) -> Loan | None:
    """A known id is a client retry (same 201) or someone else's id (409)."""
    loan = load_loan(db, loan_id)
    if loan is not None and loan.borrower_id != user.id:
        raise HTTPException(status_code=409, detail="This loan id is already taken.")
    return loan


@router.get("/rules", response_model=RulesOut)
def loan_rules(user: User = Depends(get_current_user)) -> RulesOut:
    return RulesOut(
        max_days=settings.loan_max_days,
        max_photos=settings.loan_max_photos,
        units=list(LOAN_UNITS),
    )


@router.post("", status_code=201, response_model=LoanOut)
def create_loan(
    body: LoanIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LoanOut:
    existing = existing_for_retry(db, user, body.id)
    if existing is not None:
        return to_loan_out(existing, lab_today())
    check_photo_count(body.photo_file_ids)
    for file_id in body.photo_file_ids:
        require_unlinked_loan_photo(db, user, file_id)
    check_due_date(body.type, body.due_date)
    check_project(db, user, body.project_id)

    db.add(
        Loan(
            id=body.id,
            borrower_id=user.id,
            type=body.type,
            item_name=body.item_name,
            description=body.description,
            quantity=body.quantity,
            unit=body.unit,
            project_id=body.project_id,
            due_date=body.due_date,
        )
    )
    try:
        db.flush()
        db.add_all(
            LoanPhoto(file_id=file_id, loan_id=body.id, stage="borrow", position=index)
            for index, file_id in enumerate(body.photo_file_ids)
        )
        db.commit()
    except IntegrityError:
        # A concurrent retry won the race (same id) or linked a photo first.
        db.rollback()
        existing = existing_for_retry(db, user, body.id)
        if existing is None:
            raise HTTPException(
                status_code=400, detail="photo is already on a loan"
            ) from None
        return to_loan_out(existing, lab_today())
    return to_loan_out(load_loan(db, body.id), lab_today())


@router.get("/mine", response_model=list[LoanOut])
def my_loans(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[LoanOut]:
    loans = db.scalars(
        select(Loan)
        .where(Loan.borrower_id == user.id)
        .options(selectinload(Loan.photos), selectinload(Loan.project))
        .order_by(Loan.borrowed_at.desc())
    ).all()
    # Open equipment first (soonest due), then everything else newest first.
    open_items = sorted(
        (loan for loan in loans if loan.type == "equipment" and not loan.returned_at),
        key=lambda loan: loan.due_date,
    )
    rest = [loan for loan in loans if loan not in open_items]
    today = lab_today()
    return [to_loan_out(loan, today) for loan in open_items + rest]


@router.post("/{loan_id}/return", response_model=LoanOut)
def return_loan(
    loan_id: uuid.UUID,
    body: ReturnIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LoanOut:
    loan = load_loan(db, loan_id, lock=True)
    if loan is None or loan.borrower_id != user.id:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan.type == "material":
        raise HTTPException(status_code=400, detail="Materials aren't returned.")
    if loan.returned_at is not None:
        raise HTTPException(status_code=409, detail="This loan is already returned")
    require_unlinked_loan_photo(db, user, body.photo_file_id)

    loan.returned_at = func.now()
    loan.returned_by_id = user.id
    loan.return_note = body.note or None
    db.add(
        LoanPhoto(
            file_id=body.photo_file_id, loan_id=loan.id, stage="return", position=0
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="photo is already on a loan"
        ) from None
    db.expire_all()
    return to_loan_out(load_loan(db, loan_id), lab_today())
