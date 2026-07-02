import re
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from minio.error import S3Error
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import storage
from .access import get_project_or_404, require_can_edit, require_can_view
from .auth import get_current_user, get_current_user_optional
from .config import settings
from .db import get_db
from .models import File, Project, User
from .schemas import FileOut

router = APIRouter()


def sanitize_filename(filename: str) -> str:
    # Object keys allow no spaces/unicode/slashes; the original name stays in
    # the filename column for display.
    return re.sub(r"[^A-Za-z0-9._-]", "_", filename) or "file"


def user_storage_used(db: Session, owner_id: uuid.UUID) -> int:
    return db.execute(
        select(func.coalesce(func.sum(File.size), 0))
        .join(Project, File.project_id == Project.id)
        .where(Project.owner_id == owner_id)
    ).scalar_one()


def oversize_error() -> HTTPException:
    # Same plain message at all three enforcement points (design.md).
    limit_gb = settings.max_file_size / 1024**3
    return HTTPException(
        status_code=400, detail=f"file exceeds {limit_gb:g} GB limit"
    )


def purge_project_objects(project: Project) -> None:
    """Delete every MinIO object for a project. Must run before the DB row
    goes away — ON DELETE CASCADE alone would leak the objects (hard rule 6)."""
    for file in project.files:
        storage.remove_object(file.object_key)


class UploadSlotIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0, description="declared size in bytes (advisory)")
    mime_type: str = Field(min_length=1, max_length=255)
    kind: Literal["media", "attachment"]


class UploadSlotOut(BaseModel):
    file: FileOut
    upload_url: str
    upload_fields: dict[str, str]


@router.post("/projects/{project_id}/files", response_model=UploadSlotOut)
def create_upload_slot(
    project_id: uuid.UUID,
    body: UploadSlotIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadSlotOut:
    project = get_project_or_404(db, project_id)
    require_can_edit(project, user)
    if body.size > settings.max_file_size:
        raise oversize_error()  # enforcement #1: declared-size pre-check
    if user_storage_used(db, project.owner_id) + body.size > settings.max_user_storage:
        raise HTTPException(status_code=400, detail="storage quota exceeded")

    file_id = uuid.uuid4()
    object_key = f"projects/{project_id}/{file_id}/{sanitize_filename(body.filename)}"
    file = File(
        id=file_id,
        project_id=project.id,
        filename=body.filename,
        object_key=object_key,
        size=body.size,
        mime_type=body.mime_type,
        kind=body.kind,
    )
    db.add(file)
    db.commit()
    db.refresh(file)

    upload = storage.presigned_post(object_key, settings.max_file_size)
    return UploadSlotOut(
        file=FileOut.model_validate(file),
        upload_url=upload["url"],
        upload_fields=upload["fields"],
    )


@router.post("/files/{file_id}/confirm", response_model=FileOut)
def confirm_upload(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> File:
    file = db.get(File, file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    project = file.project
    require_can_edit(project, user)
    if file.status == "ready":
        return file

    try:
        stat = storage.stat_object(file.object_key)
    except S3Error as error:
        if error.code == "NoSuchKey":
            raise HTTPException(
                status_code=400, detail="no uploaded bytes found for this file"
            )
        raise

    # Enforcement #3 (authoritative): the actual size in storage decides.
    if stat.size > settings.max_file_size:
        storage.remove_object(file.object_key)
        db.delete(file)
        db.commit()
        raise oversize_error()
    used_without_this = user_storage_used(db, project.owner_id) - file.size
    if used_without_this + stat.size > settings.max_user_storage:
        storage.remove_object(file.object_key)
        db.delete(file)
        db.commit()
        raise HTTPException(status_code=400, detail="storage quota exceeded")

    file.size = stat.size
    file.status = "ready"
    db.commit()
    db.refresh(file)
    return file


class DownloadUrlOut(BaseModel):
    url: str
    filename: str
    size: int
    mime_type: str


@router.get("/files/{file_id}/download-url", response_model=DownloadUrlOut)
def download_url(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> DownloadUrlOut:
    file = db.get(File, file_id)
    if file is None or file.status != "ready":
        raise HTTPException(status_code=404, detail="File not found")
    require_can_view(file.project, user)
    return DownloadUrlOut(
        url=storage.presigned_get_url(file.object_key),
        filename=file.filename,
        size=file.size,
        mime_type=file.mime_type,
    )


class MediaUrlsIn(BaseModel):
    file_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


@router.post("/projects/{project_id}/media-urls")
def media_urls(
    project_id: uuid.UUID,
    body: MediaUrlsIn,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> dict[str, dict[str, str]]:
    project = get_project_or_404(db, project_id)
    require_can_view(project, user)
    files = (
        db.execute(
            select(File).where(
                File.id.in_(body.file_ids),
                File.project_id == project.id,
                File.status == "ready",
            )
        )
        .scalars()
        .all()
    )
    if len(files) != len(set(body.file_ids)):
        raise HTTPException(
            status_code=400, detail="unknown file ids for this project"
        )
    return {
        "urls": {
            str(f.id): storage.presigned_get_url(f.object_key) for f in files
        }
    }
