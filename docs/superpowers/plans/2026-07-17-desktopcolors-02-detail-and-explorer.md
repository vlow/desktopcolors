# desktopcolors.com — Plan 2: OS Detail & Color Explorer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the browsable static site: an OS-detail page per platform (color selector, live desktop preview, copy-to-clipboard for HEX/RGB/HSL/closest-RAL, first-known-use, deduped "similar colors elsewhere", same-era peers, a download sheet that generates solid-color wallpapers client-side, and a fullscreen viewer with keyboard nav); a Color Explorer (hue/tone grouping, family+shade filters, spectrum/popularity sort, and a popularity leaderboard); the Browse deferrals from Plan 1 (list view, card/list toggle, mobile nav menu); and static About + Setup Guide pages.

**Architecture:** Continues Plan 1's model — static Astro pages with the full build-computed dataset embedded as props into small Preact islands that handle interaction over data already present (no fetches for reads). All per-color derivations (closest-RAL, deduped similar colors, first-known-use) and explorer groupings are computed at build time by pure, unit-tested TypeScript in `src/lib/` and baked into the page. Popularity events (copy/download/osview) are emitted through a single no-op `track()` seam that Plan 4 will wire to the counter `/api`; nothing in this plan talks to a server. Wallpaper PNGs are drawn in the browser via canvas.

**Tech Stack:** Astro 4, `@astrojs/preact`, Preact, TypeScript strict, Vitest, `@testing-library/preact`, `@testing-library/jest-dom` (all already installed in Plan 1).

## Global Constraints

- **TypeScript** `strict: true`; no `any` in committed code.
- **Reuse Plan 1, do not reimplement.** Color math, classification, closest-RAL, scores, catalog, and cross-platform derivation already exist and are tested:
  - `src/lib/color.ts`: `hexToRgb`, `rgbToHsl`, `hexToHsl`, `onColor`, `hexToOklab`, `oklabDistance`, `hueFamily`, `tone`, `shade`, `closestRal`, `formatScore`, types `FamilyKey`/`ToneKey`/`ShadeKey`.
  - `src/lib/ral.ts`: `RAL_CLASSIC`, `RalColor`.
  - `src/lib/derive.ts`: `OsEntry`, `defaultColor`, `mergeColorsByHex`, `MergedColor`, `similarColors` → `SimilarColor`, `eraPeers` → `EraPeer`, `firstKnownUse` → `FirstUse`.
  - `src/lib/catalog.ts`: `buildCatalog`, `Catalog` `{ osList: OsView[]; bySlug: Map<string,OsView>; colors: MergedColorView[] }`, `OsView`, `ColorView`, `MergedColorView`, `OsRef`.
  - `src/lib/loadCatalog.ts`: `loadCatalog(): Promise<Catalog>`. **`loadCatalog` returns only the `Catalog`, not the raw `OsEntry[]`. `similarColors`/`firstKnownUse` need `OsEntry[]`, so add an entries accessor (Task 2) rather than duplicating the collection read.**
  - `src/styles/tokens.css` custom properties: `--bg #fafaf9`, `--ink #1c1917`, `--muted #57534e`, `--faint #a8a29e`, `--hairline #e7e5e4`, `--card-border #eceae8`, `--field-border #e2ded9`, `--panel #fff`, `--accent oklch(0.55 0.17 255)`, `--accent-strong oklch(0.5 0.17 255)`, `--font-ui`, `--font-mono`.
  - `src/layouts/Base.astro` props `{ title; description?; active? }`; `src/components/Header.astro` props `{ active? }`.
- **Perceptual distance is OKLab** everywhere (already true in `closestRal`/`similarColors`).
- **Score display:** `formatScore` (already built) — `< 1k` below 1000, else `1.2k`-style.
- **Popularity events are a seam only in this plan.** All copy/download/osview actions call `track(event)` from `src/lib/track.ts`, which is a no-op (dev: `console.debug`) in this plan. Do NOT POST to any URL; Plan 4 implements the real transport. This keeps the site fully functional offline.
- **URLs:** OS detail at `/os/<slug>` (Astro `getStaticPaths` over the collection). Detail/explorer links already produced by Plan 1 point at `/os/<slug>`; keep that.
- **Routing note:** color links from Explorer/Browse point at `/os/<slug>?hex=<hex>`; the OS-detail island reads `?hex=` on mount to preselect (mirrors the prototype). This is the only URL-param read.
- **No new heavy dependencies.** Wallpaper generation uses the built-in `<canvas>` API. No image libraries.
- Commit after every task with a `feat:`/`test:`/`chore:` prefixed message.

---

## File structure (created/modified across this plan)

```
src/
  lib/
    track.ts                  # NEW: no-op event seam (Plan 4 wires transport)
    wallpaper.ts              # NEW: resolution presets, filename, dimension parse/validate
    wallpaper.test.ts         # NEW
    entries.ts                # NEW: loadEntries() — shared raw OsEntry[] accessor
    detail.ts                 # NEW: buildOsDetail(entries, catalog, slug) view model
    detail.test.ts            # NEW
    explorer.ts               # NEW: buildExplorerColors + groupIntoBands + rankColors + families/shades
    explorer.test.ts          # NEW
  islands/
    DesktopPreview.tsx        # NEW: fake desktop chrome over a solid color, by desktopStyle
    FullscreenPreview.tsx     # NEW: shared fullscreen viewer (used by OsDetail + Explorer)
    OsDetail.tsx              # NEW: detail page interactivity (selector/copy/download/fullscreen)
    OsDetail.test.tsx         # NEW
    DownloadSheet.tsx         # NEW: resolution picker + client-side canvas wallpaper
    DownloadSheet.test.tsx    # NEW
    Explorer.tsx              # NEW: grouping/filter/sort/leaderboard
    Explorer.test.tsx         # NEW
    MobileNav.tsx             # NEW: burger menu island for narrow screens
    BrowseControls.tsx        # MODIFY: add list view + card/list toggle
    BrowseControls.test.tsx   # MODIFY: cover list view + toggle
  components/
    Header.astro              # MODIFY: embed MobileNav island; wide nav unchanged
  pages/
    os/[slug].astro           # NEW: OS detail page (static shell + OsDetail island)
    explorer.astro            # NEW: Color Explorer page
    about.astro               # NEW: static
    setup.astro               # NEW: static
```

---

### Task 1: Event seam + wallpaper library (TDD)

**Files:**
- Create: `src/lib/track.ts`
- Create: `src/lib/wallpaper.ts`
- Test: `src/lib/wallpaper.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `track.ts`: `type TrackEvent = { kind: "copy" | "download"; hex: string; os: string } | { kind: "osview"; os: string }` and `function track(event: TrackEvent): void` — no-op seam (dev logs via `console.debug`; Plan 4 replaces the body with a `fetch` POST). Exported so islands import one symbol.
  - `wallpaper.ts`:
    - `interface ResolutionGroup { label: string; items: { w: number; h: number; label: string }[] }`
    - `const RESOLUTION_GROUPS: ResolutionGroup[]` — Desktop / Mobile / Classic presets from the prototype.
    - `wallpaperFilename(osSlug: string, colorName: string, hex: string, w: number, h: number): string` → e.g. `windows-95-teal-008080-1920x1080.png` (lowercase, hyphen-slugged colorName, hex without `#`).
    - `parseDimension(raw: string): number | null` — integer 1–10000, else null (trims, rejects non-numeric/decimal/out-of-range).
    - `MIN_DIM = 1`, `MAX_DIM = 10000`.

- [ ] **Step 1: Create `src/lib/track.ts`**

```ts
export type TrackEvent =
  | { kind: "copy"; hex: string; os: string }
  | { kind: "download"; hex: string; os: string }
  | { kind: "osview"; os: string };

/**
 * No-op popularity event seam. Plan 4 replaces the body with a fire-and-forget
 * POST to /api/event. Kept as a single import so islands never inline transport.
 */
export function track(event: TrackEvent): void {
  if (import.meta.env.DEV) console.debug("[track]", event);
}
```

- [ ] **Step 2: Write the failing test `src/lib/wallpaper.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { RESOLUTION_GROUPS, wallpaperFilename, parseDimension } from "./wallpaper";

describe("RESOLUTION_GROUPS", () => {
  it("has Desktop, Mobile, Classic groups with items", () => {
    const labels = RESOLUTION_GROUPS.map((g) => g.label);
    expect(labels).toEqual(["Desktop", "Mobile", "Classic"]);
    for (const g of RESOLUTION_GROUPS) {
      expect(g.items.length).toBeGreaterThan(0);
      for (const it of g.items) {
        expect(it.w).toBeGreaterThan(0);
        expect(it.h).toBeGreaterThan(0);
        expect(it.label).toMatch(/^\d+×\d+$/);
      }
    }
  });
  it("includes 1920×1080 in Desktop", () => {
    const desktop = RESOLUTION_GROUPS.find((g) => g.label === "Desktop")!;
    expect(desktop.items.some((i) => i.w === 1920 && i.h === 1080)).toBe(true);
  });
});

describe("wallpaperFilename", () => {
  it("slugs os, color, and hex into a png name", () => {
    expect(wallpaperFilename("windows-95", "Teal", "#008080", 1920, 1080))
      .toBe("windows-95-teal-008080-1920x1080.png");
  });
  it("handles multi-word color names and uppercase hex", () => {
    expect(wallpaperFilename("windows-xp", "Olive Green", "#7BA05B", 2560, 1440))
      .toBe("windows-xp-olive-green-7ba05b-2560x1440.png");
  });
});

describe("parseDimension", () => {
  it("accepts integers in range", () => {
    expect(parseDimension("1920")).toBe(1920);
    expect(parseDimension(" 800 ")).toBe(800);
    expect(parseDimension("1")).toBe(1);
    expect(parseDimension("10000")).toBe(10000);
  });
  it("rejects junk, decimals, and out-of-range", () => {
    expect(parseDimension("")).toBeNull();
    expect(parseDimension("abc")).toBeNull();
    expect(parseDimension("12.5")).toBeNull();
    expect(parseDimension("0")).toBeNull();
    expect(parseDimension("10001")).toBeNull();
    expect(parseDimension("-5")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/wallpaper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/wallpaper.ts`**

```ts
export interface ResolutionItem {
  w: number;
  h: number;
  label: string;
}
export interface ResolutionGroup {
  label: string;
  items: ResolutionItem[];
}

const mk = (w: number, h: number): ResolutionItem => ({ w, h, label: `${w}×${h}` });

export const RESOLUTION_GROUPS: ResolutionGroup[] = [
  { label: "Desktop", items: [mk(1280, 720), mk(1920, 1080), mk(2560, 1440), mk(3840, 2160)] },
  { label: "Mobile", items: [mk(1170, 2532), mk(1080, 2400), mk(1284, 2778), mk(1440, 3120)] },
  { label: "Classic", items: [mk(640, 480), mk(800, 600), mk(1024, 768)] },
];

export const MIN_DIM = 1;
export const MAX_DIM = 10000;

const slug = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function wallpaperFilename(
  osSlug: string, colorName: string, hex: string, w: number, h: number,
): string {
  return `${slug(osSlug)}-${slug(colorName)}-${hex.replace("#", "").toLowerCase()}-${w}x${h}.png`;
}

export function parseDimension(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (n < MIN_DIM || n > MAX_DIM) return null;
  return n;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/wallpaper.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/track.ts src/lib/wallpaper.ts src/lib/wallpaper.test.ts
git commit -m "feat: add event seam and wallpaper filename/preset library"
```

---

### Task 2: Raw-entries accessor + OS-detail view model (TDD)

**Files:**
- Create: `src/lib/entries.ts`
- Create: `src/lib/detail.ts`
- Test: `src/lib/detail.test.ts`

**Interfaces:**
- Consumes: `getCollection` (`astro:content`); `OsEntry` from `./derive`; `Catalog`, `OsView`, `ColorView` from `./catalog`; `closestRal` from `./color`; `similarColors`, `eraPeers`, `firstKnownUse` from `./derive`.
- Produces:
  - `entries.ts`: `loadEntries(): Promise<OsEntry[]>` — the same mapping `loadCatalog` uses internally, exposed so pages can pass raw entries to `buildOsDetail` without re-reading. (Refactor note: `loadCatalog.ts` should call `loadEntries()` too, so the collection→entries mapping lives in one place.)
  - `detail.ts`:
    - `interface RalMatch { code: string; name: string; hex: string }`
    - `interface SimilarView { hex: string; name: string; osSlug: string; osName: string; match: number; onColor: string; href: string }`
    - `interface DetailColor extends ColorView { ral: RalMatch; similar: SimilarView[]; firstUse: FirstUse & { self: boolean; href: string } }`
    - `interface OsDetailView { os: OsView; colors: DetailColor[]; eraPeers: EraPeerView[] }`
    - `interface EraPeerView extends EraPeer { onColor: string; href: string }`
    - `buildOsDetail(entries: OsEntry[], catalog: Catalog, slug: string): OsDetailView` — throws if slug unknown. For each color of the OS: attach `closestRal`; `similar` = `similarColors(hex, entries, slug, 24)` **deduped by hex keeping the nearest**, sliced to 6, each with `onColor` and `href` `/os/<osSlug>?hex=<hex>`; `firstUse` = `firstKnownUse(hex, entries)` with `self = firstUse.slug === slug` and `href`. `eraPeers` = `eraPeers(thisEntry, entries, 3)` mapped with `onColor` (via `onColor(hex)`) and `href` `/os/<slug>`.
    - `dedupeSimilarByHex(list: SimilarColor[]): SimilarColor[]` (exported for testing) — keep first occurrence of each hex (list is already distance-sorted).

- [ ] **Step 1: Create `src/lib/entries.ts`**

```ts
import { getCollection } from "astro:content";
import type { OsEntry } from "./derive";

export async function loadEntries(): Promise<OsEntry[]> {
  const collection = await getCollection("os");
  return collection.map((e) => ({
    slug: e.data.slug ?? e.id.replace(/\.json$/, ""),
    data: e.data,
  }));
}
```

- [ ] **Step 2: Refactor `src/lib/loadCatalog.ts` to reuse `loadEntries`**

Replace its body so the mapping is not duplicated:

```ts
import { buildCatalog, type Catalog } from "./catalog";
import { loadScores } from "./scores";
import { loadEntries } from "./entries";

export async function loadCatalog(): Promise<Catalog> {
  return buildCatalog(await loadEntries(), loadScores());
}
```

- [ ] **Step 3: Write the failing test `src/lib/detail.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildOsDetail, dedupeSimilarByHex } from "./detail";
import { buildCatalog } from "./catalog";
import { parseScores } from "./scores";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import type { SimilarColor } from "./derive";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", colors: over.colors, ...over,
});

const entries: OsEntry[] = [
  { slug: "windows-95", data: os({ name: "Windows 95", year: 1995, colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "n", default: true },
    { hex: "#000080", name: "Navy", index: "1", note: "", default: false },
  ] }) },
  { slug: "cde", data: os({ name: "CDE", year: 1993, colors: [
    { hex: "#008080", name: "Teal", index: "—", note: "", default: true },
    { hex: "#9aabb9", name: "Dusty Blue", index: "—", note: "", default: false },
  ] }) },
  { slug: "kde-2", data: os({ name: "KDE 2", year: 2000, colors: [
    { hex: "#008080", name: "Teal", index: "—", note: "", default: true },
  ] }) },
];

const catalog = buildCatalog(entries, parseScores({ colors: { "#008080": 1200 }, os: {} }));

describe("dedupeSimilarByHex", () => {
  it("keeps the first (nearest) occurrence of each hex", () => {
    const list: SimilarColor[] = [
      { hex: "#008080", name: "Teal", osSlug: "cde", osName: "CDE", distance: 0, match: 100 },
      { hex: "#008080", name: "Teal", osSlug: "kde-2", osName: "KDE 2", distance: 0, match: 100 },
      { hex: "#9aabb9", name: "Dusty Blue", osSlug: "cde", osName: "CDE", distance: 0.2, match: 50 },
    ];
    const out = dedupeSimilarByHex(list);
    expect(out.map((c) => c.hex)).toEqual(["#008080", "#9aabb9"]);
    expect(out[0].osSlug).toBe("cde");
  });
});

describe("buildOsDetail", () => {
  const view = buildOsDetail(entries, catalog, "windows-95");

  it("returns the OsView and a DetailColor per color", () => {
    expect(view.os.slug).toBe("windows-95");
    expect(view.colors.length).toBe(2);
  });
  it("attaches a closest RAL match to each color", () => {
    const teal = view.colors[0];
    expect(teal.ral.code).toMatch(/^RAL \d{4}$/);
    expect(teal.ral.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("dedupes similar colors by hex and links them", () => {
    const teal = view.colors[0];
    // #008080 also in cde and kde-2 -> one deduped entry, not two
    const tealMatches = teal.similar.filter((s) => s.hex === "#008080");
    expect(tealMatches.length).toBe(1);
    expect(teal.similar.every((s) => s.osSlug !== "windows-95")).toBe(true);
    expect(teal.similar[0].href).toMatch(/^\/os\/.+\?hex=/);
  });
  it("computes first known use with self flag", () => {
    const teal = view.colors[0]; // teal first shipped by CDE (1993) < Win95 (1995)
    expect(teal.firstUse.slug).toBe("cde");
    expect(teal.firstUse.self).toBe(false);
    const navy = view.colors[1]; // navy only in win95
    expect(navy.firstUse.self).toBe(true);
  });
  it("includes era peers with hrefs", () => {
    expect(view.eraPeers.some((p) => p.slug === "cde")).toBe(true);
    expect(view.eraPeers.every((p) => p.slug !== "windows-95")).toBe(true);
  });
  it("throws on unknown slug", () => {
    expect(() => buildOsDetail(entries, catalog, "nope")).toThrow(/nope/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/detail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/lib/detail.ts`**

```ts
import { closestRal, onColor } from "./color";
import {
  similarColors, eraPeers, firstKnownUse,
  type OsEntry, type SimilarColor, type EraPeer, type FirstUse,
} from "./derive";
import type { Catalog, OsView, ColorView } from "./catalog";

export interface RalMatch { code: string; name: string; hex: string }

export interface SimilarView {
  hex: string; name: string; osSlug: string; osName: string;
  match: number; onColor: string; href: string;
}

export interface DetailColor extends ColorView {
  ral: RalMatch;
  similar: SimilarView[];
  firstUse: FirstUse & { self: boolean; href: string };
}

export interface EraPeerView extends EraPeer { onColor: string; href: string }

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

const colorHref = (slug: string, hex: string): string =>
  `/os/${slug}?hex=${encodeURIComponent(hex)}`;

export function buildOsDetail(entries: OsEntry[], catalog: Catalog, slug: string): OsDetailView {
  const os = catalog.bySlug.get(slug);
  const entry = entries.find((e) => e.slug === slug);
  if (!os || !entry) throw new Error(`Unknown OS slug "${slug}"`);

  const colors: DetailColor[] = os.colors.map((c: ColorView) => {
    const ral = closestRal(c.hex);
    const similar = dedupeSimilarByHex(similarColors(c.hex, entries, slug, 24))
      .slice(0, 6)
      .map((s): SimilarView => ({
        hex: s.hex, name: s.name, osSlug: s.osSlug, osName: s.osName,
        match: s.match, onColor: onColor(s.hex), href: colorHref(s.osSlug, s.hex),
      }));
    const fu = firstKnownUse(c.hex, entries);
    return {
      ...c,
      ral: { code: ral.code, name: ral.name, hex: ral.hex },
      similar,
      firstUse: { ...fu, self: fu.slug === slug, href: `/os/${fu.slug}` },
    };
  });

  const peers: EraPeerView[] = eraPeers(entry, entries, 3).map((p) => ({
    ...p, onColor: onColor(p.hex), href: `/os/${p.slug}`,
  }));

  return { os, colors, eraPeers: peers };
}
```

- [ ] **Step 6: Run the test to verify it passes, then the full suite**

Run: `npx vitest run src/lib/detail.test.ts && npm test`
Expected: detail PASS; full suite still green (Plan 1 tests + wallpaper + detail).

- [ ] **Step 7: Commit**

```bash
git add src/lib/entries.ts src/lib/loadCatalog.ts src/lib/detail.ts src/lib/detail.test.ts
git commit -m "feat: add entries accessor and OS-detail view model with deduped similar colors"
```

---

### Task 3: Color Explorer view model (TDD)

**Files:**
- Create: `src/lib/explorer.ts`
- Test: `src/lib/explorer.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `MergedColorView` from `./catalog`; `FamilyKey`, `ToneKey`, `ShadeKey` from `./color`.
- Produces:
  - `interface ExplorerColor { hex: string; name: string; family: FamilyKey; tone: ToneKey; shade: ShadeKey; h: number; s: number; l: number; onColor: string; score: number; scoreLabel: string; yearRange: string; primarySlug: string; href: string }`
  - `toExplorerColors(catalog: Catalog): ExplorerColor[]` — maps `catalog.colors`, adding `h/s/l` (via `hexToHsl`) and `href` `/os/<primarySlug>?hex=<hex>`.
  - `FAMILY_DEFS: { key: FamilyKey; name: string; chip: string }[]` and `TONE_DEFS: { key: ToneKey; name: string; chip: string }[]` and `SHADE_DEFS: { key: ShadeKey; name: string; chip: string }[]` (labels/chips from the prototype).
  - `interface Band { key: string; name: string; chip: string; colors: ExplorerColor[] }`
  - `groupIntoBands(colors: ExplorerColor[], opts: { group: "hue" | "tone"; family: FamilyKey | null; shade: ShadeKey | null; sort: "spectrum" | "pop" }): Band[]` — filters by family/shade, groups by hue-family or tone, sorts within band (spectrum = by hue then lightness; pop = by score desc), drops empty bands.
  - `rankColors(colors: ExplorerColor[], opts: { family: FamilyKey | null; sort: "spectrum" | "pop" }): (ExplorerColor & { rank: number; pct: number })[]` — the leaderboard; filter by family, sort (pop = score desc; spectrum = hue then lightness), assign 1-based `rank` and `pct` = round(score / maxScore * 100) (0 when all scores 0).
  - `familyCounts(colors: ExplorerColor[]): Record<FamilyKey, number>` and `shadeCountsFor(colors: ExplorerColor[], family: FamilyKey): Record<ShadeKey, number>`.

- [ ] **Step 1: Write the failing test `src/lib/explorer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  toExplorerColors, groupIntoBands, rankColors, familyCounts, FAMILY_DEFS,
} from "./explorer";
import { buildCatalog } from "./catalog";
import { parseScores } from "./scores";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", colors: over.colors, ...over,
});

const entries: OsEntry[] = [
  { slug: "a", data: os({ name: "A", year: 1995, colors: [
    { hex: "#008080", name: "Teal", index: "—", note: "", default: true },
    { hex: "#000080", name: "Navy", index: "—", note: "", default: false },
  ] }) },
  { slug: "b", data: os({ name: "B", year: 2000, colors: [
    { hex: "#ff0000", name: "Red", index: "—", note: "", default: true },
  ] }) },
];
const catalog = buildCatalog(entries, parseScores({ colors: { "#008080": 5000, "#ff0000": 1000 }, os: {} }));
const colors = toExplorerColors(catalog);

describe("toExplorerColors", () => {
  it("maps merged colors with hsl and href", () => {
    const teal = colors.find((c) => c.hex === "#008080")!;
    expect(teal.family).toBe("teal");
    expect(teal.h).toBeGreaterThan(0);
    expect(teal.href).toMatch(/^\/os\/.+\?hex=/);
  });
});

describe("FAMILY_DEFS", () => {
  it("covers all nine families", () => {
    expect(FAMILY_DEFS.map((f) => f.key)).toEqual(
      ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "neutral"]);
  });
});

describe("familyCounts", () => {
  it("counts colors per family", () => {
    const counts = familyCounts(colors);
    expect(counts.teal).toBe(1);
    expect(counts.blue).toBe(1); // navy
    expect(counts.red).toBe(1);
  });
});

describe("groupIntoBands", () => {
  it("groups by hue and drops empty bands", () => {
    const bands = groupIntoBands(colors, { group: "hue", family: null, shade: null, sort: "spectrum" });
    const keys = bands.map((b) => b.key);
    expect(keys).toContain("teal");
    expect(keys).toContain("red");
    expect(bands.every((b) => b.colors.length > 0)).toBe(true);
  });
  it("filters to a single family", () => {
    const bands = groupIntoBands(colors, { group: "hue", family: "teal", shade: null, sort: "spectrum" });
    expect(bands.length).toBe(1);
    expect(bands[0].colors[0].hex).toBe("#008080");
  });
});

describe("rankColors", () => {
  it("ranks by popularity with pct bars", () => {
    const ranked = rankColors(colors, { family: null, sort: "pop" });
    expect(ranked[0].hex).toBe("#008080"); // score 5000 highest
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].pct).toBe(100);
    const red = ranked.find((c) => c.hex === "#ff0000")!;
    expect(red.pct).toBe(20); // 1000/5000
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/explorer.ts`**

```ts
import { hexToHsl, type FamilyKey, type ToneKey, type ShadeKey } from "./color";
import type { Catalog } from "./catalog";

export interface ExplorerColor {
  hex: string; name: string;
  family: FamilyKey; tone: ToneKey; shade: ShadeKey;
  h: number; s: number; l: number;
  onColor: string; score: number; scoreLabel: string;
  yearRange: string; primarySlug: string; href: string;
}

export const FAMILY_DEFS: { key: FamilyKey; name: string; chip: string }[] = [
  { key: "red", name: "Reds", chip: "#cc3333" },
  { key: "orange", name: "Oranges", chip: "#d2762f" },
  { key: "yellow", name: "Yellows", chip: "#d8c020" },
  { key: "green", name: "Greens", chip: "#4e9a5f" },
  { key: "teal", name: "Teals", chip: "#2aa5a5" },
  { key: "blue", name: "Blues", chip: "#3a6ea5" },
  { key: "purple", name: "Purples", chip: "#8a5cc0" },
  { key: "pink", name: "Pinks", chip: "#c0559a" },
  { key: "neutral", name: "Neutrals", chip: "#9a9a96" },
];

export const TONE_DEFS: { key: ToneKey; name: string; chip: string }[] = [
  { key: "neon", name: "Neon", chip: "#16d6c1" },
  { key: "bright", name: "Bright", chip: "#e0512f" },
  { key: "pastel", name: "Pastel", chip: "#c9b6e8" },
  { key: "muted", name: "Muted", chip: "#8f978f" },
  { key: "dark", name: "Dark", chip: "#2b303c" },
];

export const SHADE_DEFS: { key: ShadeKey; name: string; chip: string }[] = [
  { key: "deep", name: "Deep", chip: "#2a2a2a" },
  { key: "mid", name: "Mid", chip: "#6b6b6b" },
  { key: "light", name: "Light", chip: "#b0b0b0" },
  { key: "pale", name: "Pale", chip: "#e6e6e6" },
];

export function toExplorerColors(catalog: Catalog): ExplorerColor[] {
  return catalog.colors.map((c) => {
    const [h, s, l] = hexToHsl(c.hex);
    return {
      hex: c.hex, name: c.name, family: c.family, tone: c.tone, shade: c.shade,
      h, s, l, onColor: c.onColor, score: c.score, scoreLabel: c.scoreLabel,
      yearRange: c.yearRange, primarySlug: c.primarySlug,
      href: `/os/${c.primarySlug}?hex=${encodeURIComponent(c.hex)}`,
    };
  });
}

export function familyCounts(colors: ExplorerColor[]): Record<FamilyKey, number> {
  const out = {} as Record<FamilyKey, number>;
  for (const d of FAMILY_DEFS) out[d.key] = 0;
  for (const c of colors) out[c.family]++;
  return out;
}

export function shadeCountsFor(colors: ExplorerColor[], family: FamilyKey): Record<ShadeKey, number> {
  const out = {} as Record<ShadeKey, number>;
  for (const d of SHADE_DEFS) out[d.key] = 0;
  for (const c of colors) if (c.family === family) out[c.shade]++;
  return out;
}

const spectrumCmp = (a: ExplorerColor, b: ExplorerColor): number =>
  a.h - b.h || a.l - b.l;
const popCmp = (a: ExplorerColor, b: ExplorerColor): number =>
  b.score - a.score || a.h - b.h;

export interface Band { key: string; name: string; chip: string; colors: ExplorerColor[] }

export function groupIntoBands(
  colors: ExplorerColor[],
  opts: { group: "hue" | "tone"; family: FamilyKey | null; shade: ShadeKey | null; sort: "spectrum" | "pop" },
): Band[] {
  const match = (c: ExplorerColor): boolean =>
    (!opts.family || c.family === opts.family) && (!opts.shade || c.shade === opts.shade);
  const defs = opts.group === "tone"
    ? TONE_DEFS
    : (opts.family ? FAMILY_DEFS.filter((d) => d.key === opts.family) : FAMILY_DEFS);
  const keyOf = (c: ExplorerColor): string => (opts.group === "tone" ? c.tone : c.family);
  const cmp = opts.sort === "pop" ? popCmp : spectrumCmp;
  return defs
    .map((d) => ({
      key: d.key, name: d.name, chip: d.chip,
      colors: colors.filter((c) => keyOf(c) === d.key && match(c)).slice().sort(cmp),
    }))
    .filter((b) => b.colors.length > 0);
}

export function rankColors(
  colors: ExplorerColor[],
  opts: { family: FamilyKey | null; sort: "spectrum" | "pop" },
): (ExplorerColor & { rank: number; pct: number })[] {
  const filtered = colors.filter((c) => !opts.family || c.family === opts.family);
  const maxScore = filtered.reduce((mx, c) => Math.max(mx, c.score), 0);
  const cmp = opts.sort === "pop" ? popCmp : spectrumCmp;
  return filtered.slice().sort(cmp).map((c, i) => ({
    ...c, rank: i + 1,
    pct: maxScore > 0 ? Math.round((c.score / maxScore) * 100) : 0,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/explorer.ts src/lib/explorer.test.ts
git commit -m "feat: add Color Explorer view model (bands, leaderboard, filters)"
```

---

### Task 4: DesktopPreview + FullscreenPreview components

**Files:**
- Create: `src/islands/DesktopPreview.tsx`
- Create: `src/islands/FullscreenPreview.tsx`

**Interfaces:**
- Consumes: `DesktopStyle` from `../content/config`.
- Produces:
  - `DesktopPreview({ hex, onColor, style }: { hex: string; onColor: string; style: DesktopStyle })` — a plain Preact component (NOT hydrated on its own; imported by islands) that fills its container with `hex` and overlays lightweight, recognizable chrome chosen by `style`: `win9x` → two desktop icons top-left + a bottom taskbar with a Start button; `macos8` → a top menu bar; `kde`/`cde` → a bottom panel; `amiga` → a top title bar; `generic` → icons only. Chrome uses `onColor` for legibility and semi-transparent white/black fills. Absolutely positioned; `position: absolute; inset: 0`.
  - `FullscreenPreview({ hex, onColor, style, label, pos, total, onClose, onPrev, onNext, detailHref }: {...})` — a fixed-overlay viewer wrapping `DesktopPreview`, with a top label pill, a close button, prev/next arrows, a `pos / total` counter, and (when `detailHref` given) a "Details →" link. Registers `keydown` for Escape/←/→ via `useEffect`, cleaned up on unmount. This is the shared viewer used by both OsDetail and Explorer.

These are presentation components with no unit test; they are exercised by the island tests (Task 5/7) and the build. Keep them focused.

- [ ] **Step 1: Create `src/islands/DesktopPreview.tsx`**

```tsx
import type { DesktopStyle } from "../content/config";

interface Props { hex: string; onColor: string; style: DesktopStyle }

function Icon({ label, onColor }: { label: string; onColor: string }) {
  return (
    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 84px;">
      <div style="width: 52px; height: 44px; background: rgba(255,255,255,0.82); border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.28);" />
      <span style={`font: 400 12px var(--font-ui); color: ${onColor};`}>{label}</span>
    </div>
  );
}

export function DesktopPreview({ hex, onColor, style }: Props) {
  const icons = (
    <div style="position: absolute; left: 4%; top: 5%; display: flex; flex-direction: column; gap: 20px;">
      <Icon label="My Computer" onColor={onColor} />
      <Icon label="Network" onColor={onColor} />
    </div>
  );
  const taskbar = (
    <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 40px; background: rgba(0,0,0,0.16); display: flex; align-items: center; padding: 0 14px;">
      <span style="background: rgba(255,255,255,0.9); color: #1c1917; font: 500 13px var(--font-ui); padding: 6px 16px; border-radius: 6px;">Start</span>
    </div>
  );
  const menubar = (
    <div style="position: absolute; left: 0; right: 0; top: 0; height: 26px; background: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 16px; padding: 0 14px; font: 500 12px var(--font-ui); color: #1c1917;">
      <span></span><span>File</span><span>Edit</span><span>View</span>
    </div>
  );
  const panel = (
    <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 34px; background: rgba(0,0,0,0.2); display: flex; align-items: center; gap: 10px; padding: 0 12px;">
      <span style="width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,0.8);" />
      <span style="width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,0.55);" />
    </div>
  );
  const titlebar = (
    <div style="position: absolute; left: 0; right: 0; top: 0; height: 22px; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font: 500 11px var(--font-ui); color: #1c1917;">
      <span>Workbench</span><span>Amiga</span>
    </div>
  );
  return (
    <div style={`position: absolute; inset: 0; background-color: ${hex}; overflow: hidden;`}>
      {(style === "win9x" || style === "generic") && icons}
      {style === "win9x" && taskbar}
      {style === "macos8" && menubar}
      {(style === "kde" || style === "cde") && panel}
      {style === "amiga" && titlebar}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/islands/FullscreenPreview.tsx`**

```tsx
import { useEffect } from "preact/hooks";
import type { DesktopStyle } from "../content/config";
import { DesktopPreview } from "./DesktopPreview";

interface Props {
  hex: string; onColor: string; style: DesktopStyle;
  label: string; pos: number; total: number;
  onClose: () => void; onPrev: () => void; onNext: () => void;
  detailHref?: string;
}

const btn =
  "position: absolute; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.92); border: none; border-radius: 10px; padding: 10px 15px; font: 500 13px var(--font-ui); color: #1c1917; box-shadow: 0 2px 10px rgba(0,0,0,0.2);";

export function FullscreenPreview(props: Props) {
  const { hex, onColor, style, label, pos, total, onClose, onPrev, onNext, detailHref } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") { e.preventDefault(); onNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div style="position: fixed; inset: 0; z-index: 100;">
      <DesktopPreview hex={hex} onColor={onColor} style={style} />
      <div style="position: absolute; top: 22px; left: 50%; transform: translateX(-50%); background: rgba(255,255,255,0.92); border-radius: 999px; padding: 8px 18px; font: 500 13px var(--font-ui); color: #1c1917; box-shadow: 0 2px 10px rgba(0,0,0,0.2);">{label}</div>
      <button onClick={onClose} title="Close (Esc)" aria-label="Close" style={`${btn} top: 20px; right: 22px;`}>✕ Close</button>
      <button onClick={onPrev} title="Previous (←)" aria-label="Previous color" style={`${btn} top: 50%; left: 22px; transform: translateY(-50%); width: 44px; height: 44px; justify-content: center; font-size: 20px;`}>‹</button>
      <button onClick={onNext} title="Next (→)" aria-label="Next color" style={`${btn} top: 50%; right: 22px; transform: translateY(-50%); width: 44px; height: 44px; justify-content: center; font-size: 20px;`}>›</button>
      <div style="position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.28); color: #fff; font: 500 12px var(--font-mono); padding: 5px 13px; border-radius: 999px;">{pos} / {total}</div>
      {detailHref && (
        <a href={detailHref} style={`${btn} bottom: 56px; right: 22px;`}>Details →</a>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check via build sync**

Run: `npx astro sync && npx tsc --noEmit -p tsconfig.json`
Expected: no type errors. (If `tsc` flags Astro virtual modules, rely on the `npm run build` gate in Task 10 instead; report the exact error if it blocks.)

- [ ] **Step 4: Commit**

```bash
git add src/islands/DesktopPreview.tsx src/islands/FullscreenPreview.tsx
git commit -m "feat: add DesktopPreview and shared FullscreenPreview components"
```

---

### Task 5: Download sheet with client-side wallpaper generation (TDD)

**Files:**
- Create: `src/islands/DownloadSheet.tsx`
- Test: `src/islands/DownloadSheet.test.tsx`

**Interfaces:**
- Consumes: `RESOLUTION_GROUPS`, `wallpaperFilename`, `parseDimension` from `../lib/wallpaper`; `track` from `../lib/track`.
- Produces:
  - `generateWallpaper(hex: string, w: number, h: number): Promise<Blob>` — draws a solid `hex` on an offscreen `<canvas>` and resolves the PNG blob. Exported for reuse; guarded so it throws a clear error if canvas/`toBlob` is unavailable.
  - `downloadWallpaper(osSlug: string, colorName: string, hex: string, w: number, h: number): Promise<void>` — calls `generateWallpaper`, triggers a download named via `wallpaperFilename`, then `track({ kind: "download", hex, os: osSlug })`.
  - `DownloadSheet({ osSlug, color, onClose }: { osSlug: string; color: { hex: string; name: string }; onClose: () => void })` — a modal: preset buttons (from `RESOLUTION_GROUPS`) and a custom W×H form (validated with `parseDimension`, invalid input disables Get), each triggering `downloadWallpaper`. Backdrop click closes.
- Testing note: `generateWallpaper` needs a real canvas; jsdom's canvas is a stub. Unit-test the **pure** wiring — that invalid custom dimensions disable the Get button and valid ones enable it, and that preset buttons render — and stub `downloadWallpaper` via a prop-injected callback so no real canvas is required. To make that testable, accept an optional `onDownload` prop defaulting to `downloadWallpaper`; tests pass a spy.

- [ ] **Step 1: Write the failing test `src/islands/DownloadSheet.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { DownloadSheet } from "./DownloadSheet";

const color = { hex: "#008080", name: "Teal" };

describe("DownloadSheet", () => {
  it("renders preset resolution buttons", () => {
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1920×1080" })).toBeTruthy();
    expect(screen.getByText("Desktop")).toBeTruthy();
  });

  it("invokes onDownload with preset dimensions", () => {
    const spy = vi.fn();
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={spy} />);
    fireEvent.click(screen.getByRole("button", { name: "1920×1080" }));
    expect(spy).toHaveBeenCalledWith("windows-95", "Teal", "#008080", 1920, 1080);
  });

  it("disables Get for invalid custom dimensions and enables for valid", () => {
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={vi.fn()} />);
    const get = screen.getByRole("button", { name: "Get" }) as HTMLButtonElement;
    expect(get.disabled).toBe(true);
    fireEvent.input(screen.getByPlaceholderText("width"), { target: { value: "1600" } });
    fireEvent.input(screen.getByPlaceholderText("height"), { target: { value: "900" } });
    expect(get.disabled).toBe(false);
    fireEvent.input(screen.getByPlaceholderText("width"), { target: { value: "abc" } });
    expect((screen.getByRole("button", { name: "Get" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("invokes onDownload with custom dimensions", () => {
    const spy = vi.fn();
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={spy} />);
    fireEvent.input(screen.getByPlaceholderText("width"), { target: { value: "1600" } });
    fireEvent.input(screen.getByPlaceholderText("height"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "Get" }));
    expect(spy).toHaveBeenCalledWith("windows-95", "Teal", "#008080", 1600, 900);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/DownloadSheet.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/islands/DownloadSheet.tsx`**

```tsx
import { useState } from "preact/hooks";
import { RESOLUTION_GROUPS, wallpaperFilename, parseDimension } from "../lib/wallpaper";
import { track } from "../lib/track";

export async function generateWallpaper(hex: string, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}

export async function downloadWallpaper(
  osSlug: string, colorName: string, hex: string, w: number, h: number,
): Promise<void> {
  const blob = await generateWallpaper(hex, w, h);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = wallpaperFilename(osSlug, colorName, hex, w, h);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  track({ kind: "download", hex, os: osSlug });
}

interface Props {
  osSlug: string;
  color: { hex: string; name: string };
  onClose: () => void;
  onDownload?: (osSlug: string, colorName: string, hex: string, w: number, h: number) => void;
}

export function DownloadSheet({ osSlug, color, onClose, onDownload = downloadWallpaper }: Props) {
  const [cw, setCw] = useState("");
  const [ch, setCh] = useState("");
  const customW = parseDimension(cw);
  const customH = parseDimension(ch);
  const customValid = customW !== null && customH !== null;

  const stop = (e: Event) => e.stopPropagation();

  return (
    <div onClick={onClose} style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 90; display: flex; align-items: center; justify-content: center;">
      <div onClick={stop} style="width: 100%; max-width: 460px; max-height: 92vh; overflow-y: auto; background: var(--bg); border-radius: 18px; padding: 18px 20px 22px; box-shadow: 0 14px 40px rgba(0,0,0,0.25);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style={`width: 34px; height: 34px; border-radius: 8px; background-color: ${color.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
            <div>
              <div style="font: 500 15px var(--font-ui);">Download {color.name}</div>
              <div style="font: 400 11px var(--font-mono); color: var(--muted);">{color.hex} · PNG</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style="border: none; background: transparent; cursor: pointer; font-size: 18px; color: var(--faint);">✕</button>
        </div>

        {RESOLUTION_GROUPS.map((g) => (
          <div key={g.label}>
            <div style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1px; margin: 12px 0 7px;">{g.label}</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 7px;">
              {g.items.map((it) => (
                <button
                  key={it.label}
                  onClick={() => onDownload(osSlug, color.name, color.hex, it.w, it.h)}
                  style="border: 1px solid var(--field-border); background: var(--panel); color: var(--ink); cursor: pointer; font: 500 12px var(--font-mono); padding: 9px 8px; border-radius: 9px;"
                >{it.label}</button>
              ))}
            </div>
          </div>
        ))}

        <div style="display: flex; align-items: center; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--card-border);">
          <input value={cw} onInput={(e) => setCw((e.target as HTMLInputElement).value)} placeholder="width" style="flex: 1; border: 1px solid var(--field-border); background: var(--panel); font: 500 12px var(--font-mono); padding: 9px 10px; border-radius: 9px; min-width: 0;" />
          <span style="color: var(--faint);">×</span>
          <input value={ch} onInput={(e) => setCh((e.target as HTMLInputElement).value)} placeholder="height" style="flex: 1; border: 1px solid var(--field-border); background: var(--panel); font: 500 12px var(--font-mono); padding: 9px 10px; border-radius: 9px; min-width: 0;" />
          <button
            disabled={!customValid}
            onClick={() => { if (customValid) onDownload(osSlug, color.name, color.hex, customW!, customH!); }}
            style={`border: none; cursor: ${customValid ? "pointer" : "not-allowed"}; background: ${customValid ? "var(--ink)" : "#cbc7c1"}; color: #fff; font: 500 13px var(--font-ui); padding: 10px 16px; border-radius: 9px;`}
          >Get</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/islands/DownloadSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/islands/DownloadSheet.tsx src/islands/DownloadSheet.test.tsx
git commit -m "feat: add download sheet with client-side wallpaper generation"
```

---

### Task 6: OS detail page + island (TDD for the island)

**Files:**
- Create: `src/islands/OsDetail.tsx`
- Test: `src/islands/OsDetail.test.tsx`
- Create: `src/pages/os/[slug].astro`

**Interfaces:**
- Consumes: `OsDetailView`, `DetailColor` from `../lib/detail`; `DesktopPreview`, `FullscreenPreview`, `DownloadSheet`; `track` from `../lib/track`; `loadEntries`, `loadCatalog`, `buildOsDetail` in the page.
- Produces:
  - `OsDetail({ view }: { view: OsDetailView })` — the interactive detail UI. State: selected color index (preselected from `?hex=` on mount), download-sheet open, fullscreen open. Renders: header (name/family/year, prev/next OsRef links), the live `DesktopPreview` for the selected color with an Expand button (opens `FullscreenPreview`), the color list (click to select), the selected color's detail block (name, note, default badge, Download button opening `DownloadSheet`), copy rows for HEX/RGB/HSL/closest-RAL (each calls `navigator.clipboard.writeText` + `track({kind:"copy"})` + shows a transient "Copied ✓"), the "Similar colors elsewhere" grid (deduped, linking via `href`), and "Colors of the same era". Fires `track({ kind: "osview", os: view.os.slug })` once on mount.
  - The page `os/[slug].astro`: `getStaticPaths()` from `loadCatalog()` (one route per `osList` slug); in the page body, `buildOsDetail(await loadEntries(), catalog, slug)` and render `<OsDetail view={view} client:load />` inside `Base`. SEO `<title>`/description from the OS.

Testing note: unit-test the island's behavior that does not require a real clipboard/canvas — selection switching, copy-row calls (stub `navigator.clipboard.writeText` via a spy), and that the download button opens the sheet. Preselection-from-URL is covered by a test that sets `window.history`/`location` search before mount, OR accept an optional `initialHex` prop (defaulting to reading `location`) so the test can inject it deterministically. Use the `initialHex` prop approach.

- [ ] **Step 1: Write the failing test `src/islands/OsDetail.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { OsDetail } from "./OsDetail";
import type { OsDetailView } from "../lib/detail";

const view: OsDetailView = {
  os: {
    slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows",
    tagline: "t", description: "The teal era.", desktopStyle: "win9x",
    defaultHex: "#008080", colorCount: 2, score: 0, scoreLabel: "< 1k",
    predecessor: null, successor: { slug: "windows-98", name: "Windows 98", year: 1998 },
    colors: [],
  },
  colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "default", isDefault: true, rgb: "0, 128, 128", hsl: "180° 100% 25%", onColor: "#ffffff", family: "teal", tone: "dark", shade: "deep", score: 0, scoreLabel: "< 1k", ral: { code: "RAL 5021", name: "Water Blue", hex: "#07737a" }, similar: [{ hex: "#4e9a9a", name: "Teal", osSlug: "kde-1", osName: "KDE 1", match: 88, onColor: "#ffffff", href: "/os/kde-1?hex=%234e9a9a" }], firstUse: { slug: "cde", name: "CDE", year: 1993, self: false, href: "/os/cde" } },
    { hex: "#000080", name: "Navy", index: "1", note: "cool", isDefault: false, rgb: "0, 0, 128", hsl: "240° 100% 25%", onColor: "#ffffff", family: "blue", tone: "dark", shade: "deep", score: 0, scoreLabel: "< 1k", ral: { code: "RAL 5002", name: "Ultramarine", hex: "#20214f" }, similar: [], firstUse: { slug: "windows-95", name: "Windows 95", year: 1995, self: true, href: "/os/windows-95" } },
  ],
  eraPeers: [{ slug: "cde", name: "CDE", family: "Desktop Env.", year: 1993, hex: "#9aabb9", colorName: "Dusty Blue", rel: "2 yr earlier", onColor: "#1c1917", href: "/os/cde" }],
};

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("OsDetail", () => {
  it("shows the OS name and default-selected color values", () => {
    render(<OsDetail view={view} initialHex={null} />);
    expect(screen.getByRole("heading", { name: "Windows 95" })).toBeTruthy();
    expect(screen.getAllByText("0, 128, 128").length).toBeGreaterThan(0); // teal RGB (default)
  });

  it("preselects the color from initialHex", () => {
    render(<OsDetail view={view} initialHex="#000080" />);
    expect(screen.getAllByText("0, 0, 128").length).toBeGreaterThan(0); // navy RGB
  });

  it("switches the selected color on click", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByText("Navy"));
    expect(screen.getAllByText("0, 0, 128").length).toBeGreaterThan(0);
  });

  it("copies the hex value on click of the HEX row", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByTestId("copy-hex"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("#008080");
  });

  it("opens the download sheet", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(screen.getByText(/Download Teal/)).toBeTruthy();
  });

  it("renders similar colors and era peers", () => {
    render(<OsDetail view={view} initialHex={null} />);
    expect(screen.getByText(/Similar colors elsewhere/)).toBeTruthy();
    const era = screen.getByText(/Colors of the same era/);
    expect(era).toBeTruthy();
    expect(screen.getByText("CDE")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/OsDetail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/islands/OsDetail.tsx`**

```tsx
import { useEffect, useMemo, useState } from "preact/hooks";
import type { OsDetailView, DetailColor } from "../lib/detail";
import { DesktopPreview } from "./DesktopPreview";
import { FullscreenPreview } from "./FullscreenPreview";
import { DownloadSheet } from "./DownloadSheet";
import { track } from "../lib/track";

interface Props { view: OsDetailView; initialHex?: string | null }

function readInitialHex(): string | null {
  try { return new URLSearchParams(window.location.search).get("hex"); }
  catch { return null; }
}

type CopyKey = "hex" | "rgb" | "hsl" | "ral";

export function OsDetail({ view, initialHex }: Props) {
  const { os, colors, eraPeers } = view;

  const startIdx = useMemo(() => {
    const wanted = (initialHex === undefined ? readInitialHex() : initialHex);
    if (!wanted) return 0;
    const i = colors.findIndex((c) => c.hex.toLowerCase() === decodeURIComponent(wanted).toLowerCase());
    return i >= 0 ? i : 0;
  }, [colors, initialHex]);

  const [sel, setSel] = useState(startIdx);
  const [sheet, setSheet] = useState(false);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState<CopyKey | null>(null);

  useEffect(() => { track({ kind: "osview", os: os.slug }); }, [os.slug]);

  const c: DetailColor = colors[sel] ?? colors[0];

  const copy = (key: CopyKey, text: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
    track({ kind: "copy", hex: c.hex, os: os.slug });
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1300);
  };

  const step = (d: number) => setSel((s) => (s + d + colors.length) % colors.length);

  const copyRow = (key: CopyKey, label: string, value: string, toCopy: string, swatch?: string) => (
    <div data-testid={`copy-${key}`} onClick={() => copy(key, toCopy)} title={`Copy ${label}`}
      style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 14px; cursor: pointer;">
      <span style="font: 400 11px var(--font-mono); color: var(--faint);">{label}</span>
      <span style="display: inline-flex; align-items: center; gap: 10px;">
        {swatch && <span style={`width: 11px; height: 11px; border-radius: 3px; background-color: ${swatch}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);`} />}
        <span style="font: 500 13px var(--font-mono);">{value}</span>
        <span style={`font: 500 10px var(--font-mono); width: 52px; text-align: right; color: ${copied === key ? "oklch(0.55 0.15 150)" : "#cbc7c1"};`}>{copied === key ? "Copied ✓" : "Copy"}</span>
      </span>
    </div>
  );

  return (
    <div style="max-width: 1180px; margin: 0 auto; padding: 18px 32px 56px;">
      <a href="/" style="font: 400 13px var(--font-mono); color: var(--faint);">← Browse all platforms</a>
      <div style="font: 400 12px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-top: 14px;">{os.family} · {os.year}</div>
      <h1 style="font: 700 36px var(--font-ui); letter-spacing: -0.8px; margin: 6px 0 8px;">{os.name}</h1>
      <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 680px; margin: 0 0 16px;">{os.description}</p>

      <div style="display: flex; gap: 8px; margin-bottom: 22px;">
        {os.predecessor && <a href={`/os/${os.predecessor.slug}`} style="border: 1px solid var(--card-border); border-radius: 9px; background: var(--panel); padding: 8px 13px; font: 500 13px var(--font-ui);">← {os.predecessor.name}</a>}
        {os.successor && <a href={`/os/${os.successor.slug}`} style="border: 1px solid var(--card-border); border-radius: 9px; background: var(--panel); padding: 8px 13px; font: 500 13px var(--font-ui);">{os.successor.name} →</a>}
      </div>

      <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 28px; align-items: stretch; min-height: 372px;">
        <div style="position: relative; border-radius: 14px; overflow: hidden; border: 1px solid var(--field-border); box-shadow: 0 10px 28px rgba(0,0,0,0.12); min-height: 340px;">
          <DesktopPreview hex={c.hex} onColor={c.onColor} style={os.desktopStyle} />
          <button onClick={() => setFull(true)} style="position: absolute; top: 12px; right: 12px; z-index: 2; cursor: pointer; background: rgba(255,255,255,0.92); border: none; border-radius: 9px; padding: 8px 12px; font: 500 12px var(--font-ui);">⤢ Expand</button>
        </div>
        <div style="border: 1px solid var(--card-border); border-radius: 14px; background: var(--panel); overflow: hidden; display: flex; flex-direction: column;">
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--card-border); font: 500 14px var(--font-ui);">All colors <span style="font: 400 11px var(--font-mono); color: var(--faint);">· {os.colorCount}</span></div>
          <div style="flex: 1; overflow-y: auto; padding: 8px; max-height: 320px;">
            {colors.map((col, i) => (
              <div key={col.hex} onClick={() => setSel(i)} style={`cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 9px; background: ${i === sel ? "oklch(0.96 0.03 255)" : "transparent"};`}>
                <div style={`width: 32px; height: 32px; border-radius: 7px; background-color: ${col.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                <div style="flex: 1;">
                  <div style="font: 500 13px var(--font-ui);">{col.name}</div>
                  <div style="font: 400 11px var(--font-mono); color: var(--faint);">{col.hex} · idx {col.index}</div>
                </div>
                {col.isDefault && <span title="Default" style="width: 7px; height: 7px; border-radius: 50%; background: var(--accent);" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style="border: 1px solid var(--card-border); border-radius: 12px; background: var(--panel); padding: 18px 20px; margin-top: 20px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style={`width: 48px; height: 48px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
          <div style="flex: 1;">
            <div style="display: inline-flex; align-items: center; gap: 9px;">
              <span style="font: 500 20px var(--font-ui);">{c.name}</span>
              {c.isDefault && <span style="background: oklch(0.96 0.03 255); color: var(--accent-strong); font: 600 9px var(--font-ui); letter-spacing: 0.5px; padding: 4px 8px; border-radius: 999px;">DEFAULT</span>}
            </div>
            <div style="font: 400 12px var(--font-mono); color: var(--muted); margin-top: 2px;">{c.note}</div>
          </div>
          <button onClick={() => setSheet(true)} style="border: none; cursor: pointer; background: var(--ink); color: #fff; font: 500 13px var(--font-ui); padding: 11px 17px; border-radius: 10px;">↓ Download</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;">
          <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
            <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 5px;">DETAILS</div>
            <div style="display: flex; justify-content: space-between; padding: 7px 14px;"><span style="font: 400 11px var(--font-mono); color: var(--faint);">Palette index</span><span style="font: 500 13px var(--font-mono);">{c.index}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 7px 14px 11px;"><span style="font: 400 11px var(--font-mono); color: var(--faint);">First known use</span><a href={c.firstUse.href} style="font: 500 13px var(--font-mono); color: var(--accent-strong);">{c.firstUse.name} · {c.firstUse.year} ↗</a></div>
          </div>
          <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
            <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 5px;">COLOR VALUES · CLICK TO COPY</div>
            {copyRow("hex", "HEX", c.hex, c.hex)}
            {copyRow("rgb", "RGB", c.rgb, `rgb(${c.rgb})`)}
            {copyRow("hsl", "HSL", c.hsl, c.hsl)}
            {copyRow("ral", "Closest RAL", `${c.ral.code} · ${c.ral.name}`, `${c.ral.code} · ${c.ral.name}`, c.ral.hex)}
          </div>
        </div>
      </div>

      <div style="border-top: 1px solid var(--hairline); margin-top: 34px; padding-top: 26px;">
        <h2 style="font: 500 20px var(--font-ui); margin: 0 0 18px;">Similar colors elsewhere</h2>
        {c.similar.length === 0 ? (
          <div style="font: 400 13px var(--font-mono); color: var(--faint);">No close matches on other platforms.</div>
        ) : (
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px;">
            {c.similar.map((s) => (
              <a key={s.hex + s.osSlug} href={s.href} style="border: 1px solid var(--card-border); border-radius: 13px; overflow: hidden; background: var(--panel); display: block;">
                <div style={`position: relative; height: 76px; background-color: ${s.hex};`}>
                  <span style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); color: #1c1917; font: 500 10px var(--font-ui); padding: 3px 8px; border-radius: 999px;">{s.match}% match</span>
                </div>
                <div style="padding: 11px 13px 13px;">
                  <div style="font: 500 14px var(--font-ui);">{s.name}</div>
                  <div style="font: 400 11px var(--font-mono); color: var(--faint);">{s.hex}</div>
                  <div style="font: 400 12px var(--font-ui); color: var(--muted); margin-top: 8px;">{s.osName} ↗</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      <div style="border-top: 1px solid var(--hairline); margin-top: 34px; padding-top: 26px;">
        <h2 style="font: 500 20px var(--font-ui); margin: 0 0 18px;">Colors of the same era</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px;">
          {eraPeers.map((e) => (
            <a key={e.slug} href={e.href} style="border: 1px solid var(--card-border); border-radius: 13px; overflow: hidden; background: var(--panel); display: block;">
              <div style={`position: relative; height: 88px; background-color: ${e.hex};`}>
                <span style={`position: absolute; top: 8px; left: 10px; font: 500 12px var(--font-ui); color: ${e.onColor};`}>{e.colorName}</span>
                <span style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); color: #1c1917; font: 500 10px var(--font-mono); padding: 3px 8px; border-radius: 999px;">{e.rel}</span>
              </div>
              <div style="padding: 11px 13px 13px;">
                <div style="font: 500 14px var(--font-ui);">{e.name} ↗</div>
                <div style="font: 400 11px var(--font-mono); color: var(--faint);">{e.year} · {e.family}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {sheet && <DownloadSheet osSlug={os.slug} color={{ hex: c.hex, name: c.name }} onClose={() => setSheet(false)} />}
      {full && (
        <FullscreenPreview
          hex={c.hex} onColor={c.onColor} style={os.desktopStyle}
          label={`${os.name} · ${c.name} · ${c.hex}`}
          pos={sel + 1} total={colors.length}
          onClose={() => setFull(false)} onPrev={() => step(-1)} onNext={() => step(1)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/islands/OsDetail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create `src/pages/os/[slug].astro`**

```astro
---
import Base from "../../layouts/Base.astro";
import { OsDetail } from "../../islands/OsDetail";
import { loadCatalog } from "../../lib/loadCatalog";
import { loadEntries } from "../../lib/entries";
import { buildOsDetail } from "../../lib/detail";

export async function getStaticPaths() {
  const catalog = await loadCatalog();
  return catalog.osList.map((o) => ({ params: { slug: o.slug } }));
}

const { slug } = Astro.params;
const catalog = await loadCatalog();
const entries = await loadEntries();
const view = buildOsDetail(entries, catalog, slug!);
const { os } = view;
---
<Base
  title={`${os.name} desktop colors — desktopcolors.com`}
  description={`${os.name} (${os.year}) desktop background colors: ${os.defaultHex} and ${os.colorCount - 1} more, with previews and downloadable wallpapers.`}
>
  <OsDetail view={view} client:load />
</Base>
```

- [ ] **Step 6: Build to verify the routes prerender**

Run: `npm run build`
Expected: build succeeds; `dist/os/windows-95/index.html` exists and contains "Windows 95" and "Teal". Verify: `test -f dist/os/windows-95/index.html && grep -q "Teal" dist/os/windows-95/index.html`.

- [ ] **Step 7: Run the full suite, then commit**

Run: `npm test`
Expected: all green.

```bash
git add src/islands/OsDetail.tsx src/islands/OsDetail.test.tsx src/pages/os/
git commit -m "feat: add OS detail page with selector, copy, preview, download, fullscreen"
```

---

### Task 7: Color Explorer page + island (TDD for the island)

**Files:**
- Create: `src/islands/Explorer.tsx`
- Test: `src/islands/Explorer.test.tsx`
- Create: `src/pages/explorer.astro`

**Interfaces:**
- Consumes: `ExplorerColor`, `groupIntoBands`, `rankColors`, `familyCounts`, `shadeCountsFor`, `FAMILY_DEFS`, `SHADE_DEFS` from `../lib/explorer`; `FullscreenPreview`; `FamilyKey`, `ShadeKey` from `../lib/color`; `loadCatalog`, `toExplorerColors` in the page.
- Produces:
  - `Explorer({ colors, styleBySlug }: { colors: ExplorerColor[]; styleBySlug: Record<string, DesktopStyle> })` — the interactive explorer. State: group (`hue` default | `tone` | `flat`), sort (`spectrum` default | `pop`), family filter, shade filter, fullscreen selection. Renders group/sort segmented controls, the family chip row (with counts) and shade sub-row (when a family with >1 shade is selected), then either the grouped bands (`groupIntoBands`) or the leaderboard (`rankColors`, when group is `flat`). Every color swatch links to its `href`; a "⤢ Preview" control opens `FullscreenPreview` over the currently-listed colors (with `detailHref` = the color's `href`). `styleBySlug` supplies the desktopStyle for the preview via each color's `primarySlug`.
  - The page `explorer.astro`: `const catalog = await loadCatalog(); const colors = toExplorerColors(catalog);` plus `styleBySlug` from `catalog.osList`; render `<Explorer colors={colors} styleBySlug={styleBySlug} client:load />` in `Base` with `active="explorer"`.

Testing note: cover grouping toggles, family filter, and leaderboard switch over a small fixture; fullscreen open. No canvas/clipboard needed.

- [ ] **Step 1: Write the failing test `src/islands/Explorer.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { Explorer } from "./Explorer";
import type { ExplorerColor } from "../lib/explorer";

const colors: ExplorerColor[] = [
  { hex: "#008080", name: "Teal", family: "teal", tone: "dark", shade: "deep", h: 180, s: 100, l: 25, onColor: "#ffffff", score: 5000, scoreLabel: "5k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95?hex=%23008080" },
  { hex: "#ff0000", name: "Red", family: "red", tone: "bright", shade: "mid", h: 0, s: 100, l: 50, onColor: "#ffffff", score: 1000, scoreLabel: "1k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95?hex=%23ff0000" },
];
const styleBySlug = { "windows-95": "win9x" as const };

describe("Explorer", () => {
  it("renders grouped bands by hue by default", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    expect(screen.getByText("Teals")).toBeTruthy();
    expect(screen.getByText("Reds")).toBeTruthy();
  });

  it("filters to a family when its chip is clicked", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    fireEvent.click(screen.getByRole("button", { name: /Teals/ }));
    expect(screen.queryByText("Reds")).toBeNull();
    expect(screen.getByText("Teals")).toBeTruthy();
  });

  it("switches to the leaderboard when Ungrouped is chosen", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    fireEvent.click(screen.getByRole("button", { name: "Ungrouped" }));
    fireEvent.click(screen.getByRole("button", { name: "Popularity" }));
    // leaderboard ranks teal (5k) first
    const rows = screen.getAllByTestId("rank-row");
    expect(within(rows[0]).getByText("Teal")).toBeTruthy();
  });
});

import { within } from "@testing-library/preact";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/Explorer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/islands/Explorer.tsx`**

```tsx
import { useMemo, useState } from "preact/hooks";
import type { DesktopStyle } from "../content/config";
import type { FamilyKey, ShadeKey } from "../lib/color";
import {
  groupIntoBands, rankColors, familyCounts, shadeCountsFor,
  FAMILY_DEFS, SHADE_DEFS, type ExplorerColor,
} from "../lib/explorer";
import { FullscreenPreview } from "./FullscreenPreview";

interface Props { colors: ExplorerColor[]; styleBySlug: Record<string, DesktopStyle> }
type Group = "hue" | "tone" | "flat";
type Sort = "spectrum" | "pop";

const seg = (active: boolean): string =>
  `cursor: pointer; border: none; border-radius: 999px; padding: 7px 15px; font: 500 13px var(--font-ui); background: ${active ? "#fff" : "transparent"}; color: ${active ? "var(--ink)" : "var(--muted)"}; box-shadow: ${active ? "0 1px 3px rgba(0,0,0,0.14)" : "none"};`;

export function Explorer({ colors, styleBySlug }: Props) {
  const [group, setGroup] = useState<Group>("hue");
  const [sort, setSort] = useState<Sort>("spectrum");
  const [family, setFamily] = useState<FamilyKey | null>(null);
  const [shade, setShade] = useState<ShadeKey | null>(null);
  const [pv, setPv] = useState<{ list: ExplorerColor[]; idx: number } | null>(null);

  const counts = useMemo(() => familyCounts(colors), [colors]);
  const shadeCounts = useMemo(() => family ? shadeCountsFor(colors, family) : null, [colors, family]);

  const bands = useMemo(
    () => group === "flat" ? [] : groupIntoBands(colors, { group: group === "tone" ? "tone" : "hue", family, shade, sort }),
    [colors, group, family, shade, sort]);
  const ranking = useMemo(
    () => group === "flat" ? rankColors(colors, { family, sort }) : [],
    [colors, group, family, sort]);

  const openPv = (list: ExplorerColor[], idx: number) => setPv({ list, idx });
  const stepPv = (d: number) => setPv((s) => s ? { ...s, idx: (s.idx + d + s.list.length) % s.list.length } : s);
  const cur = pv ? pv.list[pv.idx] : null;

  const toggleFamily = (k: FamilyKey) => { setFamily((f) => f === k ? null : k); setShade(null); };

  return (
    <div style="max-width: 1180px; margin: 0 auto; padding: 26px 32px 56px;">
      <h1 style="font: 700 32px var(--font-ui); letter-spacing: -0.8px; margin: 0;">Color Explorer</h1>
      <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 640px; margin: 8px 0 0;">Group by hue or tone to browse, or ungroup to rank colors by how often people download and copy them.</p>

      <div style="display: flex; align-items: center; gap: 26px; flex-wrap: wrap; margin-top: 20px;">
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">GROUP</span>
          <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
            <button style={seg(group === "hue")} onClick={() => { setGroup("hue"); setShade(null); }}>By hue</button>
            <button style={seg(group === "tone")} onClick={() => { setGroup("tone"); setShade(null); }}>By tone</button>
            <button style={seg(group === "flat")} onClick={() => setGroup("flat")}>Ungrouped</button>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
          <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
            <button style={seg(sort === "spectrum")} onClick={() => setSort("spectrum")}>Spectrum</button>
            <button style={seg(sort === "pop")} onClick={() => setSort("pop")}>Popularity</button>
          </div>
        </div>
      </div>

      <div style="margin-top: 18px;">
        <div style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-bottom: 12px;">BASIC COLORS — CLICK TO NARROW</div>
        <div style="display: flex; gap: 9px; flex-wrap: wrap;">
          {FAMILY_DEFS.map((f) => {
            const active = family === f.key;
            return (
              <button key={f.key} onClick={() => toggleFamily(f.key)} style={`cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 14px 8px 10px; font: 500 13px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                <span style={`width: 15px; height: 15px; border-radius: 50%; background-color: ${f.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                {f.name}<span style="font: 400 11px var(--font-mono); opacity: 0.6;">{counts[f.key]}</span>
              </button>
            );
          })}
          {family && <button onClick={() => { setFamily(null); setShade(null); }} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui); padding: 8px 6px;">Clear ✕</button>}
        </div>
        {group === "hue" && family && shadeCounts && SHADE_DEFS.filter((s) => shadeCounts[s.key] > 0).length > 1 && (
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 14px;">
            <span style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SHADE</span>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              {SHADE_DEFS.filter((s) => shadeCounts[s.key] > 0).map((s) => {
                const active = shade === s.key;
                return (
                  <button key={s.key} onClick={() => setShade((x) => x === s.key ? null : s.key)} style={`cursor: pointer; display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 6px 12px 6px 8px; font: 500 12px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                    <span style={`width: 13px; height: 13px; border-radius: 50%; background-color: ${s.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                    {s.name}<span style="font: 400 10px var(--font-mono); opacity: 0.6;">{shadeCounts[s.key]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {group !== "flat" ? (
        <div style="margin-top: 18px;">
          {bands.map((b) => (
            <div key={b.key} style="display: grid; grid-template-columns: 190px 1fr; gap: 28px; padding: 22px 0; border-bottom: 1px solid var(--card-border); align-items: start;">
              <div>
                <div style="display: inline-flex; align-items: center; gap: 9px;">
                  <span style={`width: 20px; height: 20px; border-radius: 6px; background-color: ${b.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                  <span style="font: 500 18px var(--font-ui);">{b.name}</span>
                </div>
                <div style="font: 400 11px var(--font-mono); color: var(--faint); margin-top: 6px;">{b.colors.length} colors</div>
              </div>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                {b.colors.map((c, i) => (
                  <div key={c.hex} style="width: 116px;">
                    <a href={c.href} style="display: block;">
                      <div style={`position: relative; height: 78px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);`}>
                        <span style={`position: absolute; left: 9px; bottom: 8px; font: 500 11px var(--font-mono); color: ${c.onColor}; opacity: 0.9;`}>{c.hex}</span>
                      </div>
                      <div style="font: 500 13px var(--font-ui); margin-top: 8px;">{c.name}</div>
                      <div style="font: 400 11px var(--font-mono); color: var(--faint);">{c.yearRange}</div>
                    </a>
                    <button onClick={() => openPv(b.colors, i)} style="cursor: pointer; border: none; background: none; padding: 3px 0 0; font: 500 11px var(--font-ui); color: var(--accent-strong);">⤢ Preview</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 4px; max-width: 1000px;">
          {ranking.map((c, i) => (
            <div key={c.hex} data-testid="rank-row" style="display: grid; grid-template-columns: 40px 56px 1fr 220px 84px; gap: 16px; align-items: center; padding: 10px; border-radius: 12px;">
              <a href={c.href} style="font: 600 20px var(--font-mono); color: #cbc7c2; text-align: right;">{c.rank}</a>
              <a href={c.href} style={`display: block; height: 56px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);`} />
              <a href={c.href}>
                <span style="display: block; font: 500 15px var(--font-ui);">{c.name}</span>
                <span style="display: block; font: 400 12px var(--font-mono); color: var(--faint);">{c.hex} · {c.yearRange}</span>
              </a>
              <span style="display: flex; align-items: center; gap: 10px;">
                <span style="flex: 1; height: 8px; border-radius: 999px; background: var(--card-border); overflow: hidden;"><span style={`display: block; height: 100%; width: ${c.pct}%; background: var(--accent);`} /></span>
                <span style="flex: none; min-width: 52px; text-align: right; font: 500 12px var(--font-mono); color: var(--muted);">{c.scoreLabel}</span>
              </span>
              <button onClick={() => openPv(ranking, i)} style="cursor: pointer; border: none; background: none; font: 500 12px var(--font-ui); color: var(--accent-strong); text-align: right;">⤢ Preview</button>
            </div>
          ))}
        </div>
      )}

      {cur && (
        <FullscreenPreview
          hex={cur.hex} onColor={cur.onColor} style={styleBySlug[cur.primarySlug] ?? "generic"}
          label={`${cur.name} · ${cur.hex}`} pos={pv!.idx + 1} total={pv!.list.length}
          detailHref={cur.href}
          onClose={() => setPv(null)} onPrev={() => stepPv(-1)} onNext={() => stepPv(1)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/islands/Explorer.test.tsx`
Expected: PASS. (If the `import { within }` at the bottom of the test causes a hoist warning, move it to the top with the other imports — it is written at the bottom only to keep the fixture readable; relocating it is fine.)

- [ ] **Step 5: Create `src/pages/explorer.astro`**

```astro
---
import Base from "../layouts/Base.astro";
import { Explorer } from "../islands/Explorer";
import { loadCatalog } from "../lib/loadCatalog";
import { toExplorerColors } from "../lib/explorer";

const catalog = await loadCatalog();
const colors = toExplorerColors(catalog);
const styleBySlug: Record<string, string> = {};
for (const o of catalog.osList) styleBySlug[o.slug] = o.desktopStyle;
---
<Base title="Color Explorer — desktopcolors.com" description="Every solid desktop background color, grouped by hue or tone and ranked by popularity." active="explorer">
  <Explorer colors={colors} styleBySlug={styleBySlug} client:load />
</Base>
```

- [ ] **Step 6: Build to verify, then commit**

Run: `npm run build && test -f dist/explorer/index.html && grep -q "Color Explorer" dist/explorer/index.html && npm test`
Expected: build succeeds, explorer page present, full suite green.

```bash
git add src/islands/Explorer.tsx src/islands/Explorer.test.tsx src/pages/explorer.astro
git commit -m "feat: add Color Explorer page with grouping, filters, and leaderboard"
```

---

### Task 8: Browse list view + card/list toggle (TDD)

**Files:**
- Modify: `src/islands/BrowseControls.tsx`
- Modify: `src/islands/BrowseControls.test.tsx`

**Interfaces:**
- Consumes: unchanged `BrowseItem`.
- Produces: `BrowseControls` gains a working **card/list** view toggle (Plan 1 shipped card-only). Card view unchanged. List view renders each platform as a row: name + meta (year · family · N colors) on the left, a horizontal strip of its colors (default first, then alts) on the right, each swatch linking to `/os/<slug>?hex=<hex>`. Add `listColors` to `BrowseItem` (default + alts, `{hex,name}[]`) — populate it in `index.astro`. Default view remains card.

- [ ] **Step 1: Extend the test `src/islands/BrowseControls.test.tsx`**

Add `listColors` to the fixture items and add these cases (keep the existing ones):

```tsx
  it("toggles to list view and shows platform color strips", () => {
    render(<BrowseControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    // list view renders a color swatch link to the color's detail URL
    const link = screen.getByRole("link", { name: /Teal swatch/ });
    expect(link).toHaveAttribute("href", "/os/windows-95?hex=%23008080");
  });

  it("toggles back to card view", () => {
    render(<BrowseControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cards/ }));
    // card view shows the "N colors" count label
    expect(screen.getAllByText(/colors$/).length).toBeGreaterThan(0);
  });
```

Update the fixture items to include `listColors`, e.g. for Windows 95:
```tsx
listColors: [{ hex: "#008080", name: "Teal" }, { hex: "#000080", name: "Navy" }],
```
and for Amiga: `listColors: [{ hex: "#0055aa", name: "Workbench Blue" }]`.

- [ ] **Step 2: Run the test to verify the new cases fail**

Run: `npx vitest run src/islands/BrowseControls.test.tsx`
Expected: FAIL on the two new cases (no List toggle / no list view yet).

- [ ] **Step 3: Update `src/islands/BrowseControls.tsx`**

Add to the `BrowseItem` interface:
```tsx
  listColors: { hex: string; name: string }[];
```
Add view state and a toggle, and a list-view render branch. Insert near the sort control a view toggle:
```tsx
  const [view, setView] = useState<"card" | "list">("card");
```
Add the toggle UI (before the SORT control) :
```tsx
        <span style="font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">VIEW</span>
        <button onClick={() => setView("card")} style={`cursor: pointer; border: none; background: none; font: 500 15px var(--font-ui); color: ${view === "card" ? "var(--ink)" : "var(--faint)"};`}>▦ Cards</button>
        <button onClick={() => setView("list")} style={`cursor: pointer; border: none; background: none; font: 500 15px var(--font-ui); color: ${view === "list" ? "var(--ink)" : "var(--faint)"};`}>☰ List</button>
```
Replace the single card `<main>` with a conditional: keep the existing card grid when `view === "card"`; when `view === "list"`, render:
```tsx
        <main style="padding: 6px 48px 80px;">
          {shown.map((it) => (
            <div key={it.slug} style="display: grid; grid-template-columns: 230px 1fr; gap: 32px; padding: 26px 0; border-bottom: 1px solid var(--card-border); align-items: start;">
              <div>
                <a href={it.href} data-testid="os-name" style="font: 500 19px var(--font-ui);">{it.name} ↗</a>
                <div style="font: 400 12px var(--font-mono); color: var(--faint); margin-top: 6px;">{it.year} · {it.family} · {it.colorCount} colors</div>
                <div style="font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.5;">{it.tagline}</div>
              </div>
              <div style="display: flex; gap: 14px; flex-wrap: wrap;">
                {it.listColors.map((c) => (
                  <a key={c.hex} href={`/os/${it.slug}?hex=${encodeURIComponent(c.hex)}`} aria-label={`${c.name} swatch`} style="width: 100px;">
                    <div style={`height: 76px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.09);`} />
                    <div style="font: 500 12px var(--font-mono); margin-top: 8px;">{c.hex}</div>
                    <div style="font-size: 11px; color: var(--faint);">{c.name}</div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </main>
```
Keep the empty-state branch above both views. Note: the card view's `data-testid="os-name"` currently sits on a `<div>`; leave it. The list view uses `data-testid="os-name"` on the `<a>` — both are fine for the existing "sorts A–Z" test since it reads the first `os-name` in whichever view is active (card by default).

- [ ] **Step 4: Populate `listColors` in `src/pages/index.astro`**

In the `items` map, add:
```ts
  listColors: [
    { hex: o.defaultHex, name: o.colors.find((c) => c.isDefault)?.name ?? o.colors[0].name },
    ...o.colors.filter((c) => !c.isDefault).map((c) => ({ hex: c.hex, name: c.name })),
  ],
```

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run src/islands/BrowseControls.test.tsx && npm run build`
Expected: all BrowseControls tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/islands/BrowseControls.tsx src/islands/BrowseControls.test.tsx src/pages/index.astro
git commit -m "feat: add list view and card/list toggle to Browse"
```

---

### Task 9: Mobile nav menu

**Files:**
- Create: `src/islands/MobileNav.tsx`
- Test: `src/islands/MobileNav.test.tsx`
- Modify: `src/components/Header.astro`

**Interfaces:**
- Produces:
  - `MobileNav({ active }: { active?: string })` — a Preact island: a burger button that toggles a dropdown of the four nav links (Browse, Color Explorer, Setup Guide, About). Closes on link click. Same link set/hrefs as `Header.astro`.
  - `Header.astro` renders the existing wide `<nav>` (visible ≥760px via a CSS class) and the `MobileNav` island (visible <760px). Add a small `<style>` in Header (or a class in tokens.css) using a media query: `.dc-wide-nav { display: none } @media (min-width: 760px){ .dc-wide-nav{display:flex} .dc-mobile-nav{display:none} }`. Keep it simple and self-contained in Header.

- [ ] **Step 1: Write the failing test `src/islands/MobileNav.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { MobileNav } from "./MobileNav";

describe("MobileNav", () => {
  it("hides the menu until the burger is clicked", () => {
    render(<MobileNav />);
    expect(screen.queryByRole("link", { name: "Color Explorer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Menu/ }));
    expect(screen.getByRole("link", { name: "Color Explorer" })).toHaveAttribute("href", "/explorer");
  });

  it("closes when a link is clicked", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /Menu/ }));
    fireEvent.click(screen.getByRole("link", { name: "About" }));
    expect(screen.queryByRole("link", { name: "About" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/islands/MobileNav.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/islands/MobileNav.tsx`**

```tsx
import { useState } from "preact/hooks";

const LINKS = [
  { key: "browse", label: "Browse", href: "/" },
  { key: "explorer", label: "Color Explorer", href: "/explorer" },
  { key: "setup", label: "Setup Guide", href: "/setup" },
  { key: "about", label: "About", href: "/about" },
];

export function MobileNav({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style="position: relative;">
      <button onClick={() => setOpen((o) => !o)} aria-label="Menu" style="cursor: pointer; display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--field-border); border-radius: 10px; padding: 9px 13px; font: 500 14px var(--font-ui); color: var(--ink);">
        <span style="font-size: 15px; line-height: 1;">{open ? "✕" : "☰"}</span> Menu
      </button>
      {open && (
        <div style="position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; min-width: 180px; background: #fff; border: 1px solid var(--field-border); border-radius: 12px; box-shadow: 0 14px 34px rgba(0,0,0,0.16); padding: 6px; display: flex; flex-direction: column;">
          {LINKS.map((l) => (
            <a key={l.key} href={l.href} onClick={() => setOpen(false)} style={`display: block; padding: 11px 13px; border-radius: 8px; font: 500 14px var(--font-ui); color: ${l.key === active ? "var(--ink)" : "var(--muted)"};`}>{l.label}</a>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/islands/MobileNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `src/components/Header.astro`**

```astro
---
import { MobileNav } from "../islands/MobileNav";
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
  <nav class="dc-wide-nav" style="gap: 22px; font-size: 14px;">
    {links.map((l) => (
      <a href={l.href} style={`color: ${l.key === active ? "var(--ink)" : "var(--muted)"}; font-weight: ${l.key === active ? 500 : 400};`}>{l.label}</a>
    ))}
  </nav>
  <div class="dc-mobile-nav"><MobileNav active={active} client:load /></div>
</header>
<style>
  .dc-wide-nav { display: none; }
  .dc-mobile-nav { display: block; }
  @media (min-width: 760px) {
    .dc-wide-nav { display: flex; }
    .dc-mobile-nav { display: none; }
  }
</style>
```

- [ ] **Step 6: Build + full suite, then commit**

Run: `npm run build && npm test`
Expected: build succeeds; all tests green.

```bash
git add src/islands/MobileNav.tsx src/islands/MobileNav.test.tsx src/components/Header.astro
git commit -m "feat: add responsive mobile nav menu"
```

---

### Task 10: About + Setup Guide static pages

**Files:**
- Create: `src/pages/about.astro`
- Create: `src/pages/setup.astro`

**Interfaces:**
- Consumes: `Base`. Fully static, no islands.
- Produces: two content pages. About explains the project (what it archives, that colors are historically sourced, that wallpapers are generated in-browser, no tracking of personal data). Setup Guide explains how to set a downloaded wallpaper as a desktop background on Windows, macOS, and Linux (GNOME/KDE). Content is authored fresh (the prototype's copy was not fetched); keep it accurate to this project and concise.

- [ ] **Step 1: Create `src/pages/about.astro`**

```astro
---
import Base from "../layouts/Base.astro";
---
<Base title="About — desktopcolors.com" description="What desktopcolors.com is and how it works." active="about">
  <div style="max-width: 720px; margin: 0 auto; padding: 34px 32px 64px;">
    <h1 style="font: 700 32px var(--font-ui); letter-spacing: -0.6px; margin: 0 0 16px;">About</h1>
    <p style="font-size: 16px; line-height: 1.7; color: var(--ink); margin: 0 0 16px;">
      <strong>desktopcolors.com</strong> is an archive of the solid desktop background colors shipped by
      classic operating systems and desktop environments — the teal of Windows 95, the dusty blue of CDE,
      the four-color Amiga Workbench palette, and more.
    </p>
    <p style="font-size: 15px; line-height: 1.7; color: var(--muted); margin: 0 0 16px;">
      Each color is documented with its HEX, RGB, and HSL values and the closest RAL Classic match
      (computed with perceptual OKLab distance). You can preview any color as a full desktop, see where
      else the same color appeared, and download a matching wallpaper at any resolution.
    </p>
    <h2 style="font: 500 20px var(--font-ui); margin: 28px 0 10px;">How wallpapers are made</h2>
    <p style="font-size: 15px; line-height: 1.7; color: var(--muted); margin: 0 0 16px;">
      Every wallpaper is a solid color, so it is generated entirely in your browser — the pixels are drawn
      on a canvas on your device and never touch a server.
    </p>
    <h2 style="font: 500 20px var(--font-ui); margin: 28px 0 10px;">Privacy</h2>
    <p style="font-size: 15px; line-height: 1.7; color: var(--muted); margin: 0;">
      Popularity counts reflect anonymous, aggregate activity only. No personal data or IP addresses are stored.
    </p>
  </div>
</Base>
```

- [ ] **Step 2: Create `src/pages/setup.astro`**

```astro
---
import Base from "../layouts/Base.astro";
const steps = [
  { os: "Windows", body: "Download a wallpaper, right-click it, and choose “Set as desktop background.” Or open Settings → Personalization → Background, choose “Picture,” and browse to the file. For a solid color you can also pick Settings → Personalization → Background → “Solid color.”" },
  { os: "macOS", body: "Download a wallpaper, then open System Settings → Wallpaper → Add Photo → choose the file. On older macOS, use System Preferences → Desktop & Screen Saver and drag the image in." },
  { os: "GNOME (Linux)", body: "Download a wallpaper, open Settings → Appearance (or Background), and select the image file. Or right-click it in Files and choose “Set as Wallpaper.”" },
  { os: "KDE Plasma (Linux)", body: "Right-click the desktop → “Configure Desktop and Wallpaper,” set Wallpaper type to “Image,” and add the downloaded file." },
];
---
<Base title="Setup Guide — desktopcolors.com" description="How to set a downloaded wallpaper as your desktop background." active="setup">
  <div style="max-width: 720px; margin: 0 auto; padding: 34px 32px 64px;">
    <h1 style="font: 700 32px var(--font-ui); letter-spacing: -0.6px; margin: 0 0 8px;">Setup Guide</h1>
    <p style="font-size: 15px; line-height: 1.7; color: var(--muted); margin: 0 0 24px;">Download any color from a platform or the Color Explorer, then follow the steps for your system.</p>
    {steps.map((s) => (
      <div style="border: 1px solid var(--card-border); border-radius: 12px; background: var(--panel); padding: 18px 20px; margin-bottom: 14px;">
        <h2 style="font: 500 18px var(--font-ui); margin: 0 0 8px;">{s.os}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: var(--muted); margin: 0;">{s.body}</p>
      </div>
    ))}
  </div>
</Base>
```

- [ ] **Step 3: Build to verify both pages render**

Run: `npm run build && test -f dist/about/index.html && test -f dist/setup/index.html`
Expected: both exist.

- [ ] **Step 4: Commit**

```bash
git add src/pages/about.astro src/pages/setup.astro
git commit -m "feat: add About and Setup Guide pages"
```

---

### Task 11: Whole-site build verification

**Files:**
- No new source; this task is a verification gate and a short check script.

- [ ] **Step 1: Clean build**

Run: `rm -rf dist && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 2: Verify every expected route emitted**

Run:
```bash
for p in index explorer about setup os/windows-95 os/amiga-workbench os/kde-2; do
  test -f "dist/$p/index.html" && echo "OK $p" || echo "MISSING $p"
done
```
Expected: all `OK` (12 OS routes exist; spot-checking three). If any `MISSING`, investigate before proceeding.

- [ ] **Step 3: Verify detail content + cross-links**

Run:
```bash
grep -q "Similar colors elsewhere" dist/os/windows-95/index.html && echo "detail sections OK"
grep -q 'href="/os/windows-98' dist/os/windows-95/index.html && echo "successor link OK"
grep -q "Color Explorer" dist/explorer/index.html && echo "explorer OK"
```
Expected: all three print their OK line.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: all green (Plan 1 + wallpaper + detail + explorer + DownloadSheet + OsDetail + Explorer + MobileNav + BrowseControls).

- [ ] **Step 5: Commit (if any incidental fixes were needed)**

If Steps 1–4 required no changes, there is nothing to commit — record the verification in the task report instead.

```bash
git commit --allow-empty -m "chore: verify whole-site build and route emission for Plan 2"
```

---

## Self-review checklist (completed while writing)

- **Spec coverage (Plan 2 scope):** OS detail page with color selector, live preview, copy (HEX/RGB/HSL/closest-RAL), first-known-use, similar colors (deduped by hex — resolves Plan 1's deferred note), era peers, download sheet, fullscreen + keyboard nav ✓ (T2,T4,T5,T6); client-side wallpaper generation ✓ (T5); Color Explorer with hue/tone grouping, family+shade filters, spectrum/popularity sort, leaderboard, fullscreen ✓ (T3,T7); Browse list view + card/list toggle (Plan 1 deferral) ✓ (T8); mobile nav menu (Plan 1 deferral) ✓ (T9); About + Setup ✓ (T10); whole-site build gate ✓ (T11). Popularity events routed through the `track()` seam, no server calls ✓ (T1). Out of scope (later plans): counter service + real event transport (Plan 3–4), rebuild pipeline/nginx/systemd/TLS (Plan 4), `astro check` in CI (Plan 4).
- **Placeholder scan:** no TBD/TODO; every code step has full code. About/Setup copy is authored (noted as fresh, not prototype-sourced). The one deliberate deferral (event transport) is a defined no-op seam, not a gap.
- **Type/interface consistency:** reuses Plan 1 exports verbatim (`Catalog`/`OsView`/`ColorView`/`MergedColorView`, `SimilarColor`/`EraPeer`/`FirstUse`, `closestRal`, `hexToHsl`, `onColor`, `formatScore`, `DesktopStyle`); new types (`TrackEvent`, `ResolutionGroup`, `OsDetailView`/`DetailColor`/`SimilarView`/`EraPeerView`, `ExplorerColor`/`Band`) are each defined once and imported where used. `loadCatalog` refactor (T2) removes the collection-read duplication rather than adding a second copy. Wallpaper `downloadWallpaper` signature `(osSlug, colorName, hex, w, h)` matches its test and the `DownloadSheet`/`OsDetail` call sites.
- **Testability:** pure logic (wallpaper filename/parse, detail view model + dedupe, explorer bands/leaderboard/counts) is unit-tested without a browser; island tests inject spies/props (`onDownload`, `initialHex`) to avoid real canvas/clipboard/URL dependence; canvas draw and clipboard are exercised only through those seams.
