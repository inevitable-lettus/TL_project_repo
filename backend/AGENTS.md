# Backend agent instructions

FastAPI + PostgreSQL (SQLAlchemy, Alembic migrations) + MinIO object storage. Read the root [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md) first.

## Rules specific to the backend

- **Never stream file bytes through FastAPI.** All file transfer uses presigned URLs the browser uses directly against MinIO. If you find yourself reading/writing an uploaded file's bytes in a route, stop — that's wrong.
- **Auth/visibility is a security boundary.** The `is_public` flag and the staff/student role gate what a request may see. When adding a route that returns project or file data, check the caller's permission (see `backend/app/access.py`, `backend/app/auth.py`). Never return a private project to an unauthorized caller.
- **Deleting a project must purge its MinIO objects before deleting the DB row.** Database cascade only removes rows, not stored files.
- **Limits come from env vars** (`backend/app/config.py`), never hardcoded.
- **Type hints on everything.** `ruff` enforces style; keep functions small and single-purpose.

## Commands

```bash
uv run ruff check backend/        # lint
uv run ruff format backend/       # auto-format
uv run pytest                     # tests
```

Tests need Postgres + MinIO running and test mode enabled. See [`docs/setup.md`](../docs/setup.md). Migrations live in `backend/alembic/`; create one with a new revision file rather than editing the database by hand.
