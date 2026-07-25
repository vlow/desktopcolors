# DESIGN.md

How we decide **which** UI element to use, and **why** — the UX intent behind
desktopcolors' shared design elements.

This guide is the **purpose** layer. It does not duplicate:

- [`CLAUDE.md` → Styling conventions](CLAUDE.md) — the rule for _where_ a style
  lives (reuse a token → create a shared class → inline one-off).
- [`src/styles/tokens.css`](src/styles/tokens.css) — the actual custom properties
  and utility/component classes.

If `tokens.css` says _what a class is_, this file says _when to reach for it_.
The aim: a human or an LLM agent can pick the right element from its **purpose**
alone, without reverse-engineering the CSS.

## How to use this guide

### When adding a new page

1. Put page content inside the shared page inset (`.dc-page-x`) so it lines up
   with the header and footer.
2. Walk the **Design decisions** below. For each, test its **Use it when**
   trigger against your page and apply the ones that fit.
3. Hit a pattern this guide doesn't cover? Add a decision (see _Recording a
   decision_) instead of inventing a one-off style.

### When adding a section or function to an existing page

1. Look at the page's existing structure first and reuse the elements already in
   play — consistency within a page beats novelty.
2. Scan the **Design decisions** for anything your addition triggers (e.g. a new
   heading-then-content split → the section rule, **D1**).
3. Prefer an existing decision's element over a fresh inline style. If nothing
   fits, record a new decision.

### Recording a decision

Lead with **purpose**, not appearance — a reader should learn _when_ to use the
element before any CSS is mentioned. Give each entry a stable `D#` id so code
review and other docs can reference it. Use this template:

```
### D# — <short name>: <the job it does>
- **Element** — the concrete class/component and how it is placed.
- **Purpose (UX)** — the user-facing job it does.
- **Use it when** — the trigger(s).
- **Don't use it when** — anti-patterns, and what to use instead.
- **How** — implementation notes (file, token/class, placement rules).
- **Why this way** — the rationale worth preserving.
```

## Design decisions

### D1 — Section rule (`.dc-rule`): separate a heading zone from its content

- **Element** — a hairline divider, placed as its own band with a content-wide
  line inside it:

  ```html
  <div class="dc-page-x"><hr class="dc-rule" /></div>
  ```

  Defined in [`src/styles/tokens.css`](src/styles/tokens.css) (`.dc-rule`).

- **Purpose (UX)** — introduce a small, calm separation between a page's
  **heading zone** — eyebrow label, title, description, and any
  search / filter / view controls — and its **content / data zone** below
  (cards, swatches, ranked rows, article body). It tells the reader: _the setup
  ends here; the data starts here._

- **Use it when** — a page or a major section stacks a heading/controls area
  above a distinct body of content, and the boundary would otherwise be
  ambiguous. **One per boundary.** This is the standard top-of-page treatment on
  every page (Platforms, Colors, Setup, About, Privacy, Imprint).

- **Don't use it when**
  - Separating peer items _within_ the content (rows, cards) — use the item's
    own border (`var(--card-border)`) instead.
  - Framing the app itself — the global **Header** (bottom border) and **Footer**
    (top border) deliberately use full-viewport borders as chrome; don't swap
    those for `.dc-rule`.
  - You only need breathing room — reach for `padding-block` / `margin`, not a
    line.

- **How**
  - The line must be **content-wide** (aligned to the capped content column), so
    it lives _inside_ a `.dc-page-x` wrapper. Do **not** put `border-bottom` on
    the `.dc-page-x` heading band itself: because `.dc-page-x` is a full-width
    element with inset padding, a border on it spans the entire viewport.
  - Place it at the boundary between the two sibling bands. It carries **no
    vertical margin** — the gap above is the heading band's `padding-block`
    bottom, the gap below is the content band's `padding-block` top. Tune spacing
    on those bands, not on the rule.

- **Why this way** — content-wide keeps the line visually tied to the headings
  and cards it divides, while full-viewport borders stay reserved for the global
  app frame. That contrast — _chrome spans the viewport, page structure spans the
  content column_ — is the cue readers use to tell "the app" from "this page." A
  single reusable class (instead of repeated inline borders) keeps every page's
  separator identical, per `CLAUDE.md`'s styling rules.

### D2 — Collapse-to-dropdown on mobile (`.dc-desktop-only` / `.dc-mobile-only` + `<Dropdown>`): fit a wide toolbar onto a narrow screen

- **Element** — a toolbar renders **both** its desktop control and a mobile
  `<Dropdown>` (`src/islands/Dropdown.tsx`); visibility is toggled by the
  `.dc-desktop-only` / `.dc-mobile-only` utility classes in
  [`src/styles/tokens.css`](src/styles/tokens.css). Menu rows are
  `<button role="menuitem" class="dc-menu-item">`.

- **Purpose (UX)** — a heading-zone toolbar with several inline controls (view
  switcher, sort, grouping) wraps onto multiple lines below 760px and steals
  vertical space. Collapsing the controls into a single dropdown button keeps
  the setup zone compact while preserving every option one tap away.

- **Use it when** — a page's inline toolbar controls overflow on narrow screens.
  In play on Platforms (Sort) and Colors (Group + Sort).

- **Don't use it when**
  - A control is meaningless on mobile (e.g. the Platforms List view): drop it
    entirely with `.dc-desktop-only` rather than moving it into a menu.
  - A single primary action fits fine (e.g. the Colors "Filter by OS" button):
    leave it inline.

- **How**
  - Render both variants; never conditionally render one based on a JS
    breakpoint — that reintroduces hydration flash. `.dc-mobile-only` is
    `display:none` by default and shown below 760px; `.dc-desktop-only` is
    hidden below 760px.
  - The `<Dropdown>` owns open/close (outside-click + Escape); callers pass a
    `trigger` and `children(close)` and render their own `menuitem` rows,
    marking the active one with `aria-current="true"`.
  - Where a JS branch (not just styling) must react to the breakpoint — e.g.
    forcing the Platforms content to Cards when a desktop window is narrowed —
    use the `useIsNarrow()` hook (`src/lib/useIsNarrow.ts`), the one sanctioned
    JS breakpoint read. Keep it out of visual layout so no flash is introduced.

- **Why this way** — rendering both variants and toggling with CSS keeps the
  site's flash-free, server-rendered responsive model (the same reason islands
  put their media queries in `tokens.css` rather than in JS). A single shared
  `<Dropdown>` keeps the three menus identical and the open/close logic in one
  place, per `CLAUDE.md`'s reuse-first styling rules.

### D3 — Page heading zone (`.dc-page-head` + `.dc-page-title`): open every page the same way

- **Element** — the heading band that opens a top-level page, directly under
  the header: an eyebrow label, the `<h1>`, and a description. The band carries
  `.dc-page-x .dc-page-head`; the title carries `.dc-page-title`.

- **Purpose (UX)** — every page should feel like the same site. A single title
  size and a single gap from the header keep the masthead consistent as you move
  between Platforms, Colors, Setup, About, the legal pages, and OS detail.

- **Use it when** — a page (or a leaf page like OS detail) opens with a
  title zone below the header. Pair with the section rule (**D1**) when a
  toolbar or content follows.

- **Don't use it when** — a heading is nested _inside_ content (a card title, a
  section sub-heading). Those are local and keep their own type scale.

- **How**
  - `.dc-page-head` owns only the top gap from the header (`padding-block-start:
    34px`); the band sets its own bottom gap via `padding-block-end` so the
    breathing room before the rule/content stays per-page.
  - `.dc-page-title` owns the title type — `700 32px/1.1`, `letter-spacing
    -0.8px` — shrinking to `24px` below 760px. Pages keep only their own `margin`
    on the `<h1>` for the eyebrow/description gaps; they no longer set font size.
  - Both live in `tokens.css`. Islands (`.tsx`) have no scoped styles, so this is
    the only place the rules can live and be shared with the `.astro` pages.

- **Why this way** — the sizes and top gaps had drifted to five different values
  across the pages. Centralizing the two that define the masthead (title type,
  header gap) into shared classes makes them identical by construction and gives
  one place to retune, per `CLAUDE.md`'s reuse-first rules. Vertical rhythm
  _inside_ the band stays inline because it is genuinely per-page.
