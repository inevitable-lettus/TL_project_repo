# Tinkerer Lab

Makerspace project file store. FastAPI backend; files transfer browser↔MinIO via presigned URLs (FastAPI never touches bytes). See [CLAUDE.md](CLAUDE.md) for the hard rules and [handoff.md](handoff.md) for build order.

## Local dev

Requires a running MinIO (see handoff status) and Python ≥3.11 with [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env        # fill in MinIO creds
uv sync
uv run uvicorn backend.app.main:app --reload
```

Health check: `GET http://localhost:8000/health`.
