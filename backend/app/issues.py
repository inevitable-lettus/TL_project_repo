import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .db import get_db
from .emails import send_email
from .models import Issue, User

router = APIRouter(prefix="/issues")


class IssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    machine_slug: str | None
    type: str
    severity: str
    description: str
    status: str
    created_at: datetime


class IssueCreate(BaseModel):
    # Freeform slug: an issue may concern a machine already off the sheet.
    machine_slug: str | None = Field(default=None, max_length=100)
    type: Literal["equipment", "safety", "other"]
    severity: Literal["low", "medium", "high", "urgent"]
    description: str = Field(min_length=1, max_length=2000)


@router.post("", response_model=IssueOut)
def create_issue(
    body: IssueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Issue:
    issue = Issue(
        reporter_id=user.id,
        machine_slug=body.machine_slug,
        type=body.type,
        severity=body.severity,
        description=body.description,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)

    if body.severity == "urgent":
        staff_emails = (
            db.execute(select(User.email).where(User.role == "staff")).scalars().all()
        )
        for email in staff_emails:
            send_email(
                email,
                f"URGENT lab issue: {body.machine_slug or body.type}",
                f"{user.name} reported an urgent {body.type} issue"
                + (f" on {body.machine_slug}" if body.machine_slug else "")
                + f":\n\n{body.description}",
            )
    return issue
