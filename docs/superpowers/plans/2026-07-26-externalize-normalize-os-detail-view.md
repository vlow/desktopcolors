# Externalize + Normalize the OS Detail View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the per-OS `DetailColor[]` out of every `/os/<slug>/<hex>` page's hydration props into one fetched, normalized `/os/<slug>/view.json`, keeping the initially-selected color inline for SSR — cutting `dist/` from ~370MB to ~65–70MB.

**Architecture:** The `OsDetail` island stops receiving the full view. Pages inline only `os` (which already carries the lightweight `colors: ColorView[]`), `eraPeers`, and the heavy detail for the *initial* color; the heavy detail for every color is emitted once per OS as a normalized JSON asset the island prefetches on mount. "Normalized" means repeated per-OS platform metadata (`name`/`year`/`family`) is collapsed into a `slug → meta` table.

**Tech Stack:** Astro 4 static build, Preact islands (`client:load`), Zod content collections, vitest (jsdom) for unit, Playwright for E2E.

## Global Constraints

- **Preserve current UX exactly:** instant client-side color switching, copy beacons, download sheet, fullscreen preview, similar-color navigation.
- **Preserve SSR first paint + no-JS view** for the initially-selected color (its heavy panels must be in the server HTML).
- **No network in vitest/jsdom** — network behavior is E2E-only (per `TESTING.md`).
- **Hex comparisons are case-insensitive**; store/lookup detail by `hex.toLowerCase()`.
- **Lowercase hex** everywhere (existing schema rule).
- `view.json` `details` array is aligned index-for-index with `os.colors`.
- Commit after each task. Conventional-commit messages, ending with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- `src/lib/detail.ts` — **modify.** Add normalization types + pure helpers (`ColorDetail`, wire types, `normalizeDetails`, `denormalizeDetails`, `pickColorDetail`, `osViewJsonFromView`, `bootstrapFromView`). Keep existing `buildOsDetail`/`OsDetailView` unchanged.
- `src/lib/osDetail.ts` — **modify.** Add async wrappers `loadOsBootstrap` and `loadOsViewJson` over the existing memoized `loadOsDetail`.
- `src/pages/os/[slug]/view.json.ts` — **create.** Static endpoint emitting `dist/os/<slug>/view.json`.
- `src/components/OsDetailPage.astro` — **modify.** Accept a bootstrap object, spread it into the island.
- `src/pages/os/[slug].astro`, `src/pages/os/[slug]/[hex].astro` — **modify.** Build the bootstrap via `loadOsBootstrap`.
- `src/islands/OsDetail.tsx` — **modify.** New props; drive light fields from `os.colors[sel]`, heavy fields from a `detailsByHex` map; prefetch + skeleton.
- `src/islands/DetailSkeleton.tsx` — **create.** Placeholder for the heavy panels while detail loads.
- `src/lib/detail.test.ts` — **modify.** Add tests for the new pure helpers.
- `src/islands/OsDetail.test.tsx` — **modify.** Rewrite fixture to the new props; add skeleton/loaded tests.
- `e2e/smoke.spec.ts` — **modify.** Add endpoint-shape test + lazy-load/skeleton test.
- `docs/architecture-frontend.md` — **modify.** Document the `view.json` data asset + island bootstrap split.

---

### Task 1: Normalization types + pure helpers in `detail.ts`

Adds the heavy-detail type and the normalize/denormalize round-trip. Pure, no consumers yet.

**Files:**
- Modify: `src/lib/detail.ts`
- Test: `src/lib/detail.test.ts`

**Interfaces:**
- Consumes: existing `DetailColor`, `SimilarView`, `RalMatch`, `CopyRow` (this file); `Platform` from `./colorCatalog`.
- Produces:
  - `type PlatformRef = { slug: string; isDefault: boolean }`
  - `type OsMeta = { name: string; year: number; family: string }`
  - `type OsMetaTable = Record<string, OsMeta>`
  - `interface ColorDetail { ral: RalMatch; ralDesign: RalMatch; extraFormats: CopyRow[]; similar: SimilarView[]; uses: Platform[] }`
  - `interface SimilarViewWire extends Omit<SimilarView, "platforms"> { platforms: PlatformRef[] }`
  - `interface ColorDetailWire { ral: RalMatch; ralDesign: RalMatch; extraFormats: CopyRow[]; similar: SimilarViewWire[]; uses: PlatformRef[] }`
  - `interface OsViewJson { osMeta: OsMetaTable; details: ColorDetailWire[] }`
  - `pickColorDetail(dc: DetailColor): ColorDetail`
  - `normalizeDetails(details: ColorDetail[]): OsViewJson`
  - `denormalizeDetails(json: OsViewJson): ColorDetail[]`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/detail.test.ts` (it already imports from `./detail` and builds `view` for `win-95`):

```ts
import {
  buildOsDetail, dedupeSimilarByHex,
  pickColorDetail, normalizeDetails, denormalizeDetails,
} from "./detail";

describe("normalizeDetails / denormalizeDetails", () => {
  const view = buildOsDetail(entries, catalog, "win-95");
  const details = view.colors.map(pickColorDetail);

  it("round-trips detail through the normalized wire form", () => {
    const json = normalizeDetails(details);
    expect(denormalizeDetails(json)).toEqual(details);
  });

  it("collapses each referenced OS's metadata into osMeta exactly once", () => {
    const { osMeta } = normalizeDetails(details);
    // cde supplies the teal known-use + era peer metadata
    expect(osMeta["cde"]).toEqual({ name: "CDE", year: 1993, family: "Fam" });
    // every platform slug referenced by any detail must be present
    for (const d of details) {
      for (const p of d.uses) expect(osMeta[p.slug]).toBeDefined();
      for (const s of d.similar) for (const p of s.platforms) expect(osMeta[p.slug]).toBeDefined();
    }
  });

  it("reduces wire platforms to slug + isDefault only", () => {
    const { details: wire } = normalizeDetails(details);
    for (const d of wire) {
      for (const p of d.uses) expect(Object.keys(p).sort()).toEqual(["isDefault", "slug"]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/detail.test.ts -t "normalizeDetails"`
Expected: FAIL — `pickColorDetail`/`normalizeDetails`/`denormalizeDetails` are not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/detail.ts`. Import `Platform`:

```ts
import { buildPlatformsByHex, type Platform } from "./colorCatalog";
```
(the file already imports `buildPlatformsByHex` and `Platform` as a type — merge, don't duplicate.)

Add the types near the other exports:

```ts
export type PlatformRef = { slug: string; isDefault: boolean };
export type OsMeta = { name: string; year: number; family: string };
export type OsMetaTable = Record<string, OsMeta>;

export interface ColorDetail {
  ral: RalMatch;
  ralDesign: RalMatch;
  extraFormats: CopyRow[];
  similar: SimilarView[];
  uses: Platform[];
}

export interface SimilarViewWire extends Omit<SimilarView, "platforms"> {
  platforms: PlatformRef[];
}
export interface ColorDetailWire {
  ral: RalMatch;
  ralDesign: RalMatch;
  extraFormats: CopyRow[];
  similar: SimilarViewWire[];
  uses: PlatformRef[];
}
export interface OsViewJson {
  osMeta: OsMetaTable;
  details: ColorDetailWire[];
}
```

Add the helpers at the end of the file:

```ts
export function pickColorDetail(dc: DetailColor): ColorDetail {
  return {
    ral: dc.ral, ralDesign: dc.ralDesign, extraFormats: dc.extraFormats,
    similar: dc.similar, uses: dc.uses,
  };
}

const refOf = (p: Platform): PlatformRef => ({ slug: p.slug, isDefault: p.isDefault });

export function normalizeDetails(details: ColorDetail[]): OsViewJson {
  const osMeta: OsMetaTable = {};
  const note = (p: Platform) => {
    osMeta[p.slug] ??= { name: p.name, year: p.year, family: p.family };
  };
  const wire: ColorDetailWire[] = details.map((d) => {
    d.uses.forEach(note);
    d.similar.forEach((s) => s.platforms.forEach(note));
    return {
      ral: d.ral, ralDesign: d.ralDesign, extraFormats: d.extraFormats,
      similar: d.similar.map((s) => ({ ...s, platforms: s.platforms.map(refOf) })),
      uses: d.uses.map(refOf),
    };
  });
  return { osMeta, details: wire };
}

export function denormalizeDetails(json: OsViewJson): ColorDetail[] {
  const hydrate = (ref: PlatformRef): Platform => {
    const m = json.osMeta[ref.slug];
    return { slug: ref.slug, name: m.name, year: m.year, family: m.family, isDefault: ref.isDefault };
  };
  return json.details.map((d) => ({
    ral: d.ral, ralDesign: d.ralDesign, extraFormats: d.extraFormats,
    similar: d.similar.map((s) => ({ ...s, platforms: s.platforms.map(hydrate) })),
    uses: d.uses.map(hydrate),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/detail.test.ts`
Expected: PASS (new + existing `buildOsDetail`/`dedupeSimilarByHex` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/detail.ts src/lib/detail.test.ts
git commit -m "feat(detail): add normalized ColorDetail wire form + round-trip helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Bootstrap + view-json builders

Two pure view-derived builders and their async, memoized wrappers.

**Files:**
- Modify: `src/lib/detail.ts`
- Modify: `src/lib/osDetail.ts`
- Test: `src/lib/detail.test.ts`

**Interfaces:**
- Consumes: `OsDetailView`, `OsView`, `EraPeerView`, `ColorDetail`, `OsViewJson`, `pickColorDetail`, `normalizeDetails` (Task 1); `loadOsDetail` (existing).
- Produces:
  - `interface OsDetailBootstrap { os: OsView; eraPeers: EraPeerView[]; initialHex: string | null; detailsByHex: Record<string, ColorDetail>; viewUrl: string }`
  - `bootstrapFromView(view: OsDetailView, initialHex: string | null): OsDetailBootstrap`
  - `osViewJsonFromView(view: OsDetailView): OsViewJson`
  - `loadOsBootstrap(slug: string, initialHex: string | null): Promise<OsDetailBootstrap>`
  - `loadOsViewJson(slug: string): Promise<OsViewJson>`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/detail.test.ts`:

```ts
import { bootstrapFromView, osViewJsonFromView } from "./detail";

describe("bootstrapFromView", () => {
  const view = buildOsDetail(entries, catalog, "win-95");

  it("inlines only the initial color's detail, keyed by lowercase hex", () => {
    const b = bootstrapFromView(view, "#000080"); // Navy
    expect(Object.keys(b.detailsByHex)).toEqual(["#000080"]);
    expect(b.detailsByHex["#000080"].ral.code).toMatch(/^RAL /);
    expect(b.viewUrl).toBe("/os/win-95/view.json");
    expect(b.os.slug).toBe("win-95");
  });

  it("falls back to the default color when no hex is given", () => {
    const b = bootstrapFromView(view, null);
    // Teal (#008080) is the default in the fixture
    expect(Object.keys(b.detailsByHex)).toEqual(["#008080"]);
  });
});

describe("osViewJsonFromView", () => {
  it("emits one wire detail per color, aligned to os.colors order", () => {
    const view = buildOsDetail(entries, catalog, "win-95");
    const json = osViewJsonFromView(view);
    expect(json.details.length).toBe(view.os.colors.length);
    expect(json.details.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/detail.test.ts -t "bootstrapFromView"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/detail.ts`:

```ts
export interface OsDetailBootstrap {
  os: OsView;
  eraPeers: EraPeerView[];
  initialHex: string | null;
  detailsByHex: Record<string, ColorDetail>;
  viewUrl: string;
}

export function bootstrapFromView(view: OsDetailView, initialHex: string | null): OsDetailBootstrap {
  const idx = initialHex
    ? view.colors.findIndex((c) => c.hex.toLowerCase() === initialHex.toLowerCase())
    : -1;
  const chosen = idx >= 0 ? view.colors[idx] : (view.colors.find((c) => c.isDefault) ?? view.colors[0]);
  return {
    os: view.os,
    eraPeers: view.eraPeers,
    initialHex,
    detailsByHex: { [chosen.hex.toLowerCase()]: pickColorDetail(chosen) },
    viewUrl: `/os/${view.os.slug}/view.json`,
  };
}

export function osViewJsonFromView(view: OsDetailView): OsViewJson {
  return normalizeDetails(view.colors.map(pickColorDetail));
}
```

`OsView` and `EraPeerView` are already in scope (`OsView` via the `Catalog` import, `EraPeerView` defined in this file). If `OsView` is not imported, add it to the existing `import type { Catalog, OsView, ColorView } from "./catalog";` line.

Append to `src/lib/osDetail.ts`:

```ts
import { buildOsDetail, bootstrapFromView, osViewJsonFromView, type OsDetailView, type OsDetailBootstrap, type OsViewJson } from "./detail";

export async function loadOsBootstrap(slug: string, initialHex: string | null): Promise<OsDetailBootstrap> {
  return bootstrapFromView(await loadOsDetail(slug), initialHex);
}

export async function loadOsViewJson(slug: string): Promise<OsViewJson> {
  return osViewJsonFromView(await loadOsDetail(slug));
}
```

(Merge the import with the existing `import { buildOsDetail, type OsDetailView } from "./detail";` line — do not create a second import from `./detail`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/detail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/detail.ts src/lib/osDetail.ts src/lib/detail.test.ts
git commit -m "feat(detail): add bootstrap + view-json builders and async loaders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `view.json` static endpoint

Emits one `dist/os/<slug>/view.json` per OS. Additive — the island still consumes the old props at this point, so the build stays green.

**Files:**
- Create: `src/pages/os/[slug]/view.json.ts`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `loadCatalog` (existing), `loadOsViewJson` (Task 2).
- Produces: HTTP GET route → `dist/os/<slug>/view.json` containing `OsViewJson`.

- [ ] **Step 1: Write the endpoint**

Create `src/pages/os/[slug]/view.json.ts`:

```ts
import type { APIRoute } from "astro";
import { loadCatalog } from "../../../lib/loadCatalog";
import { loadOsViewJson } from "../../../lib/osDetail";

export async function getStaticPaths() {
  const catalog = await loadCatalog();
  return catalog.osList.map((o) => ({ params: { slug: o.slug } }));
}

export const GET: APIRoute = async ({ params }) => {
  const json = await loadOsViewJson(params.slug!);
  return new Response(JSON.stringify(json), {
    headers: { "content-type": "application/json" },
  });
};
```

- [ ] **Step 2: Write the failing E2E test**

Add to `e2e/smoke.spec.ts`:

```ts
test("serves a per-OS view.json with normalized detail", async ({ request }) => {
  const res = await request.get("/os/windows-95/view.json");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  const json = await res.json();
  expect(Array.isArray(json.details)).toBe(true);
  expect(json.details.length).toBeGreaterThan(1);
  expect(typeof json.osMeta).toBe("object");
  // wire platforms carry only slug + isDefault
  const somePlatform = json.details.flatMap((d: any) => d.uses)[0];
  expect(Object.keys(somePlatform).sort()).toEqual(["isDefault", "slug"]);
  // and osMeta resolves that slug
  expect(json.osMeta[somePlatform.slug]).toHaveProperty("name");
});
```

- [ ] **Step 3: Run the E2E test to verify it passes**

Run: `npx playwright test -g "view.json"`
Expected: PASS (Playwright's `webServer` runs `npm run build` first, emitting the file).

- [ ] **Step 4: Confirm the file is emitted**

Run: `npm run build && ls dist/os/windows-95/view.json`
Expected: the file exists.

- [ ] **Step 5: Commit**

```bash
git add src/pages/os/[slug]/view.json.ts e2e/smoke.spec.ts
git commit -m "feat(os): emit a normalized per-OS view.json endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Island rewrite + page wiring (the feature)

Change the island's contract and the two Astro routes together so the build is never left broken. Light fields render from `os.colors[sel]` (always present); heavy fields render from a `detailsByHex` map seeded with the initial color and filled by a prefetch; missing heavy detail shows a skeleton.

**Files:**
- Create: `src/islands/DetailSkeleton.tsx`
- Modify: `src/islands/OsDetail.tsx`
- Modify: `src/components/OsDetailPage.astro`
- Modify: `src/pages/os/[slug].astro`, `src/pages/os/[slug]/[hex].astro`
- Test: `src/islands/OsDetail.test.tsx`, `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `OsView`, `EraPeerView`, `ColorDetail`, `OsViewJson`, `denormalizeDetails` (Tasks 1–2); `loadOsBootstrap` (Task 2); `OsDetailBootstrap`.
- Produces: `OsDetail` island with `Props { os: OsView; eraPeers: EraPeerView[]; initialHex?: string | null; detailsByHex: Record<string, ColorDetail>; viewUrl?: string | null }`.

- [ ] **Step 1: Create the skeleton component**

Create `src/islands/DetailSkeleton.tsx`:

```tsx
// Placeholder shown in the heavy detail panels (Similar colors, extended
// formats, known-uses timeline) while a non-initial color's detail is still
// being fetched. The lightweight panels (preview, swatch list, HEX/RGB/HSL/CMYK)
// never use this — they render instantly from os.colors.
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div data-testid="heavy-skeleton" aria-hidden="true"
      style="border: 1px solid var(--card-border); border-radius: 12px; background: var(--panel); padding: 18px; min-height: 88px; display: flex; align-items: center; justify-content: center;">
      <span style="font: 400 12px var(--font-mono); color: var(--faint);">Loading {label}…</span>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the island props + state + heavy/light split**

In `src/islands/OsDetail.tsx`:

Update imports — add `OsView`, `EraPeerView`, `ColorDetail`, `OsViewJson`, `denormalizeDetails`, and the skeleton; keep `SimilarView`:

```tsx
import type { OsView, EraPeerView, ColorDetail, SimilarView, OsViewJson } from "../lib/detail";
import { denormalizeDetails } from "../lib/detail";
import { DetailSkeleton } from "./DetailSkeleton";
```

Replace the `Props` interface and the destructuring:

```tsx
interface Props {
  os: OsView;
  eraPeers: EraPeerView[];
  initialHex?: string | null;
  detailsByHex: Record<string, ColorDetail>;
  viewUrl?: string | null;
}

export function OsDetail({ os, eraPeers, initialHex, detailsByHex, viewUrl }: Props) {
  const colors = os.colors; // ColorView[] — the lightweight swatch list
```

(Delete the old `const { os, colors, eraPeers } = view;` line.)

Add heavy-detail state seeded from props, right after the other `useState` calls:

```tsx
  const [details, setDetails] = useState<Record<string, ColorDetail>>(detailsByHex);
```

Replace the selected-color line `const c: DetailColor = colors[sel] ?? colors[0];` with:

```tsx
  const summary = colors[sel] ?? colors[0];
  const detail = details[summary.hex.toLowerCase()]; // undefined until fetched
```

Add the prefetch effect (near the existing mount effects). It fills every color's detail from `view.json`, but never overwrites the inline initial color:

```tsx
  // Prefetch the full per-OS detail once, on idle. Until it lands, only the
  // initially-selected color (seeded inline) has heavy detail; others show a
  // skeleton. The inline seed stays authoritative (`...prev` wins).
  useEffect(() => {
    if (!viewUrl) return;
    let alive = true;
    const load = () =>
      fetch(viewUrl)
        .then((r) => r.json())
        .then((json: OsViewJson) => {
          if (!alive) return;
          const dn = denormalizeDetails(json);
          const map: Record<string, ColorDetail> = {};
          colors.forEach((col, i) => { if (dn[i]) map[col.hex.toLowerCase()] = dn[i]; });
          setDetails((prev) => ({ ...map, ...prev }));
        })
        .catch(() => { /* initial color stays functional; others keep skeleton */ });
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(load); else window.setTimeout(load, 0);
    return () => { alive = false; };
  }, [viewUrl]);
```

- [ ] **Step 3: Point the render sites at `summary` / `detail`**

Within the returned JSX, mechanical substitutions (light fields → `summary`, heavy fields → `detail`):

- Preview header hex and `DesktopPreview`: `c.hex` → `summary.hex`, `c.onColor` → `summary.onColor`.
- Selected-color row: `c.hex` → `summary.hex`, `c.name` → `summary.name`, `c.isDefault` → `summary.isDefault`, `c.note` → `summary.note`.
- Color-values panel: `c.hex/rgb/hsl/cmyk` → `summary.hex/rgb/summary.hsl/summary.cmyk`.
- `copy(...)` calls and the `track({ ... hex: c.hex ...})` beacon: `c.hex` → `summary.hex`.
- URL sync effect: `colorPath(os.slug, c.hex)` → `colorPath(os.slug, summary.hex)`.

Guard the heavy panels. Replace the **known-uses + extended-formats** meta grid so it renders the skeleton until `detail` is present:

```tsx
        <div class="dc-detail-meta" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;">
          {detail ? (
            <KnownUsesTimeline hex={summary.hex} uses={detail.uses} currentSlug={os.slug} />
          ) : (
            <DetailSkeleton label="known uses" />
          )}
          <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
            <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 5px;">COLOR VALUES · CLICK TO COPY</div>
            {copyRow("hex", "HEX", summary.hex, summary.hex)}
            {copyRow("rgb", "RGB", summary.rgb, `rgb(${summary.rgb})`)}
            {copyRow("hsl", "HSL", summary.hsl, summary.hsl)}
            {copyRow("cmyk", "CMYK", summary.cmyk, `cmyk(${summary.cmyk.replace(/ /g, ", ")})`)}
            {detail && codesExpanded && detail.extraFormats.map((r) => copyRow(r.key, r.label, r.value, r.copy, r.swatch))}
            {detail && (
              <a onClick={() => setCodesExpanded((v) => !v)} style="display: block; border-top: 1px solid var(--hairline); padding: 9px 14px; font: 500 11px var(--font-mono); color: var(--accent-strong); cursor: pointer;">
                {codesExpanded ? "Show fewer formats" : `View all ${4 + detail.extraFormats.length} formats →`}
              </a>
            )}
          </div>
        </div>
```

Replace the **Similar colors** body. Use `const sim = detail?.similar ?? [];` at the top of the `return` block (near `summary`/`detail`), then:

```tsx
        {!detail ? (
          <DetailSkeleton label="similar colors" />
        ) : sim.length === 0 ? (
          <div style="font: 400 13px var(--font-mono); color: var(--faint);">No close matches on other platforms.</div>
        ) : (
          <>
            {/* existing grid + expanded-panel markup, with every `c.similar` → `sim` */}
          </>
        )}
```

Update the Similar section subtitle to light fields: `closest to {summary.name} · {summary.hex}`.

Update the handlers that read the selected color's similar list:
- `stepSim`: `const n = c.similar.length` → `const n = (detail?.similar ?? []).length`, and `c.similar` → `(detail?.similar ?? [])` throughout.
- Fullscreen `simFull` block: `c.similar` → `(detail?.similar ?? [])`.

Update the main `FullscreenPreview` (the OS color one): `hex={c.hex}` → `hex={summary.hex}`, `onColor={c.onColor}` → `summary.onColor`, `label={... c.name ... c.hex}` → `summary.name`/`summary.hex`.

Update `DownloadSheet`: `color={{ hex: c.hex, name: c.name }}` → `summary.hex`/`summary.name`.

- [ ] **Step 4: Wire the Astro pages**

`src/components/OsDetailPage.astro`:

```astro
---
import Base from "../layouts/Base.astro";
import { OsDetail } from "../islands/OsDetail";
import type { OsDetailBootstrap } from "../lib/detail";

interface Props { bootstrap: OsDetailBootstrap }
const { bootstrap } = Astro.props;
const os = bootstrap.os;
---
<Base
  title={`${os.name} desktop colors — desktopcolors.com`}
  description={`${os.name} (${os.year}) desktop background colors: ${os.defaultHex} and ${os.colorCount - 1} more, with previews and downloadable wallpapers.`}
>
  <OsDetail
    os={os}
    eraPeers={bootstrap.eraPeers}
    initialHex={bootstrap.initialHex}
    detailsByHex={bootstrap.detailsByHex}
    viewUrl={bootstrap.viewUrl}
    client:load
  />
</Base>
```

`src/pages/os/[slug]/[hex].astro`:

```astro
---
import OsDetailPage from "../../../components/OsDetailPage.astro";
import { loadCatalog } from "../../../lib/loadCatalog";
import { loadOsBootstrap } from "../../../lib/osDetail";

export async function getStaticPaths() {
  const catalog = await loadCatalog();
  return catalog.osList.flatMap((o) =>
    o.colors.map((c) => ({ params: { slug: o.slug, hex: c.hex.slice(1) } })),
  );
}

const { slug, hex } = Astro.params;
const bootstrap = await loadOsBootstrap(slug!, `#${hex}`);
---
<OsDetailPage bootstrap={bootstrap} />
```

`src/pages/os/[slug].astro`:

```astro
---
import OsDetailPage from "../../components/OsDetailPage.astro";
import { loadCatalog } from "../../lib/loadCatalog";
import { loadOsBootstrap } from "../../lib/osDetail";

export async function getStaticPaths() {
  const catalog = await loadCatalog();
  return catalog.osList.map((o) => ({ params: { slug: o.slug } }));
}

const { slug } = Astro.params;
const bootstrap = await loadOsBootstrap(slug!, null);
---
<OsDetailPage bootstrap={bootstrap} />
```

- [ ] **Step 5: Rewrite the island unit-test fixture to the new props**

In `src/islands/OsDetail.test.tsx`, replace the `view: OsDetailView` fixture with a bootstrap-shaped fixture. Move the two colors' light fields into `os.colors`, and split the heavy fields into a `detailsByHex` map keyed by lowercase hex. Render with `viewUrl={null}` so no fetch occurs (jsdom has no network) and every color's detail is present synchronously.

Concretely, define:

```tsx
import type { OsView, EraPeerView, ColorDetail } from "../lib/detail";

const os: OsView = {
  slug: "windows-95", name: "Windows 95", year: 1995, added: "2000-01-01", family: "Windows",
  tagline: "t", description: "The teal era.", desktopStyle: "win9x",
  defaultHex: "#008080", colorCount: 2, score: 0, scoreLabel: "< 1k",
  type: "Proprietary", wikipedia: "https://en.wikipedia.org/wiki/Windows_95",
  predecessor: null, successor: { slug: "windows-98", name: "Windows 98", year: 1998 },
  colors: [
    { hex: "#008080", name: "Teal", note: "default", isDefault: true, rgb: "0, 128, 128", hsl: "180° 100% 25%", cmyk: "100% 0% 0% 50%", onColor: "#ffffff", family: "teal", types: ["cool"], score: 0, scoreLabel: "< 1k" },
    { hex: "#000080", name: "Navy", note: "cool", isDefault: false, rgb: "0, 0, 128", hsl: "240° 100% 25%", cmyk: "100% 100% 0% 50%", onColor: "#ffffff", family: "blue", types: ["dark", "vivid", "cool"], score: 0, scoreLabel: "< 1k" },
  ],
};

const eraPeers: EraPeerView[] = [
  { slug: "cde", name: "CDE", family: "Desktop Env.", year: 1993, hex: "#9aabb9", colorName: "Dusty Blue", rel: "2 yr earlier", onColor: "#1c1917", href: "/os/cde", metaLine: "1993 · Desktop Env." },
];

const detailsByHex: Record<string, ColorDetail> = {
  "#008080": {
    ral: { code: "RAL 5021", name: "Water Blue", hex: "#07737a" },
    ralDesign: { code: "RAL 190 40 20", name: "Deep Sea", hex: "#0d7c7d" },
    extraFormats: [
      { key: "lab", label: "CIELAB", value: "45.2, -20.1, -5.3", copy: "lab(45.2% -20.1 -5.3)" },
      { key: "lch", label: "LCH", value: "45.2, 20.8, 194.8", copy: "lch(45.2% 20.8 194.8)" },
      { key: "oklab", label: "OKLab", value: "0.500, -0.080, -0.020", copy: "oklab(0.500 -0.080 -0.020)" },
      { key: "oklch", label: "OKLCH", value: "0.500, 0.082, 194.0", copy: "oklch(0.500 0.082 194.0)" },
      { key: "ral", label: "Closest RAL Classic", value: "RAL 5021 · Water Blue", copy: "RAL 5021 · Water Blue", swatch: "#07737a" },
      { key: "ralDesign", label: "Closest RAL Design+", value: "RAL 190 40 20 · Deep Sea", copy: "RAL 190 40 20 · Deep Sea", swatch: "#0d7c7d" },
    ],
    similar: [
      { hex: "#4e9a9a", name: "Teal", match: 88, onColor: "#ffffff", h: 178, s: 33, l: 44, primarySlug: "kde-1", style: "generic", platforms: [{ slug: "kde-1", name: "KDE 1", year: 1998, family: "KDE", isDefault: true }] },
      { hex: "#3a8f8f", name: "Pine", match: 82, onColor: "#ffffff", h: 180, s: 42, l: 40, primarySlug: "beos", style: "generic", platforms: [{ slug: "beos", name: "BeOS", year: 1998, family: "BeOS", isDefault: true }] },
    ],
    uses: [
      { slug: "cde", name: "CDE", year: 1993, family: "Desktop Env.", isDefault: false },
      { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
    ],
  },
  "#000080": {
    ral: { code: "RAL 5002", name: "Ultramarine", hex: "#20214f" },
    ralDesign: { code: "RAL 280 20 30", name: "Ink Blue", hex: "#1e2159" },
    extraFormats: [
      { key: "lab", label: "CIELAB", value: "12.5, 30.1, -60.2", copy: "lab(12.5% 30.1 -60.2)" },
      { key: "lch", label: "LCH", value: "12.5, 67.3, 296.5", copy: "lch(12.5% 67.3 296.5)" },
      { key: "oklab", label: "OKLab", value: "0.230, 0.020, -0.130", copy: "oklab(0.230 0.020 -0.130)" },
      { key: "oklch", label: "OKLCH", value: "0.230, 0.131, 278.0", copy: "oklch(0.230 0.131 278.0)" },
      { key: "ral", label: "Closest RAL Classic", value: "RAL 5002 · Ultramarine", copy: "RAL 5002 · Ultramarine", swatch: "#20214f" },
      { key: "ralDesign", label: "Closest RAL Design+", value: "RAL 280 20 30 · Ink Blue", copy: "RAL 280 20 30 · Ink Blue", swatch: "#1e2159" },
    ],
    similar: [],
    uses: [{ slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: false }],
  },
};

const baseProps = { os, eraPeers, detailsByHex };
```

Then replace every `render(<OsDetail view={view} initialHex={X} />)` with `render(<OsDetail {...baseProps} initialHex={X} viewUrl={null} />)`, and every `renderToString(<OsDetail view={view} initialHex={X} />)` with `renderToString(<OsDetail {...baseProps} initialHex={X} viewUrl={null} />)`. For the "selects the default color, not the first listed" test, build a reordered `os.colors` instead of reordering `view.colors`:

```tsx
    const reordered = { ...baseProps, os: { ...os, colors: [os.colors[1], os.colors[0]] } };
    const html = renderToString(<OsDetail {...reordered} initialHex={null} viewUrl={null} />);
```

- [ ] **Step 6: Add skeleton-state unit tests**

Add to `src/islands/OsDetail.test.tsx`:

```tsx
it("shows a skeleton for a color whose detail has not loaded yet", () => {
  // Only the initial color (Navy) is seeded; Teal's detail is absent and there
  // is no viewUrl to fetch it, so selecting Teal must skeleton the heavy panels.
  const seeded = { os, eraPeers, detailsByHex: { "#000080": detailsByHex["#000080"] } };
  render(<OsDetail {...seeded} initialHex="#000080" viewUrl={null} />);
  // light fields still switch instantly
  fireEvent.click(screen.getByText("Teal"));
  expect(screen.getAllByText("0, 128, 128").length).toBeGreaterThan(0); // teal RGB
  // heavy panels are skeletoned
  expect(screen.getAllByTestId("heavy-skeleton").length).toBeGreaterThan(0);
  expect(screen.queryByText("KNOWN USES")).toBeNull();
});

it("renders heavy panels (no skeleton) when the selected color's detail is present", () => {
  render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
  expect(screen.queryByTestId("heavy-skeleton")).toBeNull();
  expect(screen.getByText("KNOWN USES")).toBeTruthy();
});
```

- [ ] **Step 7: Run the unit tests**

Run: `npx vitest run src/islands/OsDetail.test.tsx`
Expected: PASS (all existing behavior tests + the two new skeleton tests).

- [ ] **Step 8: Add the lazy-load E2E test**

Add to `e2e/smoke.spec.ts`. Delay the `view.json` response so the skeleton is observable, then let it resolve and assert the heavy panel fills:

```ts
test("a non-initial color lazy-loads its detail from view.json", async ({ page }) => {
  // Delay the per-OS detail so the skeleton is observable before it resolves.
  await page.route("**/os/windows-95/view.json", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto("/os/windows-95/008080"); // Teal (default/initial): its detail is inline
  await expect(page.getByRole("heading", { name: "Windows 95" })).toBeVisible();
  await islandsHydrated(page);

  // Select Navy — not the initial color, so its heavy detail must come from the fetch.
  await page.getByTestId("color-row-000080").click();
  await expect(page.getByText("0, 0, 128")).toBeVisible();        // light fields: instant
  await expect(page.getByTestId("heavy-skeleton").first()).toBeVisible(); // heavy: skeleton first

  // Once view.json resolves, the skeleton is replaced by the real timeline.
  await expect(page.getByText("KNOWN USES")).toBeVisible();
  await expect(page.getByTestId("heavy-skeleton")).toHaveCount(0);
});
```

- [ ] **Step 9: Run the full build + E2E**

Run: `npm run build` (expect success — pages + `view.json` emitted)
Run: `npx playwright test`
Expected: PASS (existing smoke tests + the new lazy-load test).

- [ ] **Step 10: Commit**

```bash
git add src/islands/OsDetail.tsx src/islands/DetailSkeleton.tsx src/components/OsDetailPage.astro "src/pages/os/[slug].astro" "src/pages/os/[slug]/[hex].astro" src/islands/OsDetail.test.tsx e2e/smoke.spec.ts
git commit -m "feat(os): externalize per-OS color detail to a prefetched view.json

Pages now inline only os.colors, eraPeers, and the initial color's detail;
other colors' heavy detail loads from /os/<slug>/view.json on idle, with a
skeleton in the brief pre-load window.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verify the size win + document the data flow

**Files:**
- Modify: `docs/architecture-frontend.md`

- [ ] **Step 1: Measure the disk reduction**

Run:
```bash
npm run build
du -sh dist
find dist -name '*.html' -path '*/os/*' | head -1 | xargs wc -c
ls -la dist/os/windows-95/view.json
```
Expected: `dist` ~65–70MB (was ~370MB); a representative hex page ~100KB (was ~670KB); `view.json` present per OS. If a hex page is still far above ~150KB, re-open Task 4 Step 3 — a heavy field is still being read from props rather than `detail`.

- [ ] **Step 2: Document the split**

In `docs/architecture-frontend.md`, add a short subsection under the pages/islands description:

> **Per-OS detail data (`/os/<slug>/view.json`).** OS detail pages inline only the
> lightweight `os.colors` (swatch list + preview/values), `eraPeers`, and the
> heavy detail (`similar`, extended formats, known-uses) for the *initially*
> selected color — required inline so the server-rendered first paint is
> complete. Every color's heavy detail is emitted once per OS as a normalized
> `view.json` (repeated platform metadata collapsed into a `slug → meta` table,
> see `src/lib/detail.ts`), which the `OsDetail` island prefetches on idle and
> denormalizes to power instant client-side color switching. This replaced an
> earlier design that embedded the full per-OS detail in every hex page's
> hydration props (~670KB/page; ~370MB `dist/`).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture-frontend.md
git commit -m "docs(architecture): document the per-OS view.json data asset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Data split (spec §1) → Tasks 2 (`bootstrapFromView`) + 4 (island props). ✓
- Normalization + `osMeta` table (spec §2) → Task 1. ✓
- Endpoint (spec §3) → Task 3. ✓
- `detail.ts` refactor (spec §4) → Tasks 1–2. ✓
- Island behavior: instant light switch, prefetch-on-idle, skeleton (spec §5) → Task 4. ✓
- Structural initial-color overlap (spec §1) → honored: `detailsByHex` seeds the initial color inline, `view.json` remains complete (Task 2 `bootstrapFromView` + Task 3). ✓
- Error handling: fetch failure keeps initial color functional (spec) → Task 4 Step 2 `.catch()` + skeleton. ✓
- Testing (spec): pure round-trip/shape unit tests (Tasks 1–2), fetch/skeleton E2E (Tasks 3–4). ✓
- Expected outcome / size verification (spec) → Task 5. ✓

**Placeholder scan:** No TBD/TODO; all code steps carry real code. The island edits in Task 4 Step 3 are enumerated as exact field substitutions rather than a full re-paste of the 310-line file — each named site has its old→new form.

**Type consistency:** `ColorDetail`, `OsViewJson`, `OsDetailBootstrap`, `detailsByHex: Record<string, ColorDetail>`, `viewUrl`, `PlatformRef {slug,isDefault}`, `OsMeta {name,year,family}` are used identically across Tasks 1→5. `denormalizeDetails(json)` signature matches its call in Task 4. Endpoint `loadOsViewJson` / page `loadOsBootstrap` match Task 2 exports.
