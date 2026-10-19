# Design (UX)

The screens and behaviors. **Visual styling — typography, color, spacing, component states — is the Tinkerers' Lab blueprint-industrial system defined in CLAUDE.md hard rule 7**, with every token in `frontend/app/globals.css` and every motion timing in `frontend/lib/motion.ts`. Blueprint blue / rust / safety yellow / ink on dot-grid paper; hard offset shadows, 2px ink borders, Space Grotesk + DM Sans + JetBrains Mono; content in `Window` containers. Direction: bold yet simple, transform/opacity motion (no linear PPT fades), sharp self-hosted fonts, must not read as AI-generated. Layout inspiration: Instructables/Hackster.io build logs, read.cv profiles, editorial long-form blogs.

**The Playwright suite in `frontend/e2e/` is a design contract, not just a functional one.** It pins the `data-testid`s, exact visible strings (`Tinkerer_Lab`, `SAVED`, `CLASS_OF_<year>`, lowercase badge text like `public`/`staff`/`approved`), accessible names on buttons and labels, element ids used as selectors, and DOM shapes (`<ul>/<li>` rows, `<figure><img>` media, `<a href>…<img>` cards with raw `<img>` — never `next/image`, because presigned URLs must not hit the optimizer). Restyle freely; change any of those and the suite is telling you the redesign broke a contract.

## Screen inventory

| Screen | Who | What it does |
|---|---|---|
| Landing | Everyone (incl. anonymous) | Full-bleed auto-advancing image slider (admin pins first, random public-with-image fill; pause on hover, swipe on mobile) → admin-curated **Featured projects** grid → browse-all entry. |
| Public browse / showcase | Everyone (incl. anonymous) | Grid of **public** projects only (cover, title, owner), paginated. |
| Single project view | Everyone, gated by visibility | Blog-style write-up (rich text with inline photos/videos/diagrams), owner, then a **Downloads** section (CAD/3D/archives: name, type, size). Private projects 404 for non-owner/staff. |
| Profile page | Everyone | Student's avatar, name, program, enrollment year, description, and project grid. Anonymous visitors see public projects only; owner/staff also see private. |
| Login | Anyone | Google OAuth. Non-uni domains rejected with a clear message. Account auto-created on first uni login. |
| Project editor | Logged-in students/staff (owner) | Visual WYSIWYG (TipTap): headings, text marks, lists, inline image/video/diagram embeds (each embed runs the presigned upload flow), attachments manager for the downloads area, cover picker. |
| Profile edit | Logged-in owner | Description, program, enrollment year, avatar upload. |
| My-projects dashboard | Logged-in students/staff | The user's own projects (public and private badges), create/delete, toggle visibility. |
| Borrow (`/borrow`) | Any logged-in user (students, faculty, staff); signed-out visitors get the login redirect | Borrowing log. **BORROW.LOG** window, fields in this order: **Type** (segmented Equipment / Material, first because it changes the form), **Photos** (thumbnail grid with "Add photo", rear camera on phones via `capture="environment"`, remove buttons, 1 required up to `max_photos`), **Item**, **Quantity** plus **Unit** select, **Project** (the borrower's own projects from `GET /projects/mine`, plus "Not for a listed project"), **Description**, **Return by** (equipment only, bounded by `max_days`). Photos upload on **Submit**, not on pick, so an abandoned form leaves nothing in storage; a retry reuses photos already uploaded and the same loan `id`. **ON_LOAN** window: open equipment (soonest due first, `overdue` badge), View photos, inline **Return** (one condition photo plus an optional note). **USED.LOG**: materials logged. **RETURNED**: collapsed. USED.LOG and RETURNED are read-only. Limits (`max_days`, `max_photos`, units) come from `GET /loans/rules`, never hardcoded. Mobile-first: ≥44px tap targets, no horizontal scroll at 360px. |
| Loan photo link (`/loans/photo/<id>`) | Owner and staff | The link in the CSV export. Renders nothing: resolves the short-lived presigned URL with the viewer's own session and redirects to it. Signed-out → login; anyone else → the 404 page. |
| Admin dashboard | Staff only | Tabs: **Curation** (feature + reorder, pin to slider, landing preview), **People** (promote/demote staff), **Moderation** (all projects incl. private; edit/hide/delete), **Loans** (see below). All admin actions via UI — never code. |

### Admin Loans tab

Fourth tab, after Moderation. Staff can view, filter, mark returned and export;
there is no edit and no delete, which keeps the audit trail honest.

- **Filter bar:** status (out / overdue / returned / used), type, search (item, borrower name or email), borrowed from / to. A total count sits beside **Export CSV**, which uses the current filters. Long lists end with a **Load N more** button.
- **Rows:** borrower, item × quantity unit, type badge, project, borrowed, due, status badge (overdue stands out). Rows stack on mobile.
- **Expanding a row** shows the photo grid (borrow and return photos, labelled), description, project link, return info (who, when, note), and **Mark returned** for open equipment: an optional condition photo and an optional note. Staff can close a return the student forgot to log; the record shows who did it.

## Project content model (blog)

- Write-up stored as **TipTap JSON** on the Project. Media nodes reference **File ids**, never URLs — presigned URLs expire, so the renderer resolves ids → fresh URLs on every view (one batch mint per page render).
- Files have a `kind`: **media** (embedded in the write-up) or **attachment** (downloads area). Same upload flow for both.
- Slider/cards use the project's cover image (student-picked).

## Public-vs-private visibility behavior

- `is_public` lives on the **Project** (not per-file). Toggling it is a **pure DB write** — no file moves, no re-keying.
- **Anonymous visitor**: sees only `is_public=true` projects in browse and can open them. Private projects 404/forbidden — don't reveal they exist.
- **Owner / staff**: see private projects too.
- **Loan photos** (`kind = "loan_photo"`, borrowing log) are private to the borrower and staff, always: anyone else gets 404, even signed out. Only staff can delete one; the borrower cannot. They are never attached to a project or profile.
- A project flipping public→private immediately stops new presigned URLs being minted for non-owners. Existing short-lived URLs expire on their own (minutes) — acceptable, no permanent links to revoke.

## Upload UX (pending → ready)

The upload is multi-step under the hood (presigned PUT → confirm). Surface state honestly:

- **Uploading** — bytes transferring directly to MinIO (progress from the PUT).
- **Processing** — PUT done, confirm endpoint running (`stat_object` size check).
- **Ready** — confirmed; file visible and downloadable.
- **Failed / rejected** — oversized (caught at one of three points) or confirm error. Show the limit; let the user retry. Orphaned objects from abandoned uploads are swept by the cleanup job — the user doesn't manage that.

Oversize messaging maps to the three enforcement points: rejected before upload starts (declared-size), rejected mid-upload by MinIO (content-length-range), or rejected at confirm (actual size). All three should surface the same plain "file exceeds N GB limit" message.

**Loan photos** upload on **Submit**, not on capture: choosing a photo only previews it locally, so an abandoned form leaves nothing in storage. The photo is downscaled in the browser, uploaded through this same flow, then the loan is saved. A retry reuses the already-uploaded photo.

**Download links are not cached client-side** — presigned URLs expire. If a user leaves a project open and clicks download later, the frontend re-mints the URL on click rather than reusing a stale one (a stale URL returns 403).
