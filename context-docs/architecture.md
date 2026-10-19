# Architecture

How the system's parts talk. Read [CLAUDE.md](CLAUDE.md) first for the hard rules these flows must obey.

## Component map

```mermaid
graph TD
  Browser -->|HTTPS 80/443| nginx
  nginx -->|/| Frontend[Next.js frontend]
  nginx -->|/api| Backend[FastAPI backend]
  nginx -->|/minio public S3 route| MinIO
  Backend --> DB[(PostgreSQL)]
  Backend -->|sign URLs, stat, delete| MinIO[(MinIO)]
  Browser -.->|presigned PUT/GET, direct bytes| MinIO
```

Key point: the browser talks to MinIO **directly** for file bytes (the dotted line). FastAPI only authorizes requests and mints presigned URLs — it never proxies bytes.

## Upload flow

Presigned PUT + client-confirms + cleanup. Steps:

1. Client requests an upload slot (project id, declared filename, declared size, mime).
2. Backend **declared-size check** (advisory): reject early if `declared_size > MAX_FILE_SIZE` or over quota.
3. Backend writes a `File` row with `status='pending'`, the sanitized `object_key`, and the original `filename`.
4. Backend issues a **presigned PUT URL** with a `content-length-range` policy so MinIO itself rejects an oversized upload (enforcement #2).
5. Browser PUTs the bytes **directly to MinIO**.
6. Browser calls the **confirm endpoint** for that File id.
7. Confirm endpoint: verify the caller owns the project (else reject), then `stat_object` for the **authoritative actual size** (enforcement #3). If over the limit → delete the MinIO object + the row, return error.
8. Otherwise flip `status='ready'`. File is now visible.

Three size enforcement points: (1) declared-size pre-check, (2) `content-length-range` on the presigned policy, (3) `stat_object` at confirm — #3 is authoritative.

## Download flow

Presigned-for-everything. No permanent public URLs.

1. Client requests a file (or a project's files).
2. Backend **authorizes by visibility, not by login**:
   - Project `is_public=true` → allow even an anonymous caller (no JWT).
   - Project private → require a valid JWT **and** caller is owner or staff.
3. Backend mints a **short-lived presigned GET URL**.
4. Browser fetches bytes directly from MinIO.
5. **No client-side URL caching.** URLs expire; re-mint on demand. A stale URL returns 403 — the frontend must re-request, not reuse.

> Note: "every fetch goes through FastAPI auth" means auth **checks visibility**, it does not **require login**. Public visitors are unauthenticated and still get URLs for public projects. The bucket is never anonymously readable — the presigned signature is the only way in.

## Blog content + media resolution

- Project write-ups are **TipTap JSON** stored in `projects.content` (JSONB). The backend validates on save: whitelisted node types only, and every media node's file id must belong to that project (rejects foreign/unknown ids).
- Media nodes store **File ids, never URLs** — presigned URLs expire in minutes, so a stored URL would rot. Rendering a project page: fetch the project → collect embedded file ids → one batch call (`POST /projects/{id}/media-urls`) mints short-lived GET URLs for all of them → render. Videos play from a presigned `<video src>`.
- `files.kind` separates **media** (embedded in the write-up) from **attachment** (downloads area). Both use the identical presigned upload flow; only where the UI surfaces them differs.
- Avatars (`users.avatar_file_id`) and covers (`projects.cover_file_id`) are ordinary File rows through the same flow — no separate path.

## Landing curation model

- `projects.slider_pinned` (bool): staff pins a project into the landing slider. Slider feed = pinned public projects first, remaining slots filled randomly from public projects with a cover image. **Private projects never appear**, pinned or not.
- `projects.featured_rank` (nullable int): non-null = featured, ordered ascending. Staff sets/reorders via the admin dashboard.
- Both are pure DB writes; curation of a project that later goes private simply drops out of the feeds (the queries filter `is_public`).

## Cleanup job lifecycle

Mandatory cron. Sweeps orphans left when a browser uploads but never confirms (or never uploads after a row is created).

1. Select `File` rows where `status='pending' AND created_at < now() - 1 hour`. Uses the composite `File(status, created_at)` index.
2. For each: delete the MinIO object (ignore "not found" — the upload may never have landed).
3. Delete the row.

## Auth / JWT flow

```mermaid
sequenceDiagram
  Browser->>Google: OAuth login
  Google-->>Browser: ID token (incl. hd claim)
  Browser->>Backend: POST token
  Backend->>Backend: verify token + reject if hd != uni domain
  Backend->>DB: upsert User (email unique)
  Backend-->>Browser: session JWT in httpOnly cookie
  Browser->>Backend: subsequent requests (cookie sent automatically)
  Backend->>Backend: get_current_user dependency decodes JWT
```

- **`hd` claim check is non-negotiable** — without it any Gmail account logs in.
- JWT stored in an **httpOnly cookie** (not localStorage) to limit XSS token theft. Doesn't conflict with MinIO — presigned URLs are signature-authed, not cookie-authed.
- Keep a clean **`get_current_user` dependency** so the auth mechanism stays swappable.
- **Role is not in the Google token.** Plan for manual staff assignment via an allowlist/admin table. Default new users to `student`.

## Borrowing log

Logged-in students, faculty and staff record materials and equipment they take
from the lab. Entries live in Postgres; staff read them on the **Loans** tab in
`/admin` and export them as CSV. A self-contained module (`/borrow` page,
`/loans/*` and `/admin/loans*` API, migration `0008_loans`).

```
Browser ──photo bytes──▶ MinIO              (existing presigned POST + confirm flow)
Browser ──JSON──▶ FastAPI /loans/*, /admin/loans* ──▶ Postgres (loans, loan_photos)
Staff CSV "photo" cells ──link──▶ <PUBLIC_URL>/loans/photo/<id> (frontend) ──▶ presigned GET (owner/staff only)
```

**Tables**

- `loans`: `id` (uuid, **client-generated**, so a retried submit returns the same 201 and never a duplicate), `borrower_id` (from the session, never the body; RESTRICT), `type` (`equipment` | `material`), `item_name` (1–120), `description` (1–500, required), `quantity` (1–99999), `unit`, `project_id` (nullable, SET NULL, must be owned by the borrower at submit), `due_date` (required for equipment, null for material), `borrowed_at` (server time), `returned_at` (always null for material), `returned_by_id` (the borrower, or the staff member who closed it), `return_note` (≤500). Check constraints enforce the type rules and the unit list.
- `loan_photos`: `file_id` (PK, FK to `files`, CASCADE), `loan_id` (RESTRICT), `stage` (`borrow` | `return`), `position`. Photos stay ordinary `File` rows with `kind = "loan_photo"`, visible to their owner and staff only. Loans are never deleted.
- **Status is computed, never stored**, in one function used by every endpoint and the CSV: material is `used`; equipment with no `returned_at` is `out`, or `overdue` when `due_date` is before today in `LAB_TIMEZONE`; equipment with `returned_at` is `returned`.

**API** (every route needs a login; `/admin/*` needs staff)

| Route | Does |
|---|---|
| `POST /loans/photo` | Private upload slot, kind `loan_photo`, size capped by `LOAN_PHOTO_MAX_SIZE`. |
| `GET /loans/rules` | `{max_days, max_photos, units}`, so the form never hardcodes a limit. |
| `POST /loans` | Create. Unknown fields rejected. 1..`LOAN_MAX_PHOTOS` photos, each ready, kind `loan_photo`, owned by the caller and not already linked. Same `id` from the same borrower returns the existing loan (201); from someone else, 409. |
| `GET /loans/mine` | The caller's loans: open equipment first (soonest due), then the rest newest first. |
| `POST /loans/{id}/return` | Borrower returns their own equipment with one photo and an optional note. 404 if not theirs, 400 if material, 409 if already returned. |
| `GET /admin/loans` | Paginated list. Filters: `status`, `type`, `q` (item, borrower name or email), `from`/`to` on `borrowed_at`. |
| `POST /admin/loans/{id}/return` | Staff mark returned for the borrower; photo and note optional; `returned_by_id` records who. |
| `GET /admin/loans/export.csv` | Same filters, no pagination. Generated from DB rows, not file bytes, so hard rule 1 holds. |

- **Photos** are shown with the existing `GET /files/{id}/download-url`, whose owner-or-staff check already covers `loan_photo`. CSV photo columns link to `/loans/photo/<id>`, so a link in a downloaded spreadsheet still needs a staff login and never leaks a presigned URL.
- **CSV injection guard:** any cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so an item named `=1+1` opens as text in Excel.
- **Orphan sweep:** besides pending uploads (hard rule 5), the cleanup job removes `ready` `loan_photo` files with no `loan_photos` row older than `PENDING_MAX_AGE_SECONDS` (MinIO object first, then the row). This covers a photo uploaded and confirmed whose loan submit never happened.
- **Env vars:** `LAB_TIMEZONE` (IANA name such as `Asia/Kolkata`; **no default, boot fails if missing or invalid**; containers run in UTC, so without it a loan reads overdue hours early or late), `LOAN_MAX_DAYS` (furthest return-by date, default 30), `LOAN_MAX_PHOTOS` (default 4, minimum 1), `LOAN_PHOTO_MAX_SIZE` (bytes per photo).
- No overdue emails and no loans on public profiles: both stay out of scope.

## Removed: lab ops (machines, booking, issue reporting)

Built as "Track B" in v1.1, then **removed on 2026-08-02** — day-to-day lab
operations belong to a different student's project, not this repo. Tool
checkout was among them; **borrowing was re-added on 2026-10-14** as the log
above (moved from a Sheet to Postgres on 2026-10-19). The rest stays removed.

Gone: the `/machines`, `/bookings`, `/checkouts`, `/issues` routers, the
`bookings`/`checkouts`/`issues` tables (dropped in migration
`0007_drop_lab_ops`, whose `downgrade()` recreates the schema if it is ever
wanted back), the Google-Sheet-as-CMS read path, SMTP mail, and their env
vars (`MACHINES_*`, `BOOKING_*`, `LAB_OPEN`/`LAB_CLOSE`, `TOOL_CATEGORIES`,
`SMTP_*`). Don't reintroduce machines, booking or issue reporting here.

## Docker / nginx topology

- **Only nginx publishes ports** (80/443). frontend, backend, db, minio are internal on the Docker network.
- **Exception: MinIO needs a public S3 route through nginx**, because the browser hits presigned URLs directly. Its endpoint can't be internal-only or uploads/downloads break.
- **MinIO's configured public endpoint must match the public URL nginx serves**, or presigned signatures won't validate.
- Raise nginx **`client_max_body_size`** on the MinIO route, or large presigned PUTs die at the proxy before reaching MinIO.
- **Bucket CORS must allow the frontend origin on PUT and GET**, or browser uploads/downloads fail with CORS errors.
- `depends_on` controls boot order but **does not wait for DB readiness** — the backend needs retry-on-connect for Postgres.
- Backups: `pg_dump` on cron.

## Secrets

All in a gitignored `.env`, read via Compose `env_file`.

| Secret | Used by |
|---|---|
| DB credentials | backend, db |
| MinIO root credentials | backend, minio |
| Google OAuth client secret | backend |
| JWT signing secret | backend |

## Known gaps (loud, on purpose)

- **MinIO objects are not backed up.** `pg_dump` saves metadata only. Single-node MinIO on one VM = single point of failure; if the disk dies, every file is gone and the DB points at nothing. Backup strategy is **deferred (TODO)** pending IT confirming VM/storage capabilities — same as disk quotas.
- **Public presigned URLs defeat browser/CDN caching.** Every public image re-fetches behind a fresh mint. Accepted for v1; optimize (batch minting, longer public TTL, thumbnail caching) only if it actually hurts.
- **`owner_id ON DELETE RESTRICT` blocks offboarding.** A user who owns projects can't be hard-deleted. Known v1 limitation; revisit post-v1.
