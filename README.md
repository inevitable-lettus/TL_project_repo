# Tinkerer Lab

A website where a university makerspace's students and staff store and show off their projects. Each project is a blog-style page (text, photos, videos, and downloadable files); each student has a profile page; staff pick what appears on the landing page. Some projects can be marked private so the public can't see them.

**This is a real system used by the university Tinkerer Laboratory.** That means security and reliability matter — please read the rules before contributing (links below).

## What it's built with

- **Frontend** (what you see in the browser): Next.js / React
- **Backend** (the server that handles data): FastAPI (Python)
- **Database**: PostgreSQL
- **File storage**: MinIO (an S3-compatible store for the uploaded photos/files)
- **Runs with**: Docker Compose (bundles all the above into containers) behind an nginx web server

Don't worry if some of those are new to you — the [setup guide](docs/setup.md) explains each step, and [context-docs/notes.md](context-docs/notes.md) has a plain-language glossary.

## Run it on your computer

You need **Docker Desktop** installed. Then, in a terminal, from the project folder:

```bash
cp .env.example .env          # create your local settings file
docker compose up -d --build  # build and start everything (takes a few minutes the first time)
docker compose exec backend alembic -c backend/alembic.ini upgrade head   # set up the database
docker compose exec backend python -m backend.app.seed                    # add sample projects (optional)
```

Then open **http://localhost/** in your browser (API health: `http://localhost/api/health`).

To log in locally without Google, click the **Dev login** button (it only appears in development). Full step-by-step instructions, including how to install Docker and what to do when something breaks, are in **[docs/setup.md](docs/setup.md)**.

To stop everything: `docker compose down` (add `-v` to also erase the database and files). Rebuild images after code changes (`docker compose up -d --build backend frontend`) — containers run baked images, not mounted source.

## Tests

```bash
docker compose exec backend pytest      # backend suite
cd frontend && npm ci && npm run e2e    # Playwright journeys (needs test-mode env vars — see handoff.md)
```

## Want to contribute?

Great — students are welcome. Start here:

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to make a change and open a pull request.
- **[docs/good-first-issues.md](docs/good-first-issues.md)** — beginner-friendly tasks to pick from.
- **[docs/setup.md](docs/setup.md)** — get the app running.

Putting it on a real machine instead? See **[docs/deployment.md](docs/deployment.md)**.

**Using an AI assistant (Copilot, Cursor, ChatGPT, Claude…) to write code? That's fine and encouraged.** Point it at [AGENTS.md](AGENTS.md), keep your changes small, make sure you understand what it wrote, and check that the automated tests pass before opening a pull request.

## Learn more

- [CLAUDE.md](CLAUDE.md) — the project's core rules (also read by AI tools).
- [context-docs/](context-docs/) — deeper docs: architecture, design, product goals, build history.
