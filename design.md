# Design (UX)

The screens and behaviors. **Visual styling — typography, color, spacing, component states — is owned by the TypeUI skill (SKILL.md from typeui.sh), not this file.** When building UI, follow the skill's tokens. **The skill is not installed yet → leave all component visuals as TODO; do not invent a visual system.**

## Screen inventory

| Screen | Who | What it does |
|---|---|---|
| Public browse / showcase | Everyone (incl. anonymous) | Grid/list of **public** projects only. Entry point for visitors. |
| Single project view | Everyone, gated by visibility | Title, description, owner, file list with download. Private projects only render for owner/staff. |
| Login | Anyone | Google OAuth. Non-uni domains rejected with a clear message. |
| Upload flow | Logged-in students/staff | Pick a project, add files, watch pending→ready. See upload UX below. |
| My-projects dashboard | Logged-in students/staff | The user's own projects (public and private), create/edit, toggle visibility, manage files. |
| Staff admin | Staff only | Manage the staff allowlist; view/manage any project. |

## Public-vs-private visibility behavior

- `is_public` lives on the **Project** (not per-file). Toggling it is a **pure DB write** — no file moves, no re-keying.
- **Anonymous visitor**: sees only `is_public=true` projects in browse and can open them. Private projects 404/forbidden — don't reveal they exist.
- **Owner / staff**: see private projects too.
- A project flipping public→private immediately stops new presigned URLs being minted for non-owners. Existing short-lived URLs expire on their own (minutes) — acceptable, no permanent links to revoke.

## Upload UX (pending → ready)

The upload is multi-step under the hood (presigned PUT → confirm). Surface state honestly:

- **Uploading** — bytes transferring directly to MinIO (progress from the PUT).
- **Processing** — PUT done, confirm endpoint running (`stat_object` size check).
- **Ready** — confirmed; file visible and downloadable.
- **Failed / rejected** — oversized (caught at one of three points) or confirm error. Show the limit; let the user retry. Orphaned objects from abandoned uploads are swept by the cleanup job — the user doesn't manage that.

Oversize messaging maps to the three enforcement points: rejected before upload starts (declared-size), rejected mid-upload by MinIO (content-length-range), or rejected at confirm (actual size). All three should surface the same plain "file exceeds N GB limit" message.

**Download links are not cached client-side** — presigned URLs expire. If a user leaves a project open and clicks download later, the frontend re-mints the URL on click rather than reusing a stale one (a stale URL returns 403).
