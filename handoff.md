# Handoff — build order

Dependency-ordered milestones from empty repo to deployable. Each has a **done =** definition. Any session can pick up at the first milestone not yet done. Don't skip ahead — later milestones assume earlier ones.

## Current status (2026-06-28)

Milestones 1–2 done. Compose owns the whole stack; manual `docker run` for MinIO retired.

`docker-compose.yml` (root): nginx (only published port, 80), frontend (placeholder static page), backend, db (Postgres 16, named volume `pgdata`), minio (named volume `miniodata`). db + minio have healthchecks; backend `depends_on` them `service_healthy`. Only nginx is reachable from the host — db/minio/backend ports stay internal. MinIO's public S3 route is still deferred to milestone 8. Secrets via gitignored `.env` (`env_file`); `.env.example` committed.

Backend scaffold (`backend/app/`): `config.py` (env-driven `Settings` — `database_url`, MinIO creds, bucket, `MAX_FILE_SIZE` 2 GB placeholder), `storage.py` (MinIO client wrapper: `ensure_bucket`, `stat_object`, `remove_object`, `presigned_get_url`, `presigned_put_url` — never streams bytes), `db.py` (sync SQLAlchemy engine, `SessionLocal`, `Base`, `get_db` dependency), `models.py` (`User`, `Project`, `File`), `main.py` (FastAPI app, `/health`; lifespan retries the DB connection then `ensure_bucket` — both fail loud if unreachable). Alembic under `backend/alembic/` with the initial migration.

Run (Docker): `cp .env.example .env`, then `docker compose up -d --build`; migrate with `docker compose exec backend alembic -c backend/alembic.ini upgrade head` (always invoke alembic from the repo root / container WORKDIR so `backend.app` imports). App: `http://localhost/` (placeholder), `http://localhost/api/health`.

Next: auth (milestone 3) — Google OAuth, `hd`-claim check, session JWT, `get_current_user`, staff allowlist.

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
   - Alembic configured. First migration enables `pgcrypto`, creates the 3 tables (`users`, `projects`, `files`) + indexes above (Alembic also adds its own `alembic_version` bookkeeping table).
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
