# Borrowing log v2: Postgres + admin page (design, not built)

**Status:** designed 2026-10-19, no code yet. Replaces the Sheet-backed v1 on
this branch (`claude/material-borrowing-logging-00aff2`, epic #7). Once built,
fold this into [product.md](product.md), [design.md](design.md) and
[architecture.md](architecture.md), then delete this file.

Students and faculty who are logged in fill a simple form for materials or
equipment they take from the lab: photos, what it is, which project it's for,
when it comes back. Each entry goes straight into Postgres. Staff see every
entry on a **Loans** tab in `/admin` and can export it as CSV.

## Decisions (owner, 2026-10-19)

| # | Decision | Why |
|---|---|---|
| 1 | **Postgres is the only store.** Drop the Apps Script and Sheet. Staff get a CSV export (opens in Excel). | Reverses 2026-10-14. An in-app admin page needs a real table. Removes the shared secret, the Sheet outage path, and the #8 blocker (no Google account needs to own anything). |
| 2 | **A type field picks the flow.** *Equipment* has a return date and a return step. *Material* is consumed: no return date, and the entry is final. | Staff shouldn't chase "returns" of used-up filament. |
| 3 | **Project is optional**, picked from the borrower's own projects. "Not for a listed project" is allowed. | Links loans to real projects without blocking faculty or students with no project yet. |
| 4 | **Photos: 1 required, up to `LOAN_MAX_PHOTOS` (4)** at borrow. **1 required** when the borrower returns equipment. | Condition evidence. A single photo often misses the label or the damage. |
| 5 | **Staff can view, filter, mark returned, and export.** No edit, no delete. | Keeps the audit trail honest. Staff can still close a return the student forgot to log. |
| 6 | **Record only, no approval.** An entry counts the moment it's submitted. | It's "a simple form". Students take the item before staff could approve anyway. |
| 7 | **Item is free text, plus quantity and unit.** No catalog. | No inventory list to maintain. |
| 8 | **Rework this branch** rather than restart from main. | Keeps the working photo upload, `/borrow` shell, photo redirect and e2e scaffolding. |

Decided by me while writing this (redirect if wrong):

- **Anyone logged in can borrow.** Faculty log in as uni accounts like
  students, so there's no new role. Staff borrow too.
- **No edits after submit, for anyone.** A typo stays. This follows from #5.
  Revisit only if it bites.
- **Status is computed, never stored**, so it can't drift from the dates.
- **Units are a fixed list in code:** `pcs` (default), `m`, `g`, `kg`,
  `sheets`, `ml`, `l`. They're not a limit, so hard rule 4 doesn't apply.
- **"Today" uses the lab's timezone (`LAB_TIMEZONE`).** Containers run in UTC,
  so without it a loan reads overdue hours early or late. This is a new env
  var with no default: boot fails if it's missing.
- **No overdue emails and no item on public profiles.** Both stay out of
  scope, as in v1.

## Data model (migration `0008_loans`)

**`loans`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | **Client-generated.** A retried submit sends the same id and gets the same 201, never a duplicate. |
| `borrower_id` | FK → users, RESTRICT | From the session, never the body. |
| `type` | text | `equipment` \| `material` (check constraint). |
| `item_name` | text | 1–120 chars. |
| `description` | text | 1–500 chars, required. What it is and what it's for. |
| `quantity` | int | 1–99999. |
| `unit` | text | Check constraint against the unit list. |
| `project_id` | FK → projects, **SET NULL**, nullable | Must be owned by the borrower at submit. Deleting the project keeps the loan. |
| `due_date` | date, nullable | **Required for equipment, null for material** (check constraint). Between today and today + `LOAN_MAX_DAYS`. |
| `borrowed_at` | timestamptz | Server time, `now()`. |
| `returned_at` | timestamptz, nullable | Always null for material (check constraint). |
| `returned_by_id` | FK → users, RESTRICT, nullable | The borrower, or the staff member who marked it returned. |
| `return_note` | text, nullable | ≤500 chars. |

Indexes: `(borrower_id, borrowed_at desc)` for "my loans"; `borrowed_at` for
the admin list; partial `due_date WHERE type = 'equipment' AND returned_at IS
NULL` for the open/overdue filters.

**`loan_photos`** links photos to a loan. Photos stay ordinary `File` rows with
`kind = "loan_photo"`, owner-scoped and private to owner and staff, exactly as
in v1.

| Column | Type | Notes |
|---|---|---|
| `file_id` | PK, FK → files, CASCADE | A photo belongs to one loan. If staff delete the photo, the link goes with it. |
| `loan_id` | FK → loans, RESTRICT | Loans are never deleted. |
| `stage` | text | `borrow` \| `return`. |
| `position` | smallint | Display order. |

**Derived status** (computed in one function, used by every endpoint and the
CSV):

- material → `used`
- equipment, `returned_at` null → `out`, or `overdue` when `due_date` is
  before today in `LAB_TIMEZONE`
- equipment, `returned_at` set → `returned`

**Existing data:** none. The Sheet was never configured (#8 blocked it), so
there's nothing to migrate.

## API

Every route needs a login. Every `/admin/*` route needs staff.

| Route | Does |
|---|---|
| `POST /loans/photo` | **Kept as is.** Private upload slot, kind `loan_photo`, size capped by `LOAN_PHOTO_MAX_SIZE`. |
| `GET /loans/rules` | `{max_days, max_photos, units}` so the form never hardcodes a limit. |
| `POST /loans` | Create. Body: `id, type, item_name, description, quantity, unit, project_id?, due_date?, photo_file_ids[]`. Unknown fields are rejected. Each photo must be ready, kind `loan_photo`, owned by the caller, and not already linked. Count is 1..`LOAN_MAX_PHOTOS`. Same `id` from the same borrower returns the existing loan (201). Same `id` from someone else returns 409. |
| `GET /loans/mine` | The caller's loans. Open equipment first (soonest due), then the rest newest first. |
| `POST /loans/{id}/return` | Borrower returns their own equipment. Body: `photo_file_id`, `note?`. Returns 404 if not theirs, 400 if material, 409 if already returned. |
| `GET /admin/loans` | Paginated list. Filters: `status` (out / overdue / returned / used), `type`, `q` (item, borrower name or email), `from`/`to` on `borrowed_at`. Rows carry borrower name and email, project title, and photo ids. |
| `POST /admin/loans/{id}/return` | Staff mark returned on the borrower's behalf. `photo_file_id?` and `note?` are both optional. `returned_by_id` records who did it. |
| `GET /admin/loans/export.csv` | Same filters, no pagination. FastAPI generates it from DB rows. That's not file bytes, so hard rule 1 is respected. |

Photos are shown with the existing `GET /files/{id}/download-url`, whose
owner-or-staff check already covers `loan_photo`. **CSV photo columns link to
the existing `/loans/photo/<id>` redirect page**, so a link in a downloaded
spreadsheet still needs a staff login and never leaks a presigned URL.

**CSV injection guard:** any cell starting with `=`, `+`, `-` or `@` gets a
leading `'`, so an item named `=1+1` opens as text in Excel. This carries v1's
test case over.

## Screens

**`/borrow`** (logged in; signed-out visitors get the login redirect):

- **BORROW.LOG** window, fields in this order:
  1. **Type**: segmented Equipment / Material, first because it changes the
     form.
  2. **Photos**: thumbnail grid with "Add photo" (rear camera on phones, as in
     v1) and remove buttons, up to `max_photos`.
  3. **Item**.
  4. **Quantity** plus a **Unit** select.
  5. **Project**: the borrower's projects (from `GET /projects/mine`) plus
     "Not for a listed project".
  6. **Description**.
  7. **Return by**: equipment only, bounded by `max_days`.
  - Photos upload on **Submit**, not on pick, as in v1. A retry reuses photos
    already uploaded and the same loan `id`.
- **ON_LOAN**: open equipment, overdue badge, inline **Return** (one condition
  photo plus an optional note).
- **USED.LOG**: materials logged. **RETURNED**: collapsed. Both are read-only.
- Mobile first: ≥44px tap targets, no horizontal scroll at 360px.

**`/admin` → Loans tab** (fourth tab, after Moderation):

- Filter bar: status, type, search, date range. **Export CSV** uses the
  current filters.
- Rows: borrower, item × quantity unit, type badge, project, borrowed, due,
  status badge (overdue stands out). Rows stack on mobile.
- Expanding a row shows the photo grid (borrow and return, labelled),
  description, project link, return info (who, when, note), and **Mark
  returned** for open equipment.

All of it follows hard rule 7: `Window` containers and tokens only.

## Cleanup

Hard rule 5 covers pending uploads. v2 adds one more orphan: a photo uploaded
and confirmed (`ready`) whose loan submit never happened. **The sweep also
removes `ready` `loan_photo` files with no `loan_photos` row older than
`PENDING_MAX_AGE_SECONDS`**: MinIO object first, then the row. An hour is
plenty for a client retry.

## Removed from v1

- `apps-script/`, `backend/tests/fake_sheet.py`, and the Sheet-specific tests.
- In `loans.py`: `call_sheet`, `httpx`, and the row parsing.
- `LOANS_SCRIPT_URL`, `LOANS_SCRIPT_SECRET`, `loans_enabled`, and its
  all-or-nothing validator. Also the **503 "Borrowing isn't set up yet"
  state**: borrowing is always on now.
- The Sheet section of `docs/deployment.md` and the secrets row in
  architecture.md.
- Issue #8 is obsolete. **The owner** closes it, with a note pointing here.

**Kept:** `POST /loans/photo`, `kind = "loan_photo"` with its access rule and
staff-only delete, `/loans/photo/[id]`, `PhotoPicker`, `LOAN_MAX_DAYS`, and
`LOAN_PHOTO_MAX_SIZE`.

**New env:** `LOAN_MAX_PHOTOS` (default 4, minimum 1) and `LAB_TIMEZONE` (no
default, must be a valid IANA name).

## Build order

Each step ends green (ruff, pytest, typecheck, lint, prettier, and e2e where
the step touches UI).

1. **Schema + borrower API.** Migration `0008_loans` (up/down/up verified),
   models, `loans.py` on Postgres, `GET /loans/rules`, new env vars. Delete the
   Sheet code and env. Seed gains a few loans of each status.
2. **Orphan photo sweep** in `cleanup.py`, plus tests.
3. **Admin API:** list, filters, pagination, mark returned, CSV export with
   the injection guard.
4. **`/borrow` rework:** type toggle, multi-photo, unit, project select, and
   rules from the API.
5. **Admin Loans tab.**
6. **Docs + merge.** Fold this file into product, design and architecture.
   Update CLAUDE.md's scope line ("Sheet-backed" → Postgres) and
   deployment.md, then add a notes entry. Merge the integration branch into
   `main`.

**done =**

1. Student borrows equipment with 2 photos and a project → it shows in
   ON_LOAN and in admin with both photos and the project.
2. Student logs a material → no return date asked, and it shows as `used`.
3. Student returns with a photo → `returned`, `returned_by` is the student.
4. Staff mark another loan returned without a photo → `returned_by` is the
   staff member.
5. Overdue filter shows only open equipment past due in `LAB_TIMEZONE`.
6. CSV opens in Excel. `=1+1` shows as text. Photo links need a staff login.
7. Another student gets 404 on someone else's photo and loan.
8. Same loan `id` submitted twice gives one row.
9. A loan can't be linked to someone else's project. Deleting a linked
   project keeps the loan.
10. 0 photos and `LOAN_MAX_PHOTOS` + 1 photos are both refused.
11. An abandoned confirmed photo is swept after the cutoff.
12. A student gets 403 on every `/admin/loans*` route.
