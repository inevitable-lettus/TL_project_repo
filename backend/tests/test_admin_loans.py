import csv
import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from backend.app import loans
from backend.app.main import app
from backend.app.models import Loan, LoanPhoto
from backend.tests.helpers import make_client, make_project
from backend.tests.test_loans import (
    borrow,
    loan_photo,
    material,
    return_loan,
    signed_in,
)


@pytest.fixture
def student():
    return signed_in("asha@uni.edu")


@pytest.fixture
def other():
    return signed_in("ravi@uni.edu", "Ravi Shah")


@pytest.fixture
def staff():
    client, user = signed_in("staff@uni.edu", "Staff Member")
    return client, user


def set_loan(db, loan_id: str, **values) -> None:
    db.execute(update(Loan).where(Loan.id == uuid.UUID(loan_id)).values(**values))
    db.commit()


def loan_ids(response) -> list[str]:
    assert response.status_code == 200
    return [item["id"] for item in response.json()["items"]]


def open_loan(client, **overrides) -> str:
    response = borrow(client, **overrides)
    assert response.status_code == 201
    return response.json()["id"]


def make_overdue(db, client) -> str:
    loan_id = open_loan(client, item_name="Late drill")
    set_loan(db, loan_id, due_date=loans.lab_today() - timedelta(days=1))
    return loan_id


def csv_rows(response) -> list[list[str]]:
    assert response.text.startswith("﻿")
    return list(csv.reader(io.StringIO(response.text.lstrip("﻿"))))


ADMIN_ROUTES = [
    ("get", "/admin/loans"),
    ("get", "/admin/loans/export.csv"),
    ("post", f"/admin/loans/{uuid.uuid4()}/return"),
]


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
def test_signed_out_gets_401(method, path):
    assert getattr(make_client(), method)(path).status_code == 401


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
def test_student_gets_403(student, method, path):
    client, _ = student
    assert getattr(client, method)(path).status_code == 403


def test_no_edit_or_delete_routes_for_loans():
    for route in app.routes:
        if "/loans" in getattr(route, "path", ""):
            assert not set(route.methods) & {"PUT", "PATCH", "DELETE"}, route.path


def test_row_carries_borrower_project_and_photos(db, student, staff):
    client, user = student
    project = make_project(db, user["id"], title="Line follower")
    loan_id = open_loan(
        client,
        project_id=str(project.id),
        photo_file_ids=[loan_photo(client), loan_photo(client)],
    )
    response = staff[0].get("/admin/loans")
    assert response.json()["total"] == 1
    row = response.json()["items"][0]
    assert row["id"] == loan_id
    assert row["borrower"] == {
        "id": user["id"],
        "name": "Asha Rao",
        "email": "asha@uni.edu",
    }
    assert row["project"]["title"] == "Line follower"
    assert [(p["stage"], p["position"]) for p in row["photos"]] == [
        ("borrow", 0),
        ("borrow", 1),
    ]
    assert row["returned_by"] is None
    assert row["status"] == "out"


def test_status_filter_per_status(db, student, staff):
    client, _ = student
    out = open_loan(client, item_name="Soldering iron")
    overdue = make_overdue(db, client)
    returned = open_loan(client, item_name="Multimeter")
    assert return_loan(client, returned).status_code == 200
    used = material(client).json()["id"]

    expected = {"out": out, "overdue": overdue, "returned": returned, "used": used}
    for status, loan_id in expected.items():
        assert loan_ids(staff[0].get("/admin/loans", params={"status": status})) == [
            loan_id
        ]
    assert staff[0].get("/admin/loans", params={"status": "bogus"}).status_code == 422


def test_overdue_uses_lab_timezone_today(db, student, staff):
    client, _ = student
    due_today = open_loan(client)
    set_loan(db, due_today, due_date=loans.lab_today())
    assert loan_ids(staff[0].get("/admin/loans", params={"status": "overdue"})) == []
    assert loan_ids(staff[0].get("/admin/loans", params={"status": "out"})) == [
        due_today
    ]


def test_type_filter(student, staff):
    client, _ = student
    equipment = open_loan(client)
    used = material(client).json()["id"]
    assert loan_ids(staff[0].get("/admin/loans", params={"type": "equipment"})) == [
        equipment
    ]
    assert loan_ids(staff[0].get("/admin/loans", params={"type": "material"})) == [used]


def test_q_matches_item_borrower_name_and_email(student, other, staff):
    asha, _ = student
    ravi, _ = other
    drill = open_loan(asha, item_name="Cordless drill")
    saw = open_loan(ravi, item_name="Jigsaw")
    search = {
        "drill": [drill],
        "RAVI": [saw],
        "asha rao": [drill],
        "ravi@uni": [saw],
        "nothing": [],
    }
    for q, expected in search.items():
        assert loan_ids(staff[0].get("/admin/loans", params={"q": q})) == expected


def test_q_wildcards_are_literal(student, staff):
    client, _ = student
    open_loan(client)
    assert loan_ids(staff[0].get("/admin/loans", params={"q": "%"})) == []
    assert loan_ids(staff[0].get("/admin/loans", params={"q": "_"})) == []


def test_date_range_bounds_follow_lab_timezone(db, student, staff):
    client, _ = student
    before = open_loan(client)
    first = open_loan(client)
    last = open_loan(client)
    after = open_loan(client)
    tz = loans.ZoneInfo(loans.settings.lab_timezone)
    day = datetime(2026, 3, 10, tzinfo=tz)
    set_loan(db, before, borrowed_at=day - timedelta(seconds=1))
    set_loan(db, first, borrowed_at=day)
    set_loan(db, last, borrowed_at=day + timedelta(days=1) - timedelta(seconds=1))
    set_loan(db, after, borrowed_at=day + timedelta(days=1))

    def ids(**params):
        return set(loan_ids(staff[0].get("/admin/loans", params=params)))

    assert ids(**{"from": "2026-03-10", "to": "2026-03-10"}) == {first, last}
    assert ids(**{"from": "2026-03-11"}) == {after}
    assert ids(to="2026-03-09") == {before}


def test_filters_combine(db, student, other, staff):
    asha, _ = student
    ravi, _ = other
    open_loan(asha, item_name="Drill")
    late_drill = open_loan(ravi, item_name="Drill press")
    set_loan(db, late_drill, due_date=loans.lab_today() - timedelta(days=2))
    material(ravi, item_name="Drill bits")
    params = {"status": "overdue", "type": "equipment", "q": "ravi"}
    assert loan_ids(staff[0].get("/admin/loans", params=params)) == [late_drill]


def test_pagination_is_stable_with_equal_timestamps(db, student, staff):
    client, _ = student
    created = [open_loan(client) for _ in range(5)]
    for loan_id in created:
        set_loan(db, loan_id, borrowed_at=datetime(2026, 3, 10, tzinfo=UTC))

    pages = [
        staff[0].get("/admin/loans", params={"limit": 2, "offset": offset}).json()
        for offset in (0, 2, 4)
    ]
    assert {page["total"] for page in pages} == {5}
    seen = [item["id"] for page in pages for item in page["items"]]
    assert sorted(seen) == sorted(created)
    assert len(seen) == len(set(seen))


def test_staff_marks_loan_returned_without_photo(db, student, staff):
    client, _ = student
    staff_client, staff_user = staff
    loan_id = open_loan(client)
    response = staff_client.post(f"/admin/loans/{loan_id}/return", json={})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "returned"
    assert body["returned_by_id"] == staff_user["id"]
    assert body["return_photo_id"] is None
    assert body["return_note"] is None


def test_staff_return_with_photo_and_note(db, student, staff):
    client, _ = student
    staff_client, _ = staff
    loan_id = open_loan(client)
    photo_id = loan_photo(staff_client)
    response = staff_client.post(
        f"/admin/loans/{loan_id}/return",
        json={"photo_file_id": photo_id, "note": "Forgot to log it"},
    )
    assert response.status_code == 200
    assert response.json()["return_photo_id"] == photo_id
    assert response.json()["return_note"] == "Forgot to log it"
    link = db.get(LoanPhoto, uuid.UUID(photo_id))
    assert (str(link.loan_id), link.stage) == (loan_id, "return")


def test_staff_return_rejects_someone_elses_photo(student, staff):
    client, _ = student
    loan_id = open_loan(client)
    response = staff[0].post(
        f"/admin/loans/{loan_id}/return", json={"photo_file_id": loan_photo(client)}
    )
    assert response.status_code == 400


def test_staff_return_errors(student, staff):
    client, _ = student
    staff_client, _ = staff
    unknown = staff_client.post(f"/admin/loans/{uuid.uuid4()}/return", json={})
    assert unknown.status_code == 404

    used = material(client).json()["id"]
    assert staff_client.post(f"/admin/loans/{used}/return", json={}).status_code == 400

    loan_id = open_loan(client)
    assert (
        staff_client.post(f"/admin/loans/{loan_id}/return", json={}).status_code == 200
    )
    again = staff_client.post(f"/admin/loans/{loan_id}/return", json={})
    assert again.status_code == 409


def test_borrower_return_is_unchanged_by_staff_route(student, other):
    client, _ = student
    loan_id = open_loan(client)
    assert return_loan(other[0], loan_id).status_code == 404


def test_csv_neutralises_formula_cells(student, staff):
    client, _ = student
    for index, start in enumerate("=+-@"):
        open_loan(client, item_name=f"{start}1+1", description=f"{start}cmd {index}")
    response = staff[0].get("/admin/loans/export.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith("attachment;")
    header, *rows = csv_rows(response)
    item, description = header.index("Item"), header.index("Description")
    assert sorted(row[item] for row in rows) == sorted(
        f"'{start}1+1" for start in "=+-@"
    )
    assert all(row[description].startswith("'") for row in rows)


def test_csv_has_staff_gated_photo_links_never_presigned(db, student, staff):
    client, _ = student
    loan_id = open_loan(client, photo_file_ids=[loan_photo(client), loan_photo(client)])
    assert return_loan(client, loan_id).status_code == 200
    header, row = csv_rows(staff[0].get("/admin/loans/export.csv"))
    borrow_links = row[header.index("Borrow photos")].split(" ")
    return_link = row[header.index("Return photo")]
    base = "http://localhost/loans/photo/"
    assert len(borrow_links) == 2
    assert all(link.startswith(base) for link in [*borrow_links, return_link])
    assert "X-Amz" not in "".join(row)
    assert row[header.index("Status")] == "returned"
    assert row[header.index("Returned by")] == "Asha Rao"


def test_csv_honours_filters_and_has_no_pagination(student, staff):
    client, _ = student
    equipment = open_loan(client, item_name="Drill")
    for _ in range(3):
        material(client)
    _, *rows = csv_rows(staff[0].get("/admin/loans/export.csv", params={"limit": 1}))
    assert len(rows) == 4
    _, *rows = csv_rows(
        staff[0].get("/admin/loans/export.csv", params={"type": "equipment"})
    )
    assert [row[4] for row in rows] == ["Drill"]
    assert equipment


@pytest.mark.parametrize("lead", ["\t", "\r"])
def test_csv_neutralises_leading_tab_and_cr(db, student, staff, lead):
    client, _ = student
    # The API strips input, so a leading control character can only come from the DB.
    loan_id = open_loan(client)
    set_loan(db, loan_id, item_name=f"{lead}=1+1")
    header, row = csv_rows(staff[0].get("/admin/loans/export.csv"))
    assert row[header.index("Item")] == f"'{lead}=1+1"
