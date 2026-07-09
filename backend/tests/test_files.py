import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from backend.app import cleanup, storage
from backend.app.config import settings
from backend.app.files import purge_project_objects, user_storage_used
from backend.app.models import File, Project
from backend.tests.helpers import (
    full_upload,
    login,
    make_client,
    make_project,
    request_slot,
    upload_bytes,
)


@pytest.fixture
def owner_client(db):
    client = make_client()
    user = login(client, "owner@uni.edu", "Owner")
    project = make_project(db, user["id"], is_public=False)
    return client, user, project


def test_upload_confirm_download_round_trip(db, owner_client):
    client, user, project = owner_client
    data = b"solid cube facet normal 0 0 0"
    ready = full_upload(client, project.id, data)

    assert ready["status"] == "ready"
    assert ready["size"] == len(data)
    assert ready["kind"] == "attachment"

    download = client.get(f"/files/{ready['id']}/download-url")
    assert download.status_code == 200
    assert download.json()["filename"] == "part one.stl"
    fetched = httpx.get(download.json()["url"])
    assert fetched.status_code == 200
    assert fetched.content == data

    row = db.get(File, uuid.UUID(ready["id"]))
    assert "part_one.stl" in row.object_key  # sanitized key, original name kept


def test_slot_requires_login_and_ownership(db, owner_client):
    _, _, project = owner_client

    anon = make_client()
    assert request_slot(anon, project.id, 10).status_code == 401

    stranger = make_client()
    login(stranger, "stranger@uni.edu")
    assert request_slot(stranger, project.id, 10).status_code == 404  # private: hidden

    staff = make_client()
    login(staff, "staff@uni.edu")
    assert request_slot(staff, project.id, 10).status_code == 200


def test_declared_oversize_rejected(monkeypatch, owner_client):
    client, _, project = owner_client
    monkeypatch.setattr(settings, "max_file_size", 100)
    response = request_slot(client, project.id, 101)
    assert response.status_code == 400
    assert "limit" in response.json()["detail"]


def test_minio_policy_rejects_oversize_bytes(monkeypatch, owner_client):
    client, _, project = owner_client
    monkeypatch.setattr(settings, "max_file_size", 100)
    slot = request_slot(client, project.id, 50).json()
    response = upload_bytes(slot, b"x" * 200)  # lie: upload more than declared
    assert response.status_code == 400  # MinIO enforces content-length-range


def test_confirm_authoritative_size_purges(monkeypatch, db, owner_client):
    client, _, project = owner_client
    slot = request_slot(client, project.id, 50).json()
    assert upload_bytes(slot, b"x" * 50).status_code == 204
    object_key = db.get(File, uuid.UUID(slot["file"]["id"])).object_key

    monkeypatch.setattr(settings, "max_file_size", 10)  # tighten after upload
    response = client.post(f"/files/{slot['file']['id']}/confirm")
    assert response.status_code == 400

    db.expire_all()
    assert db.get(File, uuid.UUID(slot["file"]["id"])) is None
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(object_key)


def test_confirm_without_upload_fails_row_stays_pending(db, owner_client):
    client, _, project = owner_client
    slot = request_slot(client, project.id, 50).json()
    response = client.post(f"/files/{slot['file']['id']}/confirm")
    assert response.status_code == 400
    db.expire_all()
    assert db.get(File, uuid.UUID(slot["file"]["id"])).status == "pending"


def test_quota_enforced_at_slot(monkeypatch, db, owner_client):
    client, user, project = owner_client
    monkeypatch.setattr(settings, "max_user_storage", 100)
    full_upload(client, project.id, b"x" * 80)
    assert request_slot(client, project.id, 30).status_code == 400
    assert request_slot(client, project.id, 20).status_code == 200
    assert user_storage_used(db, uuid.UUID(user["id"])) == 100  # 80 ready + 20 pending


def test_download_visibility_matrix(db, owner_client):
    client, user, private_project = owner_client
    public_project = make_project(db, user["id"], is_public=True)
    private_file = full_upload(client, private_project.id, b"secret")
    public_file = full_upload(client, public_project.id, b"open")

    anon = make_client()
    assert anon.get(f"/files/{public_file['id']}/download-url").status_code == 200
    assert anon.get(f"/files/{private_file['id']}/download-url").status_code == 404

    stranger = make_client()
    login(stranger, "stranger@uni.edu")
    assert stranger.get(f"/files/{private_file['id']}/download-url").status_code == 404

    staff = make_client()
    login(staff, "staff@uni.edu")
    assert staff.get(f"/files/{private_file['id']}/download-url").status_code == 200

    assert client.get(f"/files/{private_file['id']}/download-url").status_code == 200


def test_pending_file_not_downloadable(owner_client):
    client, _, project = owner_client
    slot = request_slot(client, project.id, 10).json()
    assert client.get(f"/files/{slot['file']['id']}/download-url").status_code == 404


def test_media_urls_batch_and_foreign_id_rejection(db, owner_client):
    client, user, _ = owner_client
    public_project = make_project(db, user["id"], is_public=True)
    other_project = make_project(db, user["id"], is_public=True)
    file_a = full_upload(client, public_project.id, b"a")
    file_b = full_upload(client, public_project.id, b"b")
    foreign = full_upload(client, other_project.id, b"c")

    anon = make_client()
    good = anon.post(
        f"/projects/{public_project.id}/media-urls",
        json={"file_ids": [file_a["id"], file_b["id"]]},
    )
    assert good.status_code == 200
    assert set(good.json()["urls"].keys()) == {file_a["id"], file_b["id"]}

    bad = anon.post(
        f"/projects/{public_project.id}/media-urls",
        json={"file_ids": [file_a["id"], foreign["id"]]},
    )
    assert bad.status_code == 400


def test_media_urls_private_project_hidden_from_anon(owner_client):
    client, _, project = owner_client
    file = full_upload(client, project.id, b"x")
    anon = make_client()
    response = anon.post(
        f"/projects/{project.id}/media-urls", json={"file_ids": [file["id"]]}
    )
    assert response.status_code == 404


def test_sweep_removes_stale_pending_only(db, owner_client):
    client, _, project = owner_client
    stale = request_slot(client, project.id, 10).json()
    assert upload_bytes(stale, b"0123456789").status_code == 204
    stale_key = db.get(File, uuid.UUID(stale["file"]["id"])).object_key
    fresh = request_slot(client, project.id, 10).json()
    ready = full_upload(client, project.id, b"keep me")

    db.execute(
        File.__table__.update()
        .where(File.id == uuid.UUID(stale["file"]["id"]))
        .values(created_at=datetime.now(UTC) - timedelta(hours=2))
    )
    db.commit()

    from backend.tests.conftest import TestSession

    assert cleanup.sweep_once(session_factory=TestSession) == 1

    db.expire_all()
    assert db.get(File, uuid.UUID(stale["file"]["id"])) is None
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(stale_key)
    assert db.get(File, uuid.UUID(fresh["file"]["id"])).status == "pending"
    assert db.get(File, uuid.UUID(ready["id"])).status == "ready"


def test_purge_project_objects_removes_bytes(db, owner_client):
    client, _, project = owner_client
    ready = full_upload(client, project.id, b"purge me")
    db.expire_all()
    row = db.get(File, uuid.UUID(ready["id"]))

    purge_project_objects(db.get(Project, project.id))
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(row.object_key)


def test_delete_file_purges_object_and_row(db, owner_client):
    client, _, project = owner_client
    ready = full_upload(client, project.id, b"delete me")
    key = db.get(File, uuid.UUID(ready["id"])).object_key

    response = client.delete(f"/files/{ready['id']}")
    assert response.status_code == 200
    assert db.get(File, uuid.UUID(ready["id"])) is None
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(key)


def test_delete_file_requires_edit_rights(db, owner_client):
    client, _, project = owner_client
    ready = full_upload(client, project.id, b"keep me")

    anon = make_client()
    assert anon.delete(f"/files/{ready['id']}").status_code == 401

    stranger = make_client()
    login(stranger, "stranger2@uni.edu")
    assert stranger.delete(f"/files/{ready['id']}").status_code == 404

    assert db.get(File, uuid.UUID(ready["id"])) is not None


def test_delete_file_embedded_in_content_rejected(db, owner_client):
    client, _, project = owner_client
    ready = full_upload(client, project.id, b"embedded", kind="media")
    patched = client.patch(
        f"/projects/{project.id}",
        json={
            "content": {
                "type": "doc",
                "content": [{"type": "media", "attrs": {"fileId": ready["id"]}}],
            }
        },
    )
    assert patched.status_code == 200

    response = client.delete(f"/files/{ready['id']}")
    assert response.status_code == 400
    assert "write-up" in response.json()["detail"]
    assert db.get(File, uuid.UUID(ready["id"])) is not None
