import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .access import get_project_or_404, require_can_edit, require_can_view
from .auth import get_current_user, get_current_user_optional
from .config import settings
from .db import get_db
from .files import purge_project_objects
from .models import File, Project, User
from .schemas import FileOut, ProjectDetailOut, ProjectListItem

router = APIRouter(prefix="/projects")

ALLOWED_NODE_TYPES = {
    "doc",
    "paragraph",
    "text",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "hardBreak",
    "media",  # custom TipTap node; attrs.fileId references a project File
}
ALLOWED_MARK_TYPES = {"bold", "italic", "strike", "underline", "code", "link"}
ALLOWED_LINK_PREFIXES = ("http://", "https://", "mailto:")
MAX_CONTENT_NODES = 5000
MAX_CONTENT_DEPTH = 50


def content_error(reason: str) -> HTTPException:
    return HTTPException(status_code=400, detail=f"invalid content: {reason}")


def collect_content_file_ids(content: dict) -> set[uuid.UUID]:
    """Validate a TipTap document against the whitelist and return every
    media fileId it references."""
    if not isinstance(content, dict) or content.get("type") != "doc":
        raise content_error("root must be a doc node")
    file_ids: set[uuid.UUID] = set()
    seen = 0

    def walk(node: object, depth: int) -> None:
        nonlocal seen
        seen += 1
        if seen > MAX_CONTENT_NODES:
            raise content_error("too many nodes")
        if depth > MAX_CONTENT_DEPTH:
            raise content_error("nested too deeply")
        if not isinstance(node, dict):
            raise content_error("malformed node")
        node_type = node.get("type")
        if node_type not in ALLOWED_NODE_TYPES:
            raise content_error(f"node type not allowed: {node_type}")
        if node_type == "media":
            raw = (node.get("attrs") or {}).get("fileId")
            try:
                file_ids.add(uuid.UUID(str(raw)))
            except ValueError:
                raise content_error("media node needs a valid fileId") from None
        for mark in node.get("marks") or []:
            mark_type = mark.get("type") if isinstance(mark, dict) else None
            if mark_type not in ALLOWED_MARK_TYPES:
                raise content_error(f"mark type not allowed: {mark_type}")
            if mark_type == "link":
                href = str((mark.get("attrs") or {}).get("href") or "")
                if not href.startswith(ALLOWED_LINK_PREFIXES):
                    raise content_error("link href must be http(s) or mailto")
        for child in node.get("content") or []:
            walk(child, depth + 1)

    walk(content, 0)
    return file_ids


def validate_project_file_ids(
    db: Session, project: Project, file_ids: set[uuid.UUID]
) -> None:
    if not file_ids:
        return
    owned = set(
        db.execute(
            select(File.id).where(File.id.in_(file_ids), File.project_id == project.id)
        ).scalars()
    )
    if owned != file_ids:
        raise content_error("references files that do not belong to this project")


def project_item(project: Project) -> ProjectListItem:
    return ProjectListItem(
        id=project.id,
        title=project.title,
        description=project.description,
        is_public=project.is_public,
        cover_file_id=project.cover_file_id,
        featured_rank=project.featured_rank,
        slider_pinned=project.slider_pinned,
        owner_id=project.owner_id,
        owner_name=project.owner.name,
        created_at=project.created_at,
    )


def project_detail(project: Project) -> ProjectDetailOut:
    ready_files = [f for f in project.files if f.status == "ready"]
    return ProjectDetailOut(
        **project_item(project).model_dump(),
        content=project.content,
        files=[FileOut.model_validate(f) for f in ready_files],
    )


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class ProjectPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    content: dict | None = None
    cover_file_id: uuid.UUID | None = None
    is_public: bool | None = None


class ProjectPage(BaseModel):
    items: list[ProjectListItem]
    total: int


def _public_projects(db: Session):
    return (
        select(Project)
        .options(selectinload(Project.owner))
        .where(Project.is_public.is_(True))
    )


@router.post("", response_model=ProjectDetailOut)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetailOut:
    project = Project(title=body.title, description=body.description, owner_id=user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project_detail(project)


@router.get("", response_model=ProjectPage)
def showcase(
    db: Session = Depends(get_db),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ProjectPage:
    total = db.execute(
        select(func.count()).where(Project.is_public.is_(True))
    ).scalar_one()
    projects = (
        db.execute(
            _public_projects(db)
            .order_by(Project.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return ProjectPage(items=[project_item(p) for p in projects], total=total)


@router.get("/mine", response_model=list[ProjectListItem])
def my_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProjectListItem]:
    projects = (
        db.execute(
            select(Project)
            .options(selectinload(Project.owner))
            .where(Project.owner_id == user.id)
            .order_by(Project.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [project_item(p) for p in projects]


@router.get("/slider", response_model=list[ProjectListItem])
def slider_feed(db: Session = Depends(get_db)) -> list[ProjectListItem]:
    base = _public_projects(db).where(Project.cover_file_id.is_not(None))
    pinned = (
        db.execute(
            base.where(Project.slider_pinned.is_(True))
            .order_by(Project.created_at.desc())
            .limit(settings.slider_size)
        )
        .scalars()
        .all()
    )
    remaining = settings.slider_size - len(pinned)
    fill = []
    if remaining > 0:
        fill = (
            db.execute(
                base.where(Project.slider_pinned.is_(False))
                .order_by(func.random())
                .limit(remaining)
            )
            .scalars()
            .all()
        )
    return [project_item(p) for p in [*pinned, *fill]]


@router.get("/featured", response_model=list[ProjectListItem])
def featured_feed(db: Session = Depends(get_db)) -> list[ProjectListItem]:
    projects = (
        db.execute(
            _public_projects(db)
            .where(Project.featured_rank.is_not(None))
            .order_by(Project.featured_rank)
        )
        .scalars()
        .all()
    )
    return [project_item(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> ProjectDetailOut:
    project = get_project_or_404(db, project_id)
    require_can_view(project, user)
    return project_detail(project)


@router.patch("/{project_id}", response_model=ProjectDetailOut)
def update_project(
    project_id: uuid.UUID,
    body: ProjectPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetailOut:
    project = get_project_or_404(db, project_id)
    require_can_edit(project, user)
    changes = body.model_dump(exclude_unset=True)

    if "content" in changes and changes["content"] is not None:
        file_ids = collect_content_file_ids(changes["content"])
        validate_project_file_ids(db, project, file_ids)
    if "cover_file_id" in changes and changes["cover_file_id"] is not None:
        cover = db.get(File, changes["cover_file_id"])
        if cover is None or cover.project_id != project.id or cover.status != "ready":
            raise HTTPException(
                status_code=400, detail="cover must be a ready file of this project"
            )

    for field, value in changes.items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project_detail(project)


@router.delete("/{project_id}")
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    project = get_project_or_404(db, project_id)
    require_can_edit(project, user)
    # MinIO objects first, then the row — cascade alone would leak storage.
    purge_project_objects(project)
    db.delete(project)
    db.commit()
    return {"status": "deleted"}
