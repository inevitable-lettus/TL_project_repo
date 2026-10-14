"""Borrowing log. The Google Sheet (via its Apps Script web app) is the only
store of loan records; FastAPI is its only caller (epic #7, Contract A)."""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import settings
from .db import get_db
from .models import File, User

router = APIRouter(prefix="/loans", tags=["loans"])
logger = logging.getLogger(__name__)

SHEET_UNAVAILABLE = "The borrowing log is unavailable — try again in a minute."
RETURN_ERRORS = {"not_found", "already_returned"}

ItemName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
Reason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]
ConditionNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class LoanIn(BaseModel):
    # Unknown fields (e.g. name/email) are rejected: those come from the session.
    model_config = ConfigDict(extra="forbid")

    loan_id: uuid.UUID
    item_name: ItemName
    quantity: int = Field(ge=1, le=999)
    due_date: date
    reason: Reason
    photo_file_id: uuid.UUID


class ReturnIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    photo_file_id: uuid.UUID
    condition_note: ConditionNote = ""


class LoanOut(BaseModel):
    loan_id: uuid.UUID
    borrowed_at: datetime
    item_name: str
    quantity: int
    reason: str
    due_date: date
    status: Literal["out", "returned"]
    overdue: bool
    returned_at: datetime | None
    borrow_photo_url: str
    return_photo_url: str | None
    return_note: str | None


def sheet_failure(action: str, reason: str) -> HTTPException:
    # Log what went wrong, never the request payload (it carries the secret).
    logger.error("loans sheet %s failed: %s", action, reason)
    return HTTPException(status_code=502, detail=SHEET_UNAVAILABLE)


def call_sheet(action: str, payload: dict) -> dict:
    if not settings.loans_enabled:
        raise HTTPException(
            status_code=503, detail="Borrowing isn't set up yet — ask lab staff."
        )
    try:
        response = httpx.post(
            settings.loans_script_url,
            json={"secret": settings.loans_script_secret, "action": action, **payload},
            timeout=10,
            follow_redirects=True,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise sheet_failure(action, type(error).__name__) from error
    try:
        body = response.json()
    except ValueError as error:
        raise sheet_failure(action, "response was not JSON") from error
    if not isinstance(body, dict):
        raise sheet_failure(action, "response was not a JSON object")
    if body.get("ok") is True:
        return body
    if action == "return" and body.get("error") in RETURN_ERRORS:
        return body
    raise sheet_failure(action, f"error {body.get('error')!r}")


def require_loan_photo(db: Session, user: User, file_id: uuid.UUID) -> File:
    file = db.get(File, file_id)
    if (
        file is None
        or file.owner_id != user.id
        or file.kind != "loan_photo"
        or file.status != "ready"
    ):
        raise HTTPException(status_code=400, detail="photo not found")
    return file


def photo_url(file_id: uuid.UUID) -> str:
    return f"{settings.public_url}/loans/photo/{file_id}"


def check_due_date(due_date: date) -> None:
    today = date.today()
    if due_date < today:
        raise HTTPException(status_code=400, detail="The return date is in the past.")
    if due_date > today + timedelta(days=settings.loan_max_days):
        raise HTTPException(
            status_code=400,
            detail=f"Loans can be at most {settings.loan_max_days} days long.",
        )


def utc_now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_loan_out(row: dict) -> LoanOut:
    due = date.fromisoformat(row["due_date"])
    return LoanOut(
        loan_id=row["loan_id"],
        borrowed_at=row["borrowed_at"],
        item_name=row["item"],
        quantity=row["quantity"],
        reason=row["reason"],
        due_date=due,
        status=row["status"],
        overdue=row["status"] == "out" and due < date.today(),
        returned_at=row["returned_at"],
        borrow_photo_url=row["borrow_photo"],
        return_photo_url=row["return_photo"],
        return_note=row["return_note"],
    )


def sort_loans(loans: list[LoanOut]) -> list[LoanOut]:
    # Out first (soonest due first), then returned (newest first).
    out = sorted(
        (loan for loan in loans if loan.status == "out"), key=lambda x: x.due_date
    )
    returned = sorted(
        (loan for loan in loans if loan.status == "returned"),
        key=lambda x: x.returned_at or x.borrowed_at,
        reverse=True,
    )
    return out + returned


@router.post("", status_code=201, response_model=LoanOut)
def create_loan(
    body: LoanIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LoanOut:
    require_loan_photo(db, user, body.photo_file_id)
    check_due_date(body.due_date)
    borrowed_at = utc_now_iso()
    # A duplicate loan_id is a client retry: same 201, nothing new written.
    call_sheet(
        "borrow",
        {
            "loan": {
                "loan_id": str(body.loan_id),
                "borrowed_at": borrowed_at,
                "name": user.name,
                "email": user.email,
                "item": body.item_name,
                "quantity": body.quantity,
                "reason": body.reason,
                "due_date": body.due_date.isoformat(),
                "borrow_photo": photo_url(body.photo_file_id),
            }
        },
    )
    return LoanOut(
        loan_id=body.loan_id,
        borrowed_at=borrowed_at,
        item_name=body.item_name,
        quantity=body.quantity,
        reason=body.reason,
        due_date=body.due_date,
        status="out",
        overdue=False,
        returned_at=None,
        borrow_photo_url=photo_url(body.photo_file_id),
        return_photo_url=None,
        return_note=None,
    )


@router.get("/mine", response_model=list[LoanOut])
def my_loans(user: User = Depends(get_current_user)) -> list[LoanOut]:
    body = call_sheet("list", {"email": user.email})
    return sort_loans([to_loan_out(row) for row in body["loans"]])


@router.post("/{loan_id}/return", status_code=204)
def return_loan(
    loan_id: uuid.UUID,
    body: ReturnIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    require_loan_photo(db, user, body.photo_file_id)
    result = call_sheet(
        "return",
        {
            "loan_id": str(loan_id),
            "email": user.email,
            "returned_at": utc_now_iso(),
            "return_photo": photo_url(body.photo_file_id),
            "return_note": body.condition_note,
        },
    )
    if result.get("error") == "not_found":
        raise HTTPException(status_code=404, detail="Loan not found")
    if result.get("error") == "already_returned":
        raise HTTPException(status_code=409, detail="This loan is already returned")
    return Response(status_code=204)
