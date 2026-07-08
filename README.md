# Tinkerer Lab

Public web app for a university makerspace: blog-style project write-ups with
inline media and downloadable files, student profiles, a staff-curated
landing page, plus lab operations — a machines directory with live status
(staff-edited Google Sheet), machine slot booking, tool checkout, and issue
reporting.

Stack: Next.js frontend, FastAPI backend, PostgreSQL, MinIO (files transfer
browser↔MinIO via presigned URLs — the backend never touches bytes), all
behind nginx via Docker Compose. See [CLAUDE.md](CLAUDE.md) for the hard
rules and [context-docs/](context-docs/) for architecture, product, and the
phase-by-phase build log ([handoff.md](context-docs/handoff.md)).

## Run it

```bash
cp .env.example .env          # dev defaults work out of the box
docker compose up -d --build
docker compose exec backend alembic -c backend/alembic.ini upgrade head
docker compose exec backend python -m backend.app.seed   # optional demo data
```

App: http://localhost/ · API health: http://localhost/api/health

## Tests

```bash
docker compose exec backend pytest      # backend suite
cd frontend && npm ci && npm run e2e    # Playwright journeys (needs test-mode
                                        # env vars — see handoff.md)
```

Rebuild images after code changes (`docker compose up -d --build backend
frontend`) — containers run baked images, not mounted source.
