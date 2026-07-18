# Mobile Layout Parity — Design Spec

**Date:** 2026-07-18
**Status:** Approved for planning
**Source design:** Claude Design project *Desktop Colors Reference*
(`3e2cd655-6216-4a72-b43c-f8c1789a4960`) — the `.dc.html` prototype pages, used as
the visual reference.

## 1. Problem

The prototype defines distinct **mobile** treatments on every page (breakpoint
`760px`; About uses `860px`). Production has ported some of them but is missing four:

| Treatment | Status |
|---|---|
| Header → burger menu | ✅ ported (`MobileNav` + CSS `@media 760px`) |
| Setup Guide → expanded card single-column | ✅ ported (`.dc-guide-content`) |
| About → one-column body <860px | ✅ ported (`.about-body`) |
| **Browse → list view disabled on mobile** | ❌ missing |
| **OS Detail → mobile layout** | ❌ missing |
| **Color Explorer → mobile layout** | ❌ missing |
| **Download sheet → bottom sheet** | ❌ missing |

The prototype switched layouts with JS (`window.innerWidth`). Production is an Astro
SSG whose islands hydrate with `client:load`, so it deliberately expresses
responsiveness with **CSS media queries over the server-rendered markup** — no JS
width state, no hydration flash, SEO-safe. Header / Setup / About already follow this.
Islands are Preact `.tsx` (no scoped `<style>`), so their responsive CSS lives in the
global `src/styles/tokens.css` and is wired via class hooks — exactly as `.dc-card`,
`.dc-rank-row`, and `.dc-guide-content` already are.

**Approach:** faithful reflow. CSS media queries reproduce the prototype's mobile
*result* on the existing markup; no duplicated DOM, no JS width detection. All new
rules go in `tokens.css`; components gain minimal `class=` hooks.

## 2. The four treatments

### 2.1 Browse — disable list view on mobile (`BrowseControls.tsx`)
Prototype: below 760px the List toggle is greyed and non-interactive, a note "List
view needs a wider screen" appears, and content is forced to cards.

- List toggle button gets `class="dc-list-toggle"`; below 760px → `pointer-events:
  none`, faint/disabled color (`#cbc7c1`). The `|` separator hides too.
- A note element (`class="dc-list-note"`, hidden ≥760px, shown <760px) renders under
  the controls: "List view needs a wider screen".
- Default view is already cards; with the toggle disabled, cards are the only reachable
  view on phones. Safety net for a resize-from-wide-in-list-view: the list `<main>`
  grid (`230px 1fr`) also collapses to `1fr` below 760px so it never overflows.

### 2.2 OS Detail — mobile layout (`OsDetail.tsx`)
Prototype mobile: single column, compact title, stacked preview-over-list, full-width
Download, single-column values/details.

- Container (`class="dc-detail"`): below 760px reduce horizontal padding `32px → 18px`;
  `h1` `36px → 24px`.
- Preview+rail hero (`class="dc-detail-hero"`): `1.4fr 1fr` → `1fr` and drop the fixed
  `372px` min-height; preview keeps a sensible min-height, list a capped max-height.
- Selected-color card top row (`class="dc-detail-selrow"`): wraps below 760px so the
  Download button (`class="dc-detail-dl"`) becomes full-width and centered.
- Values/Details grid (`class="dc-detail-meta"`): `1fr 1fr` → `1fr`.
- Predecessor/successor buttons already wrap (flex) — no change.

### 2.3 Color Explorer — mobile layout (`Explorer.tsx`)
Prototype mobile: compact header, stacked hue bands, compact leaderboard.

- Container (`class="dc-explorer"`): below 760px padding `26px 32px → 20px 16px`;
  `h1` `32px → 24px`. Group/Sort pill rows already flex-wrap.
- Hue/tone bands (`class="dc-explorer-band"`): `190px 1fr` → `1fr` (label stacks above
  the swatch strip, which already flex-wraps).
- Leaderboard row (reuse existing `.dc-rank-row`; move its grid template from inline
  into the class so a media query can override it). Below 760px it becomes a two-row
  grid: rank · swatch · name · preview-icon on row 1, the progress bar + score
  spanning row 2. Each of the five children gets a hook class
  (`dc-rank-num/-swatch/-name/-bar/-pv`) for explicit placement. Swatch shrinks
  `56px → 44px`.

### 2.4 Download sheet — bottom sheet on mobile (`DownloadSheet.tsx`)
Prototype: centered modal on wide; bottom sheet on narrow (full-width, top-rounded,
grab handle).

- Overlay (`class="dc-sheet-overlay"`): below 760px `align-items: center → flex-end`.
- Panel (`class="dc-sheet"`): below 760px `max-width: 460px → 100%`, `border-radius:
  18px → 22px 22px 0 0`.
- A grab-handle bar (`class="dc-sheet-handle"`, the prototype's 44×5px pill) renders at
  the top of the panel, shown only <760px.

## 3. Non-goals
- No JS `window.innerWidth` / `matchMedia` layout switching (keeps SSG no-flash).
- No duplicated mobile DOM blocks (faithful reflow, not pixel-cloned markup).
- No change to desktop appearance at ≥760px (≥860px for About, unchanged).
- No new breakpoints beyond the established 760px (and About's 860px).

## 4. Testing
- Existing island unit tests (`*.test.tsx`) must stay green; they assert content/logic,
  not viewport CSS, so class-hook additions should not break them.
- Manual/visual verification at a narrow viewport (~375px) and at ≥760px for each of the
  four surfaces, confirming: list disabled + note on Browse; stacked OS Detail with
  full-width Download; stacked Explorer bands + two-row leaderboard rows; bottom-sheet
  download modal. Desktop unchanged.
- Playwright smoke (`e2e/`) must still pass.

## 5. Files touched
- `src/styles/tokens.css` — all new `@media (max-width: 759px)` rules + class hooks.
- `src/islands/BrowseControls.tsx` — list-toggle/note/list-main classes.
- `src/islands/OsDetail.tsx` — container/hero/selrow/meta classes.
- `src/islands/Explorer.tsx` — container/band classes; leaderboard grid → `.dc-rank-row`
  + child hook classes.
- `src/islands/DownloadSheet.tsx` — overlay/panel/handle classes.
