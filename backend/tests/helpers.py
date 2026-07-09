import uuid

import httpx
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import Project


def make_client() -> TestClient:
    return TestClient(app, follow_redirects=False)


def login(client: TestClient, email: str, name: str = "Someone") -> dict:
    response = client.post("/auth/test-login", json={"email": email, "name": name})
    assert response.status_code == 200
    return response.json()


def make_project(
    db, owner_id: str, is_public: bool = False, title: str = "Robot Arm"
) -> Project:
    project = Project(title=title, owner_id=uuid.UUID(owner_id), is_public=is_public)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def request_slot(
    client: TestClient, project_id, size: int, **overrides
) -> httpx.Response:
    body = {
        "filename": "part one.stl",
        "size": size,
        "mime_type": "model/stl",
        "kind": "attachment",
        **overrides,
    }
    return client.post(f"/projects/{project_id}/files", json=body)


def upload_bytes(slot: dict, data: bytes) -> httpx.Response:
    return httpx.post(
        slot["upload_url"],
        data=slot["upload_fields"],
        files={"file": (slot["file"]["filename"], data)},
    )


def full_upload(client: TestClient, project_id, data: bytes, **overrides) -> dict:
    slot = request_slot(client, project_id, size=len(data), **overrides).json()
    assert upload_bytes(slot, data).status_code == 204
    confirmed = client.post(f"/files/{slot['file']['id']}/confirm")
    assert confirmed.status_code == 200
    return confirmed.json()
