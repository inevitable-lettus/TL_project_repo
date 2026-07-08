import uuid

import pytest

from backend.app import storage
from backend.app.config import settings
from backend.app.models import File, Project
from backend.tests.helpers import full_upload, login, make_client, make_project


def doc(*nodes: dict) -> dict:
    return {"type": "doc", "content": list(nodes)}


def para(text: str, marks: list | None = None) -> dict:
    text_node: dict = {"type": "text", "text": text}
    if marks:
        text_node["marks"] = marks
    return {"type": "paragraph", "content": [text_node]}


def media(file_id: str) -> dict:
    return {"type": "media", "attrs": {"fileId": file_id}}


@pytest.fixture
def owner():
    client = make_client()
    user = login(client, "owner@uni.edu", "Owner")
    return client, user


def test_create_requires_auth_and_defaults_private(db, owner):
    client, user = owner
    assert make_client().post("/projects", json={"title": "X"}).status_code == 401

    response = client.post(
        "/projects", json={"title": "CNC Plotter", "description": "draws"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_public"] is False
    assert body["owner_name"] == "Owner"
    assert db.get(Project, uuid.UUID(body["id"])) is not None


def test_description_length_capped_at_500(db, owner):
    client, user = owner
    ok = client.post("/projects", json={"title": "Cap", "description": "d" * 500})
    assert ok.status_code == 200

    too_long = client.post(
        "/projects", json={"title": "Cap", "description": "d" * 501}
    )
    assert too_long.status_code == 422

    project = make_project(db, user["id"])
    patched = client.patch(f"/projects/{project.id}", json={"description": "d" * 501})
    assert patched.status_code == 422


def test_showcase_lists_public_only_with_pagination(db, owner):
    client, user = owner
    for i in range(3):
        make_project(db, user["id"], is_public=True, title=f"Public {i}")
    make_project(db, user["id"], is_public=False, title="Secret")

    anon = make_client()
    page = anon.get("/projects?limit=2&offset=0").json()
    assert page["total"] == 3
    assert len(page["items"]) == 2
    assert all("Secret" != item["title"] for item in page["items"])


def test_mine_returns_own_projects_including_private(db, owner):
    client, user = owner
    make_project(db, user["id"], is_public=False, title="Mine Private")
    other = login(make_client(), "other@uni.edu")
    make_project(db, other["id"], is_public=True, title="Not Mine")

    titles = [p["title"] for p in client.get("/projects/mine").json()]
    assert titles == ["Mine Private"]

    assert make_client().get("/projects/mine").status_code == 401


def test_detail_visibility_and_ready_files_only(db, owner):
    client, user = owner
    project = make_project(db, user["id"], is_public=True)
    ready = full_upload(client, project.id, b"data")
    client.post(  # second slot never confirmed -> pending, must not list
        f"/projects/{project.id}/files",
        json={"filename": "p.txt", "size": 5, "mime_type": "text/plain", "kind": "media"},
    )

    detail = make_client().get(f"/projects/{project.id}").json()
    assert [f["id"] for f in detail["files"]] == [ready["id"]]

    private = make_project(db, user["id"], is_public=False)
    assert make_client().get(f"/projects/{private.id}").status_code == 404
    stranger = make_client()
    login(stranger, "stranger@uni.edu")
    assert stranger.get(f"/projects/{private.id}").status_code == 404
    staff = make_client()
    login(staff, "staff@uni.edu")
    assert staff.get(f"/projects/{private.id}").status_code == 200


def test_patch_ownership_rules(db, owner):
    client, user = owner
    public = make_project(db, user["id"], is_public=True)
    private = make_project(db, user["id"], is_public=False)

    stranger = make_client()
    login(stranger, "stranger@uni.edu")
    assert stranger.patch(f"/projects/{public.id}", json={"title": "X"}).status_code == 403
    assert stranger.patch(f"/projects/{private.id}", json={"title": "X"}).status_code == 404

    response = client.patch(f"/projects/{public.id}", json={"title": "Renamed"})
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"

    toggled = client.patch(f"/projects/{public.id}", json={"is_public": False})
    assert toggled.json()["is_public"] is False


def test_content_validation(db, owner):
    client, user = owner
    project = make_project(db, user["id"], is_public=True)
    own_file = full_upload(client, project.id, b"img", kind="media")
    other_project = make_project(db, user["id"], is_public=True)
    foreign_file = full_upload(client, other_project.id, b"img2", kind="media")

    url = f"/projects/{project.id}"
    good = doc(
        {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Build"}]},
        para("hello", marks=[{"type": "bold"}]),
        media(own_file["id"]),
        para("link", marks=[{"type": "link", "attrs": {"href": "https://uni.edu"}}]),
    )
    assert client.patch(url, json={"content": good}).status_code == 200

    assert client.patch(url, json={"content": doc(media(foreign_file["id"]))}).status_code == 400
    assert client.patch(url, json={"content": doc({"type": "iframe"})}).status_code == 400
    assert client.patch(url, json={"content": {"type": "paragraph"}}).status_code == 400
    bad_link = doc(para("x", marks=[{"type": "link", "attrs": {"href": "javascript:alert(1)"}}]))
    assert client.patch(url, json={"content": bad_link}).status_code == 400
    bad_media = doc({"type": "media", "attrs": {"fileId": "not-a-uuid"}})
    assert client.patch(url, json={"content": bad_media}).status_code == 400


def test_cover_must_be_own_ready_file(db, owner):
    client, user = owner
    project = make_project(db, user["id"], is_public=True)
    other_project = make_project(db, user["id"], is_public=True)
    own_file = full_upload(client, project.id, b"cover", kind="media")
    foreign_file = full_upload(client, other_project.id, b"x", kind="media")

    url = f"/projects/{project.id}"
    assert client.patch(url, json={"cover_file_id": own_file["id"]}).status_code == 200
    assert client.patch(url, json={"cover_file_id": foreign_file["id"]}).status_code == 400
    assert client.patch(url, json={"cover_file_id": str(uuid.uuid4())}).status_code == 400


def test_delete_purges_objects_then_rows(db, owner):
    client, user = owner
    project = make_project(db, user["id"], is_public=False)
    project_id = project.id
    ready = full_upload(client, project_id, b"purge")
    object_key = db.get(File, uuid.UUID(ready["id"])).object_key

    stranger = make_client()
    login(stranger, "stranger@uni.edu")
    assert stranger.delete(f"/projects/{project_id}").status_code == 404

    assert client.delete(f"/projects/{project_id}").status_code == 200
    db.expunge_all()
    assert db.get(Project, project_id) is None
    assert db.get(File, uuid.UUID(ready["id"])) is None
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(object_key)


def _covered_public(db, client, user, title: str, pinned: bool = False) -> Project:
    project = make_project(db, user["id"], is_public=True, title=title)
    cover = full_upload(client, project.id, b"img", kind="media")
    client.patch(f"/projects/{project.id}", json={"cover_file_id": cover["id"]})
    if pinned:
        db.get(Project, project.id).slider_pinned = True
        db.commit()
    db.expire_all()
    return project


def test_slider_pins_first_excludes_private_and_coverless(db, owner, monkeypatch):
    client, user = owner
    monkeypatch.setattr(settings, "slider_size", 3)

    pinned = _covered_public(db, client, user, "Pinned", pinned=True)
    _covered_public(db, client, user, "Fill A")
    _covered_public(db, client, user, "Fill B")
    _covered_public(db, client, user, "Fill C")
    make_project(db, user["id"], is_public=True, title="No Cover")
    hidden_pin = make_project(db, user["id"], is_public=False, title="Private Pin")
    hidden_pin.slider_pinned = True
    db.commit()

    feed = make_client().get("/projects/slider").json()
    assert len(feed) == 3
    assert feed[0]["id"] == str(pinned.id)
    titles = {item["title"] for item in feed}
    assert "No Cover" not in titles and "Private Pin" not in titles


def test_featured_ordered_public_only(db, owner):
    client, user = owner
    first = make_project(db, user["id"], is_public=True, title="First")
    second = make_project(db, user["id"], is_public=True, title="Second")
    hidden = make_project(db, user["id"], is_public=False, title="Hidden")
    first.featured_rank = 0
    second.featured_rank = 1
    hidden.featured_rank = 2
    db.commit()

    feed = make_client().get("/projects/featured").json()
    assert [item["title"] for item in feed] == ["First", "Second"]
