# desktopcolors.com — Plan 1: Foundation & Browse

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Astro + Preact project with a validated one-JSON-per-OS content model, a fully tested build-time data pipeline (color math → derived data → catalog with baked popularity scores), and a working, styled, searchable/sortable Browse page rendered from real data.

**Architecture:** Astro static-site generation with small Preact islands for interactivity. All OS data lives as one JSON file per platform in an Astro content collection, validated by Zod at build time. Pure TypeScript functions compute every derived value (RGB/HSL, hue family, tone, closest RAL, merged-by-hex colors, similarity, era peers, first-known-use) and assemble a typed `Catalog`. Popularity scores are read from an optional `scores.json` and baked into that catalog; when the file is absent, all scores default to 0. The Browse page renders the catalog server-side (baked default order) and hands the full dataset to a Preact island for live search/sort over data already in the page.

**Tech Stack:** Astro 4, `@astrojs/preact`, Preact, TypeScript (strict), Zod (via `astro:content`), Vitest, `@testing-library/preact`.

## Global Constraints

- **Node**: 20 LTS or newer (Astro 4 requirement). Pin via `.nvmrc` = `20`.
- **TypeScript**: `strict: true`. No `any` in committed code.
- **Scores**: synthetic points, integers, start at 0. Copy/download = +3 color & +3 OS; OS view = +1 OS (scoring itself is implemented in Plan 3 — Plan 1 only *reads and bakes* scores).
- **Score display**: show the literal string `< 1k` for any score `< 1000`; at/above 1000 show `Math` -formatted with one decimal and a `k` suffix, trailing `.0` stripped (e.g. `1200 → "1.2k"`, `48200 → "48.2k"`, `2000 → "2k"`).
- **Colors** are keyed **by lowercased hex, globally** across platforms. **OSes** are keyed by **slug**.
- **on-color rule** (text over a swatch): HSL lightness `> 55` → `#1c1917`, else `#ffffff`.
- **Perceptual distance**: all "nearest color" logic (closest-RAL, similar-colors) uses **OKLab** Euclidean distance, not RGB. The reference set for closest-color is the **full RAL Classic table (216 colors)**, vendored from the lunohodov gist (`ral_classic.csv`), never a hand-picked subset.
- **Design tokens** (exact values): bg `#fafaf9`, ink `#1c1917`, muted text `#57534e`, faint `#a8a29e`, hairline `#e7e5e4`, card border `#eceae8`, accent `oklch(0.55 0.17 255)`; fonts `Space Grotesk` (UI) and `IBM Plex Mono` (mono/numeric).
- **No personal data** anywhere in this plan (no scores writing, no IP handling — that's Plan 3).
- Commit after every task with a `feat:`/`test:`/`chore:` prefixed message.

---

## File structure (created across this plan)

```
.nvmrc
package.json
tsconfig.json
astro.config.mjs
vitest.config.ts
scripts/
  build-ral.mjs               # one-time: CSV -> src/data/ral-classic.json
src/
  content/
    config.ts                 # Zod schema for the `os` collection
    os/*.json                 # one file per platform (seed data)
  data/
    ral-classic.json          # vendored full RAL Classic table (216 entries)
  lib/
    color.ts                  # hex/rgb/hsl, OKLab, families, tone, shade, closest-RAL, on-color, formatScore
    color.test.ts
    ral.ts                    # loads the vendored full RAL Classic table
    ral.test.ts               # validates the vendored dataset (count + anchors)
    scores.ts                 # Scores type, parseScores, loadScores (build-time fs)
    scores.test.ts
    derive.ts                 # mergeColorsByHex, similarColors, eraPeers, firstKnownUse
    derive.test.ts
    catalog.ts                # buildCatalog(entries, scores) -> Catalog (+ referential checks)
    catalog.test.ts
    loadCatalog.ts            # thin Astro-side wrapper: getCollection + loadScores + buildCatalog
  styles/
    tokens.css
  layouts/
    Base.astro                # <html> shell: tokens, fonts, Header
  components/
    Header.astro              # nav bar (shared)
  islands/
    BrowseControls.tsx        # Preact: search + card/list toggle + sort, renders results
    BrowseControls.test.tsx
  pages/
    index.astro               # Browse page
```

---

### Task 1: Scaffold Astro + Preact + Vitest

**Files:**
- Create: `.nvmrc`, `package.json`, `tsconfig.json`, `astro.config.mjs`, `vitest.config.ts`
- Create: `src/lib/smoke.test.ts` (temporary, deleted at end of task)

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable Astro+Preact project and a runnable `npm test` (Vitest).

- [ ] **Step 1: Create `.nvmrc`**

```
20
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "desktopcolors",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "astro": "^4.15.0",
    "@astrojs/preact": "^3.5.0",
    "preact": "^10.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@testing-library/preact": "^3.2.4",
    "jsdom": "^24.1.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["astro/client"],
    "verbatimModuleSyntax": false
  },
  "include": ["src", "*.ts", "*.mjs"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4: Create `astro.config.mjs`**

```js
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

export default defineConfig({
  site: "https://desktopcolors.com",
  integrations: [preact()],
});
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 6: Create a temporary smoke test `src/lib/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and run the smoke test**

Run: `npm install && npm test`
Expected: Vitest reports 1 passing test.

- [ ] **Step 8: Delete the smoke test and commit**

```bash
rm src/lib/smoke.test.ts
git add -A
git commit -m "chore: scaffold Astro + Preact + Vitest project"
```

---

### Task 2: Vendor the full RAL Classic table (data + loader + validation)

**Files:**
- Create: `scripts/build-ral.mjs` (one-time generator)
- Create: `src/data/ral-classic.json` (generated output, committed to the repo)
- Create: `src/lib/ral.ts`
- Test: `src/lib/ral.test.ts`

**Interfaces:**
- Consumes: nothing at runtime (the JSON is vendored/committed; no network access at build or runtime).
- Produces: `export interface RalColor { code: string; name: string; hex: string }` and `export const RAL_CLASSIC: RalColor[]` (the full 216-entry table, read by `color.ts`).

**Why vendored, not hand-typed:** the full RAL Classic set is 216 colors; transcribing hexes by hand is error-prone. We generate the JSON once from an authoritative CSV and commit it, so builds are offline and reproducible.

**Source:** lunohodov gist `1995178`, file `ral_classic.csv`.
Raw URL: `https://gist.githubusercontent.com/lunohodov/1995178/raw/ral_classic.csv`
Columns: `RAL,RGB,HEX,CMYK,LRV,English,German,French,Spanish,Italian,Dutch` — we use `RAL` (code), `HEX`, and `English` (name).

- [ ] **Step 1: Create the generator `scripts/build-ral.mjs`**

```js
// Usage: node scripts/build-ral.mjs <path-to-ral_classic.csv>
// Writes src/data/ral-classic.json as [{ code, name, hex }] with lowercased hex.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) { console.error("pass the CSV path"); process.exit(1); }

const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
const header = lines[0].split(",");
const iCode = header.indexOf("RAL");
const iHex = header.indexOf("HEX");
const iName = header.indexOf("English");
if (iCode < 0 || iHex < 0 || iName < 0) {
  console.error("unexpected CSV header:", lines[0]); process.exit(1);
}

const out = lines.slice(1).map((line) => {
  const f = line.split(",");
  return { code: f[iCode].trim(), name: f[iName].trim(), hex: f[iHex].trim().toLowerCase() };
}).filter((r) => /^#[0-9a-f]{6}$/.test(r.hex) && r.code && r.name);

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/ral-classic.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} RAL colors`);
```

- [ ] **Step 2: Download the CSV and generate the JSON**

Run:
```bash
curl -fsSL "https://gist.githubusercontent.com/lunohodov/1995178/raw/ral_classic.csv" -o /tmp/ral_classic.csv
node scripts/build-ral.mjs /tmp/ral_classic.csv
```
Expected: prints `wrote 216 RAL colors` and creates `src/data/ral-classic.json`. Spot-check: it contains `"code": "RAL 9005"` with `"hex": "#0e0e10"`.

- [ ] **Step 3: Create `src/lib/ral.ts`**

```ts
import ralData from "../data/ral-classic.json";

export interface RalColor {
  code: string;
  name: string;
  hex: string;
}

export const RAL_CLASSIC: RalColor[] = ralData as RalColor[];
```

- [ ] **Step 4: Write the validation test `src/lib/ral.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { RAL_CLASSIC } from "./ral";

describe("RAL_CLASSIC dataset", () => {
  it("has the full classic set", () => {
    expect(RAL_CLASSIC.length).toBe(216);
  });

  it("every entry is well-formed", () => {
    for (const r of RAL_CLASSIC) {
      expect(r.code).toMatch(/^RAL \d{4}$/);
      expect(r.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(r.name.length).toBeGreaterThan(0);
    }
  });

  it("matches known anchor colors", () => {
    const by = (code: string) => RAL_CLASSIC.find((r) => r.code === code);
    expect(by("RAL 9005")?.hex).toBe("#0e0e10");
    expect(by("RAL 5015")?.hex).toBe("#007caf");
    expect(by("RAL 6027")?.hex).toBe("#7ebab5");
    expect(by("RAL 1023")?.hex).toBe("#f7b500");
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/lib/ral.test.ts`
Expected: PASS (216 entries, anchors match).

- [ ] **Step 6: Enable JSON imports in TypeScript (if not already)**

Ensure `tsconfig.json` `compilerOptions` includes `"resolveJsonModule": true`. Astro's strict base config sets this, but add it explicitly if the test or `astro check` complains.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-ral.mjs src/data/ral-classic.json src/lib/ral.ts src/lib/ral.test.ts tsconfig.json
git commit -m "feat: vendor full RAL Classic table with validation"
```

---

### Task 3: Color library (TDD)

**Files:**
- Create: `src/lib/color.ts`
- Test: `src/lib/color.test.ts`

**Interfaces:**
- Consumes: `RAL_CLASSIC`, `RalColor` from `./ral`.
- Produces:
  - `hexToRgb(hex: string): [number, number, number]`
  - `rgbToHsl(r: number, g: number, b: number): [number, number, number]` — h in 0–360, s/l in 0–100 (rounded)
  - `hexToHsl(hex: string): [number, number, number]`
  - `onColor(hex: string): "#1c1917" | "#ffffff"`
  - `rgbDistance(a: [number, number, number], b: [number, number, number]): number`
  - `hexToOklab(hex: string): [number, number, number]` — perceptual L/a/b (Björn Ottosson's sRGB→OKLab)
  - `oklabDistance(a: [number, number, number], b: [number, number, number]): number` — Euclidean over OKLab
  - `type FamilyKey = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "neutral"`
  - `hueFamily(h: number, s: number): FamilyKey`
  - `type ToneKey = "neon" | "bright" | "pastel" | "muted" | "dark"`
  - `tone(h: number, s: number, l: number): ToneKey`
  - `type ShadeKey = "deep" | "mid" | "light" | "pale"`
  - `shade(l: number): ShadeKey`
  - `closestRal(hex: string): RalColor` — nearest of the 216 RAL colors by **OKLab** distance
  - `formatScore(points: number): string`

- [ ] **Step 1: Write the failing test `src/lib/color.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHsl, hexToHsl, onColor, rgbDistance,
  hexToOklab, oklabDistance, hueFamily, tone, shade, closestRal, formatScore,
} from "./color";

describe("hexToRgb", () => {
  it("parses lowercase and uppercase hex", () => {
    expect(hexToRgb("#008080")).toEqual([0, 128, 128]);
    expect(hexToRgb("#FF00FF")).toEqual([255, 0, 255]);
  });
});

describe("rgbToHsl", () => {
  it("computes teal", () => {
    expect(rgbToHsl(0, 128, 128)).toEqual([180, 100, 25]);
  });
  it("computes a neutral gray as 0 saturation", () => {
    const [, s] = rgbToHsl(128, 128, 128);
    expect(s).toBe(0);
  });
});

describe("hexToHsl", () => {
  it("chains hex -> rgb -> hsl", () => {
    expect(hexToHsl("#008080")).toEqual([180, 100, 25]);
  });
});

describe("onColor", () => {
  it("returns dark ink over a light color", () => {
    expect(onColor("#ece9d8")).toBe("#1c1917");
  });
  it("returns white over a dark color", () => {
    expect(onColor("#000080")).toBe("#ffffff");
  });
});

describe("rgbDistance", () => {
  it("is zero for identical colors", () => {
    expect(rgbDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it("is euclidean", () => {
    expect(rgbDistance([0, 0, 0], [0, 3, 4])).toBe(5);
  });
});

describe("hexToOklab / oklabDistance", () => {
  it("maps black to L≈0 and white to L≈1", () => {
    const [lb] = hexToOklab("#000000");
    const [lw] = hexToOklab("#ffffff");
    expect(lb).toBeCloseTo(0, 3);
    expect(lw).toBeCloseTo(1, 2);
  });
  it("is zero for identical colors and positive otherwise", () => {
    expect(oklabDistance(hexToOklab("#008080"), hexToOklab("#008080"))).toBe(0);
    expect(oklabDistance(hexToOklab("#000000"), hexToOklab("#ffffff"))).toBeGreaterThan(0.9);
  });
});

describe("hueFamily", () => {
  it("classifies low saturation as neutral", () => {
    expect(hueFamily(200, 5)).toBe("neutral");
  });
  it("classifies teal hue", () => {
    expect(hueFamily(180, 100)).toBe("teal");
  });
  it("wraps reds past 345", () => {
    expect(hueFamily(350, 80)).toBe("red");
  });
  it("classifies blue", () => {
    expect(hueFamily(215, 50)).toBe("blue");
  });
});

describe("tone", () => {
  it("classifies very dark as dark", () => {
    expect(tone(240, 100, 25)).toBe("dark");
  });
  it("classifies high-sat mid-light as neon", () => {
    expect(tone(180, 90, 55)).toBe("neon");
  });
  it("classifies light low-sat as pastel", () => {
    expect(tone(240, 40, 80)).toBe("pastel");
  });
});

describe("shade", () => {
  it("buckets lightness", () => {
    expect(shade(20)).toBe("deep");
    expect(shade(40)).toBe("mid");
    expect(shade(60)).toBe("light");
    expect(shade(90)).toBe("pale");
  });
});

describe("closestRal", () => {
  it("matches a near-black to Jet black (RAL 9005)", () => {
    expect(closestRal("#050505").code).toBe("RAL 9005");
  });
  it("matches a near-traffic-yellow to RAL 1023", () => {
    expect(closestRal("#f7b400").code).toBe("RAL 1023");
  });
});

describe("formatScore", () => {
  it("shows < 1k below 1000", () => {
    expect(formatScore(0)).toBe("< 1k");
    expect(formatScore(999)).toBe("< 1k");
  });
  it("formats thousands with one decimal, trimming .0", () => {
    expect(formatScore(1000)).toBe("1k");
    expect(formatScore(1200)).toBe("1.2k");
    expect(formatScore(48200)).toBe("48.2k");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/color.test.ts`
Expected: FAIL — `color.ts` does not exist / exports undefined.

- [ ] **Step 3: Implement `src/lib/color.ts`**

```ts
import { RAL_CLASSIC, type RalColor } from "./ral";

export type FamilyKey =
  | "red" | "orange" | "yellow" | "green" | "teal"
  | "blue" | "purple" | "pink" | "neutral";

export type ToneKey = "neon" | "bright" | "pastel" | "muted" | "dark";

export type ShadeKey = "deep" | "mid" | "light" | "pale";

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function onColor(hex: string): "#1c1917" | "#ffffff" {
  const [, , l] = hexToHsl(hex);
  return l > 55 ? "#1c1917" : "#ffffff";
}

export function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

// Björn Ottosson's sRGB -> OKLab transform.
export function hexToOklab(hex: string): [number, number, number] {
  const [r8, g8, b8] = hexToRgb(hex);
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

export function oklabDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export function hueFamily(h: number, s: number): FamilyKey {
  if (s < 12) return "neutral";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

export function tone(h: number, s: number, l: number): ToneKey {
  if (l < 30) return "dark";
  if (s >= 78 && l >= 42 && l <= 72) return "neon";
  if (l >= 70 && s <= 65) return "pastel";
  if (s >= 42) return "bright";
  return "muted";
}

export function shade(l: number): ShadeKey {
  if (l < 32) return "deep";
  if (l < 55) return "mid";
  if (l < 80) return "light";
  return "pale";
}

export function closestRal(hex: string): RalColor {
  const target = hexToOklab(hex);
  let best = RAL_CLASSIC[0];
  let bestD = Infinity;
  for (const ral of RAL_CLASSIC) {
    const d = oklabDistance(target, hexToOklab(ral.hex));
    if (d < bestD) { bestD = d; best = ral; }
  }
  return best;
}

export function formatScore(points: number): string {
  if (points < 1000) return "< 1k";
  const k = points / 1000;
  return `${k.toFixed(1).replace(/\.0$/, "")}k`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/color.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/color.ts src/lib/color.test.ts
git commit -m "feat: add color math, classification, RAL matching, score formatting"
```

---

### Task 4: Scores library (TDD)

**Files:**
- Create: `src/lib/scores.ts`
- Test: `src/lib/scores.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Scores { colors: Record<string, number>; os: Record<string, number> }`
  - `parseScores(raw: unknown): Scores` — tolerant parser; unknown/invalid shape → `{ colors: {}, os: {} }`; hex keys lowercased.
  - `loadScores(path?: string): Scores` — reads a JSON file with `node:fs` at build time; missing file → empty scores (warns to stderr). Default path `scores.json` in cwd.
  - `colorScore(scores: Scores, hex: string): number` — lookup by lowercased hex, default 0.
  - `osScore(scores: Scores, slug: string): number` — default 0.

- [ ] **Step 1: Write the failing test `src/lib/scores.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseScores, colorScore, osScore } from "./scores";

describe("parseScores", () => {
  it("returns empty scores for garbage", () => {
    expect(parseScores(null)).toEqual({ colors: {}, os: {} });
    expect(parseScores(42)).toEqual({ colors: {}, os: {} });
    expect(parseScores({})).toEqual({ colors: {}, os: {} });
  });
  it("lowercases hex keys and keeps integers", () => {
    const s = parseScores({ colors: { "#00FF00": 1200 }, os: { "windows-95": 30 } });
    expect(s.colors["#00ff00"]).toBe(1200);
    expect(s.os["windows-95"]).toBe(30);
  });
  it("drops non-numeric values", () => {
    const s = parseScores({ colors: { "#abc": "x" }, os: {} });
    expect(s.colors).toEqual({});
  });
});

describe("colorScore / osScore", () => {
  const s = parseScores({ colors: { "#008080": 48200 }, os: { "windows-95": 51000 } });
  it("looks up case-insensitively with 0 default", () => {
    expect(colorScore(s, "#008080")).toBe(48200);
    expect(colorScore(s, "#008080".toUpperCase())).toBe(48200);
    expect(colorScore(s, "#ffffff")).toBe(0);
    expect(osScore(s, "windows-95")).toBe(51000);
    expect(osScore(s, "beos")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/scores.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/scores.ts`**

```ts
import { readFileSync } from "node:fs";

export interface Scores {
  colors: Record<string, number>;
  os: Record<string, number>;
}

function parseBucket(raw: unknown, lowerKeys: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[lowerKeys ? k.toLowerCase() : k] = v;
      }
    }
  }
  return out;
}

export function parseScores(raw: unknown): Scores {
  if (!raw || typeof raw !== "object") return { colors: {}, os: {} };
  const obj = raw as Record<string, unknown>;
  return { colors: parseBucket(obj.colors, true), os: parseBucket(obj.os, false) };
}

export function loadScores(path = "scores.json"): Scores {
  try {
    return parseScores(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    console.warn(`[scores] ${path} not found or invalid — defaulting all scores to 0`);
    return { colors: {}, os: {} };
  }
}

export function colorScore(scores: Scores, hex: string): number {
  return scores.colors[hex.toLowerCase()] ?? 0;
}

export function osScore(scores: Scores, slug: string): number {
  return scores.os[slug] ?? 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/scores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scores.ts src/lib/scores.test.ts
git commit -m "feat: add scores parsing/loading with 0 defaults"
```

---

### Task 5: Content schema + seed OS data

**Files:**
- Create: `src/content/config.ts`
- Create: `src/content/os/*.json` (one per platform — see the data appendix at the end of this task)

**Interfaces:**
- Consumes: nothing (Astro `astro:content` provides `defineCollection`, `z`).
- Produces:
  - The `os` content collection and its Zod schema.
  - `export type OsColor` and `export type OsInput` (the inferred entry shape) for use by `catalog.ts`:
    - `OsColor = { hex: string; name: string; index: string; note: string; default: boolean }`
    - `OsInput = { name: string; slug?: string; year: number; family: string; tagline: string; description: string; predecessor?: string; successor?: string; desktopStyle: DesktopStyle; colors: OsColor[] }`
    - `DesktopStyle = "win9x" | "macos8" | "kde" | "cde" | "amiga" | "generic"`

- [ ] **Step 1: Create `src/content/config.ts`**

```ts
import { defineCollection, z } from "astro:content";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");

const desktopStyle = z.enum(["win9x", "macos8", "kde", "cde", "amiga", "generic"]);
export type DesktopStyle = z.infer<typeof desktopStyle>;

const osColor = z.object({
  hex,
  name: z.string().min(1),
  index: z.string().default("—"),
  note: z.string().default(""),
  default: z.boolean().default(false),
});
export type OsColor = z.infer<typeof osColor>;

const osSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.number().int(),
  family: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  predecessor: z.string().optional(),
  successor: z.string().optional(),
  desktopStyle: desktopStyle.default("generic"),
  colors: z.array(osColor).min(1)
    .refine((cs) => cs.filter((c) => c.default).length <= 1, {
      message: "at most one color may be marked default",
    }),
});
export type OsInput = z.infer<typeof osSchema>;

export const collections = {
  os: defineCollection({ type: "data", schema: osSchema }),
};
```

- [ ] **Step 2: Create the seed JSON files**

Create one file per platform under `src/content/os/`, named `<slug>.json`. Two complete examples follow; create the rest from the **Data appendix** table at the end of this task, using the identical field structure. `index` may be omitted (defaults to `—`) for platforms without VGA palette indices; `note` may be omitted where the appendix leaves it blank.

`src/content/os/windows-95.json`:

```json
{
  "name": "Windows 95",
  "year": 1995,
  "family": "Windows",
  "tagline": "Teal defined the era — the first face millions saw at boot.",
  "description": "The operating system that put a solid teal desktop in front of millions. Windows 95 let you pick any of the 16 VGA palette colors as your background — but teal was the face of the era.",
  "predecessor": "windows-3-1",
  "successor": "windows-98",
  "desktopStyle": "win9x",
  "colors": [
    { "hex": "#008080", "name": "Teal", "index": "3", "note": "The signature default background of Windows 95.", "default": true },
    { "hex": "#808080", "name": "Gray", "index": "8", "note": "A neutral, low-distraction desktop." },
    { "hex": "#000080", "name": "Navy", "index": "1", "note": "Deep cool blue, a common corporate choice." },
    { "hex": "#808000", "name": "Olive", "index": "3", "note": "Muted warm green-yellow." },
    { "hex": "#800080", "name": "Purple", "index": "5", "note": "Bold and saturated." },
    { "hex": "#800000", "name": "Maroon", "index": "4", "note": "Warm dark red." },
    { "hex": "#c0c0c0", "name": "Silver", "index": "7", "note": "Light gray, matches the UI chrome." },
    { "hex": "#00ffff", "name": "Cyan", "index": "11", "note": "Bright, high-energy." },
    { "hex": "#00ff00", "name": "Lime", "index": "10", "note": "Vivid pure green." },
    { "hex": "#ff00ff", "name": "Fuchsia", "index": "13", "note": "Vivid magenta." },
    { "hex": "#ffff00", "name": "Yellow", "index": "14", "note": "Bright and warm." },
    { "hex": "#0000ff", "name": "Blue", "index": "9", "note": "Pure primary blue." },
    { "hex": "#ff0000", "name": "Red", "index": "12", "note": "Pure primary red." },
    { "hex": "#008000", "name": "Green", "index": "2", "note": "Deep, calm green." }
  ]
}
```

`src/content/os/amiga-workbench.json`:

```json
{
  "name": "Amiga Workbench",
  "year": 1985,
  "family": "Amiga",
  "tagline": "Four-color glory: the unmistakable Workbench palette.",
  "description": "The Amiga Workbench desktop shipped with an iconic four-color palette. Its blue-and-orange look is instantly recognizable to a generation of computer users.",
  "desktopStyle": "amiga",
  "colors": [
    { "hex": "#0055aa", "name": "Workbench Blue", "index": "0", "note": "The iconic default background.", "default": true },
    { "hex": "#a0a0a0", "name": "Gray", "index": "1", "note": "Workbench 2.0 and later." },
    { "hex": "#ffffff", "name": "White", "index": "2", "note": "Text and UI." },
    { "hex": "#000000", "name": "Black", "index": "3", "note": "Detail and outlines." },
    { "hex": "#ff8800", "name": "Orange", "note": "Signature accent." }
  ]
}
```

- [ ] **Step 3: Write a schema/validation test `src/content/os.test.ts`**

This test reads every JSON file directly (independent of Astro's runtime) and validates it against the same rules, plus the cross-file referential checks that Zod cannot express per-item.

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const osColor = z.object({
  hex,
  name: z.string().min(1),
  index: z.string().optional(),
  note: z.string().optional(),
  default: z.boolean().optional(),
});
const osSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.number().int(),
  family: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  predecessor: z.string().optional(),
  successor: z.string().optional(),
  desktopStyle: z.enum(["win9x", "macos8", "kde", "cde", "amiga", "generic"]).optional(),
  colors: z.array(osColor).min(1),
});

const dir = "src/content/os";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const slugOf = (f: string) => f.replace(/\.json$/, "");

describe("os content files", () => {
  it("has at least the seeded platforms", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  const parsed = files.map((f) => ({
    slug: slugOf(f),
    data: osSchema.parse(JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))),
  }));

  it.each(parsed)("$slug passes the schema and has <=1 default", ({ data }) => {
    expect(data.colors.filter((c) => c.default).length).toBeLessThanOrEqual(1);
  });

  it("resolves every predecessor/successor slug", () => {
    const slugs = new Set(parsed.map((p) => p.data.slug ?? p.slug));
    for (const { slug, data } of parsed) {
      if (data.predecessor) expect(slugs, `${slug}.predecessor`).toContain(data.predecessor);
      if (data.successor) expect(slugs, `${slug}.successor`).toContain(data.successor);
    }
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/content/os.test.ts`
Expected: FAIL until all 12 files exist (the `>= 12` assertion and reference checks). Create every file from the Data appendix, then re-run.

- [ ] **Step 5: Re-run until green, then verify Astro can load the collection**

Run: `npx vitest run src/content/os.test.ts && npx astro sync`
Expected: test PASS; `astro sync` completes with no schema errors and generates `.astro/` types.

- [ ] **Step 6: Commit**

```bash
git add src/content astro.config.mjs
git commit -m "feat: add OS content collection schema and seed platform data"
```

#### Data appendix — all seed platforms

Create one file per row (`<slug>.json`). Windows 95 and Amiga Workbench are written out in full above; the rest follow the same structure. Mark the first-listed color of each platform `"default": true`. Use `desktopStyle` per the last column. `predecessor`/`successor` are slugs; include only those listed.

| slug | name | year | family | desktopStyle | pred → succ | colors (hex · name · [index]) — first = default |
|---|---|---|---|---|---|---|
| `windows-3-1` | Windows 3.1 | 1992 | Windows | `win9x` | → `windows-95` | `#008080` Teal ·3 · **default**; `#000080` Navy ·1; `#808080` Gray ·8; `#c0c0c0` Silver ·7 |
| `windows-95` | *(written above)* | | | | | |
| `windows-nt-4-0` | Windows NT 4.0 | 1996 | Windows | `win9x` | — | `#3a6ea5` NT Blue · **default** (note "The workstation blue that ran the late-90s office."); `#008080` Teal ·3; `#4f6070` Slate; `#000080` Navy ·1 |
| `windows-98` | Windows 98 | 1998 | Windows | `win9x` | `windows-95` → `windows-2000` | `#3a6ea5` Classic Blue · **default**; `#008080` Teal ·3; `#c0c0c0` Silver ·7 |
| `windows-2000` | Windows 2000 | 2000 | Windows | `win9x` | `windows-98` → `windows-xp` | `#3a6ea5` Classic Blue · **default**; `#008080` Teal ·3; `#808080` Gray ·8; `#5a7ea5` Steel |
| `windows-xp` | Windows XP | 2001 | Windows | `win9x` | `windows-2000` → | `#004e98` XP Blue · **default** (note "The solid blue that sat quietly behind Bliss."); `#ece9d8` Silver (note "Luna neutral"); `#7ba05b` Olive Green (note "Homestead"); `#9b2915` Brick |
| `amiga-workbench` | *(written above)* | | | | | |
| `cde` | CDE | 1993 | Desktop Env. | `cde` | — | `#9aabb9` Dusty Blue · **default** (note "The Common Desktop Environment — Unix's dusty-blue standard."); `#6e7e96` Blue-Gray; `#6e968e` Teal; `#4e6e8e` Steel |
| `beos` | BeOS | 1995 | BeOS | `generic` | — | `#33aabb` Cyan · **default** (note "The Be Operating System's bright cyan desktop."); `#dedede` Light Gray |
| `mac-os-8` | Mac OS 8 | 1997 | Mac OS | `macos8` | — | `#9999cc` Lavender · **default** (note "Platinum-era Mac OS in soft lavender."); `#666699` Blue Gray; `#cccccc` Platinum |
| `kde-1` | KDE 1 | 1998 | Desktop Env. | `kde` | → `kde-2` | `#4e9a9a` Teal · **default** (note "Linux's first cohesive desktop, in cool understated tones."); `#4e6f8e` Blue; `#4e9a6f` Green |
| `kde-2` | KDE 2 | 2000 | Desktop Env. | `kde` | `kde-1` → | `#5a7ea5` Blue · **default** (note "The Konqueror era — deeper, more confident blues."); `#47617e` Slate; `#4e9a9a` Teal |

For each platform, write a one-sentence `tagline` and a 1–2 sentence `description` in the voice of the examples above (the taglines in this table's notes may be reused as the tagline; the description expands on it). Every color object needs at least `hex` and `name`; add `index` and `note` where given.

---

### Task 6: Derivation library (TDD)

**Files:**
- Create: `src/lib/derive.ts`
- Test: `src/lib/derive.test.ts`

**Interfaces:**
- Consumes: `hexToOklab`, `oklabDistance`, `hueFamily`, `hexToHsl` from `./color`; `OsInput`, `OsColor` from `../content/config`.
- Produces (all pure; each takes already-parsed OS entries):
  - `type OsEntry = { slug: string; data: OsInput }`
  - `defaultColor(data: OsInput): OsColor` — the `default:true` color, else `colors[0]`.
  - `interface MergedColor { hex: string; name: string; platforms: { slug: string; name: string; year: number }[]; yearRange: string; family: FamilyKey }`
  - `mergeColorsByHex(entries: OsEntry[]): MergedColor[]` — grouped by lowercased hex; `name` prefers a default-color name, else the most common; `yearRange` is `"1995"` or `"1993–2001"`.
  - `interface SimilarColor { hex: string; name: string; osSlug: string; osName: string; distance: number; match: number }`
  - `similarColors(hex: string, entries: OsEntry[], excludeSlug: string, limit: number): SimilarColor[]` — nearest colors from other platforms by **OKLab** distance; `match = max(0, round(100 * (1 - distance / 0.4)))` (0.4 ≈ a large OKLab distance, so an exact match reads 100% and very different colors read ~0%).
  - `interface EraPeer { slug: string; name: string; family: string; year: number; hex: string; colorName: string; rel: string }`
  - `eraPeers(entry: OsEntry, entries: OsEntry[], windowYears: number): EraPeer[]` — other platforms within ±window years, each with its default color; `rel` is `"same year"`, `"2 yr earlier"`, `"1 yr later"`, sorted by year.
  - `interface FirstUse { slug: string; name: string; year: number }`
  - `firstKnownUse(hex: string, entries: OsEntry[]): FirstUse` — earliest platform (by year) shipping the exact hex; ties broken by slug; a hex always appears in ≥1 platform by construction.

- [ ] **Step 1: Write the failing test `src/lib/derive.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  defaultColor, mergeColorsByHex, similarColors, eraPeers, firstKnownUse,
  type OsEntry,
} from "./derive";
import type { OsInput } from "../content/config";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", colors: over.colors, ...over,
});

const entries: OsEntry[] = [
  { slug: "win-95", data: os({ name: "Windows 95", year: 1995, colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "", default: true },
    { hex: "#000080", name: "Navy", index: "1", note: "", default: false },
  ] }) },
  { slug: "cde", data: os({ name: "CDE", year: 1993, colors: [
    { hex: "#9aabb9", name: "Dusty Blue", index: "—", note: "", default: true },
    { hex: "#008080", name: "Teal", index: "—", note: "", default: false },
  ] }) },
  { slug: "kde-2", data: os({ name: "KDE 2", year: 2000, colors: [
    { hex: "#5a7ea5", name: "Blue", index: "—", note: "", default: true },
  ] }) },
];

describe("defaultColor", () => {
  it("returns the default-flagged color", () => {
    expect(defaultColor(entries[0].data).name).toBe("Teal");
  });
  it("falls back to the first color", () => {
    const d = os({ colors: [{ hex: "#111111", name: "A", index: "—", note: "", default: false }] });
    expect(defaultColor(d).name).toBe("A");
  });
});

describe("mergeColorsByHex", () => {
  const merged = mergeColorsByHex(entries);
  it("groups the shared teal across platforms", () => {
    const teal = merged.find((m) => m.hex === "#008080")!;
    expect(teal.platforms.map((p) => p.slug).sort()).toEqual(["cde", "win-95"]);
    expect(teal.yearRange).toBe("1993–1995");
  });
  it("uses a single year when the range collapses", () => {
    const blue = merged.find((m) => m.hex === "#5a7ea5")!;
    expect(blue.yearRange).toBe("2000");
  });
});

describe("similarColors", () => {
  it("excludes the source platform and ranks by distance", () => {
    const sims = similarColors("#008080", entries, "win-95", 5);
    expect(sims.every((s) => s.osSlug !== "win-95")).toBe(true);
    expect(sims[0].osSlug).toBe("cde"); // exact teal match in CDE
    expect(sims[0].match).toBe(100);
  });
});

describe("eraPeers", () => {
  it("returns platforms within the window, excluding self", () => {
    const peers = eraPeers(entries[0], entries, 3); // Windows 95 (1995), window 3 -> 1992..1998
    expect(peers.map((p) => p.slug)).toContain("cde");
    expect(peers.some((p) => p.slug === "win-95")).toBe(false);
  });
  it("labels relative years", () => {
    const peers = eraPeers(entries[0], entries, 3);
    const cde = peers.find((p) => p.slug === "cde")!;
    expect(cde.rel).toBe("2 yr earlier");
  });
});

describe("firstKnownUse", () => {
  it("finds the earliest platform shipping the hex", () => {
    expect(firstKnownUse("#008080", entries).slug).toBe("cde"); // 1993 < 1995
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/derive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/derive.ts`**

```ts
import {
  hexToOklab, oklabDistance, hueFamily, hexToHsl, type FamilyKey,
} from "./color";
import type { OsInput, OsColor } from "../content/config";

export interface OsEntry {
  slug: string;
  data: OsInput;
}

export function defaultColor(data: OsInput): OsColor {
  return data.colors.find((c) => c.default) ?? data.colors[0];
}

export interface MergedColor {
  hex: string;
  name: string;
  platforms: { slug: string; name: string; year: number }[];
  yearRange: string;
  family: FamilyKey;
}

export function mergeColorsByHex(entries: OsEntry[]): MergedColor[] {
  interface Acc {
    hex: string;
    names: Map<string, number>;
    defaultName: string | null;
    platforms: { slug: string; name: string; year: number }[];
  }
  const map = new Map<string, Acc>();
  for (const { slug, data } of entries) {
    for (const c of data.colors) {
      const key = c.hex.toLowerCase();
      let acc = map.get(key);
      if (!acc) {
        acc = { hex: key, names: new Map(), defaultName: null, platforms: [] };
        map.set(key, acc);
      }
      acc.names.set(c.name, (acc.names.get(c.name) ?? 0) + 1);
      if (c.default) acc.defaultName = c.name;
      acc.platforms.push({ slug, name: data.name, year: data.year });
    }
  }
  const out: MergedColor[] = [];
  for (const acc of map.values()) {
    const name = acc.defaultName ??
      [...acc.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const years = acc.platforms.map((p) => p.year).sort((a, b) => a - b);
    const lo = years[0], hi = years[years.length - 1];
    const yearRange = lo === hi ? `${lo}` : `${lo}–${hi}`;
    const [h, s] = hexToHsl(acc.hex);
    out.push({ hex: acc.hex, name, platforms: acc.platforms, yearRange, family: hueFamily(h, s) });
  }
  return out;
}

export interface SimilarColor {
  hex: string;
  name: string;
  osSlug: string;
  osName: string;
  distance: number;
  match: number;
}

export function similarColors(
  hex: string, entries: OsEntry[], excludeSlug: string, limit: number,
): SimilarColor[] {
  const target = hexToOklab(hex);
  const all: SimilarColor[] = [];
  for (const { slug, data } of entries) {
    if (slug === excludeSlug) continue;
    for (const c of data.colors) {
      const distance = oklabDistance(target, hexToOklab(c.hex));
      all.push({
        hex: c.hex.toLowerCase(), name: c.name, osSlug: slug, osName: data.name,
        distance, match: Math.max(0, Math.round(100 * (1 - distance / 0.4))),
      });
    }
  }
  all.sort((a, b) => a.distance - b.distance);
  return all.slice(0, limit);
}

export interface EraPeer {
  slug: string;
  name: string;
  family: string;
  year: number;
  hex: string;
  colorName: string;
  rel: string;
}

export function eraPeers(entry: OsEntry, entries: OsEntry[], windowYears: number): EraPeer[] {
  const base = entry.data.year;
  return entries
    .filter((e) => e.slug !== entry.slug && Math.abs(e.data.year - base) <= windowYears)
    .map((e) => {
      const dy = e.data.year - base;
      const rel = dy === 0
        ? "same year"
        : `${Math.abs(dy)} yr ${dy < 0 ? "earlier" : "later"}`;
      const def = defaultColor(e.data);
      return {
        slug: e.slug, name: e.data.name, family: e.data.family, year: e.data.year,
        hex: def.hex.toLowerCase(), colorName: def.name, rel,
      };
    })
    .sort((a, b) => a.year - b.year);
}

export interface FirstUse {
  slug: string;
  name: string;
  year: number;
}

export function firstKnownUse(hex: string, entries: OsEntry[]): FirstUse {
  const key = hex.toLowerCase();
  const uses = entries
    .filter((e) => e.data.colors.some((c) => c.hex.toLowerCase() === key))
    .sort((a, b) => a.data.year - b.data.year || a.slug.localeCompare(b.slug));
  const first = uses[0];
  return { slug: first.slug, name: first.data.name, year: first.data.year };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/derive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/derive.ts src/lib/derive.test.ts
git commit -m "feat: add cross-platform derivation (merge, similar, era, first-use)"
```

---

### Task 7: Catalog builder (TDD)

**Files:**
- Create: `src/lib/catalog.ts`
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: everything from `./color`, `./derive`, `./scores`; `OsInput`, `OsColor` from `../content/config`.
- Produces the view models the pages render, with scores baked in:
  - `interface ColorView { hex: string; name: string; index: string; note: string; isDefault: boolean; rgb: string; hsl: string; onColor: string; family: FamilyKey; tone: ToneKey; shade: ShadeKey; score: number; scoreLabel: string }`
  - `interface OsRef { slug: string; name: string; year: number }`
  - `interface OsView { slug: string; name: string; year: number; family: string; tagline: string; description: string; desktopStyle: DesktopStyle; colors: ColorView[]; defaultHex: string; colorCount: number; score: number; scoreLabel: string; predecessor: OsRef | null; successor: OsRef | null }`
  - `interface MergedColorView extends MergedColor { onColor: string; tone: ToneKey; shade: ShadeKey; score: number; scoreLabel: string; primarySlug: string }`
  - `interface Catalog { osList: OsView[]; bySlug: Map<string, OsView>; colors: MergedColorView[] }`
  - `buildCatalog(entries: OsEntry[], scores: Scores): Catalog` — assembles all of the above; throws `Error` if any `predecessor`/`successor` slug does not resolve (referential integrity enforced here, since Zod can't).
- Notes: `rgb` formatted `"0, 128, 128"`; `hsl` formatted `"180° 100% 25%"`. `osList` preserves input order (file order); pages apply their own sorting. `primarySlug` on a merged color is its first platform's slug (used to build detail links in later plans).

- [ ] **Step 1: Write the failing test `src/lib/catalog.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildCatalog } from "./catalog";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import { parseScores } from "./scores";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", colors: over.colors, ...over,
});

const entries: OsEntry[] = [
  { slug: "windows-95", data: os({ name: "Windows 95", year: 1995, successor: "windows-98", colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "n", default: true },
    { hex: "#000080", name: "Navy", index: "1", note: "", default: false },
  ] }) },
  { slug: "windows-98", data: os({ name: "Windows 98", year: 1998, predecessor: "windows-95", colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "", default: true },
  ] }) },
];

const scores = parseScores({ colors: { "#008080": 48200 }, os: { "windows-95": 900 } });

describe("buildCatalog", () => {
  const cat = buildCatalog(entries, scores);

  it("bakes color scores and formats them", () => {
    const teal = cat.bySlug.get("windows-95")!.colors[0];
    expect(teal.score).toBe(48200);
    expect(teal.scoreLabel).toBe("48.2k");
  });

  it("formats os scores below 1k", () => {
    const w95 = cat.bySlug.get("windows-95")!;
    expect(w95.score).toBe(900);
    expect(w95.scoreLabel).toBe("< 1k");
  });

  it("computes color view fields", () => {
    const teal = cat.bySlug.get("windows-95")!.colors[0];
    expect(teal.rgb).toBe("0, 128, 128");
    expect(teal.hsl).toBe("180° 100% 25%");
    expect(teal.onColor).toBe("#ffffff");
    expect(teal.family).toBe("teal");
  });

  it("resolves predecessor/successor refs", () => {
    const w95 = cat.bySlug.get("windows-95")!;
    expect(w95.successor).toEqual({ slug: "windows-98", name: "Windows 98", year: 1998 });
    expect(w95.predecessor).toBeNull();
  });

  it("exposes merged colors with scores", () => {
    const teal = cat.colors.find((c) => c.hex === "#008080")!;
    expect(teal.platforms.length).toBe(2);
    expect(teal.score).toBe(48200);
    expect(teal.scoreLabel).toBe("48.2k");
  });

  it("throws on an unresolved reference", () => {
    const bad: OsEntry[] = [{ slug: "a", data: os({ successor: "nope", colors: [
      { hex: "#111111", name: "A", index: "—", note: "", default: true },
    ] }) }];
    expect(() => buildCatalog(bad, scores)).toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/catalog.ts`**

```ts
import {
  hexToRgb, hexToHsl, onColor, hueFamily, tone, shade, formatScore,
  type FamilyKey, type ToneKey, type ShadeKey,
} from "./color";
import {
  defaultColor, mergeColorsByHex, type OsEntry, type MergedColor,
} from "./derive";
import { colorScore, osScore, type Scores } from "./scores";
import type { DesktopStyle } from "../content/config";

export interface ColorView {
  hex: string;
  name: string;
  index: string;
  note: string;
  isDefault: boolean;
  rgb: string;
  hsl: string;
  onColor: string;
  family: FamilyKey;
  tone: ToneKey;
  shade: ShadeKey;
  score: number;
  scoreLabel: string;
}

export interface OsRef {
  slug: string;
  name: string;
  year: number;
}

export interface OsView {
  slug: string;
  name: string;
  year: number;
  family: string;
  tagline: string;
  description: string;
  desktopStyle: DesktopStyle;
  colors: ColorView[];
  defaultHex: string;
  colorCount: number;
  score: number;
  scoreLabel: string;
  predecessor: OsRef | null;
  successor: OsRef | null;
}

export interface MergedColorView extends MergedColor {
  onColor: string;
  tone: ToneKey;
  shade: ShadeKey;
  score: number;
  scoreLabel: string;
  primarySlug: string;
}

export interface Catalog {
  osList: OsView[];
  bySlug: Map<string, OsView>;
  colors: MergedColorView[];
}

function toColorView(hex: string, name: string, index: string, note: string, isDefault: boolean, scores: Scores): ColorView {
  const key = hex.toLowerCase();
  const [r, g, b] = hexToRgb(key);
  const [h, s, l] = hexToHsl(key);
  const score = colorScore(scores, key);
  return {
    hex: key, name, index, note, isDefault,
    rgb: `${r}, ${g}, ${b}`,
    hsl: `${h}° ${s}% ${l}%`,
    onColor: onColor(key),
    family: hueFamily(h, s),
    tone: tone(h, s, l),
    shade: shade(l),
    score, scoreLabel: formatScore(score),
  };
}

export function buildCatalog(entries: OsEntry[], scores: Scores): Catalog {
  const slugs = new Set(entries.map((e) => e.slug));
  const refOf = (slug: string | undefined, field: string, from: string): OsRef | null => {
    if (!slug) return null;
    if (!slugs.has(slug)) {
      throw new Error(`Unresolved ${field} "${slug}" referenced by "${from}"`);
    }
    const target = entries.find((e) => e.slug === slug)!;
    return { slug, name: target.data.name, year: target.data.year };
  };

  const osList: OsView[] = entries.map(({ slug, data }) => {
    const colors = data.colors.map((c) =>
      toColorView(c.hex, c.name, c.index, c.note, c.default, scores));
    const def = defaultColor(data);
    const score = osScore(scores, slug);
    return {
      slug, name: data.name, year: data.year, family: data.family,
      tagline: data.tagline, description: data.description, desktopStyle: data.desktopStyle,
      colors, defaultHex: def.hex.toLowerCase(), colorCount: colors.length,
      score, scoreLabel: formatScore(score),
      predecessor: refOf(data.predecessor, "predecessor", slug),
      successor: refOf(data.successor, "successor", slug),
    };
  });

  const bySlug = new Map(osList.map((o) => [o.slug, o]));

  const colors: MergedColorView[] = mergeColorsByHex(entries).map((m) => {
    const [, , l] = hexToHsl(m.hex);
    const [h, s] = hexToHsl(m.hex);
    const score = colorScore(scores, m.hex);
    return {
      ...m,
      onColor: onColor(m.hex),
      tone: tone(h, s, l),
      shade: shade(l),
      score, scoreLabel: formatScore(score),
      primarySlug: m.platforms[0].slug,
    };
  });

  return { osList, bySlug, colors };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "feat: add catalog builder with baked scores and referential checks"
```

---

### Task 8: Astro data loader, design tokens, base layout, header

**Files:**
- Create: `src/lib/loadCatalog.ts`
- Create: `src/styles/tokens.css`
- Create: `src/layouts/Base.astro`
- Create: `src/components/Header.astro`

**Interfaces:**
- Consumes: `getCollection` from `astro:content`; `buildCatalog` from `./catalog`; `loadScores` from `./scores`.
- Produces:
  - `loadCatalog(): Promise<Catalog>` — the single entry point every page uses to get enriched data.
  - `Base.astro` — layout with props `{ title: string; description?: string }`, includes tokens + fonts + `Header`, renders a `<slot />`.
  - `Header.astro` — props `{ active?: "browse" | "explorer" | "setup" | "about" }`; renders the nav (Browse, Color Explorer, Setup Guide, About).

This task is wiring/markup with no unit test; it is verified by `astro build` in Task 9. Keep it minimal and correct.

- [ ] **Step 1: Create `src/lib/loadCatalog.ts`**

```ts
import { getCollection } from "astro:content";
import { buildCatalog, type Catalog } from "./catalog";
import { loadScores } from "./scores";
import type { OsEntry } from "./derive";

export async function loadCatalog(): Promise<Catalog> {
  const collection = await getCollection("os");
  const entries: OsEntry[] = collection.map((e) => ({
    slug: e.data.slug ?? e.id.replace(/\.json$/, ""),
    data: e.data,
  }));
  return buildCatalog(entries, loadScores());
}
```

- [ ] **Step 2: Create `src/styles/tokens.css`**

```css
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap");

:root {
  --bg: #fafaf9;
  --ink: #1c1917;
  --muted: #57534e;
  --faint: #a8a29e;
  --hairline: #e7e5e4;
  --card-border: #eceae8;
  --field-border: #e2ded9;
  --panel: #ffffff;
  --accent: oklch(0.55 0.17 255);
  --accent-strong: oklch(0.5 0.17 255);
  --font-ui: "Space Grotesk", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-ui); }
a { color: inherit; text-decoration: none; }
```

- [ ] **Step 3: Create `src/components/Header.astro`**

```astro
---
interface Props { active?: "browse" | "explorer" | "setup" | "about"; }
const { active } = Astro.props;
const links = [
  { key: "browse", label: "Browse", href: "/" },
  { key: "explorer", label: "Color Explorer", href: "/explorer" },
  { key: "setup", label: "Setup Guide", href: "/setup" },
  { key: "about", label: "About", href: "/about" },
];
---
<header style="position: relative; padding: 20px 32px; border-bottom: 1px solid var(--hairline); display: flex; align-items: center; justify-content: space-between; gap: 20px;">
  <a href="/" style="font: 700 19px var(--font-ui); letter-spacing: -0.4px;">desktopcolors<span style="color: var(--faint);">.com</span></a>
  <nav style="display: flex; gap: 22px; font-size: 14px;">
    {links.map((l) => (
      <a href={l.href} style={`color: ${l.key === active ? "var(--ink)" : "var(--muted)"}; font-weight: ${l.key === active ? 500 : 400};`}>{l.label}</a>
    ))}
  </nav>
</header>
```

- [ ] **Step 4: Create `src/layouts/Base.astro`**

```astro
---
import "../styles/tokens.css";
import Header from "../components/Header.astro";
interface Props { title: string; description?: string; active?: "browse" | "explorer" | "setup" | "about"; }
const { title, description, active } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  </head>
  <body>
    <Header active={active} />
    <slot />
  </body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/loadCatalog.ts src/styles/tokens.css src/layouts/Base.astro src/components/Header.astro
git commit -m "feat: add catalog loader, design tokens, base layout and header"
```

---

### Task 9: Browse page + controls island

**Files:**
- Create: `src/islands/BrowseControls.tsx`
- Test: `src/islands/BrowseControls.test.tsx`
- Create: `src/pages/index.astro`

**Interfaces:**
- Consumes: `loadCatalog` from `../lib/loadCatalog`; `OsView` from `../lib/catalog`.
- Produces:
  - `interface BrowseItem { slug: string; name: string; year: number; family: string; tagline: string; defaultHex: string; colorCount: number; score: number; scoreLabel: string; altColors: { hex: string; name: string }[]; href: string }`
  - `BrowseControls` Preact component with props `{ items: BrowseItem[] }` — renders a search box, a card/list view toggle, and a sort control (Popular = by `score` desc; Year = by `year` asc; A–Z = by `name`). Filters by query against `name`, `family`, `tagline`, and color names/hex. Renders the filtered/sorted grid of cards, each linking to `href`. This task ships **card view only**; the list-view branch and mobile menu come in Plan 2 (leave the toggle present but both options rendering the card grid for now).
  - The island receives items already in **baked default order** (Popular) from the page; `sort` state defaults to `"popular"` and re-sorts the embedded array on user action (no fetch).

- [ ] **Step 1: Write the failing test `src/islands/BrowseControls.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { BrowseControls, type BrowseItem } from "./BrowseControls";

const items: BrowseItem[] = [
  { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", tagline: "Teal era", defaultHex: "#008080", colorCount: 14, score: 48200, scoreLabel: "48.2k", altColors: [{ hex: "#000080", name: "Navy" }], href: "/os/windows-95" },
  { slug: "amiga-workbench", name: "Amiga Workbench", year: 1985, family: "Amiga", tagline: "Four-color glory", defaultHex: "#0055aa", colorCount: 5, score: 300, scoreLabel: "< 1k", altColors: [], href: "/os/amiga-workbench" },
];

describe("BrowseControls", () => {
  it("renders all platforms as links", () => {
    render(<BrowseControls items={items} />);
    expect(screen.getByRole("link", { name: /Windows 95/ })).toHaveAttribute("href", "/os/windows-95");
    expect(screen.getByText("Amiga Workbench")).toBeTruthy();
  });

  it("filters by query against name and color", () => {
    render(<BrowseControls items={items} />);
    fireEvent.input(screen.getByPlaceholderText(/Search/), { target: { value: "amiga" } });
    expect(screen.queryByText("Windows 95")).toBeNull();
    expect(screen.getByText("Amiga Workbench")).toBeTruthy();
  });

  it("shows an empty state when nothing matches", () => {
    render(<BrowseControls items={items} />);
    fireEvent.input(screen.getByPlaceholderText(/Search/), { target: { value: "zzzz" } });
    expect(screen.getByText(/No platforms or colors match/)).toBeTruthy();
  });

  it("sorts A–Z when chosen", () => {
    render(<BrowseControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /A.Z/ }));
    const names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/BrowseControls.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/islands/BrowseControls.tsx`**

```tsx
import { useMemo, useState } from "preact/hooks";

export interface BrowseItem {
  slug: string;
  name: string;
  year: number;
  family: string;
  tagline: string;
  defaultHex: string;
  colorCount: number;
  score: number;
  scoreLabel: string;
  altColors: { hex: string; name: string }[];
  href: string;
}

type SortKey = "popular" | "year" | "alpha";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "year", label: "Year" },
  { key: "alpha", label: "A–Z" },
];

export function BrowseControls({ items }: { items: BrowseItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = items.filter((it) =>
        it.name.toLowerCase().includes(q) ||
        it.family.toLowerCase().includes(q) ||
        it.tagline.toLowerCase().includes(q) ||
        it.defaultHex.includes(q) ||
        it.altColors.some((c) => c.name.toLowerCase().includes(q) || c.hex.includes(q)));
    }
    const cmp: Record<SortKey, (a: BrowseItem, b: BrowseItem) => number> = {
      popular: (a, b) => b.score - a.score,
      year: (a, b) => a.year - b.year,
      alpha: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(cmp[sort]);
  }, [items, query, sort]);

  return (
    <div>
      <div style="padding: 34px 48px 22px; border-bottom: 1px solid var(--hairline);">
        <div style="font: 700 30px var(--font-ui); letter-spacing: -0.5px;">The desktop color archive</div>
        <div style="color: var(--muted); font-size: 15px; margin-top: 6px; max-width: 560px; line-height: 1.5;">
          Every solid desktop background color shipped by classic operating systems and desktop environments.
        </div>
        <label style="margin-top: 26px; display: flex; align-items: center; gap: 12px; background: var(--panel); border: 1px solid var(--field-border); border-radius: 13px; padding: 0 16px; height: 52px; max-width: 680px;">
          <span style="color: var(--faint); transform: rotate(-45deg);">&#9906;</span>
          <input
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Search platforms or colors — Windows 95, teal, #008080…"
            style="border: none; outline: none; background: transparent; font: 400 15px var(--font-ui); color: var(--ink); width: 100%;"
          />
        </label>
        <div style="display: flex; align-items: center; gap: 14px; margin-top: 16px;">
          <span style="font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              style={`cursor: pointer; border: none; background: none; font: 500 15px var(--font-ui); color: ${sort === s.key ? "var(--ink)" : "var(--faint)"}; text-decoration: ${sort === s.key ? "underline" : "none"}; text-underline-offset: 6px; text-decoration-thickness: 2px; text-decoration-color: var(--accent);`}
            >{s.label}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div style="padding: 72px 48px; text-align: center; color: var(--muted);">
          <div style="font: 500 20px var(--font-ui); color: var(--ink);">No platforms or colors match &ldquo;{query}&rdquo;</div>
          <div style="font-size: 14px; margin-top: 8px;">Try a platform name, a color name like &ldquo;teal&rdquo;, or a hex value.</div>
        </div>
      ) : (
        <main style="padding: 32px 48px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px;">
          {shown.map((it) => (
            <a key={it.slug} href={it.href} style="border: 1px solid var(--card-border); border-radius: 16px; overflow: hidden; background: var(--panel); display: block;">
              <div style={`position: relative; height: 132px; background-color: ${it.defaultHex};`}>
                <span style="position: absolute; left: 14px; bottom: 12px; background: rgba(255,255,255,0.92); color: var(--ink); font: 500 12px var(--font-mono); padding: 4px 9px; border-radius: 7px;">{it.defaultHex}</span>
              </div>
              <div style="padding: 16px 18px 18px;">
                <div data-testid="os-name" style="font: 500 18px var(--font-ui);">{it.name}</div>
                <div style="font: 400 12px var(--font-mono); color: var(--faint); margin-top: 4px;">{it.year} · {it.family}</div>
                <div style="font-size: 12px; color: var(--muted); margin-top: 8px; line-height: 1.45; min-height: 34px;">{it.tagline}</div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 14px;">
                  <div style="display: flex; gap: 6px;">
                    {it.altColors.slice(0, 4).map((c) => (
                      <span key={c.hex} title={c.name} style={`width: 22px; height: 22px; border-radius: 6px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);`} />
                    ))}
                  </div>
                  <span style="margin-left: auto; font: 400 11px var(--font-mono); color: var(--faint);">{it.colorCount} colors</span>
                </div>
              </div>
            </a>
          ))}
        </main>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/islands/BrowseControls.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create `src/pages/index.astro`**

```astro
---
import Base from "../layouts/Base.astro";
import { BrowseControls, type BrowseItem } from "../islands/BrowseControls";
import { loadCatalog } from "../lib/loadCatalog";

const catalog = await loadCatalog();
// Baked default order = Popular (score desc, stable by input order).
const ordered = [...catalog.osList].sort((a, b) => b.score - a.score);
const items: BrowseItem[] = ordered.map((o) => ({
  slug: o.slug, name: o.name, year: o.year, family: o.family, tagline: o.tagline,
  defaultHex: o.defaultHex, colorCount: o.colorCount, score: o.score, scoreLabel: o.scoreLabel,
  altColors: o.colors.filter((c) => !c.isDefault).map((c) => ({ hex: c.hex, name: c.name })),
  href: `/os/${o.slug}`,
}));
---
<Base title="desktopcolors.com — The desktop color archive" description="Every solid desktop background color shipped by classic operating systems." active="browse">
  <BrowseControls items={items} client:load />
</Base>
```

- [ ] **Step 6: Build the site to verify it compiles and prerenders**

Run: `npm run build`
Expected: build succeeds; `dist/index.html` exists and contains platform names (e.g. `grep -q "Windows 95" dist/index.html`).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass (color, scores, content, derive, catalog, BrowseControls).

- [ ] **Step 8: Commit**

```bash
git add src/islands/BrowseControls.tsx src/islands/BrowseControls.test.tsx src/pages/index.astro
git commit -m "feat: add Browse page with search/sort controls island"
```

---

## Self-review checklist (completed while writing)

- **Spec coverage (Plan 1 scope):** Astro+Preact scaffold ✓ (T1); full RAL Classic table vendored + validated ✓ (T2); design tokens ✓ (T8); one-JSON-per-OS content model + Zod validation + build-fail on bad data ✓ (T5); referential integrity ✓ (T5 test + T7 `buildCatalog`); derived data — rgb/hsl, **OKLab**, family, tone, shade, closest-RAL (OKLab, full table), merge, similar (OKLab), era, first-use ✓ (T2, T3, T6, T7); scores read + baked + `< 1k`/`k` formatting ✓ (T3, T4, T7); Browse page static shell + island search/sort over embedded data (no fetch/reorder-jump) ✓ (T9). Out of Plan 1 scope (later plans): OS detail, Explorer, preview component, wallpaper generation, list-view + mobile menu, counter service, deploy, Playwright.
- **Placeholder scan:** no TBD/TODO; every code step contains full code. The RAL table is generated from a cited authoritative CSV (T2) and validated by count + anchors rather than hand-typed. The seed-data appendix carries the complete platform color dataset (data, not a placeholder). The list-view deferral in T9 is stated explicitly with defined interim behavior.
- **Metric consistency:** `closestRal` (T3) and `similarColors` (T6) both use `oklabDistance`/`hexToOklab`; `rgbDistance` remains exported but is no longer used for matching. `RAL_CLASSIC` is a 216-entry array of `{code,name,hex}` consumed only by `closestRal`.
- **Type consistency:** `Scores`, `OsEntry`, `OsInput`/`OsColor`, `MergedColor`, `ColorView`/`OsView`/`MergedColorView`/`Catalog`, `FamilyKey`/`ToneKey`/`ShadeKey`, `BrowseItem` are each defined once and imported where used; `buildCatalog(entries, scores)`, `loadCatalog()`, `formatScore`, `onColor`, `hexToHsl` signatures are consistent across tasks.
