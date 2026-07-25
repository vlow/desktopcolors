# CLAUDE.md

Guidance for working in this repository.

## Start here

For how the system fits together, read the existing documentation first — it is the
entry point for understanding the codebase:

- [`README.md`](README.md) — project overview and quick start.
- [`DESIGN.md`](DESIGN.md) — the UX/purpose behind shared design elements: which
  element to use when. Read it (and add to it) when adding a page, a section, or
  a new shared UI element.
- [`docs/architecture-frontend.md`](docs/architecture-frontend.md) — the Astro
  static site + Preact islands (pages, content, build).
- [`docs/architecture-edge.md`](docs/architecture-edge.md) — the `counter` Go
  service (the only piece that runs at request time).
- [`docs/adding-os-data.md`](docs/adding-os-data.md) — how to add or edit an OS entry
  and its colors (`src/content/os/*.json`, validated by `src/content/config.ts`). Follow
  this guide (for humans and LLM agents) when adding OS data or colors — including the
  **dithered colors** workflow (blended + partial entries, and when to collapse them).
- [`docs/adding-a-preview-style.md`](docs/adding-a-preview-style.md) — how the
  per-OS desktop previews work and how to add chrome. Previews are a Zod-validated,
  data-driven **chrome spec** per OS family (`src/lib/chromeSpec.ts`); this is the guide
  to follow (for humans and LLM agents) when adding or changing chrome.

## Styling conventions

Avoid inline styles for anything that should be a **site-wide** style. Prefer, in order:

1. **Reuse** an existing CSS definition when one matches — CSS custom properties and
   utility/component classes live in [`src/styles/tokens.css`](src/styles/tokens.css)
   (e.g. `--page-px` and `.dc-page-x` for the shared page-wide horizontal inset,
   the `--font-*`/color tokens, and hover-affordance classes like `.dc-card`).
2. **Create** a new class, token, or style when nothing suitable exists and the value
   is shared across components or pages. Put shared rules in `tokens.css`; component
   scoped `<style>` blocks are fine for styles local to one component.

Inline styles remain valid for genuine **one-off adjustments** — a value used in a
single place with no site-wide meaning.

Rule of thumb: if a value (spacing, color, breakpoint, layout) is repeated or defines
a consistent look across the site, it belongs in CSS, not inline.
