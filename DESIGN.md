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
  `<button role="menuitem" class="dc-menu-item">`, or `<a role="menuitem">` where
  the row navigates rather than setting state (the OS detail References menu).

- **Purpose (UX)** — a heading-zone toolbar with several inline controls (view
  switcher, sort, grouping) wraps onto multiple lines below 760px and steals
  vertical space. Collapsing the controls into a single dropdown button keeps
  the setup zone compact while preserving every option one tap away.

- **Use it when** — a page's inline controls overflow on narrow screens. In play
  on Platforms (Sort), Colors (Group + Sort), and the OS detail heading zone
  (References). The References row is the open-ended case: an entry may carry any
  number of links, so the inline pills wrap to two or three lines on a phone and
  push the title down. The menu keeps the zone one line tall at any link count.

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
  - When a grid sets a fixed minimum track, write it
    `minmax(min(<px>, 100%), 1fr)` rather than `minmax(<px>, 1fr)`. A bare
    `minmax()` minimum cannot shrink below `<px>`, so the grid overflows every
    viewport narrower than it — and, because the row's own `1fr` columns then
    resolve against that too-wide track, any mobile rules for the row silently
    do nothing. `min(<px>, 100%)` clamps the track to its container, so the grid
    self-corrects at every width with no breakpoint.
  - Where a JS branch (not just styling) must react to the breakpoint — e.g.
    forcing the Platforms content to Cards when a desktop window is narrowed —
    use the `useIsNarrow()` hook (`src/lib/useIsNarrow.ts`), the one sanctioned
    JS breakpoint read. Keep it out of visual layout so no flash is introduced.

- **Why this way** — rendering both variants and toggling with CSS keeps the
  site's flash-free, server-rendered responsive model (the same reason islands
  put their media queries in `tokens.css` rather than in JS). A single shared
  `<Dropdown>` keeps the three menus identical and the open/close logic in one
  place, per `CLAUDE.md`'s reuse-first styling rules.

### D3 — Page heading zone (`.dc-page-head` + `.dc-page-eyebrow`/`.dc-page-title`/`.dc-page-lead`): open every page the same way

- **Element** — the heading band that opens a top-level page, directly under
  the header, stacking three parts in order: a mono **eyebrow** label
  (`.dc-page-eyebrow`), the **title** `<h1>` (`.dc-page-title`), and a
  **lead** description paragraph (`.dc-page-lead`). The band carries
  `.dc-page-x .dc-page-head`.

- **Purpose (UX)** — every page should feel like the same site. One eyebrow
  style, one title size, one lead size, and one set of gaps (from the header and
  between the three parts) keep the masthead identical as you move between
  Platforms, Colors, Setup, About, the legal pages, and OS detail.

- **Use it when** — a page (or a leaf page like OS detail) opens with a
  title zone below the header. Pair with the section rule (**D1**) when a
  toolbar or content follows.

- **Don't use it when** — a heading is nested _inside_ content (a card title, a
  section sub-heading, a toolbar's `VIEW`/`SORT` mono labels). Those are local
  and keep their own type scale.

- **How**
  - `.dc-page-head` owns only the top gap from the header (`padding-block-start:
    34px`); the band sets its own bottom gap via `padding-block-end` so the
    breathing room before the rule/content stays per-page.
  - The three part classes own type **and** the gaps between them, so pages set
    neither font nor inter-part margins inline:
    - `.dc-page-eyebrow` — `500 11px` mono, `letter-spacing 1.5px`, `--faint`.
      First in the band, no margin.
    - `.dc-page-title` — `700 32px/1.1`, `letter-spacing -0.8px`, `24px` below
      760px; `margin: 8px 0 0` (gap below the eyebrow).
    - `.dc-page-lead` — `15px/1.6`, `--muted`, `max-width 640px`, `text-wrap:
      pretty`; `margin: 10px 0 0` (gap below the title).
  - A page still uses inline style only for genuinely per-page structure — e.g.
    OS detail's reference row pushes its eyebrow down with `margin-top`, and its
    lead adds a `margin-bottom` before the predecessor/successor cards. Top gaps
    stay class-driven; only the extra edge is inline.
  - **Never wrap the masthead in an inner `max-width`.** The eyebrow and title
    fill the `.dc-page-x` band on every page; only `.dc-page-lead` self-caps (at
    640px) for line length. Boxing the whole zone in a narrower column (the legal
    and About pages used to wrap it at 720px) makes those pages open visibly
    narrower than Platforms/Colors and defeats the point of this decision.
  - The band's left edge is stable across pages because the vertical scrollbar
    gutter is reserved globally (`html { scrollbar-gutter: stable }` in
    `tokens.css`). Without it, a short page (no scrollbar) and a long page (with
    one) center against different viewport widths, so the whole column — header
    logo included — jumps sideways as you navigate.
  - All live in `tokens.css`. Islands (`.tsx`) have no scoped styles, so this is
    the only place the rules can live and be shared with the `.astro` pages.

- **Why this way** — title size, header gap, eyebrow type, lead size, and the
  inter-part padding had each drifted to several different values across the
  pages. Centralizing everything that defines the masthead into a few shared
  classes makes it identical by construction and gives one place to retune, per
  `CLAUDE.md`'s reuse-first rules. Only per-page _structure_ (content that
  follows the lead) stays inline.

### D4 — Inline control label (`.dc-control-label`): name a toolbar control the same way everywhere

- **Element** — the quiet mono, uppercase, faint micro-label that sits beside
  (or above) a toolbar control: `VIEW`, `SORT`, `GROUP`, `TYPE`, `SHOW COLORS
  IN`, `BASIC COLORS`. One class, `.dc-control-label`.

- **Purpose (UX)** — a control's label should read as the same kind of thing on
  every toolbar, and stay visually subordinate to both the control it names and
  the page eyebrow (**D3**). A consistent size and label→control gap keeps the
  Platforms and Colors toolbars feeling like one system.

- **Use it when** — labelling an interactive control (a switch, a segmented
  toggle, a filter group) in a page toolbar or filter panel.

- **Don't use it when**
  - It's the page kicker above the `<h1>` — that's the larger `.dc-page-eyebrow`
    (**D3**).
  - It's a mono caption _inside_ content (a card's `FULL GUIDE`, a swatch's hex
    line). Those are content type, not control chrome.

- **How**
  - `.dc-control-label` in `tokens.css` owns type only — `500 10px` mono,
    `letter-spacing 1.5px`, `--faint` (one step down from the 11px eyebrow).
  - Spacing is on the container, not the label: sit an inline label **9px** from
    its control (the flex `gap`); a block label above a control sets its own
    `margin-bottom`. Where a control group holds several buttons with their own
    rhythm (Platforms `VIEW`/`SORT`), wrap the buttons in an inner flex so the
    label keeps the 9px gap while the buttons keep theirs.
  - The Colors filter groups (`BASIC COLORS`, `TYPE`) are the responsive case:
    the label sits **above** the pills on wide viewports and moves **inline to
    the left** below 760px. That block/inline switch is owned by
    `.dc-filter-group` (**D5**), not by this label class — the label stays
    type-only here.

- **Why this way** — these labels had drifted across weight (400/500), size
  (10/11px), and label→control gap (8/9/10/14px). Collapsing the type into one
  class and standardizing the gap removes the drift and gives a single knob,
  per `CLAUDE.md`'s reuse-first rules.

### D5 — Filter pill (`.dc-filter-pill` + `.dc-filter-group`): a togglable facet chip

- **Element** — a rounded, bordered button carrying a small round color chip, a
  name, and a mono count: `.dc-filter-pill` with a `.dc-filter-pill-chip` and a
  `.dc-pill-count`. Several pills sit in a `.dc-filter-pills` row under a
  `.dc-control-label` (**D4**), the whole labelled unit wrapped in a
  `.dc-filter-group`. A trailing `.dc-filter-clear` text button resets the
  facet. In play on Colors for both facets — **Basic Colors** (families) and
  **TYPE** (color types). All in [`src/styles/tokens.css`](src/styles/tokens.css).

- **Purpose (UX)** — the two Colors facets are peer controls; a reader should
  see them as the same kind of thing, not two bespoke widgets. One shared pill
  keeps their size, chip, count, active look, and label rhythm identical to each
  other at every viewport width.

- **Use it when** — a page offers a set of togglable filters where each option
  carries a color swatch and a live count, and the group needs a quiet label.

- **Don't use it when**
  - The chip is a _data sample_ to browse/preview, not a filter toggle — that's
    the hue-band/leaderboard swatch (`.dc-swatch`), which is bigger, un-bordered,
    and opens an infobox rather than narrowing a set.
  - A single primary action fits inline (Colors "Filter by OS") — leave it a
    plain pill button, not a labelled `.dc-filter-group`.

- **How**
  - `.dc-filter-pill` owns the button chrome; the **active** state is the
    `aria-pressed="true"` attribute (which is also the correct pressed-state a11y
    signal for a toggle button), and the **disabled/zero-in-context** state is
    `:disabled`. Callers set `aria-pressed={active}` and `disabled={dim}` — no
    inline state styling.
  - The chip's `background-color` is **data-driven** (per family/type), so it
    stays inline on the `.dc-filter-pill-chip` span; everything else is the class.
  - Size and label layout are **responsive** and switch at 760px, both facets
    identically: wide → larger pills (`13px`) with the label **above**; narrow →
    compact pills (`12px`) with the label **inline, left** of the pills (aligned
    to the first row when they wrap). The desktop rules and the `< 760px`
    overrides both live in `tokens.css`.
  - The count uses `.dc-pill-count`'s narrow tabular slot (`2.4em`) so a pill
    stays stable as its count changes (`9` → `0/9`) while keeping the slot tight
    — the reserve was the main source of dead space, and trimming it lets a full
    facet row (e.g. the 11 Type pills) stay on one line at the capped content
    width. Only a 3-digit total (`0/104`) nudges a pill.
  - **Mobile collapse** — below 760px both facet groups sit inside a
    `.dc-color-filters` container that is hidden by default and revealed by a
    single mobile-only **"Filter by color"** toggle in the toolbar (the D2
    collapse model). When open (`.dc-open`) the container renders as a bordered
    card mirroring the Filter by OS panel (`.dc-os-panel`). The toggle button
    reuses the OS button's pill style and highlights when open **or** a
    family/type filter is active (no count badge). Desktop keeps the groups
    always-visible in a plain column; both states stay in the DOM and only CSS
    flips, per D2's flash-free rule.

- **Why this way** — the two facets had drifted apart on pill size, chip size,
  count size, and label placement/text, each hand-tuned inline. One shared
  component makes them identical by construction and gives a single place to
  retune, per `CLAUDE.md`'s reuse-first rules. Keeping only the data-driven chip
  color inline honors the one-off exception in the styling conventions.

### D6 — Page search field (`.dc-page-search`): open a searchable page the same way

- **Element** — the full-width search box that opens the Platforms and Colors
  pages, sitting directly under the lead (**D3**): a `.dc-page-search` `<label>`
  wrapping a search-glyph icon, the text `<input>`, and (on Colors) a clear
  button. In [`src/styles/tokens.css`](src/styles/tokens.css).

- **Purpose (UX)** — both pages are, first, a search-and-filter surface, so the
  reader should meet the same search box in the same place at the same distance
  below the description — not two boxes that sit and size slightly differently.

- **Use it when** — a top-level page opens with a free-text search field as the
  first control below the lead.

- **Don't use it when** — the input is a nested/secondary control (a filter
  panel's field, an inline search inside content). Those keep their own size.

- **How**
  - `.dc-page-search` owns the **canonical gap from the lead** (`margin-top:
    24px`) and the **canonical size** (flex row, `52px` tall, capped at `680px`,
    `13px` radius, `0 16px` padding). The gap lives here, not in the page-head's
    `padding-block-end` — that stays the band's bottom gap before the toolbar/rule.
  - Pages set no box styling inline; they add only the **children** — the icon,
    the `<input>` (with its own `value`/`placeholder`/`aria-label`), and, where
    the page supports it, a clear button.

- **Why this way** — the two search boxes had drifted on the lead→field distance
  (26px vs 20px) and were each re-declaring the identical box inline. Folding
  both the gap and the size into one class makes them identical by construction
  and gives a single place to retune, per `CLAUDE.md`'s reuse-first rules — the
  same centralize-the-rhythm move as the masthead itself (**D3**).
