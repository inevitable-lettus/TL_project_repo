import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Project, User


def get_project_or_404(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def can_view(project: Project, user: User | None) -> bool:
    if project.is_public:
        return True
    return user is not None and (
        user.id == project.owner_id or user.role == "staff"
    )


def can_edit(project: Project, user: User) -> bool:
    return user.id == project.owner_id or user.role == "staff"


def require_can_view(project: Project, user: User | None) -> None:
    # Private projects 404 for outsiders — never reveal they exist.
    if not can_view(project, user):
        raise HTTPException(status_code=404, detail="Project not found")


def require_can_edit(project: Project, user: User) -> None:
    if can_edit(project, user):
        return
    if project.is_public:
        raise HTTPException(status_code=403, detail="Not your project")
    raise HTTPException(status_code=404, detail="Project not found")
