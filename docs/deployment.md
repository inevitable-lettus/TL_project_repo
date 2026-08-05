# Deployment guide — putting Tinkerer Lab on a real machine

[docs/setup.md](setup.md) gets the site running on your own laptop. This guide
puts it somewhere other people can reach, in two stages:

- **Stage 1 — a lab PC behind a tunnel.** For testing with real users before
  the university hands over a server. Fastest to stand up, easiest to undo.
- **Stage 2 — the university VM.** The permanent home.

Both stages run the same `docker compose` stack. What changes between them is
the `.env` file and where the data sits on disk.

**Read [Stage 0](#stage-0--things-that-are-true-of-both) first — it applies to
both.**

---

## Stage 0 — things that are true of both

### The app has to be told its own public address

This trips everyone up once. The app runs inside containers that only know
names like `backend` and `minio`. But it hands the *browser* two kinds of link
that must work from the outside world:

- the **Google login redirect**, built from `PUBLIC_URL`
- **presigned file links** for every photo and download, signed for
  `MINIO_PUBLIC_ENDPOINT`

If either is wrong, the failure is confusing rather than obvious: login bounces
you somewhere useless, or every image breaks with a signature error. So
whenever the public address changes, three settings change with it:

| Setting | What it is | Example |
|---|---|---|
| `PUBLIC_URL` | Full public origin, with scheme | `https://lab.example.edu` |
| `MINIO_PUBLIC_ENDPOINT` | Same host, **no scheme, no slash** | `lab.example.edu` |
| `MINIO_PUBLIC_SECURE` | `true` if the browser uses HTTPS | `true` |

Setting `PUBLIC_URL` to an `https://` address also flips the login cookie to
`Secure` automatically — there is no separate switch for that.

### The size limit must be the smallest one in the chain

`MAX_FILE_SIZE` is what the app promises students. Every hop between their
browser and MinIO — a tunnel, a university reverse proxy, a firewall appliance
— may impose its own body limit. If any of those is smaller than
`MAX_FILE_SIZE`, a big upload dies at that hop with a raw `413` and the app
never gets to show its own honest "file exceeds N GB limit" message.

**Set `MAX_FILE_SIZE` below the smallest limit in the chain.** Ask IT what
theirs is. For a free Cloudflare tunnel it is about 100 MB.

### Secrets to change before anyone else can reach the site

`.env.example` ships development defaults. Every one of these must change:

```bash
openssl rand -base64 48        # use for JWT_SECRET
openssl rand -base64 24        # use for POSTGRES_PASSWORD
openssl rand -base64 24        # use for MINIO_SECRET_KEY
```

- `JWT_SECRET` — signs login sessions. Anyone who has it can forge a staff
  login. Must be at least 32 bytes; the app refuses to start otherwise.
- `POSTGRES_PASSWORD` (and the copy inside `DATABASE_URL` — they must match)
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — not `minioadmin`
- `ENVIRONMENT=production` and `AUTH_TEST_MODE=0` — this pair turns off the
  test-only login endpoint and the "Dev login" button. The app refuses to boot
  with test mode on outside `ENVIRONMENT=test`, so a mistake here fails loudly
  instead of quietly leaving a back door open.
- `STAFF_EMAILS` — the real staff addresses. These become staff on first login;
  after that, staff manage roles in the admin UI.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_HOSTED_DOMAIN`

`.env` is gitignored. Keep it off GitHub and out of chat messages.

### Google OAuth setup

In the [Google Cloud console](https://console.cloud.google.com/) →
**APIs & Services → Credentials → your OAuth client (Web application)**, add:

```
{PUBLIC_URL}/api/auth/callback
```

as an **Authorized redirect URI** — for example
`https://lab.example.edu/api/auth/callback`. Google matches this exactly:
a different scheme, a trailing slash, or a different hostname is a mismatch.

**Every public address gets its own entry.** The tunnel host in Stage 1 and the
VM host in Stage 2 are two separate URIs; add both and you can switch between
them without touching Google again.

`GOOGLE_HOSTED_DOMAIN` is the part after the `@` in university email addresses.
Only accounts on that Workspace domain can sign in — anyone else is turned away
at the callback with a message on the home page.

---

## Stage 1 — a lab PC behind a tunnel

A tunnel gives you a public HTTPS address that forwards to a machine with no
public IP and no open firewall ports. The tunnel program runs on the lab PC,
dials out to the tunnel provider, and traffic comes back down that connection.
Nothing needs to be opened inbound.

### 1. Start the stack on the lab PC

```bash
git clone <REPO_URL> && cd <REPO_FOLDER>
```

```bash
cp .env.example .env
```

Edit `.env` per [Stage 0](#stage-0--things-that-are-true-of-both). You do not
know the tunnel address yet — leave the three public-address settings for now.

```bash
docker compose up -d --build
```

### 2. Get the tunnel address

Install `cloudflared` and run:

```bash
cloudflared tunnel --url http://localhost:80
```

It prints a `https://<something>.trycloudflare.com` address. Leave it running —
closing it takes the site offline, and a quick tunnel gets a **new address**
every restart. Named tunnels keep a fixed hostname and are worth setting up if
testing runs more than a day.

### 3. Point the app at that address

In `.env`:

```
PUBLIC_URL=https://<something>.trycloudflare.com
MINIO_PUBLIC_ENDPOINT=<something>.trycloudflare.com
MINIO_PUBLIC_SECURE=true
MAX_FILE_SIZE=104857600
```

`MAX_FILE_SIZE` is 100 MB here because of the tunnel's own body limit — see
[Stage 0](#the-size-limit-must-be-the-smallest-one-in-the-chain). It goes back
up on the VM.

Add `https://<something>.trycloudflare.com/api/auth/callback` to the Google
OAuth client, then restart the services that read `.env`:

```bash
docker compose up -d backend cleanup backup backup-files
```

### 4. Set up the database and check it

```bash
docker compose exec backend alembic -c backend/alembic.ini upgrade head
```

Then work through the [go-live checks](#go-live-checks).

### What Stage 1 is not

The tunnel is for testing. The lab PC sleeps, gets rebooted, and its disk is not
backed up by anyone but you. Do not let students treat it as the real archive —
anything uploaded here should be considered disposable.

---

## Stage 2 — the university VM

### 1. Ask IT for

- a hostname (e.g. `tinkererlab.example.edu`) pointing at the VM
- **who terminates HTTPS** — their reverse proxy, or this VM with a certificate
  they issue. This is the one answer that changes the configuration; both
  options are covered below.
- the largest request body their network will pass (for `MAX_FILE_SIZE`)
- Docker Engine and the Compose plugin installed, and Docker enabled at boot:
  ```bash
  sudo systemctl enable --now docker
  ```

### 2. Put the data somewhere real

By default the database and uploaded files live in Docker-managed volumes.
On a server, put them in an ordinary directory instead — so IT can snapshot it,
so you can see how much disk the archive is using, and so a stray
`docker compose down -v` cannot erase it.

```bash
sudo mkdir -p /srv/tinkerer/{pgdata,minio,backups}
```

```bash
sudo chown -R $USER:$USER /srv/tinkerer
```

In `.env`:

```
PGDATA_PATH=/srv/tinkerer/pgdata
MINIODATA_PATH=/srv/tinkerer/minio
BACKUP_PATH=/srv/tinkerer/backups
```

> Set these **before the first start**. Changing them later points the
> containers at empty directories — the old data is still in the Docker
> volumes, but the site will look wiped. Recovering means copying the volume
> contents across by hand.

### 3. Choose the HTTPS setup

**Option A — the university's reverse proxy terminates HTTPS** (most common).

Their proxy holds the certificate and forwards plain HTTP to this VM. Nothing
in nginx changes. In `.env`:

```
NGINX_CONF=nginx.conf
PUBLIC_URL=https://tinkererlab.example.edu
MINIO_PUBLIC_ENDPOINT=tinkererlab.example.edu
MINIO_PUBLIC_SECURE=true
HTTP_BIND=80
```

`PUBLIC_URL` says `https` even though this container speaks HTTP — it describes
what the *browser* sees, which is what links and cookies must match. If the
proxy runs on this same VM, set `HTTP_BIND=127.0.0.1:80` so nothing else on the
network can reach the container directly.

**Option B — this VM terminates HTTPS.**

Put the certificate and key from IT somewhere readable by root, named exactly
`fullchain.pem` and `privkey.pem`. In `.env`:

```
NGINX_CONF=nginx-tls.conf
TLS_CERT_DIR=/etc/ssl/tinkerer
PUBLIC_URL=https://tinkererlab.example.edu
MINIO_PUBLIC_ENDPOINT=tinkererlab.example.edu
MINIO_PUBLIC_SECURE=true
```

Then publish 443 by adding one line to the `nginx` service's `ports:` in
`docker-compose.yml`:

```yaml
      - "443:443"
```

`nginx-tls.conf` redirects HTTP to HTTPS and sends an HSTS header. **Get the
certificate working before you first serve that header** — HSTS makes browsers
refuse plain HTTP to this hostname for a year, so a broken certificate is not
something you can quickly back out of.

Put a calendar reminder on the certificate's expiry date. Renewal is: replace
the two files, then `docker compose restart nginx`.

### 4. First start

```bash
docker compose up -d --build
```

```bash
docker compose exec backend alembic -c backend/alembic.ini upgrade head
```

Do **not** run the seed script on a real deployment — it inserts fake students
and demo projects.

Every service is set to `restart: unless-stopped`, so the site comes back by
itself after a reboot or a crash. Container logs are capped at 3 × 10 MB per
service so they cannot fill the disk.

---

## Go-live checks

Work down this list against the public address, not `localhost`.

1. **The site loads.** `https://<host>/` shows the landing page.
2. **The API is reachable.** `https://<host>/api/health` returns
   `{"status":"ok"}`.
3. **Login uses the account chooser.**
   ```bash
   curl -sI https://<host>/api/auth/login | grep -i '^location'
   ```
   The address must contain `prompt=select_account` and must **not** contain
   `hd=`. If `hd=` is there, the running container is older than the code —
   `docker compose up -d --build backend` and check again.
4. **Log in with a university account.** You land back on the site, signed in.
5. **Log in with a personal Gmail.** You are refused, and the home page
   explains why rather than silently doing nothing.
6. **Staff bootstrap worked.** An address from `STAFF_EMAILS` sees the Admin
   link after logging in.
7. **Dev login is gone.** No "Dev login" button next to "Log in". If it is
   still there, `ENVIRONMENT` is not `production`.
8. **Upload works end to end.** Create a project, add a cover image and an
   attachment, publish it, then open it signed out — the image renders and the
   download works.
9. **Oversize uploads are refused politely.** Try a file above `MAX_FILE_SIZE`
   and confirm you get the app's own limit message, not a raw gateway error. A
   raw error means something in the chain has a smaller limit than the app does.
10. **Backups exist.** After one `BACKUP_INTERVAL_SECONDS`, `BACKUP_PATH`
    contains a `.dump` file and an `objects/` directory.
11. **It survives a reboot.** Reboot the machine and confirm the site returns
    without anyone logging in.

---

## Deploying a change

```bash
git pull && docker compose up -d --build
```

If the change includes a database migration:

```bash
docker compose exec backend alembic -c backend/alembic.ini upgrade head
```

**`--build` is not optional.** Containers run images baked at build time, not
the files in the folder — `docker compose up -d` alone restarts the *old* code
and the change appears to have done nothing.

Migrations are a deliberate separate command rather than something the
container runs at startup. A container that migrates on boot and then
crash-loops can apply a migration half a dozen times while you are still
reading the first error.

Check it worked:

```bash
docker compose ps
```

Every service should be `Up`, and `backend` and `frontend` should say
`(healthy)`.

### Rolling back

```bash
git checkout <previous-commit> && docker compose up -d --build
```

If the bad release included a migration, undo that first, while the new code is
still running:

```bash
docker compose exec backend alembic -c backend/alembic.ini downgrade -1
```

---

## Backups

Two jobs run on the `BACKUP_INTERVAL_SECONDS` cycle (daily by default), both
writing into `BACKUP_PATH`:

- **`backup`** — `pg_dump` of the database into `tinkerer-<timestamp>.dump`.
  Pruned after `BACKUP_KEEP_DAYS`.
- **`backup-files`** — every uploaded file mirrored into `objects/`. Never
  pruned: if someone deletes a project by mistake, the copy here is the last
  one left.

**You need both.** The database holds the write-ups and who owns what; MinIO
holds every photo and CAD file. Either alone restores to a broken site.

`BACKUP_PATH` is on the same machine, which means it survives a mistake but not
a dead disk. Ask IT to include `/srv/tinkerer/backups` in whatever off-machine
backup the university already runs.

### Restoring

Test this **before** you need it — a backup nobody has restored is a guess.

Database:

```bash
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < /srv/tinkerer/backups/tinkerer-<timestamp>.dump
```

Files, from inside the `backup-files` container:

```bash
docker compose exec backup-files mc mirror --overwrite /backups/objects "store/$MINIO_BUCKET"
```

Then reload a project page and confirm its cover image appears — that exercises
the database row and the stored object together.

---

## When something breaks

**Every image is broken / uploads fail with a signature error.**
`MINIO_PUBLIC_ENDPOINT` does not match the hostname in the browser's address
bar. It takes the host only — no `https://`, no trailing slash.

**Login redirects to the wrong place, or Google says `redirect_uri_mismatch`.**
`PUBLIC_URL` and the Authorized redirect URI in the Google console must agree
exactly, including scheme.

**Google signs you straight in without offering a choice.**
Run check 3 above. If `hd=` appears, the container is stale — rebuild. If it
does not, the browser is the cause: a university-managed Chrome profile can be
policy-locked to one Google account, and no setting on our side overrides that.
Try a private window.

**The site 502s right after a deploy.** nginx re-resolves container addresses
every 10 seconds, so give it that long. If it persists, `docker compose ps` —
something is not `Up`.

**A big upload fails but a small one works.** Something in the chain has a
smaller body limit than `MAX_FILE_SIZE`. Lower `MAX_FILE_SIZE` to match.

**Disk is filling up.** `du -sh /srv/tinkerer/*`. The usual cause is
`backups/objects` — it is a full second copy of every file, by design.
