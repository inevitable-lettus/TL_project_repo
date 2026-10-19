import uuid
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from backend.app import loans
from backend.app.config import settings
from backend.app.models import Loan, LoanPhoto, User
from backend.tests.helpers import login, make_client, make_project, upload_bytes


def signed_in(email: str, name: str = "Asha Rao"):
    client = make_client()
    user = login(client, email, name)
    return client, user


@pytest.fixture
def student():
    return signed_in("asha@uni.edu")


@pytest.fixture
def other():
    return signed_in("ravi@uni.edu", "Ravi Shah")


def upload_image(client, route: str, data: bytes = b"jpeg", confirm=True) -> str:
    slot = client.post(
        route, json={"filename": "p.jpg", "size": len(data), "mime_type": "image/jpeg"}
    ).json()
    assert upload_bytes(slot, data).status_code == 204
    if confirm:
        assert client.post(f"/files/{slot['file']['id']}/confirm").status_code == 200
    return slot["file"]["id"]


def loan_photo(client) -> str:
    return upload_image(client, "/loans/photo")


def in_days(days: int) -> str:
    return (loans.lab_today() + timedelta(days=days)).isoformat()


def loan_body(client, **overrides) -> dict:
    body = {
        "id": str(uuid.uuid4()),
        "type": "equipment",
        "item_name": "Arduino Uno",
        "description": "Line-follower build",
        "quantity": 2,
        "unit": "pcs",
        "due_date": in_days(7),
        "photo_file_ids": [loan_photo(client)],
    }
    body.update(overrides)
    return body


def borrow(client, **overrides) -> httpx.Response:
    return client.post("/loans", json=loan_body(client, **overrides))


def material(client, **overrides) -> httpx.Response:
    overrides = {"type": "material", "due_date": None, "unit": "g", **overrides}
    return borrow(client, **overrides)


def return_loan(client, loan_id: str, **body) -> httpx.Response:
    body = {"photo_file_id": loan_photo(client), **body}
    return client.post(f"/loans/{loan_id}/return", json=body)


def test_endpoints_require_login():
    anon = make_client()
    loan_id = uuid.uuid4()
    assert anon.get("/loans/rules").status_code == 401
    assert anon.get("/loans/mine").status_code == 401
    assert anon.post("/loans", json={}).status_code == 401
    assert anon.post(f"/loans/{loan_id}/return", json={}).status_code == 401


def test_rules_come_from_settings(monkeypatch, student):
    client, _ = student
    monkeypatch.setattr(settings, "loan_max_days", 14)
    monkeypatch.setattr(settings, "loan_max_photos", 3)
    assert client.get("/loans/rules").json() == {
        "max_days": 14,
        "max_photos": 3,
        "units": ["pcs", "m", "g", "kg", "sheets", "ml", "l"],
    }


def test_equipment_with_two_photos_and_project_shows_in_mine(db, student):
    # Done 1 (API half).
    client, user = student
    project = make_project(db, user["id"], title="Line Follower")
    photos = [loan_photo(client), loan_photo(client)]
    created = borrow(client, project_id=str(project.id), photo_file_ids=photos)
    assert created.status_code == 201

    [loan] = client.get("/loans/mine").json()
    assert loan["id"] == created.json()["id"]
    assert loan["status"] == "out"
    assert loan["borrow_photo_ids"] == photos
    assert loan["project"] == {"id": str(project.id), "title": "Line Follower"}
    assert loan["return_photo_id"] is None


def test_borrower_comes_from_session(db, student):
    client, user = student
    loan_id = borrow(client).json()["id"]
    assert str(db.get(Loan, uuid.UUID(loan_id)).borrower_id) == user["id"]


def test_unknown_fields_are_rejected(student):
    client, _ = student
    body = loan_body(client, borrower_id=str(uuid.uuid4()))
    assert client.post("/loans", json=body).status_code == 422


def test_material_has_no_return_date_and_is_used(db, student):
    # Done 2.
    client, _ = student
    created = material(client)
    assert created.status_code == 201
    loan = created.json()
    assert loan["due_date"] is None
    assert loan["status"] == "used"
    assert db.get(Loan, uuid.UUID(loan["id"])).due_date is None

    response = return_loan(client, loan["id"])
    assert response.status_code == 400


def test_material_with_return_date_is_refused(student):
    client, _ = student
    assert material(client, due_date=in_days(3)).status_code == 400


def test_equipment_without_return_date_is_refused(student):
    client, _ = student
    assert borrow(client, due_date=None).status_code == 400


@pytest.mark.parametrize(
    "overrides",
    [
        {"quantity": 0},
        {"quantity": 100000},
        {"unit": "boxes"},
        {"type": "tool"},
        {"item_name": "   "},
        {"description": ""},
        {"item_name": "x" * 121},
    ],
)
def test_bad_fields_are_rejected(student, overrides):
    client, _ = student
    assert borrow(client, **overrides).status_code == 422


def test_unit_defaults_to_pcs(student):
    client, _ = student
    body = loan_body(client)
    del body["unit"]
    assert client.post("/loans", json=body).json()["unit"] == "pcs"


def test_due_date_window(monkeypatch, student):
    client, _ = student
    monkeypatch.setattr(settings, "loan_max_days", 10)
    assert borrow(client, due_date=in_days(-1)).status_code == 400
    assert borrow(client, due_date=in_days(11)).status_code == 400
    assert borrow(client, due_date=in_days(0)).status_code == 201
    assert borrow(client, due_date=in_days(10)).status_code == 201


def test_return_with_photo(student):
    # Done 3.
    client, user = student
    loan_id = borrow(client).json()["id"]
    photo = loan_photo(client)
    response = return_loan(client, loan_id, photo_file_id=photo, note="All good")
    assert response.status_code == 200
    loan = response.json()
    assert loan["status"] == "returned"
    assert loan["returned_by_id"] == user["id"]
    assert loan["return_photo_id"] == photo
    assert loan["return_note"] == "All good"
    assert loan["returned_at"] is not None


def test_return_twice_is_409(student):
    client, _ = student
    loan_id = borrow(client).json()["id"]
    assert return_loan(client, loan_id).status_code == 200
    assert return_loan(client, loan_id).status_code == 409


def test_return_needs_a_photo(student):
    client, _ = student
    loan_id = borrow(client).json()["id"]
    assert client.post(f"/loans/{loan_id}/return", json={}).status_code == 422


def test_other_student_gets_404_on_loan_and_photo(student, other):
    # Done 7.
    client, _ = student
    stranger, _ = other
    photo = loan_photo(client)
    loan_id = borrow(client, photo_file_ids=[photo]).json()["id"]

    assert return_loan(stranger, loan_id).status_code == 404
    assert return_loan(stranger, str(uuid.uuid4())).status_code == 404
    assert stranger.get(f"/files/{photo}/download-url").status_code == 404
    assert stranger.get("/loans/mine").json() == []


def test_same_id_twice_is_one_row_and_same_201(db, student, other):
    # Done 8.
    client, _ = student
    body = loan_body(client)
    first = client.post("/loans", json=body)
    second = client.post("/loans", json=body)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert db.scalar(select(func.count()).select_from(Loan)) == 1

    stranger, _ = other
    reuse = loan_body(stranger, id=body["id"])
    assert stranger.post("/loans", json=reuse).status_code == 409


def test_cannot_link_someone_elses_project(db, student, other):
    # Done 9, first half.
    client, _ = student
    _, stranger = other
    project = make_project(db, stranger["id"])
    assert borrow(client, project_id=str(project.id)).status_code == 400
    assert borrow(client, project_id=str(uuid.uuid4())).status_code == 400


def test_deleting_linked_project_keeps_loan(db, student):
    # Done 9, second half.
    client, user = student
    project = make_project(db, user["id"])
    loan_id = borrow(client, project_id=str(project.id)).json()["id"]
    assert client.delete(f"/projects/{project.id}").status_code == 200

    [loan] = client.get("/loans/mine").json()
    assert loan["id"] == loan_id
    assert loan["project"] is None


def test_photo_count_limits(monkeypatch, student):
    # Done 10.
    client, _ = student
    monkeypatch.setattr(settings, "loan_max_photos", 2)
    assert borrow(client, photo_file_ids=[]).status_code == 400
    too_many = [loan_photo(client) for _ in range(3)]
    assert borrow(client, photo_file_ids=too_many).status_code == 400
    assert borrow(client, photo_file_ids=too_many[:2]).status_code == 201


def test_same_photo_twice_is_refused(student):
    client, _ = student
    photo = loan_photo(client)
    assert borrow(client, photo_file_ids=[photo, photo]).status_code == 400


def test_photo_must_be_ready(student):
    client, _ = student
    pending = upload_image(client, "/loans/photo", confirm=False)
    assert borrow(client, photo_file_ids=[pending]).status_code == 400


def test_photo_must_be_a_loan_photo(student):
    client, _ = student
    avatar = upload_image(client, "/users/me/avatar")
    assert borrow(client, photo_file_ids=[avatar]).status_code == 400


def test_photo_must_be_owned(student, other):
    client, _ = student
    stranger, _ = other
    theirs = loan_photo(stranger)
    assert borrow(client, photo_file_ids=[theirs]).status_code == 400
    assert (
        return_loan(
            client, borrow(client).json()["id"], photo_file_id=theirs
        ).status_code
        == 400
    )


def test_photo_already_linked_is_refused(student):
    client, _ = student
    photo = loan_photo(client)
    assert borrow(client, photo_file_ids=[photo]).status_code == 201
    assert borrow(client, photo_file_ids=[photo]).status_code == 400
    loan_id = borrow(client).json()["id"]
    assert return_loan(client, loan_id, photo_file_id=photo).status_code == 400


def test_staff_deleting_a_loan_photo_unlinks_it(db, student):
    client, _ = student
    photo = loan_photo(client)
    loan_id = borrow(client, photo_file_ids=[photo, loan_photo(client)]).json()["id"]
    staff = make_client()
    login(staff, "staff@uni.edu", "Staff")
    assert staff.delete(f"/files/{photo}").status_code == 200

    [loan] = client.get("/loans/mine").json()
    assert loan["id"] == loan_id
    assert photo not in loan["borrow_photo_ids"]


def test_mine_orders_open_equipment_by_due_then_newest(student, other):
    client, _ = student
    later = borrow(client, due_date=in_days(9)).json()["id"]
    used = material(client).json()["id"]
    sooner = borrow(client, due_date=in_days(2)).json()["id"]
    returned = borrow(client, due_date=in_days(1)).json()["id"]
    assert return_loan(client, returned).status_code == 200
    stranger, _ = other
    borrow(stranger)

    ids = [loan["id"] for loan in client.get("/loans/mine").json()]
    assert ids == [sooner, later, returned, used]


def make_loan(**fields) -> Loan:
    return Loan(type="equipment", due_date=date(2026, 3, 1), returned_at=None, **fields)


def test_status_for_each_state():
    today = date(2026, 3, 2)
    assert loans.loan_status(make_loan(), today) == "overdue"
    assert loans.loan_status(make_loan(), date(2026, 3, 1)) == "out"
    returned = make_loan()
    returned.returned_at = datetime(2026, 3, 1, tzinfo=UTC)
    assert loans.loan_status(returned, today) == "returned"
    used = Loan(type="material", due_date=None, returned_at=None)
    assert loans.loan_status(used, today) == "used"


class FrozenClock(datetime):
    instant = datetime(2026, 3, 1, 20, 0, tzinfo=UTC)  # 01:30 on 2 Mar in IST

    @classmethod
    def now(cls, tz=None):
        return cls.instant.astimezone(tz)


@pytest.mark.parametrize(
    ("zone", "today", "status"),
    [("UTC", date(2026, 3, 1), "out"), ("Asia/Kolkata", date(2026, 3, 2), "overdue")],
)
def test_today_follows_lab_timezone(monkeypatch, zone, today, status):
    monkeypatch.setattr(loans, "datetime", FrozenClock)
    monkeypatch.setattr(settings, "lab_timezone", zone)
    assert loans.lab_today() == today
    assert loans.loan_status(make_loan(), loans.lab_today()) == status


def add_raw_loan(db, user_id: str, **fields) -> None:
    values = {
        "id": uuid.uuid4(),
        "borrower_id": uuid.UUID(user_id),
        "type": "equipment",
        "item_name": "Drill",
        "description": "Holes",
        "quantity": 1,
        "unit": "pcs",
        "due_date": date(2026, 3, 1),
        **fields,
    }
    db.add(Loan(**values))
    db.commit()


@pytest.mark.parametrize(
    "fields",
    [
        {"due_date": None},
        {"type": "material"},
        {"type": "material", "due_date": None, "returned_at": datetime.now(UTC)},
        {"unit": "boxes"},
        {"quantity": 0},
    ],
)
def test_check_constraints(db, student, fields):
    _, user = student
    with pytest.raises(IntegrityError):
        add_raw_loan(db, user["id"], **fields)
    db.rollback()


def test_loan_photo_stage_is_constrained(db, student):
    client, user = student
    loan_id = uuid.UUID(borrow(client).json()["id"])
    photo = uuid.UUID(loan_photo(client))
    db.add(LoanPhoto(file_id=photo, loan_id=loan_id, stage="later", position=0))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_users_with_loans_cannot_be_deleted(db, student):
    client, user = student
    borrow(client)
    db.delete(db.get(User, uuid.UUID(user["id"])))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
