import time
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from .auth import router as auth_router
from .db import engine
from .storage import ensure_bucket


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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
