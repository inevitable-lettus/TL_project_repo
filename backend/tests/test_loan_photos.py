import uuid
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest

from backend.app import cleanup, storage
from backend.app.config import settings
from backend.app.models import File, Loan, LoanPhoto
from backend.tests.helpers import login, make_client, upload_bytes


def request_loan_slot(client, size: int, **overrides) -> httpx.Response:
    body = {"filename": "arduino uno.jpg", "size": size, "mime_type": "image/jpeg"}
    return client.post("/loans/photo", json={**body, **overrides})


def upload_loan_photo(client, data: bytes = b"jpeg-bytes") -> dict:
    slot = request_loan_slot(client, len(data)).json()
    assert upload_bytes(slot, data).status_code == 204
    confirmed = client.post(f"/files/{slot['file']['id']}/confirm")
    assert confirmed.status_code == 200
    return confirmed.json()


@pytest.fixture
def student():
    client = make_client()
    user = login(client, "student@uni.edu", "Student")
    return client, user


@pytest.fixture
def staff():
    client = make_client()
    login(client, "staff@uni.edu", "Staff")
    return client


def test_slot_requires_login():
    assert request_loan_slot(make_client(), 10).status_code == 401


def test_slot_rejects_non_image(student):
    client, _ = student
    response = request_loan_slot(client, 10, mime_type="application/pdf")
    assert response.status_code == 400


def test_slot_rejects_declared_oversize_with_mb_message(student):
    client, _ = student
    response = request_loan_slot(client, settings.loan_photo_max_size + 1)
    assert response.status_code == 400
    limit_mb = settings.loan_photo_max_size / 1024**2
    assert response.json()["detail"] == f"file exceeds {limit_mb:g} MB limit"


def test_full_upload_is_private_loan_photo(db, student):
    client, user = student
    ready = upload_loan_photo(client)
    assert ready["status"] == "ready"
    assert ready["kind"] == "loan_photo"
    row = db.get(File, uuid.UUID(ready["id"]))
    assert row.object_key.startswith(f"loans/{user['id']}/")
    assert row.owner_id == uuid.UUID(user["id"])
    assert row.project_id is None


def test_minio_policy_rejects_bytes_over_cap(monkeypatch, student):
    client, _ = student
    monkeypatch.setattr(settings, "loan_photo_max_size", 100)
    slot = request_loan_slot(client, 50).json()
    response = upload_bytes(slot, b"x" * 200)  # lie: upload more than declared
    assert response.status_code == 400  # MinIO enforces content-length-range


def test_confirm_rejects_bytes_over_cap_and_purges(monkeypatch, db, student):
    client, _ = student
    slot = request_loan_slot(client, 50).json()
    assert upload_bytes(slot, b"x" * 50).status_code == 204
    object_key = db.get(File, uuid.UUID(slot["file"]["id"])).object_key

    monkeypatch.setattr(settings, "loan_photo_max_size", 10)  # tighten after upload
    response = client.post(f"/files/{slot['file']['id']}/confirm")
    assert response.status_code == 400

    db.expire_all()
    assert db.get(File, uuid.UUID(slot["file"]["id"])) is None
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(object_key)


def test_download_visible_to_owner_and_staff_only(student, staff):
    client, _ = student
    photo = upload_loan_photo(client)
    url = f"/files/{photo['id']}/download-url"

    assert client.get(url).status_code == 200
    assert staff.get(url).status_code == 200

    other = make_client()
    login(other, "other@uni.edu")
    assert other.get(url).status_code == 404
    assert make_client().get(url).status_code == 404


def test_student_cannot_delete_loan_photo_staff_can(db, student, staff):
    client, _ = student
    photo = upload_loan_photo(client)

    response = client.delete(f"/files/{photo['id']}")
    assert response.status_code == 403
    assert response.json()["detail"] == "loan photos can't be deleted"

    assert staff.delete(f"/files/{photo['id']}").status_code == 200
    db.expire_all()
    assert db.get(File, uuid.UUID(photo["id"])) is None


def test_loan_photo_cannot_become_avatar(db, student):
    # Replacing an avatar deletes the old file, which would bypass the delete
    # block, and avatars are public.
    client, _ = student
    photo = upload_loan_photo(client)
    response = client.patch("/users/me", json={"avatar_file_id": photo["id"]})
    assert response.status_code == 400


def test_cleanup_sweeps_stale_pending_loan_photo(db, student):
    client, _ = student
    slot = request_loan_slot(client, 50).json()
    assert upload_bytes(slot, b"x" * 50).status_code == 204
    file_id = uuid.UUID(slot["file"]["id"])
    row = db.get(File, file_id)
    object_key = row.object_key
    row.created_at = datetime.now(UTC) - timedelta(
        seconds=settings.pending_max_age_seconds + 60
    )
    db.commit()

    from backend.tests.conftest import TestSession

    assert cleanup.sweep_once(session_factory=TestSession) == 1
    db.expire_all()
    assert db.get(File, file_id) is None
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(object_key)


def age_file(db, file_id: str) -> str:
    row = db.get(File, uuid.UUID(file_id))
    row.created_at = datetime.now(UTC) - timedelta(
        seconds=settings.pending_max_age_seconds + 60
    )
    db.commit()
    return row.object_key


def link_to_loan(db, user: dict, file_id: str) -> None:
    loan = Loan(
        id=uuid.uuid4(),
        borrower_id=uuid.UUID(user["id"]),
        type="equipment",
        item_name="Arduino Uno",
        description="Line-follower build",
        quantity=1,
        unit="pcs",
        due_date=date.today() + timedelta(days=7),
    )
    db.add(loan)
    db.flush()
    db.add(
        LoanPhoto(
            file_id=uuid.UUID(file_id), loan_id=loan.id, stage="borrow", position=0
        )
    )
    db.commit()


def sweep() -> int:
    from backend.tests.conftest import TestSession

    return cleanup.sweep_once(session_factory=TestSession)


def test_cleanup_sweeps_old_unlinked_ready_loan_photo(db, student):
    client, _ = student
    file_id = upload_loan_photo(client)["id"]
    object_key = age_file(db, file_id)

    assert sweep() == 1
    db.expire_all()
    assert db.get(File, uuid.UUID(file_id)) is None
    with pytest.raises(Exception, match="NoSuchKey"):
        storage.stat_object(object_key)


def test_cleanup_keeps_old_linked_loan_photo(db, student):
    client, user = student
    file_id = upload_loan_photo(client)["id"]
    object_key = age_file(db, file_id)
    link_to_loan(db, user, file_id)

    assert sweep() == 0
    db.expire_all()
    assert db.get(File, uuid.UUID(file_id)) is not None
    storage.stat_object(object_key)


def test_cleanup_keeps_fresh_unlinked_loan_photo(db, student):
    client, _ = student
    file_id = upload_loan_photo(client)["id"]

    assert sweep() == 0
    db.expire_all()
    assert db.get(File, uuid.UUID(file_id)) is not None


def test_cleanup_keeps_row_when_minio_delete_fails(db, student, monkeypatch):
    client, _ = student
    file_id = upload_loan_photo(client)["id"]
    age_file(db, file_id)

    def boom(object_key: str) -> None:
        raise RuntimeError("minio down")

    monkeypatch.setattr(storage, "remove_object", boom)
    with pytest.raises(RuntimeError, match="minio down"):
        sweep()
    db.expire_all()
    assert db.get(File, uuid.UUID(file_id)) is not None

    monkeypatch.undo()
    assert sweep() == 1
