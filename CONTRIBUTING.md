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

We would rather have a well-sourced approximation with an honest caveat than a confident
wrong hex. If you are unsure, say so in the PR.

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
  "predecessor": "beos",
  "desktopStyle": "beos",
  "colors": [
    {
      "hex": "#336698",
      "name": "Steel Blue",
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
| `family` | yes | groups the platform. Reuse an existing value unless genuinely new — the full set in use today is `Amiga`, `BeOS`, `BleskOS`, `Commodore`, `Desktop Env.`, `GEM`, `Mac OS`, `Plan 9`, `ReactOS`, `SerenityOS`, `Solaris`, `Windows`. |
| `colors` | yes | at least one entry; **at most one** may be `"default": true` |
| `slug` | no | defaults to the filename; lowercase letters, digits, hyphens |
| `predecessor`, `successor` | no | slug refs to other entries. A dangling ref fails the build. |
| `desktopStyle` | no | defaults to `modern` — see [Desktop chrome](#desktop-chrome) |
| `type` | no | `Proprietary` or `Open Source` — those are the only two values in use |
| `wikipedia` | no | URL. Must parse as a URL, so include the scheme. |
| `project` | no | `{ "name", "url" }` for the project's own site. `url` must parse as a URL. |
| `links` | no | `[{ "name", "url" }, …]` — any number of further reference links. See [Reference links](#reference-links). |
| `source` | no | `{ "text", "links" }` — where these colors came from. See [The source note](#the-source-note). |

#### Reference links

The detail page's **References** row is built from three fields and takes any number of
links: `project` first, then every entry of `links` in file order, then `wikipedia` last.
Each renders as one pill; `wikipedia` gets the **W** mark, the others a `⧉`. Omit all
three and the row disappears.

`project` and `wikipedia` stay separate fields because they are the two references almost
every entry has, and they have fixed positions and marks. Anything else — a vendor site, a
palette derivation, a museum page, a hardware reference — goes in `links`:

```json
"links": [
  { "name": "Commodore", "url": "https://commodore.net/" },
  { "name": "Colodore", "url": "https://www.colodore.com/" }
]
```

Every `url` is validated by the schema, so a bare hostname fails the build. Keep `name`
short — it is the pill's whole label.

#### The source note

`source` records **where the values in this file were actually obtained** — the
emulator, the source tree, the shipped file. It is not the same job as `links`,
which point at background reading about the platform. It renders on the detail
page in the "All colors" card: its header becomes an **All colors | Source**
switcher, and the note takes the card's existing space rather than adding any.
The colour list shows by default.

```json
"source": {
  "text": "Sampled from the 48-cell basic palette in the [Display Properties] color dialog under [v86], cross-checked against the shipped `.theme` files.",
  "links": {
    "Display Properties": "https://en.wikipedia.org/wiki/Windows_95",
    "v86": "https://copy.sh/v86/"
  }
}
```

`text` takes exactly two markers:

| marker | renders as |
|--------|-----------|
| `[Label]` | a link, labelled `Label`, whose URL is `links["Label"]` |
| `` `x` `` | inline mono, for filenames and identifiers |

Everything else is literal, including an unmatched `[` or backtick — prose with a
stray bracket is fine and will not fail the build. Markers do not nest, and there
is no escape syntax.

The schema cross-checks the two halves **in both directions**, so both of these
fail the build:

- a `[Label]` with no matching key in `links` — it would otherwise render as
  literal brackets, which nobody notices in review;
- a key in `links` never cited in `text` — dead data, usually left behind by a
  rename.

Keep the note to a couple of sentences, and cite the specific artefact rather than
the general one: *the shipped `.theme` files on the Plus! disc* is useful, *the
internet* is not. The field is optional and most entries do not have one yet; add
one when you have done the research to back it. `links` itself defaults to `{}`,
so a note with no `[Label]` markers can omit it entirely — `{ "text": "…" }` is a
complete, valid `source`.

#### The prose fields

`description` (entry-level) and `note` (per-color) are optional, default to `""`, and the
UI renders them when set. Both are in active use — nearly every entry carries a
`description`, and roughly two thirds carry per-color notes.

**`note` records where the color comes from inside the OS**, and the established
convention is **which built-in theme or style shipped it**:

```json
{ "hex": "#3f7c7c", "name": "Muted Teal", "note": "Used in the Designer theme." }
```

- Use the platform's **own word** for the concept — Windows NT ships *themes*
  (`src/content/os/windows-nt-3-x.json`), Blackbox ships *styles*
  (`src/content/os/blackbox.json`).
- If one color serves several themes, name them all in **one** note
  (`"Used in the Nyz and Twice styles."`) rather than repeating the swatch — the site
  keys colors by hex, and a duplicate hex in one file renders as a duplicate swatch.
- A color that is just part of the palette and not any theme's default takes **no**
  note. Windows NT 3.x carries notes on 16 of its 53 colors for exactly this reason.
- Keep it to a sentence. Reasoning that justifies the *edit* — why you chose a swatch
  name, how you weighted a dither — goes in your pull request, where the reviewer reads
  it, not in the file. **What source you read** is the exception: that belongs in the
  entry's [`source`](#the-source-note) note, which exists to publish it.

`tagline` is gone outright: out of the schema, out of `OsView`, out of the platform cards.
Zod strips unknown keys instead of rejecting them, so a `"tagline"` left in a file parses
without complaint and is then silently dropped — `src/content/os.test.ts` fails on one to
keep that from going unnoticed.

Two things the schema does **not** enforce, so match the worked example by hand:

- **Key order.** Every file in the collection uses the order shown above — `name`,
  `year`, `added`, `family`, the slug refs, `desktopStyle`, `source` (when present),
  `colors`, then `type`, `project`, `wikipedia`. JSON key order is meaningless to
  the parser; keep it anyway so the files diff against each other.
- **Reciprocal links.** `predecessor` and `successor` are two independent one-way
  fields. Writing `"predecessor": "beos"` in your file gives *your* page a link back to
  BeOS; it does **not** give BeOS a forward link to you. If you want both, add
  `"successor": "<your-slug>"` to `beos.json` in the same PR. Nothing checks for the
  missing half, and several entries may name the same predecessor.

### Colors

Each entry in `colors` is `{ hex, name, note?, default? }`:

- **`hex`** — lowercase `#rrggbb`. No shorthand, no named colors. The lowercase part is
  **build-checked**: the schema's pattern is `/^#[0-9a-f]{6}$/`, so `#6A859E` fails with
  `must be lowercase #rrggbb`. This keeps the source
  files single-case and therefore diff-/greppable: `grep -r '#ae8080' src/content/os` finds
  every use of a color without a case-insensitive flag.
- **`name`** — a human name for the **color**. Where a family has light/dark variants,
  qualify it: `French Blue (Light)`, `Olive (Dark)`. Don't qualify it with the theme or
  style that ships the color — that goes in `note`.
- **`note`** — optional; which built-in theme or style uses this color. See
  [The prose fields](#the-prose-fields).
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
   `Stone Gray`).
4. **partial B** — the other source color, same treatment. When both sources are the
   same hue and a distinct color name would be a lie, qualify instead:
   `Gray (Light Partial)` / `Gray (Dark Partial)`, as Mac OS 8 does.

Nothing in the file records which entries belong to one cluster or how the pattern is
weighted — the entry names carry the structure, and the rest goes in your pull request.

#### Where `default` goes

Mark the `(Averaged)` entry `default` **only when the dither is the platform's actual
desktop** — FreeGEM and Windows 1.0 are both like that. When the dither is merely one
option among solid colors, `default` belongs on the solid color instead: in Mac OS 8 the
gray dither is one wallpaper among many, and `default` sits on `French Blue (Light)`.

#### Weighting

If the pattern is not 1:1, weight **both** averages by area and state the ratio in the PR.
Windows 1.0 is 75% green / 25% cyan — each 8×8 green block holds a 4×4 cyan patch.

#### The collapse rule (three entries)

When the two source colors are close together and/or near-neutral, both averages round to
the same hex, and listing them both would put a duplicate swatch on the page. In that
case collapse to a single **`<Name> (Dithered)`** entry plus the two partials — three
entries — and say in the PR that both averaging methods agree at 8-bit precision.

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

Fourteen styles exist. Check for a fit here before building anything:

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
| `blackbox` | floating root menu + cascading submenu + workspace bar | Blackbox (menu-only WMs) |
| `c64` | screen border frame + BASIC boot banner + `READY.` prompt | Commodore 64 (BASIC-prompt home computers) |
| `openlook` | Waste icon + two overlapping OPEN LOOK windows (no panel at all) | OpenWindows / `olwm` (SunOS, early Solaris) |
| `plan9` | two side-by-side rio windows (no panel, no dock, no icons) | Plan 9 (rio) |
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
export const DESKTOP_STYLES = ["modern", "win9x", "win31", "platinum", "beos", "amiga", "kde", "cde", "gem", "bleskos", "blackbox", "c64", "openlook", "generic", "nextstep"] as const;
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
| `openLookWindow` | `left`, `top`, `w`, `body` | an OPEN LOOK window (menu gadget + menu-button row) |
| `rioWindow` | `left`, `top`, `w`, `body` | a Plan 9 rio window (tag line instead of a title bar, left-hand scroll bar, square corners) |
| `taskbar` | — | Win9x bottom taskbar |
| `menuBar` | — | Mac Platinum / GEM top menu bar |
| `topBar` | — | Amiga Workbench top bar |
| `dock` | — | KDE / generic bottom dock |
| `frontPanel` | — | CDE front panel |
| `beosTab` | — | BeOS deskbar tab (top-right) |
| `bleskos` | — | BleskOS full-screen program switcher |
| `rootMenu` | — | Blackbox titled root menu + cascading submenu, floating mid-screen |
| `workspaceBar` | — | Blackbox workspace toolbar, floating above the bottom edge |
| `basicScreen` | — | C64 border frame + BASIC boot banner + `READY.` prompt and cursor; the only primitive that reads `accent` |

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
   nothing. The `"draws the expected chrome per style"` assertion described under
   [Add a new style](#add-a-new-style-from-existing-primitives) will catch it, but
   nothing in the type system will; check the preview in the browser too. (A missing
   `CHROME_SPECS` entry, by
   contrast, does fail `astro check` — see [Add a new style](#add-a-new-style-from-existing-primitives) above.)
4. The authoring conventions: chrome sits on an unknown wallpaper, so derive translucent
   surfaces from `chromeSurfaces(onColor)` rather than picking opaque colors (the one
   exception is `accent`, below), size in
   `cu()` units so the chrome scales with the preview box, use `<div>` and `<svg>` only,
   and put `data-testid="chrome-<name>"` on the primitive's root. Watch the height
   budget: `cu` derives from the container's *width*, so the inline preview is at its
   shortest — only about **43cu** — when the page is at its **widest**. Tall chrome that
   looks fine in a narrow window can collide at 1400px.

#### The `accent` exception

Some platforms drew a piece of chrome in a **second palette color** rather than in a
shade of the background — the C64's screen border and BASIC text are light blue on blue,
and no translucent tint reproduces that pair. For those, `OsDetail` passes the first of
the entry's *other* colors to the preview as `accent`, and a primitive that receives one
draws it **exactly**, at opacity 1. `DesktopPreview` drops an accent that contrasts with
the wallpaper by less than 1.6:1, so chrome can never disappear into the background.

Today only `basicScreen` reads it, and it should stay rare: use `accent` when a fixed
second color is the *point* of the chrome, never as a shortcut around `chromeSurfaces`.

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
must be lowercase #rrggbb
file: /…/src/content/os/zzz-temp-broken.json?astroDataCollectionEntry=true:0:0
```

The entry name after `os →` is your file. The line under it is the schema's message. The
reported location is always `:0:0` — Astro cannot map a JSON error back to a line — so
the message itself is all you get.

**Whether that message names the offending field depends on the rule.** Five rules in
the schema carry a hand-written message, and those print bare, with no field path:

| message | what it means |
|---------|---------------|
| `must be lowercase #rrggbb` | some `hex` is malformed or uppercase |
| `must be YYYY-MM-DD` | `added` is the wrong shape |
| `at most one color may be marked default` | two or more colors have `"default": true` |
| `source note cites [X] but "links" has no such entry` | a `[X]` in `source.text` has no matching key in `source.links` |
| `source note "links" entry "X" is never cited as [X] in "text"` | `source.links` has a key that `source.text` never uses |

Every other rule prints `path: message`, and the path includes the array index — so you
do **not** have to hunt:

```
family: Required
colors.2.name: String must contain at least 1 character(s)
project.url: Invalid url
desktopStyle: Invalid enum value. Expected 'modern' | 'win9x' | … , received 'nextstep'
```

`colors.2` is the third entry in your `colors` array, zero-indexed. Only the five bare
messages above leave you checking entries by hand — and for `must be lowercase #rrggbb`
that means re-reading each `hex` for a missing `#`, a wrong length, an uppercase letter,
or a stray character.

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
match surface is wider than the name: `PlatformControls.tsx:52-55` also matches `family`,
`defaultHex`, and every alt color's `name` and `hex` — so a platform with `"family":
"Amiga"` breaks that count assertion even if its own `name` never mentions Amiga. If your
platform shares a name, family, default hex, or any non-default color's name or hex with
something already in the catalog, run
`npm run test:e2e` before opening the PR.

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
list is representative, not exhaustive. Scopes are per-area and open-ended — history
carries about 25 of them, `design`, `explorer`, `islands`, `lib`, `os`, and `colors`
among the most common — so name the area you touched rather than hunting for an approved
value. `docs` is a type, never a scope — a documentation change is `docs: …`, not
`docs(docs): …`.

The description must contain the source citation for every color, per
[Sourcing](#sourcing). For a new or changed chrome style, add a screenshot of the
preview on both a light and a dark color.

Then run through this — the pull request template mirrors it:

- [ ] The file is `src/content/os/<slug>.json`, `hex` values are lowercase `#rrggbb`, and at most one color is `default`.
- [ ] `family` and `type` reuse existing values unless genuinely new.
- [ ] Any dithered desktop has its blended entry(ies) plus partials, with **recomputed** averages and the collapse rule applied.
- [ ] `npm run build` passes.
- [ ] The PR description names the source of every color.

## License

This project is licensed under the **GNU Affero General Public License v3.0 or later**
([`LICENSE`](LICENSE)). By opening a pull request you agree that your contribution is
licensed under the same terms. There is no CLA and no copyright assignment — you keep
your copyright.

Two consequences worth knowing before you contribute:

- The AGPL's network clause (section 13) means anyone who runs a modified version of this
  site as a network service has to offer their users the modified source. That is
  deliberate; it is the reason for AGPL rather than GPL.
- Color values themselves are facts and are not copyrightable. What the license covers is
  the code, the prose, and the compilation — the selection, arrangement, and annotation of
  the archive. Do not paste text copied from another site: cite the source and write it
  yourself.
