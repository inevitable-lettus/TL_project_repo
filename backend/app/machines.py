import csv
import io
import logging
import time

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .config import settings

# Machine details live in a staff-edited Google Sheet published as CSV
# (architecture.md "Sheet as read-only CMS"). Content only — bookings and
# other transactional data stay in Postgres.

router = APIRouter(prefix="/machines")
logger = logging.getLogger(__name__)

MACHINE_STATUSES = {"available", "in_use", "maintenance", "offline"}


class Machine(BaseModel):
    slug: str
    name: str
    category: str
    status: str
    training_required: bool
    notes: str


def fetch_sheet_csv() -> str:
    response = httpx.get(
        settings.machines_sheet_csv_url, timeout=10, follow_redirects=True
    )
    response.raise_for_status()
    return response.text


def parse_machines(csv_text: str) -> list[Machine]:
    machines: list[Machine] = []
    for row in csv.DictReader(io.StringIO(csv_text)):
        slug = (row.get("slug") or "").strip().lower()
        if not slug:
            continue
        status = (row.get("status") or "").strip().lower().replace(" ", "_")
        if status not in MACHINE_STATUSES:
            # A typo'd status must stay visible, not hide the machine.
            logger.warning("machine %s has unknown status %r", slug, status)
            status = "offline"
        machines.append(
            Machine(
                slug=slug,
                name=(row.get("name") or slug).strip(),
                category=(row.get("category") or "Other").strip(),
                status=status,
                training_required=(row.get("training_required") or "").strip().lower()
                in {"1", "true", "yes", "y"},
                notes=(row.get("notes") or "").strip(),
            )
        )
    return machines


# (fetched_at_monotonic, machines). Per-process; each uvicorn worker keeps
# its own copy, which is fine at this scale.
_cache: tuple[float, list[Machine]] | None = None


def invalidate_cache() -> None:
    global _cache
    _cache = None


@router.get("", response_model=list[Machine])
def list_machines() -> list[Machine]:
    global _cache
    if not settings.machines_sheet_csv_url:
        raise HTTPException(status_code=503, detail="machines sheet not configured")

    now = time.monotonic()
    if _cache is not None and now - _cache[0] < settings.machines_cache_seconds:
        return _cache[1]

    try:
        machines = parse_machines(fetch_sheet_csv())
    except Exception as exc:
        logger.exception("machines sheet fetch failed")
        if _cache is not None:
            return _cache[1]  # stale copy beats an outage
        raise HTTPException(
            status_code=503, detail="machines sheet unreachable"
        ) from exc

    _cache = (now, machines)
    return machines


def machine_slugs() -> set[str]:
    """Valid slugs for booking validation; empty set when the sheet is down
    and nothing was ever cached."""
    try:
        return {m.slug for m in list_machines()}
    except HTTPException:
        return set()
