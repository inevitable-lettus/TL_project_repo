# Good first issues

A list of small, well-defined tasks that are good for your first contribution. Each one is scoped so you can finish it without knowing the whole codebase.

**New here?** Read [CONTRIBUTING.md](../CONTRIBUTING.md) first, and get the app running with [docs/setup.md](../docs/setup.md). Then pick a task below, say so on the matching GitHub issue (so two people don't do the same one), and open a pull request when you're done.

> **For maintainers:** copy any of these into a GitHub issue with the "good first issue" label so contributors can claim them. Keep this file as the master list.

---

### 1. Pin the Node.js version with a `.nvmrc` file

**What:** Add a file named `.nvmrc` in the `frontend/` folder containing just the Node.js major version this project uses (`24`).

**Why:** It tells contributors (and tools like `nvm`) exactly which Node version to use, avoiding "works on my machine" problems.

**Where:** New file `frontend/.nvmrc`.

**How to check:** The file exists and contains `24`. Running `nvm use` in `frontend/` picks up Node 24 (if you have nvm installed).

**Difficulty:** tiny.

---

### 2. Add CI and formatting badges to the README

**What:** Add small status badges near the top of [README.md](../README.md) — one for the CI workflow, one showing the project uses Prettier. GitHub shows you the CI badge Markdown under the Actions tab → your workflow → "Create status badge".

**Why:** Badges signal at a glance that the project is tested and consistently formatted.

**Where:** [README.md](../README.md), just under the title.

**How to check:** The README preview on GitHub shows the badges and they link to the right pages.

**Difficulty:** tiny.

---

### 3. Improve an empty-state message

**What:** Find a page that can show an empty list (for example the project showcase/browse page when there are no projects, or a profile with no projects yet) and make the empty state friendlier — a short message and, where it makes sense, a call to action.

**Why:** Blank screens confuse users. A clear "nothing here yet" message is more welcoming.

**Where:** Look under `frontend/app/` for the showcase/browse and profile pages, and their components in `frontend/components/`.

**How to check:** Run the app *without* seeding data (skip the seed step, or delete projects) and confirm the page shows your friendly message instead of a blank area.

**Difficulty:** small.

---

### 4. Add a browser test for the Dev login button

**What:** Write a Playwright test that opens the site, clicks the **Dev login** button, and confirms the user is now logged in (for example, the "Dev login" button is gone and a user menu appears).

**Why:** Dev login is how everyone works locally; a test makes sure it keeps working.

**Where:** Add a test under `frontend/e2e/` (see the existing `smoke.spec.ts` and `helpers.ts` for the pattern). The button lives in `frontend/app/user-menu.tsx`.

**How to check:** Start the stack (`docker compose up -d --build`), then run `cd frontend && npm run e2e` and see your test pass.

**Difficulty:** medium.

---

### 5. Document every setting in `.env.example`

**What:** Make sure every variable in [.env.example](../.env.example) has a short comment explaining what it does and, where useful, its units (bytes, seconds). A few already have comments — fill in any that are thin, and keep the wording beginner-friendly.

**Why:** New contributors shouldn't have to read the code to understand a setting.

**Where:** [.env.example](../.env.example). Cross-check against `backend/app/config.py` to describe each one accurately.

**How to check:** Every variable has a clear one-line comment. Copying it to `.env` and starting the app still works.

**Difficulty:** small.

---

### 6. Add a loading indicator to the user menu

**What:** When the page first loads, the login/user menu waits for the app to check if you're logged in, and shows nothing during that moment. Add a subtle loading placeholder (like a small spinner or greyed-out box) so the header doesn't briefly look empty.

**Why:** A flash of empty space looks broken. A placeholder feels more polished.

**Where:** `frontend/app/user-menu.tsx` (see the `loaded` state — right now it returns `null` while loading).

**How to check:** Reload the site and watch the top-right corner — you should see a placeholder briefly instead of nothing. Make sure `npm run lint` and `npm run typecheck` still pass.

**Difficulty:** small.

---

Have an idea that's not here? Open a feature request (see the Issues tab) and mention you'd like to work on it.
