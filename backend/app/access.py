import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import File, Project, User


def get_project_or_404(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def can_view(project: Project, user: User | None) -> bool:
    if project.is_public:
        return True
    return user is not None and (user.id == project.owner_id or user.role == "staff")


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


def require_file_view(file: File, user: User | None) -> None:
    # User-scoped files (avatars) are public — profile pages are public.
    if file.project_id is not None:
        require_can_view(file.project, user)


def require_file_edit(file: File, user: User) -> None:
    if file.project_id is not None:
        require_can_edit(file.project, user)
    elif not (file.owner_id == user.id or user.role == "staff"):
        raise HTTPException(status_code=404, detail="File not found")


def file_charged_owner_id(file: File) -> uuid.UUID:
    """Whose storage quota this file counts against."""
    return file.owner_id if file.project_id is None else file.project.owner_id
