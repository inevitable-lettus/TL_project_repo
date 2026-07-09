# GitHub Copilot instructions

This project's full guidance for AI assistants is in [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md). Read them.

Key rules Copilot must respect:

- FastAPI never touches file bytes — uploads/downloads use presigned URLs (browser ↔ MinIO directly).
- One private storage bucket, never anonymously readable.
- Google login is restricted to the university domain via the `hd` claim — never loosen it.
- All limits come from env vars — never hardcode.
- Small diffs, strict typing (TS strict mode, Python type hints), no error-swallowing.

Before suggesting a change is done, make sure it passes the project checks (the same ones CI runs): `ruff check` / `ruff format` for Python, and `npm run lint` / `npm run typecheck` / `npm run format:check` for the frontend.
