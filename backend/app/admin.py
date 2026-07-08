import uuid
from datetime import date as date_type
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from .access import get_project_or_404
from .auth import require_staff
from .bookings import BookingOut, lock_machine_day, overlapping
from .checkouts import CheckoutOut
from .db import get_db
from .emails import send_email
from .issues import IssueOut
from .models import Booking, Checkout, Issue, Project, User
from .projects import ProjectPage, project_item
from .schemas import UserOut

router = APIRouter(prefix="/admin")


@router.get("/projects", response_model=ProjectPage)
def list_all_projects(
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ProjectPage:
    # Moderation view: every project, public and private.
    query = select(Project).options(selectinload(Project.owner))
    if q:
        query = query.join(User, Project.owner_id == User.id).where(
            Project.title.ilike(f"%{q}%") | User.name.ilike(f"%{q}%")
        )
    total = db.execute(
        select(func.count()).select_from(query.subquery())
    ).scalar_one()
    projects = (
        db.execute(
            query.order_by(Project.created_at.desc()).limit(limit).offset(offset)
        )
        .scalars()
        .all()
    )
    return ProjectPage(items=[project_item(p) for p in projects], total=total)


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
    q: str = Query(default="", max_length=200),
) -> list[User]:
    query = select(User).order_by(User.name).limit(200)
    if q:
        pattern = f"%{q}%"
        query = query.where(User.name.ilike(pattern) | User.email.ilike(pattern))
    return db.execute(query).scalars().all()


class RolePatch(BaseModel):
    role: Literal["staff", "student"]


@router.patch("/users/{user_id}", response_model=UserOut)
def set_role(
    user_id: uuid.UUID,
    body: RolePatch,
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
) -> User:
    if user_id == staff.id and body.role != "staff":
        # Otherwise the last staff member could lock everyone out.
        raise HTTPException(status_code=400, detail="cannot demote yourself")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = body.role
    db.commit()
    db.refresh(user)
    return user


class AdminBookingOut(BookingOut):
    user_name: str
    user_email: str


def admin_booking_out(booking: Booking) -> AdminBookingOut:
    return AdminBookingOut(
        **BookingOut.model_validate(booking).model_dump(),
        user_name=booking.user.name,
        user_email=booking.user.email,
    )


@router.get("/bookings", response_model=list[AdminBookingOut])
def list_bookings(
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
    status: str = Query(default="", max_length=20),
) -> list[AdminBookingOut]:
    query = select(Booking).options(selectinload(Booking.user))
    if status:
        query = query.where(Booking.status == status)
    bookings = (
        db.execute(
            query.order_by(Booking.date.desc(), Booking.start_time.desc()).limit(200)
        )
        .scalars()
        .all()
    )
    return [admin_booking_out(b) for b in bookings]


class BookingDecision(BaseModel):
    status: Literal["approved", "rejected"]


@router.patch("/bookings/{booking_id}", response_model=AdminBookingOut)
def decide_booking(
    booking_id: uuid.UUID,
    body: BookingDecision,
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
) -> AdminBookingOut:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail="booking is not decidable")

    if body.status == "approved":
        # Two pendings can overlap; only one may be approved.
        lock_machine_day(db, booking.machine_slug, booking.date)
        clash = overlapping(
            db,
            booking.machine_slug,
            booking.date,
            booking.start_time,
            booking.end_time,
            statuses=("approved",),
            exclude_id=booking.id,
        )
        if clash:
            raise HTTPException(
                status_code=409, detail="an approved booking already covers this slot"
            )

    booking.status = body.status
    db.commit()
    db.refresh(booking)
    send_email(
        booking.user.email,
        f"Booking {body.status}: {booking.machine_slug} on {booking.date}",
        f"Your booking for {booking.machine_slug} on {booking.date} "
        f"{booking.start_time:%H:%M}–{booking.end_time:%H:%M} was {body.status}.",
    )
    return admin_booking_out(booking)


class AdminCheckoutOut(CheckoutOut):
    user_name: str
    user_email: str
    overdue: bool


@router.get("/checkouts", response_model=list[AdminCheckoutOut])
def list_checkouts(
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
    status: str = Query(default="out", max_length=20),
) -> list[AdminCheckoutOut]:
    query = select(Checkout).options(selectinload(Checkout.user))
    if status:
        query = query.where(Checkout.status == status)
    checkouts = (
        db.execute(query.order_by(Checkout.due_date).limit(200)).scalars().all()
    )
    today = date_type.today()
    return [
        AdminCheckoutOut(
            **CheckoutOut.model_validate(c).model_dump(),
            user_name=c.user.name,
            user_email=c.user.email,
            overdue=c.status == "out" and c.due_date < today,
        )
        for c in checkouts
    ]


class AdminIssueOut(IssueOut):
    reporter_name: str
    reporter_email: str


def admin_issue_out(issue: Issue) -> AdminIssueOut:
    return AdminIssueOut(
        **IssueOut.model_validate(issue).model_dump(),
        reporter_name=issue.reporter.name,
        reporter_email=issue.reporter.email,
    )


@router.get("/issues", response_model=list[AdminIssueOut])
def list_issues(
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
    status: str = Query(default="open", max_length=20),
) -> list[AdminIssueOut]:
    query = select(Issue).options(selectinload(Issue.reporter))
    if status:
        query = query.where(Issue.status == status)
    issues = (
        db.execute(query.order_by(Issue.created_at.desc()).limit(200))
        .scalars()
        .all()
    )
    return [admin_issue_out(i) for i in issues]


class IssuePatch(BaseModel):
    status: Literal["open", "resolved"]


@router.patch("/issues/{issue_id}", response_model=AdminIssueOut)
def set_issue_status(
    issue_id: uuid.UUID,
    body: IssuePatch,
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
) -> AdminIssueOut:
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    issue.status = body.status
    db.commit()
    db.refresh(issue)
    return admin_issue_out(issue)


class FeaturedPut(BaseModel):
    project_ids: list[uuid.UUID] = Field(max_length=50)


@router.put("/featured")
def set_featured(
    body: FeaturedPut,
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
) -> dict[str, int]:
    if len(set(body.project_ids)) != len(body.project_ids):
        raise HTTPException(status_code=400, detail="duplicate project ids")
    projects = (
        db.execute(select(Project).where(Project.id.in_(body.project_ids)))
        .scalars()
        .all()
    )
    if len(projects) != len(body.project_ids):
        raise HTTPException(status_code=404, detail="unknown project id")
    private = [p for p in projects if not p.is_public]
    if private:
        raise HTTPException(
            status_code=400, detail="only public projects can be featured"
        )

    db.execute(update(Project).values(featured_rank=None))
    rank_by_id = {pid: rank for rank, pid in enumerate(body.project_ids)}
    for project in projects:
        project.featured_rank = rank_by_id[project.id]
    db.commit()
    return {"featured": len(projects)}


class SliderPatch(BaseModel):
    pinned: bool


@router.patch("/projects/{project_id}/slider")
def set_slider_pin(
    project_id: uuid.UUID,
    body: SliderPatch,
    db: Session = Depends(get_db),
    staff: User = Depends(require_staff),
) -> dict[str, bool]:
    project = get_project_or_404(db, project_id)
    if body.pinned and not project.is_public:
        raise HTTPException(
            status_code=400, detail="only public projects can be pinned"
        )
    project.slider_pinned = body.pinned
    db.commit()
    return {"pinned": project.slider_pinned}
