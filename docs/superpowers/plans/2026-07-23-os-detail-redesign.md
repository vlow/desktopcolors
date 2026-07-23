# OS Detail Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the upstream OS Detail Page design (Claude Design project `aa9e4dd9`, `DesktopColors.dc.html`) into the production Astro site: new OS metadata (`type`/`project`/`wikipedia`), removal of the color `index`, a Known-uses timeline, extended color formats, and reuse of `ColorInfobox` for similar-color panels.

**Architecture:** All pure work lives in `lib/` (color math, view-model enrichment) and is unit-tested. The view layer is `islands/OsDetail.tsx` plus one new component `islands/KnownUsesTimeline.tsx`; the similar-colors section reuses the existing `islands/ColorInfobox.tsx`. View models are enriched entirely in `lib/detail.ts` so the Astro pages and `OsDetailPage.astro` need no changes — everything rides on `OsDetailView`.

**Tech Stack:** Astro (SSG), Preact islands, TypeScript, Zod (content schema), Vitest + @testing-library/preact, Playwright (e2e).

## Global Constraints

- **`lib/` stays pure** — no DOM/Astro/Preact imports. Derivation and color math only. (architecture-frontend.md invariant.)
- **No read APIs at runtime** — islands receive all data as build-time props; the new fields/format data must be computed at build time in `lib/`.
- **Styling:** reuse `src/styles/tokens.css` variables/classes (`--page-px`, `.dc-page-x`, `--faint`, `--muted`, `--ink`, `--panel`, `--card-border`, `--field-border`, `--hairline`, `--accent`, `--accent-strong`, `--accent-tint`, `--font-ui`, `--font-mono`, `.dc-card`). Do **not** copy the design file's literal hex values when a token exists. Inline styles are acceptable only for genuine one-offs (matches existing `OsDetail.tsx` conventions).
- **`type` is a plain optional string** rendered verbatim — no enum, no label-mapping table in code.
- Reference material for exact markup/styling: the spec `docs/superpowers/specs/2026-07-23-os-detail-redesign-design.md` and the persisted design source at `/private/tmp/claude-503/-Users-f-engel-Code-desktopcolors/2a94be8b-9e0d-43d9-907c-e4614e673e54/tool-results/toolu_017qEH19D1UK14V8VefXo4fR.txt` (the `showDetail` section), or re-fetch via `DesignSync get_file` projectId `aa9e4dd9-0901-421c-9a2f-0b29ca873168`, path `DesktopColors.dc.html`.
- Run all commands from repo root `/Users/f.engel/Code/desktopcolors`. Verification commands: `npm run check`, `npm test`, `npm run build`.

**Hex → token substitution map** (apply throughout the view tasks):

| Design literal | Token |
|---|---|
| `#fafaf9` (page bg) | (page already themed by `Base.astro`) |
| `#1c1917` / `#292524` (ink) | `var(--ink)` |
| `#57534e` / `#44403c` (body) | `var(--muted)` |
| `#a8a29e` / `#78716c` / `#cbc7c1` (faint) | `var(--faint)` |
| `#e7e5e4` (section rule) | `var(--hairline)` |
| `#eceae8` / `#e2ded9` (card/field border) | `var(--card-border)` / `var(--field-border)` |
| `#f2f0ee` (inner rule) | `var(--hairline)` |
| `#fff` (panel) | `var(--panel)` |
| `oklch(0.96 0.03 255)` (accent tint) | `var(--accent-tint)` |
| accent strong (`oklch(0.5 0.17 255)`) | `var(--accent-strong)` |
| `'Space Grotesk'` | `var(--font-ui)` |
| `'IBM Plex Mono'` | `var(--font-mono)` |

---

## Phase 1 — Data + lib foundation

### Task 1: Remove the color `index` field end-to-end

**Files:**
- Modify: `src/content/config.ts` (remove `index` from `osColor`)
- Modify: `src/lib/catalog.ts` (`ColorView.index`, `toColorView` signature + call)
- Modify: every `src/content/os/*.json` (strip `"index"` from every color)
- Modify: `src/lib/derive.test.ts`, `src/lib/detail.test.ts`, `src/lib/catalog.test.ts`, `src/lib/explorer.test.ts`, `src/content/os.test.ts`, `src/islands/OsDetail.test.tsx` (drop `index` from fixtures)
- Modify: `src/islands/OsDetail.tsx:138` (list subtitle) and `:163` (Palette index row)

**Interfaces:**
- Consumes: nothing.
- Produces: `ColorView` no longer has `index`. `toColorView(hex, name, note, isDefault, scores)` (drops the `index` param).

- [ ] **Step 1: Update the failing schema test first**

In `src/content/os.test.ts`, remove any `index` key from the fixture objects (search for `index:` / `"index"`). If the test asserts on `index`, delete that assertion.

- [ ] **Step 2: Remove `index` from the schema**

In `src/content/config.ts`, delete this line from `osColor`:

```ts
  index: z.string().default("—"),
```

`osColor` becomes:

```ts
const osColor = z.object({
  hex,
  name: z.string().min(1),
  note: z.string().default(""),
  default: z.boolean().default(false),
});
```

- [ ] **Step 3: Remove `index` from `ColorView` and `toColorView`**

In `src/lib/catalog.ts`:
- Delete `index: string;` from the `ColorView` interface.
- Change the signature and body of `toColorView`:

```ts
function toColorView(hex: string, name: string, note: string, isDefault: boolean, scores: Scores): ColorView {
  const key = hex.toLowerCase();
  const [r, g, b] = hexToRgb(key);
  const [h, s, l] = hexToHsl(key);
  const [c, m, y, kk] = hexToCmyk(key);
  const score = colorScore(scores, key);
  return {
    hex: key, name, note, isDefault,
    rgb: `${r}, ${g}, ${b}`,
    hsl: `${h}° ${s}% ${l}%`,
    cmyk: `${c}% ${m}% ${y}% ${kk}%`,
    onColor: onColor(key),
    family: hueFamily(h, s),
    types: colorTypes(key),
    score, scoreLabel: formatScore(score),
  };
}
```
- Update the call site (was `toColorView(c.hex, c.name, c.index, c.note, c.default, scores)`):

```ts
    const colors = data.colors.map((c) =>
      toColorView(c.hex, c.name, c.note, c.default, scores));
```

- [ ] **Step 4: Strip `index` from all content JSON**

Run:

```bash
cd /Users/f.engel/Code/desktopcolors
# Remove object-inline "index": "...", and standalone lines, from every os JSON.
node -e '
const fs=require("fs"),d="src/content/os";
for(const f of fs.readdirSync(d)){
  if(!f.endsWith(".json"))continue;
  const p=d+"/"+f, j=JSON.parse(fs.readFileSync(p,"utf8"));
  for(const c of j.colors) delete c.index;
  fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
}
console.log("stripped index from",fs.readdirSync(d).filter(f=>f.endsWith(".json")).length,"files");
'
```

Expected: prints the file count. (This reformats JSON to 2-space; that is fine and consistent.)

- [ ] **Step 5: Remove `index` from all test fixtures**

In `src/lib/derive.test.ts`, `src/lib/detail.test.ts`, `src/lib/catalog.test.ts`, `src/lib/explorer.test.ts`, `src/islands/OsDetail.test.tsx`: delete every `index: "..."` / `index: "—"` property from color fixture literals. (These are the lines surfaced by `grep -n 'index:' src/lib/*.test.ts src/islands/OsDetail.test.tsx`.) Do not change any other property.

- [ ] **Step 6: Remove the two `index` UI references in `OsDetail.tsx`**

Line ~138 (All-colors list subtitle) — change from:

```tsx
                  <div style="font: 400 11px var(--font-mono); color: var(--faint);">{col.hex} · idx {col.index}</div>
```
to:
```tsx
                  <div style="font: 400 11px var(--font-mono); color: var(--faint);">{col.hex}</div>
```

Line ~163 (Palette index row inside the DETAILS box) — delete the entire row:

```tsx
            <div style="display: flex; justify-content: space-between; padding: 7px 14px;"><span style="font: 400 11px var(--font-mono); color: var(--faint);">Palette index</span><span style="font: 500 13px var(--font-mono);">{c.index}</span></div>
```

- [ ] **Step 7: Verify green**

Run: `npm run check && npm test && npm run build`
Expected: type-check clean, all tests pass, build renders all pages. (No test references `index` anymore.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove color palette index field

The index/idx had no real use. Dropped from the Zod schema, ColorView,
every os/*.json, fixtures, and the two OsDetail UI spots.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `type` / `project` / `wikipedia` OS fields + port data

**Files:**
- Modify: `src/content/config.ts` (schema)
- Modify: `src/lib/catalog.ts` (`OsView` + `buildCatalog`)
- Modify: `src/content/os/*.json` (populate new fields)
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: Task 1's `ColorView`.
- Produces: `OsView` gains `type?: string`, `project?: { name: string; url: string }`, `wikipedia?: string`.

- [ ] **Step 1: Write the failing test**

In `src/lib/catalog.test.ts`, add to an existing fixture entry a `type`/`project`/`wikipedia` and assert they thread through. Example (adapt to the file's `os(...)` helper and `buildCatalog` usage already present):

```ts
it("threads type/project/wikipedia onto the OsView", () => {
  const cat = buildCatalog([
    { slug: "haiku", data: os({ name: "Haiku", year: 2009, colors: [
      { hex: "#336698", name: "Steel Blue", note: "", default: true },
    ], type: "Open Source", project: { name: "Haiku", url: "https://www.haiku-os.org" }, wikipedia: "https://en.wikipedia.org/wiki/Haiku_(operating_system)" }) },
  ], { colors: {}, os: {} });
  const v = cat.bySlug.get("haiku")!;
  expect(v.type).toBe("Open Source");
  expect(v.project).toEqual({ name: "Haiku", url: "https://www.haiku-os.org" });
  expect(v.wikipedia).toContain("wikipedia.org");
});
```

Note: the `os(...)` fixture helper in the test files takes `Partial<OsInput>`; adding these optional fields requires no helper change.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog.test.ts -t "threads type"`
Expected: FAIL — `v.type` is `undefined` (fields not on `OsView` yet).

- [ ] **Step 3: Extend the schema**

In `src/content/config.ts`, add above `colors:` in `osSchema`:

```ts
  type: z.string().min(1).optional(),
  project: z.object({ name: z.string().min(1), url: z.string().url() }).optional(),
  wikipedia: z.string().url().optional(),
```

- [ ] **Step 4: Thread onto `OsView`**

In `src/lib/catalog.ts`, add to the `OsView` interface:

```ts
  type?: string;
  project?: { name: string; url: string };
  wikipedia?: string;
```

In `buildCatalog`'s `osList` map, add to the returned object (alongside `tagline`, `description`):

```ts
      type: data.type,
      project: data.project,
      wikipedia: data.wikipedia,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog.test.ts -t "threads type"`
Expected: PASS.

- [ ] **Step 6: Port data from the design-project JSONs**

For each production `src/content/os/*.json`, fetch its counterpart from the design project and copy `type`, `project`, `wikipedia`, translating the `type` machine key to a label. Run this to see the raw values per file (uses the DesignSync tool set; the executor should call `DesignSync get_file` projectId `aa9e4dd9-0901-421c-9a2f-0b29ca873168` for each of: `amiga-workbench.json`, `amiga-workbench-2-0.json`, `beos.json`, `bleskos.json`, `cde.json`, `freegem.json`, `haiku.json`, `kde-1.json`, `kde-2.json`, `kde-plasma-6.json`, `mac-os-8.json`, `reactos.json`, `serenityos.json`, `windows-1-0.json`, `windows-2-0.json`, `windows-2000.json`, `windows-3-0.json`, `windows-3-1.json`, `windows-95.json`, `windows-98.json`, `windows-me.json`, `windows-nt-3-x.json`, `windows-nt-4-0.json`, `windows-xp.json`).

Translation of `type` key → stored label:
- `"proprietary"` → `"Proprietary"`
- `"opensource"` → `"Open Source"`
- `"free"` → `"Free"`
- `"hybrid"` → `"Mixed license"`

Rules:
- `project: null` in the design JSON → **omit** the `project` field in production.
- If the design JSON has no `wikipedia` → omit it.
- A production `os/*.json` with no design-project counterpart → leave all three fields omitted.
- Append the new fields after `colors` in each JSON (keep `added` as-is). Example (`windows-95.json`): `"type": "Proprietary", "wikipedia": "https://en.wikipedia.org/wiki/Windows_95"` (no `project`). Example (`haiku.json`): `"type": "Open Source", "project": { "name": "Haiku", "url": "https://www.haiku-os.org" }, "wikipedia": "https://en.wikipedia.org/wiki/Haiku_(operating_system)"`.

- [ ] **Step 7: Verify green (schema validates the ported data)**

Run: `npm run check && npm test && npm run build`
Expected: all green — a bad URL or wrong shape in any JSON fails the build here.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(content): add type/project/wikipedia OS fields

Optional OS-level metadata for the detail page's meta line and
References cluster. Ported from the upstream design project.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Color math for extended formats (`lib/color.ts`)

**Files:**
- Modify: `src/lib/color.ts`
- Test: `src/lib/color.test.ts`

**Interfaces:**
- Consumes: existing `hexToRgb`, `srgbToLinear` (private).
- Produces:
  - `rgbToOklab(r, g, b): [number, number, number]`
  - `rgbToLab(r, g, b): [number, number, number]` (CIELAB, D65)
  - `labToLch(L, a, b): [number, number, number]` (H in degrees `[0,360)`)
  - `hexToOklab` refactored to delegate to `rgbToOklab` (behavior unchanged).

- [ ] **Step 1: Write failing tests**

Add to `src/lib/color.test.ts` (extend the import from `./color`):

```ts
describe("rgbToLab", () => {
  it("maps white and black", () => {
    const [Lw] = rgbToLab(255, 255, 255);
    const [Lb] = rgbToLab(0, 0, 0);
    expect(Math.round(Lw)).toBe(100);
    expect(Math.round(Lb)).toBe(0);
  });
  it("teal is greenish-blue (a<0, b<0)", () => {
    const [, a, b] = rgbToLab(0, 128, 128);
    expect(a).toBeLessThan(0);
    expect(b).toBeLessThan(0);
  });
});

describe("labToLch", () => {
  it("chroma is hypot(a,b), hue in [0,360)", () => {
    const [, C, H] = labToLch(50, 3, -4);
    expect(C).toBeCloseTo(5, 5);
    expect(H).toBeGreaterThanOrEqual(0);
    expect(H).toBeLessThan(360);
  });
});

describe("rgbToOklab", () => {
  it("matches hexToOklab for the same color", () => {
    expect(rgbToOklab(0, 128, 128)).toEqual(hexToOklab("#008080"));
  });
});
```

Add `rgbToLab, labToLch, rgbToOklab` to the existing color-import line at the top of the test file.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/color.test.ts -t "rgbToLab"`
Expected: FAIL — `rgbToLab is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/color.ts`, refactor `hexToOklab` to delegate and add the new functions:

```ts
// Björn Ottosson's linear-sRGB -> OKLab transform.
export function rgbToOklab(r8: number, g8: number, b8: number): [number, number, number] {
  const r = srgbToLinear(r8), g = srgbToLinear(g8), b = srgbToLinear(b8);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

export function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToOklab(r, g, b);
}

// sRGB (0–255) -> CIELAB (D65). L 0–100, a/b unbounded.
export function rgbToLab(r8: number, g8: number, b8: number): [number, number, number] {
  const r = srgbToLinear(r8), g = srgbToLinear(g8), b = srgbToLinear(b8);
  // linear sRGB -> XYZ (D65)
  let x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  let y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  let z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  // normalize by D65 white point
  x /= 0.95047; y /= 1.0; z /= 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// CIELAB -> CIELCh. C = hypot(a,b); H in degrees [0,360).
export function labToLch(L: number, a: number, b: number): [number, number, number] {
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}
```

Delete the old `hexToOklab` body (now replaced above). Keep `hexToOklch` as-is (it still uses `hexToOklab`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/color.test.ts`
Expected: PASS (including existing OKLab/OKLCH tests, unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/color.ts src/lib/color.test.ts
git commit -m "feat(lib): add rgbToLab, labToLch, rgbToOklab color math

Powers the extended color-format rows on the detail page. hexToOklab
now delegates to rgbToOklab (behavior unchanged).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Enrich `detail.ts` — known-uses, extended formats, similar-not-identical; drop `firstKnownUse`

**Files:**
- Modify: `src/lib/detail.ts`
- Modify: `src/lib/derive.ts` (remove `firstKnownUse` + `FirstUse`)
- Modify: `src/lib/derive.test.ts` (remove `firstKnownUse` tests/import)
- Modify: `src/islands/OsDetail.tsx` (remove the now-defunct DETAILS box using `firstUse`, so type-check stays green)
- Test: `src/lib/detail.test.ts`

**Interfaces:**
- Consumes: `buildPlatformsByHex` from `./explorer` (returns `Record<string, Platform[]>`, each `Platform = { slug, name, year, family, isDefault }`, sorted by year then name), Task 3 color math, `hexToHsl`, `onColor`.
- Produces on `DetailColor`:
  - `uses: Platform[]` — all platforms shipping this exact hex (sorted year, then name).
  - `extraFormats: CopyRow[]` where `interface CopyRow { key: string; label: string; value: string; copy: string; swatch?: string }` — the CIELAB / LCH / OKLab / OKLCH / RAL Classic / RAL Design+ rows.
  - `similar: SimilarView[]` where `SimilarView = { hex, name, match, onColor, h, s, l, primarySlug, style, platforms: Platform[] }`, filtered to `match < 100`.
  - `firstUse` is **removed** from `DetailColor`.

- [ ] **Step 1: Write failing tests**

In `src/lib/detail.test.ts`, replace `firstUse` assertions with `uses`/`extraFormats`/similar filtering. Using the file's existing `entries`/`catalog` fixtures (Teal `#008080` appears on `win-95` (default) and `cde`):

```ts
it("lists all platforms using the exact hex (known uses), sorted by year", () => {
  const view = buildOsDetail(entries, catalog, "win-95");
  const teal = view.colors.find((c) => c.hex === "#008080")!;
  expect(teal.uses.map((u) => u.slug)).toEqual(["cde", "win-95"]); // 1993 then 1995
  expect(teal.uses.find((u) => u.slug === "win-95")!.isDefault).toBe(true);
});

it("excludes identical-hex matches from similar", () => {
  const view = buildOsDetail(entries, catalog, "win-95");
  const teal = view.colors.find((c) => c.hex === "#008080")!;
  expect(teal.similar.every((s) => s.hex !== "#008080")).toBe(true);
  expect(teal.similar.every((s) => s.match < 100)).toBe(true);
});

it("builds extended-format rows including RAL", () => {
  const view = buildOsDetail(entries, catalog, "win-95");
  const teal = view.colors.find((c) => c.hex === "#008080")!;
  const keys = teal.extraFormats.map((r) => r.key);
  expect(keys).toEqual(["lab", "lch", "oklab", "oklch", "ral", "ralDesign"]);
  expect(teal.extraFormats.find((r) => r.key === "ral")!.swatch).toMatch(/^#/);
});
```

Remove the `firstKnownUse` import and its `describe` block from `src/lib/derive.test.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/detail.test.ts`
Expected: FAIL — `uses`/`extraFormats` undefined.

- [ ] **Step 3: Remove `firstKnownUse` from `derive.ts`**

In `src/lib/derive.ts`, delete the `FirstUse` interface and the entire `firstKnownUse` function (lines ~113–126).

- [ ] **Step 4: Rewrite `detail.ts`**

Replace `src/lib/detail.ts` with:

```ts
import { closestRal, closestRalDesign, onColor, hexToHsl, hexToRgb, rgbToLab, labToLch, rgbToOklab } from "./color";
import { similarColors, eraPeers, type OsEntry, type SimilarColor, type EraPeer } from "./derive";
import { buildPlatformsByHex, type Platform } from "./explorer";
import type { Catalog, OsView, ColorView } from "./catalog";
import { colorPath } from "./links";

export interface RalMatch { code: string; name: string; hex: string }
export interface CopyRow { key: string; label: string; value: string; copy: string; swatch?: string }

export interface SimilarView {
  hex: string; name: string; match: number;
  onColor: string; h: number; s: number; l: number;
  primarySlug: string; style: string; platforms: Platform[];
}

export interface DetailColor extends ColorView {
  ral: RalMatch;
  ralDesign: RalMatch;
  extraFormats: CopyRow[];
  similar: SimilarView[];
  uses: Platform[];
}

export interface EraPeerView extends EraPeer { onColor: string; href: string; metaLine: string }

export interface OsDetailView {
  os: OsView;
  colors: DetailColor[];
  eraPeers: EraPeerView[];
}

export function dedupeSimilarByHex(list: SimilarColor[]): SimilarColor[] {
  const seen = new Set<string>();
  const out: SimilarColor[] = [];
  for (const c of list) {
    if (seen.has(c.hex)) continue;
    seen.add(c.hex);
    out.push(c);
  }
  return out;
}

const n1 = (x: number) => x.toFixed(1);
const n3 = (x: number) => x.toFixed(3);

function extraFormats(hex: string, ral: RalMatch, ralDesign: RalMatch): CopyRow[] {
  const [r, g, b] = hexToRgb(hex);
  const [L, a, bl] = rgbToLab(r, g, b);
  const [Ll, Cc, Hh] = labToLch(L, a, bl);
  const [ol, oa, ob] = rgbToOklab(r, g, b);
  const Coq = Math.sqrt(oa * oa + ob * ob);
  let Hoq = (Math.atan2(ob, oa) * 180) / Math.PI; if (Hoq < 0) Hoq += 360;
  return [
    { key: "lab", label: "CIELAB", value: `${n1(L)}, ${n1(a)}, ${n1(bl)}`, copy: `lab(${n1(L)}% ${n1(a)} ${n1(bl)})` },
    { key: "lch", label: "LCH", value: `${n1(Ll)}, ${n1(Cc)}, ${n1(Hh)}`, copy: `lch(${n1(Ll)}% ${n1(Cc)} ${n1(Hh)})` },
    { key: "oklab", label: "OKLab", value: `${n3(ol)}, ${n3(oa)}, ${n3(ob)}`, copy: `oklab(${n3(ol)} ${n3(oa)} ${n3(ob)})` },
    { key: "oklch", label: "OKLCH", value: `${n3(ol)}, ${n3(Coq)}, ${n1(Hoq)}`, copy: `oklch(${n3(ol)} ${n3(Coq)} ${n1(Hoq)})` },
    { key: "ral", label: "Closest RAL Classic", value: `${ral.code} · ${ral.name}`, copy: `${ral.code} · ${ral.name}`, swatch: ral.hex },
    { key: "ralDesign", label: "Closest RAL Design+", value: `${ralDesign.code} · ${ralDesign.name}`, copy: `${ralDesign.code} · ${ralDesign.name}`, swatch: ralDesign.hex },
  ];
}

export function buildOsDetail(entries: OsEntry[], catalog: Catalog, slug: string): OsDetailView {
  const os = catalog.bySlug.get(slug);
  const entry = entries.find((e) => e.slug === slug);
  if (!os || !entry) throw new Error(`Unknown OS slug "${slug}"`);

  const platformsByHex = buildPlatformsByHex(catalog);
  const styleBySlug: Record<string, string> = {};
  for (const o of catalog.osList) styleBySlug[o.slug] = o.desktopStyle;

  const colors: DetailColor[] = os.colors.map((c: ColorView) => {
    const ral = closestRal(c.hex);
    const ralDesign = closestRalDesign(c.hex);
    const similar: SimilarView[] = dedupeSimilarByHex(similarColors(c.hex, entries, slug, 24))
      .filter((s) => s.match < 100 && s.hex.toLowerCase() !== c.hex.toLowerCase())
      .slice(0, 6)
      .map((s) => {
        const [h, sat, l] = hexToHsl(s.hex);
        const platforms = platformsByHex[s.hex.toLowerCase()] ?? [];
        const primarySlug = platforms[0]?.slug ?? s.osSlug;
        return {
          hex: s.hex, name: s.name, match: s.match, onColor: onColor(s.hex),
          h, s: sat, l, primarySlug, style: styleBySlug[primarySlug] ?? "generic", platforms,
        };
      });
    return {
      ...c,
      ral: { code: ral.code, name: ral.name, hex: ral.hex },
      ralDesign: { code: ralDesign.code, name: ralDesign.name, hex: ralDesign.hex },
      extraFormats: extraFormats(c.hex, ral, ralDesign),
      similar,
      uses: platformsByHex[c.hex.toLowerCase()] ?? [],
    };
  });

  const peers: EraPeerView[] = eraPeers(entry, entries, 3).map((p) => ({
    ...p, onColor: onColor(p.hex), href: `/os/${p.slug}`, metaLine: `${p.year} · ${p.family}`,
  }));

  return { os, colors, eraPeers: peers };
}
```

- [ ] **Step 5: Keep `OsDetail.tsx` compiling — remove the old DETAILS box**

In `src/islands/OsDetail.tsx`, the left meta box (the `DETAILS` `<div>` that now contains only the `First known use` line after Task 1) references `c.firstUse`, which no longer exists. Delete that entire left-hand `<div style="border: 1px solid var(--card-border); ...">…DETAILS…</div>` block (the first child of `dc-detail-meta`). Leave the right-hand color-values box in place. (Phase 2 Task 6 adds the `KnownUsesTimeline` in this slot.) The grid will transiently show one column — acceptable mid-branch.

- [ ] **Step 6: Run to verify pass**

Run: `npm run check && npm test`
Expected: PASS — detail tests green, no `firstUse`/`firstKnownUse` references remain.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(lib): known-uses, extended formats, similar-not-identical

detail.ts now enriches each color with uses[] (all platforms on the exact
hex, via buildPlatformsByHex), extraFormats[] (CIELAB/LCH/OKLab/OKLCH/RAL),
and similar[] filtered to match<100 with infobox data. Removes the unused
firstKnownUse helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — View layer

### Task 5: `KnownUsesTimeline` component

**Files:**
- Create: `src/islands/KnownUsesTimeline.tsx`
- Test: `src/islands/KnownUsesTimeline.test.tsx`

**Interfaces:**
- Consumes: `Platform` from `../lib/explorer`, `colorPath` from `../lib/links`.
- Produces: `export function KnownUsesTimeline(props: { hex: string; uses: Platform[]; currentSlug: string }): JSX.Element`. Renders the "KNOWN USES" box. Owns local hover state; non-current rows link via `colorPath(slug, hex)`.

- [ ] **Step 1: Write failing tests**

Create `src/islands/KnownUsesTimeline.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { KnownUsesTimeline } from "./KnownUsesTimeline";
import type { Platform } from "../lib/explorer";

const uses: Platform[] = [
  { slug: "cde", name: "CDE", year: 1993, family: "Desktop Env.", isDefault: false },
  { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
];

describe("KnownUsesTimeline", () => {
  it("solo state when only one platform uses the hex", () => {
    render(<KnownUsesTimeline hex="#008080" uses={[uses[1]]} currentSlug="windows-95" />);
    expect(screen.getByText(/Only in this palette so far/)).toBeTruthy();
  });

  it("multi state shows count label and first-use summary", () => {
    render(<KnownUsesTimeline hex="#008080" uses={uses} currentSlug="windows-95" />);
    expect(screen.getByText(/2 palettes · 1993–1995/)).toBeTruthy();
    expect(screen.getByText(/First in/)).toBeTruthy();
  });

  it("expands to a list that links non-current platforms to their color page", () => {
    render(<KnownUsesTimeline hex="#008080" uses={uses} currentSlug="windows-95" />);
    fireEvent.click(screen.getByText(/View all 2 palettes/));
    const link = screen.getByText("CDE").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/os/cde/008080");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/islands/KnownUsesTimeline.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/islands/KnownUsesTimeline.tsx` with the full body below (ported from the design's `usesCard`, hex literals swapped for tokens):

```tsx
import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Platform } from "../lib/explorer";
import { colorPath } from "../lib/links";

interface Props { hex: string; uses: Platform[]; currentSlug: string }
type Hover = { year: number; idx: number | null } | null;

const ACCENT = "var(--accent)";
const ACCENT_STRONG = "var(--accent-strong)";

export function KnownUsesTimeline({ hex, uses, currentSlug }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<Hover>(null);

  const n = uses.length;
  const minY = uses[0].year, maxY = uses[n - 1].year;
  const span = Math.max(1, maxY - minY);
  const countLabel = n === 1 ? "1 palette" : `${n} palettes · ${minY}–${maxY}`;

  const header = (
    <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px;">
      <span style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">KNOWN USES</span>
      <span style="font: 500 10px var(--font-mono); color: var(--faint);">{countLabel}</span>
    </div>
  );

  const box = (inner: ComponentChildren) => (
    <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
      <div style="padding: 12px 14px 14px;">{header}{inner}</div>
    </div>
  );

  if (n <= 1) {
    return box(<div style="font: 400 12.5px var(--font-ui); color: var(--muted);">Only in this palette so far.</div>);
  }

  const isCurrent = (u: Platform) => u.slug === currentSlug;
  const tickActive = (u: Platform) => !!hover && hover.year === u.year;
  const rowActive = (u: Platform, i: number) => !!hover && (hover.idx === i || (hover.idx == null && hover.year === u.year));

  const tallyRest = n - 1 === 1
    ? "Also in 1 other palette."
    : `Recurs across ${n} palettes through ${uses[n - 1].name}, ${maxY}.`;

  return box(
    <>
      <div style="position: relative; height: 24px; margin: 8px 3px 12px;">
        <div style="position: absolute; top: 11px; left: 0; right: 0; height: 2px; background: var(--card-border);" />
        {uses.map((u) => {
          const active = tickActive(u), cur = isCurrent(u);
          const size = active ? 13 : cur ? 11 : 8;
          const bg = cur ? ACCENT_STRONG : ACCENT;
          const ring = active
            ? "box-shadow: 0 0 0 3px var(--accent-tint);"
            : cur ? "box-shadow: 0 0 0 3px var(--accent-tint);" : "opacity: 0.8;";
          return (
            <span key={u.slug} onMouseEnter={() => setHover({ year: u.year, idx: null })} onMouseLeave={() => setHover(null)}
              style={`position: absolute; top: ${12 - size / 2}px; left: ${((u.year - minY) / span) * 100}%; width: ${size}px; height: ${size}px; border-radius: 50%; background: ${bg}; transform: translateX(-50%); cursor: pointer; transition: width .12s, height .12s; z-index: ${active ? 2 : 1}; ${ring}`} />
          );
        })}
        <span style="position: absolute; top: 16px; left: 0; font: 400 9px var(--font-mono); color: var(--faint);">{minY}</span>
        <span style="position: absolute; top: 16px; right: 0; font: 400 9px var(--font-mono); color: var(--faint);">{maxY}</span>
      </div>

      <div style="font: 400 12.5px var(--font-ui); color: var(--muted); line-height: 1.5;">
        First in <strong>{uses[0].name}</strong>, {minY}. {tallyRest}
      </div>

      <a onClick={() => { setExpanded((v) => !v); setHover(null); }}
        style="display: inline-block; margin-top: 11px; font: 500 11px var(--font-mono); color: var(--accent-strong); cursor: pointer;">
        {expanded ? "Hide palettes" : `View all ${n} palettes →`}
      </a>

      {expanded && (
        <div style="border-top: 1px solid var(--hairline); margin-top: 13px; padding-top: 5px;">
          {uses.map((u, i) => {
            const active = rowActive(u, i), cur = isCurrent(u), isFirst = i === 0, isLast = i === n - 1;
            const dot = cur
              ? `width: 11px; height: 11px; border-radius: 50%; background: ${ACCENT_STRONG}; box-shadow: 0 0 0 3px var(--accent-tint); position: relative; z-index: 1;`
              : `width: 9px; height: 9px; border-radius: 50%; background: ${active ? ACCENT : "var(--panel)"}; box-shadow: inset 0 0 0 2px ${ACCENT}; position: relative; z-index: 1;`;
            let line = "position: absolute; left: 50%; width: 2px; background: var(--hairline); transform: translateX(-50%);";
            line += isFirst ? "top: 50%; bottom: -7px;" : isLast ? "top: -7px; height: 50%;" : "top: -7px; bottom: -7px;";
            const rowStyle = `text-decoration: none; display: grid; grid-template-columns: 16px 1fr auto; align-items: center; gap: 10px; padding: 7px 6px; margin: 0 -6px; border-radius: 7px; cursor: ${cur ? "default" : "pointer"}; ${active ? "background: var(--accent-tint);" : ""}`;
            const rail = (
              <span style="justify-self: center; position: relative; width: 16px; display: flex; justify-content: center;">
                <span style={line} /><span style={dot} />
              </span>
            );
            const meta = (
              <span style="display: inline-flex; align-items: center; gap: 6px;">
                {isFirst && <span style="font: 600 8px var(--font-mono); letter-spacing: 1px; color: var(--muted); background: var(--hairline); padding: 2px 5px; border-radius: 4px;">FIRST</span>}
                {u.isDefault && <span style="font: 600 8px var(--font-ui); letter-spacing: 0.5px; color: var(--accent-strong); background: var(--accent-tint); padding: 2px 6px; border-radius: 999px;">DEFAULT</span>}
                <span style="font: 500 12px var(--font-mono); color: var(--faint);">{u.year}</span>
              </span>
            );
            const nameColor = cur ? "var(--accent-strong)" : "var(--ink)";
            const props = { style: rowStyle, onMouseEnter: () => setHover({ year: u.year, idx: i }), onMouseLeave: () => setHover(null) };
            const inner = <>{rail}<span style={`font: 500 13px var(--font-ui); color: ${nameColor};`}>{u.name}</span>{meta}</>;
            return cur
              ? <div key={u.slug} {...props}>{inner}</div>
              : <a key={u.slug} href={colorPath(u.slug, hex)} {...props}>{inner}</a>;
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/islands/KnownUsesTimeline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/islands/KnownUsesTimeline.tsx src/islands/KnownUsesTimeline.test.tsx
git commit -m "feat(islands): KnownUsesTimeline component

Timeline of platforms shipping the exact color, with two-way tick<->row
hover highlight and links to each platform's color page.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `OsDetail.tsx` — references, type, steppers, mount timeline, extended-formats toggle

**Files:**
- Modify: `src/islands/OsDetail.tsx`
- Test: `src/islands/OsDetail.test.tsx`

**Interfaces:**
- Consumes: `KnownUsesTimeline` (Task 5); `DetailColor.uses`, `DetailColor.extraFormats` (Task 4); `os.type`, `os.project`, `os.wikipedia` (Task 2).
- Produces: no new exported interface.

- [ ] **Step 1: Update fixtures + write failing tests**

In `src/islands/OsDetail.test.tsx`: the fixture colors already lost `index` (Task 1) and `firstUse` (Task 4 removed it from the type). Add the new required `DetailColor` fields to each fixture color: `uses`, `extraFormats`, and update `similar` to the new `SimilarView` shape. Example for the Teal fixture:

```ts
uses: [
  { slug: "cde", name: "CDE", year: 1993, family: "Desktop Env.", isDefault: false },
  { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
],
extraFormats: [
  { key: "lab", label: "CIELAB", value: "48.3, -28.8, -8.5", copy: "lab(48.3% -28.8 -8.5)" },
  { key: "ral", label: "Closest RAL Classic", value: "RAL 5021 · Water Blue", copy: "RAL 5021 · Water Blue", swatch: "#07737a" },
],
similar: [
  { hex: "#4e9a9a", name: "Teal", match: 88, onColor: "#ffffff", h: 180, s: 33, l: 45, primarySlug: "kde-1", style: "kde", platforms: [{ slug: "kde-1", name: "KDE 1", year: 1998, family: "KDE", isDefault: false }] },
],
```

Add `os.type: "Proprietary"`, `os.wikipedia: "https://en.wikipedia.org/wiki/Windows_95"` to the fixture `os`.

Then add tests:

```tsx
it("renders the type in the meta line and the References links", () => {
  render(<OsDetail view={view} initialHex={null} />);
  expect(screen.getByText(/Proprietary/)).toBeTruthy();
  const wiki = screen.getByText(/Wikipedia/).closest("a") as HTMLAnchorElement;
  expect(wiki.getAttribute("href")).toContain("wikipedia.org");
});

it("toggles extended color formats", () => {
  render(<OsDetail view={view} initialHex={null} />);
  expect(screen.queryByText("CIELAB")).toBeNull();
  fireEvent.click(screen.getByText(/View all .* formats/));
  expect(screen.getByText("CIELAB")).toBeTruthy();
});

it("shows the known-uses timeline", () => {
  render(<OsDetail view={view} initialHex={null} />);
  expect(screen.getByText("KNOWN USES")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/islands/OsDetail.test.tsx`
Expected: FAIL (type errors on fixtures resolve once shapes match; new assertions fail until UI added).

- [ ] **Step 3: Add References cluster + type to the header**

In `OsDetail.tsx`, replace the back-link line with a flex row holding the back link (left) and a References cluster (right); add the type segment to the meta line. Import nothing new. Reference the design `showDetail` header block; token-substituted:

```tsx
      <div style="display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px 18px;">
        <a href="/" style="font: 400 13px var(--font-mono); color: var(--faint);">← Browse all platforms</a>
        {(os.project || os.wikipedia) && (
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;">
            <span style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">REFERENCES</span>
            {os.project && <a href={os.project.url} target="_blank" rel="noopener" style={REF_LINK}>⧉ {os.project.name} <span style="opacity: 0.5;">↗</span></a>}
            {os.wikipedia && <a href={os.wikipedia} target="_blank" rel="noopener" style={REF_LINK}><span style="font: 700 13px var(--font-ui);">W</span> Wikipedia <span style="opacity: 0.5;">↗</span></a>}
          </div>
        )}
      </div>
```

Add near the top of the component: `const REF_LINK = "display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--ink); font: 500 12px var(--font-ui); border: 1px solid var(--card-border); border-radius: 11px; background: var(--panel); padding: 8px 12px;";`

Meta line — change to include type:

```tsx
      <div style="font: 400 12px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-top: 14px;">{os.family} · {os.year}{os.type && <> <span style="color: var(--faint);">·</span> <span style="color: var(--muted);">{os.type}</span></>}</div>
```

- [ ] **Step 4: Replace predecessor/successor buttons with Earlier/Later stepper cards**

Replace the existing predecessor/successor block (`<div style="display: flex; gap: 8px; margin-bottom: 22px;">…</div>`) with:

```tsx
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 560px; margin-bottom: 22px;">
        {os.predecessor && (
          <a href={`/os/${os.predecessor.slug}`} style={STEP_CARD}>
            <span style="font-size: 18px; color: var(--faint);">←</span>
            <span style="min-width: 0;">
              <span style="display: block; font: 500 11px var(--font-ui); color: var(--faint);">Earlier</span>
              <span style="display: block; font: 500 16px var(--font-ui); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{os.predecessor.name}</span>
            </span>
          </a>
        )}
        {os.successor && (
          <a href={`/os/${os.successor.slug}`} style={`${STEP_CARD} justify-content: flex-end; text-align: right;`}>
            <span style="min-width: 0;">
              <span style="display: block; font: 500 11px var(--font-ui); color: var(--faint);">Later</span>
              <span style="display: block; font: 500 16px var(--font-ui); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{os.successor.name}</span>
            </span>
            <span style="font-size: 18px; color: var(--faint);">→</span>
          </a>
        )}
      </div>
```

Add near the `REF_LINK` constant: `const STEP_CARD = "display: flex; align-items: center; gap: 12px; text-decoration: none; border: 1px solid var(--card-border); border-radius: 11px; background: var(--panel); padding: 11px 15px;";`

- [ ] **Step 5: Mount `KnownUsesTimeline` in the left meta slot + render extended formats**

Import at top: `import { KnownUsesTimeline } from "./KnownUsesTimeline";`

In the `dc-detail-meta` grid, restore the left cell as the timeline:

```tsx
        <KnownUsesTimeline hex={c.hex} uses={c.uses} currentSlug={os.slug} />
```

Right cell (color values) — add the extended-formats section. Extend `CopyKey` to `string`. Keep primary rows (`copyRow("hex"...)`, rgb, hsl, cmyk). After them, add:

```tsx
            {codesExpanded && c.extraFormats.map((r) => copyRow(r.key, r.label, r.value, r.copy, r.swatch))}
            <a onClick={() => setCodesExpanded((v) => !v)} style="display: block; border-top: 1px solid var(--hairline); padding: 9px 14px; font: 500 11px var(--font-mono); color: var(--accent-strong); cursor: pointer;">
              {codesExpanded ? "Show fewer formats" : `View all ${4 + c.extraFormats.length} formats →`}
            </a>
```

Add state: `const [codesExpanded, setCodesExpanded] = useState(false);`. Remove the old inline `ral`/`ralDesign` `copyRow(...)` calls (they now live in `extraFormats`). Widen the `copy`/`copied` types so `key` accepts the extra keys (`type CopyKey = string;`).

- [ ] **Step 6: Same-era peers meta line**

Change the era-peer subtitle render to use `e.metaLine` instead of `{e.year} · {e.family}`.

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/islands/OsDetail.test.tsx && npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/islands/OsDetail.tsx src/islands/OsDetail.test.tsx
git commit -m "feat(islands): detail header refs, type, steppers, timeline, formats

References cluster + type in the meta line, Earlier/Later stepper cards,
KnownUsesTimeline in the left meta slot, and an expandable EXTENDED FORMATS
section in the color-values box.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `OsDetail.tsx` — similar-colors inline `ColorInfobox` panel

**Files:**
- Modify: `src/islands/OsDetail.tsx`
- Test: `src/islands/OsDetail.test.tsx`

**Interfaces:**
- Consumes: `ColorInfobox` + `InfoboxColor` from `./ColorInfobox`; `SimilarView` fields from Task 4.
- Produces: none.

- [ ] **Step 1: Write failing test**

Add to `src/islands/OsDetail.test.tsx`:

```tsx
it("expands a similar color into a ColorInfobox panel with platform chips", () => {
  render(<OsDetail view={view} initialHex={null} />);
  // Teal is default-selected; it has one similar (#4e9a9a on KDE 1)
  fireEvent.click(screen.getByText("#4e9a9a"));
  const chip = screen.getAllByTestId("infobox-platform")[0] as HTMLAnchorElement;
  expect(chip.getAttribute("href")).toBe("/os/kde-1/4e9a9a");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/islands/OsDetail.test.tsx -t "expands a similar"`
Expected: FAIL — clicking does nothing / no infobox.

- [ ] **Step 3: Implement the expandable similar grid**

Imports: `import { ColorInfobox, type InfoboxColor } from "./ColorInfobox";`

Add state: `const [simExp, setSimExp] = useState<string | null>(null);` (holds the expanded similar hex, or null).

Replace the "Similar colors elsewhere" grid body. Each card toggles `simExp`; when a card is expanded, render an inline `ColorInfobox` panel below it. Simplest correct layout (a panel row spanning the grid, after the clicked card): render the grid of cards, and when `simExp` matches, render the panel directly under the grid (the design's head/panel/tail split is a visual refinement — a full-width panel under the grid satisfies the behavior and tests; port the head/panel/tail caret split from the design if pixel-parity is desired).

```tsx
{c.similar.map((s) => (
  <a key={s.hex} onClick={() => setSimExp((x) => (x === s.hex ? null : s.hex))}
     style={`cursor: pointer; border: 1px solid var(--card-border); border-radius: 13px; overflow: hidden; background: var(--panel); display: block; ${simExp === s.hex ? "outline: 2px solid var(--accent);" : ""}`}>
    <div style={`position: relative; height: 76px; background-color: ${s.hex};`}>
      <span style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); color: #1c1917; font: 500 10px var(--font-ui); padding: 3px 8px; border-radius: 999px;">{s.match}% match</span>
    </div>
    <div style="padding: 11px 13px 13px;">
      <div style="font: 500 14px var(--font-ui);">{s.name}</div>
      <div style="font: 400 11px var(--font-mono); color: var(--faint);">{s.hex}</div>
    </div>
  </a>
))}
```

Panel (rendered after the grid when `simExp` is set) — find the expanded `SimilarView` and mount `ColorInfobox` (flat variant), wiring preview/download to the similar color:

```tsx
{simExp && (() => {
  const s = c.similar.find((x) => x.hex === simExp);
  if (!s) return null;
  const infoColor: InfoboxColor = { hex: s.hex, name: s.name, onColor: s.onColor, h: s.h, s: s.s, l: s.l, primarySlug: s.primarySlug };
  return (
    <div style="margin-top: 14px;">
      <ColorInfobox variant="flat" color={infoColor} platforms={s.platforms}
        onPreview={() => setSimPreview(s)} onDownload={() => setSimSheet(s)} />
    </div>
  );
})()}
```

Add state + overlays for the similar color's preview/download (mirroring the existing `full`/`sheet` for the selected color):
- `const [simPreview, setSimPreview] = useState<SimilarView | null>(null);`
- `const [simSheet, setSimSheet] = useState<SimilarView | null>(null);`
- Render, alongside the existing `FullscreenPreview`/`DownloadSheet`:

```tsx
{simPreview && <FullscreenPreview hex={simPreview.hex} onColor={simPreview.onColor} style={simPreview.style as any}
  label={`${simPreview.name} · ${simPreview.hex}`} pos={1} total={1}
  onClose={() => setSimPreview(null)} onPrev={() => {}} onNext={() => {}} />}
{simSheet && <DownloadSheet osSlug={simSheet.primarySlug} color={{ hex: simSheet.hex, name: simSheet.name }} onClose={() => setSimSheet(null)} />}
```

Import `SimilarView` type: `import type { OsDetailView, DetailColor, SimilarView } from "../lib/detail";`. Reset `simExp` to `null` when the selected color changes (add `setSimExp(null)` wherever `setSel` is called, or in the existing `sel` effect).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/islands/OsDetail.test.tsx && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/islands/OsDetail.tsx src/islands/OsDetail.test.tsx
git commit -m "feat(islands): similar colors open an inline ColorInfobox panel

Clicking a similar-color card expands the shared ColorInfobox (flat) with
that color's values and platform chips, plus preview/download wired to the
similar color.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Responsive polish + full verification

**Files:**
- Modify: `src/islands/OsDetail.tsx` (and `src/styles/tokens.css` only if a shared rule is warranted)

**Interfaces:** none.

- [ ] **Step 1: Narrow-viewport review**

Build and drive the detail page at a narrow width. Run: `npm run build && npm run preview` (or the project `/run` skill). Open an OS detail page (e.g. `/os/windows-95`) and check at ~380px width:
- Hero grid (`.dc-detail-hero`) stacks to one column (existing CSS in `tokens.css`/component handles `.dc-detail-hero`; verify).
- References cluster wraps under the back link (the header row already uses `flex-wrap: wrap`).
- Known-uses timeline, extended-formats block, and similar-panel reflow without horizontal overflow.

- [ ] **Step 2: Fix any overflow**

For any element that overflows horizontally, add `min-width: 0` / `flex-wrap: wrap` / `max-width: 100%` as appropriate. If a fix is a shared rule, add it to `tokens.css`; if it is local to the detail island, keep it inline. Do not introduce new hardcoded breakpoints if `.dc-detail-hero`'s existing media query can be reused.

- [ ] **Step 3: Full verification**

Run:
```bash
npm run check && npm test && npm run build && npm run test:e2e
```
Expected: type-check clean; all unit tests pass; every page pre-renders; e2e (beacons fire + wallpaper downloads) green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "polish(islands): responsive OS detail page redesign

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (coverage against the spec)

- Spec §1 (schema: index removal, type/project/wikipedia optional, data port) → Tasks 1, 2.
- Spec §2 (color math; known-uses via reuse of `buildPlatformsByHex`; similar excludes identical; drop `firstKnownUse`; ColorView loses index) → Tasks 1, 3, 4.
- Spec §3 (references, type meta, steppers, all-colors sub, KnownUsesTimeline, extended formats, similar ColorInfobox panel, era metaLine) → Tasks 5, 6, 7.
- Spec §4 (responsive) → Task 8.
- Spec §5 (testing) → tests in every task + Task 8 full run incl. e2e.
- Deviation from spec §2: no new `usesOfHex` helper — the existing `buildPlatformsByHex` already returns the sorted per-hex `Platform[]` both features need, so reusing it avoids duplicate derivation (honours DRY / no-dead-code). Documented here intentionally.
