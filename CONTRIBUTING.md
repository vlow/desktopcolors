# Contributing to desktopcolors

desktopcolors archives the **solid desktop background colors** of classic operating
systems and desktop environments — the flat color behind the icons, before wallpapers
took over. Every platform on the site is one JSON file; every color in it is a hex value
someone had to go and find.

There are two things you can contribute, and you may do either or both:

1. **Platform data** — a new `src/content/os/<slug>.json`, or a correction to an existing
   one. This is content work: no TypeScript required.
2. **Desktop chrome** — the schematic preview that shows a color as a desktop. Pointing a
   platform at an existing style is one line of JSON; a genuinely new shell shape is a
   small TypeScript change.

Everything below is self-contained: you should not need to read any other file in the
repository to land a contribution.

## Sourcing

**Your pull request must name where the color came from.**

Any credible source counts:

- a screenshot of a real or emulated install, with the pixel sampled
- a constant in a source, theme, or resource file
- official documentation or a manual
- a reputable archive or preservation project

There is no fixed citation format — a sentence in the pull request description is
enough. If you sampled a pixel, say which screenshot and where you got it. If you read a
constant, link the file and line.

We would rather have a well-sourced approximation with an honest note than a confident
wrong hex. If you are unsure, say so in the `note` field and in the PR.

## Setup

You need **Node ≥ 20** (the version in `.nvmrc`). Then:

```bash
npm install
```

and work on a branch.

**Go is not required.** The README lists Go ≥ 1.25 as a prerequisite, but that is only
for the `counter` service in `counter/` — the small backend that records popularity
points. Nothing in this guide touches it.

## Add a platform

One platform is one file: `src/content/os/<slug>.json`. The filename becomes the slug
and therefore the URL — `beos.json` is served at `/os/beos`. Use lowercase letters,
digits, and hyphens.

A complete file, `src/content/os/haiku.json`:

```json
{
  "name": "Haiku",
  "year": 2009,
  "added": "2026-07-20",
  "family": "Haiku",
  "tagline": "The open-source heir to BeOS — same focused desktop, same signature blue.",
  "description": "Haiku is a free and open-source operating system that continues BeOS, aiming for binary compatibility with its applications while modernizing the system underneath. It keeps the fast, single-user desktop that made BeOS distinctive — right down to its signature slate-blue backdrop.",
  "predecessor": "beos",
  "desktopStyle": "beos",
  "colors": [
    {
      "hex": "#336698",
      "name": "Steel Blue",
      "note": "The Haiku desktop blue.",
      "default": true
    }
  ],
  "type": "Open Source",
  "project": {
    "name": "Haiku",
    "url": "https://www.haiku-os.org"
  },
  "wikipedia": "https://en.wikipedia.org/wiki/Haiku_(operating_system)"
}
```

### Fields

| field | required | rules |
|-------|----------|-------|
| `name` | yes | display name, non-empty |
| `year` | yes | integer release year |
| `added` | yes | `YYYY-MM-DD` — the date the entry joins the catalog. Never bump it later; it drives the "newest" sort. |
| `family` | yes | groups the platform. Reuse an existing value (`Windows`, `Mac OS`, `Amiga`, `Desktop Env.`, …) unless genuinely new. |
| `tagline` | yes | one evocative line |
| `description` | yes | one or two sentences of real context |
| `colors` | yes | at least one entry; **at most one** may be `"default": true` |
| `slug` | no | defaults to the filename; lowercase letters, digits, hyphens |
| `predecessor`, `successor` | no | slug refs to other entries. A dangling ref fails the build. |
| `desktopStyle` | no | defaults to `modern` — see [Desktop chrome](#desktop-chrome) |
| `type` | no | `Proprietary` or `Open Source` — reuse existing values |
| `wikipedia` | no | URL |
| `project` | no | `{ "name", "url" }` for the project's own site |

### Colors

Each entry in `colors` is `{ hex, name, note?, default? }`:

- **`hex`** — lowercase `#rrggbb`. No shorthand, no uppercase, no named colors.
- **`name`** — a human name for the swatch. Where a family has light/dark variants,
  qualify it: `French Blue (Light)`, `Olive (Dark)`.
- **`note`** — optional, terse: where the color is used, which theme it belongs to,
  how confident you are.
- **`default`** — marks the out-of-the-box desktop color. **At most one per file.**

Converting RGB to hex:

```js
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
hex([179, 179, 218]); // "#b3b3da"
```

### Dithered colors

Some desktops never showed a solid color at all. A fixed hardware palette left the OS
unable to name the shade it wanted, so it **dithered**: it checkerboarded two palette
colors in a repeating pattern to fake a third. `#rrggbb` can only hold a solid color, so
one dithered desktop becomes a small **cluster** of entries rather than a single one.

Live examples to copy the phrasing from:

- `src/content/os/windows-1-0.json` — green + cyan, 75/25
- `src/content/os/freegem.json` — gray + blue, 1:1
- `src/content/os/mac-os-8.json` — gray + gray, 1:1

#### The four-entry shape

For a dither of two source colors **A** and **B**, add these entries, in this order:

1. **`<Name> (Averaged)`** — the conventional pixel average: the per-channel arithmetic
   mean in sRGB, weighted by each color's share of the pattern, rounded to 8-bit. The
   naive "what it blurs to" color.
2. **`<Name> (Gamma-Corrected)`** — the same mix averaged in linear light (sRGB →
   linear, mean, → sRGB). This tracks perception better and is usually lighter and
   airier than the pixel average.
3. **partial A** — one source color, named by its actual color (`Phosphor Green`,
   `Stone Gray`), with a note giving its share of the pattern.
4. **partial B** — the other source color, same treatment.

Cross-reference the hexes in the notes: each blended entry names the other averaging
method's result, and each partial names the pattern it fills.

#### Where `default` goes

Mark the `(Averaged)` entry `default` **only when the dither is the platform's actual
desktop** — FreeGEM and Windows 1.0 are both like that. When the dither is merely one
option among solid colors, `default` belongs on the solid color instead: in Mac OS 8 the
gray dither is one wallpaper among many, and `default` sits on `French Blue (Light)`.

#### Weighting

If the pattern is not 1:1, weight **both** averages by area and say so in the note.
Windows 1.0 is 75% green / 25% cyan — each 8×8 green block holds a 4×4 cyan patch.

#### The collapse rule (three entries)

When the two source colors are close together and/or near-neutral, both averages round to
the same hex, and listing them both would put a duplicate swatch on the page. In that
case collapse to a single **`<Name> (Dithered)`** entry plus the two partials — three
entries — and note that both averaging methods agree at 8-bit precision.

Mac OS 8's gray dither is the canonical case: `#a5a5a5` + `#969696` at 1:1 gives a simple
average of `157.5` and a linear-light average of `157.7`, both rounding to `#9e9e9e`.
Grays barely span a gamma gap, so the methods converge; a wide mix like gray + blue does
not.

#### Computing the averages

**Always recompute, never eyeball.** Whether the two methods diverge is exactly what
decides four entries versus three, and the difference is often a few units per channel.

```js
// per channel c is 0–255; wA + wB = 1 (use 0.5 / 0.5 for a 1:1 dither)
const round = v => Math.round(v);

// 1) simple pixel average (sRGB channel mean)
const simple = (a, b, wA = 0.5, wB = 0.5) => round(a * wA + b * wB);

// 2) linear-light (gamma-corrected) average
const toLin  = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = l => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055) * 255;
const gamma  = (a, b, wA = 0.5, wB = 0.5) => round(toSrgb(toLin(a) * wA + toLin(b) * wB));
```

Apply each to the R, G, and B channels of the two source colors. If `simple` and `gamma`
produce the same `#rrggbb`, apply the collapse rule.

## Desktop chrome

A **preview** is the schematic desktop mockup on `/os/<slug>` and in the fullscreen
viewer: a box filled with the selected color — the wallpaper — plus a few translucent
overlays (desktop icons, a taskbar, a menu bar, a dock, a front panel, a window). It
shows how a color reads as a desktop background for that platform. It is built from
`<div>`s and `<svg>`s only, no images, so it works on any color.

Which chrome a preview draws is chosen by the platform's `desktopStyle`. That field
affects **only the on-screen preview** — the downloadable wallpaper is always a plain
solid-color PNG and never reads the style.

Eleven styles exist. Check for a fit here before building anything:

| `desktopStyle` | chrome | modeled on |
|----------------|--------|------------|
| `modern` | corner icons + two windows + segmented dock with clock | platform-neutral **default** |
| `win9x` | icons + window + Recycle Bin + taskbar | Windows 95/98/Me/NT 4.0/2000/XP, ReactOS, SerenityOS |
| `win31` | Program Manager window (two group panes) | Windows 1.0/2.0/3.0/3.1, NT 3.x |
| `platinum` | menu bar + icons + Platinum window | Mac OS 8 |
| `beos` | deskbar tab + icons + tabbed window | BeOS, Haiku |
| `amiga` | top bar + icons + window | Amiga Workbench |
| `kde` | window + bottom dock | KDE 1/2, Plasma 6 |
| `cde` | icon + Motif window + front panel | CDE, Solaris |
| `gem` | menu bar + icons + GEM window | Digital Research GEM (FreeGEM) |
| `bleskos` | full-screen program switcher | BleskOS |
| `generic` | icons + dock | minimal / unknown shells |

### Reuse an existing style

This covers most contributions. One line in the platform's JSON:

```json
"desktopStyle": "kde"
```

That is the whole change. An unknown value fails the build.

### Add a new style from existing primitives

Say the new style is `nextstep`. Three edits.

**1. Register the name** in `src/lib/desktopStyle.ts` — the only place the set is
declared:

```ts
export const DESKTOP_STYLES = ["modern", "win9x", "win31", "platinum", "beos", "amiga", "kde", "cde", "gem", "bleskos", "generic", "nextstep"] as const;
```

**2. Add the spec** to `CHROME_SPECS` in `src/lib/chromeSpec.ts`:

```ts
  nextstep: [
    { part: "deskIcons", side: "right", icons: [{ kind: "drive", label: "Disk" }] },
    { part: "dock" },
  ],
```

You cannot silently skip this step: `CHROME_SPECS` is typed
`Record<DesktopStyle, ChromeSpec | null>`, so `npx astro check` fails until every style
has an entry. Use `null` only for a bespoke-rendered style — today just `modern`.

**3. Add one assertion** to `src/islands/DesktopPreview.test.tsx`, which iterates
`DESKTOP_STYLES`:

```ts
expect(chromeFor("nextstep")).toEqual(["chrome-deskicons", "chrome-dock"]);
```

Then set `"desktopStyle": "nextstep"` on the platforms that use it.

#### The primitive vocabulary

A spec is an ordered array of these parts, drawn in order:

| `part` | params | draws |
|--------|--------|-------|
| `deskIcons` | `side: "left"\|"right"`, `anchor?: "top"\|"bottom"`, `icons: {kind,label}[]` | a column of line-art desktop icons with labels |
| `window` | `left`, `top`, `w`, `body` | a translucent window (title bar + dots + body) |
| `beosWindow` | `left`, `top`, `w`, `body` | a BeOS-style tabbed window |
| `platinumWindow` | `left`, `top`, `w`, `body` | a Mac OS 8 Platinum window |
| `cdeWindow` | `left`, `top`, `w`, `body` | a CDE/Motif window |
| `gemWindow` | `left`, `top`, `w`, `body` | a GEM window |
| `taskbar` | — | Win9x bottom taskbar |
| `menuBar` | — | Mac Platinum / GEM top menu bar |
| `topBar` | — | Amiga Workbench top bar |
| `dock` | — | KDE / generic bottom dock |
| `frontPanel` | — | CDE front panel |
| `beosTab` | — | BeOS deskbar tab (top-right) |
| `bleskos` | — | BleskOS full-screen program switcher |

A window's `body` is one of:

- `{ kind: "gridIcons", icons: IconKind[], cols }` — a grid of line-art icons
- `{ kind: "rows", widths: number[] }` — placeholder text rows, widths in percent
- `{ kind: "panes", count: 2 }` — two Program-Manager group boxes

`IconKind` is `computer | folder | trash | drive | disk`.

### Add a new primitive

**Most contributions will not need this.** It is TypeScript and Preact work rather than
content, and it is only warranted when no existing primitive draws the shape you need.

Four moving parts:

1. A new `part` variant on the `ChromePart` discriminated union in
   `src/lib/chromeSpec.ts`.
2. A matching component in `src/islands/DesktopPreview.tsx`.
3. A `case` for it in the exhaustive `renderPart` switch — `astro check` fails until it
   is there.
4. The authoring conventions: chrome sits on an unknown wallpaper, so derive translucent
   surfaces from `chromeSurfaces(onColor)` rather than picking opaque colors, size in
   `cu()` units so the chrome scales with the preview box, use `<div>` and `<svg>` only,
   and put `data-testid="chrome-<name>"` on the primitive's root.

For the full detail — the data flow, every convention, and the checklist — see
[docs/adding-a-preview-style.md](docs/adding-a-preview-style.md).

## Verify

| command | what it catches |
|---------|-----------------|
| `npm run build` | **the only check that validates your JSON** — the content schema (bad hex, missing field, more than one `default`) and dangling `predecessor`/`successor` refs. Also proves every page still pre-renders. |
| `npx astro check` | TypeScript errors — a missing `CHROME_SPECS` entry, a non-exhaustive `renderPart` switch. Passes clean on a broken JSON file, so it is not a substitute for the build. |
| `npx vitest run` | the pure logic — color math, catalog derivation, chrome spec parsing. No test reads `src/content/os/*.json`. |
| `npm run dev` | your own eyes: open `/os/<slug>` and check the swatches and the preview on both light and dark colors. |

If you only run one thing, run `npm run build`.

### Reading a schema failure

A file whose `hex` was missing its `#` fails the build like this:

```
[InvalidContentEntryFrontmatterError] [astro:content-imports] os → zzz-temp-broken frontmatter does not match collection schema.
must be #rrggbb
file: /…/src/content/os/zzz-temp-broken.json?astroDataCollectionEntry=true:0:0
```

The entry name after `os →` is your file. The bare line under it — `must be #rrggbb` —
is the schema's message. The reported location is always `:0:0`, and **the message does
not say which field or array index failed**, so when a file has several colors you have
to check each `hex` by hand.

A dangling `predecessor`/`successor` is the sibling case. It is not a schema message but
a thrown error while the catalog is built:

```
Unresolved predecessor "…" referenced by "…"
```

CI (`.github/workflows/ci.yml`) runs `npm run check`, `npm test`, and `npm run build` on
every pull request, so a green local build predicts a green PR.

## Open the pull request

Commit messages follow the repository's history — a conventional-commit prefix with a
scope:

```
feat(os): add BeOS
fix(colors): correct the Windows 95 teal
feat(design): add the nextstep chrome style
```

Scopes in use: `os`, `colors`, `design`, `docs`.

The description must contain the source citation for every color, per
[Sourcing](#sourcing). For a new or changed chrome style, add a screenshot of the
preview on both a light and a dark color.

Then run through this — the pull request template mirrors it:

- [ ] The file is `src/content/os/<slug>.json`, `hex` values are lowercase `#rrggbb`, and at most one color is `default`.
- [ ] `family` and `type` reuse existing values unless genuinely new.
- [ ] Any dithered desktop has its blended entry(ies) plus partials, with **recomputed** averages and the collapse rule applied.
- [ ] `npm run build` passes.
- [ ] The PR description names the source of every color.
