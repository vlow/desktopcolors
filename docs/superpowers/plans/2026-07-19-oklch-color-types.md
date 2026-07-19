# OKLCH Multi-Label Color Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Color Explorer's single-select Tone and Shade axes with a set of 12 multi-label, OKLCH-defined color types (Pastel, Light, Dark, Muted, Neutral, Vivid, Neon, Jewel, Earth, Warm, Cool, Achromatic).

**Architecture:** Add an OKLCH conversion (`hexToOklch`) and a pure multi-label classifier (`colorTypes`) in `src/lib/color.ts`. Carry `types: ColorTypeKey[]` through the catalog/derive/explorer data model, replacing the `tone`/`shade` fields. In the Explorer island, drop the "By tone" grouping mode and the shade sub-filter, and add a multi-select type filter chip row with OR semantics (ANDed with the family selection).

**Tech Stack:** Astro 4 static site, Preact islands (`preact/hooks`), TypeScript, Vitest for unit tests.

## Global Constraints

- Family (hue) classification stays HSL-based and unchanged. Only Tone/Shade are replaced.
- Types are multi-label: each color collects every matching type into `types: ColorTypeKey[]`.
- Every color must land at least one type (no orphan swatches).
- OKLCH `L` and `C` are on the 0–1 scale; `H` is degrees in `[0, 360)`.
- Type filter semantics: OR across selected types; ANDed with a family selection.
- Styling follows CLAUDE.md — reuse existing tokens/classes; no new inline styles for site-wide values. Chips reuse the existing family/shade chip markup pattern.
- Predicate table (authoritative — copy exactly):

  | Key | Predicate |
  |---|---|
  | `pastel` | `L >= 0.78 && C >= 0.03 && C <= 0.16` |
  | `light` | `L >= 0.82` |
  | `dark` | `L <= 0.35` |
  | `muted` | `C >= 0.025 && C <= 0.09` |
  | `neutral` | `C < 0.025` |
  | `vivid` | `C >= 0.16` |
  | `neon` | `C >= 0.22 && L >= 0.55` |
  | `jewel` | `L >= 0.30 && L <= 0.65 && C >= 0.12` |
  | `earth` | `H >= 40 && H < 130 && C >= 0.03 && C <= 0.11 && L >= 0.25 && L <= 0.70` |
  | `warm` | `C >= 0.025 && (H < 130 || H >= 340)` |
  | `cool` | `C >= 0.025 && H >= 130 && H < 340` |
  | `achromatic` | `C < 0.02` |

---

## Task 1: OKLCH conversion + multi-label classifier in `color.ts`

**Files:**
- Modify: `src/lib/color.ts` (add after `hexToOklab`/`oklabDistance`, ~line 84; the `ToneKey`/`ShadeKey` types at lines 7-9 and `tone`/`shade` functions at lines 98-111 are removed in Task 2 once callers are migrated — leave them for now)
- Test: `src/lib/color.test.ts`

**Interfaces:**
- Consumes: existing `hexToOklab(hex): [number, number, number]` (color.ts:68).
- Produces:
  - `export type ColorTypeKey = "pastel" | "light" | "dark" | "muted" | "neutral" | "vivid" | "neon" | "jewel" | "earth" | "warm" | "cool" | "achromatic";`
  - `export function hexToOklch(hex: string): { L: number; C: number; H: number };`
  - `export function colorTypes(hex: string): ColorTypeKey[];`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/color.test.ts`. First extend the import on lines 2-6 to include `hexToOklch` and `colorTypes`:

```ts
import {
  hexToRgb, rgbToHsl, hexToHsl, onColor, rgbDistance,
  hexToOklab, oklabDistance, hueFamily, tone, shade, closestRal, closestRalDesign,
  rgbToCmyk, hexToCmyk, formatScore, hexToOklch, colorTypes,
} from "./color";
```

Then append these describe blocks at the end of the file:

```ts
describe("hexToOklch", () => {
  it("maps pure red to its OKLCH coordinates", () => {
    const { L, C, H } = hexToOklch("#ff0000");
    expect(L).toBeCloseTo(0.628, 2);
    expect(C).toBeCloseTo(0.258, 2);
    expect(H).toBeCloseTo(29.2, 0);
  });
  it("maps blue with a hue in [0,360)", () => {
    const { H } = hexToOklch("#0000ff");
    expect(H).toBeCloseTo(264.1, 0);
    expect(H).toBeGreaterThanOrEqual(0);
    expect(H).toBeLessThan(360);
  });
  it("gives gray near-zero chroma", () => {
    expect(hexToOklch("#808080").C).toBeLessThan(0.02);
  });
});

describe("colorTypes", () => {
  it("tags a gray as neutral + achromatic and neither warm nor cool", () => {
    const t = colorTypes("#808080");
    expect(t).toContain("neutral");
    expect(t).toContain("achromatic");
    expect(t).not.toContain("warm");
    expect(t).not.toContain("cool");
    expect(t).not.toContain("vivid");
  });
  it("tags a light gray as light too", () => {
    expect(colorTypes("#e0e0e0")).toEqual(
      expect.arrayContaining(["neutral", "achromatic", "light"]));
  });
  it("tags pure red as vivid + neon + warm", () => {
    expect(colorTypes("#ff0000")).toEqual(
      expect.arrayContaining(["vivid", "neon", "warm"]));
  });
  it("tags navy as dark + vivid + cool", () => {
    expect(colorTypes("#000080")).toEqual(
      expect.arrayContaining(["dark", "vivid", "cool"]));
  });
  it("tags a tan as earth + muted + warm", () => {
    expect(colorTypes("#a67b5b")).toEqual(
      expect.arrayContaining(["earth", "muted", "warm"]));
  });
  it("tags dark-olive as earth (hue ceiling reaches 130)", () => {
    expect(colorTypes("#556b2f")).toContain("earth");
  });
  it("tags a soft cyan with multiple labels incl. pastel + light + cool", () => {
    expect(colorTypes("#00e5ff")).toEqual(
      expect.arrayContaining(["pastel", "light", "cool"]));
  });
  it("treats hues >= 340 as warm (crimson/pink wrap)", () => {
    expect(colorTypes("#ff1493")).toContain("warm");
  });
  it("treats magenta (~328) as cool, not warm", () => {
    const t = colorTypes("#ff00ff");
    expect(t).toContain("cool");
    expect(t).not.toContain("warm");
  });
  it("never returns an empty tag list for a range of colors", () => {
    for (const hex of ["#000000", "#ffffff", "#808080", "#ff0000", "#00ff00",
      "#0000ff", "#556b2f", "#a67b5b", "#c9b6e8", "#008080"]) {
      expect(colorTypes(hex).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/color.test.ts`
Expected: FAIL — `hexToOklch is not a function` / `colorTypes is not a function`.

- [ ] **Step 3: Implement `hexToOklch`, `ColorTypeKey`, and `colorTypes`**

In `src/lib/color.ts`, add the type alias near the other type exports (after line 9):

```ts
export type ColorTypeKey =
  | "pastel" | "light" | "dark" | "muted" | "neutral"
  | "vivid" | "neon" | "jewel" | "earth" | "warm" | "cool" | "achromatic";
```

Then add these functions immediately after `oklabDistance` (after line 84):

```ts
// OKLab -> OKLCH (cartesian a/b -> polar C/H). L and C on 0–1; H in degrees [0,360).
export function hexToOklch(hex: string): { L: number; C: number; H: number } {
  const [L, a, b] = hexToOklab(hex);
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

// Multi-label perceptual color types (OKLCH). A color collects every tag it matches.
// Every color lands at least one tag: anything with C >= 0.025 is warm or cool,
// anything below is neutral.
export function colorTypes(hex: string): ColorTypeKey[] {
  const { L, C, H } = hexToOklch(hex);
  const out: ColorTypeKey[] = [];
  if (L >= 0.78 && C >= 0.03 && C <= 0.16) out.push("pastel");
  if (L >= 0.82) out.push("light");
  if (L <= 0.35) out.push("dark");
  if (C >= 0.025 && C <= 0.09) out.push("muted");
  if (C < 0.025) out.push("neutral");
  if (C >= 0.16) out.push("vivid");
  if (C >= 0.22 && L >= 0.55) out.push("neon");
  if (L >= 0.30 && L <= 0.65 && C >= 0.12) out.push("jewel");
  if (H >= 40 && H < 130 && C >= 0.03 && C <= 0.11 && L >= 0.25 && L <= 0.70) out.push("earth");
  if (C >= 0.025 && (H < 130 || H >= 340)) out.push("warm");
  if (C >= 0.025 && H >= 130 && H < 340) out.push("cool");
  if (C < 0.02) out.push("achromatic");
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/color.test.ts`
Expected: PASS (all color.test.ts tests, including the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/color.ts src/lib/color.test.ts
git commit -m "feat: add hexToOklch and multi-label colorTypes classifier"
```

---

## Task 2: Migrate the catalog data model to `types`

**Files:**
- Modify: `src/lib/catalog.ts` (imports line 1-4; `ColorView` line 11-26; `MergedColorView` line 51-58; `toColorView` line 66-83; merged mapping line 113-124)
- Modify: `src/lib/color.ts` (remove now-unused `ToneKey`/`ShadeKey` types line 7-9 and `tone`/`shade` functions line 98-111)
- Modify: `src/lib/color.test.ts` (remove the `tone` and `shade` describe blocks, lines 77-96, and drop `tone`/`shade` from the import)
- Test: `src/lib/catalog.test.ts` (add a `types` assertion)

**Interfaces:**
- Consumes: `colorTypes(hex): ColorTypeKey[]` and `ColorTypeKey` from Task 1.
- Produces:
  - `ColorView.types: ColorTypeKey[]` (replaces `tone`/`shade`).
  - `MergedColorView.types: ColorTypeKey[]` (replaces `tone`/`shade`).

- [ ] **Step 1: Write the failing test**

Open `src/lib/catalog.test.ts` and add this test inside the existing `describe("buildCatalog", ...)` block (if there is no such block, add a new one at the end of the file). It asserts merged colors carry a non-empty `types` array and that a known red is tagged warm:

```ts
describe("buildCatalog color types", () => {
  it("assigns a non-empty multi-label types array, tagging red as warm", () => {
    const cat = buildCatalog(entries, parseScores({ colors: {}, os: {} }));
    const red = cat.colors.find((c) => c.hex === "#ff0000")!;
    expect(Array.isArray(red.types)).toBe(true);
    expect(red.types.length).toBeGreaterThan(0);
    expect(red.types).toContain("warm");
  });
});
```

Check the top of `src/lib/catalog.test.ts` for existing `entries`/`buildCatalog`/`parseScores` fixtures. If `entries` there has no `#ff0000` color, use a color that does exist in that file's fixtures and adjust the expected tag using the predicate table (a pure/strong red is `warm`); or add an entry with `{ hex: "#ff0000", name: "Red", index: "—", note: "", default: true }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: FAIL — `red.types` is undefined / not iterable.

- [ ] **Step 3: Update `catalog.ts`**

Change the import block (lines 1-4) to drop `tone`/`shade`/`ToneKey`/`ShadeKey` and add `colorTypes`/`ColorTypeKey`:

```ts
import {
  hexToRgb, hexToHsl, hexToCmyk, onColor, hueFamily, colorTypes, formatScore,
  type FamilyKey, type ColorTypeKey,
} from "./color";
```

In `ColorView` (lines 11-26), replace the two lines `tone: ToneKey;` and `shade: ShadeKey;` with:

```ts
  types: ColorTypeKey[];
```

In `MergedColorView` (lines 51-58), replace `tone: ToneKey;` and `shade: ShadeKey;` with:

```ts
  types: ColorTypeKey[];
```

In `toColorView` (lines 72-82 return object), replace `tone: tone(h, s, l),` and `shade: shade(l),` with:

```ts
    types: colorTypes(key),
```

In the merged mapping (lines 116-123 return object), replace `tone: tone(h, s, l),` and `shade: shade(l),` with:

```ts
      types: colorTypes(m.hex),
```

Note: the `const [h, s, l] = hexToHsl(m.hex);` on line 114 is still used for nothing else in that block after this change — remove it if it becomes unused (TypeScript/`astro check` will flag it). The `toColorView` function still uses `h, s, l` for `hsl`/`family`, so keep it there.

- [ ] **Step 4: Remove the dead `tone`/`shade` code from `color.ts`**

Delete `export type ToneKey = ...` and `export type ShadeKey = ...` (lines 7-9) and the `tone(...)` and `shade(...)` functions (lines 98-111). In `src/lib/color.test.ts`, delete the `describe("tone", ...)` and `describe("shade", ...)` blocks (lines 77-96) and remove `tone, shade` from the import on line 3.

- [ ] **Step 5: Run tests + type check to verify green**

Run: `npx vitest run src/lib/color.test.ts src/lib/catalog.test.ts`
Expected: PASS.
Run: `npm run check`
Expected: No errors in `color.ts` / `catalog.ts` (the explorer files are fixed in Tasks 3–4; if `astro check` reports errors there, that is expected until then — confirm the only remaining errors are in `explorer.ts`/`Explorer.tsx`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/color.ts src/lib/color.test.ts src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "refactor: carry multi-label color types through the catalog, drop tone/shade"
```

---

## Task 3: Update the explorer data layer

**Files:**
- Modify: `src/lib/explorer.ts` (imports line 1; `ExplorerColor` line 5-11; `TONE_DEFS`/`SHADE_DEFS` line 25-38; `toExplorerColors` line 40-50; `shadeCountsFor` line 59-64; `groupIntoBands` line 73-90)
- Test: `src/lib/explorer.test.ts`

**Interfaces:**
- Consumes: `ColorTypeKey`, `colorTypes` (via catalog's `MergedColorView.types`) from Tasks 1–2.
- Produces:
  - `ExplorerColor.types: ColorTypeKey[]` (replaces `tone`/`shade`).
  - `export const COLOR_TYPE_DEFS: { key: ColorTypeKey; name: string; chip: string }[]` (replaces `TONE_DEFS`/`SHADE_DEFS`).
  - `export function typeCounts(colors: ExplorerColor[]): Record<ColorTypeKey, number>`.
  - `groupIntoBands(colors, { group: "hue"; family: FamilyKey | null; types: ColorTypeKey[]; sort: "spectrum" | "pop" }): Band[]` (drops the `"tone"` group option and the `shade` param; adds a `types` filter).
  - `shadeCountsFor` is removed.

- [ ] **Step 1: Write the failing tests**

Edit `src/lib/explorer.test.ts`. Change the import on lines 2-4 to:

```ts
import {
  toExplorerColors, groupIntoBands, rankColors, familyCounts, typeCounts,
  COLOR_TYPE_DEFS, FAMILY_DEFS,
} from "./explorer";
```

Delete the entire `describe("shadeCountsFor", ...)` block (lines 106-148). Update the two inline `ExplorerColor` fixtures inside `describe("rankColors", ...)` (the `zeroScores` array, lines 79-95) so each object uses `types: [...]` instead of `tone`/`shade` — for example replace `tone: "bright", shade: "mid",` with `types: ["vivid", "warm"],` (any valid non-empty array is fine; these fixtures only exercise ranking, not types). Apply the same substitution to every object in that array.

Then add these blocks at the end of the file:

```ts
describe("COLOR_TYPE_DEFS", () => {
  it("covers all twelve types in a stable order", () => {
    expect(COLOR_TYPE_DEFS.map((d) => d.key)).toEqual([
      "pastel", "light", "dark", "muted", "neutral", "vivid",
      "neon", "jewel", "earth", "warm", "cool", "achromatic",
    ]);
  });
});

describe("typeCounts", () => {
  it("counts colors per type across the whole set", () => {
    const counts = typeCounts(colors);
    // #008080 (teal) and #000080 (navy) are both cool; #ff0000 is warm.
    expect(counts.cool).toBeGreaterThanOrEqual(2);
    expect(counts.warm).toBeGreaterThanOrEqual(1);
    // Every type key is present (0 allowed), never undefined.
    for (const d of COLOR_TYPE_DEFS) expect(typeof counts[d.key]).toBe("number");
  });
});

describe("groupIntoBands with a type filter", () => {
  it("keeps only colors carrying at least one selected type (OR)", () => {
    const bands = groupIntoBands(colors, {
      group: "hue", family: null, types: ["warm"], sort: "spectrum",
    });
    const hexes = bands.flatMap((b) => b.colors.map((c) => c.hex));
    expect(hexes).toContain("#ff0000"); // warm
    expect(hexes).not.toContain("#008080"); // cool teal, filtered out
  });
  it("with no types selected, includes everything (family filter still applies)", () => {
    const bands = groupIntoBands(colors, {
      group: "hue", family: "teal", types: [], sort: "spectrum",
    });
    expect(bands.length).toBe(1);
    expect(bands[0].colors[0].hex).toBe("#008080");
  });
});
```

Also update the two existing `groupIntoBands` calls in the file (lines 55 and 62) to the new signature — replace `shade: null` with `types: []` and drop any `group: "tone"`:

```ts
    const bands = groupIntoBands(colors, { group: "hue", family: null, types: [], sort: "spectrum" });
```
```ts
    const bands = groupIntoBands(colors, { group: "hue", family: "teal", types: [], sort: "spectrum" });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: FAIL — `typeCounts`/`COLOR_TYPE_DEFS` not exported, and `groupIntoBands` type errors on `types`.

- [ ] **Step 3: Update `explorer.ts`**

Change the import (line 1) to:

```ts
import { hexToHsl, type FamilyKey, type ColorTypeKey } from "./color";
```

Update `ExplorerColor` (lines 5-11) — replace `family: FamilyKey; tone: ToneKey; shade: ShadeKey;` with:

```ts
  family: FamilyKey; types: ColorTypeKey[];
```

Replace `TONE_DEFS` and `SHADE_DEFS` (lines 25-38) with a single `COLOR_TYPE_DEFS`:

```ts
export const COLOR_TYPE_DEFS: { key: ColorTypeKey; name: string; chip: string }[] = [
  { key: "pastel", name: "Pastel", chip: "#c9b6e8" },
  { key: "light", name: "Light", chip: "#e6e6e6" },
  { key: "dark", name: "Dark", chip: "#2b303c" },
  { key: "muted", name: "Muted", chip: "#8f978f" },
  { key: "neutral", name: "Neutral", chip: "#9a9a96" },
  { key: "vivid", name: "Vivid", chip: "#e0512f" },
  { key: "neon", name: "Neon", chip: "#16d6c1" },
  { key: "jewel", name: "Jewel", chip: "#7a1f5c" },
  { key: "earth", name: "Earth", chip: "#8a5a2b" },
  { key: "warm", name: "Warm", chip: "#d2762f" },
  { key: "cool", name: "Cool", chip: "#3a6ea5" },
  { key: "achromatic", name: "Achromatic", chip: "#c9c7c2" },
];
```

Update `toExplorerColors` (lines 44-48 return object) — replace `tone: c.tone, shade: c.shade,` with `types: c.types,`:

```ts
    return {
      hex: c.hex, name: c.name, family: c.family, types: c.types,
      h, s, l, onColor: c.onColor, score: c.score, scoreLabel: c.scoreLabel,
      yearRange: c.yearRange, primarySlug: c.primarySlug,
      href: colorPath(c.primarySlug, c.hex),
    };
```

Delete `shadeCountsFor` (lines 59-64) and add `typeCounts` in its place:

```ts
export function typeCounts(colors: ExplorerColor[]): Record<ColorTypeKey, number> {
  const out = {} as Record<ColorTypeKey, number>;
  for (const d of COLOR_TYPE_DEFS) out[d.key] = 0;
  for (const c of colors) for (const t of c.types) out[t]++;
  return out;
}
```

Rewrite `groupIntoBands` (lines 73-90) to drop tone grouping and the shade param, and add an OR type filter:

```ts
export function groupIntoBands(
  colors: ExplorerColor[],
  opts: { group: "hue"; family: FamilyKey | null; types: ColorTypeKey[]; sort: "spectrum" | "pop" },
): Band[] {
  const match = (c: ExplorerColor): boolean =>
    (!opts.family || c.family === opts.family) &&
    (opts.types.length === 0 || opts.types.some((t) => c.types.includes(t)));
  const defs = opts.family ? FAMILY_DEFS.filter((d) => d.key === opts.family) : FAMILY_DEFS;
  const cmp = opts.sort === "pop" ? popCmp : spectrumCmp;
  return defs
    .map((d) => ({
      key: d.key, name: d.name, chip: d.chip,
      colors: colors.filter((c) => c.family === d.key && match(c)).slice().sort(cmp),
    }))
    .filter((b) => b.colors.length > 0);
}
```

Note: `rankColors` (lines 92-103) is unchanged in this task — it does not filter by type. Type filtering for the ungrouped view is added in Task 4 at the island level (or leave ranking type-agnostic; see Task 4 Step 3).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/explorer.ts src/lib/explorer.test.ts
git commit -m "refactor: replace tone/shade explorer helpers with multi-label type filter"
```

---

## Task 4: Update the Explorer island UI

**Files:**
- Modify: `src/islands/Explorer.tsx` (imports line 3-7; `Group` type line 11; state lines 18-25; memos lines 27-32; `toggleFamily` line 38; group toggle lines 49-51; shade sub-filter block lines 77-92)
- Test: manual (Vitest has no island test here); verified via `npm run check` + `npm run build` + a dev-server smoke.

**Interfaces:**
- Consumes: `COLOR_TYPE_DEFS`, `typeCounts`, `familyCounts`, `groupIntoBands`, `rankColors`, `ExplorerColor` from Task 3; `FamilyKey`, `ColorTypeKey` from `../lib/color`.
- Produces: no exports; UI behavior only.

- [ ] **Step 1: Update imports and types**

Replace lines 3-7:

```tsx
import type { FamilyKey, ColorTypeKey } from "../lib/color";
import {
  groupIntoBands, rankColors, familyCounts, typeCounts,
  FAMILY_DEFS, COLOR_TYPE_DEFS, type ExplorerColor,
} from "../lib/explorer";
```

Replace the `Group` type (line 11) — remove `"tone"`:

```tsx
type Group = "hue" | "flat";
```

- [ ] **Step 2: Update state and memos**

Replace the state block (lines 18-25):

```tsx
  const [group, setGroup] = useState<Group>("hue");
  const [sort, setSort] = useState<Sort>("spectrum");
  const [family, setFamily] = useState<FamilyKey | null>(null);
  const [types, setTypes] = useState<ColorTypeKey[]>([]);
  const [pv, setPv] = useState<{ list: ExplorerColor[]; idx: number } | null>(null);

  const counts = useMemo(() => familyCounts(colors), [colors]);
  const tCounts = useMemo(() => typeCounts(colors), [colors]);
```

Replace the `bands`/`ranking` memos (lines 27-32). `bands` uses the new signature; `ranking` gets a type filter applied inline (OR) before ranking so the ungrouped view honors type chips:

```tsx
  const bands = useMemo(
    () => group === "flat" ? [] : groupIntoBands(colors, { group: "hue", family, types, sort }),
    [colors, group, family, types, sort]);
  const ranking = useMemo(() => {
    if (group !== "flat") return [];
    const filtered = types.length === 0
      ? colors
      : colors.filter((c) => types.some((t) => c.types.includes(t)));
    return rankColors(filtered, { family, sort });
  }, [colors, group, family, types, sort]);
```

Replace `toggleFamily` (line 38) — it no longer resets shade:

```tsx
  const toggleFamily = (k: FamilyKey) => setFamily((f) => f === k ? null : k);
  const toggleType = (k: ColorTypeKey) =>
    setTypes((ts) => ts.includes(k) ? ts.filter((t) => t !== k) : [...ts, k]);
```

- [ ] **Step 3: Update the group toggle (remove "By tone")**

Replace the group segmented control (lines 49-51):

```tsx
            <button style={seg(group === "hue")} onClick={() => setGroup("hue")}>By hue</button>
            <button style={seg(group === "flat")} onClick={() => setGroup("flat")}>Ungrouped</button>
```

- [ ] **Step 4: Replace the shade sub-filter with a type filter chip row**

Replace the entire shade block (lines 77-92) with a type chip row that is always shown. It reuses the exact chip markup pattern of the old shade chips (13px dot, `.dc-card`-style pill), multi-select via `types.includes`:

```tsx
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap;">
          <span style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">TYPE</span>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            {COLOR_TYPE_DEFS.filter((t) => tCounts[t.key] > 0).map((t) => {
              const active = types.includes(t.key);
              return (
                <button key={t.key} onClick={() => toggleType(t.key)} style={`cursor: pointer; display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 6px 12px 6px 8px; font: 500 12px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                  <span style={`width: 13px; height: 13px; border-radius: 50%; background-color: ${t.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                  {t.name}<span style="font: 400 10px var(--font-mono); opacity: 0.6;">{tCounts[t.key]}</span>
                </button>
              );
            })}
            {types.length > 0 && <button onClick={() => setTypes([])} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 12px var(--font-ui); padding: 6px 4px;">Clear types ✕</button>}
          </div>
        </div>
```

- [ ] **Step 5: Update the family "Clear ✕" button and intro copy**

The family clear button (line 75) calls `setShade(null)` — remove that. Replace line 75 with:

```tsx
          {family && <button onClick={() => setFamily(null)} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui); padding: 8px 6px;">Clear ✕</button>}
```

Update the intro paragraph (line 43) that says "Group by hue or tone" — it no longer offers a tone grouping:

```tsx
      <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 640px; margin: 8px 0 0;">Group by hue to browse, filter by color type, or ungroup to rank colors by how often people download and copy them.</p>
```

- [ ] **Step 6: Verify types, build, and smoke the page**

Run: `npm run check`
Expected: 0 errors (no remaining references to `tone`, `shade`, `ShadeKey`, `SHADE_DEFS`, `shadeCountsFor`, or `group === "tone"`).

Run: `npx vitest run`
Expected: All unit tests pass.

Run: `npm run build`
Expected: Build succeeds.

Manual smoke (dev server):
```bash
npm run dev
```
Open `/explorer` and confirm: the GROUP toggle shows only "By hue / Ungrouped"; a TYPE chip row appears with counts; selecting multiple type chips widens results (OR); a family selection combined with type chips narrows (AND); "Ungrouped" ranking respects the selected types; "Clear types ✕" resets. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/islands/Explorer.tsx
git commit -m "feat: multi-select color-type filter in Explorer, drop tone grouping and shade sub-filter"
```

---

## Task 5: Docs sweep

**Files:**
- Modify: `docs/architecture-frontend.md` and/or `docs/adding-a-preview-style.md` and `README.md` — only if they describe the tone/shade axes or the "By hue / By tone" Explorer grouping.

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Find stale references**

Run:
```bash
grep -rniE "\btone\b|\bshade\b|by tone|neon|pastel|muted" docs README.md
```
Expected: a list of any prose describing the old Tone/Shade classification or the Explorer's "By tone" grouping.

- [ ] **Step 2: Update the prose**

For each hit that documents the classification or Explorer grouping, edit it to describe the new model: Family (hue) grouping plus a multi-label color-type filter (Pastel, Light, Dark, Muted, Neutral, Vivid, Neon, Jewel, Earth, Warm, Cool, Achromatic) defined in OKLCH. Leave unrelated hits (e.g. a color literally named "Neon Something") alone.

- [ ] **Step 3: Verify no stale doc references remain**

Run:
```bash
grep -rniE "by tone|toneKey|shadeKey" docs README.md
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs README.md
git commit -m "docs: describe OKLCH multi-label color types in the Explorer"
```

---

## Self-Review Notes

- **Spec coverage:** §1 utility → Task 1 (`hexToOklch`). §2 predicates → Task 1 (`colorTypes`, full table in Global Constraints). §3 data model → Tasks 2–3 (`ColorView`/`MergedColorView`/`ExplorerColor` carry `types`; `shadeCountsFor` removed; `groupIntoBands` adapted). §4 UI → Task 4 (drop "By tone", remove shade sub-filter, add multi-select OR type chips ANDed with family). §5 testing → Task 1 (`hexToOklch`, `colorTypes` incl. multi-tag + neutral-orphan cases) and Task 3 (`typeCounts`, `groupIntoBands` filter). Docs → Task 5.
- **Family unchanged / OKLCH-vs-HSL:** `hueFamily` and its HSL inputs are untouched; only `tone`/`shade` are removed. Confirmed in Task 2 Step 3/4.
- **No orphan swatches:** enforced by predicate design (warm/cool cover all C ≥ 0.025; neutral covers the rest) and asserted in Task 1 Step 1 ("never returns an empty tag list").
- **Type consistency:** `ColorTypeKey` is defined once (Task 1) and imported everywhere; `types: ColorTypeKey[]` is the field name across `ColorView`, `MergedColorView`, `ExplorerColor`; `COLOR_TYPE_DEFS`, `typeCounts`, and the new `groupIntoBands` signature (`{ group, family, types, sort }`) are used identically in Tasks 3 and 4.
- **Out of scope confirmed:** Family stays HSL; Monochromatic dropped; no palette-level badges.
