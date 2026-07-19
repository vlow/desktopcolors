# Architecture — the frontend (static site)

The frontend is the desktopcolors.com website: an **Astro static site (SSG)** with small
**Preact islands** for interactivity. Every page is pre-rendered to HTML at build time for
SEO and instant loads. Interactive bits (search, filter, sort, previews, downloads) are
islands that receive the **entire, build-computed dataset as props** and do all their work
in the browser — there are **no read APIs at runtime**.

The whole thing is a pipeline from data to HTML:

```
content/os/*.json ──▶ lib/ (pure derivation) ──▶ pages/*.astro ──▶ islands/*.tsx (browser)
   source of truth      build-time compute        static HTML       interactivity
        ▲                        ▲
  Zod schema             scores.json (from the counter, baked in at build time)
```

For the system-wide picture and the write-live / read-at-build data flow, see the
[README architecture section](../README.md#architecture). The counter/backend is documented
separately in [`architecture-edge.md`](./architecture-edge.md).

---

## Where things live

```
src/
  content/
    os/*.json          # ONE JSON per platform — the source of truth
    config.ts          # Zod schema that validates every os/*.json at build time
  data/
    ral-classic.json   # RAL Classic reference palette (generated; see scripts/build-ral.mjs)
  lib/                 # PURE, unit-tested build-time logic. No DOM, no Astro, no Preact.
  islands/*.tsx        # Preact interactive components (client-side). ONE per interactive UI.
  components/*.astro   # Static server-rendered shell fragments (Header, OsDetailPage)
  layouts/Base.astro   # The HTML document shell (head, fonts, <slot/>)
  pages/               # Routes. Each page loads the catalog and mounts island(s).
  styles/tokens.css    # Design tokens (CSS custom properties)
  env.d.ts             # Ambient types
```

The cardinal rule of the layering: **`lib/` is pure and knows nothing about the DOM,
Astro, or Preact.** It transforms data. `pages/` call `lib/` at build time and pass the
result to `islands/` and `components/`. `islands/` render in the browser and never import
Astro. This is what makes `lib/` exhaustively unit-testable and keeps derivation logic out
of view code.

---

## The build-time data pipeline (`content` → `lib`)

This is the spine of the site. Follow it top to bottom.

### 1. Source of truth — `content/os/*.json` + `content/config.ts`

Each operating system / desktop environment is **one JSON file**. `config.ts` defines the
Zod schema that validates every file at build time — a bad hex, a missing field, more than
one `default` color, or a dangling `predecessor`/`successor` **fails the build**.

```ts
// content/config.ts — the shape every os/*.json must satisfy
type OsInput = {
  name: string; slug?: string; year: number; family: string;
  tagline: string; description: string;
  predecessor?: string; successor?: string;
  desktopStyle: "modern" | "win9x" | "macos8" | "kde" | "cde" | "amiga" | "generic"; // default "modern"
  colors: { hex: string; name: string; index: string; note: string; default: boolean }[]; // ≥1, ≤1 default
};
```

Adding a platform = dropping a JSON file here. Nothing else needs editing — it flows
automatically into Browse, the Explorer, similarity matches, and era sections. See
[README → Adding a new OS](../README.md#adding-a-new-os).

### 2. Loading — `lib/entries.ts`, `lib/loadCatalog.ts`, `lib/scores.ts`

- `entries.ts` → `loadEntries(): Promise<OsEntry[]>` reads the content collection and
  resolves each slug (explicit, else the filename).
- `scores.ts` → `loadScores(): Scores` reads `scores.json` (produced by the counter's
  `dump`; see the edge doc). **Missing/malformed file is non-fatal** — all scores default to
  0. Its `Scores` shape is the contract with the counter:

  ```ts
  interface Scores { colors: Record<string, number>; os: Record<string, number> }
  ```

- `loadCatalog.ts` → `loadCatalog(): Promise<Catalog>` is the one call pages use — it wires
  entries + scores through `buildCatalog`.

### 3. Deriving — `lib/catalog.ts` (the hub) + `lib/color.ts` + `lib/derive.ts`

`catalog.ts` is where raw entries become **view models**. `buildCatalog(entries, scores)`
produces the `Catalog` that nearly every page consumes:

```ts
interface Catalog {
  osList: OsView[];                 // one per platform, colors as ColorView[]
  bySlug: Map<string, OsView>;      // slug → OsView lookup
  colors: MergedColorView[];        // colors merged across platforms by hex (for the Explorer)
}
```

Every color is enriched once, here, into a `ColorView` — rgb/hsl strings, readable
`onColor` (text color), `family` (hue) classification, multi-label `types` (OKLCH-defined color
types), and merged-by-hex `score` + `scoreLabel`. The math behind those lives in the two pure
helpers:

- **`color.ts`** — all color math: `hexToRgb`, `hexToHsl`, `hueFamily`, `colorTypes` (multi-label
  types in OKLCH), `onColor`, `closestRal` (perceptual **OKLab** distance via `hexToOklab`/
  `oklabDistance`), and `formatScore` (points → `< 1k` / `1.2k` style labels).
- **`derive.ts`** — cross-platform relationships over the raw entries:
  `mergeColorsByHex`, `similarColors`, `eraPeers`, `firstKnownUse`, `defaultColor`.

### 4. Page-specific view builders — `lib/detail.ts`, `lib/explorer.ts`

These take the `Catalog` and shape it for one page:

- **`detail.ts`** → `buildOsDetail(entries, catalog, slug): OsDetailView` — assembles an OS
  detail page: each color with its closest RAL match, up to 6 similar colors elsewhere (with
  hrefs), "first known use", and same-era peers.
- **`explorer.ts`** — the Color Explorer model: `toExplorerColors`, family definitions
  (`FAMILY_DEFS`), color-type definitions (`COLOR_TYPE_DEFS`), counting (`familyCounts`,
  `typeCounts`), banding (`groupIntoBands`), and `rankColors`.

### Supporting pure modules

| Module              | Responsibility                                                              |
|---------------------|----------------------------------------------------------------------------|
| `lib/links.ts`      | Canonical URL builders — `colorPath(slug, hex)` (color = its own static page) |
| `lib/ral.ts`        | Loads the RAL Classic palette (`RAL_CLASSIC`), used by `closestRal`         |
| `lib/desktopStyle.ts` | `DESKTOP_STYLES` tuple + `DesktopStyle` type — the schema's allowed styles |
| `lib/wallpaper.ts`  | Wallpaper spec: `RESOLUTION_GROUPS`, dimension bounds, `parseDimension`, `wallpaperFilename` |
| `lib/setup-guides.ts` | The static "set a solid background" guide catalog + filtering              |
| `lib/scores.ts`     | `scores.json` reader + `colorScore` / `osScore` accessors                  |

---

## The view layer

### `layouts/` and `components/` — the static shell

- `Base.astro` — the HTML document: `<head>`, fonts, design tokens, and a `<slot/>`. Props:
  `{ title, description?, active? }`. Every page wraps its content in `Base`.
- `Header.astro` — the site header/nav (server-rendered).
- `OsDetailPage.astro` — the shared shell for the two OS-detail routes; sets SEO title/meta
  from the `OsDetailView` and mounts the `OsDetail` island.

### `pages/` — the routes

Each page is thin: load the catalog at build time, shape props, mount an island. Routes:

| Route                    | File                          | Island mounted        |
|--------------------------|-------------------------------|-----------------------|
| `/` (Browse)             | `pages/index.astro`           | `BrowseControls`      |
| `/os/<slug>`             | `pages/os/[slug].astro`       | `OsDetail`            |
| `/os/<slug>/<hex>`       | `pages/os/[slug]/[hex].astro` | `OsDetail` (initialHex) |
| `/explorer`              | `pages/explorer.astro`        | `Explorer`            |
| `/setup`                 | `pages/setup.astro`           | `SetupGuide`          |
| `/about`                 | `pages/about.astro`           | — (static)            |

**Static color pages:** `/os/<slug>/<hex>` uses `getStaticPaths` to pre-render **one page
per color** (via `colorPath` from `lib/links.ts`). The selected color is baked into the HTML
at build time, so there is no client-side flash / reorder. This is why color selection is a
path segment, not a `?hex=` query.

### `islands/` — the interactive components (browser)

One island per interactive surface. They are Preact, receive the full build-computed dataset
as props, and do **all** search/filter/sort in-browser. `client:load` in the page mounts
them.

| Island               | Responsibility                                                        |
|----------------------|-----------------------------------------------------------------------|
| `BrowseControls.tsx` | The Browse page: search, sort (Popular/Year/A–Z), family filter, cards |
| `OsDetail.tsx`       | The OS detail page: color picker, copy, preview, opens `DownloadSheet` |
| `Explorer.tsx`       | The Color Explorer: family + multi-label color-type filtering, grouped by hue or ungrouped |
| `DesktopPreview.tsx` | Renders the schematic desktop chrome behind a color (see `STYLE_CHROME`) |
| `FullscreenPreview.tsx` | Full-viewport preview overlay                                      |
| `DownloadSheet.tsx`  | Resolution picker → generates + downloads a wallpaper                  |
| `SetupGuide.tsx`     | The `/setup` guide browser                                             |
| `MobileNav.tsx`      | Mobile navigation menu                                                 |

Two cross-cutting concerns the islands own:

- **Popularity beacons — `lib/track.ts`.** `track(event)` fires a fire-and-forget
  `navigator.sendBeacon` (fallback: `fetch` with `keepalive`) to `/api/event`. Browser-only,
  never throws, no-ops during SSR and when there's no `/api` proxy (dev/preview). Its
  `TrackEvent` union is the write-side contract with the counter's `scoring.Event`:

  ```ts
  type TrackEvent =
    | { kind: "copy"; hex: string; os: string }
    | { kind: "download"; hex: string; os: string }
    | { kind: "osview"; os: string };
  ```

- **Wallpaper generation — `DownloadSheet` + `lib/wallpaper.ts`.** Wallpapers are drawn in
  the browser with `<canvas>` — the server never touches images.

### The `desktopStyle` preview registry

`DesktopPreview.tsx` draws a schematic desktop (icons, taskbar, menu bar…) behind a color.
The set of allowed styles is the tuple `DESKTOP_STYLES` in `lib/desktopStyle.ts` (which the
Zod schema enforces), and each style's chrome is an entry in the **type-checked**
`STYLE_CHROME: Record<DesktopStyle, ChromePart[]>` registry in `DesktopPreview.tsx` — a
missing entry fails the build. Adding a style is a two-file change with its own guide:
[`docs/adding-a-preview-style.md`](./adding-a-preview-style.md).

---

## Where does my change go?

| I want to…                                             | Touch                                            |
|--------------------------------------------------------|--------------------------------------------------|
| Add/edit a platform or its colors                      | `content/os/*.json` (validated by `content/config.ts`) |
| Add a field to the OS schema                           | `content/config.ts`, then thread it through `lib/catalog.ts` → view models |
| Change color math (family, color types, RAL, contrast) | `lib/color.ts`                                   |
| Change cross-platform relations (similar, era, merge)  | `lib/derive.ts`                                  |
| Change what a color/OS view model contains             | `lib/catalog.ts` (`ColorView` / `OsView` / `MergedColorView`) |
| Change the OS detail page's data                       | `lib/detail.ts` (`OsDetailView`)                 |
| Change Explorer filtering/banding                      | `lib/explorer.ts`                                |
| Add/change a route                                     | `pages/…` (+ a new island if interactive)        |
| Change Browse / detail / explorer UI behavior          | the matching `islands/*.tsx`                     |
| Add a new desktop preview style                        | `lib/desktopStyle.ts` + `DesktopPreview.tsx` (see guide) |
| Change wallpaper resolutions or filename               | `lib/wallpaper.ts`                               |
| Change what popularity events fire, or their payload   | `lib/track.ts` (**and** the counter's `scoring.Event`) |
| Change the `scores.json` reader                        | `lib/scores.ts` (**and** the counter's `store.Scores`) |
| Change global styling / tokens                         | `styles/tokens.css`, `layouts/Base.astro`        |

### Invariants to preserve

- **`lib/` stays pure.** No DOM, no Astro, no Preact imports — it is the tested core.
  View concerns live in `islands/`/`components/`; derivation lives in `lib/`.
- **No read APIs at runtime.** Islands get their data as build-time props; the site must
  render (and be correct) even if the counter is down.
- **Scores are read only at build time.** Anything score-derived (Browse's Popular order,
  labels) is baked into the HTML — never re-fetched or reordered client-side.
- **Two contracts with the counter must stay in lockstep:** `lib/track.ts`'s `TrackEvent` ⟷
  `scoring.Event` (write side), and `lib/scores.ts`'s `Scores` ⟷ `store.Scores` (read side).
- **`content/config.ts` is the schema gate.** New data shapes must be validated there so a
  bad file fails the build rather than shipping broken HTML.

### Testing

```bash
npm run check   # astro check — full TypeScript + .astro type checking
npm test        # vitest — lib logic and island behavior (files sit beside their source)
npm run build   # verifies every page pre-renders
npm run test:e2e # Playwright: builds + drives the site, asserts beacons fire + wallpaper downloads
```

Every `lib/*.ts` and most `islands/*.tsx` have a `*.test.ts(x)` beside them — the pure
layering is what makes that coverage cheap.
