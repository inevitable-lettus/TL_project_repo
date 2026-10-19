# Developer Notes (plain language)

A running explanation of what the project is and what each piece does — in
everyday words, light on jargon. Updated after every task alongside `handoff.md`.
`handoff.md` is the terse checklist; this file is the "explain it to me" version.

---

## The big picture

We're building a website for the makerspace where people upload project files
(photos, CAD files, PDFs, etc.) and browse them. Some projects are public
(anyone can see), some are private (only the owner and staff).

The system is made of several **separate programs** that each do one job and talk
to each other over the network:

- **Frontend** — the website pages you see in the browser. (Real version comes
  later; right now it's a placeholder page.)
- **Backend** — the "brain". Decides who's allowed to do what, talks to the
  database, hands out permission slips for file uploads/downloads. Built with
  **FastAPI** (a Python tool for building web APIs).
- **Database** — the filing cabinet for *information about* projects/files/users
  (titles, owners, who's public). Uses **PostgreSQL**.
- **File storage** — where the actual file *bytes* live. Uses **MinIO**.
- **nginx** — the front door / receptionist. Everything from the outside world
  comes through it, and it routes each request to the right program.

Important design rule: the backend never touches the actual file bytes. When you
upload, the backend gives your browser a temporary signed link and your browser
sends the file *straight to MinIO*. Same for downloads. (More on this when we
build those features.)

---

## Jargon explained

### Docker (containers & images)
A **container** is a lightweight, self-contained box that holds a program plus
everything it needs to run (its exact version of Python, its libraries, etc.).
Think of it like a shipping container: the same box runs identically on your
laptop, a teammate's machine, or the university server — no "works on my machine"
surprises.

An **image** is the frozen blueprint; a **container** is a running copy of that
blueprint. You build an image once, then start containers from it.

### Docker Compose
Our app isn't one program — it's five (frontend, backend, database, file storage,
nginx). Starting and wiring all five by hand every time would be painful.
**Docker Compose** is a single file (`docker-compose.yml`) that describes all five
boxes, how they connect, and what settings they get. Then one command —
`docker compose up` — starts the whole system at once. It's the recipe card for
the entire stack.

In our compose file each program is a **service**. They live on a private
network and can reach each other by name (the backend talks to the database just
by calling it `db`). Only nginx is reachable from outside — the database and file
storage are sealed off from the public internet (a security choice).

### Volumes
Containers are disposable — delete one and its internal files vanish. That's bad
for a database. A **volume** is a storage drawer that lives *outside* the
container and survives restarts. Our database and file storage each get a volume
(`pgdata`, `miniodata`) so data isn't lost when containers restart.

### nginx / "reverse proxy"
**nginx** sits at the front and forwards incoming web requests to the right
internal program. A request to `/api/...` goes to the backend; everything else
goes to the frontend. This is called a **reverse proxy** — outsiders only ever
talk to nginx, never directly to the backend or database. One guarded entrance
instead of five open doors.

### FastAPI
The Python framework we use to write the backend. It lets us define **endpoints**
— URLs the frontend can call, like `/api/health` (which just replies "ok, I'm
alive"). Later we'll add endpoints like "create a project" or "give me an upload
link".

### PostgreSQL (the database)
A **relational database**: data lives in tables (like spreadsheets) with rows and
columns, and tables can reference each other. We have three tables:
- **users** — who has logged in (name, email, role: student or staff).
- **projects** — each project's title, description, owner, and public/private flag.
- **files** — each uploaded file's name, where it lives in storage, size, and
  whether it's finished uploading.

The tables are linked: a project points to its owner (a user), and a file points
to its project. The database enforces these links so we can't, say, have a file
belonging to a project that doesn't exist.

### SQLAlchemy (the ORM)
Databases speak **SQL** (a query language). Writing raw SQL strings everywhere is
error-prone. **SQLAlchemy** is an **ORM** (Object-Relational Mapper): it lets us
describe our tables as normal Python classes (`User`, `Project`, `File`) and work
with them as Python objects. SQLAlchemy translates that into the SQL the database
understands. So instead of hand-writing `INSERT INTO users ...`, we create a
`User(...)` object and SQLAlchemy handles the SQL. Safer and easier to read.

(We chose the *synchronous* flavor of SQLAlchemy — simpler to read and debug, and
plenty fast for makerspace-sized traffic.)

### Alembic (migrations)
As the project grows we'll change the database shape — add a table, add a column.
A **migration** is a versioned, repeatable script that makes such a change. It's
like *git for the database structure*: each change is recorded, can be applied
going forward (`upgrade`) or undone (`downgrade`), and runs the same way on every
machine. **Alembic** is the tool that manages these migration scripts for
SQLAlchemy. Our first migration creates those three tables.

### MinIO
Where the real file bytes are stored. It behaves like Amazon S3 (the well-known
cloud file store) but runs on our own server. We keep one private bucket (a
"bucket" = a top-level container for files); nothing in it is publicly readable.
Access is only ever granted through short-lived signed links the backend hands
out. (The upload/download machinery comes in a later task.)

### TipTap (the visual editor)
Students write project pages like a blog post. **TipTap** is the editor library we
use — it works like Google Docs: you type, make headings, and drop photos/videos
right into the text. No special markup to learn. Behind the scenes the document
is saved as structured **JSON** (a machine-readable outline of "heading, then
paragraph, then image #123..."), not as raw HTML. That matters because embedded
images are stored as *file references*, and the page swaps in fresh temporary
links every time it's viewed (the signed links expire in minutes, so we never
save a link itself).

### JSONB
Postgres column type for storing JSON documents (like the editor content above)
inside a normal table row, in a form the database can search efficiently. Our
`projects.content` column is JSONB.

### E2E tests (Playwright)
Two layers of tests keep the app trustworthy for ~100 students:
- **Backend tests (pytest)** — call the API directly and check every rule
  (visibility, size limits, permissions). Fast, run after every phase.
- **End-to-end tests (Playwright)** — a robot browser that clicks through the
  real site like a student would: log in, write a project, upload a photo,
  publish, check a stranger can see it. Catches bugs the API tests can't (broken
  buttons, wrong states shown).
Google login can't run in a robot browser, so tests use a special login door
that only opens when the app is started in test mode — it's impossible to
enable in production.

### `.env` and secrets
Passwords and keys (database password, storage keys) must never be hard-coded or
committed to git. They live in a `.env` file that git ignores. Compose reads it
and injects those values into the containers at startup. `.env.example` is a
committed template showing *which* values are needed, with safe dummy defaults.

### Healthchecks & "retry on connect"
When everything boots at once, the database might still be warming up when the
backend tries to connect. Two safeguards:
- **Healthcheck** — Compose keeps pinging the database/storage and won't start the
  backend until they report "healthy".
- **Retry on connect** — the backend also retries the connection a few times on
  startup instead of crashing immediately. Belt and suspenders, so a slow start
  never takes the app down.

---

## What's been built so far

### Task 1 — Project skeleton (before these notes)
Bare FastAPI backend with a `/health` endpoint and a MinIO helper module. MinIO
was started by hand for local testing. No database, no Compose yet.

### Task 2 — Docker skeleton + database (milestones 1 & 2)
**Goal:** turn the loose pieces into one reproducible system with a real database.

What landed:
- **`docker-compose.yml`** — defines all five services (nginx, frontend, backend,
  database, file storage) so `docker compose up` boots the whole stack. Only
  nginx is exposed to the outside; database and storage are sealed off. Database
  and storage each got a volume so their data persists.
- **nginx config** — routes `/api/...` to the backend, everything else to the
  frontend placeholder.
- **Backend Dockerfile** — the blueprint for packaging the backend into a
  container.
- **Database layer** — SQLAlchemy set up (`db.py`), with the three tables
  described as Python classes (`models.py`).
- **Alembic + first migration** — creates the `users`, `projects`, `files`
  tables, with the right links and indexes (an **index** is like a book's index —
  it makes lookups fast).
- **Startup safety** — backend now retries the database connection and checks the
  storage bucket exists, failing loudly if something's misconfigured.

**Verified working:** the whole stack boots; the health endpoint answers through
nginx; the migration creates the tables correctly and can be cleanly undone; only
the front door (port 80) is reachable from outside.

**How to run it:**
```
cp .env.example .env          # one-time: create your local secrets file
docker compose up -d --build  # start everything
# visit http://localhost/  and  http://localhost/api/health
docker compose exec backend alembic -c backend/alembic.ini upgrade head  # create tables
docker compose down           # stop everything (add -v to also wipe data)
```

### Task 3 — Scope expansion + docs sync (2026-07-02)
The product grew from "file locker with a browse page" to a proper showcase site:
- **Projects are blogs** — written in a visual editor (see TipTap above), with
  photos and videos inline, plus a **downloads area** for files that shouldn't be
  displayed (CAD files, 3D models, zips).
- **Student profiles** — auto-created on first login; students add a description,
  program, year, and photo. Profile pages are public and shareable.
- **Landing page** — a big auto-rotating image slider (staff can pin projects
  into it; the rest fill in randomly from public projects) and a staff-curated
  "Featured projects" section.
- **Admin happens in the browser** — staff get a dashboard for featuring,
  pinning, promoting staff, and moderating. No code needed to run the platform.
- **Design direction** — two TypeUI prompts (storytelling structure + nostalgia
  style) set the look; two installed design skills review and refine it.
All context docs were updated; `handoff.md` has the new phase list.

### Phase 1 — Login (auth) (2026-07-02)
People sign in with their university Google account; everyone else is turned
away. How it works, in plain terms:

- Clicking "log in" sends you to Google. Google asks you to pick an account,
  then sends you back to us with a one-time code. Our backend trades that code
  for a verified statement from Google saying who you are (name, email, and
  which organization the account belongs to).
- The **organization check** is the security core: Google marks Workspace
  accounts with their domain (the `hd` field). If it isn't our university's
  domain — including personal Gmail, which has none — login is refused and no
  account is created.
- On a first successful login an account is **created automatically** (role:
  student). Emails listed in the `STAFF_EMAILS` setting become staff instead —
  that's only for bootstrapping the first admins; after the admin dashboard
  exists, staff manage roles there.
- To remember you, the backend issues its own signed pass (a **JWT**) and stores
  it in an **httpOnly cookie** — a cookie page scripts can't read, which blunts
  token-theft attacks. Every later request just carries the cookie.
- Endpoints: `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/me`
  ("who am I?"), plus `/auth/test-login` — the robot-browser door described
  under *E2E tests* above, which physically refuses to open unless the app is
  started in test mode.

**Testing (new, permanent):** `backend/tests/` now holds a pytest suite that
runs *inside the backend container* against a scratch database
(`tinkerer_test`) it creates itself: `docker compose exec backend pytest`.
18 tests cover: non-uni rejection, session issue/expiry/forgery, staff
bootstrap, double-login not duplicating accounts, staff-only route gating, and
the test-door staying shut outside test mode. Every phase from here ends with
its tests green.

**Still needed from us:** a real Google OAuth client (ID + secret) and the
university domain in `.env` — placeholders sit there now, so real login won't
work until those are filled (the automated tests don't need them).

### Phase 2 — Files (2026-07-02)
The real upload/download machinery, promoted from the demo into production code:

- **Second migration.** The database gained the new-scope columns: profile
  fields on users, blog content + cover + featured/slider flags on projects,
  and a `kind` on files (*media* = shown inside the write-up, *attachment* =
  the downloads area). Applied, rolled back, and re-applied cleanly.
- **Upload** (`files.py`): ask for a slot → backend checks you may edit that
  project, checks the declared size against `MAX_FILE_SIZE` *and* your total
  storage against `MAX_USER_STORAGE`, writes a pending row, and returns a
  signed **upload form** for MinIO. That form carries a size range MinIO
  enforces itself — so even a lying client can't push more bytes than allowed
  (enforcement #2 of 3). Then confirm: the backend asks MinIO for the *actual*
  size (enforcement #3, the authoritative one) and either flips the file to
  ready or deletes both the bytes and the row.
- **Download**: mint-on-demand signed links, gated by visibility (public
  project → anyone, private → owner/staff only; outsiders get a 404 that
  doesn't reveal the project exists). Plus a **batch endpoint** that resolves
  all the images/videos of one project page in a single call — blog pages will
  embed many.
- **The janitor** (`cleanup.py`): its own little container next to the backend,
  waking every 10 minutes to delete uploads that were started but never
  confirmed (bytes first, then the row) once they're an hour old.
- **Tests: 31 passing**, now covering the full upload→confirm→download round
  trip against the real MinIO, all three oversize rejection points, quota,
  the visibility matrix (anonymous/stranger/owner/staff × public/private),
  the janitor sweep, and object purge on project delete.

### Phase 3 — Projects, profiles, admin (backend) (2026-07-02)
The whole "brain" of the site is now in place — every button the future pages
need already has a working endpoint behind it:

- **Projects**: create, edit, delete, and the public/private toggle. The blog
  write-up is saved as editor JSON, and the backend *validates* it on save:
  only known block types are allowed (no sneaking in raw HTML), links must be
  normal web/mail links (blocks the `javascript:` trick), and every embedded
  image/video must be a file that really belongs to that project — you can't
  reference someone else's uploads. Deleting a project wipes its storage bytes
  first, then the records.
- **Feeds for the landing page**: a slider feed (staff-pinned projects first,
  the rest filled randomly from public projects that have a cover image) and a
  featured feed (staff-ordered). Private projects can never leak into either.
- **Profiles**: anyone can view `/users/{id}` — name, bio, program, year,
  avatar, and their *public* projects (owners and staff also see private ones).
  Email addresses are never shown. Students edit their own profile via
  `PATCH /users/me`.
- **Avatars**: a small schema change (migration 0003) lets a file belong to a
  *user* instead of a project, since profile photos aren't part of any project.
  Same upload machinery; must be an image; replacing your photo deletes the old
  one properly.
- **Admin endpoints** (staff only): search users, promote/demote staff (you
  can't demote *yourself* — otherwise the last admin could lock everyone out),
  set the ordered featured list, pin/unpin slider projects. Only public
  projects can be featured or pinned.
- **Tests: 53 passing** — ownership rules, the content validator's rejections,
  visibility on every read path, slider composition, featured ordering, and
  every admin route confirmed staff-only.

### Phase 4a — Frontend scaffold (2026-07-02)
The real website skeleton now runs in Docker instead of the placeholder page:

- **Next.js** (the React framework) app in `frontend/`, built into its own
  container and served through nginx like everything else. One
  `docker compose up -d --build` boots the entire site.
- **App shell**: header with login/logout (it asks the backend "who am I?" and
  shows My projects / Admin links accordingly), footer, and a proper
  404 page. The landing page is a stub until the design pass.
- **API client** (`frontend/lib/api.ts`): one typed module the whole site uses
  to talk to the backend — pages never hand-roll requests. It also contains
  the direct-to-storage upload helper with a progress callback.
- **Robot-browser tests** (Playwright): a headless Chrome clicks through the
  real running site. 4 smoke tests pass (shell renders, login redirects to
  Google, 404 works, backend reachable). Later phases add full journeys.
- Gotchas we hit (recorded so nobody re-hits them): the npm lockfile must be
  generated for Linux (done via a throwaway container), and nginx needs a
  restart after the frontend container is recreated or it 502s (proper fix in
  Phase 8).

### Phase 4b — the design pass (2026-07-03)
The site now has its visual identity: a **nostalgic desktop-OS look** — a warm
orange "wallpaper" behind everything, content presented inside bordered
"windows" with title bars (like a vintage Mac/Windows desktop), cream paper
surfaces in light mode and a CRT-at-night espresso in dark mode.

- The look comes from the **nostalgia** design prompt the owner installed as a
  project skill (`.claude/skills/nostalgia/` — a folder of spec files listing
  every color, font size, border, and shadow). The second prompt
  (**storytelling**, for page narrative) was never supplied, so page structure
  follows the screen inventory in design.md instead.
- **Design tokens** (named colors like `heading`, `border-default`) live as CSS
  variables in one file (`globals.css`). Light and dark values sit side by
  side and the browser picks automatically — components never hardcode colors.
- **Fonts are self-hosted**: Newsreader (literary serif, headings), DM Sans
  (clean sans, body/UI), Geist Mono (code/labels). Next.js downloads them at
  build time and serves them from our own domain — no Google requests from
  visitors' browsers.
- **Reusable building blocks** (`components/ui.tsx`): `Window` (title bar +
  body), `Panel`, `Button` (five retro variants with a pressed-key effect),
  `SysLabel` (mono metadata text). Later pages compose these instead of
  re-styling from scratch.
- Verified in light and dark mode; all checks and smoke tests green.

### Phase 5 — public pages (2026-07-04)
Visitors can now actually browse the site:

- **Landing page**: a slideshow of pinned/public projects (crossfades every
  5 s, pauses when your mouse is over it, swipeable on phones) above the
  staff-curated featured grid.
- **Browse page** (`/projects`): a paginated grid of every public project,
  cover images included.
- **Project page**: the blog-style write-up. The server turns the stored
  TipTap document into HTML, mints *one* batch of short-lived image/video
  URLs per page view, and shows a `DOWNLOADS.DIR` window for attachments —
  clicking Download asks the backend for a *fresh* link each time, so links
  in old tabs never go stale. Private projects show a "private" badge to
  their owner and a plain 404 to everyone else.
- **Profile page** (`/users/{id}`): a student's bio plus their projects —
  strangers see only public ones; the owner (and staff) also see private.
- **Browser → MinIO route**: nginx now forwards `/tinkerer-lab/...` straight
  to MinIO, so presigned upload/download URLs work from a real browser. The
  backend signs those URLs for the *public* hostname (new
  `MINIO_PUBLIC_ENDPOINT` env var) while still talking to MinIO internally.
- **Tests**: 11 Playwright journeys (visibility rules, a real
  upload→download round-trip, slider auto-advance) plus 53 backend tests,
  all green.

### Phase 6 — authoring (2026-07-04)
Students can now write their project pages themselves:

- **My-projects dashboard** (`/dashboard`): create a project (dropped straight
  into the editor), flip it public/private with one click (takes effect
  immediately), or delete it (with a confirm — deletion also removes every
  stored file first, so no storage leaks).
- **The editor**: a visual write-up editor (TipTap — the same rich-text
  toolkit Substack-style editors use). Toolbar for headings, bold/italic/etc.,
  lists, quotes, code, links. Clicking **+IMG/VID** uploads a photo or video
  straight to storage with a progress bar (uploading → processing → done)
  and drops it into the text. Save stores the document; the server re-checks
  everything against the same whitelist as before.
- **Cover picker**: any image embedded in the write-up can be set as the
  project's card/slider image — including one embedded seconds ago.
- **Attachments manager**: add/remove the downloadable files (CAD, archives).
  Removing a file that's still embedded in the write-up is refused with a
  clear message — otherwise the page would show a broken image. This needed
  one new backend endpoint (`DELETE /files/{id}`), which deletes the stored
  object *before* the database row (same leak-proof order as everywhere).
- **Profile editing** (`/settings`): name, program, enrollment year, bio, and
  an avatar upload with live preview. "Edit profile" / "Edit" buttons appear
  on your own profile and project pages.
- **Oversize handling**: too-big files show the plain "exceeds limit" message
  at all three enforcement points. The local dev `.env` uses a 10 MB limit so
  the robot-browser test can actually try an oversized file (production keeps
  2 GB).
- **Tests**: 4 new Playwright journeys (15 total) + 56 backend tests, green.

### Phase 7 — admin dashboard (2026-07-04)
Staff now run the site entirely from the browser — no code, ever:

- **`/admin`** is staff-only. A student (or logged-out visitor) who types the
  URL gets the same 404 as any wrong address — it doesn't even admit the page
  exists.
- **Curation tab**: pick which public projects are *featured* on the landing
  page and drag their order (up/down buttons); pin projects to lead the
  slideshow (projects without a cover image are marked, since the slider
  can't show them); a preview link opens the landing page as visitors see it.
- **People tab**: search anyone by name/email, promote to staff or demote.
  The "Demote" button is disabled on yourself — the backend refuses it too —
  so the last staff member can never lock everyone out.
- **Moderation tab**: every project on the site, including private ones.
  Staff can open any project in the same editor students use, hide a public
  project instantly (one click → it 404s for visitors), or delete it
  outright (files purged first, as always).
- One new backend endpoint (`GET /admin/projects`) lists all projects for
  the moderation view; everything else reuses APIs from Phase 3.
- **Tests**: 4 new Playwright journeys (19 total) + 57 backend tests, green.

### Phase 8 — hardening (2026-07-04)
The operational safety net, plus a real performance fix:

- **nginx no longer needs babysitting**: it used to cache each container's
  internal address at startup, so recreating the frontend meant restarting
  nginx too. It now asks Docker's DNS on every request (a standard nginx
  variable trick), so containers can be rebuilt freely.
- **Daily database backups**: a small `backup` service runs `pg_dump` into
  the `./backups/` folder on the host (survives even a full
  `docker compose down -v`), keeping two weeks of dumps. Verified restorable.
- **Seed script** (`python -m backend.app.seed`): fills a fresh install with
  two students and six sample projects — cover images generated from pure
  Python, write-ups, attachments, featured picks, slider pins — so demos and
  testing never start from a blank site. Refuses to run twice.
- **Load test found a real bug**: with 100 simultaneous visitors the old
  setup collapsed completely (every request timed out — the backend allowed
  only 15 database connections and one worker process). Now: 4 backend
  workers, 80-connection budget (Postgres allows 100), and the same 100-visitor
  storm finishes in ~1.4 s with zero errors.
- **From-scratch proof**: wipe everything (`down -v`), rebuild, migrate,
  seed — all 57 backend tests and 19 browser journeys pass.
- Bucket CORS turned out unnecessary: browser, API, and file storage all
  share one origin through nginx.

## v1.1 (started 2026-07-08)

Two tracks (details in handoff.md): **A** — visual/UX pass plus small
"thumbnail" copies of cover images (generated in the browser before upload,
so pages stop downloading full-size photos just to draw a card); **B** — lab
operations to outdo the admin's Sheets-based platform: machine directory with
live status edited in a Google Sheet, machine slot booking, tool checkout,
issue reporting — all with real login instead of typed-in emails.

- **Phase A1**: the editor always capped descriptions at 500 characters but
  the backend accepted 2000 — now both agree on 500. Also fixed: an empty
  `frontend/public/` folder wasn't tracked by git, so a fresh clone couldn't
  build the frontend image (git only tracks files, not folders — a `.gitkeep`
  placeholder file fixes it).
- **Phase A2**: the database can now remember a small "thumbnail" copy of a
  project's cover image (new column + a new file kind `thumb`). The thumbnail
  is just another stored file, so all the existing safety nets (size limits,
  orphan cleanup, delete-purges-storage) apply automatically. Setting a new
  thumbnail deletes the old one so replaced copies don't pile up against a
  student's storage quota.
- **Phase B8 (wrap)**: the demo seed now also creates sample bookings, tool
  checkouts (one deliberately overdue), an open issue, and small thumbnail
  copies of covers. The README was rewritten for the Docker-based setup.
  GitHub Actions CI now boots the whole stack and runs every backend test
  and browser journey on each push/PR — before this, tests only ran when
  someone remembered to run them. Verified from absolute zero: wipe all
  data, rebuild, migrate, seed — 76 backend tests + 24 browser journeys
  pass.
- **Phase B7**: tool checkout and issue reporting. A "Tools" page logs what
  leaves the lab (tool, quantity, return-by date) and lets you mark it
  returned; staff see everything still out with overdue items flagged red.
  A "Report an issue" form (linked from the machines page) files equipment
  or safety reports with a severity; staff triage and resolve them from the
  admin dashboard, and urgent reports email all staff if mail is configured.
- **Phase B6**: machine booking. Students pick a machine, a day (up to 30
  days ahead), and a start slot on an hour grid — taken slots show up
  disabled because the browser asks the server which times are busy (times
  only; no names leak). Requests start as "pending"; staff approve or reject
  from a new admin tab, and two overlapping requests can never both be
  approved (the database serializes decisions per machine-day). Everyone
  sees their own bookings on the dashboard and can cancel. All the rules
  (hours, slot length, 4-hour cap, booking window) are environment settings,
  not code. If mail credentials are configured the decision is emailed;
  without them everything still works. This beats the reference platform's
  booking because identity comes from real Google login, not a typed email.
- **Phase B5**: the site now has a public "Machines" page listing lab
  equipment by category with a live status chip (available / in use /
  maintenance / offline) and a training-required marker. The clever bit:
  the machine list isn't in our database — staff keep it in a Google Sheet
  published as CSV, and the backend re-reads it every couple of minutes.
  Editing a spreadsheet cell updates the site; no deploy, no admin screen.
  If the sheet is unreachable the backend serves the last copy it saw.
  Local dev uses a demo CSV file shipped with the frontend.
- **Phase A4**: the public pages got their storytelling pass. The landing now
  opens with a "README.TXT" window (big serif headline + what-this-is line +
  two buttons) before the slideshow, and the featured section leads with one
  big staff-pick card instead of a flat grid. Project pages open on the
  full-size cover photo like a magazine article; downloads read like a file
  manager listing. Cards lift slightly on hover, profiles show bigger
  avatars and chip-style program labels. Everything stays inside the
  existing "nostalgia" design tokens — no new colors were invented — and
  animations respect the system "reduce motion" setting.
- **Phase A3**: when a student picks a cover, their own browser now shrinks
  the image (max 1280px, WebP) and uploads that small copy alongside —
  project cards and the landing slider load the small copy instead of the
  full-size photo, so pages feel much lighter. Old projects without a copy
  keep working (they fall back to the original). Avatars get the same
  treatment (shrunk to 512px before upload). The server never touches image
  bytes — the shrinking happens entirely in the browser, so the "backend
  never streams files" rule holds.

### Opening the repo to student contributors (2026-07-09)
Groundwork so other students can contribute, most of them using their own AI
assistants to write code. The key idea: **you can't trust prose to keep code
clean, so we added automatic checks that run on every proposed change.**

- **Automatic code checks (linters/formatters).** A **linter** finds likely
  mistakes; a **formatter** rewrites code into one consistent style so nobody
  argues about spacing. We turned these on for real:
  - Python: **Ruff** (config in `pyproject.toml`) — `ruff check` (find problems),
    `ruff format` (fix style).
  - Frontend: **Prettier** (config in `frontend/.prettierrc.json`) plus the
    existing ESLint. `npm run format`, `npm run lint`, `npm run typecheck`.
  (CLAUDE.md had claimed these existed; now they actually do.)
- **CI (Continuous Integration).** `.github/workflows/ci.yml` — GitHub
  automatically runs all those checks, plus the backend tests, on every pull
  request. If a contributor's AI writes sloppy code, CI catches it before a human
  ever looks. Playwright browser tests are left out of CI for now (they need the
  whole stack running); that's a known follow-up.
- **AI-assistant guidance.** `AGENTS.md` (root) is the standard file most AI
  coding tools read automatically; it lists the security rules and the exact
  self-check commands. `backend/AGENTS.md` mirrors the existing `frontend/AGENTS.md`.
  `.github/copilot-instructions.md` points Copilot at the same rules.
- **Newcomer docs (written plainly, jargon defined).** A rewritten `README.md`
  (now documents the real Docker workflow, not the old backend-only one), a
  step-by-step `docs/setup.md` that assumes zero prior knowledge (install Docker →
  run → troubleshoot), `CONTRIBUTING.md` (how to open a pull request + an
  AI-usage policy), `CODE_OF_CONDUCT.md`, and `SECURITY.md` (report
  vulnerabilities privately, never in a public issue).
- **Issue/PR scaffolding.** `.github/ISSUE_TEMPLATE/` (bug, feature, good-first),
  a pull-request checklist template, and `docs/good-first-issues.md` — six real
  beginner tasks for people to pick up.
- **Left for the owner:** choosing an open-source **license** (there's still no
  LICENSE file — CONTRIBUTING flags this), and filling in the **contact emails**
  placeholdered in CODE_OF_CONDUCT.md and SECURITY.md before going public.

### Design refresh — blueprint-industrial identity + motion (2026-08-02)

The site wore the old "nostalgia" skin: cream surfaces, brown ink, a serif
headline face — a retro desktop-OS look that wasn't the lab's brand. This
re-skins every route to the **Tinkerers' Lab blueprint-industrial identity**
(blueprint blue, rust, safety yellow, ink, dot-grid paper, hard offset shadows,
Space Grotesk / DM Sans / JetBrains Mono) and adds a real motion layer. The
`Window` metaphor is kept and re-skinned, not retired.

- **Everything is value-level, not name-level.** `frontend/app/globals.css`
  keeps the exact same token *names* and only changes their values, so ~30
  component files inherit the new look without being touched. This matters
  because Tailwind v4 here sets `--color-*: initial` — a class naming a token
  that doesn't exist renders **nothing at all**, with no lint or type error. A
  throwaway audit script checks every themed utility in the source against the
  rules actually present in the built CSS; it must come back clean.
- **One type scale.** `--text-2xs … --text-4xl` replaces the ~106 hand-written
  `text-[13px]`-style values that were scattered across the app. Declared whole
  (`--text-*: initial` first) so nothing silently keeps a stale Tailwind size.
- **Motion** is the `motion` package (motion.dev). Every duration and easing
  comes from `frontend/lib/motion.ts`; `<MotionConfig reducedMotion="user">` in
  `app/motion-provider.tsx` makes Motion drop transforms but keep opacity when
  a visitor asks for reduced motion, so nothing is ever left stuck invisible.
  Windows reveal on scroll, the admin tabs share a sliding `layoutId` underline,
  the slider became a filmstrip on one transform, and buttons "press into" their
  hard shadow (that one is CSS, so it works without JavaScript).
- **Two bugs worth remembering.** A reveal must use `viewport.amount: "some"` —
  a ratio threshold can *never* be met by an element taller than
  viewport/ratio, so a long project write-up would have sat at opacity 0
  forever. And a reveal nested inside a revealing `Window` never fires; pass
  `reveal={false}` to the outer window instead.
- **`npm ci` is fixed.** The committed lockfile had been generated by an older
  npm than the one Docker and CI use, which is why `npm ci` failed locally and
  in the image. It's now regenerated inside `node:24-alpine` — the same npm CI
  runs — so `npm ci` works everywhere.
- **Verified**, not assumed: all 24 Playwright tests pass with **zero edits to
  `frontend/e2e/`** (the suite pins testids, exact strings, accessible names,
  element ids and DOM shapes — see design.md); a scripted pass over 4 routes ×
  3 viewports × light/dark confirms no horizontal overflow and no element left
  below full opacity; and a WCAG script checks all 23 foreground/background
  token pairs in both schemes at AA.

### Scope cut: lab ops removed + always-on account picker (2026-08-02)

- **Removed machines, machine booking, tool checkout and issue reporting.**
  They were v1.1 "Track B"; the owner confirmed they belong to a different
  student's project. Gone: 4 backend routers + `emails.py`, the `Booking` /
  `Checkout` / `Issue` models, 3 backend test files (79 → 60 tests), 4
  frontend routes, the dashboard bookings panel, 3 admin tabs (Curation /
  People / Moderation remain), the ops half of `lib/api.ts` + `lib/types.ts`,
  3 Playwright specs (24 → 19 journeys), the demo machines CSV, and the
  `MACHINES_*` / `BOOKING_*` / `LAB_*` / `TOOL_CATEGORIES` / `SMTP_*` env
  vars. Migration `0007_drop_lab_ops` drops the three tables; its
  `downgrade()` recreates the schema (not the rows), and the down/up round
  trip was run against the live database before committing.
- **Google login always shows the account chooser.** `prompt=select_account`
  was already set, but the request also carried `hd=<domain>`, and Google
  silently auto-picks an account when exactly one matches that hint. The hint
  is now gone from the authorization request. **This does not weaken hard
  rule 3** — the domain was never enforced by that parameter; enforcement is
  the `hd` *claim* check on the callback, which is untouched. A non-uni
  account can now be picked, and is rejected there exactly as before.

### Bug pass + deployment readiness (2026-08-05)

- **The account chooser was a stale container, not a code bug.** The `hd`
  hint had already been removed; a rebuilt image proves the request now
  carries `prompt=select_account` and nothing else. `docker compose up -d`
  without `--build` keeps serving the previously baked code, which is how the
  old request survived the fix. The authorization URL is now pinned by
  `test_login_always_asks_google_for_the_account_chooser`, so a regression
  fails a test instead of being discovered by a user. If a rebuilt backend
  still auto-selects, the cause is browser-side — a managed Chrome profile can
  be policy-locked to one Google account, which no OAuth parameter overrides.
- **Non-uni rejection was invisible.** The callback has always redirected to
  `/?auth_error=non_uni_domain`, but nothing read that parameter — the user
  landed on a normal home page, silently logged out, which reads as "login is
  broken". The landing page now renders a `LOGIN_REJECTED.LOG` window.
- **Download buttons were dead in Safari.** `window.open` ran *after* awaiting
  the presigned URL, spending the user gesture, so popup blockers killed it.
  The tab is now opened synchronously and pointed at the URL when it arrives.
  This changed one e2e assertion: the popup starts at `about:blank`, so the
  test waits for the URL rather than reading it immediately.
- **The editor could silently lose a write-up.** Content only exists in the
  browser until Save; leaving the page threw it away with no warning. Dirty
  state now drives a `beforeunload` guard, and a stale "SAVED" badge is
  cleared as soon as you type again.
- Smaller fixes: dead `Settings.tool_category_list` (still referenced the
  `tool_categories` setting deleted with lab ops — an `AttributeError` waiting
  to happen), admin tabs given real `tabpanel` wiring plus arrow-key movement,
  `rel="noopener noreferrer"` on the landing-preview link, and the editor's
  link prompt now says why a bad URL was refused instead of dropping it.
- **Deployment.** `docs/deployment.md` covers both stages (lab PC behind a
  tunnel, then the university VM). Compose gained restart policies,
  healthchecks, capped logs, and env-driven data paths — a bare name is a
  Docker volume, an absolute path is a host bind mount, so one file serves a
  laptop and a server. New `backup-files` service mirrors MinIO objects
  through the S3 API (the `pg_dump` alone was never a backup of this app —
  every photo and CAD file lives in MinIO); deliberately no `--remove`, so an
  accidental delete does not propagate into the only surviving copy. nginx
  gained security headers and an auth-only rate limit — general `/api/` is
  left unthrottled on purpose because a university shares few NAT addresses.
  `nginx-tls.conf` is the companion config for terminating TLS on the host.

### What's next
**Go-live** — follow `docs/deployment.md`. Stage 1 (lab PC + tunnel) needs no
university involvement; Stage 2 needs IT to say who terminates HTTPS and what
body-size limit their network imposes, since `MAX_FILE_SIZE` must sit below
the smallest limit in the chain.

### Borrowing frontend (issue #13, epic #7)
The student side of the borrowing log lives at `/borrow`. Plain-language tour:
- **Take photo** is a hidden file input with `capture="environment"`. On a
  phone that opens the rear camera; on a desktop it is just a file picker. The
  photo is only *previewed* at that point. It is downscaled and uploaded when
  you press Borrow (same three-step presigned flow as avatars, bytes go
  straight to MinIO), then `POST /loans` is called. Nothing is left behind if
  you walk away from the form.
- **Retries are safe.** The form makes one random id (`loan_id`) the first time
  you submit and keeps it until the loan succeeds. If the network drops, you
  press Borrow again: the same id goes out, so the server cannot create a
  second loan. The already-uploaded photo is reused too, not uploaded again.
- **Not configured.** If lab staff have not set up the Google Sheet, the
  backend answers 503 and the page shows "Borrowing isn't set up yet" rather
  than the error screen. The rest of the site is unaffected.
- **Photo links from the Sheet** point at `/loans/photo/<id>`, a frontend page
  with no UI: it asks the backend for a short-lived download link using your
  own login, then redirects. Only the owner and staff get an image.
- **Return is safe to retry.** If the return went through but the list refresh
  after it failed, pressing Confirm again gets a 409 "already returned". The
  page treats that 409 as success and just refreshes the list.
- **Signed-out photo links** send you to Google sign-in (the backend answers
  404 to anonymous callers, which used to show the "not found" page).
- **Tap targets.** The `/borrow` text fields are at least 44px tall. This is
  scoped to `/borrow` (`fieldClass` in `borrow-client.tsx`); the shared
  `inputClass` is unchanged, so other pages keep their 36px fields.
- Tests: `frontend/e2e/borrow.spec.ts`. The default run checks the page shell
  (CI has no Sheet). Set `E2E_LOANS=1` with the fake Sheet running
  (`uv run python -m backend.tests.fake_sheet`, `LOANS_SCRIPT_URL` pointing at
  it) to also run borrow → view photo → return, the dropped-request retry and
  the API-error case.

### Borrowing log: how the pieces fit (issues #9-#12, #14, epic #7)

Plain-language tour of the backend side of borrowing. The student page is in
the "Borrowing frontend" entry above.

- **The Sheet is the database.** There is no `loans` table. A Google Sheet holds
  one row per loan, and staff read it (or download it as .xlsx) to audit. What
  it costs: every "my loans" request is a round trip to Google (about 1-3
  seconds), and if Google or the script is down, borrow / return / list fail
  with a clear error (502 or 503) and nothing is half-written. Staff who
  hand-edit the `loan_id`, `email` or `status` cells can break lookups. If this
  hurts, adding a Postgres table later is a contained change.
- **Apps Script web app.** Apps Script is Google's small scripting service that
  lives inside a Sheet. We deploy `apps-script/loans/Code.gs` as a "web app": it
  gets its own URL and runs code when something POSTs to it. The browser never
  calls that URL. If it did, anyone could forge a row claiming to be any email.
  Only FastAPI calls it, and FastAPI fills in name and email from the logged-in
  session, never from the request body.
- **Shared secret.** "Anyone" can reach the web app URL, so every request must
  carry a secret, which the script checks before anything else. It travels in
  the JSON body, not an HTTP header, because Apps Script's `doPost` cannot read
  request headers. It lives in `.env` as `LOANS_SCRIPT_SECRET` and in the
  script's Script Properties as `LOANS_SECRET`, never in git (the repo is
  public). The URL is kept out of git too, and the `httpx` logger is pinned to
  WARNING so the URL never reaches INFO logs.
- **Formula injection.** A spreadsheet runs text that starts with `=`, `+`, `-`
  or `@` as a formula, so an item named `=IMPORTXML(...)` could phone home when
  staff open the Sheet. Defence: the `Loans` tab is created with plain-text
  columns, any stored string starting with those characters also gets a leading
  `'`, and the script strips that guard apostrophe when reading, so `=1+1`
  comes back literally.
- **Idempotency key (`loan_id`).** The browser makes a random id the first time
  you press Borrow and reuses it on a retry. The script looks the id up before
  writing; if the row exists it answers `duplicate: true` and writes nothing. So
  a timeout followed by a retry cannot create two rows. A writer lock stops two
  simultaneous requests racing past that check.
- **Not found looks the same either way.** Returning someone else's loan, or one
  that does not exist, both give 404 "Loan not found", so nobody can probe which
  ids exist.
- **Bad rows do not break the list.** If staff blank out a cell, that row is
  skipped and logged (UUID loan ids only, so cell text cannot inject log lines)
  while the student's other loans still show. Hand-typed timestamps with no
  time zone are read as UTC.
- **Fake Sheet for local dev.** `uv run python -m backend.tests.fake_sheet`
  serves an in-memory stand-in on port 8099 (secret `dev-secret`). Point
  `LOANS_SCRIPT_URL` / `LOANS_SCRIPT_SECRET` in `.env` at it and the whole flow
  works with no Google account. The backend tests use the same class.
- **Loan photos** are ordinary private files in MinIO (`kind = "loan_photo"`),
  visible to the owner and staff only. The Sheet stores a link to
  `<PUBLIC_URL>/loans/photo/<id>`, so `PUBLIC_URL` must be the real public
  address or those links break. While fixing this, a gap was closed: a loan
  photo could have been set as a public avatar, so avatars must now be
  `kind = "media"`.
- **Still pending:** the Google account that will own the real Sheet is not
  chosen yet (issue #8), so the "Anyone" deploy check on the uni Workspace and
  the real-Sheet / real-phone test have not been done.

### Borrowing log v2 plan: Sheet → Postgres (2026-10-19, design only)

Nothing above is wrong, but most of it is about to be replaced. The full spec
is in [borrowing-v2.md](borrowing-v2.md). Here's why, in plain language:

- **Why move off the Sheet.** Staff now want an admin page *inside the site*.
  A page that has to ask Google for every row is slow and breaks whenever
  Google or the script does. A Postgres table answers in milliseconds and
  sits next to the users and projects it refers to. It also removes the
  shared secret and the "which Google account owns the Sheet" problem (#8).
  Staff still get a spreadsheet: a **CSV export** button. CSV is a plain-text
  table that Excel opens directly.
- **Equipment vs material.** Equipment comes back, so it gets a return date
  and a Return step. Material gets used up, so it's logged once and is done.
  One "type" field switches the form between the two.
- **"Derived status".** The table doesn't store "overdue". It stores dates,
  and the code works out *out / overdue / returned / used* each time it reads
  a row. A stored status can drift from the dates (someone fixes a date but
  forgets the status); a computed one can't.
- **Join table (`loan_photos`).** One loan can have several photos. Instead of
  stuffing a list into the loan row, a small second table holds one line per
  photo: "this file belongs to this loan, taken at borrow (or return), shown
  in position N". That's the standard database way to model one-to-many.
- **Orphan photos.** Photos upload when you press Submit, and only then is the
  loan saved. If the save never happens, a finished photo sits in storage with
  no loan. The cleanup job, which already removes half-finished uploads, will
  also remove these after an hour.
