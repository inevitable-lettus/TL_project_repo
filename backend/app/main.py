import time
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from .admin import router as admin_router
from .auth import router as auth_router
from .bookings import router as bookings_router
from .db import engine
from .files import router as files_router
from .machines import router as machines_router
from .projects import router as projects_router
from .storage import ensure_bucket
from .users import router as users_router


def wait_for_db(attempts: int = 30, delay: float = 1.0) -> None:
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt == attempts:
                raise
            time.sleep(delay)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    wait_for_db()
    ensure_bucket()
    yield


app = FastAPI(title="Tinkerer Lab", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(files_router)
app.include_router(projects_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(machines_router)
app.include_router(bookings_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
