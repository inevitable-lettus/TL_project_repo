import uuid

import pytest

from backend.app import storage
from backend.app.models import File, User
from backend.tests.helpers import (
    login,
    make_client,
    make_project,
    upload_bytes,
)


def upload_avatar(client, data: bytes = b"png-bytes") -> dict:
    slot = client.post(
        "/users/me/avatar",
        json={"filename": "me.png", "size": len(data), "mime_type": "image/png"},
    ).json()
    assert upload_bytes(slot, data).status_code == 204
    confirmed = client.post(f"/files/{slot['file']['id']}/confirm")
    assert confirmed.status_code == 200
    return confirmed.json()


@pytest.fixture
def owner():
    client = make_client()
    user = login(client, "owner@uni.edu", "Owner")
    return client, user


def test_profile_public_hides_private_projects(db, owner):
    client, user = owner
    make_project(db, user["id"], is_public=True, title="Shown")
    make_project(db, user["id"], is_public=False, title="Hidden")

    anon_view = make_client().get(f"/users/{user['id']}").json()
    assert [p["title"] for p in anon_view["projects"]] == ["Shown"]
    assert "email" not in anon_view  # profiles never expose email

    own_view = client.get(f"/users/{user['id']}").json()
    assert {p["title"] for p in own_view["projects"]} == {"Shown", "Hidden"}

    staff = make_client()
    login(staff, "staff@uni.edu")
    staff_view = staff.get(f"/users/{user['id']}").json()
    assert {p["title"] for p in staff_view["projects"]} == {"Shown", "Hidden"}


def test_unknown_profile_404(owner):
    assert make_client().get(f"/users/{uuid.uuid4()}").status_code == 404


def test_update_profile_fields(db, owner):
    client, user = owner
    response = client.patch(
        "/users/me",
        json={
            "bio": "I build robots",
            "program": "Mechatronics",
            "enrollment_year": 2024,
        },
    )
    assert response.status_code == 200
    db.expire_all()
    row = db.get(User, uuid.UUID(user["id"]))
    assert row.bio == "I build robots"
    assert row.enrollment_year == 2024

    assert client.patch("/users/me", json={"enrollment_year": 1800}).status_code == 422
    assert make_client().patch("/users/me", json={"bio": "x"}).status_code == 401


def test_avatar_upload_set_and_replace(db, owner):
    client, user = owner
    non_image = client.post(
        "/users/me/avatar",
        json={"filename": "x.exe", "size": 10, "mime_type": "application/exe"},
    )
    assert non_image.status_code == 400

    first = upload_avatar(client)
    assert (
        client.patch("/users/me", json={"avatar_file_id": first["id"]}).status_code
        == 200
    )
    first_key = db.get(File, uuid.UUID(first["id"])).object_key

    anon = make_client()  # avatars are public
    assert anon.get(f"/files/{first['id']}/download-url").status_code == 200

    second = upload_avatar(client, b"newer-image")
    assert (
        client.patch("/users/me", json={"avatar_file_id": second["id"]}).status_code
        == 200
    )
    db.expire_all()
    assert db.get(User, uuid.UUID(user["id"])).avatar_file_id == uuid.UUID(second["id"])
    assert db.get(File, uuid.UUID(first["id"])) is None  # old avatar purged
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(first_key)


def test_avatar_must_be_own_avatar_file(db, owner):
    client, user = owner
    other = make_client()
    login(other, "other@uni.edu")
    theirs = upload_avatar(other)
    assert (
        client.patch("/users/me", json={"avatar_file_id": theirs["id"]}).status_code
        == 400
    )

    project = make_project(db, user["id"], is_public=True)
    from backend.tests.helpers import full_upload

    project_file = full_upload(client, project.id, b"img", kind="media")
    response = client.patch("/users/me", json={"avatar_file_id": project_file["id"]})
    assert response.status_code == 400  # project files can't be avatars
