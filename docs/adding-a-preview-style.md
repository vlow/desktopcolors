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

## The primitive vocabulary

`CHROME_SPEC` is an array of these parts (a Zod discriminated union on `part`):

| `part` | params | draws |
|--------|--------|-------|
| `deskIcons` | `side: "left"\|"right"`, `anchor?: "top"\|"bottom"`, `icons: {kind,label}[]` | a column of line-art desktop icons with labels |
| `window` | `left`, `top`, `w` (scale units), `body` | a translucent window (title bar + dots + body) |
| `beosWindow` | `left`, `top`, `w`, `body` | a BeOS-style tabbed window |
| `taskbar` | — | Win9x bottom taskbar |
| `menuBar` | — | Mac Platinum / GEM top menu bar |
| `topBar` | — | Amiga Workbench top bar |
| `dock` | — | KDE / generic bottom dock |
| `frontPanel` | — | CDE front panel |
| `beosTab` | — | BeOS deskbar tab (top-right) |

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
| `platinum` | menu bar + icons + window | Mac OS 8 |
| `beos` | deskbar tab + icons + tabbed window | BeOS, Haiku |
| `amiga` | top bar + icons + window | Amiga Workbench |
| `kde` | window + bottom dock | KDE 1/2, Plasma 6 |
| `cde` | icon + window + front panel | CDE, Solaris |
| `gem` | menu bar + icons + window | Digital Research GEM (FreeGEM) |
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
export const DESKTOP_STYLES = ["modern","win9x","win31","platinum","beos","amiga","kde","cde","gem","generic","nextstep"] as const;
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

The `renderPart` switch is exhaustive over the union, so `astro check` fails until the
new `part` has a `case`.

### 4. Use it

Set `"desktopStyle": "nextstep"` in the relevant `src/content/os/*.json` file(s).

## Chrome authoring conventions

Chrome sits on an unknown wallpaper color — it must stay legible on **any** background:

- **Translucent overlays only.** Derive surfaces from `chromeSurfaces(onColor)`
  (`panel`/`win`/`border`/`soft`), never opaque colors that could clash.
- **Text on the wallpaper** (icon labels) uses `onColor`. **Text/marks on a chrome
  surface** use the translucent `soft`/`border` tints.
- **Absolute-positioned, pinned to an edge**; size in `cu(n)` = `calc(min(1cqw,9px)*n)`
  so chrome scales with the preview box but caps on large screens. The preview root sets
  `container-type: inline-size`.
- **Fonts:** `var(--font-ui)` / `var(--font-mono)`; keep marks schematic.
- **`<div>`/`<svg>` only** — no images.
- **`data-testid="chrome-<name>"`** on every primitive root.

## Add a test line

`src/islands/DesktopPreview.test.tsx` iterates `DESKTOP_STYLES` (so a new style is
covered automatically) and asserts exact chrome per style. Add one assertion:

```ts
expect(chromeFor("nextstep")).toEqual(["chrome-deskicons", "chrome-dock"]);
```

And `src/lib/chromeSpec.test.ts` parses every style's spec with `ChromeSpec.parse`,
covering your new spec automatically.

## Verify

```bash
npx astro check     # exhaustive Record + renderPart switch type-check
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
