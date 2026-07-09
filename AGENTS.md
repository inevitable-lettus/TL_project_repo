# Agent instructions

Instructions for AI coding assistants (Claude, Cursor, Copilot, etc.) working in this repo.

**Read [`CLAUDE.md`](CLAUDE.md) first — it is the full and authoritative rule set.** This file is the short, cross-tool entry point; CLAUDE.md has the detail. Subdirectories add their own: [`frontend/AGENTS.md`](frontend/AGENTS.md), [`backend/AGENTS.md`](backend/AGENTS.md).

## Non-negotiable security boundaries

Do not violate these (full list in CLAUDE.md "Hard rules"):

1. FastAPI never touches file bytes. Uploads/downloads use presigned URLs; the browser transfers bytes directly to/from MinIO.
2. One private storage bucket, never anonymously readable. Every fetch gets a short-lived presigned URL.
3. Google login is restricted to the university domain via the `hd` claim — never loosen this.
4. All limits (file size, quotas) come from env vars — never hardcode, never make effectively unlimited.

## Code standards

- Small diffs. Every changed line traces to the task. Don't rewrite code you didn't need to touch.
- Reuse existing functions/utilities before writing new ones.
- Strict typing both sides: TypeScript strict mode, Python type hints.
- No error-swallowing try/except and no unrequested fallbacks — fail loud.

## Self-check before proposing a change

Run the checks that match what you touched — the same checks CI runs. All must pass.

Backend (Python):
```bash
uv run ruff check backend/          # lint
uv run ruff format backend/         # auto-format
uv run pytest                       # tests (needs the stack up; see docs/setup.md)
```

Frontend (TypeScript), from `frontend/`:
```bash
npm run lint
npm run typecheck
npm run format        # auto-format with Prettier
```

If a check fails, fix it before handing the change back. Never disable a rule or delete a test to make a check pass.
