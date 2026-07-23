# OS Detail Page Redesign — Design

Port the upstream OS Detail Page design (Claude Design project `aa9e4dd9`,
`DesktopColors.dc.html`) into the production Astro site. Scope is **the OS detail
page only** — the Explorer changes present in the same design file are already
shipped in production and are out of scope here.

Approach (agreed): push all pure work into `lib/` (unit-testable), extract only
`KnownUsesTimeline` as its own component, **reuse the existing `ColorInfobox`**
for the similar-colors panel, and keep references / steppers / the
extended-formats toggle inline in `OsDetail.tsx`. Deliver in two phases: (1) data
+ `lib` foundation, then (2) the view layer.

Translate the design's `.dc.html` (x-dc framework, hardcoded hex values) into
Astro/Preact + `src/styles/tokens.css` variables. Reuse existing tokens
(`--page-px`, `.dc-page-x`, `--faint`/`--muted`/`--accent*`, `.dc-card`) rather
than porting literal colors.

---

## 1. Data & schema

### `content/config.ts`

**Color object — remove `index`.** Delete the `index` field from `osColor`.

**OS object — three new optional fields:**

```ts
const osProject = z.object({ name: z.string().min(1), url: z.string().url() });

const osSchema = z.object({
  // …existing fields (name, year, added, family, tagline, description,
  //   predecessor, successor, desktopStyle, colors)…
  type: z.string().min(1).optional(),   // human label, rendered verbatim
  project: osProject.optional(),
  wikipedia: z.string().url().optional(),
});
```

- `type` is a **plain string holding the display label directly** — no enum, no
  label-mapping table. Rendered as-is in the meta line. During the port,
  translate the design's machine keys to labels once:
  `proprietary → "Proprietary"`, `opensource → "Open Source"`,
  `free → "Free"`, `hybrid → "Mixed license"`.
- All three fields optional: a platform missing them renders no `type` segment /
  no reference link, with no layout breakage.

### Data port (`src/content/os/*.json`)

- Strip `index` from **every** color in **every** file.
- Copy `type` / `project` / `wikipedia` from the design-project JSONs for the
  platforms they cover (amiga-workbench, amiga-workbench-2-0, beos, bleskos, cde,
  freegem, haiku, kde-1, kde-2, kde-plasma-6, mac-os-8, reactos, serenityos,
  windows-1-0, windows-2-0, windows-2000, windows-3-0, windows-3-1, windows-95,
  windows-98, windows-me, windows-nt-3-x, windows-nt-4-0, windows-xp),
  translating `type` keys to labels as above and mapping `project: null` to an
  omitted field. Any production-only platform not in the design project simply
  omits the new fields.
- Leave `added` (production-only, absent from the design JSONs) untouched.

### Test-fixture fallout

Every `lib` test fixture and island fixture that currently sets `index` must drop
it (`derive.test.ts`, `detail.test.ts`, `catalog.test.ts`, `explorer.test.ts`,
`os.test.ts`, `OsDetail.test.tsx`). This is a required, mechanical part of the
schema change — the build/type-check enforces it.

---

## 2. `lib/` — pure derivation & color math

### `lib/color.ts` — extended formats

Add pure functions + formatted-string helpers for the new formats, matching the
design's numeric formatting:

- `rgbToLab(r,g,b) → [L, a, b]` (CIELAB), display `L, a, b` at `toFixed(1)`,
  copy `lab(L% a b)`.
- `labToLch(L,a,b) → [L, C, H]`, display at `toFixed(1)`, copy `lch(L% C H)`.
- `rgbToOklab(r,g,b) → [L, a, b]` at `toFixed(3)`, copy `oklab(L a b)`.
- OKLCH derived from OKLab (`C = √(a²+b²)`, `H = atan2(b,a)` in degrees, wrapped
  to `[0,360)`), display `L, C, H` (`toFixed(3)`/`toFixed(1)`), copy
  `oklch(L C H)`.

`hexToOklab` already exists and should be reused where possible.

### `lib/derive.ts`

**Known uses.** Add a helper returning every platform shipping the exact hex:

```ts
interface HexUse { slug: string; name: string; year: number; isDefault: boolean }
function usesOfHex(hex: string, entries: OsEntry[]): HexUse[] // sorted year, then name
```

Reuses the grouping idea from `mergeColorsByHex` but carries per-platform
`isDefault`. **Remove `firstKnownUse` (and its `FirstUse` type if unused
elsewhere)** — its sole caller is `detail.ts`, and "first use" is now just
`usesOfHex(hex)[0]`. Leaving it behind would be dead code / immediate tech debt.

**Similar excludes identical.** Keep `similarColors` general; apply the filter in
`detail.ts` when building the `SimilarView` list — drop entries whose hex equals
the target hex (equivalently `match >= 100`), so "Similar colors elsewhere"
contains only genuinely-similar colors. Exact reuses of the same color are
represented solely by the Known-uses timeline.

### `lib/detail.ts`

- `ColorView` / `DetailColor`: drop `index`.
- Replace `firstUse` on `DetailColor` with the `uses: HexUse[]` list (the current
  color's slug is flagged `isCurrent` in the view layer, not stored).
- Similar list already exists; ensure identical-hex filtering is applied.

---

## 3. View — `islands/OsDetail.tsx`

New component `islands/KnownUsesTimeline.tsx`; reuse `islands/ColorInfobox.tsx`.

1. **References cluster** (header, right side, wraps below back-link on narrow):
   `REFERENCES` label + `⧉ {project.name} ↗` (if `project`) + `W Wikipedia ↗`
   (if `wikipedia`). Cluster hidden entirely when neither present. Links open in
   a new tab (`target="_blank" rel="noopener"`).
2. **Meta line**: `{family} · {year}` + ` · {type}` when `type` present.
3. **Steppers**: two-column grid of "Earlier" (predecessor) / "Later"
   (successor) cards; each shows the small label + platform name, truncating with
   ellipsis. Either side omitted if absent.
4. **All colors list**: row subtitle is the hex only (drop `· idx N`).
5. **KnownUsesTimeline** (replaces the old DETAILS box):
   - Input: `uses: HexUse[]`, `currentSlug`, color hex.
   - `n === 1`: solo state — count label `"1 palette"`, body
     `"Only in this palette so far."`
   - `n > 1`: count label `"{n} palettes · {minY}–{maxY}"`; a horizontal rail
     with a tick per use positioned at `((year - minY) / span) * 100%`
     (`span = max(1, maxY - minY)`); summary `First in {firstOs}, {minY}.` +
     tally (`Also in 1 other palette.` / `Recurs across {n} palettes through
     {lastOs}, {maxY}.`); toggle `View all {n} palettes →` / `Hide palettes`.
   - **Two-way hover**: local state `usesHover: { year, idx } | null`. Hovering a
     tick sets `{year, idx:null}` and highlights the matching row(s); hovering a
     row sets `{year, idx}` and enlarges/rings the matching tick. Current-OS tick
     and row use `--accent-strong` emphasis and a larger tick.
   - Expanded rows: rail line + dot, OS name, `FIRST` badge (first row),
     `DEFAULT` badge (isDefault), year; non-current rows navigate to that OS's
     color page (`colorPath(slug, hex)`), the current row is inert.
6. **Color values box**: primary rows HEX / RGB / HSL / CMYK always visible; an
   expandable **EXTENDED FORMATS** block (CIELAB, LCH, OKLab, OKLCH, Closest RAL
   Classic, Closest RAL Design+) behind a toggle
   `View all {total} formats →` / `Show fewer formats`. Each row click-to-copy
   with the existing "Copied ✓" affordance; RAL rows keep their swatch.
7. **Similar colors elsewhere**: cards for `match < 100`. Clicking a card toggles
   an inline `ColorInfobox` panel (flat variant) for that color, showing its
   color values and "SHIPPED ON THESE PLATFORMS" chips; a caret points at the
   opened card and the grid splits head / panel / tail around it (same pattern
   the Explorer bands already use). Card expand/collapse is client-only; only the
   infobox's platform chips navigate. Empty state: "No close matches on other
   platforms."
8. **Same-era peers**: unchanged grid; meta line rendered from a single
   `metaLine` string.

Selected-color card (swatch, name, DEFAULT badge, note, Download button) is
unchanged.

---

## 4. Responsive / narrow viewport

- Hero grid (preview + all-colors) stacks to one column on narrow.
- References cluster wraps under the back link.
- Known-uses timeline, extended-formats block, and similar-colors panels reflow
  within their containers.
- Use existing responsive tokens/classes from `tokens.css`; no new hardcoded
  breakpoints if an existing one fits.

---

## 5. Testing

- `lib/color.test.ts`: Lab / LCH / OKLab / OKLCH against known reference values;
  format-string shape.
- `lib/derive.test.ts` / `lib/detail.test.ts`: `usesOfHex` ordering (year then
  name) and `isDefault` flags; similar list excludes exact-hex matches; fixtures
  updated to drop `index`.
- `lib/catalog.test.ts`, `lib/explorer.test.ts`, `content/os.test.ts`: fixtures
  drop `index`; `ColorView` no longer carries it.
- `islands/KnownUsesTimeline.test.tsx`: solo vs multi; tick↔row hover linking;
  row navigation for non-current, inert current.
- `islands/OsDetail.test.tsx`: references render (and hide when absent); type
  segment; extended-formats toggle expands/collapses; similar-panel expand shows
  ColorInfobox; fixtures drop `index` / `firstUse`→`uses`.
- `npm run check` (astro/type check), `npm test`, `npm run build` all green;
  existing `npm run test:e2e` (beacons + wallpaper) unaffected.

---

## Phasing

1. **Data + lib foundation** — schema change, JSON port (index removal + new
   fields), `lib` color math + known-uses/similar derivation, all fixtures. Fully
   TDD-able; leaves the tree green before any UI change.
2. **View layer** — `KnownUsesTimeline`, references/steppers/extended-formats in
   `OsDetail.tsx`, similar-colors `ColorInfobox` reuse, responsive polish.

## Out of scope

- Explorer OS-filter panel and band-infobox changes (already in production).
- Any change to the counter/edge service or the score contracts.
- New desktop preview styles.
