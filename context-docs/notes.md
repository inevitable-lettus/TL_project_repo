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

### What's next
**Phase 4b — the design pass.** Blocked on one thing: **paste the two TypeUI
prompts (storytelling + nostalgia)**. Then: fonts, colors, spacing tokens, and
motion rules get applied to the shell, reviewed with the two design skills —
and Phase 5 builds the landing slider and public pages on top.
