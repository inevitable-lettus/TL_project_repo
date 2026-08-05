import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from sqlalchemy import select

from backend.app import auth
from backend.app.config import Settings, settings
from backend.app.models import User

UNI_CLAIMS = {"email": "ada@uni.edu", "name": "Ada Lovelace", "hd": "uni.edu"}


def fake_exchange(claims: dict):
    return lambda code: claims


def do_callback(client, monkeypatch, claims: dict):
    monkeypatch.setattr(auth, "exchange_code_for_claims", fake_exchange(claims))
    client.cookies.set(auth.STATE_COOKIE, "state-123")
    return client.get("/auth/callback", params={"code": "c", "state": "state-123"})


def user_by_email(db, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def test_login_redirects_to_google_with_state_cookie(client):
    response = client.get("/auth/login")
    assert response.status_code == 307
    assert response.headers["location"].startswith(auth.GOOGLE_AUTH_URL)
    assert auth.STATE_COOKIE in response.cookies


def test_login_always_asks_google_for_the_account_chooser(client):
    # An "hd" hint here makes Google auto-pick the single signed-in account
    # that matches the domain, so the picker never appears. The domain is
    # enforced by the hd *claim* check in the callback instead.
    params = parse_qs(urlparse(client.get("/auth/login").headers["location"]).query)
    assert params["prompt"] == ["select_account"]
    assert "hd" not in params
    assert "login_hint" not in params


def test_callback_rejects_state_mismatch(client, db, monkeypatch):
    monkeypatch.setattr(auth, "exchange_code_for_claims", fake_exchange(UNI_CLAIMS))
    client.cookies.set(auth.STATE_COOKIE, "state-123")
    response = client.get("/auth/callback", params={"code": "c", "state": "wrong"})
    assert response.status_code == 400
    assert user_by_email(db, "ada@uni.edu") is None


def test_callback_rejects_missing_state_cookie(client):
    response = client.get("/auth/callback", params={"code": "c", "state": "s"})
    assert response.status_code == 400


@pytest.mark.parametrize(
    "claims",
    [
        {"email": "any@gmail.com", "name": "Any", "hd": "gmail.com"},
        {"email": "any@gmail.com", "name": "Any"},  # personal accounts have no hd
    ],
)
def test_callback_rejects_non_uni_domain(client, db, monkeypatch, claims):
    response = do_callback(client, monkeypatch, claims)
    assert response.status_code == 307
    assert response.headers["location"] == "/?auth_error=non_uni_domain"
    assert auth.SESSION_COOKIE not in response.cookies
    assert user_by_email(db, "any@gmail.com") is None


def test_callback_creates_user_and_session(client, db, monkeypatch):
    response = do_callback(client, monkeypatch, UNI_CLAIMS)
    assert response.status_code == 307
    assert response.headers["location"] == "/"
    assert auth.SESSION_COOKIE in response.cookies

    user = user_by_email(db, "ada@uni.edu")
    assert user is not None
    assert user.role == "student"

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@uni.edu"


def test_upsert_is_idempotent_and_updates_name(client, db, monkeypatch):
    do_callback(client, monkeypatch, UNI_CLAIMS)
    do_callback(client, monkeypatch, {**UNI_CLAIMS, "name": "Ada L."})
    users = db.execute(select(User).where(User.email == "ada@uni.edu")).scalars().all()
    assert len(users) == 1
    assert users[0].name == "Ada L."


def test_staff_bootstrap_promotes_allowlisted_email(client, db, monkeypatch):
    claims = {"email": "staff@uni.edu", "name": "Staff", "hd": "uni.edu"}
    do_callback(client, monkeypatch, claims)
    assert user_by_email(db, "staff@uni.edu").role == "staff"


def test_staff_bootstrap_promotes_existing_student(client, db, monkeypatch):
    session = db
    session.add(User(email="staff@uni.edu", name="Old Name", role="student"))
    session.commit()
    claims = {"email": "staff@uni.edu", "name": "Staff", "hd": "uni.edu"}
    do_callback(client, monkeypatch, claims)
    session.expire_all()
    assert user_by_email(db, "staff@uni.edu").role == "staff"


def test_me_requires_session(client):
    assert client.get("/auth/me").status_code == 401


def test_me_rejects_garbage_token(client):
    client.cookies.set(auth.SESSION_COOKIE, "not-a-jwt")
    assert client.get("/auth/me").status_code == 401


def test_me_rejects_expired_token(client):
    expired = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    client.cookies.set(auth.SESSION_COOKIE, expired)
    assert client.get("/auth/me").status_code == 401


def test_me_rejects_token_signed_with_wrong_secret(client):
    forged = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "wrong-secret",
        algorithm="HS256",
    )
    client.cookies.set(auth.SESSION_COOKIE, forged)
    assert client.get("/auth/me").status_code == 401


def test_logout_clears_session(client, monkeypatch):
    do_callback(client, monkeypatch, UNI_CLAIMS)
    assert client.get("/auth/me").status_code == 200
    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401


def test_staff_route_blocks_students_and_admits_staff(client):
    client.post("/auth/test-login", json={"email": "kid@uni.edu", "name": "Kid"})
    assert client.get("/_test/staff-only").status_code == 403

    client.post("/auth/test-login", json={"email": "staff@uni.edu", "name": "Staff"})
    response = client.get("/_test/staff-only")
    assert response.status_code == 200
    assert response.json()["email"] == "staff@uni.edu"


def test_test_login_disabled_outside_test_mode(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_test_mode", False)
    response = client.post("/auth/test-login", json={"email": "x@uni.edu", "name": "X"})
    assert response.status_code == 404


def make_settings(**overrides) -> Settings:
    values = {
        "_env_file": None,
        "environment": "production",
        # Pin: the container env sets AUTH_TEST_MODE=1 for Playwright, and
        # BaseSettings would read it here and trip the wrong validator.
        "auth_test_mode": False,
        "database_url": "postgresql+psycopg://x:x@db/x",
        "minio_access_key": "x",
        "minio_secret_key": "x",
        "google_client_id": "x",
        "google_client_secret": "x",
        "google_hosted_domain": "uni.edu",
        "jwt_secret": "0123456789abcdef0123456789abcdef",
        **overrides,
    }
    return Settings(**values)


def test_settings_refuse_test_mode_outside_test_env():
    with pytest.raises(ValueError, match="AUTH_TEST_MODE"):
        make_settings(auth_test_mode=True)


def test_settings_refuse_short_jwt_secret():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        make_settings(jwt_secret="too-short")
