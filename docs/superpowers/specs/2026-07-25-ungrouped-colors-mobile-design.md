# Ungrouped colors view — mobile layout fix

**Date:** 2026-07-25
**Status:** approved, ready for implementation
**Area:** `src/islands/Colors.tsx`, `src/styles/tokens.css`, `e2e/smoke.spec.ts`, `DESIGN.md`

## Problem

On the Colors page, the **Ungrouped** (leaderboard) view overflows the viewport
below 760px — both with the infobox collapsed and with it open. Measured at a
390px viewport: `document.documentElement.scrollWidth` is **676px**, so the page
scrolls horizontally and the rightmost column of every row sits off-screen.

### Cause

The leaderboard container in `src/islands/Colors.tsx` sets a **fixed minimum
track**:

```
<div class="dc-rank-grid" style="… grid-template-columns: repeat(auto-fill, minmax(660px, 1fr)); …">
```

`minmax(660px, 1fr)` cannot shrink below 660px, so the grid stays 660px wide
inside a ~358px content column.

### Knock-on effect

The mobile rules for `.dc-rank-row` already in `src/styles/tokens.css`
(`28px 44px 1fr 30px`, two rows, score bar spanning underneath) **have never
taken effect**. Their `1fr` resolves against the 660px track, making the name
column 502px wide. The intended mobile layout was written but is dead.

Confirmed by injecting `grid-template-columns: 1fr` at <760px: overflow drops to
zero and the intended two-row layout appears. Two defects surface once it does:

1. The rank column is 28px, but with 194 colors ranks reach three digits, which
   measure ~36px at `600 20px var(--font-mono)` and clip.
2. `.dc-rank-pv` is a 30px column holding the text `Details` / `Close ✕`;
   `Close ✕` wraps onto two lines. `tokens.css` already defines
   `.dc-rank-pv-label { display: none }` at <760px, but **no element with that
   class exists** in `Colors.tsx` — the icon-only mobile affordance was designed
   and never wired up.

## Design

### 1. Container — breakpoint-free minimum track

In `Colors.tsx`, change the `.dc-rank-grid` inline style to:

```
grid-template-columns: repeat(auto-fill, minmax(min(660px, 100%), 1fr));
```

`min(660px, 100%)` clamps the minimum track to the container, so the grid
self-corrects at every width. This also fixes the 660–759px tablet range, where
the current code overflows too and where a `<760px` media query would not help.

The style stays inline: it expresses this one grid's desktop intent and has no
site-wide meaning (per `CLAUDE.md`'s styling rules).

### 2. Row columns below 760px

In `tokens.css`, `.dc-rank-row` at `max-width: 759.98px`:

```
grid-template-columns: 38px 44px 1fr 16px !important;
```

- Rank column 28px → **38px** so three-digit ranks fit. Measured in the browser
  during implementation: a 3-digit rank is exactly 36.00px in IBM Plex Mono at
  `600 20px` (0.6em advance per digit), and 95 of the 194 rows have 3-digit
  ranks. 38px keeps 2px of slack in case the webfont falls back to a wider
  `ui-monospace`.
- Last column **16px**, sized for the chevron only.
- `.dc-rank-bar { grid-column: 3 / -1; grid-row: 2 }` needs no change — it
  already spans the name + affordance columns on the second row.

### 3. Affordance — text label on desktop, chevron on mobile

In `Colors.tsx`, the `.dc-rank-pv` cell renders both variants:

```tsx
<span class="dc-rank-pv" …>
  <span class="dc-rank-pv-label">{open ? "Close ✕" : "Details"}</span>
  <span class="dc-rank-pv-icon" aria-hidden="true">▾</span>
</span>
```

In `tokens.css`:

- Desktop: `.dc-rank-pv-label { display: inline }`, `.dc-rank-pv-icon { display: none }`
  — visually unchanged from today.
- Below 760px: the reverse. This activates the existing (currently dead)
  `.dc-rank-pv-label { display: none }` rule as originally intended.
- Open/closed cue driven by the row's existing attribute:
  `.dc-rank-row[aria-expanded="true"] .dc-rank-pv-icon { transform: rotate(180deg) }`,
  with a short `transform` transition.

A chevron is kept rather than dropping the column entirely because mobile has no
hover: with no marker, a closed row gives no hint that tapping it reveals
details. Driving rotation off `aria-expanded` keeps the visual state and the
accessibility state in sync by construction, with no new JS state.

### 4. Regression test

The jsdom unit tests cannot catch this class of bug — there is no layout engine,
which is precisely why dead mobile CSS shipped unnoticed. Add to
`e2e/smoke.spec.ts`: at a 390px viewport on the Colors page in Ungrouped mode,
assert `document.documentElement.scrollWidth <= window.innerWidth`, both with
the infobox collapsed and with one open.

The test needs an `islandsHydrated(page)` helper (added to the spec file):
clicking an island control before Preact mounts silently does nothing, and
`goto` alone does not wait for that. Astro renders `<astro-island ssr>` and drops
the `ssr` attribute on hydration, which makes a deterministic gate.

Existing `Colors.test.tsx` cases are unaffected: they select rows via
`data-testid="rank-row"` and assert on `aria-expanded`, not on the label text,
and wrapping the label in a span leaves `textContent` unchanged.

### 5. Documentation

No new `D#` decision. The leaderboard row is not a documented shared element,
and this change brings existing code up to the mobile-parity intent **D2**
already states.

Add one line to D2's **How** section: when a grid uses `minmax()` with a fixed
minimum, write it `min(<px>, 100%)` so the track cannot outgrow its container.
The same trap exists in `.dc-os-grid` (250px) and the infobox platform grid
(230px); both currently fit at 390px, so they are left alone — the note exists
so the next such grid is written correctly.

## Out of scope

- The hue-band ("By hue") view, which already lays out correctly on mobile.
- Restyling the leaderboard row beyond what is needed to fit — the two-row
  mobile layout already in `tokens.css` is kept as designed.
- Preventively rewriting `.dc-os-grid` and the infobox platform grid.

## Verification

1. `npm test` — existing unit tests pass.
2. `npm run test:e2e` — including the new 390px overflow assertions.
3. Manual check at 390px: no horizontal scroll collapsed or open; three-digit
   ranks fully visible; chevron points down when closed and up when open.
4. Manual check at 700px (the tablet range the old code also broke).
