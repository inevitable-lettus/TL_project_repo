"""Sweeps abandoned uploads: pending File rows, and ready loan photos never
linked to a loan, past PENDING_MAX_AGE_SECONDS lose their MinIO object first,
then the row (hard rule 5). Runs as its own compose service:
python -m backend.app.cleanup"""

import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, exists, or_, select

from . import storage
from .config import settings
from .db import SessionLocal
from .models import File, LoanPhoto


def sweep_once(session_factory=SessionLocal) -> int:
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.pending_max_age_seconds)
    removed = 0
    with session_factory() as db:
        unlinked_loan_photo = and_(
            File.status == "ready",
            File.kind == "loan_photo",
            ~exists().where(LoanPhoto.file_id == File.id),
        )
        rows = db.scalars(
            select(File).where(
                File.created_at < cutoff,
                or_(File.status == "pending", unlinked_loan_photo),
            )
        ).all()
        for row in rows:
            # Object delete is idempotent — the upload may never have landed.
            storage.remove_object(row.object_key)
            db.delete(row)
            db.commit()  # per row, so one failure doesn't lose progress
            removed += 1
    return removed


def main() -> None:
    while True:
        removed = sweep_once()
        print(f"cleanup: removed {removed} abandoned files", flush=True)
        time.sleep(settings.cleanup_interval_seconds)


if __name__ == "__main__":
    main()
