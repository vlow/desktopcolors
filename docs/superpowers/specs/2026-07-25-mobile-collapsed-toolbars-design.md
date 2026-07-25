# Mobile-collapsed toolbars for Platforms & Colors

**Date:** 2026-07-25
**Status:** Approved for planning

## Problem

On the Platforms page the toolbar shows a **VIEW** switcher (Cards / List) and
four **SORT** buttons; on the Colors page it shows **GROUP** (Hue / Flat) and
**SORT** (Spectrum / Popularity) segmented controls. Below the site's mobile
breakpoint these controls wrap onto several lines and eat vertical space. The
List view is already unusable on narrow screens (its toggle is greyed-out and
inert, with a "List view needs a wider screen" note).

Goal on mobile (`max-width: 759.98px`):

1. **Platforms** — drop the VIEW switcher entirely and always show the Cards
   layout.
2. **Platforms & Colors** — collapse the sort controls (and, on Colors, the
   Group control) into compact **dropdown menus** opened from a single button.

## Constraints & conventions

- Single site-wide breakpoint: **760px** (`max-width: 759.98px` for mobile,
  `min-width: 760px` for desktop). Reuse it; do not introduce a new one.
- The codebase is **CSS-hook responsive**: islands are inline-styled Preact
  `.tsx` with no scoped `<style>`; responsive rules live in
  [`src/styles/tokens.css`](../../../src/styles/tokens.css) and hook onto class
  names, using `!important` to win over inline styles. There are currently **no**
  `matchMedia` / `useMediaQuery` hooks anywhere — this is deliberate and avoids
  hydration flash.
- Shared styles belong in `tokens.css` (per `CLAUDE.md` styling rules); new
  shared UI patterns get a DESIGN.md decision entry.

## Core mechanism: render both variants, toggle with CSS

To preserve the flash-free model, **both** the desktop control and its mobile
dropdown are rendered in the DOM; CSS media queries decide which is visible:

- `.dc-desktop-only` — visible at ≥760px, `display: none !important` below.
- `.dc-mobile-only` — hidden at ≥760px, shown below.

Because the dropdown's open/closed state defaults to **closed**, nothing pops
open on load and there is no flash or layout shift.

### The one JS exception: `useIsNarrow()`

CSS alone cannot switch the Platforms *content* from the List branch to the
Cards branch when a **desktop** user narrows the window (the `view` state is JS).
A minimal SSR-safe hook handles only this:

```ts
// src/lib/useIsNarrow.ts
// Returns true below 760px. Defaults to false so SSR and first client render
// agree (no hydration mismatch); a post-mount effect sets the real value and
// subscribes to changes.
export function useIsNarrow(): boolean
```

Used only to compute `const effectiveView = isNarrow ? "card" : view;` in
PlatformControls. On a real phone `view` already defaults to `"card"`, so the
hook changes nothing on load — it only *corrects* the desktop→narrow resize
case. This is a deliberate, narrowly-scoped departure from the pure-CSS
convention, documented in `tokens.css` and DESIGN.md.

## Shared component: `<Dropdown>`

New Preact component `src/islands/Dropdown.tsx`, reused three times (Platforms
Sort, Colors Group, Colors Sort). One well-bounded unit that owns only the
open/close behavior and panel chrome; each caller supplies its own menu rows.

**Props**

- `trigger: ComponentChildren` — content of the trigger button (label + arrow +
  chevron).
- `children: ComponentChildren` — the menu rows.
- `ariaLabel: string` — accessible name for the trigger.
- `align?: "left" | "right"` — panel edge alignment (default `"left"`).

**Behavior**

- `useState(false)` for open; toggled by the trigger.
- Closes on outside-click (document `pointerdown` listener) and on `Escape`, via
  a `useEffect` that subscribes only while open and cleans up.
- Panel is absolutely positioned under the trigger.

**Styling (from tokens)** — panel: `background: var(--bg)`, `border: 1px solid
var(--card-border)`, rounded corners, soft shadow, `z-index` above content,
`padding` for the rows. Trigger button matches the toolbar's inline button
idiom.

**ARIA** — trigger: `aria-haspopup="menu"`, `aria-expanded={open}`,
`aria-label`. Panel: `role="menu"`; each row a `role="menuitem"` `<button>`.
Rows are focusable buttons.

## Platforms page (`src/islands/PlatformControls.tsx`)

- **VIEW block** (the `VIEW` label + Cards button + `|` + List button) → wrap in
  a `.dc-view-controls` group (`display: flex; gap: 14px; align-items: center;`
  to preserve current appearance). Add `.dc-desktop-only` so it is **hidden
  below 760px**.
- **Content branch** — replace `view === "card"` with
  `effectiveView === "card"`, where `effectiveView = isNarrow ? "card" : view`.
  So mobile always renders the Cards grid.
- **SORT (desktop)** — wrap the `SORTS.map(...)` inline buttons and the `SORT`
  label in `.dc-sort-inline .dc-desktop-only` (`margin-left: auto`, flex row).
- **SORT (mobile)** — a `.dc-mobile-only` `<Dropdown>`:
  - Trigger: `Sort · {activeIcon} {activeLabel} {dirArrow} ▾`
    (e.g. `Sort · ★ Popular ↓`).
  - Menu rows: one per `SORTS` entry = `{icon} {label}` + direction arrow;
    the active row is marked (accent underline/dot, matching the desktop
    selected treatment) and shows its current direction arrow.
  - Interaction parity with desktop: selecting a **different** sort sets it
    (default direction) and **closes** the menu; tapping the **active** sort
    **reverses** direction (`rev`) and **keeps the menu open** so the flip is
    visible.
- **Cleanup** — remove the now-dead `.dc-list-toggle` inert rule and the
  `.dc-list-note` markup + rule (the whole VIEW/List path is gone on mobile).
  Keep the `.dc-platform-list-row` single-column rule as cheap insurance for the
  one-frame window before the resize effect runs.

## Colors page (`src/islands/Colors.tsx`)

- **GROUP (desktop)** — wrap the Hue/Flat segmented control (+ `GROUP` label) in
  `.dc-desktop-only`.
- **SORT (desktop)** — wrap the Spectrum/Popularity segmented control (+ `SORT`
  label) in `.dc-desktop-only`.
- **Mobile** — two `.dc-mobile-only` `<Dropdown>`s:
  - Group: trigger `Group · {current} ▾`; rows `Hue` / `Flat`, check on active.
  - Sort: trigger `Sort · {current} ▾`; rows `Spectrum` / `Popularity`, check on
    active. No direction arrow (Colors has no reverse).
  - Selecting a row updates the same `group` / `sort` state and closes the menu.
- **Facet filter pills** — unchanged.

## Styles & docs

- Add `.dc-desktop-only` / `.dc-mobile-only` utility classes to `tokens.css`
  (shared, used on both pages).
- Any dropdown panel/trigger styling that is repeated lives on the `<Dropdown>`
  component or as tokens, not duplicated inline per call site.
- Add a **DESIGN.md** decision entry (`D2` — "Collapse-to-dropdown on mobile";
  D1 is the section rule, so the next id is D2):
  purpose, when to use it (a toolbar whose inline controls overflow on narrow
  screens), how (both variants rendered, CSS-toggled; `<Dropdown>` component),
  and why (space saving without hydration flash).

## Testing (TDD)

- `src/islands/Dropdown.test.tsx`:
  - Panel is closed initially; clicking the trigger opens it.
  - Outside-click and `Escape` close it.
  - Clicking a menu row invokes the row's handler.
  - `aria-expanded` reflects state.
- Extend `src/islands/PlatformControls.test.tsx`:
  - Both the desktop VIEW/SORT buttons and the mobile Sort dropdown render (both
    in the DOM; visibility is CSS).
  - Opening the mobile dropdown and picking a sort reorders the list.
  - Tapping the active sort in the dropdown reverses direction.
  - With `useIsNarrow` mocked `true`, the content renders the Cards grid even
    when `view` state is `"list"`.
- Extend `src/islands/Colors.test.tsx`:
  - Mobile Group and Sort dropdowns render and drive the same `group` / `sort`
    state as the desktop segmented controls.

## Out of scope

- Colors facet filter pills (unchanged).
- Any new breakpoint or a general responsive framework.
- Keyboard arrow-key navigation within menus (Escape + click-away only for now;
  rows remain focusable via Tab).
