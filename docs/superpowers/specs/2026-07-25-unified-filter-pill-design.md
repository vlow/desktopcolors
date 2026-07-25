# Unified filter pill — design spec

**Date:** 2026-07-25
**Scope:** Colors page (`src/islands/Colors.tsx`), shared styles
(`src/styles/tokens.css`), design docs (`DESIGN.md`).

## Problem

The Colors page has two filter facets rendered as chips: **Basic Colors**
(color families) and **TYPE** (color types). They are conceptually peer
controls but their visual design has drifted apart on four axes:

| Axis | Basic Colors | TYPE |
|---|---|---|
| Pill size | `13px` text, `15px` chip, `8px 14px 8px 10px` pad, `8px` gap | `12px` text, `13px` chip, `6px 12px 6px 8px` pad, `7px` gap |
| Count size | `400 11px` mono | `400 10px` mono |
| Label position | block, above the pills | inline, left of the pills |
| Label text | `BASIC COLORS — CLICK TO NARROW` | `TYPE` |

Everything is inline-styled, so there is no shared pill class — only
`.dc-pill-count` (layout only) and `.dc-control-label` are shared today.

## Goal

One consistent, shared pill design used by **both** groups, so they read as the
same control at every viewport width. Same named CSS classes for both. Update
the design documentation.

## Decisions

1. **Pill size — responsive, not fixed.** Larger on wide viewports, more
   compact below the site's existing 760px breakpoint. Both groups use the
   identical responsive class, so they always match each other.
   - **≥ 760px:** `13px` text, `15px` chip, `8px 14px 8px 10px` pad, `9px` row
     gap, `11px` count.
   - **< 760px:** `12px` text, `13px` chip, `6px 12px 6px 8px` pad, `8px` row
     gap, `10px` count.
2. **Label position — responsive, mirroring the pill size.**
   - **≥ 760px:** block, on its own line above the pills.
   - **< 760px:** inline, to the left of the pills, aligned to the **top**
     (`align-items: flex-start`) so the label stays beside the first row when
     the pills wrap to multiple rows.
3. **Label text — terse and consistent:** `BASIC COLORS` and `TYPE`. The
   `— CLICK TO NARROW` hint is dropped; the pills' active/hover/pressed states
   already signal they are interactive, and terse labels read better inline on
   narrow screens.

## Implementation

### `src/styles/tokens.css` — new shared classes

- `.dc-filter-group` — wraps one group's label + pills. `flex-column` (label
  above the pills) on wide; `flex-row` with `align-items: flex-start` (label
  inline, left) below 760px.
- `.dc-filter-pills` — the wrapping pill row: `display: flex; flex-wrap: wrap;`
  with a responsive row gap (`9px` wide / `8px` narrow).
- `.dc-filter-pill` — the toggle button. Base: `inline-flex`, `999px` radius,
  `1px` field border, white background, `--ink` text. Active state via the
  **`aria-pressed="true"`** attribute selector (`--ink` fill, white text) — this
  is also an accessibility upgrade, as the pills are toggle buttons that
  currently expose no pressed state. Disabled state via `:disabled`
  (`opacity: 0.4`). Responsive size lives in the existing `< 760px` block.
- `.dc-filter-pill-chip` — the round color dot. Fixed size + inset ring;
  `background-color` stays **inline** on the element because it is data-driven
  (per family/type `chip` value).
- `.dc-pill-count` — gains the shared count type (`font: 400 11px var(--font-mono);
  opacity: 0.6`), currently duplicated inline at two different sizes; keeps its
  existing fixed-width tabular layout. Responsive `10px` below 760px.
- `.dc-filter-clear` — the "Clear ✕" text button, so its size stops drifting
  (`13px` → `12px` responsive) between the two groups.

### `src/islands/Colors.tsx`

Both the family block (currently ~218–229) and the type block (currently
~231–247) collapse to the **same markup**:

```jsx
<div class="dc-filter-group">
  <span class="dc-control-label">BASIC COLORS</span>
  <div class="dc-filter-pills">
    {defs.map((d) => (
      <button class="dc-filter-pill" aria-pressed={active} disabled={dim} onClick={…}>
        <span class="dc-filter-pill-chip" style={`background-color: ${d.chip};`} />
        {d.name}
        <span class="dc-pill-count">{countLabel(n, total)}</span>
      </button>
    ))}
    {selected && <button class="dc-filter-clear" onClick={…}>Clear ✕</button>}
  </div>
</div>
```

The two `.dc-filter-group` wrappers stack in a flex-column container that
replaces the current ad-hoc `margin-top: 18px` / `margin-top: 14px` spacing.
The type group's clear button keeps its distinguishing "Clear type ✕" text; only
its styling is unified via `.dc-filter-clear`.

### `DESIGN.md`

- Add decision **D5 — Filter pill (`.dc-filter-pill` / `.dc-filter-group`)**: a
  togglable facet chip. Document purpose (peer facet controls that must read as
  one system), the responsive size + label behavior, active-via-`aria-pressed`,
  and that the chip color stays inline because it is data-driven.
- Update **D4** (control label): change the cited example
  `BASIC COLORS — CLICK TO NARROW` to `BASIC COLORS`, and note that the Colors
  filter-group labels are the responsive block-above / inline-left case, owned
  by `.dc-filter-group` (per D5).

## Non-goals

- No change to filter behavior, counts, cross-filtering, or the OS filter panel.
- No change to the hue-band swatches or the leaderboard rows.
- No new hover animation beyond what exists today.

## Verification

- `npm test` (or the project's test command) passes; update any Colors tests
  that select pills by inline style rather than role/text.
- Visual check at ≥ 760px and < 760px: both groups identical to each other;
  size and label layout switch at the breakpoint.
