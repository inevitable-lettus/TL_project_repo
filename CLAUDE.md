# Tinkerer Lab Project Repository

Public-facing web app where a university makerspace's staff and students store and browse project files, with a private mode to hide selected projects from public view. Each project is a blog-style page (rich text with inline photos/videos plus a downloads area); each student has a public profile page; staff curate the landing page (slider pins + featured projects) and manage users through an admin dashboard UI, never through code.

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
7. **Visual design flow is fixed:** base direction comes from two TypeUI prompts — the **storytelling** flow (page structure/narrative) and the **nostalgia** style (visual voice), both pasted by the owner when frontend work starts — then refined and reviewed with the installed `impeccable` and `design-taste-frontend` skills. Bold yet simple; smooth transform/opacity animations (never linear PPT fades); sharp bold self-hosted fonts; must not look AI-generated. Never invent a separate visual system or hardcode ad-hoc colors/spacing outside the tokens this flow produces.

## Coding rules

Constraints, not prose. A readable, simple codebase is the goal — not a vibe-coded one.

- **Simplicity first.** Minimal code that solves the stated problem. Nothing speculative — no feature, config option, or abstraction nobody asked for.
- **Scope control.** Every changed line traces to the request. Keep diffs small. Don't rewrite half a file you only needed to touch one line of.
- **Reuse > new.** Search for an existing function/module/util before writing one. No duplicate logic.
- **Small, single-purpose functions.** Clear names, shallow nesting. If a function does two things, split it.
- **No unrequested fallbacks** or try/except that swallows errors. Fail loud during development.
- **Comments only where intent isn't obvious from the code.** Plain, minimal — no banner blocks, no decorative headers, no comments that restate the code.
- **Style is handled by formatters/linters**, not by rules here: Ruff for Python, Prettier + ESLint for TS. Run them (plus type/test checks) before finishing — see [AGENTS.md](AGENTS.md). CI enforces the same checks on every PR.
- **Strict typing both sides** — TS strict mode, Python type hints.
- **Keep this file lean** (<300 lines). LLMs reliably follow ~150–200 instructions; Claude Code's own prompt uses ~50. Don't bloat it.

## Other docs

- [context-docs/architecture.md](context-docs/architecture.md) — components, the presigned flows, cleanup, auth/JWT, Docker/nginx topology, where each secret lives.
- [context-docs/design.md](context-docs/design.md) — screen inventory, public-vs-private behavior, upload UX (pending→ready). No visual tokens — those come from the design flow in hard rule 7.
- [context-docs/product.md](context-docs/product.md) — who it's for, the problem, user stories, what's out of scope for v1.
- [context-docs/handoff.md](context-docs/handoff.md) — dependency-ordered build phases with a "done =" definition each.
- [context-docs/notes.md](context-docs/notes.md) — plain-language developer notes (jargon explained, what each task built). Update alongside handoff.md after every task.

## How I like to work

- **One decision at a time.** Don't bundle five choices into one question.
- **Plain-language explanations** for infra/jargon — I'm a CS student learning this stack.
- **Blunt feedback.** Call out flaws in my decisions; don't agree by default.
