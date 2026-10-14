import logging
import uuid
from datetime import date, datetime, timedelta

import httpx
import pytest

from backend.app import loans
from backend.app.config import settings
from backend.tests.fake_sheet import FakeSheet
from backend.tests.helpers import login, make_client, upload_bytes

SECRET = "sheet-secret-for-tests"
SCRIPT_URL = "https://script.example/exec"
REAL_POST = httpx.post
REQUEST = httpx.Request("POST", SCRIPT_URL)


def route_script_calls(monkeypatch, answer) -> None:
    """Patch httpx.post (shared module) so only calls to the script URL are
    faked; MinIO uploads in the helpers still go through for real."""

    def post(url, **kwargs):
        if url != SCRIPT_URL:
            return REAL_POST(url, **kwargs)
        assert kwargs["follow_redirects"] is True
        return answer(kwargs["json"])

    monkeypatch.setattr(loans.httpx, "post", post)


@pytest.fixture
def sheet(monkeypatch) -> FakeSheet:
    fake = FakeSheet(SECRET)
    monkeypatch.setattr(settings, "loans_script_url", SCRIPT_URL)
    monkeypatch.setattr(settings, "loans_script_secret", SECRET)

    route_script_calls(
        monkeypatch,
        lambda body: httpx.Response(200, json=fake.handle(body), request=REQUEST),
    )
    return fake


def signed_in(email: str, name: str = "Asha Rao"):
    client = make_client()
    login(client, email, name)
    return client


@pytest.fixture
def student():
    return signed_in("asha@uni.edu")


def upload_image(client, route: str, data: bytes = b"jpeg") -> dict:
    slot = client.post(
        route, json={"filename": "p.jpg", "size": len(data), "mime_type": "image/jpeg"}
    ).json()
    assert upload_bytes(slot, data).status_code == 204
    confirmed = client.post(f"/files/{slot['file']['id']}/confirm")
    assert confirmed.status_code == 200
    return confirmed.json()


def loan_photo(client) -> str:
    return upload_image(client, "/loans/photo")["id"]


def loan_body(photo_id: str, **overrides) -> dict:
    return {
        "loan_id": str(uuid.uuid4()),
        "item_name": "Arduino Uno",
        "quantity": 2,
        "due_date": (date.today() + timedelta(days=7)).isoformat(),
        "reason": "Line-follower build",
        "photo_file_id": photo_id,
        **overrides,
    }


def borrow(client, **overrides) -> httpx.Response:
    return client.post("/loans", json=loan_body(loan_photo(client), **overrides))


def return_loan(client, loan_id: str, note: str = "") -> httpx.Response:
    return client.post(
        f"/loans/{loan_id}/return",
        json={"photo_file_id": loan_photo(client), "condition_note": note},
    )


def seed_row(sheet: FakeSheet, email: str, **overrides) -> dict:
    row = {
        "loan_id": str(uuid.uuid4()),
        "borrowed_at": "2026-01-01T09:00:00Z",
        "name": "Seeded",
        "email": email,
        "item": "Multimeter",
        "quantity": 1,
        "reason": "Testing",
        "due_date": (date.today() + timedelta(days=3)).isoformat(),
        "borrow_photo": "https://lab.example/loans/photo/x",
        "status": "out",
        "returned_at": None,
        "return_photo": None,
        "return_note": None,
        **overrides,
    }
    sheet.rows.append(row)
    return row


def test_endpoints_require_login(sheet):
    anon = make_client()
    loan_id = uuid.uuid4()
    photo = {"photo_file_id": str(uuid.uuid4())}
    assert anon.post("/loans", json=loan_body(str(uuid.uuid4()))).status_code == 401
    assert anon.get("/loans/mine").status_code == 401
    assert anon.post(f"/loans/{loan_id}/return", json=photo).status_code == 401


def test_not_configured_is_503(monkeypatch, student):
    monkeypatch.setattr(settings, "loans_script_url", "")
    message = "Borrowing isn't set up yet — ask lab staff."
    responses = [
        borrow(student),
        student.get("/loans/mine"),
        return_loan(student, str(uuid.uuid4())),
    ]
    for response in responses:
        assert response.status_code == 503
        assert response.json()["detail"] == message


def test_borrow_uses_session_identity(sheet, student):
    response = borrow(student)
    assert response.status_code == 201
    loan = response.json()
    assert loan["status"] == "out" and loan["overdue"] is False
    assert loan["item_name"] == "Arduino Uno" and loan["quantity"] == 2

    [row] = sheet.rows
    assert (row["name"], row["email"]) == ("Asha Rao", "asha@uni.edu")
    assert row["borrow_photo"] == loan["borrow_photo_url"]


def test_borrow_rejects_injected_identity(sheet, student):
    for field in ("email", "name"):
        response = borrow(student, **{field: "eve@uni.edu"})
        assert response.status_code == 422
    assert sheet.rows == []


@pytest.mark.parametrize("quantity", [0, -1, 1000, 2.5, "two"])
def test_borrow_rejects_bad_quantity_before_sheet(sheet, student, quantity):
    assert borrow(student, quantity=quantity).status_code == 422
    assert sheet.rows == []


def test_borrow_rejects_blank_text(sheet, student):
    assert borrow(student, item_name="   ").status_code == 422
    assert borrow(student, reason="").status_code == 422


def test_borrow_photo_must_be_own_ready_loan_photo(db, sheet, student):
    other = signed_in("other@uni.edu")
    pending = student.post(
        "/loans/photo",
        json={"filename": "p.jpg", "size": 4, "mime_type": "image/jpeg"},
    ).json()["file"]["id"]
    avatar = upload_image(student, "/users/me/avatar")["id"]
    for photo_id in (loan_photo(other), pending, avatar, str(uuid.uuid4())):
        response = student.post("/loans", json=loan_body(photo_id))
        assert response.status_code == 400
        assert response.json()["detail"] == "photo not found"
    assert sheet.rows == []


def test_due_date_window(sheet, student):
    today = date.today()
    yesterday = today - timedelta(days=1)
    last_ok = today + timedelta(days=settings.loan_max_days)
    assert borrow(student, due_date=yesterday.isoformat()).status_code == 400
    assert borrow(student, due_date=last_ok.isoformat()).status_code == 201
    too_far = last_ok + timedelta(days=1)
    assert borrow(student, due_date=too_far.isoformat()).status_code == 400
    assert len(sheet.rows) == 1


def test_borrow_retry_is_idempotent(sheet, student):
    body = loan_body(loan_photo(student))
    assert student.post("/loans", json=body).status_code == 201
    assert student.post("/loans", json=body).status_code == 201
    assert len(sheet.rows) == 1


def test_mine_lists_only_callers_loans_out_first(sheet, student):
    today = date.today()
    seed_row(sheet, "other@uni.edu")
    returned = seed_row(
        sheet,
        "asha@uni.edu",
        status="returned",
        returned_at="2026-01-05T10:00:00Z",
        return_photo="https://lab.example/loans/photo/y",
    )
    later = seed_row(
        sheet, "asha@uni.edu", due_date=(today + timedelta(days=9)).isoformat()
    )
    overdue = seed_row(
        sheet, "ASHA@uni.edu", due_date=(today - timedelta(days=2)).isoformat()
    )

    response = student.get("/loans/mine")
    assert response.status_code == 200
    mine = response.json()
    assert [loan["loan_id"] for loan in mine] == [
        overdue["loan_id"],
        later["loan_id"],
        returned["loan_id"],
    ]
    assert [loan["overdue"] for loan in mine] == [True, False, False]


def test_return_flow(sheet, student):
    loan_id = borrow(student).json()["loan_id"]
    assert (
        return_loan(student, loan_id, note="  one jumper missing ").status_code == 204
    )

    [loan] = student.get("/loans/mine").json()
    assert loan["status"] == "returned"
    assert loan["return_note"] == "one jumper missing"
    assert loan["return_photo_url"].startswith(f"{settings.public_url}/loans/photo/")
    assert loan["returned_at"] is not None

    second = return_loan(student, loan_id)
    assert second.status_code == 409
    assert second.json()["detail"] == "This loan is already returned"


def test_return_someone_elses_or_unknown_loan_is_404(sheet, student):
    theirs = seed_row(sheet, "other@uni.edu")
    for loan_id in (theirs["loan_id"], str(uuid.uuid4())):
        response = return_loan(student, loan_id)
        assert response.status_code == 404
        assert response.json()["detail"] == "Loan not found"
    assert theirs["status"] == "out"


def fail_with(monkeypatch, outcome) -> None:
    def answer(body):
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    route_script_calls(monkeypatch, answer)


@pytest.mark.parametrize(
    "outcome",
    [
        httpx.ConnectTimeout("timed out"),
        httpx.Response(200, text="<html>Sign in</html>", request=REQUEST),
        httpx.Response(
            200, json={"ok": False, "error": "unauthorized"}, request=REQUEST
        ),
        httpx.Response(500, json={"ok": True}, request=REQUEST),
    ],
)
def test_sheet_failure_is_502_without_leaking_secret(
    monkeypatch, caplog, sheet, student, outcome
):
    photo = loan_photo(student)
    fail_with(monkeypatch, outcome)
    with caplog.at_level(logging.ERROR, logger="backend.app.loans"):
        response = student.post("/loans", json=loan_body(photo))
    assert response.status_code == 502
    assert response.json()["detail"] == loans.SHEET_UNAVAILABLE
    assert caplog.records
    assert SECRET not in caplog.text


def test_photo_url_uses_public_url(monkeypatch):
    monkeypatch.setattr(settings, "public_url", "https://lab.example.edu")
    file_id = uuid.uuid4()
    assert loans.photo_url(file_id) == f"https://lab.example.edu/loans/photo/{file_id}"


@pytest.mark.parametrize("body", [{"ok": True}, {"ok": True, "loans": None}])
def test_mine_malformed_loans_is_502(monkeypatch, sheet, student, body):
    route_script_calls(
        monkeypatch, lambda _: httpx.Response(200, json=body, request=REQUEST)
    )
    response = student.get("/loans/mine")
    assert response.status_code == 502
    assert response.json()["detail"] == loans.SHEET_UNAVAILABLE


@pytest.mark.parametrize(
    "bad",
    [
        {"due_date": ""},
        {"borrowed_at": ""},
        {"quantity": ""},
        {"status": "Out"},
        {"item": None, "due_date": None},
    ],
)
def test_mine_skips_hand_edited_bad_row(caplog, sheet, student, bad):
    good = seed_row(sheet, "asha@uni.edu")
    broken = seed_row(sheet, "asha@uni.edu", **bad)
    with caplog.at_level(logging.ERROR, logger="backend.app.loans"):
        response = student.get("/loans/mine")
    assert response.status_code == 200
    assert [loan["loan_id"] for loan in response.json()] == [good["loan_id"]]
    assert broken["loan_id"] in caplog.text


def test_mine_skips_row_that_is_not_an_object(monkeypatch, sheet, student):
    good = seed_row(sheet, "asha@uni.edu")
    listed = {"ok": True, "loans": [dict(good), "garbage", None]}
    route_script_calls(
        monkeypatch, lambda _: httpx.Response(200, json=listed, request=REQUEST)
    )
    response = student.get("/loans/mine")
    assert response.status_code == 200
    assert [loan["loan_id"] for loan in response.json()] == [good["loan_id"]]


def test_httpx_does_not_log_script_url_at_info():
    # Pinned on the logger itself, so it holds even if root logging is at INFO.
    assert logging.getLogger("httpx").level == logging.WARNING


def test_mine_sorts_naive_and_aware_timestamps(sheet, student):
    # A hand-typed timestamp without a zone is read as UTC.
    newer = seed_row(
        sheet,
        "asha@uni.edu",
        status="returned",
        borrowed_at="2026-02-20 09:00",
        returned_at="2026-03-01 10:00",
        return_photo="https://lab.example/loans/photo/n",
    )
    older = seed_row(
        sheet,
        "asha@uni.edu",
        status="returned",
        returned_at="2026-02-01T10:00:00Z",
        return_photo="https://lab.example/loans/photo/a",
    )
    response = student.get("/loans/mine")
    assert response.status_code == 200
    mine = response.json()
    assert [loan["loan_id"] for loan in mine] == [newer["loan_id"], older["loan_id"]]
    assert datetime.fromisoformat(mine[0]["returned_at"]).utcoffset() == timedelta(0)


@pytest.mark.parametrize("raw", ["evil\nINJECTED log line", "", None, 42])
def test_skipped_row_log_only_shows_uuid_loan_ids(caplog, sheet, student, raw):
    seed_row(sheet, "asha@uni.edu", loan_id=raw, due_date="")
    with caplog.at_level(logging.ERROR, logger="backend.app.loans"):
        assert student.get("/loans/mine").status_code == 200
    assert "<invalid loan_id>" in caplog.text
    assert "INJECTED" not in caplog.text
