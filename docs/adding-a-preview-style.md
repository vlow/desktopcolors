# Adding a desktop preview style

A **preview** is the schematic desktop mockup on each `/os/<slug>` page and in the
fullscreen viewer: a full-bleed box filled with the selected color (the "wallpaper")
plus a few translucent overlays — the **chrome** (desktop icons, a taskbar, a menu bar,
a dock, a front panel, a window). It shows how a color looks as a desktop background for
a given platform. It uses only `<div>`s and `<svg>`s — no images — so it works for any
color.

The chrome a preview draws is chosen by the OS's **`desktopStyle`**, and is defined as
**validated data**: a `CHROME_SPEC` — an ordered list of chrome primitives — per style.

> The desktop style affects **only the on-screen preview**. The downloadable wallpaper
> is a plain solid-color PNG and never reads the style.

> **Partly mirrored in [`CONTRIBUTING.md`](../CONTRIBUTING.md).** That guide carries a
> contributor-facing copy of the style table, the primitive vocabulary, and the
> "add a new style" steps; it links here for adding a new *primitive*. **If you change
> any of those, update `CONTRIBUTING.md` in the same change.**

## How it fits together (data flow)

```
src/content/os/<slug>.json ──"desktopStyle"──▶ z.enum(DESKTOP_STYLES)  (src/content/config.ts)
        ▼
src/lib/catalog.ts ──▶ view props ──▶ <DesktopPreview hex onColor style />
                                              │
                     CHROME_SPECS[style]  (src/lib/chromeSpec.ts, Zod-validated)
                        │  null  → the bespoke `modern` scene
                        │  spec  → renderPart() → shared primitive components
                        ▼
                 fill background with `hex`; render each part over it
```

- **`src/lib/desktopStyle.ts`** — the single source of truth: `DESKTOP_STYLES` (the
  list) and the `DesktopStyle` type.
- **`src/lib/chromeSpec.ts`** — the Zod schema (`ChromeSpec`, `ChromePart`), the derived
  types, and `CHROME_SPECS: Record<DesktopStyle, ChromeSpec | null>` (the data). Imports
  `z` from the standalone `zod` package (not `astro:content`) so tests can load it.
- **`src/content/config.ts`** — builds the content-schema enum with
  `z.enum(DESKTOP_STYLES)`, so an invalid `desktopStyle` fails the build.
- **`src/islands/DesktopPreview.tsx`** — the primitive components, the `renderPart`
  switch, and the bespoke `modern` scene (`ModernScene`).
- **`onColor`** (`src/lib/color.ts`) — a contrast helper returning `#1c1917` (dark) or
  `#ffffff` (white); used for text on the wallpaper and to derive the translucent
  surface tints. Computed upstream and passed into the preview.
- **`accent`** — the **exception** to translucent-only chrome, and deliberately narrow.
  Some platforms drew a piece of chrome in a *second palette color* rather than in a
  shade of the background: the C64's screen border and BASIC text are light blue on
  blue, and a translucent tint cannot reproduce that pair. `OsDetail` passes the first
  of the entry's *other* colors as `accent`; `DesktopPreview` drops it if it contrasts
  with the wallpaper by less than `ACCENT_MIN` (1.6:1, low on purpose — the C64's own
  pair is only 2.6:1), and a primitive that gets one draws it **exactly**, at opacity 1.
  Today only `basicScreen` reads it; every other primitive ignores it and stays
  translucent. Reach for it only when a fixed second color is the *point* of the chrome,
  never as a shortcut around `chromeSurfaces`.

## The primitive vocabulary

`CHROME_SPEC` is an array of these parts (a Zod discriminated union on `part`):

| `part` | params | draws |
|--------|--------|-------|
| `deskIcons` | `side: "left"\|"right"`, `anchor?: "top"\|"bottom"`, `icons: {kind,label}[]` | a column of line-art desktop icons with labels |
| `window` | `left`, `top`, `w` (scale units), `body` | a translucent window (title bar + dots + body) |
| `beosWindow` | `left`, `top`, `w`, `body` | a BeOS-style tabbed window |
| `platinumWindow` | `left`, `top`, `w`, `body` | a Mac OS 8 Platinum window (close box + pinstripe title + centered title + zoom/collapse boxes) |
| `cdeWindow` | `left`, `top`, `w`, `body` | a CDE/Motif window (one window-menu square left + centered title + minimize/maximize squares right) |
| `gemWindow` | `left`, `top`, `w`, `body` | a GEM window (one gadget square left + centered title + one sizer square right) |
| `taskbar` | — | Win9x bottom taskbar |
| `menuBar` | — | Mac Platinum / GEM top menu bar |
| `topBar` | — | Amiga Workbench top bar |
| `dock` | — | KDE / generic bottom dock |
| `frontPanel` | — | CDE front panel |
| `beosTab` | — | BeOS deskbar tab (top-right) |
| `bleskos` | — | BleskOS full-screen, windowless program switcher (fills the preview) |
| `rootMenu` | — | Blackbox titled root menu + cascading submenu, floating mid-screen |
| `workspaceBar` | — | Blackbox workspace toolbar, floating above the bottom edge |
| `basicScreen` | — | C64 border frame + BASIC boot banner + `READY.` prompt and cursor (fills the preview); the only primitive that reads `accent` |

`body` (`WindowBody`) is one of:
- `{ kind: "gridIcons", icons: IconKind[], cols }` — a grid of line-art icons
- `{ kind: "rows", widths: number[] }` — placeholder text rows (widths in %)
- `{ kind: "panes", count: 2 }` — two Program-Manager group boxes

`IconKind` = `computer | folder | trash | drive | disk`.

## Existing styles

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
| `bleskos` | full-screen program switcher (no window/taskbar/dock) | BleskOS |
| `blackbox` | floating root menu + cascading submenu + workspace bar (no icons, no docked panel) | Blackbox (menu-only WMs) |
| `c64` | screen border frame + BASIC boot banner + `READY.` prompt (no shell at all) | Commodore 64 (BASIC-prompt home computers) |
| `generic` | icons + dock | minimal / unknown shells |

`modern` is the schema default (`desktopStyle` is optional) and the safety fallback: it
is represented as `null` in `CHROME_SPECS` and rendered by the bespoke `ModernScene`.
(The old `macos8` style was renamed to `platinum`.)

## Task A — point a platform at an existing style

In the platform's `src/content/os/<slug>.json`, set the field:

```json
"desktopStyle": "kde"
```

That's the whole change. `npm run build` rejects an unknown value via the Zod enum.

## Task B — add a NEW style

Say you want a `nextstep` style.

### 1. Register the style name

Add it to `DESKTOP_STYLES` in **`src/lib/desktopStyle.ts`** — the only place the set is
declared:

```ts
export const DESKTOP_STYLES = ["modern","win9x","win31","platinum","beos","amiga","kde","cde","gem","bleskos","blackbox","c64","generic","nextstep"] as const;
```

### 2. Add its chrome spec

In **`src/lib/chromeSpec.ts`**, add an entry to `CHROME_SPECS` composed from existing
primitives:

```ts
  nextstep: [
    { part: "deskIcons", side: "right", icons: [{ kind: "drive", label: "Disk" }] },
    { part: "dock" },
  ],
```

You **cannot forget** this: `CHROME_SPECS` is typed `Record<DesktopStyle, ChromeSpec |
null>`, so `npx astro check` fails until every style — including your new one — has an
entry. Use `null` only for a bespoke-rendered style (today just `modern`).

### 3. (Only if you need a new look) add a primitive

If your style needs chrome that no primitive draws yet:

1. Add a `part` variant to the `ChromePart` discriminated union in `chromeSpec.ts`.
2. Add a matching component in `DesktopPreview.tsx` (translucent, `data-testid="chrome-<name>"`, sized in `cu()` units) and a `case` in `renderPart`.

**A missing `case` here is silent, not compiler-enforced.** `renderPart`
(`DesktopPreview.tsx:376`) returns `ComponentChildren`, which admits `undefined`, and
this project extends `astro/tsconfigs/strict` rather than `strictest` — so a new
`ChromePart` variant without a matching `case` type-checks clean and simply renders
nothing. `astro check` will **not** catch it. Check the preview in the browser. (A
missing `CHROME_SPECS` entry, by contrast, **is** compiler-enforced — see step 2 above.)

### 4. Use it

Set `"desktopStyle": "nextstep"` in the relevant `src/content/os/*.json` file(s).

## Chrome authoring conventions

Chrome sits on an unknown wallpaper color — it must stay legible on **any** background:

- **Translucent overlays only.** Derive surfaces from `chromeSurfaces(onColor)`
  (`panel`/`win`/`border`/`soft`), never opaque colors that could clash. The single
  exception is `accent` (see [the data flow](#how-it-fits-together-data-flow)) — a second
  color from the same OS entry, for chrome the platform genuinely drew in one.
- **Text on the wallpaper** (icon labels) uses `onColor`. **Text/marks on a chrome
  surface** use the translucent `soft`/`border` tints.
- **Absolute-positioned, pinned to an edge**; size in `cu(n)` = `calc(min(1cqw,9px)*n)`
  so chrome scales with the preview box but caps on large screens. The preview root sets
  `container-type: inline-size`.
- **Mind the height budget.** `cu` is derived from the container's *width*, so tall chrome
  can outgrow the box. The inline preview on `/os/<slug>` is at its shortest in `cu` terms
  when the page is **widest**: at the 1400px `--page-max` cap the box is ~798×342px, `cu`
  hits its 9px ceiling at 7.98px, and only **~43cu of height** are available. (Narrower
  viewports give *more* — 51cu at 1280px, 86cu at 820px — and the fullscreen viewer gives
  ~110cu.) Anything vertically ambitious must fit that 43cu worst case together with
  whatever else the style draws; the `blackbox` root menu is capped at eight items for
  exactly this reason. Check it at a wide viewport, not just your usual window.
- **Fonts:** `var(--font-ui)` / `var(--font-mono)`; keep marks schematic.
- **`<div>`/`<svg>` only** — no images.
- **`data-testid="chrome-<name>"`** on every primitive root.

## Add a test line

`src/islands/DesktopPreview.test.tsx` has two relevant tests, and they check different
things. `"every style renders chrome"` iterates `DESKTOP_STYLES`, so a new style *is*
covered there automatically — but it only asserts that *some* chrome renders
(`spec.length > 0`), not which chrome. `"draws the expected chrome per style"` is the
test that pins the exact chrome, and it is a **hand-written list**, one line per style —
adding a style to `DESKTOP_STYLES` does not add a line here for you. Add it yourself:

```ts
expect(chromeFor("nextstep")).toEqual(["chrome-deskicons", "chrome-dock"]);
```

And `src/lib/chromeSpec.test.ts` parses every style's spec with `ChromeSpec.parse`,
covering your new spec automatically.

## Verify

```bash
npx astro check     # exhaustive CHROME_SPECS Record type-check only — NOT renderPart, see step 3
npx vitest run      # unit tests incl. chromeSpec + DesktopPreview
npm run build       # every page still pre-renders
npm run dev         # eyeball it (below)
```

To see it: `npm run dev`, open `http://localhost:4321/os/<slug>` for an OS using the
style, click **⤢ Expand**, and check the chrome reads well on both light and dark colors.

## Checklist

1. [ ] Added the style to `DESKTOP_STYLES` in `src/lib/desktopStyle.ts`.
2. [ ] Added its `CHROME_SPECS` entry in `src/lib/chromeSpec.ts` (or `null` for bespoke).
3. [ ] If a new primitive was needed: added the `ChromePart` variant, the component, and the `renderPart` case.
4. [ ] New primitives follow the conventions and have `data-testid="chrome-<name>"`.
5. [ ] Added a `chromeFor(...)` assertion in `DesktopPreview.test.tsx`.
6. [ ] Set `"desktopStyle"` in the relevant `src/content/os/*.json`.
7. [ ] `npx astro check` and `npx vitest run` pass; eyeballed via `npm run dev`.
