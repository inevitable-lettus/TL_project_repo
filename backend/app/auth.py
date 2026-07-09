import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User
from .schemas import UserOut

router = APIRouter(prefix="/auth")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
STATE_COOKIE = "oauth_state"
SESSION_COOKIE = "session"


def _cookie_secure() -> bool:
    return settings.public_url.startswith("https://")


def _redirect_uri() -> str:
    # nginx maps public /api/* to the backend root.
    return f"{settings.public_url}/api/auth/callback"


def create_session_token(user_id: uuid.UUID) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(UTC) + timedelta(seconds=settings.session_ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_session_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    return uuid.UUID(payload["sub"])


def set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(user_id),
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
    )


def upsert_user(db: Session, email: str, name: str) -> User:
    email = email.lower()
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        role = "staff" if email in settings.staff_email_set else "student"
        user = User(email=email, name=name, role=role)
        db.add(user)
    else:
        user.name = name
        # Bootstrap promotion only — never auto-demote.
        if email in settings.staff_email_set and user.role != "staff":
            user.role = "staff"
    db.commit()
    db.refresh(user)
    return user


def exchange_code_for_claims(code: str) -> dict:
    token_response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": _redirect_uri(),
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    token_response.raise_for_status()
    return google_id_token.verify_oauth2_token(
        token_response.json()["id_token"],
        google_requests.Request(),
        settings.google_client_id,
    )


def get_current_user_optional(
    db: Session = Depends(get_db),
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> User | None:
    if session is None:
        return None
    user_id = decode_session_token(session)
    if user_id is None:
        return None
    return db.get(User, user_id)


def get_current_user(user: User | None = Depends(get_current_user_optional)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role != "staff":
        raise HTTPException(status_code=403, detail="Staff only")
    return user


@router.get("/login")
def login() -> RedirectResponse:
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "hd": settings.google_hosted_domain,  # hint only; callback re-checks
        "prompt": "select_account",  # always show the picker; never reuse a session
        "state": state,
    }
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    response.set_cookie(
        STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
    )
    return response


@router.get("/callback")
def callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
    oauth_state: str | None = Cookie(default=None, alias=STATE_COOKIE),
) -> RedirectResponse:
    if oauth_state is None or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=400, detail="OAuth state mismatch")
    claims = exchange_code_for_claims(code)
    if claims.get("hd") != settings.google_hosted_domain:
        response = RedirectResponse("/?auth_error=non_uni_domain")
    else:
        user = upsert_user(db, claims["email"], claims.get("name") or claims["email"])
        response = RedirectResponse("/")
        set_session_cookie(response, user.id)
    response.delete_cookie(STATE_COOKIE)
    return response


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "logged_out"}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


class TestLoginRequest(BaseModel):
    email: str
    name: str


@router.post("/test-login", response_model=UserOut)
def test_login(
    body: TestLoginRequest, response: Response, db: Session = Depends(get_db)
) -> User:
    # Config already refuses AUTH_TEST_MODE outside ENVIRONMENT=test; this
    # re-check is defense in depth for the auth boundary.
    if not (settings.auth_test_mode and settings.environment == "test"):
        raise HTTPException(status_code=404, detail="Not found")
    user = upsert_user(db, body.email, body.name)
    set_session_cookie(response, user.id)
    return user
