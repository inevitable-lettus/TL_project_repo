# Setup guide — run Tinkerer Lab on your computer

This guide assumes you've never used Docker or run a web app locally. Follow it top to bottom. Every command is meant to be copied exactly.

**A few words you'll see:**

- **Terminal** — the text-command app on your computer. On macOS it's "Terminal"; on Windows use "PowerShell"; on Linux any terminal.
- **Container** — a lightweight, self-contained box that runs one piece of software (the database, the storage, etc.). Docker runs these for you so you don't have to install each piece by hand.
- **Docker Compose** — a tool that starts all the containers this project needs, together, with one command.
- **Migration** — a small script that sets up or updates the structure of the database (the tables that hold data).
- **Seed** — sample data (fake projects and users) so the site isn't empty while you work.

---

## Step 1 — Install Docker Desktop

Docker Desktop runs all the containers. Install it once:

- **macOS / Windows**: download from <https://www.docker.com/products/docker-desktop/> and install like any app. Then open it and wait until it says it's running.
- **Linux**: install Docker Engine and the Compose plugin — see <https://docs.docker.com/engine/install/>.

Check it worked. Open a terminal and run:

```bash
docker --version
docker compose version
```

If both print a version number, you're good. If `docker` is "command not found", Docker Desktop isn't installed or isn't running yet.

## Step 2 — Get the code

If you haven't already, download the project. Replace the URL with the repo's real address:

```bash
git clone <REPO_URL>
cd <REPO_FOLDER>
```

All the commands below are run from inside this project folder.

## Step 3 — Create your settings file

The app reads its settings (passwords, options) from a file called `.env`. There's a template to copy:

```bash
cp .env.example .env
```

For local development you don't need to change anything in `.env` — the defaults work. (You only fill in real Google login details when deploying for real; see [Troubleshooting](#logging-in-with-google-doesnt-work).)

## Step 4 — Start everything

```bash
docker compose up -d --build
```

- `up` starts the containers, `-d` runs them in the background, `--build` builds them first.
- **The first time, this takes several minutes** (it downloads and builds things). Later runs are much faster.

Check they're running:

```bash
docker compose ps
```

You should see several services (nginx, frontend, backend, db, minio, and helpers) listed as running.

## Step 5 — Set up the database

The containers are running, but the database is empty. Run the migration to create its tables:

```bash
docker compose exec backend alembic -c backend/alembic.ini upgrade head
```

(`docker compose exec backend ...` means "run this command inside the backend container.")

## Step 6 — Add sample data (optional but recommended)

So the site isn't empty:

```bash
docker compose exec backend python -m backend.app.seed
```

This adds a few sample students and projects. It refuses to run twice, so it's safe.

## Step 7 — Open the site

Go to **http://localhost/** in your browser. (That's plain `localhost`, no port number — the app is served on the normal web port 80.)

To log in without setting up Google, click **Dev login**. This button only appears in development and signs you in as a staff user so you can try everything.

## Stopping and starting

- Stop everything (keeps your data): `docker compose down`
- Stop **and erase** the database + uploaded files: `docker compose down -v`
- Start again later: `docker compose up -d` (no `--build` needed unless you changed code)

---

## Troubleshooting

### "Port is already allocated" / port 80 in use

Something else on your computer is using web port 80 (another copy of this app, or another program). Find and stop the other thing, or stop any other Docker stacks you started. To see what Docker has running: `docker ps`.

### The site won't load at http://localhost/

- Give it a minute after `up` — the containers need time to start.
- Check `docker compose ps` — every service should be "running"/"healthy".
- Look at the logs for errors: `docker compose logs backend` (or `frontend`, `nginx`).

### "relation does not exist" or the site has errors about the database

You probably skipped Step 5. Run the migration command again.

### I ran `down -v` and lost my projects

`-v` erases the database and file volumes on purpose. Your data is gone, but database backups saved to the `./backups` folder survive. Just re-run the migration and seed to get sample data back.

### Logging in with Google doesn't work

Real Google login needs two things this template doesn't include:

1. A **Google OAuth client** (a Client ID and Secret you create in the Google Cloud Console). The `.env.example` values are placeholders, so real Google login will show an "OAuth client was not found" error until you add real ones.
2. A university Google Workspace account — the app only lets in accounts from the configured university domain (`GOOGLE_HOSTED_DOMAIN`).

**For local development you don't need any of this — just use the Dev login button.** Only fill in real Google details when preparing an actual deployment.

### I changed frontend dependencies and the Docker build fails on `npm ci`

The `package-lock.json` file must be regenerated in a Linux environment (so it matches the containers). From the `frontend` folder:

```bash
docker run --rm -v "$PWD":/app -w /app node:24-alpine npm install --package-lock-only
```

Then rebuild: `docker compose up -d --build`.

---

## Faster frontend development (optional)

Rebuilding the frontend container on every change is slow. Once you're comfortable, you can run the backend in Docker and the frontend directly on your computer with instant reloads:

1. Keep the Docker stack running (`docker compose up -d`).
2. Install [Node.js 24](https://nodejs.org/).
3. In another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Open **http://localhost:3000/**. This copy reloads instantly when you edit frontend code, and it talks to the backend running in Docker.

## Running the tests

```bash
docker compose exec backend pytest        # backend tests
cd frontend && npm run e2e                 # browser tests (Playwright)
```

The same checks run automatically in CI on every pull request.
