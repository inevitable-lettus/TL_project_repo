from datetime import date, timedelta

import pytest

from backend.app import machines
from backend.app.config import settings
from backend.tests.helpers import login, make_client

CSV = """slug,name,category,status,training_required,notes
laser-cutter,Success Laser Cutter,Digital Fabrication,available,yes,
"""

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture(autouse=True)
def machines_sheet(monkeypatch):
    monkeypatch.setattr(settings, "machines_sheet_csv_url", "http://sheet.test/csv")
    monkeypatch.setattr(machines, "fetch_sheet_csv", lambda: CSV)
    machines.invalidate_cache()
    yield
    machines.invalidate_cache()


@pytest.fixture
def student():
    client = make_client()
    user = login(client, "maker@uni.edu", "Maker")
    return client, user


@pytest.fixture
def staff():
    client = make_client()
    user = login(client, "staff@uni.edu", "Staff")
    return client, user


def book(client, start="10:00", end="11:00", **overrides):
    body = {
        "machine_slug": "laser-cutter",
        "date": TOMORROW,
        "start_time": start,
        "end_time": end,
        "purpose": "acrylic case",
        **overrides,
    }
    return client.post("/bookings", json=body)


def test_rules_reflect_env():
    rules = make_client().get("/bookings/rules").json()
    assert rules == {
        "slot_minutes": settings.booking_slot_minutes,
        "max_minutes": settings.booking_max_minutes,
        "advance_days": settings.booking_advance_days,
        "lab_open": "09:00:00",
        "lab_close": "18:00:00",
    }


def test_create_requires_auth_and_known_machine(student):
    client, _ = student
    assert book(make_client()).status_code == 401
    assert book(client, machine_slug="ghost").status_code == 400

    response = book(client)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending"

    mine = client.get("/bookings/mine").json()
    assert [b["id"] for b in mine] == [body["id"]]

    # Anonymous slot feed shows busy times, no identities.
    day = (
        make_client().get(f"/bookings/day?machine=laser-cutter&date={TOMORROW}").json()
    )
    assert day == [{"start_time": "10:00:00", "end_time": "11:00:00"}]


def test_window_and_slot_rules(student):
    client, _ = student
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    too_far = (
        date.today() + timedelta(days=settings.booking_advance_days + 1)
    ).isoformat()

    assert book(client, date=yesterday).status_code == 400
    assert book(client, date=too_far).status_code == 400
    assert book(client, start="08:00", end="09:00").status_code == 400  # early
    assert book(client, start="17:00", end="19:00").status_code == 400  # late
    assert book(client, start="10:30", end="11:30").status_code == 400  # misaligned
    assert book(client, start="11:00", end="10:00").status_code == 400  # reversed
    assert book(client, start="09:00", end="14:00").status_code == 400  # > 4h


def test_overlap_conflicts(student):
    client, _ = student
    assert book(client, start="10:00", end="12:00").status_code == 200
    assert book(client, start="11:00", end="13:00").status_code == 409
    assert book(client, start="12:00", end="13:00").status_code == 200  # adjacent


def test_cancel_frees_the_slot(student):
    client, _ = student
    booking = book(client).json()

    stranger = make_client()
    login(stranger, "other@uni.edu")
    assert stranger.post(f"/bookings/{booking['id']}/cancel").status_code == 404

    cancelled = client.post(f"/bookings/{booking['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert client.post(f"/bookings/{booking['id']}/cancel").status_code == 400

    assert book(client).status_code == 200  # slot is free again


def test_admin_decisions(student, staff):
    student_client, _ = student
    staff_client, _ = staff

    first = book(student_client, start="10:00", end="12:00").json()
    second = book(student_client, start="13:00", end="14:00").json()
    # Overlapping pending from someone else, racing for the same slot.
    rival = make_client()
    login(rival, "rival@uni.edu")
    # Overlap is checked at create; simulate the race by approving after a
    # conflicting approval instead.

    assert student_client.get("/admin/bookings").status_code == 403

    pending = staff_client.get("/admin/bookings?status=pending").json()
    assert {b["id"] for b in pending} == {first["id"], second["id"]}
    assert pending[0]["user_email"] == "maker@uni.edu"

    approved = staff_client.patch(
        f"/admin/bookings/{first['id']}", json={"status": "approved"}
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    rejected = staff_client.patch(
        f"/admin/bookings/{second['id']}", json={"status": "rejected"}
    )
    assert rejected.json()["status"] == "rejected"
    assert (
        staff_client.patch(
            f"/admin/bookings/{second['id']}", json={"status": "approved"}
        ).status_code
        == 400
    )  # rejected is final


def test_approving_second_overlapping_pending_conflicts(student, staff, db):
    from backend.app.models import Booking

    student_client, user = student
    staff_client, _ = staff

    first = book(student_client, start="10:00", end="12:00").json()
    # A second overlapping pending can't be created via the API (409), so
    # write it directly — approve must still catch the clash.
    rogue = Booking(
        user_id=user["id"],
        machine_slug="laser-cutter",
        date=date.fromisoformat(TOMORROW),
        start_time="11:00",
        end_time="13:00",
        purpose="clash",
    )
    db.add(rogue)
    db.commit()

    assert (
        staff_client.patch(
            f"/admin/bookings/{first['id']}", json={"status": "approved"}
        ).status_code
        == 200
    )
    assert (
        staff_client.patch(
            f"/admin/bookings/{rogue.id}", json={"status": "approved"}
        ).status_code
        == 409
    )
