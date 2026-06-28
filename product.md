# Product

## Who it's for

- **Staff** — makerspace employees. Manage their own projects, get admin powers (manage any project, control the staff allowlist).
- **Students** — university members with a Workspace account. Create projects, upload files, choose public or private.
- **Public visitors** — anyone, unauthenticated. Browse and download from public projects only.

## Problem

Makerspace project files are scattered across personal drives, chat threads, and USB sticks. There's no single browsable home, and no clean way to show work publicly while keeping some projects private. This app gives one place to store and browse project files, with a per-project privacy switch.

## Core user stories

**Student**
- Log in with my uni Google account.
- Create a project, add a title and description.
- Upload files directly to storage and see when they're ready.
- Toggle a project public or private.
- See all my own projects (public and private) in one dashboard.

**Staff**
- Everything a student can do.
- Manage any project (e.g. moderate or fix metadata).
- Add/remove staff in the allowlist.

**Public visitor**
- Browse the public showcase without logging in.
- Open a public project and download its files.
- Never see private projects (they don't appear and can't be opened).

## Out of scope for v1 (explicit — do not assume these)

- File versioning / history.
- In-app file preview or editing.
- Comments, likes, or any social features.
- **Disk quota enforcement** — deferred until IT confirms VM disk size. Limits exist as env vars (`MAX_FILE_SIZE` etc.) with a 2GB/file default; per-user/project quota enforcement is wired but values are placeholders.
- **MinIO object backup automation** — deferred (pg_dump covers metadata only). Known risk, see [architecture.md](architecture.md).
- **User offboarding / hard-delete** — `owner_id ON DELETE RESTRICT` means a user who owns projects can't be deleted. Known limitation.
- **Search** beyond basic listing/browse.
