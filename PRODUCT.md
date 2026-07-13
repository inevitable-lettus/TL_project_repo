# Product

Strategic design context for the impeccable skill. Product facts live in
[context-docs/product.md](context-docs/product.md); this file distills them
for design work. Do not duplicate content — update both when scope shifts.

## Register

product

(The landing/showcase/project/profile pages are brand-leaning surfaces — the
"shop window" — and may borrow brand-register permissions: committed color,
narrative pacing, ambitious-but-short motion. The dashboard/editor/admin are
strictly product register.)

## Users

University makerspace students (~100) writing up builds and sharing files;
staff curating the landing page and moderating; anonymous visitors (including
recruiters — profiles are resume links) browsing public projects.

## Product Purpose

One browsable home for makerspace project files and build stories, replacing
scattered drives and chat threads. Success: students proudly link their
profile, visitors can find and download real project files, staff run the
whole thing from the admin UI.

## Brand Personality

Warm, mechanical, proud-of-the-work. A sun-faded retro manual / vintage
desktop OS ("nostalgia" system): toasted-cream surfaces, espresso ink, glowing
orange wallpaper, windows with title bars, mono system labels. Bold yet
simple. Playful chrome, serious content.

## Anti-references

- Generic AI landing pages: cream-SaaS hero, three equal feature cards,
  tracked-uppercase eyebrow above every section, gradient text.
- Linear PPT-style fades; floaty slow motion. Motion is snappy (120–220ms),
  transform/opacity only.
- Glassmorphism, soft pastel gradients, 8–16px rounded corners — the system
  is sharp (3px), bordered, opaque.

## Design Principles

1. **The desktop metaphor is the soul.** Content lives in bordered windows on
   the orange wallpaper; chrome is flat with physical press feedback.
2. **The work is the hero.** Student photos/writing carry the pages; the UI
   frames them like a well-kept lab manual, never competes.
3. **Tokens only.** All color/spacing/type from the nostalgia tokens in
   `frontend/app/globals.css` + `components/ui.tsx` primitives. Never invent
   ad-hoc values (CLAUDE.md hard rule 7).
4. **Honest states.** Empty, loading, and error states are written in plain
   language with the same care as the happy path.

## Accessibility & Inclusion

Semantic HTML, visible 2px retro focus outlines, body text ≥4.5:1 contrast on
cream/espresso surfaces, `prefers-reduced-motion` honored for any non-trivial
animation, light + dark (`prefers-color-scheme`) both first-class.
