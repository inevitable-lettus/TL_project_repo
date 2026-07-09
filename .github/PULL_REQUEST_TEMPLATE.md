<!-- Thanks for contributing! Fill this in so reviewers can understand your change. -->

## What does this change?

Briefly describe what you changed and why. Link any related issue (e.g. "Closes #12").

## How did you test it?

How did you check it works? (Ran the app and clicked through, added a test, etc.)

## Screenshots

For any visual change, add before/after screenshots.

## Checklist

- [ ] My change is small and focused on one thing.
- [ ] I ran the checks and they pass:
  - Backend: `uv run ruff check backend/` and `uv run ruff format --check backend/`
  - Frontend (in `frontend/`): `npm run lint`, `npm run typecheck`, `npm run format:check`
- [ ] I added or updated tests if it made sense to.
- [ ] I understand every line I'm submitting (even if an AI helped write it).
- [ ] My change respects the security rules in [CLAUDE.md](../CLAUDE.md) (private data stays private, files go straight to storage, login stays restricted).
- [ ] This is **not** a security vulnerability report (those go through [SECURITY.md](../SECURITY.md), not a public PR).
