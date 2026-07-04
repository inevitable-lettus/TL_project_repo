from collections.abc import Iterator

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from backend.app.config import settings

# Point the suite at a throwaway test config before the app modules are used.
settings.environment = "test"
settings.auth_test_mode = True
settings.jwt_secret = "test-secret-0123456789abcdef0123456789abcdef"
settings.google_hosted_domain = "uni.edu"
settings.staff_emails = "staff@uni.edu"
settings.minio_bucket = "test-bucket"
# Tests do the upload/download round-trip from inside the container, so
# presigned URLs must target the internal endpoint, not the nginx route.
settings.minio_public_endpoint = ""

from backend.app import auth, storage  # noqa: E402
from backend.app.db import Base, get_db  # noqa: E402
from backend.app.main import app  # noqa: E402

storage.ensure_bucket()

TEST_DB_NAME = "tinkerer_test"


def _create_test_database() -> str:
    admin_engine = create_engine(settings.database_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": TEST_DB_NAME},
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    admin_engine.dispose()
    return settings.database_url.rsplit("/", 1)[0] + f"/{TEST_DB_NAME}"


test_engine = create_engine(_create_test_database())
TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

# Wipe whatever a previous run left behind, whatever schema shape it had.
with test_engine.connect() as conn:
    conn.execute(text("DROP SCHEMA public CASCADE"))
    conn.execute(text("CREATE SCHEMA public"))
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
    conn.commit()
Base.metadata.create_all(test_engine)


def override_get_db() -> Iterator[Session]:
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@app.get("/_test/staff-only")
def staff_only_probe(user=Depends(auth.require_staff)) -> dict[str, str]:
    return {"email": user.email}


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    yield
    with test_engine.connect() as conn:
        conn.execute(text("TRUNCATE users, projects, files CASCADE"))
        conn.commit()
    for obj in storage.client.list_objects(settings.minio_bucket, recursive=True):
        storage.client.remove_object(settings.minio_bucket, obj.object_name)


@pytest.fixture
def db() -> Iterator[Session]:
    session = TestSession()
    yield session
    session.close()


@pytest.fixture
def client() -> TestClient:
    # No context manager: lifespan (DB wait + bucket check) must not run here.
    return TestClient(app, follow_redirects=False)
