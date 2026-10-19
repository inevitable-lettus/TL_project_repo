# Product

## Who it's for

- **Staff** — makerspace employees. Manage their own projects, get admin powers via the dashboard UI (curate landing page, manage any project, promote/demote staff). Staff = admin; there is no third role.
- **Students** — university members with a Workspace account. Create blog-style projects, upload files, choose public or private, maintain a profile page. Expected scale: ~100 students.
- **Public visitors** — anyone, unauthenticated. Browse and download from public projects and profiles only.

## Problem

Makerspace project files are scattered across personal drives, chat threads, and USB sticks. There's no single browsable home, and no clean way to show work publicly while keeping some projects private. This app gives one place to store and browse project files, with a per-project privacy switch.

Each project is a **blog-style page**: the student writes the story of the build — rich text with photos, videos, and diagrams placed inline — plus a **downloads area** for files that belong to the project but aren't displayed (CAD files, 3D models, source archives). Each student gets a **public profile page** (description, program, enrollment year, avatar) showing their public projects — shareable on a resume.

The **landing page** is the shop window: a large auto-advancing image slider (admin-pinned projects first, remaining slots filled randomly from public projects with images) and a **Featured projects** section curated by staff.

## Core user stories

**Student**
- Log in with my uni Google account — an account is created automatically.
- Fill in my profile: description, program, enrollment year, avatar.
- Have my own public profile page showing my public projects.
- Create a project and write it up like a blog post: text, headings, inline photos/videos/diagrams (visual editor — no markup to learn).
- Add downloadable files (CAD, 3D models, archives) to the project's downloads area.
- Upload files directly to storage and see when they're ready.
- Toggle a project public or private.
- See all my own projects (public and private) in one dashboard.

**Staff** (staff = admin; two roles total)
- Everything a student can do.
- Use the admin dashboard (UI, no code) to: feature projects on the landing page, pin projects into the slider, promote/demote staff, and edit/hide/delete any project, and review, filter, close and export the borrowing log (Loans tab).

**Public visitor**
- Land on the slider + featured projects; browse the public showcase without logging in.
- Open a public project, read its write-up, and download its files.
- View any student's profile page (only their public projects show).
- Never see private projects (they don't appear and can't be opened).

## Borrowing log (re-added 2026-10-14, moved to Postgres 2026-10-19)

**Who:** anyone logged in (students, faculty, staff) logs what they take from the lab. Staff see every entry on the **Loans** tab in `/admin` and export it as CSV (opens in Excel). Records are stored in the database; nothing lives in a spreadsheet or Google account.

**Problem:** the lab has no record of who has which material or equipment, or in what condition it went out and came back.

**Rules (settled by the owner, 2026-10-19)**

- **Type picks the flow.** _Equipment_ has a return date and a return step. _Material_ is consumed: no return date, and the entry is final (status `used`).
- **Photos:** 1 required, up to `LOAN_MAX_PHOTOS` (4) when borrowing; 1 required when returning equipment.
- **Project is optional,** picked from the borrower's own projects. "Not for a listed project" is allowed.
- **Item is free text** plus quantity and unit (`pcs` default, `m`, `g`, `kg`, `sheets`, `ml`, `l`). No catalog.
- **Record only, no approval.** An entry counts the moment it is submitted.
- **No edits after submit,** for anyone. A typo stays.
- **Staff can view, filter, mark returned and export.** No edit, no delete.

**User stories**

- _Borrower:_ log equipment with photos, item, quantity, project, description and return-by date; log a material with no return date.
- _Borrower:_ see my open loans (overdue ones flagged) and return one with a condition photo and an optional note.
- _Staff:_ audit every loan with all its photos, filter by status, type, text and date, mark a forgotten return as returned, and export the filtered list as CSV. Loan photos are private to the borrower and staff.

**Out of scope:** showing loans on the student profile, overdue reminders/emails, an item catalog, inventory counts, editing or deleting a loan.

## Other lab operations — removed 2026-08-02

Machines directory, machine booking and issue reporting (and the first tool
checkout) were built in v1.1 and have been **removed**: they belong to a
different student's project. See the note in [architecture.md](architecture.md)
for exactly what was taken out.

## Out of scope for v1 (explicit — do not assume these)

- File versioning / history.
- In-app file preview or editing.
- Comments, likes, or any social features.
- **Disk quota enforcement** — deferred until IT confirms VM disk size. Limits exist as env vars (`MAX_FILE_SIZE` etc.) with a 2GB/file default; per-user/project quota enforcement is wired but values are placeholders.
- **MinIO object backup automation** — deferred (pg_dump covers metadata only). Known risk, see [architecture.md](architecture.md).
- **User offboarding / hard-delete** — `owner_id ON DELETE RESTRICT` means a user who owns projects can't be deleted. Known limitation.
- **Search** beyond basic listing/browse.
