import uuid

import pytest

from backend.app.models import Project, User
from backend.tests.helpers import login, make_client, make_project


@pytest.fixture
def staff():
    client = make_client()
    user = login(client, "staff@uni.edu", "Staff")
    return client, user


@pytest.fixture
def student():
    client = make_client()
    user = login(client, "kid@uni.edu", "Kid")
    return client, user


def test_admin_routes_blocked_for_students_and_anon(student):
    client, _ = student
    assert client.get("/admin/users").status_code == 403
    assert client.put("/admin/featured", json={"project_ids": []}).status_code == 403
    assert make_client().get("/admin/users").status_code == 401


def test_list_and_search_users(staff, student):
    client, _ = staff
    everyone = client.get("/admin/users").json()
    assert {u["email"] for u in everyone} == {"staff@uni.edu", "kid@uni.edu"}
    found = client.get("/admin/users", params={"q": "kid"}).json()
    assert [u["email"] for u in found] == ["kid@uni.edu"]


def test_promote_and_demote(db, staff, student):
    client, _ = staff
    _, kid = student

    promoted = client.patch(f"/admin/users/{kid['id']}", json={"role": "staff"})
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "staff"

    demoted = client.patch(f"/admin/users/{kid['id']}", json={"role": "student"})
    assert demoted.json()["role"] == "student"

    assert client.patch(
        f"/admin/users/{uuid.uuid4()}", json={"role": "staff"}
    ).status_code == 404


def test_cannot_demote_self(staff):
    client, me = staff
    response = client.patch(f"/admin/users/{me['id']}", json={"role": "student"})
    assert response.status_code == 400


def test_set_featured_ranks_and_clears_previous(db, staff, student):
    client, _ = staff
    _, kid = student
    a = make_project(db, kid["id"], is_public=True, title="A")
    b = make_project(db, kid["id"], is_public=True, title="B")
    c = make_project(db, kid["id"], is_public=True, title="C")

    assert client.put(
        "/admin/featured", json={"project_ids": [str(b.id), str(a.id)]}
    ).status_code == 200
    db.expire_all()
    assert db.get(Project, b.id).featured_rank == 0
    assert db.get(Project, a.id).featured_rank == 1
    assert db.get(Project, c.id).featured_rank is None

    # replacing the list clears old ranks
    assert client.put(
        "/admin/featured", json={"project_ids": [str(c.id)]}
    ).status_code == 200
    db.expire_all()
    assert db.get(Project, c.id).featured_rank == 0
    assert db.get(Project, a.id).featured_rank is None


def test_featured_rejects_private_unknown_and_duplicates(db, staff, student):
    client, _ = staff
    _, kid = student
    private = make_project(db, kid["id"], is_public=False)
    public = make_project(db, kid["id"], is_public=True)

    assert client.put(
        "/admin/featured", json={"project_ids": [str(private.id)]}
    ).status_code == 400
    assert client.put(
        "/admin/featured", json={"project_ids": [str(uuid.uuid4())]}
    ).status_code == 404
    assert client.put(
        "/admin/featured", json={"project_ids": [str(public.id), str(public.id)]}
    ).status_code == 400


def test_slider_pin_toggle(db, staff, student):
    client, _ = staff
    _, kid = student
    public = make_project(db, kid["id"], is_public=True)
    private = make_project(db, kid["id"], is_public=False)

    assert client.patch(
        f"/admin/projects/{public.id}/slider", json={"pinned": True}
    ).json() == {"pinned": True}
    db.expire_all()
    assert db.get(Project, public.id).slider_pinned is True

    assert client.patch(
        f"/admin/projects/{private.id}/slider", json={"pinned": True}
    ).status_code == 400

    assert client.patch(
        f"/admin/projects/{public.id}/slider", json={"pinned": False}
    ).json() == {"pinned": False}


def test_moderation_list_includes_private_and_searches(db, staff, student):
    client, _ = staff
    student_client, kid = student
    make_project(db, kid["id"], is_public=True, title="Public Gizmo")
    make_project(db, kid["id"], is_public=False, title="Hidden Gizmo")

    page = client.get("/admin/projects").json()
    titles = {p["title"] for p in page["items"]}
    assert {"Public Gizmo", "Hidden Gizmo"} <= titles
    assert page["total"] >= 2

    by_owner = client.get("/admin/projects", params={"q": "Kid"}).json()
    assert {p["title"] for p in by_owner["items"]} == {
        "Public Gizmo",
        "Hidden Gizmo",
    }

    assert student_client.get("/admin/projects").status_code == 403
    assert make_client().get("/admin/projects").status_code == 401
