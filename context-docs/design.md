# Design (UX)

The screens and behaviors. **Visual styling — typography, color, spacing, component states — comes from the design flow in CLAUDE.md hard rule 7:** base = TypeUI **storytelling** prompt (page structure/narrative) + TypeUI **nostalgia** prompt (visual voice), both supplied by the owner at frontend kickoff; refined and reviewed with the `impeccable` and `design-taste-frontend` skills. Direction: bold yet simple, smooth transform/opacity animations (no linear PPT fades), sharp bold self-hosted fonts, must not read as AI-generated. Layout inspiration: Instructables/Hackster.io build logs, read.cv profiles, editorial long-form blogs.

## Screen inventory

| Screen | Who | What it does |
|---|---|---|
| Landing | Everyone (incl. anonymous) | Full-bleed auto-advancing image slider (admin pins first, random public-with-image fill; pause on hover, swipe on mobile) → admin-curated **Featured projects** grid → browse-all entry. |
| Public browse / showcase | Everyone (incl. anonymous) | Grid of **public** projects only (cover, title, owner), paginated. |
| Single project view | Everyone, gated by visibility | Blog-style write-up (rich text with inline photos/videos/diagrams), owner, then a **Downloads** section (CAD/3D/archives: name, type, size). Private projects 404 for non-owner/staff. |
| Profile page | Everyone | Student's avatar, name, program, enrollment year, description, and project grid. Anonymous visitors see public projects only; owner/staff also see private. |
| Login | Anyone | Google OAuth. Non-uni domains rejected with a clear message. Account auto-created on first uni login. |
| Project editor | Logged-in students/staff (owner) | Visual WYSIWYG (TipTap): headings, text marks, lists, inline image/video/diagram embeds (each embed runs the presigned upload flow), attachments manager for the downloads area, cover picker. |
| Profile edit | Logged-in owner | Description, program, enrollment year, avatar upload. |
| My-projects dashboard | Logged-in students/staff | The user's own projects (public and private badges), create/delete, toggle visibility. |
| Admin dashboard | Staff only | Tabs: **Curation** (feature + reorder, pin to slider, landing preview), **People** (promote/demote staff), **Moderation** (all projects incl. private; edit/hide/delete). All admin actions via UI — never code. |

## Project content model (blog)

- Write-up stored as **TipTap JSON** on the Project. Media nodes reference **File ids**, never URLs — presigned URLs expire, so the renderer resolves ids → fresh URLs on every view (one batch mint per page render).
- Files have a `kind`: **media** (embedded in the write-up) or **attachment** (downloads area). Same upload flow for both.
- Slider/cards use the project's cover image (student-picked).

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
