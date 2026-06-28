# Handoff — build order

Dependency-ordered milestones from empty repo to deployable. Each has a **done =** definition. Any session can pick up at the first milestone not yet done. Don't skip ahead — later milestones assume earlier ones.

## Current status (2026-06-28)

Pre-milestone-1, backend skeleton in place. No `docker-compose.yml` yet.

MinIO is up **manually** for local dev only — `docker run` container named `minio`, ports 9000 (S3 API) / 9001 (console), creds `minioadmin/minioadmin`, bucket `tinkerer-lab` created and private. Not yet a Compose service.

Backend scaffold (`backend/app/`): `config.py` (env-driven `Settings` — MinIO creds, bucket, `MAX_FILE_SIZE` 2 GB placeholder), `storage.py` (MinIO client wrapper: `ensure_bucket`, `stat_object`, `remove_object`, `presigned_get_url`, `presigned_put_url` — never streams bytes), `main.py` (FastAPI app, `/health`, lifespan calls `ensure_bucket` so startup fails loud if MinIO is unreachable). Deps declared in `pyproject.toml` (`fastapi`, `uvicorn`, `minio`, `pydantic-settings`); stale `minio-test` workspace member removed. `.env` gitignored; `.env.example` committed.

Run: `uv sync && uv run uvicorn backend.app.main:app --reload`.

Next: presigned upload + confirm endpoints (milestones 4–5). The PUT-side size cap (enforcement #2, `content-length-range`) needs a presigned POST policy at the endpoint layer — `presigned_put_url` is a plain PUT and can't carry it (noted in `storage.py`).

## Schema reference (for milestone 2)

- **User**: `id` (uuid), `name`, `email` (unique), `role` ('staff'|'student', default 'student'), `created_at`
- **Project**: `id` (uuid), `title`, `description`, `owner_id` (FK→User, ON DELETE RESTRICT), `is_public` (bool, default false), `created_at`
- **File**: `id` (uuid), `project_id` (FK→Project, ON DELETE CASCADE), `filename`, `object_key` (unique), `size` (bigint), `mime_type`, `status` ('pending'|'ready', default 'pending'), `created_at`
- UUID PKs via `gen_random_uuid()` — enable the `pgcrypto` extension in the first migration.
- Indexes: `File(project_id)`, `Project(owner_id)`, `Project(is_public)`, composite `File(status, created_at)` (for the cleanup sweep). `email` and `object_key` unique constraints provide their own indexes.
- Object key convention: `projects/{project_id}/{file_id}/{filename}` where `filename` is slugified/sanitized (no spaces, unicode, or slashes). Store the **original** name in the `filename` column for display; the key uses the safe version.

## Milestones

1. **Docker skeleton**
   - Compose services: nginx (publishes 80/443), frontend, backend, db (named volume), minio (named volume). Everything internal except nginx + MinIO's public S3 route. Gitignored `.env` via `env_file`.
   - **done =** `docker compose up` boots all services; nginx serves a frontend placeholder; backend health endpoint reachable through nginx.

2. **DB + migrations**
   - Alembic configured. First migration enables `pgcrypto`, creates all 4 tables + indexes above.
   - **done =** migration applies cleanly; UUID PKs generate via `gen_random_uuid()`; downgrade works.

3. **Auth**
   - Google OAuth; verify token + **reject non-uni `hd` claim**; upsert User; issue session JWT in an **httpOnly cookie**; clean `get_current_user` dependency; staff allowlist/admin table (new users default `student`).
   - **done =** uni account logs in and gets a session; a non-uni account is rejected; `get_current_user` gates a protected route.

4. **Presigned upload**
   - Declared-size pre-check; write `pending` File row; issue presigned PUT with `content-length-range`.
   - **done =** browser uploads bytes directly to MinIO via the presigned URL (FastAPI never sees bytes); oversized upload rejected by the policy.

5. **Confirm + cleanup**
   - Confirm endpoint: verify caller owns the project → `stat_object` authoritative size check (delete object + row if over) → flip `ready`. Cron sweep of `status='pending' AND created_at < now()-1h` deletes orphaned objects then rows.
   - **done =** confirmed file flips to `ready`; an abandoned pending row + its MinIO object are gone after the sweep.

6. **Browse / visibility**
   - Public showcase (public projects only), single project view, my-projects dashboard, `is_public` toggle, download URL minting (visibility-checked, anonymous allowed for public).
   - **done =** anonymous visitor sees only public projects and can download them; owner sees their private projects; a private project is hidden from non-owners.

7. **Admin**
   - Staff allowlist management UI/endpoints; staff can manage any project.
   - **done =** staff role is enforced; a student cannot reach admin actions.

8. **Deploy**
   - nginx public routes incl. MinIO (endpoint config matches public URL; `client_max_body_size` raised); bucket CORS allows frontend origin PUT/GET; `pg_dump` cron; backend retry-on-connect for Postgres.
   - **done =** app reachable via the uni public route (pending IT); upload/download works end-to-end over the real domain; presigned signatures validate.
