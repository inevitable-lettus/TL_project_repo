# Handoff — build order

Dependency-ordered phases from empty repo to deployable. Each has a **done =** definition and **ends with its tests green** — reliability is an explicit requirement (~100 students). Any session can pick up at the first phase not yet done. Don't skip ahead — later phases assume earlier ones.

## Current status (2026-07-02)

Original milestones 1–2 ("Docker skeleton", "DB + migrations") are done — the stack boots via Compose and migration 0001 applies. Scope then expanded (2026-07-02): blog-style project pages (TipTap), student profiles, landing slider + featured curation, admin dashboard UI, downloads area — see [product.md](product.md) and [design.md](design.md). The phase list below **replaces** the old milestones 3–8.

Phase 1 (Auth) done 2026-07-02: `backend/app/auth.py` — Google OAuth code flow (`/auth/login` → `/auth/callback`), `hd`-claim rejection, upsert-on-login, session JWT in httpOnly cookie, `get_current_user`/`get_current_user_optional`/`require_staff` deps, `STAFF_EMAILS` bootstrap, `/auth/test-login` (only with `AUTH_TEST_MODE=1` + `ENVIRONMENT=test`; config refuses otherwise; JWT_SECRET must be ≥32 bytes). Test harness: `backend/tests/` (pytest, auto-created `tinkerer_test` DB, canonical run `docker compose exec backend pytest`) — 18 passing. Real Google login still needs `GOOGLE_CLIENT_ID`/`SECRET`/`GOOGLE_HOSTED_DOMAIN` filled in `.env` (placeholders now).

Phase 2 (Files) done 2026-07-02: migration 0002 applied (up/down/up verified). `backend/app/files.py` — upload slot (`POST /projects/{id}/files`: owner/staff gate, declared-size + `MAX_USER_STORAGE` quota checks, pending row, presigned **POST policy** with `content-length-range`; the SDK's form fields need `key` added manually), confirm (`stat_object` authoritative size + quota re-check → ready, or purge object+row), `GET /files/{id}/download-url` (visibility-gated, anon OK for public, private = 404), batch `POST /projects/{id}/media-urls` (rejects foreign/unready ids), `purge_project_objects` (for Phase 3 delete). `backend/app/access.py` — shared `can_view`/`can_edit`/`require_*` helpers. `backend/app/cleanup.py` — sweep loop, runs as the `cleanup` compose service (`PENDING_MAX_AGE_SECONDS`/`CLEANUP_INTERVAL_SECONDS`). Models gained the 0002 columns (cover/avatar FKs are named + `use_alter`; `Project.files` pins `foreign_keys`). 31 tests passing.

Phase 3 (Projects/profiles/admin) done 2026-07-02: migration 0003 — `files.project_id` now nullable + `files.owner_id` FK (check constraint: one must be set) so avatars are user-scoped files (`POST /users/me/avatar`, image mime enforced, public visibility; replacing an avatar purges the old object+row). `backend/app/projects.py` — CRUD (`POST/GET/PATCH/DELETE /projects`), TipTap content validation (node/mark whitelist, `media.attrs.fileId` must belong to the project, http(s)/mailto links only, node/depth caps), cover validation, showcase pagination, `/projects/mine`, `/projects/slider` (pinned-with-cover first, random public fill, `SLIDER_SIZE`), `/projects/featured` (rank order). `backend/app/users.py` — public profile (`GET /users/{id}`, private projects only for owner/staff, no email), `PATCH /users/me`. `backend/app/admin.py` — staff-only: user list/search, promote/demote (self-demotion refused), `PUT /admin/featured` (ordered list, public-only, replaces previous ranks), slider pin toggle. Static routes declared before `/projects/{id}`. 53 tests passing.

Phase 4a (Frontend scaffold) done 2026-07-02: Next.js 16 (App Router, TS strict, Tailwind v4) in `frontend/`, replacing the static placeholder — **note: Next.js 16 has breaking changes; read `frontend/node_modules/next/dist/docs/` before writing frontend code** (`frontend/AGENTS.md` says the same). Multi-stage Dockerfile (standalone output; lockfile must be regenerated in Linux via `docker run … npm install --package-lock-only` when platform-optional deps drift). Compose `frontend` service builds the image; nginx proxies `/` → `frontend:3000` (nginx caches upstream DNS — restart nginx after recreating frontend; fix properly in Phase 8). App shell: layout with nav (`UserMenu` client component off `/auth/me`), footer, 404 page, placeholder landing. Typed API client `frontend/lib/api.ts` (+`types.ts`): browser hits `/api` same-origin, SSR hits `http://backend:8000` with explicit cookie forwarding; `uploadToStorage` posts the presigned form via XHR for progress. Playwright harness `frontend/e2e/` (config expects the composed stack; `npm run e2e`) — 4 smoke tests passing. `npm run typecheck` + `lint` clean. **Phase 4b (design system) blocked on the owner pasting the two TypeUI prompts (storytelling + nostalgia); then refine/review with `impeccable` + `design-taste-frontend`.**

Phase 4b (design system) done 2026-07-03: the **nostalgia** TypeUI prompt landed as the project skill `.claude/skills/nostalgia/` (module files = the token source of truth; read the relevant modules before styling any new component). The **storytelling** prompt was never supplied — page structure follows design.md's screen inventory instead; revisit if the owner pastes it later. Implementation: `frontend/app/globals.css` (all nostalgia color/radius/shadow tokens as CSS custom properties, light + dark via `prefers-color-scheme`, mapped into Tailwind v4 via `@theme inline`; base heading scale + retro focus outline), fonts self-hosted via `next/font/google` (Newsreader serif / DM Sans / Geist Mono, wired as `--font-*` variables in `layout.tsx`), `frontend/components/ui.tsx` (`Window`, `Panel`, `Button`/`buttonClass`, `SysLabel` primitives). Shell restyled as the desktop metaphor: orange wallpaper, 36px menu bar, windowed content, mono system labels. Verified in both color schemes; typecheck/lint/4 Playwright smoke green.

`docker-compose.yml` (root): nginx (only published port, 80), frontend (placeholder static page), backend, db (Postgres 16, named volume `pgdata`), minio (named volume `miniodata`). db + minio have healthchecks; backend `depends_on` them `service_healthy`. Only nginx is reachable from the host — db/minio/backend ports stay internal. MinIO's public S3 route is still deferred to milestone 8. Secrets via gitignored `.env` (`env_file`); `.env.example` committed.

Backend scaffold (`backend/app/`): `config.py` (env-driven `Settings` — `database_url`, MinIO creds, bucket, `MAX_FILE_SIZE` 2 GB placeholder), `storage.py` (MinIO client wrapper: `ensure_bucket`, `stat_object`, `remove_object`, `presigned_get_url`, `presigned_put_url` — never streams bytes), `db.py` (sync SQLAlchemy engine, `SessionLocal`, `Base`, `get_db` dependency), `models.py` (`User`, `Project`, `File`), `main.py` (FastAPI app, `/health`; lifespan retries the DB connection then `ensure_bucket` — both fail loud if unreachable). Alembic under `backend/alembic/` with the initial migration.

Run (Docker): `cp .env.example .env`, then `docker compose up -d --build`; migrate with `docker compose exec backend alembic -c backend/alembic.ini upgrade head` (always invoke alembic from the repo root / container WORKDIR so `backend.app` imports). App: `http://localhost/` (placeholder), `http://localhost/api/health`.

Next: auth (milestone 3) — Google OAuth, `hd`-claim check, session JWT, `get_current_user`, staff allowlist.

## Schema reference

Migration 0001 (done):

- **User**: `id` (uuid), `name`, `email` (unique), `role` ('staff'|'student', default 'student'), `created_at`
- **Project**: `id` (uuid), `title`, `description`, `owner_id` (FK→User, ON DELETE RESTRICT), `is_public` (bool, default false), `created_at`
- **File**: `id` (uuid), `project_id` (FK→Project, ON DELETE CASCADE), `filename`, `object_key` (unique), `size` (bigint), `mime_type`, `status` ('pending'|'ready', default 'pending'), `created_at`

Migration 0002 (Phase 2):

- **User** += `bio` (text, null), `program` (text, null), `enrollment_year` (int, null), `avatar_file_id` (FK→File, null, ON DELETE SET NULL)
- **Project** += `content` (JSONB TipTap doc, null), `cover_file_id` (FK→File, null, ON DELETE SET NULL), `featured_rank` (int, null = not featured), `slider_pinned` (bool, default false)
- **File** += `kind` ('media'|'attachment', default 'attachment')
- Indexes: partial on `projects(featured_rank) WHERE featured_rank IS NOT NULL`, partial on `projects(slider_pinned) WHERE slider_pinned`
- UUID PKs via `gen_random_uuid()` — enable the `pgcrypto` extension in the first migration.
- Indexes: `File(project_id)`, `Project(owner_id)`, `Project(is_public)`, composite `File(status, created_at)` (for the cleanup sweep). `email` and `object_key` unique constraints provide their own indexes.
- Object key convention: `projects/{project_id}/{file_id}/{filename}` where `filename` is slugified/sanitized (no spaces, unicode, or slashes). Store the **original** name in the `filename` column for display; the key uses the safe version.

## Phases

0. **Docs sync** — DONE 2026-07-02. CLAUDE.md + all context docs updated with the expanded scope.

1. **Auth (backend)**
   - pytest harness first (test DB `tinkerer_test` + test bucket; canonical run = `docker compose exec backend pytest`). Google OAuth redirect + callback; verify token; **reject non-uni `hd` claim** (env `GOOGLE_HOSTED_DOMAIN`); upsert User; session JWT in httpOnly cookie; `get_current_user` / `get_current_user_optional` / `require_staff`; `STAFF_EMAILS` env bootstraps first staff. Test-only login endpoint gated by `AUTH_TEST_MODE` + `ENVIRONMENT=test` (for Playwright later).
   - **done =** uni account logs in, non-uni rejected, protected + staff routes gated — all covered by passing tests, incl. test-mode refusing outside test env.

2. **Files: upload / confirm / cleanup / download (backend)**
   - Migration 0002 (see schema above). Port [demo/app.py](../demo/app.py) flow for real: upload slot (owner check, declared-size, per-user quota `MAX_USER_STORAGE`, pending row, presigned POST policy with `content-length-range` — fixes the storage.py TODO), confirm (`stat_object` authoritative → ready or purge), download-url (visibility-checked, anon OK for public), batch `media-urls` per project. Cleanup sweep as a separate compose service (same image, loop command). Project delete purges MinIO objects before the row.
   - **done =** tests pass: real slot→PUT→confirm→download round-trip, oversize rejected at all 3 points, quota, sweep removes orphans, visibility matrix, delete purges objects.

3. **Projects / profiles / admin (backend)**
   - Projects CRUD + `is_public` toggle; content JSONB validated (whitelisted TipTap nodes; media file ids must belong to the project). Public reads: showcase (paginated), single project (private = 404), slider feed (pins first + random fill), featured list. Profiles: `GET /users/{id}` public, `PATCH /users/me`. Admin endpoints (`require_staff`): featured_rank set/reorder, slider_pinned toggle, user list, promote/demote, edit/hide/delete any project.
   - **done =** tests pass: ownership, content validation rejections, visibility on every read path, slider composition never leaks private, featured ordering, every admin route staff-gated.

4. **Frontend foundation (Next.js)**
   - Scaffold Next.js (App Router, TS strict) in `frontend/`, multi-stage Dockerfile (standalone), replaces placeholder in compose. **Design system: owner pastes the two TypeUI prompts (storytelling + nostalgia), then refine/review with `impeccable` + `design-taste-frontend`** → tokens, self-hosted fonts (`next/font`), motion rules. App shell (nav w/ auth state, footer, 404/error/empty states), typed API client, login wiring (same-origin through nginx).
   - **done =** stack boots with real frontend; `tsc --noEmit` + lint clean; Playwright harness runs smoke (home renders, login redirect, 404).

5. **Public pages**
   - Landing (slider: crossfade, pause-on-hover, swipe, empty state; featured grid), showcase grid, project page (server-rendered TipTap → HTML, batch media minting at request time, `<video>` presigned, Downloads section w/ re-mint-on-click), profile page.
   - **done =** Playwright: anon sees only public content, private URL 404s, slider advances, download works, profile hides private projects.

6. **Authoring**
   - My-projects dashboard (create/delete/toggle), TipTap editor (inline embeds via presigned upload w/ progress + pending→processing→ready states, attachments manager, cover picker, save = PATCH), profile edit + avatar.
   - **done =** Playwright (test-mode login): create→write→embed→publish→anon sees it; oversize shows plain limit message; toggle immediate; profile edit persists.

7. **Admin dashboard (UI)**
   - `/admin` staff-gated server-side. Curation tab (feature + reorder, pin slider, landing preview), People tab (promote/demote), Moderation tab (all projects, edit/hide/delete).
   - **done =** Playwright: student blocked from `/admin`; feature → appears on landing; promote/demote take effect.

8. **Hardening + deploy**
   - nginx public MinIO S3 route (`client_max_body_size` raised, endpoint matches public URL), bucket CORS, `pg_dump` backup service, seed script (sample projects with images), full from-scratch E2E (`down -v && up && migrate && seed && test`), light load sanity (~100 concurrent browsers).
   - **done =** app reachable via the uni public route (pending IT); upload/download works end-to-end over the real domain; presigned signatures validate; full suite green from a clean boot.
