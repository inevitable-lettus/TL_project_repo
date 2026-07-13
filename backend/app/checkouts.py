import uuid
from datetime import UTC, datetime, timedelta
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import settings
from .db import get_db
from .models import Checkout, User

router = APIRouter(prefix="/checkouts")


class CheckoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    tool_name: str
    quantity: int
    due_date: date_type
    status: str
    returned_at: datetime | None
    created_at: datetime


class CheckoutCreate(BaseModel):
    category: str
    tool_name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(ge=1, le=100)
    due_date: date_type


@router.get("/categories", response_model=list[str])
def categories() -> list[str]:
    return settings.tool_category_list


@router.post("", response_model=CheckoutOut)
def create_checkout(
    body: CheckoutCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Checkout:
    if body.category not in settings.tool_category_list:
        raise HTTPException(status_code=400, detail="unknown category")
    today = date_type.today()
    if body.due_date < today:
        raise HTTPException(status_code=400, detail="due date is in the past")
    if body.due_date > today + timedelta(days=365):
        raise HTTPException(status_code=400, detail="due date too far ahead")

    checkout = Checkout(
        user_id=user.id,
        category=body.category,
        tool_name=body.tool_name,
        quantity=body.quantity,
        due_date=body.due_date,
    )
    db.add(checkout)
    db.commit()
    db.refresh(checkout)
    return checkout


@router.get("/mine", response_model=list[CheckoutOut])
def my_checkouts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Checkout]:
    return (
        db.execute(
            select(Checkout)
            .where(Checkout.user_id == user.id)
            .order_by(Checkout.status.desc(), Checkout.due_date)  # "out" first
            .limit(100)
        )
        .scalars()
        .all()
    )


@router.post("/{checkout_id}/return", response_model=CheckoutOut)
def return_checkout(
    checkout_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Checkout:
    checkout = db.get(Checkout, checkout_id)
    if checkout is None or (checkout.user_id != user.id and user.role != "staff"):
        raise HTTPException(status_code=404, detail="Checkout not found")
    if checkout.status != "out":
        raise HTTPException(status_code=400, detail="already returned")
    checkout.status = "returned"
    checkout.returned_at = datetime.now(UTC)
    db.commit()
    db.refresh(checkout)
    return checkout
