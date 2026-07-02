import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .access import get_project_or_404
from .auth import require_staff
from .db import get_db
from .models import Project, User
from .schemas import UserOut

router = APIRouter(prefix="/admin")


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
