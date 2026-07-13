import uuid
from datetime import date as date_type
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import settings
from .db import get_db
from .machines import machine_slugs
from .models import Booking, User

router = APIRouter(prefix="/bookings")

ACTIVE_STATUSES = ("pending", "approved")  # block a slot


def lab_open() -> time:
    return time.fromisoformat(settings.lab_open)


def lab_close() -> time:
    return time.fromisoformat(settings.lab_close)


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    machine_slug: str
    date: date_type
    start_time: time
    end_time: time
    purpose: str
    status: str
    created_at: datetime


class BookingRules(BaseModel):
    slot_minutes: int
    max_minutes: int
    advance_days: int
    lab_open: time
    lab_close: time


@router.get("/rules", response_model=BookingRules)
def booking_rules() -> BookingRules:
    # The slot grid needs the env-driven rules (hard rule 4: never hardcode
    # limits client-side).
    return BookingRules(
        slot_minutes=settings.booking_slot_minutes,
        max_minutes=settings.booking_max_minutes,
        advance_days=settings.booking_advance_days,
        lab_open=lab_open(),
        lab_close=lab_close(),
    )


class BookingCreate(BaseModel):
    machine_slug: str = Field(min_length=1, max_length=100)
    date: date_type
    start_time: time
    end_time: time
    purpose: str = Field(min_length=1, max_length=500)


def booking_error(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def validate_booking_window(body: BookingCreate) -> None:
    today = date_type.today()
    if body.date < today:
        raise booking_error("date is in the past")
    if body.date > today + timedelta(days=settings.booking_advance_days):
        raise booking_error(f"bookings open {settings.booking_advance_days} days ahead")

    start, end = _minutes(body.start_time), _minutes(body.end_time)
    open_, close = _minutes(lab_open()), _minutes(lab_close())
    slot = settings.booking_slot_minutes
    if start >= end:
        raise booking_error("end must be after start")
    if start < open_ or end > close:
        raise booking_error(f"lab hours are {settings.lab_open}–{settings.lab_close}")
    if (start - open_) % slot or (end - open_) % slot:
        raise booking_error(f"times must align to {slot}-minute slots")
    if end - start > settings.booking_max_minutes:
        raise booking_error(
            f"bookings are capped at {settings.booking_max_minutes} minutes"
        )


def overlapping(
    db: Session,
    machine_slug: str,
    date: date_type,
    start_time: time,
    end_time: time,
    statuses: tuple[str, ...] = ACTIVE_STATUSES,
    exclude_id: uuid.UUID | None = None,
):
    query = select(Booking).where(
        Booking.machine_slug == machine_slug,
        Booking.date == date,
        Booking.status.in_(statuses),
        Booking.start_time < end_time,
        Booking.end_time > start_time,
    )
    if exclude_id is not None:
        query = query.where(Booking.id != exclude_id)
    return db.execute(query).scalars().first()


def lock_machine_day(db: Session, machine_slug: str, date: date_type) -> None:
    # Serializes concurrent bookings for one machine-day so the overlap
    # check can't race (phantom rows under read-committed).
    db.execute(
        select(func.pg_advisory_xact_lock(func.hashtext(f"{machine_slug}:{date}")))
    )


@router.post("", response_model=BookingOut)
def create_booking(
    body: BookingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Booking:
    if body.machine_slug not in machine_slugs():
        raise booking_error("unknown machine")
    validate_booking_window(body)

    lock_machine_day(db, body.machine_slug, body.date)
    if overlapping(db, body.machine_slug, body.date, body.start_time, body.end_time):
        raise HTTPException(status_code=409, detail="slot already taken")

    booking = Booking(
        user_id=user.id,
        machine_slug=body.machine_slug,
        date=body.date,
        start_time=body.start_time,
        end_time=body.end_time,
        purpose=body.purpose,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.get("/mine", response_model=list[BookingOut])
def my_bookings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Booking]:
    return (
        db.execute(
            select(Booking)
            .where(Booking.user_id == user.id)
            .order_by(Booking.date.desc(), Booking.start_time.desc())
            .limit(100)
        )
        .scalars()
        .all()
    )


class DaySlot(BaseModel):
    start_time: time
    end_time: time


@router.get("/day", response_model=list[DaySlot])
def machine_day(
    machine: str = Query(min_length=1, max_length=100),
    date: date_type = Query(),
    db: Session = Depends(get_db),
) -> list[DaySlot]:
    # Public busy-times feed for the slot grid: times only, no names or
    # purposes.
    bookings = (
        db.execute(
            select(Booking)
            .where(
                Booking.machine_slug == machine,
                Booking.date == date,
                Booking.status.in_(ACTIVE_STATUSES),
            )
            .order_by(Booking.start_time)
        )
        .scalars()
        .all()
    )
    return [DaySlot(start_time=b.start_time, end_time=b.end_time) for b in bookings]


@router.post("/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(
    booking_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None or (booking.user_id != user.id and user.role != "staff"):
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status not in ACTIVE_STATUSES:
        raise booking_error("booking is not active")
    booking.status = "cancelled"
    db.commit()
    db.refresh(booking)
    return booking
