# Externalize + normalize the OS detail view

**Date:** 2026-07-26
**Status:** Approved, pending implementation plan

## Problem

Every `/os/<slug>/<hex>` page weighs ~670KB on disk, and `dist/` totals ~370MB
across 681 hex pages (22 OSes). The weight is not images, CSS, or JS — it is a
single HTML attribute.

The `OsDetail` island is hydrated with `client:load` and receives the entire
per-OS detail `view` as props. Astro serializes that `view` into the page's
`<astro-island props="...">` attribute. Measured, for one ReactOS hex page:

- Raw HTML: 673,880 B
- The `props` attribute alone: 604,825 B (90% of the page)
- Decoded, that JSON is 352,572 B; HTML attribute-escaping (`"` → `&quot;`)
  inflates it to 604,825 B.

Two multipliers compound:

1. **Per-page duplication.** `loadOsDetail` caches one view per slug (it does not
   depend on the selected hex), so all ~60 hex pages of an OS embed the
   *identical* 352KB view. There are 22 distinct views but 681 embedded copies.
2. **Escaping tax.** Every `"` becomes `&quot;` (6 bytes), nearly doubling the
   raw JSON on disk. (Under gzip this tax is only ~4KB — see Non-goals.)

The dominant JSON keys are repeated OS metadata carried inside every similar
color's platform list: on one page `name` ×2179, `family` ×1723, `slug` ×1593,
`year` ×1593.

## Goals

- Cut per-page disk weight ~85% and total `dist/` from ~370MB to ~65–70MB.
- Preserve the current UX: instant client-side switching between an OS's colors,
  with all interactions (copy, download sheet, fullscreen, similar-color
  navigation) intact.
- Preserve server-rendered first paint and the no-JS view for the
  initially-selected color (unchanged FCP/LCP).

## Non-goals

- **Serving compressed** (gzip/brotli). Orthogonal transport concern; verify the
  deploy host's `Content-Encoding` separately. Not part of this change, and
  pre-compressing files would *add* to the immutable-tree disk footprint.
- Changing the visual design or the derivation logic (color math, similar-color
  scan, scoring).
- Converting client-side color switching into page navigation.

## Design

### 1. Data split

The page stops embedding the full `DetailColor[]`. The split falls on an existing
type seam: `OsView` already carries `colors: ColorView[]` (lightweight: hex, name,
note, isDefault, rgb, hsl, cmyk, onColor, family, types, score) — everything the
swatch rail, preview, and color-values panels need for *any* color. The heavy data
(`ral`, `ralDesign`, `extraFormats`, `similar`, `uses`) lives only in the
`DetailColor[]`.

**Inline in the page (hydration props, small):**

- `os` (`OsView`) — includes the lightweight `colors: ColorView[]`.
- `eraPeers` (`EraPeerView[]`) — 3 entries, constant per OS.
- `initialDetail` — the heavy detail for **only the initially-selected color**.
  Required inline: `client:load` server-renders the island from the same props it
  hydrates from, so without it the SSR'd HTML and the no-JS view would show empty
  heavy panels.
- `initialHex` (existing).
- `viewUrl` — path to the per-OS JSON, `/os/<slug>/view.json`.

**Fetched once per OS (`/os/<slug>/view.json`):**

- `details` — heavy detail (`ral`, `ralDesign`, `extraFormats`, `similar`,
  `uses`) for **all** colors, in the same order as `os.colors`.
- `osMeta` — the normalization lookup table (§2).

The initially-selected color's heavy detail intentionally appears in **both** the
inline `initialDetail` and `view.json`'s `details[initialIdx]`. This one-color
duplication keeps the island's loaded `details` array uniform and avoids a
merge-on-load special case; the cost is negligible.

### 2. Normalization

In the heavy detail, `similar[].platforms[]` and `uses[]` are
`Platform = { slug, name, year, family, isDefault }`. Only `isDefault` is
per-color; `name`/`year`/`family` are per-OS and repeat thousands of times.

`view.json` therefore stores:

- `osMeta: Record<slug, { name: string; year: number; family: string }>` — one
  entry per referenced OS.
- Each platform reduced to `{ slug, isDefault }`.

The island rehydrates a full `Platform` on load: `{ ...osMeta[p.slug], ...p }`.

Honest scope note: once externalization collapses 681 copies → 22 files,
normalization's *disk* win is modest (a few MB). Its remaining value is a smaller
`view.json` to parse and transfer, and cleaner data. Kept because it is cheap and
was explicitly requested.

### 3. Endpoint

New Astro static endpoint `src/pages/os/[slug]/view.json.ts`:

- `getStaticPaths()` enumerates OS slugs (from `loadCatalog`).
- Handler returns `new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } })`.
- Produces `dist/os/<slug>/view.json` — one file per OS.

### 4. `detail.ts` refactor

Split the single `buildOsDetail` into explicit shapes, keeping the per-slug
memoization:

- A **bootstrap builder** producing the inline page shape
  (`os`, `eraPeers`, `initialDetail` for a given hex).
- A **view-json builder** `buildOsViewJson(slug)` producing
  `{ details, osMeta }` with platforms normalized.

Both reuse the existing per-color heavy-detail computation (the O(colors) similar
scan) so it is computed once per OS, as today. Normalization
(`normalizePlatforms` / `denormalizePlatforms`) are pure helpers.

Consumers:

- `src/pages/os/[slug]/[hex].astro` and `src/pages/os/[slug].astro` pass the
  bootstrap shape to `OsDetailPage`.
- `src/pages/os/[slug]/view.json.ts` emits `buildOsViewJson(slug)`.

### 5. Island behavior (`OsDetail.tsx`)

- The swatch rail, preview, selected-color header, and color-values panel render
  from `os.colors[sel]` — instant for every color, no fetch.
- Heavy panels (Similar colors, extra formats, KnownUsesTimeline) render from a
  `details` lookup indexed by `sel`. State starts seeded with `initialDetail` at
  the initial index and `null`/absent elsewhere.
- On mount, prefetch `viewUrl` on idle, denormalize platforms via `osMeta`, and
  populate all `details`.
- Clicking a color whose detail has not loaded yet shows a **skeleton** on those
  heavy panels until the fetch resolves. After load, every switch is instant.
- All existing interactions (URL sync via `replaceState`, copy beacons, download
  sheet, fullscreen preview, similar-color step/navigation) are preserved. Where
  they read from the selected color's heavy detail (e.g. `c.similar`,
  `c.extraFormats`), they operate on the loaded `details[sel]`, which is present
  for the initial color from first paint and for others after prefetch.

## Data flow

```
build time
  loadCatalog + loadEntries
    ├─ bootstrap builder ──> [hex].astro / [slug].astro ──> OsDetailPage
    │      (os, eraPeers, initialDetail, initialHex, viewUrl)   (inline props)
    └─ buildOsViewJson ────> view.json.ts ──> dist/os/<slug>/view.json
           ({ details, osMeta })                                (one file per OS)

runtime (client)
  OsDetail mounts with inline props
    → renders initial color fully (SSR-matched)
    → prefetch viewUrl on idle → denormalize → populate details[]
    → swatch click: instant summary/preview; heavy panels skeleton-then-fill
```

## Error handling

- **`view.json` fetch fails** (offline, 404): the initial color remains fully
  functional (its detail is inline). Other colors' summary/preview/values still
  render from inline data; their heavy panels stay in a skeleton/empty state. No
  thrown errors, no broken page. Optionally retry once on next interaction.
- **Unknown slug** in the endpoint: `getStaticPaths` only emits known slugs, so
  the file exists for every page that references it.
- **Hydration parity:** inline props are identical on server and client, so the
  initial render is deterministic (no hydration mismatch), as today.

## Testing

Per `TESTING.md`: pure logic in vitest, anything touching DOM/layout/network in
Playwright.

- **Unit (vitest, no DOM/network):**
  - `denormalizePlatforms(normalizePlatforms(x))` round-trips to the original.
  - `buildOsViewJson(slug)` shape: `details` length and order match `os.colors`;
    `osMeta` contains every referenced slug; platforms carry only `{slug, isDefault}`.
  - Bootstrap builder: `initialDetail` corresponds to `initialHex` (and to the
    default color when no hex is given).
- **E2E (Playwright):**
  - Load a hex page, `await islandsHydrated(page)`, click a non-initial swatch,
    assert the Similar colors panel populates (covers fetch + denormalize + fill).
  - Assert `view.json` is emitted in the build and requested by the page.
  - Existing OsDetail E2E (copy beacons, download, fullscreen, similar-color
    navigation) continues to pass.

## Expected outcome

- Per page: ~670KB → ~100KB (SSR'd markup + lightweight inline `os.colors` +
  one color's heavy detail).
- `dist/` total: ~370MB → ~65–70MB (~80%).
- One cacheable `view.json` per OS (22 files) instead of 681 embedded copies;
  cross-color navigation within an OS reuses it.
- First paint improves (small critical-path HTML); the only regression is a
  sub-second skeleton on heavy panels if a non-initial color is clicked before
  the prefetch lands.
