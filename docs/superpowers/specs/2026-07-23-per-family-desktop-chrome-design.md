# Per-family desktop chrome (4a) — design

**Date:** 2026-07-23
**Status:** Approved (pending spec review)
**Source design:** Claude Design project "Desktop Colors project update" → `Chrome Explorations.dc.html`, section **4a** ("Default direction — translucent, tinted to the wallpaper").

## Summary

Each OS preview currently overlays chrome chosen by its `desktopStyle`, but almost
every shipped OS uses the uniform `modern` scene. This work carries over the **4a**
exploration: each OS *family* keeps its own recognizable shell signature — Win9x
taskbar, Program Manager, Mac Platinum menu bar, BeOS deskbar, Amiga bar, KDE panel,
CDE front panel, GEM, minimal — rendered in the archive's existing **translucent,
wallpaper-adaptive** language (soft panels tinted from `onColor`, thin line-art icons,
no chrome colours of its own).

Two things change:

1. **Rendering model** becomes data-driven: a Zod-validated **chrome spec** per style
   plus a generic renderer, replacing the hand-written `ChromePart[]` arrays.
2. **Coverage**: new styles `win31`, `platinum`, `beos`, `gem` are added. After the
   remap, 25 of the 26 OS content files resolve to a family style and only `xfce`
   remains on `modern`; of those, 18 files have their `desktopStyle` *value* changed
   (the other 8 already held the correct value). `modern` is retained, unchanged, as the
   default and safety fallback.

The selected-color wallpaper — the core product feature — is **unchanged**. Only the
chrome overlay changes. The `onColor` contrast helper in `lib/color.ts` is **not**
touched.

## Non-goals

- No change to how the wallpaper colour is chosen or rendered.
- No change to the downloadable wallpaper PNG (it never reads `desktopStyle`).
- Directions 1a (opaque detailed), 2a (abstract), 3a (single-glyph) are **not** carried
  over. Only 4a.
- `modern`'s appearance is not redesigned; it remains pixel-identical.

## Architecture

```
src/lib/chromeSpec.ts
  ├─ Zod schema (ChromePart discriminated union, WindowBody, IconKind)
  ├─ type ChromeSpec = z.infer<typeof ChromeSpec>
  └─ CHROME_SPECS: Record<DesktopStyle, ChromeSpec | null>   (data; null = modern)

src/content/os/<slug>.json ──"desktopStyle"──▶ z.enum(DESKTOP_STYLES)   (unchanged)
        ▼
src/islands/DesktopPreview.tsx
  wallpaper = selected `hex`
  CHROME_SPECS[style]:
     null  → <ModernScene onColor/>          (legacy bespoke, untouched)
     spec  → spec.map(part => renderPart(part, ctx))
                 renderPart: switch(part.part) → shared primitive component
```

- **`src/lib/desktopStyle.ts`** stays the single source of truth for the style list.
- **`src/lib/chromeSpec.ts`** (new) holds the schema, the `ChromeSpec` type, and the
  `CHROME_SPECS` data. It imports `z` from the standalone **`zod`** package (added as an
  explicit dependency), **not** from `astro:content`, so unit tests can import it
  without booting the Astro content runtime — the same constraint `desktopStyle.ts`
  already observes.
- **`src/islands/DesktopPreview.tsx`** holds the shared primitive components and the
  `renderPart` switch. `modern`'s existing `DeskIcons`/`WindowStack`/`Dock` components
  are kept as-is, grouped behind a `ModernScene` wrapper rendered when the spec is
  `null`.

### Why `Record<DesktopStyle, ChromeSpec | null>`

Today's `STYLE_CHROME` is typed `Record<DesktopStyle, ChromePart[]>`; the exhaustive
`Record` means adding a style to `DESKTOP_STYLES` fails to compile until it has chrome —
a style can never silently render blank. We preserve that guarantee: `CHROME_SPECS` is
also an exhaustive `Record`, and `modern` uses the sentinel `null` to opt into the
bespoke `ModernScene` renderer. The compiler still forces an entry for every style.

## Zod schema and primitive vocabulary

```ts
// src/lib/chromeSpec.ts
import { z } from "zod";
import { DESKTOP_STYLES, type DesktopStyle } from "./desktopStyle";

const IconKind = z.enum(["computer", "folder", "trash", "drive", "disk"]);
export type IconKind = z.infer<typeof IconKind>;

const WindowBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gridIcons"), icons: z.array(IconKind).nonempty(), cols: z.number().int().positive() }),
  z.object({ kind: z.literal("rows"), widths: z.array(z.number().positive()).nonempty() }),
  z.object({ kind: z.literal("panes"), count: z.literal(2) }),
]);

const Anchor = z.enum(["top", "bottom"]);       // deskIcons vertical anchor (default "top")

const ChromePart = z.discriminatedUnion("part", [
  z.object({ part: z.literal("deskIcons"), side: z.enum(["left", "right"]), anchor: Anchor.optional(),
             icons: z.array(z.object({ kind: IconKind, label: z.string().min(1) })).nonempty() }),
  z.object({ part: z.literal("window"),     left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("beosWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("taskbar") }),
  z.object({ part: z.literal("menuBar") }),
  z.object({ part: z.literal("topBar") }),
  z.object({ part: z.literal("dock") }),
  z.object({ part: z.literal("frontPanel") }),
  z.object({ part: z.literal("beosTab") }),
]);

export const ChromeSpec = z.array(ChromePart);
export type ChromeSpec = z.infer<typeof ChromeSpec>;
```

`window`/`beosWindow` positions (`left`/`top`/`w`) are in `u` scale units (see below).
The Zod layer adds checks TypeScript can't express: positive/integer window widths and
column counts, non-empty icon and row arrays, enum membership for icon kinds.

## Shared primitives (ported from 4a `s*` methods)

Each is a Preact functional component with `data-testid="chrome-<part>"` on its root:

| Primitive | Ported from | Notes |
|-----------|-------------|-------|
| `Icon` / `DeskIcons` | `sSvg`/`sIcon`/`sIcons` | line-art SVG (`sPaths`: computer, folder, trash, drive, disk); labels use `onColor`; `anchor` handles win9x Recycle Bin (bottom-right) |
| `SharedWindow` | `sWin` | translucent window: soft title bar + 3 dots + body (`gridIcons`/`rows`/`panes`) |
| `Pane` | `sPane` | Program Manager group box (used by `win31` window body `panes`) |
| `Taskbar` | `sTaskbar` | Win9x bottom taskbar (start grid, divider, tasks, tray) |
| `MenuBar` | `sMenuBar` | Mac Platinum / GEM top menu bar |
| `TopBar` | `sTopBar` | Amiga Workbench top bar with gadgets |
| `BeosTab` | `sTab` | BeOS deskbar tab, top-right |
| `BeosWindow` | `sWinTab` | BeOS tabbed window |
| `Dock` | `sDock` | KDE / generic bottom dock |
| `FrontPanel` | `sFrontPanel` | CDE front panel with workspace switcher |

**Surfaces.** Extend the existing `surfaces(onColor)` helper (currently `ink`, `panel`,
`win`, `border`) with the 4a `soft` tint. Light/dark is derived from `onColor` exactly
as today (`light = onColor === "#1c1917"`). `modern`'s components ignore `soft`, so the
extension is non-breaking.

**Scale unit.** Family specs render with the 4a unit `u(n) = calc(min(1cqw, 9px) * n)`.
`modern` keeps its own `min(1cqw, 11px)`. Both rely on the preview root's existing
`container-type: inline-size`.

**`onColor`.** Unchanged. `DesktopPreview` still receives `onColor` (`#1c1917` or
`#ffffff`) from `lib/color.ts`. We do not adopt the design file's local `#f5f5f4`
variant.

## The `sChrome` compositions, as specs

Ported verbatim from 4a's `sChrome()` switch:

- **win9x** — `deskIcons(left,[computer "My Computer", folder "Documents"])`, `window(28,8,54, gridIcons[drive,folder,folder,computer,folder,disk]×3)`, `deskIcons(right,anchor:bottom,[trash "Recycle Bin"])`, `taskbar`
- **win31** — `window(16,8,68, panes×2)`
- **platinum** — `menuBar`, `deskIcons(right,[drive "Macintosh HD", trash "Trash"])`, `window(20,12,52, gridIcons[drive,folder,folder,disk,folder,trash]×3)`
- **beos** — `beosTab`, `deskIcons(left,[drive "BeOS", trash "Trash"])`, `beosWindow(26,11,46, gridIcons[…]×4)`
- **amiga** — `topBar`, `deskIcons(right,[disk "Workbench", drive "Work", trash "Trash"])`, `window(10,12,46, gridIcons[disk,drive,folder]×3)`
- **kde** — `window(22,9,52, rows[72,88,60,80])`, `dock`
- **cde** — `deskIcons(left,[folder "Home"])`, `window(22,8,46, gridIcons[…]×3)`, `frontPanel`
- **gem** — `menuBar`, `deskIcons(right,[disk "Floppy Disk", drive "Hard Disk", trash "Trash"])`, `window(12,11,46, gridIcons[…]×3)`
- **generic** — `deskIcons(left,[computer "Computer", folder "Files"])`, `dock`
- **modern** — `null` (legacy `ModernScene`)

## Style list and content remapping

`src/lib/desktopStyle.ts`:

```ts
export const DESKTOP_STYLES = ["modern","win9x","win31","platinum","beos","amiga","kde","cde","gem","generic"] as const;
```

Adds `win31`, `platinum`, `beos`, `gem`; **renames `macos8` → `platinum`** (dormant — no
OS uses `macos8`). `src/content/config.ts` derives its Zod enum from this list, so the
new values are accepted and old ones rejected automatically.

`src/content/os/*.json` `desktopStyle` remapping (25 of 26 resolve to a family; `xfce`
stays `modern`; entries marked "already" keep their current value — 18 files change):

| OS file | → style |
|---|---|
| windows-95, windows-98, windows-me, windows-nt-4-0, windows-2000, windows-xp | `win9x` |
| reactos, serenityos | `win9x` (already) |
| windows-1-0, windows-2-0, windows-3-0, windows-3-1, windows-nt-3-x | `win31` |
| mac-os-8 | `platinum` |
| beos, haiku | `beos` |
| amiga-workbench, amiga-workbench-2-0 | `amiga` (already) |
| kde-1, kde-2, kde-plasma-6 | `kde` |
| cde, solaris-9 | `cde` |
| freegem | `gem` |
| bleskos | `generic` |
| xfce | `modern` (unchanged) |

## Testing

- **`src/lib/chromeSpec.test.ts`** (new): iterate `DESKTOP_STYLES`; for each non-`null`
  entry, assert `ChromeSpec.parse(CHROME_SPECS[style])` succeeds. Proves every family
  spec is well-formed (catches unknown icon kinds, missing widths, empty arrays).
- **`src/islands/DesktopPreview.test.tsx`**: keep the "every style renders chrome"
  sweep over `DESKTOP_STYLES`. Update the per-style `chromeFor(...)` assertions to the
  new primitive `data-testid`s (e.g. `win9x` → `["chrome-deskicons","chrome-window","chrome-deskicons","chrome-taskbar"]`).
  Replace the `macos8` assertion with `platinum`.
- **`npx astro check`** — proves the exhaustive `Record<DesktopStyle, …>` and the
  remapped content enum type-check.
- **`npm run build`** — proves all ~700 pages still prerender with the new styles.
- Manual eyeball via `npm run dev` on a page per family, on both light and dark colors.

## Docs

The canonical "how to create new chrome" guide (written for both humans and LLM
agents) is the rewritten **`docs/adding-a-preview-style.md`**. It is referenced from
both CLAUDE.md and README so contributors and agents find it from the repo's entry
points.

- **`docs/adding-a-preview-style.md`** — full rewrite for the data-driven model. Cover:
  the data flow (`desktopStyle` → `DESKTOP_STYLES` enum → `CHROME_SPECS` → renderer);
  the Zod schema and the primitive vocabulary (`window`/`beosWindow` + `WindowBody`,
  `deskIcons`, the parameterless shells, `IconKind`); **Task A** — point an OS at an
  existing style (one-line JSON edit); **Task B** — add a new style (add to
  `DESKTOP_STYLES`, add a validated `CHROME_SPECS` entry, and only if a genuinely new
  shell is needed, add a primitive component + `renderPart` case); the `data-testid`
  and test conventions; the `macos8`→`platinum` rename; the refreshed styles table; and
  the verify steps (`astro check`, `vitest`, `build`, `dev` eyeball). Keep the
  step-by-step checklist so an agent can follow it end-to-end.
- **`README.md`** — refresh the existing **"Adding a preview style"** section and the
  inline style list under "Adding a new OS" (currently `win9x | macos8 | kde | cde |
  amiga | generic`) to the new set (`win9x | win31 | platinum | beos | amiga | kde |
  cde | gem | generic`, default `modern`); keep the link to
  `docs/adding-a-preview-style.md`.
- **`CLAUDE.md`** — keep the guide in the "Start here" list and refresh its one-line
  description to name the data-driven chrome-spec model and flag it as the guide to
  follow when adding chrome.
- **`docs/architecture-frontend.md`** — update the `desktopStyle` union (line ~66) to
  the new style list.

## Risks / trade-offs

- **Two render paths** (`modern` bespoke vs spec-driven) is a mild inconsistency,
  accepted to keep `modern` pixel-identical and the change additive. A later unification
  (expressing `modern` as a spec) is possible but out of scope.
- **`zod` as an explicit dependency**: currently transitive via Astro; we pin it
  directly so `chromeSpec.ts` doesn't rely on a transitive version.
- **Content remap breadth**: 25 files change `desktopStyle`. Low risk — each is a
  one-line value change validated by the enum, and the build fails loudly on a typo.
