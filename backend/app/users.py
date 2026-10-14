import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import storage
from .auth import get_current_user, get_current_user_optional
from .db import get_db
from .models import File, Project, User
from .projects import project_item
from .schemas import ProfileOut, UserOut

router = APIRouter(prefix="/users")


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    program: str | None = Field(default=None, max_length=200)
    enrollment_year: int | None = Field(
        default=None, ge=1950, le=datetime.now().year + 1
    )
    avatar_file_id: uuid.UUID | None = None


@router.patch("/me", response_model=UserOut)
def update_profile(
    body: ProfilePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    changes = body.model_dump(exclude_unset=True)

    if "avatar_file_id" in changes:
        new_id = changes["avatar_file_id"]
        if new_id is not None:
            avatar = db.get(File, new_id)
            if (
                avatar is None
                or avatar.owner_id != user.id
                or avatar.project_id is not None
                or avatar.kind != "media"
                or avatar.status != "ready"
            ):
                raise HTTPException(
                    status_code=400, detail="avatar must be your own uploaded image"
                )
        old_id = user.avatar_file_id
        if old_id is not None and old_id != new_id:
            old = db.get(File, old_id)
            if old is not None:
                storage.remove_object(old.object_key)  # object first, then row
                user.avatar_file_id = None
                db.flush()
                db.delete(old)

    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=ProfileOut)
def profile(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> ProfileOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    query = (
        select(Project)
        .options(selectinload(Project.owner))
        .where(Project.owner_id == user.id)
        .order_by(Project.created_at.desc())
    )
    sees_private = viewer is not None and (
        viewer.id == user.id or viewer.role == "staff"
    )
    if not sees_private:
        query = query.where(Project.is_public.is_(True))
    projects = db.execute(query).scalars().all()

    return ProfileOut(
        id=user.id,
        name=user.name,
        role=user.role,
        bio=user.bio,
        program=user.program,
        enrollment_year=user.enrollment_year,
        avatar_file_id=user.avatar_file_id,
        projects=[project_item(p) for p in projects],
    )
