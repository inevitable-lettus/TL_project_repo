from datetime import date, timedelta

import pytest

from backend.app import emails
from backend.app.config import settings
from backend.tests.helpers import login, make_client

DUE = (date.today() + timedelta(days=7)).isoformat()


@pytest.fixture
def student():
    client = make_client()
    user = login(client, "borrower@uni.edu", "Borrower")
    return client, user


@pytest.fixture
def staff():
    client = make_client()
    user = login(client, "staff@uni.edu", "Staff")
    return client, user


def checkout(client, **overrides):
    body = {
        "category": "Hand Tools",
        "tool_name": "Torque wrench",
        "quantity": 1,
        "due_date": DUE,
        **overrides,
    }
    return client.post("/checkouts", json=body)


def test_checkout_lifecycle(student, staff):
    client, _ = student
    staff_client, _ = staff

    assert checkout(make_client()).status_code == 401
    assert checkout(client, category="Time Machines").status_code == 400
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    assert checkout(client, due_date=yesterday).status_code == 400

    created = checkout(client)
    assert created.status_code == 200
    checkout_id = created.json()["id"]
    assert created.json()["status"] == "out"

    mine = client.get("/checkouts/mine").json()
    assert [c["id"] for c in mine] == [checkout_id]

    stranger = make_client()
    login(stranger, "stranger@uni.edu")
    assert stranger.post(f"/checkouts/{checkout_id}/return").status_code == 404

    returned = client.post(f"/checkouts/{checkout_id}/return")
    assert returned.status_code == 200
    assert returned.json()["status"] == "returned"
    assert returned.json()["returned_at"] is not None
    assert client.post(f"/checkouts/{checkout_id}/return").status_code == 400

    # staff view: returned filter finds it, default "out" does not
    assert staff_client.get("/admin/checkouts").json() == []
    listed = staff_client.get("/admin/checkouts?status=returned").json()
    assert listed[0]["user_email"] == "borrower@uni.edu"
    assert listed[0]["overdue"] is False


def test_admin_checkouts_flags_overdue(student, staff, db):
    from backend.app.models import Checkout

    client, user = student
    staff_client, _ = staff
    assert client.get("/admin/checkouts").status_code == 403

    checkout(client)
    overdue = Checkout(
        user_id=user["id"],
        category="Hand Tools",
        tool_name="Missing pliers",
        quantity=1,
        due_date=date.today() - timedelta(days=3),
    )
    db.add(overdue)
    db.commit()

    listed = staff_client.get("/admin/checkouts").json()
    flags = {c["tool_name"]: c["overdue"] for c in listed}
    assert flags == {"Missing pliers": True, "Torque wrench": False}


def test_categories_come_from_env():
    assert (
        make_client().get("/checkouts/categories").json()
        == settings.tool_category_list
    )


def test_issue_report_and_admin_triage(student, staff, monkeypatch):
    client, _ = student
    staff_client, _ = staff

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        # admin.py imports send_email at module load; patch the shared impl.
        emails,
        "send_email",
        lambda to, subject, body: sent.append((to, subject)),
    )
    from backend.app import issues as issues_module

    monkeypatch.setattr(
        issues_module, "send_email", lambda to, subject, body: sent.append((to, subject))
    )

    anon = make_client()
    assert anon.post(
        "/issues",
        json={"type": "safety", "severity": "urgent", "description": "sparks"},
    ).status_code == 401

    ok = client.post(
        "/issues",
        json={
            "machine_slug": "laser-cutter",
            "type": "equipment",
            "severity": "low",
            "description": "lens needs cleaning",
        },
    )
    assert ok.status_code == 200
    assert sent == []  # only urgent notifies

    urgent = client.post(
        "/issues",
        json={"type": "safety", "severity": "urgent", "description": "sparks!"},
    )
    assert urgent.status_code == 200
    assert [to for to, _ in sent] == ["staff@uni.edu"]

    assert client.get("/admin/issues").status_code == 403
    open_issues = staff_client.get("/admin/issues").json()
    assert len(open_issues) == 2
    assert open_issues[0]["reporter_email"] == "borrower@uni.edu"

    resolved = staff_client.patch(
        f"/admin/issues/{open_issues[0]['id']}", json={"status": "resolved"}
    )
    assert resolved.status_code == 200
    assert len(staff_client.get("/admin/issues").json()) == 1
    assert len(staff_client.get("/admin/issues?status=resolved").json()) == 1
