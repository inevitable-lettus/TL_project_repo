# Contributing to Tinkerer Lab

Thanks for helping out! This project is built and maintained by students, and new contributors are welcome — including if this is your first time contributing to anything. This page explains how to make a change from start to finish.

If anything here is unclear, that's a bug in this document — open an issue and tell us.

## Before you start

- **Get the app running first.** Follow **[docs/setup.md](docs/setup.md)**. You can't test a change you can't run.
- **Pick something to work on.** New here? See **[docs/good-first-issues.md](docs/good-first-issues.md)** for tasks sized for beginners. Or browse the repo's Issues tab.
- **Read the rules.** This is a live university system, so a few rules are strict — see [The rules that keep this safe](#the-rules-that-keep-this-safe) below. The full list is in [CLAUDE.md](CLAUDE.md).

## Making a change, step by step

A **pull request** (PR) is how you propose a change: you make edits on your own copy, then ask for them to be merged in.

1. **Fork** the repo (your own copy) using the "Fork" button on GitHub, then clone your fork to your computer.
2. **Make a branch** for your change so `main` stays clean:
   ```bash
   git checkout -b short-name-for-your-change
   ```
3. **Make your edits.** Keep them small and focused on one thing. A PR that changes one feature is much easier to review (and get merged) than one that changes five.
4. **Run the checks** (next section) and make sure they pass.
5. **Commit and push** to your fork:
   ```bash
   git add .
   git commit -m "Describe what you changed"
   git push origin short-name-for-your-change
   ```
6. **Open a pull request** on GitHub from your branch. Fill in the PR template — say what you changed and why. If it's a visual change, add a screenshot.
7. A maintainer reviews it. Expect some back-and-forth — that's normal and not criticism.

## Check your work before opening a PR

Code style and quality are checked **automatically** — you don't have to memorize style rules, just run the tools and let them fix things. These are the same checks that run in CI (the automated checks GitHub runs on your PR); **your PR needs them all to pass to be merged.**

**Backend (Python):**
```bash
uv run ruff format backend/     # auto-fix formatting
uv run ruff check backend/      # find problems
uv run pytest                   # run the tests (needs the app running — see docs/setup.md)
```

**Frontend (TypeScript), from the `frontend/` folder:**
```bash
npm run format      # auto-fix formatting with Prettier
npm run lint        # find problems
npm run typecheck   # check types
```

If a check complains, fix it before opening the PR. **Don't turn off a rule or delete a test just to make a check pass** — if you think a rule is wrong, say so in your PR and let a maintainer decide.

## Using AI to write code

Using an AI assistant (Copilot, Cursor, ChatGPT, Claude, etc.) is allowed and encouraged. To keep quality high:

- **Point your AI at [AGENTS.md](AGENTS.md)** — it lists the project's rules and the checks to run. Most AI tools read this file automatically.
- **You own the code, not the AI.** Read and understand every line before you submit it. If a reviewer asks "why does this work?", you should be able to answer.
- **Keep it small.** AI loves to rewrite whole files and add things nobody asked for. Trim it down to just what's needed.
- **Run the checks above.** AI output often fails formatting, types, or tests — the checks catch this.
- **Never paste secrets** (passwords, API keys, the contents of `.env`) into an AI tool.

## The rules that keep this safe

This app is used for real, so a few rules are non-negotiable. If your change touches these areas, be extra careful (full list and reasoning in [CLAUDE.md](CLAUDE.md)):

- **File uploads/downloads go directly between the browser and storage** using temporary signed links. The backend never handles the raw file bytes.
- **Private projects must stay private.** Don't add a route or query that could return a private project or file to someone who isn't allowed to see it.
- **Login is restricted to the university's Google accounts.** Don't loosen that.
- **Limits (file sizes, storage quotas) come from settings, never hardcoded.**

If you're unsure whether your change is safe, ask in the PR before merging — better to check.

## Reporting bugs and ideas

Use the **Issues** tab with the provided templates. For anything **security-related**, do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Licensing

This project is licensed under the [MIT License](LICENSE). By contributing, you agree your contribution is released under the same license.

## Be kind

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be patient and respectful — everyone here is learning.
