# Adding a desktop preview style

A **preview** is the schematic desktop mockup shown on each `/os/<slug>` page and in
the fullscreen viewer: a full-bleed box filled with the selected color (the
"wallpaper"), plus a few lightweight translucent overlays — the **chrome** (desktop
icons, a taskbar, a menu bar, a panel, a title bar). Its job is to show how a color
looks as a desktop background for a given platform. It uses only `<div>`s — no
images — so it works for any color.

The chrome a preview draws is chosen by the OS's **`desktopStyle`**. This guide
explains the two things you might want to do:

- **Task A** — point a platform at an *existing* style (a one-line JSON change).
- **Task B** — add a *new* style (a small, type-checked code change).

> The desktop style affects **only the on-screen preview**. The downloadable
> wallpaper is a plain solid-color PNG and never reads the style.

## How it fits together (data flow)

```
src/content/os/<slug>.json  ──"desktopStyle"──▶  Zod schema (src/content/config.ts)
        │                                              enum built from DESKTOP_STYLES
        ▼
  src/lib/catalog.ts  ──▶  view props  ──▶  <DesktopPreview hex onColor style />
                                                     │
                                     STYLE_CHROME[style] → [chrome parts]
                                                     │
                                   fill background with `hex`; render each part
```

- **`src/lib/desktopStyle.ts`** — the single source of truth: `DESKTOP_STYLES` (the
  list) and the `DesktopStyle` type derived from it.
- **`src/content/config.ts`** — builds the content-schema enum with
  `z.enum(DESKTOP_STYLES)`, so an invalid `desktopStyle` in a JSON file fails the build.
- **`src/islands/DesktopPreview.tsx`** — the chrome primitives and the
  `STYLE_CHROME` registry (`Record<DesktopStyle, ChromePart[]>`) that maps each style
  to the parts it draws.
- **`onColor`** (`src/lib/color.ts`) — a contrast helper returning `#1c1917` (dark)
  or `#ffffff` (white); used for any text placed directly on the wallpaper so it stays
  legible. It is computed upstream and passed into the preview.

## Existing styles

| `desktopStyle` | chrome it draws | modeled on |
|----------------|-----------------|------------|
| `modern`  | corner icons + two windows + segmented dock with a clock | platform-neutral default |
| `win9x`   | desktop icons + Start taskbar | Windows 9x/2000/XP/NT |
| `macos8`  | top menu bar (File/Edit/View) | Mac OS 8 |
| `kde`     | bottom panel with launchers   | KDE |
| `cde`     | bottom panel with launchers (same as `kde`) | CDE |
| `amiga`   | top Workbench title bar       | Amiga Workbench |
| `generic` | desktop icons only            | minimal fallback |

`modern` is the **default**: `desktopStyle` is optional in the schema and defaults to
`modern`, and every shipped platform uses it. It's the polished, platform-neutral
scene ported from the source design; its parts (`DeskIcons`, `WindowStack`, `Dock`)
size in `cqw` so they scale with the preview box, and derive their surface tints from
`onColor`. `generic` remains the minimal icons-only style and the runtime fallback if
a style somehow has no chrome.

## Task A — use an existing style

In the platform's `src/content/os/<slug>.json`, set the field:

```json
"desktopStyle": "kde"
```

That's the whole change. Run `npm run build` — the Zod schema rejects an unknown
value. Done.

## Task B — add a NEW style

Say you want a `nextstep` style with a right-hand dock.

### 1. Register the style name

Add it to the list in **`src/lib/desktopStyle.ts`** — this is the only place the set
of styles is declared:

```ts
export const DESKTOP_STYLES = ["win9x", "macos8", "kde", "cde", "amiga", "generic", "nextstep"] as const;
```

### 2. Assign its chrome in the registry

In **`src/islands/DesktopPreview.tsx`**, add one line to `STYLE_CHROME`:

```ts
export const STYLE_CHROME: Record<DesktopStyle, ChromePart[]> = {
  win9x: [Icons, Taskbar],
  generic: [Icons],
  macos8: [MenuBar],
  kde: [Panel],
  cde: [Panel],
  amiga: [TitleBar],
  nextstep: [Icons, Dock], // ← new
};
```

You **cannot forget** this step: `STYLE_CHROME` is typed `Record<DesktopStyle, …>`,
so `npx astro check` fails to compile until every style — including your new one —
has an entry. Reuse existing parts (like `Icons`) freely.

### 3. (Only if you need a new look) write a chrome primitive

If your style needs chrome that doesn't exist yet, add a primitive next to the others
in `DesktopPreview.tsx`, following the template below, then reference it in the
registry (step 2).

```tsx
// NeXTSTEP-style dock pinned to the right edge.
const Dock: ChromePart = () => (
  <div data-testid="chrome-dock" style="position: absolute; top: 0; bottom: 0; right: 0; width: 46px; background: rgba(0,0,0,0.22); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 0;">
    <span style="width: 30px; height: 30px; border-radius: 6px; background: rgba(255,255,255,0.8);" />
    <span style="width: 30px; height: 30px; border-radius: 6px; background: rgba(255,255,255,0.55);" />
  </div>
);
```

### 4. Use it

Set `"desktopStyle": "nextstep"` in the relevant `src/content/os/*.json` file(s).

## Chrome authoring conventions

Chrome sits on top of an unknown wallpaper color, so follow these rules — the whole
point is that it stays legible on **any** background:

- **Translucent overlays only.** Use `rgba(255,255,255,x)` for light surfaces and
  `rgba(0,0,0,x)` for dark ones. Never use an opaque color that could clash with the
  wallpaper.
- **Absolute-positioned, pinned to an edge.** Bars use `position: absolute; left: 0;
  right: 0;` plus `top: 0` or `bottom: 0`. Size in `px` for fixed chrome, or in `cqw`
  (container-query width units) to scale with the preview box — the `DesktopPreview`
  root sets `container-type: inline-size`, so `1cqw` = 1% of the preview width (the
  `modern` style uses `cqw`).
- **Text on a chrome surface** is hardcoded dark ink `#1c1917` (it sits on a light
  overlay). **Text drawn directly on the wallpaper** (like icon labels) must use the
  `onColor` prop for contrast.
- **Use the design token** `var(--font-ui)` for fonts; keep sizes small (11–13px) and
  weights 400–500, matching the other parts.
- **Schematic, `<div>`s only** — no images or external assets.
- **Add a `data-testid`** of the form `chrome-<name>` on the primitive's root so it's
  testable.

## Add a test line

In **`src/islands/DesktopPreview.test.tsx`**, the "every style renders chrome" test
already covers your new style automatically (it iterates `DESKTOP_STYLES`). Add one
explicit assertion to the "draws the expected chrome per style" test:

```ts
expect(chromeFor("nextstep")).toEqual(["chrome-icons", "chrome-dock"]);
```

## Verify

```bash
npx astro check     # 0 errors — proves the registry covers every style (type-checked)
npx vitest run      # unit tests, incl. DesktopPreview.test.tsx
npm run build       # every page still pre-renders
npm run dev         # then eyeball it (see below)
```

To see it: `npm run dev`, open a page whose OS uses the style — e.g.
`http://localhost:4321/os/<slug>` — and click **⤢ Expand** for the fullscreen
preview. Check the chrome reads well on both light and dark colors (switch colors in
the list).

## Checklist (for a human or an LLM agent)

1. [ ] Added the style name to `DESKTOP_STYLES` in `src/lib/desktopStyle.ts`.
2. [ ] Added its entry to `STYLE_CHROME` in `src/islands/DesktopPreview.tsx`
       (reusing parts, or a new primitive from the template).
3. [ ] New primitives follow the chrome conventions and have a `data-testid="chrome-<name>"`.
4. [ ] Added an explicit `chromeFor(...)` assertion in `DesktopPreview.test.tsx`.
5. [ ] Set `"desktopStyle"` in the relevant `src/content/os/*.json`.
6. [ ] `npx astro check` and `npx vitest run` pass; eyeballed it via `npm run dev`.
