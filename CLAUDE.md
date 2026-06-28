# Tinkerer Lab Project Repository

Public-facing web app where a university makerspace's staff and students store and browse project files, with a private mode to hide selected projects from public view.

**This is a production system in active use by the university Tinkerer Laboratory.** Security and reliability are first-class, not afterthoughts — guard auth/visibility boundaries, never expose internal services, fail loud on misconfig, keep the deploy reproducible.

This file is the entry point for every Claude Code session. Read it first.

## Stack (settled — do not re-litigate)

- **Frontend**: Next.js (React)
- **Backend**: FastAPI (Python)
- **DB**: PostgreSQL, migrations via Alembic
- **File storage**: MinIO (self-hosted, S3-compatible)
- **Hosting**: university VM, Docker Compose + nginx reverse proxy (public route pending IT)
- **Auth**: Google OAuth (uni Google Workspace); FastAPI issues its own session JWT

## Hard rules (never violate)

1. **FastAPI never touches file bytes.** Upload/download use presigned URLs; the browser transfers bytes directly to/from MinIO. Any code that streams a file through FastAPI is wrong.
2. **One private bucket, never anonymously readable.** Every fetch — public or private — gets a short-lived presigned URL from FastAPI. No second bucket, no permanent public URLs. The `is_public` toggle is a pure DB write.
3. **OAuth restricted to the uni Workspace domain** via the Google `hd` claim. Default Google OAuth lets in any Gmail account — reject non-uni domains.
4. **All limits via env vars, never hardcoded, never effectively unlimited.** `MAX_FILE_SIZE`, per-user/project quota. Real placeholder default: 2GB/file. Enforce size in three places (see architecture.md).
5. **The cleanup job is mandatory.** Pending File rows older than ~1hr → delete the orphaned MinIO object, then the row.
6. **Project delete must purge MinIO objects first, then the DB row.** `ON DELETE CASCADE` only removes File rows, not MinIO objects. Cascade alone leaks storage.
7. **Visual styling is owned by the TypeUI design skill** (SKILL.md from typeui.sh) — the single source of truth for typography, color tokens, spacing, component states. Never invent a visual system or hardcode colors/spacing. **If the skill is not installed, leave styling as TODO — do not guess.** (As of last check: not installed.)

## Coding rules

Constraints, not prose. A readable, simple codebase is the goal — not a vibe-coded one.

- **Simplicity first.** Minimal code that solves the stated problem. Nothing speculative — no feature, config option, or abstraction nobody asked for.
- **Scope control.** Every changed line traces to the request. Keep diffs small. Don't rewrite half a file you only needed to touch one line of.
- **Reuse > new.** Search for an existing function/module/util before writing one. No duplicate logic.
- **Small, single-purpose functions.** Clear names, shallow nesting. If a function does two things, split it.
- **No unrequested fallbacks** or try/except that swallows errors. Fail loud during development.
- **Comments only where intent isn't obvious from the code.** Plain, minimal — no banner blocks, no decorative headers, no comments that restate the code.
- **Style is handled by formatters** (Prettier/ESLint for TS, Black/Ruff for Python), not by rules here.
- **Strict typing both sides** — TS strict mode, Python type hints.
- **Keep this file lean** (<300 lines). LLMs reliably follow ~150–200 instructions; Claude Code's own prompt uses ~50. Don't bloat it.

## Other docs

- [architecture.md](architecture.md) — components, the presigned flows, cleanup, auth/JWT, Docker/nginx topology, where each secret lives.
- [design.md](design.md) — screen inventory, public-vs-private behavior, upload UX (pending→ready). No visual tokens — those live in the TypeUI skill.
- [product.md](product.md) — who it's for, the problem, user stories, what's out of scope for v1.
- [handoff.md](handoff.md) — dependency-ordered build milestones with a "done =" definition each.
- [notes.md](notes.md) — plain-language developer notes (jargon explained, what each task built). Update alongside handoff.md after every task.

## How I like to work

- **One decision at a time.** Don't bundle five choices into one question.
- **Plain-language explanations** for infra/jargon — I'm a CS student learning this stack.
- **Blunt feedback.** Call out flaws in my decisions; don't agree by default.
