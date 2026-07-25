# Collapsible color filters on mobile

## Goal

Below 760px, collapse the Colors page's two color-facet groups
(`BASIC COLORS` families + `TYPE`) behind a single "Filter by color" toggle,
collapsed by default. Reuse the existing "Filter by OS" collapse pattern (D2)
and panel look (`.dc-os-panel`). Desktop (≥760px) is unchanged.

## Decisions

- **One combined toggle** — a single mobile-only "Filter by color" button reveals
  both facet groups together.
- **Bordered panel card** — opened filters render in a bordered, rounded white
  card mirroring `.dc-os-panel`.
- **No count badge** — the button shows active state only via its filled
  (ink) style; it highlights when open **or** a family/type filter is set.

## Changes

### `src/islands/Colors.tsx`
- Add `const [colorOpen, setColorOpen] = useState(false)`.
- Add a mobile-only toggle button in the toolbar row, right after the
  "Filter by OS" button, wrapped in `<div class="dc-mobile-only">` (the same
  wrapping the Group/Sort mobile dropdowns use). Reuse the OS button's inline
  pill style; highlighted when `colorOpen || family || type`. Carries
  `aria-expanded` and `aria-controls="dc-color-filters"`.
- The existing filter-groups container gains `id="dc-color-filters"` and
  `class={"dc-color-filters" + (colorOpen ? " dc-open" : "")}`, replacing its
  inline `style`.

### `src/styles/tokens.css`
- New `.dc-color-filters` rule. Base (desktop): the container's current inline
  values (`margin-top:18px; display:flex; flex-direction:column; gap:16px`).
- `@media (max-width:759.98px)`: `.dc-color-filters { display:none }`;
  `.dc-color-filters.dc-open` shows as a bordered panel matching
  `.dc-os-panel`'s mobile treatment (border, radius, background, padding).

### `DESIGN.md`
- Extend **D5** with a note: on mobile the two facets collapse behind a
  "Filter by color" toggle into an OS-panel-style card (cross-reference D2).

## Non-goals

- No desktop behavior change.
- No count badge on the toggle.
- No change to the facet logic, counts, or clear buttons.

## Verification

- Flash-free: both states always in the DOM; visibility toggled by CSS + the
  `dc-open` class only — no JS breakpoint read.
- Test asserting the toggle button exists, controls `#dc-color-filters`, and
  flips `aria-expanded` / the panel's `dc-open` class on click.
