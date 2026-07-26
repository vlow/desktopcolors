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

<!-- Maintainers: this file mirrors docs/adding-os-data.md and
     docs/adding-a-preview-style.md. Update all three in the same change — see CLAUDE.md. -->
*Maintaining this file rather than contributing to it? It mirrors
`docs/adding-os-data.md` and `docs/adding-a-preview-style.md` — keep shared material in
sync across all three.*

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
| `added` | yes | `YYYY-MM-DD` — the day you write the file, not the day the PR merges. Never bump it later; it drives the "newest" sort. |
| `family` | yes | groups the platform. Reuse an existing value unless genuinely new — the full set in use today is `Amiga`, `BeOS`, `BleskOS`, `Desktop Env.`, `GEM`, `Haiku`, `Mac OS`, `ReactOS`, `SerenityOS`, `Solaris`, `Windows`. |
| `tagline` | yes | one evocative line |
| `description` | yes | one or two sentences of real context |
| `colors` | yes | at least one entry; **at most one** may be `"default": true` |
| `slug` | no | defaults to the filename; lowercase letters, digits, hyphens |
| `predecessor`, `successor` | no | slug refs to other entries. A dangling ref fails the build. |
| `desktopStyle` | no | defaults to `modern` — see [Desktop chrome](#desktop-chrome) |
| `type` | no | `Proprietary` or `Open Source` — those are the only two values in use |
| `wikipedia` | no | URL. Must parse as a URL, so include the scheme. |
| `project` | no | `{ "name", "url" }` for the project's own site. `url` must parse as a URL. |

Two things the schema does **not** enforce, so match the worked example by hand:

- **Key order.** Every file in the collection uses the order shown above — `name`,
  `year`, `added`, `family`, `tagline`, `description`, the slug refs, `desktopStyle`,
  `colors`, then `type`, `project`, `wikipedia`. JSON key order is meaningless to the
  parser; keep it anyway so the files diff against each other.
- **Reciprocal links.** `predecessor` and `successor` are two independent one-way
  fields. Writing `"predecessor": "beos"` in your file gives *your* page a link back to
  BeOS; it does **not** give BeOS a forward link to you. If you want both, add
  `"successor": "<your-slug>"` to `beos.json` in the same PR. Nothing checks for the
  missing half, and several entries may name the same predecessor.

### Colors

Each entry in `colors` is `{ hex, name, note?, default? }`:

- **`hex`** — lowercase `#rrggbb`. No shorthand, no named colors. **Nothing in the
  toolchain enforces the lowercase part** — the schema's pattern is
  `/^#[0-9a-fA-F]{6}$/`, so `#6A859E` builds and tests green. It is a review-enforced
  convention, and the reason is stronger than "it looks inconsistent": every hex is
  lowercased before it reaches *any* view. `toColorView` (`src/lib/catalog.ts`) and the
  merge path (`src/lib/derive.ts`) both call `.toLowerCase()` on the way in, platform
  pages included — so an uppercase value doesn't just pass the build, it renders
  identically to a lowercase one everywhere on the site. Nothing downstream will ever
  surface it. The pull request diff is the only place it can ever be caught — which is
  exactly why the checklist below says "read them — no command checks case."
- **`name`** — a human name for the swatch. Where a family has light/dark variants,
  qualify it: `French Blue (Light)`, `Olive (Dark)`.
- **`note`** — optional, terse: where the color is used, which theme it belongs to,
  how confident you are. **Plain text, not Markdown** — it is rendered as a text node,
  so backticks and `*` would show up literally. One or two sentences; there is no
  length limit, but the existing notes stay under about three lines.
- **`default`** — marks the out-of-the-box desktop color. **At most one per file.**

Array order is display order: the `colors` array is listed top to bottom on
`/os/<slug>` exactly as you write it, unsorted. Keep related entries adjacent. Order
does not decide which swatch is *selected* when the page opens — that is the `default`
entry wherever it sits in the array — so you are free to order for readability.

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

For a dither of two source colors **A** and **B**, add these entries, **contiguously and
in this order**. `<Name>` is a name for the *blended* shade the pattern fakes; in the
four-entry shape it conventionally starts with "Dithered" — `Dithered Green` in Windows
1.0, `Dithered Blue` in FreeGEM. Both blended entries share that one `<Name>` and differ
only in the parenthetical.

1. **`<Name> (Averaged)`** — the conventional pixel average: the per-channel arithmetic
   mean in sRGB, weighted by each color's share of the pattern, rounded to 8-bit. The
   naive "what it blurs to" color.
2. **`<Name> (Gamma-Corrected)`** — the same mix averaged in linear light (sRGB →
   linear, mean, → sRGB). This tracks perception better and is usually lighter and
   airier than the pixel average.
3. **partial A** — one source color, named by its actual color (`Phosphor Green`,
   `Stone Gray`), with a note giving its share of the pattern.
4. **partial B** — the other source color, same treatment. When both sources are the
   same hue and a distinct color name would be a lie, qualify instead:
   `Gray (Light Partial)` / `Gray (Dark Partial)`, as Mac OS 8 does.

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
not. It lands in the file as exactly these three, contiguous:

```json
{ "hex": "#9e9e9e", "name": "Gray (Dithered)" },
{ "hex": "#a5a5a5", "name": "Gray (Light Partial)" },
{ "hex": "#969696", "name": "Gray (Dark Partial)" }
```

Note the naming: in the collapsed form `<Name>` is the plain hue (`Gray`), not the
`Dithered <Hue>` used for the four-entry pair — the word "Dithered" has moved into the
parenthetical, so repeating it would read `Dithered Gray (Dithered)`.

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

**3. Add one assertion** to the `"draws the expected chrome per style"` test in
`src/islands/DesktopPreview.test.tsx` — a hand-written list of one line per style, in
`DESKTOP_STYLES` order. The strings are the `data-testid`s the chrome renders, which are
`chrome-` plus the primitive's name lowercased and unhyphenated:

```ts
expect(chromeFor("nextstep")).toEqual(["chrome-deskicons", "chrome-dock"]);
```

Add the line even though nothing forces you to. The neighbouring test
`"every style renders chrome"` *does* iterate `DESKTOP_STYLES`, but it only asserts that
each style renders *some* chrome — so a style with a `CHROME_SPECS` entry and no
per-style assertion passes `vitest` silently, and the exact chrome goes unpinned.

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
3. A `case` for it in the `renderPart` switch. This is the one place in the chrome
   system where a forgotten case is **silent**: `renderPart` returns `ComponentChildren`,
   which admits `undefined`, so `astro check` does not fail — the part just renders
   nothing. Check the preview in the browser. (A missing `CHROME_SPECS` entry, by
   contrast, does fail `astro check` — see [Add a new style](#add-a-new-style-from-existing-primitives) above.)
4. The authoring conventions: chrome sits on an unknown wallpaper, so derive translucent
   surfaces from `chromeSurfaces(onColor)` rather than picking opaque colors, size in
   `cu()` units so the chrome scales with the preview box, use `<div>` and `<svg>` only,
   and put `data-testid="chrome-<name>"` on the primitive's root.

For the full detail — the data flow, every convention, and the checklist — see
[docs/adding-a-preview-style.md](docs/adding-a-preview-style.md).

## Verify

| command | what it catches |
|---------|-----------------|
| `npm run build` | **the authoritative check on your JSON** — the content schema (malformed hex, missing field, bad `added` format, unknown `desktopStyle`, non-URL `wikipedia`/`project.url`, more than one `default`) and dangling `predecessor`/`successor` refs. Also proves every page still pre-renders. It does **not** check hex *case* — see [Colors](#colors). |
| `npx vitest run` | `src/content/os.test.ts` re-reads every file in `src/content/os/` and parses it, so most mistakes surface here first and fastest. It uses its own copy of the schema, which omits the `wikipedia`, `project`, and `type` rules — a pass here is encouraging, not conclusive. |
| `npx astro check` | TypeScript only — notably a missing `CHROME_SPECS` entry. It does not read your JSON at all. |
| `npm run dev` | your own eyes: open `http://localhost:4321/os/<slug>` and check the swatches and the preview on both light and dark colors. |

Two commands read your JSON: `vitest` and the build. The build is authoritative — it uses
the real schema — while vitest is faster and usually catches a mistake first, but from a
hand-maintained duplicate of that schema. If you only run one thing, run `npm run build`.

A local build prints `[scores] scores.json not found — defaulting all scores to 0`. That
is expected: popularity scores come from the `counter` service at deploy time, and the
build succeeds without them.

### Reading a schema failure

A file whose `hex` was missing its `#` fails the build like this:

```
[InvalidContentEntryFrontmatterError] [astro:content-imports] os → zzz-temp-broken frontmatter does not match collection schema.
must be #rrggbb
file: /…/src/content/os/zzz-temp-broken.json?astroDataCollectionEntry=true:0:0
```

The entry name after `os →` is your file. The line under it is the schema's message. The
reported location is always `:0:0` — Astro cannot map a JSON error back to a line — so
the message itself is all you get.

**Whether that message names the offending field depends on the rule.** Three rules in
the schema carry a hand-written message, and those print bare, with no field path:

| message | what it means |
|---------|---------------|
| `must be #rrggbb` | some `hex` is malformed |
| `must be YYYY-MM-DD` | `added` is the wrong shape |
| `at most one color may be marked default` | two or more colors have `"default": true` |

Every other rule prints `path: message`, and the path includes the array index — so you
do **not** have to hunt:

```
tagline: Required
colors.2.name: String must contain at least 1 character(s)
project.url: Invalid url
desktopStyle: Invalid enum value. Expected 'modern' | 'win9x' | … , received 'nextstep'
```

`colors.2` is the third entry in your `colors` array, zero-indexed. Only the three bare
messages above leave you checking entries by hand — and for `must be #rrggbb` that means
re-reading each `hex` for a missing `#`, a wrong length, or a stray character.

A dangling `predecessor`/`successor` is the sibling case. It is not a schema message but
a thrown error, and it lands later — during "generating static routes", after the schema
has already passed:

```
Unresolved predecessor "does-not-exist" referenced by "zzz-walkthrough"
```

Both slugs are named, so this one is self-diagnosing.

CI (`.github/workflows/ci.yml`) runs three jobs on every pull request: `site`
(`npm run check`, `npm test`, `npm run build`), `counter` (Go vet and tests, untouched by
content work), and `e2e` (`npm run test:e2e`, Playwright against a real build). Passing
`npm run build` locally clears the job that content changes normally break. The one way a
platform file reaches `e2e` is through the assertions that count search results — for
instance `e2e/smoke.spec.ts` types "amiga" and expects exactly two cards. The search
match surface is wider than name and tagline: `PlatformControls.tsx:53-57` also matches
`family`, `defaultHex`, and every alt color's `name` and `hex` — so a platform with
`"family": "Amiga"` breaks that count assertion even if its own `name` and `tagline`
never mention Amiga. If your platform shares a name, family, tagline, or any color's
name or hex with something already in the catalog, run `npm run test:e2e` before opening
the PR.

## Open the pull request

Commit messages follow the repository's history — a conventional-commit prefix, usually
with a scope:

```
feat(os): add BeOS
fix(colors): correct the Windows 95 teal
feat(design): add the nextstep chrome style
```

`feat(os): add BeOS` above is a legal, invented example, not one pulled from history —
real OS-scoped commits skew `fix(os)`/`chore(os)`/`data(os)`. Types in use include
`feat`, `fix`, `docs`, `chore`, `test`, and `refactor`, plus a handful of others; this
list is representative, not exhaustive. Scopes in use: `os`, `colors`, `design`. `docs`
is a type, never a scope — a documentation change is `docs: …`, not `docs(docs): …`.

The description must contain the source citation for every color, per
[Sourcing](#sourcing). For a new or changed chrome style, add a screenshot of the
preview on both a light and a dark color.

Then run through this — the pull request template mirrors it:

- [ ] The file is `src/content/os/<slug>.json`, `hex` values are lowercase `#rrggbb` (read them — no command checks case), and at most one color is `default`.
- [ ] `family` and `type` reuse existing values unless genuinely new.
- [ ] Any dithered desktop has its blended entry(ies) plus partials, with **recomputed** averages and the collapse rule applied.
- [ ] `npm run build` passes.
- [ ] The PR description names the source of every color.
