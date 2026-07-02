import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    role: str


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID | None
    filename: str
    size: int
    mime_type: str
    status: str
    kind: str


class ProjectListItem(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    is_public: bool
    cover_file_id: uuid.UUID | None
    featured_rank: int | None
    slider_pinned: bool
    owner_id: uuid.UUID
    owner_name: str
    created_at: datetime


class ProjectDetailOut(ProjectListItem):
    content: dict | None
    files: list[FileOut]


class ProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    role: str
    bio: str | None
    program: str | None
    enrollment_year: int | None
    avatar_file_id: uuid.UUID | None
    projects: list[ProjectListItem]
