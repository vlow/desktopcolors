# Color Explorer: in-place infobox + OS filter

**Date:** 2026-07-21
**Status:** Approved, ready for implementation plan

## Problem

Two changes to the Color Explorer (`src/islands/Explorer.tsx`), matching the
updated upstream design in the Claude Design project (`DesktopColors.dc.html`):

1. **Infobox instead of a direct OS link.** Today a swatch (grouped view) or row
   (list view) links straight to a color's OS detail page, with a separate
   "⤢ Preview" button. The new design replaces that with an **in-place infobox**
   that expands where the color sits, showing color values (click-to-copy),
   Preview + Download actions, and the list of platforms that shipped the color —
   each platform being the link to its OS detail page. So color→OS navigation
   survives, but now lives *inside* the infobox.

2. **Filter by operating system.** A new `⧉ Filter by OS` panel lets people narrow
   the catalog to colors shipped by chosen OSes, with an ANY/ALL mode. As with the
   existing color Family/Type filters, **impossible options are disabled**.

The infobox has a deliberately different presentation in grouped vs. list view.
Both, and the OS panel, must work in the mobile layout.

## Decisions

- **Port the upstream design as the source of truth.** Layout, styles, copy, and
  interaction come from `DesktopColors.dc.html`, translated from the x-dc template
  framework to Astro + Preact islands and `src/styles/tokens.css` tokens (per
  `CLAUDE.md`). Hard-coded hex values in the design map to existing tokens where
  one exists (`--ink`, `--muted`, `--faint`, `--field-border`, `--card-border`,
  `--accent`, `--accent-strong`, `--panel`, fonts).
- **OS-option disabling = "both, combined"** (chosen over color-filter-only or
  full-empty-result-only). See §4.
- **Color naming stays per-OS + merged.** `mergeColorsByHex` already yields one
  canonical name per hex, which is what the infobox consumes; the platform chips
  show OS names, not per-color names. No naming refactor is part of this work.
- **Navigation model.** The repo uses real routes, not the design's SPA view
  switching. The design's `openColor(slug, hex)` becomes an `<a href>` built with
  `colorPath(slug, hex)` (`src/lib/links.ts`). Preview → `FullscreenPreview`,
  Download → `DownloadSheet` (both existing islands).
- **Copy interactions are tracked** via the existing `track({ kind: "copy", … })`
  helper, matching `OsDetail.tsx`.

## Design

### 1. Data plumbing (build-time → island props)

The island currently receives only `colors: ExplorerColor[]` and `styleBySlug`.
It now also needs per-color platform data and the OS universe. Both are pure,
build-time derivations added to `src/lib/explorer.ts` and passed as props from
`src/pages/explorer.astro`:

- **`platformsByHex: Record<string, Platform[]>`** where
  `Platform = { slug: string; name: string; year: number; family: string; isDefault: boolean }`.
  Built from `catalog.osList` by walking each OS's `colors` and grouping by
  lowercased hex. Each hex's list is sorted by `year`, then `name`. This backs
  both the infobox "shipped on these platforms" list and OS filter matching.
- **`osUniverse: { fams: OsFamily[] }`** where
  `OsFamily = { name: string; oses: { slug: string; name: string; year: number; family: string }[] }`.
  OSes grouped by their `family`, each group and the OSes within sorted by year
  then name. Backs the filter panel's grouped checkboxes.

Rationale: keeping these in `lib/explorer.ts` (pure, unit-testable) rather than
computing them inside the island matches the repo's existing split and keeps the
island focused on state + rendering.

### 2. Infobox (replaces swatch→OS link and the standalone Preview button)

New island state: `exp: string | null` — the hex of the currently expanded color
(single-open; toggling the same hex closes it, opening another replaces it).

A swatch/row is now a **button that toggles the infobox** for its hex. The old
`<a href={c.href}>` swatch link and the separate "⤢ Preview" button are removed;
the swatch itself gains an active treatment when open (accent inset ring + lift,
per design).

**Shared infobox body** (a `<ColorInfobox>` component, reused by both views):

- **Color header** — swatch chip + name + hex, and a "Shipped by N OSes ·
  {default label}" line. *Grouped view only* (the list row already shows the
  swatch/name, so the list variant omits the header).
- **Color values, click-to-copy** — HEX / RGB / HSL / CMYK chips. HSL comes from
  `ExplorerColor`'s existing `h`/`s`/`l`; RGB from `hexToRgb`; CMYK from
  `rgbToCmyk` (`src/lib/color.ts`). Clicking copies and flips the chip to
  "Copied ✓" briefly; each copy calls `track`.
- **Shipped on these platforms** — `platformsByHex[hex]` rendered as chips, each an
  `<a href={colorPath(p.slug, hex)}>`; default-use platforms get an accent border +
  DEFAULT badge.
- **Actions** — Preview (opens `FullscreenPreview` for the current list at this
  color's index) and Download (opens `DownloadSheet` for `{ name, hex, slug }`,
  using the color's `primarySlug`).

**Positioning differs by view:**

- **Grouped (hue):** the panel is injected *after the grid row that contains the
  clicked swatch*, spanning full width, with an upward **caret** aligned to the
  swatch. This needs the design's column math: measure the band grid width via a
  `ref` callback (`bandGridRef`), compute columns from `EXP_COLW = 116` and
  `EXP_GAP = 12` (`cols = max(1, floor((width + GAP) / (COLW + GAP)))`), split the
  band's colors into `head` (through the end of the clicked swatch's row) and
  `tail`, render the panel between them, and set the caret's `left` to
  `(idx % cols) * (COLW + GAP) + COLW/2`.
- **List (flat):** no caret and no color header. The open row squares its bottom
  corners and gains an accent left-border; the panel is attached directly beneath,
  visually connected (`border-top: none`, matching left border), styled per design.

### 3. OS filter panel

New island state: `osOpen: boolean`, `osSel: Record<string, true>` (selected OS
slugs), `osMode: "any" | "all"` (default `"any"`).

- **Toggle button** `⧉ Filter by OS` in the controls row; label appends the count
  when any OS is selected (`Filter by OS · 3`); active/among-selected styling per
  design.
- **Panel** (shown when `osOpen`): a "SHOW COLORS IN" ANY/ALL segmented toggle, a
  Clear action (when a selection exists), and OSes grouped by family in an
  auto-fill grid. Each family has a **tri-state checkbox** (all / some / none of
  its OSes selected) whose click toggles the whole family; each OS is a button
  toggling its own slug.
- **Matching** — `osMatch(color)` gates both bands and ranking:
  - empty selection ⇒ match all;
  - **ANY** ⇒ the color ships on *at least one* selected OS;
  - **ALL** ⇒ the color ships on *every* selected OS.

  Implemented against `platformsByHex[color.hex]` (set of slugs).

### 4. Impossible-option disabling ("both, combined")

Let `U` = the colors passing the current **Family/Type** filter (ignoring the OS
selection). For each OS option `o`:

- An **already-selected** OS is never disabled (so it can always be turned off).
- **ANY mode:** disable `o` when no color in `U` ships on `o`.
- **ALL mode:** disable `o` when
  `U ∩ (colors shipped by every currently-selected OS) ∩ (colors shipped by o)`
  is empty — i.e. adding `o` would empty the result. With no OS selected this
  reduces to the ANY rule.
- A **family checkbox** is disabled when all of its child OSes are disabled; its
  toggle affects only the enabled children.

Disabled styling mirrors the color pills: `opacity: 0.4; cursor: default`, and the
click handler is a no-op. This logic lives in `lib/explorer.ts` as a pure function
(e.g. `osDisabled(...)` / a helper returning the enabled set) so it can be unit
tested independently of the island.

### 5. Mobile

Extends the existing `@media (max-width: 759.98px)` block in
`src/styles/tokens.css`. Per `CLAUDE.md`, shared/responsive rules go in
`tokens.css` via classes, not inline media queries. Needed:

- Bands already collapse to one column; the caret column math yields `cols = 1`
  naturally, so the grouped infobox still renders correctly (caret centered on the
  single-column swatch).
- OS filter grid → single column; ANY/ALL toggle and Clear wrap.
- Infobox header/actions wrap; copy-value chips and platform chips wrap (the design
  already uses `flex-wrap`, so this is mostly verifying inherited behavior and
  adding classes where fixed widths would otherwise overflow).

New shared classes (names TBD during implementation, e.g. `.dc-infobox`,
`.dc-os-panel`) carry any width/column rules that must change at the breakpoint.

### 6. Testing

- **`src/lib/explorer.test.ts`** (pure functions): `platformsByHex` and
  `osUniverse` builders (grouping, sorting, `isDefault`); `osMatch` for ANY/ALL and
  empty selection; the disabling helper for both modes, including the "already
  selected is never disabled" and "family disabled when all children disabled"
  cases.
- **`src/islands/Explorer.test.tsx`** (component): clicking a swatch opens the
  infobox and a second click closes it; only one infobox open at a time; a platform
  chip renders the correct `colorPath` href; opening the OS panel and selecting an
  OS narrows both bands and ranking; ANY vs. ALL produce different result sets on a
  known fixture; an impossible OS is rendered disabled (and unclickable) in both
  modes.

## Out of scope

- Centralizing color names into a single source (discussed and deferred — a larger
  schema migration with its own tradeoffs; not needed for this feature).
- Any change to the OS detail page, Browse, or the color/OS content schema.
- The alternative design explorations in the Design project
  (`Explorer Infobox Options`, `Explorer OS Filter Options`, `Infobox Value
  Layouts`, `Infobox Integrated Compare`) — `DesktopColors.dc.html` is the chosen
  design.
