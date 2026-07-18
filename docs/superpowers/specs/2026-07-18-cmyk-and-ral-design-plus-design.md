# CMYK and closest RAL Design System Plus — design

**Date:** 2026-07-18

## Goal

On each color's detail panel, show two additional color values and rename one existing
one:

- **CMYK** — the color in the CMYK model.
- **Closest RAL Design System Plus** — the nearest color from the RAL Design System+ set.
- Rename the existing **"Closest RAL"** row to **"Closest RAL Classic"**.

Everything is derived at build time by pure TypeScript in `src/lib/`, consistent with the
project's single-source-of-truth model.

## Non-goals

- No ICC-profile-aware CMYK. A naive RGB→CMYK conversion is the only sensible choice for
  screen colors and matches how the site treats every other value.
- No new pages, routes, or interactions beyond two more copy rows.

## Data — new vendored dataset

RAL Design System+ (~2000 colors) is not yet in the repo. The full list, with sRGB and
CIELAB values, is on Wikipedia:
<https://en.wikipedia.org/wiki/List_of_RAL_colours#RAL_Design_System+>

Each Wikipedia row has: **Name** (e.g. "Ink Black"), **Code** (`H000L15C00`), and **sRGB**
`(R, G, B)`. That is structurally identical to the existing RAL Classic data
(`{ code, name, hex }`).

- Add `src/data/ral-design-plus.json` as `[{ code, name, hex }]`, mirroring
  `src/data/ral-classic.json` (lowercased hex).
- Add `scripts/build-ral-dsp.mjs`, mirroring `scripts/build-ral.mjs`: parse the Wikipedia
  table, convert each row's RGB → hex, normalize the code to the official space-separated
  notation `RAL 000 15 00` (from Wikipedia's `H000L15C00`), and write the JSON. Run it once
  and **commit the JSON** so the build stays fully offline.

## Color logic — `src/lib/color.ts`

- `rgbToCmyk(r, g, b): [c, m, y, k]` and `hexToCmyk(hex): [c, m, y, k]` — standard naive
  conversion, returning integer percentages (0–100). Black at `k = 100`, with `c = m = y = 0`.
- Generalize `closestRal(hex)` to `closestRal(hex, palette = RAL_CLASSIC)` and add
  `closestRalDesign(hex)` that matches against the new dataset. Both use the existing
  **OKLab** perceptual distance from the sRGB hex — the CIELAB values on Wikipedia are not
  needed. Keeping both matches in the same space keeps them consistent.

## Data flow

- `src/lib/ral.ts`: export `RAL_DESIGN_PLUS` from the new JSON, alongside `RAL_CLASSIC`.
- `src/lib/catalog.ts` — `toColorView`: add a `cmyk: string` field, formatted `0% 0% 50% 50%`,
  alongside `rgb` and `hsl`.
- `src/lib/detail.ts` — `buildOsDetail`: compute both matches; add `ralDesign: RalMatch`
  alongside the existing `ral` on `DetailColor`.

## UI — `src/islands/OsDetail.tsx`

The "COLOR VALUES · CLICK TO COPY" panel gains two rows and one rename:

- HEX / RGB / HSL / **CMYK** (new — copied as `cmyk(0%, 0%, 50%, 50%)`)
- **Closest RAL Classic** (renamed from "Closest RAL"; same `c.ral` data)
- **Closest RAL Design+** (new — `c.ralDesign`, rendered with the color swatch like the classic row)

`CopyKey` gains `"cmyk"` and `"ralDesign"`.

## Testing

- `color.test.ts`: `rgbToCmyk`/`hexToCmyk` (incl. black and a pure primary), and
  `closestRalDesign` returning a plausible near match.
- `detail.test.ts`: `buildOsDetail` populates `cmyk` and `ralDesign`.
- `OsDetail.test.tsx`: extend mock colors with `cmyk` and `ralDesign`; assert the two new
  rows render and the classic row reads "Closest RAL Classic".
