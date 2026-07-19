# OKLCH multi-label color types for the Color Explorer

**Date:** 2026-07-19
**Status:** Approved, ready for implementation plan

## Problem

The Color Explorer classifies every color on three independent single-select
axes: **Family** (hue), **Tone** (`neon`/`bright`/`pastel`/`muted`/`dark`), and
**Shade** (`deep`/`mid`/`light`/`pale`). All classification is HSL-based
(`hueFamily`, `tone`, `shade` in `src/lib/color.ts`).

We want the tone/shade vocabulary replaced with a more familiar, perception-aligned
set of color types, defined in OKLCH. Unlike the old Tone/Shade axes, these new
types overlap heavily (a soft blue is Pastel *and* Light *and* Cool), so they
cannot be single-select.

## Decisions

- **Monochromatic is dropped.** It describes a relationship between several colors
  (a palette property), not a single swatch, so it has no per-color definition.
- **Types are multi-label.** Each color collects every type tag whose predicate it
  matches into `types: ColorTypeKey[]`.
- **Scope: replace Tone + Shade.** The new type set absorbs the old Tone and Shade
  axes. **Family stays exactly as-is** (HSL-based hue grouping); only the retired
  Tone/Shade axes move to OKLCH.
- **UI: types are a multi-select filter**, not a grouping mode. Filter semantics are
  **OR** across selected type chips; combined with a Family selection as **AND**.

## Design

### 1. Color-space utility

Add `hexToOklch()` in `src/lib/color.ts`, built on the existing `hexToOklab()`
(Björn Ottosson's sRGB→OKLab transform). Convert OKLab `a`/`b` to polar form:

- `C = Math.sqrt(a*a + b*b)`
- `H = atan2(b, a)` converted to degrees, normalized to `[0, 360)`

Returns `{ L, C, H }` with `L` and `C` on the 0–1 scale used throughout the
predicates below.

### 2. Type definitions

Add a `ColorTypeKey` union and a `COLOR_TYPE_DEFS` table (key → label + chip color)
in `src/lib/explorer.ts`, replacing `TONE_DEFS` and `SHADE_DEFS`. Each color is run
through all predicates; every match is added to its `types` array.

`L` and `C` are OKLCH lightness/chroma on 0–1; `H` is hue in degrees.

| Type | Key | Predicate |
|---|---|---|
| Pastel | `pastel` | `L >= 0.80 && C >= 0.03 && C <= 0.10` |
| Light | `light` | `L >= 0.82` |
| Dark | `dark` | `L <= 0.35` |
| Muted / dusty | `muted` | `C >= 0.025 && C <= 0.09` |
| Neutral | `neutral` | `C < 0.025` |
| Vivid / saturated | `vivid` | `C >= 0.16` |
| Neon | `neon` | `C >= 0.22 && L >= 0.55` |
| Jewel tone | `jewel` | `L >= 0.30 && L <= 0.65 && C >= 0.12` |
| Earth tone | `earth` | `H >= 40 && H < 130 && C >= 0.03 && C <= 0.11 && L >= 0.25 && L <= 0.70` |
| Warm | `warm` | `C >= 0.025 && (H < 130 || H >= 340)` |
| Cool | `cool` | `C >= 0.025 && H >= 130 && H < 340` |

Notes:

- **Warm/Cool/Earth-tone bounds** are our OKLCH translations of the table's verbal
  hue descriptions ("reds, oranges, yellows…"; "brown, ochre, rust, olive, clay").
  OKLCH hue reference points used: red ≈ 29°, orange ≈ 55°, yellow ≈ 110°,
  green ≈ 142°, cyan ≈ 195°, blue ≈ 264°, magenta ≈ 328°. Warm covers red→yellow-green
  plus the crimson wrap (`H >= 340`); Cool covers green→violet/magenta. Earth tone's
  hue ceiling is `< 130` (aligned with the Warm/Cool split) so dark-olive hues
  (`#556b2f` ≈ H 126°) qualify — olive is named in the source table.
- **Overlaps are intentional and correct** for a multi-label system: Neon ⊂ Vivid,
  most Pastels are also Light.
- **Name-collision resolution.** The color-TYPE `neutral` (`C < 0.025`) once clashed
  with a color-FAMILY `neutral`, and there was a near-duplicate TYPE `achromatic`
  (`C < 0.02`). Resolved by: dropping the TYPE `achromatic` (it was a strict subset of
  TYPE `neutral`, so no coverage is lost); keeping the TYPE `neutral`; and renaming the
  hue-FAMILY from `neutral`/"Neutrals" to `achromatic`/"Achromatic" (same HSL `s < 12`
  definition, just relabelled). Result: FAMILY "Achromatic" (hue bucket for
  low-saturation colors) and TYPE "Neutral" (`C < 0.025`) no longer share a name.
- **Pastel chroma cap is `0.10`, not `0.16`.** In OKLCH, cyan is a low-chroma
  primary (pure `#00ffff` ≈ C 0.155), so a `0.16` cap mislabels fully-saturated
  cyan as pastel. The `0.10` cap keeps genuine soft tints (baby blue ≈ C 0.05,
  lavender ≈ C 0.07) while excluding electric/vivid lights.
- **Chip display order** (`COLOR_TYPE_DEFS`) is by general perceptual commonness,
  not by predicate order or catalog count: Neutral, Light, Dark, Warm, Cool,
  Muted, Vivid, Pastel, Earth, Jewel, Neon.
- **No orphan swatches:** anything with `C >= 0.025` gets at least Warm or Cool;
  anything below gets Neutral. Every color lands ≥ 1 tag.

### 3. Data model

Replace `ExplorerColor.tone: ToneKey` and `.shade: ShadeKey` with a single
`types: ColorTypeKey[]`.

Touch points:

- `src/lib/color.ts` — add `hexToOklch`; add `colorTypes(hex): ColorTypeKey[]`
  (or `colorTypes({L, C, H})`) implementing the predicate table. Remove/retire
  `tone` and `shade` (and `ToneKey`/`ShadeKey`) once no longer referenced.
- `src/lib/catalog.ts` — `toColorView` (~78-80) and the merged-colors mapping
  (~118-121) assign `types` instead of `tone`/`shade`. Update `ColorView` and
  `MergedColorView` types accordingly.
- `src/lib/derive.ts` — remove `tone`/`shade` assignment where present.
- `src/lib/explorer.ts` — `toExplorerColors` populates `types`; remove
  `shadeCountsFor`; add a `typeCounts` helper; adapt `groupIntoBands` to drop the
  tone grouping branch (keep family + spectrum/pop sorting).

### 4. UI (`src/islands/Explorer.tsx`)

- Grouping toggle: drop "By tone" → **"By hue / Ungrouped"** only.
- Remove the shade sub-filter chip row.
- Add a **type filter chip row**: all 11 types with per-type counts (`typeCounts`),
  multi-select. Selecting types filters with **OR** (a color shows if it has any
  selected type). A Family selection combines as **AND** (that family, matching any
  selected type). Chips use `COLOR_TYPE_DEFS` colors and the existing `.dc-card`
  hover affordance, matching the current family/shade chip styling.

### 5. Testing

Unit tests:

- `hexToOklch` — a handful of known hex → expected `{L, C, H}` (within tolerance),
  including pure red/green/blue and a gray.
- `colorTypes` — one representative hex per type asserting the expected tag(s);
  a multi-tag case (e.g. soft blue → Pastel + Light + Cool); a gray case
  asserting `Neutral` and no Warm/Cool; a "never empty" assertion.

## Out of scope

- Migrating Family classification to OKLCH (stays HSL).
- The "Monochromatic" concept (dropped).
- Palette-level (per-OS) type badges.
