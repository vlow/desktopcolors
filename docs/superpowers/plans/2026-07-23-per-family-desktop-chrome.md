# Per-family Desktop Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each OS family its own recognizable desktop-preview chrome (Win9x taskbar, Program Manager, Mac Platinum, BeOS, Amiga, KDE, CDE, GEM, minimal) in the archive's translucent, wallpaper-adaptive style — driven by a Zod-validated data spec.

**Architecture:** Replace the hand-written `STYLE_CHROME: Record<DesktopStyle, ChromePart[]>` with a validated `CHROME_SPECS` data table plus a generic `renderPart` switch over shared primitive components. `modern` is retained pixel-identical via a `null` sentinel that routes to the legacy bespoke scene. The selected-color wallpaper and the `onColor` contrast helper are unchanged.

**Tech Stack:** Astro 4 static build, Preact islands, TypeScript (strict), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-per-family-desktop-chrome-design.md`

## Global Constraints

- **Preview wallpaper is always the selected `hex`.** Chrome is a translucent overlay; never fill the wallpaper with a family colour. (spec: Non-goals)
- **Chrome adapts via `onColor`.** Surfaces derive light/dark from `onColor` (`"#1c1917"` ⇒ light wallpaper). Do not modify `src/lib/color.ts`. (spec: §3)
- **`modern` stays pixel-identical.** Its components' output and `data-testid`s (`chrome-desk-icons`, `chrome-windows`, `chrome-dock`) must not change. (spec: §Architecture, Risks)
- **Exhaustiveness guarantee preserved.** The style→chrome map is an exhaustive `Record<DesktopStyle, …>`; a new style must fail `astro check` until given chrome. (spec: §Architecture)
- **`chromeSpec.ts` imports `z` from the standalone `zod` package, never from `astro:content`** — so unit tests load it without the Astro content runtime (same rule `desktopStyle.ts` follows). (spec: §Architecture)
- **Font tokens:** use `var(--font-ui)` / `var(--font-mono)`, not literal font-family names. **Scale unit for family chrome:** `calc(min(1cqw, 9px) * n)`. `modern` keeps its own `min(1cqw, 11px)`. (spec: §3)
- **Every chrome primitive root has `data-testid="chrome-<name>"`.** (spec: §3)

---

## Task 1: Zod chrome-spec schema + validation test

Introduces the schema and types with no wiring yet. Self-contained: new file + tests, existing build stays green.

**Files:**
- Modify: `package.json` (add `zod` to `dependencies`)
- Create: `src/lib/chromeSpec.ts` (schema + types only in this task)
- Test: `src/lib/chromeSpec.test.ts`

**Interfaces:**
- Produces: `ChromeSpec` (Zod schema `z.ZodArray` + `type ChromeSpec = z.infer<…>`), `ChromePart` (Zod schema + `type ChromePart`), `IconKind` type. Consumed by Task 2.

- [ ] **Step 1: Pin `zod` as an explicit dependency**

`zod` is currently only transitive (via Astro). Add it to `dependencies` in `package.json` (the resolved version is 3.25.x):

```jsonc
  "dependencies": {
    "@astrojs/preact": "^3.5.0",
    "astro": "^4.15.0",
    "preact": "^10.23.0",
    "zod": "^3.25.0"
  },
```

Run: `npm install`
Expected: lockfile updated, `zod` in `dependencies`; `node -e "require('zod')"` exits 0.

- [ ] **Step 2: Write the failing schema test**

Create `src/lib/chromeSpec.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ChromeSpec } from "./chromeSpec";

describe("ChromeSpec schema", () => {
  it("accepts a well-formed spec", () => {
    const spec = [
      { part: "deskIcons", side: "left", icons: [{ kind: "computer", label: "My Computer" }] },
      { part: "window", left: 28, top: 8, w: 54, body: { kind: "gridIcons", icons: ["drive", "folder"], cols: 3 } },
      { part: "taskbar" },
    ];
    expect(() => ChromeSpec.parse(spec)).not.toThrow();
  });

  it("rejects an unknown part", () => {
    expect(() => ChromeSpec.parse([{ part: "wormhole" }])).toThrow();
  });

  it("rejects an unknown icon kind", () => {
    expect(() => ChromeSpec.parse([{ part: "deskIcons", side: "left", icons: [{ kind: "nope", label: "x" }] }])).toThrow();
  });

  it("rejects a window with a non-positive width", () => {
    expect(() => ChromeSpec.parse([{ part: "window", left: 0, top: 0, w: 0, body: { kind: "rows", widths: [50] } }])).toThrow();
  });

  it("rejects empty icon arrays", () => {
    expect(() => ChromeSpec.parse([{ part: "deskIcons", side: "left", icons: [] }])).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/chromeSpec.test.ts`
Expected: FAIL — cannot resolve `./chromeSpec`.

- [ ] **Step 4: Write the schema module**

Create `src/lib/chromeSpec.ts` (schema + types only; `CHROME_SPECS` data is added in Task 2):

```ts
import { z } from "zod";

const IconKind = z.enum(["computer", "folder", "trash", "drive", "disk"]);
export type IconKind = z.infer<typeof IconKind>;

const WindowBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gridIcons"), icons: z.array(IconKind).nonempty(), cols: z.number().int().positive() }),
  z.object({ kind: z.literal("rows"), widths: z.array(z.number().positive()).nonempty() }),
  z.object({ kind: z.literal("panes"), count: z.literal(2) }),
]);
export type WindowBody = z.infer<typeof WindowBody>;

const Anchor = z.enum(["top", "bottom"]); // deskIcons vertical anchor; default "top"

export const ChromePart = z.discriminatedUnion("part", [
  z.object({
    part: z.literal("deskIcons"),
    side: z.enum(["left", "right"]),
    anchor: Anchor.optional(),
    icons: z.array(z.object({ kind: IconKind, label: z.string().min(1) })).nonempty(),
  }),
  z.object({ part: z.literal("window"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("beosWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("taskbar") }),
  z.object({ part: z.literal("menuBar") }),
  z.object({ part: z.literal("topBar") }),
  z.object({ part: z.literal("dock") }),
  z.object({ part: z.literal("frontPanel") }),
  z.object({ part: z.literal("beosTab") }),
]);
export type ChromePart = z.infer<typeof ChromePart>;

export const ChromeSpec = z.array(ChromePart);
export type ChromeSpec = z.infer<typeof ChromeSpec>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/chromeSpec.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/chromeSpec.ts src/lib/chromeSpec.test.ts
git commit -m "feat(chrome): add Zod chrome-spec schema + zod dependency"
```

---

## Task 2: Data-driven chrome rendering (primitives, specs, new styles)

The core refactor. Adds the new styles, the `CHROME_SPECS` data, the shared primitive components, the `renderPart` renderer, and rewires `DesktopPreview` — replacing the old `STYLE_CHROME` model while keeping `modern` pixel-identical.

**Files:**
- Modify: `src/lib/desktopStyle.ts` (style list)
- Modify: `src/lib/chromeSpec.ts` (append `CHROME_SPECS`)
- Modify: `src/islands/DesktopPreview.tsx` (primitives, renderer, rewire; rename modern parts)
- Test: `src/lib/chromeSpec.test.ts` (append per-style parse), `src/islands/DesktopPreview.test.tsx` (update assertions)

**Interfaces:**
- Consumes (from Task 1): `ChromeSpec`, `ChromePart` types.
- Produces: `CHROME_SPECS: Record<DesktopStyle, ChromeSpec | null>` (in `chromeSpec.ts`); `DesktopStyle` gains `win31|platinum|beos|gem`, loses `macos8`.

- [ ] **Step 1: Update the failing per-style spec test**

Append to `src/lib/chromeSpec.test.ts`:

```ts
import { CHROME_SPECS } from "./chromeSpec";
import { DESKTOP_STYLES } from "./desktopStyle";

describe("CHROME_SPECS", () => {
  it("every style has a valid spec or null (modern)", () => {
    for (const style of DESKTOP_STYLES) {
      const spec = CHROME_SPECS[style];
      if (spec === null) {
        expect(style).toBe("modern");
      } else {
        expect(() => ChromeSpec.parse(spec)).not.toThrow();
        expect(spec.length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/chromeSpec.test.ts`
Expected: FAIL — `CHROME_SPECS` is not exported (and `DESKTOP_STYLES` still has `macos8`).

- [ ] **Step 3: Update the style list**

Replace the list in `src/lib/desktopStyle.ts` (renames `macos8` → `platinum`; adds `win31`, `platinum`, `beos`, `gem`):

```ts
export const DESKTOP_STYLES = ["modern", "win9x", "win31", "platinum", "beos", "amiga", "kde", "cde", "gem", "generic"] as const;
```

- [ ] **Step 4: Append `CHROME_SPECS` to `chromeSpec.ts`**

At the end of `src/lib/chromeSpec.ts` add (composition ported verbatim from design 4a `sChrome()`):

```ts
import { DESKTOP_STYLES, type DesktopStyle } from "./desktopStyle";

// Per-family chrome, as validated data. `modern` is null → the bespoke legacy
// scene (see ModernScene in DesktopPreview.tsx). The exhaustive Record means a
// new DesktopStyle fails to compile until it is given chrome here.
export const CHROME_SPECS: Record<DesktopStyle, ChromeSpec | null> = {
  modern: null,
  win9x: [
    { part: "deskIcons", side: "left", icons: [{ kind: "computer", label: "My Computer" }, { kind: "folder", label: "Documents" }] },
    { part: "window", left: 28, top: 8, w: 54, body: { kind: "gridIcons", icons: ["drive", "folder", "folder", "computer", "folder", "disk"], cols: 3 } },
    { part: "deskIcons", side: "right", anchor: "bottom", icons: [{ kind: "trash", label: "Recycle Bin" }] },
    { part: "taskbar" },
  ],
  win31: [
    { part: "window", left: 16, top: 8, w: 68, body: { kind: "panes", count: 2 } },
  ],
  platinum: [
    { part: "menuBar" },
    { part: "deskIcons", side: "right", icons: [{ kind: "drive", label: "Macintosh HD" }, { kind: "trash", label: "Trash" }] },
    { part: "window", left: 20, top: 12, w: 52, body: { kind: "gridIcons", icons: ["drive", "folder", "folder", "disk", "folder", "trash"], cols: 3 } },
  ],
  beos: [
    { part: "beosTab" },
    { part: "deskIcons", side: "left", icons: [{ kind: "drive", label: "BeOS" }, { kind: "trash", label: "Trash" }] },
    { part: "beosWindow", left: 26, top: 11, w: 46, body: { kind: "gridIcons", icons: ["folder", "folder", "drive", "folder", "disk", "folder", "folder", "trash"], cols: 4 } },
  ],
  amiga: [
    { part: "topBar" },
    { part: "deskIcons", side: "right", icons: [{ kind: "disk", label: "Workbench" }, { kind: "drive", label: "Work" }, { kind: "trash", label: "Trash" }] },
    { part: "window", left: 10, top: 12, w: 46, body: { kind: "gridIcons", icons: ["disk", "drive", "folder"], cols: 3 } },
  ],
  kde: [
    { part: "window", left: 22, top: 9, w: 52, body: { kind: "rows", widths: [72, 88, 60, 80] } },
    { part: "dock" },
  ],
  cde: [
    { part: "deskIcons", side: "left", icons: [{ kind: "folder", label: "Home" }] },
    { part: "window", left: 22, top: 8, w: 46, body: { kind: "gridIcons", icons: ["folder", "folder", "drive", "folder", "disk", "folder"], cols: 3 } },
    { part: "frontPanel" },
  ],
  gem: [
    { part: "menuBar" },
    { part: "deskIcons", side: "right", icons: [{ kind: "disk", label: "Floppy Disk" }, { kind: "drive", label: "Hard Disk" }, { kind: "trash", label: "Trash" }] },
    { part: "window", left: 12, top: 11, w: 46, body: { kind: "gridIcons", icons: ["folder", "folder", "disk", "folder", "drive", "folder"], cols: 3 } },
  ],
  generic: [
    { part: "deskIcons", side: "left", icons: [{ kind: "computer", label: "Computer" }, { kind: "folder", label: "Files" }] },
    { part: "dock" },
  ],
};

// Keeps the import referenced even though DESKTOP_STYLES is only used for its type here.
void DESKTOP_STYLES;
```

Note: the `void DESKTOP_STYLES;` line is unnecessary if the value is otherwise used — remove it if you reference `DESKTOP_STYLES` elsewhere in the module. (It exists only to avoid an unused-import lint if the project later enables `noUnusedLocals`; current config does not, so you may omit both the value import and this line and import only the type.)

- [ ] **Step 5: Run the spec test to verify it passes**

Run: `npx vitest run src/lib/chromeSpec.test.ts`
Expected: PASS (schema tests + the new per-style parse).

- [ ] **Step 6: Rewrite `DesktopPreview.tsx`**

Replace the entire contents of `src/islands/DesktopPreview.tsx` with the following. The `modern` scene (`ModernDeskIcons`/`ModernWindowStack`/`ModernDock` + `surfaces`/`U`/`u`) is the current code with identifiers renamed only — output and `data-testid`s are unchanged. The family primitives are ported from design 4a.

```tsx
import type { ComponentChildren } from "preact";
import type { DesktopStyle } from "../lib/desktopStyle";
import { CHROME_SPECS, type ChromePart, type WindowBody } from "../lib/chromeSpec";

interface Props { hex: string; onColor: string; style: DesktopStyle }

/* ────────────────────────────────────────────────────────────────────────
   MODERN scene — the platform-neutral default. Preserved verbatim (only the
   component identifiers are prefixed `Modern*` to avoid clashing with the
   family primitives below). Its surfaces()/U/u are private to this block.
   ──────────────────────────────────────────────────────────────────────── */

function surfaces(onColor: string) {
  const light = onColor === "#1c1917";
  return {
    ink: onColor,
    panel: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.14)",
    win: light ? "rgba(0,0,0,0.11)" : "rgba(255,255,255,0.20)",
    border: light ? "rgba(0,0,0,0.24)" : "rgba(255,255,255,0.34)",
  };
}
const U = "min(1cqw, 11px)";
const u = (n: number) => `calc(var(--u) * ${n})`;

const ModernDeskIcons = ({ onColor }: { onColor: string }) => {
  const icons = [
    { label: "Files", d: "M3 6.5 h6 l2 2 h10 v10 h-18 z" },
    { label: "Trash", d: "M5 7 h14 M8 7 v-2 h8 v2 M6.5 7 l1 13 h9 l1 -13" },
  ];
  return (
    <div data-testid="chrome-desk-icons" style={`--u: ${U}; position: absolute; left: ${u(4)}; top: ${u(5)}; display: flex; flex-direction: column; gap: ${u(3)};`}>
      {icons.map((ic) => (
        <div key={ic.label} style={`display: flex; flex-direction: column; align-items: center; gap: ${u(0.8)}; width: ${u(12)};`}>
          <svg viewBox="0 0 24 24" fill="none" stroke={onColor} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style={`width: ${u(6)}; height: ${u(6)};`}><path d={ic.d} /></svg>
          <span style={`font: 500 ${u(2.4)} var(--font-ui); opacity: 0.85; color: ${onColor};`}>{ic.label}</span>
        </div>
      ))}
    </div>
  );
};

const ModernWindowStack = ({ onColor }: { onColor: string }) => {
  const { win, border, ink } = surfaces(onColor);
  return (
    <div data-testid="chrome-windows" style={`--u: ${U};`}>
      <div style={`position: absolute; left: ${u(24)}; top: ${u(5)}; width: ${u(46)}; height: ${u(26)}; border-radius: ${u(1.6)}; background: ${win}; box-shadow: inset 0 0 0 ${u(0.3)} ${border}, 0 ${u(2)} ${u(5)} rgba(0,0,0,0.16); overflow: hidden;`}>
        <div style={`height: ${u(6)}; display: flex; align-items: center; padding: 0 ${u(2.4)}; box-shadow: inset 0 ${u(-0.4)} 0 ${ink};`}><span style={`font: 500 ${u(2.6)} var(--font-ui); opacity: 0.75; color: ${ink};`}>Files</span></div>
      </div>
      <div style={`position: absolute; left: ${u(38)}; top: ${u(13)}; width: ${u(52)}; height: ${u(30)}; border-radius: ${u(1.6)}; background: ${win}; box-shadow: inset 0 0 0 ${u(0.3)} ${border}, 0 ${u(3)} ${u(7)} rgba(0,0,0,0.22); overflow: hidden;`}>
        <div style={`height: ${u(6)}; display: flex; align-items: center; padding: 0 ${u(2.4)}; box-shadow: inset 0 ${u(-0.4)} 0 ${ink};`}><span style={`font: 500 ${u(2.6)} var(--font-ui); opacity: 0.8; color: ${ink};`}>Documents</span></div>
        <div style={`padding: ${u(2.4)}; display: flex; flex-direction: column; gap: ${u(1.6)};`}>
          <span style={`height: ${u(1.5)}; width: 80%; border-radius: ${u(1)}; background: ${border};`} />
          <span style={`height: ${u(1.5)}; width: 62%; border-radius: ${u(1)}; background: ${border};`} />
          <span style={`height: ${u(1.5)}; width: 71%; border-radius: ${u(1)}; background: ${border};`} />
        </div>
      </div>
    </div>
  );
};

const ModernDock = ({ onColor }: { onColor: string }) => {
  const { panel, border, ink } = surfaces(onColor);
  return (
    <div data-testid="chrome-dock" style={`--u: ${U}; position: absolute; left: ${u(4)}; right: ${u(4)}; bottom: ${u(4)}; height: ${u(6)}; border-radius: ${u(3)}; background: ${panel}; display: flex; align-items: center; gap: ${u(2.4)}; padding: 0 ${u(3)};`}>
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${ink};`} />
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${border};`} />
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${border};`} />
      <span style={`width: ${u(0.3)}; height: ${u(3)}; background: ${border};`} />
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${border};`} />
      <span style={`margin-left: auto; font: 500 ${u(2.8)} var(--font-mono); opacity: 0.9; color: ${ink};`}>10:42</span>
    </div>
  );
};

const ModernScene = ({ onColor }: { onColor: string }) => (
  <>
    <ModernDeskIcons onColor={onColor} />
    <ModernWindowStack onColor={onColor} />
    <ModernDock onColor={onColor} />
  </>
);

/* ────────────────────────────────────────────────────────────────────────
   FAMILY chrome — translucent, wallpaper-adaptive primitives (design 4a).
   Surfaces + scale unit are separate from modern's so modern stays identical.
   ──────────────────────────────────────────────────────────────────────── */

function chromeSurfaces(onColor: string) {
  const light = onColor === "#1c1917";
  return {
    ink: onColor,
    panel: light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.14)",
    win: light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.20)",
    border: light ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.34)",
    soft: light ? "rgba(0,0,0,0.13)" : "rgba(255,255,255,0.26)",
  };
}
type Surfaces = ReturnType<typeof chromeSurfaces>;
const cu = (n: number) => `calc(min(1cqw, 9px) * ${n})`;

const ICON_PATHS: Record<string, string[]> = {
  computer: ["M3 5.5 h18 v10 h-18 z", "M9 19.5 h6", "M12 15.5 v4"],
  folder: ["M3 7 h6 l2 2 h10 v9 h-18 z"],
  trash: ["M5 7 h14", "M8 7 v-2 h8 v2", "M7 7 l1 12 h8 l1 -12"],
  drive: ["M4 6 h16 v12 h-16 z", "M7 10 h4", "M7 14 h10"],
  disk: ["M5 4 h11 l4 4 v12 h-19 v-16 z", "M8 4 v5 h6 v-5", "M8 13 h8 v7 h-8 z"],
};

const LineIcon = ({ kind, onColor, size = 6 }: { kind: string; onColor: string; size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={onColor} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style={{ width: cu(size), height: cu(size), opacity: 0.9 }}>
    {(ICON_PATHS[kind] ?? ICON_PATHS.folder).map((d, i) => <path key={i} d={d} />)}
  </svg>
);

const Dots = ({ S, n }: { S: Surfaces; n: number }) => (
  <div style={{ display: "flex", gap: cu(1) }}>
    {Array.from({ length: n }).map((_, i) => <span key={i} style={{ width: cu(1.8), height: cu(1.8), borderRadius: "50%", boxShadow: `inset 0 0 0 ${cu(0.35)} ${S.border}` }} />)}
  </div>
);

const Pane = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div style={{ background: S.panel, borderRadius: cu(1.4), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }}>
      <div style={{ height: cu(4), boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}`, display: "flex", alignItems: "center", padding: `0 ${cu(1.4)}` }}>
        <span style={{ width: cu(8), height: cu(1.3), borderRadius: cu(0.8), background: S.soft }} />
      </div>
      <div style={{ padding: cu(1.4), display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: cu(1.6), justifyItems: "center" }}>
        {["folder", "folder", "folder", "disk", "drive", "folder"].map((k, i) => <LineIcon key={i} kind={k} onColor={onColor} size={4} />)}
      </div>
    </div>
  );
};

const WindowBodyView = ({ body, onColor }: { body: WindowBody; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  if (body.kind === "gridIcons") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${body.cols}, 1fr)`, gap: cu(1.6), justifyItems: "center" }}>
        {body.icons.map((k, i) => <LineIcon key={i} kind={k} onColor={onColor} size={4} />)}
      </div>
    );
  }
  if (body.kind === "rows") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: cu(1.4) }}>
        {body.widths.map((w, i) => <span key={i} style={{ height: cu(1.4), width: `${w}%`, borderRadius: cu(0.8), background: S.border }} />)}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(2) }}>
      <Pane onColor={onColor} /><Pane onColor={onColor} />
    </div>
  );
};

const DeskIcons = ({ side, anchor = "top", icons, onColor }: { side: "left" | "right"; anchor?: "top" | "bottom"; icons: { kind: string; label: string }[]; onColor: string }) => {
  const pos = side === "right" ? { right: cu(4.5) } : { left: cu(4) };
  const vert = anchor === "bottom" ? { bottom: cu(11) } : { top: cu(6) };
  return (
    <div data-testid="chrome-deskicons" style={{ position: "absolute", ...vert, ...pos, display: "flex", flexDirection: "column", gap: cu(3.2), alignItems: "center" }}>
      {icons.map((ic, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: cu(0.9), width: cu(13) }}>
          <LineIcon kind={ic.kind} onColor={onColor} size={6} />
          <span style={{ font: `500 ${cu(2.4)} var(--font-ui)`, color: onColor, opacity: 0.85, textAlign: "center", lineHeight: 1.15 }}>{ic.label}</span>
        </div>
      ))}
    </div>
  );
};

const SharedWindow = ({ left, top, w, body, onColor }: { left: number; top: number; w: number; body: WindowBody; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-window" style={{ position: "absolute", left: cu(left), top: cu(top), width: cu(w), background: S.win, borderRadius: cu(1.8), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}, 0 ${cu(2.4)} ${cu(6)} rgba(0,0,0,0.18)`, overflow: "hidden" }}>
      <div style={{ height: cu(5.5), display: "flex", alignItems: "center", gap: cu(1.2), padding: `0 ${cu(2)}`, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}` }}>
        <span style={{ width: cu(12), height: cu(1.5), borderRadius: cu(0.8), background: S.soft }} />
        <span style={{ flex: 1 }} />
        <Dots S={S} n={3} />
      </div>
      <div style={{ padding: cu(2.2) }}><WindowBodyView body={body} onColor={onColor} /></div>
    </div>
  );
};

const BeosWindow = ({ left, top, w, body, onColor }: { left: number; top: number; w: number; body: WindowBody; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-beoswindow" style={{ position: "absolute", left: cu(left), top: cu(top), width: cu(w) }}>
      <div style={{ width: cu(22), height: cu(4.4), borderRadius: `${cu(1.6)} ${cu(1.6)} 0 0`, background: S.win, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.2), padding: `0 ${cu(1.8)}` }}>
        <span style={{ width: cu(9), height: cu(1.5), borderRadius: cu(0.8), background: S.soft }} />
      </div>
      <div style={{ background: S.win, borderRadius: `0 ${cu(1.6)} ${cu(1.6)} ${cu(1.6)}`, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}, 0 ${cu(2.4)} ${cu(6)} rgba(0,0,0,0.18)`, padding: cu(2.2) }}>
        <WindowBodyView body={body} onColor={onColor} />
      </div>
    </div>
  );
};

const Taskbar = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-taskbar" style={{ position: "absolute", left: cu(3), right: cu(3), bottom: cu(3), height: cu(6.4), borderRadius: cu(2), background: S.panel, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.6), padding: `0 ${cu(2)}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(0.6), width: cu(3.2), height: cu(3.2) }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ borderRadius: cu(0.4), background: S.ink, opacity: 0.85 }} />)}
      </div>
      <span style={{ width: cu(0.4), height: cu(4), background: S.border }} />
      <span style={{ width: cu(9), height: cu(3), borderRadius: cu(1.4), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }} />
      <span style={{ flex: 1 }} />
      <span style={{ width: cu(9), height: cu(3), borderRadius: cu(1.4), background: S.win }} />
    </div>
  );
};

const MenuBar = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-menubar" style={{ position: "absolute", left: 0, right: 0, top: 0, height: cu(5.4), background: S.panel, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}`, display: "flex", alignItems: "center", gap: cu(2.4), padding: `0 ${cu(2.4)}` }}>
      <span style={{ width: cu(2.6), height: cu(2.6), borderRadius: "50%", background: S.soft }} />
      {[0, 1, 2].map((i) => <span key={i} style={{ width: cu(5), height: cu(1.4), borderRadius: cu(0.8), background: S.soft }} />)}
      <span style={{ marginLeft: "auto", width: cu(7), height: cu(2), borderRadius: cu(1), background: S.soft }} />
    </div>
  );
};

const TopBar = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-topbar" style={{ position: "absolute", left: 0, right: 0, top: 0, height: cu(5), background: S.panel, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: cu(1.2), padding: `0 ${cu(1.8)}` }}>
      <span style={{ marginRight: "auto", width: cu(16), height: cu(1.6), borderRadius: cu(0.8), background: S.soft }} />
      {[0, 1].map((i) => <span key={i} style={{ width: cu(3.6), height: cu(3), borderRadius: cu(0.8), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }} />)}
    </div>
  );
};

const BeosTab = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-beostab" style={{ position: "absolute", right: cu(4), top: 0, width: cu(20), height: cu(5), borderRadius: `0 0 ${cu(1.8)} ${cu(1.8)}`, background: S.panel, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.2), padding: `0 ${cu(1.8)}` }}>
      <span style={{ width: cu(2.4), height: cu(2.4), borderRadius: cu(0.6), background: S.soft }} />
      {[0, 1].map((i) => <span key={i} style={{ flex: 1, height: cu(1.3), borderRadius: cu(0.8), background: S.soft }} />)}
    </div>
  );
};

const Dock = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-dock" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: cu(5.8), background: S.panel, boxShadow: `inset 0 ${cu(0.3)} 0 ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.4), padding: `0 ${cu(2)}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(0.6), width: cu(3.2), height: cu(3.2) }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ borderRadius: cu(0.4), background: S.ink, opacity: 0.85 }} />)}
      </div>
      <span style={{ width: cu(11), height: cu(3.2), borderRadius: cu(1.6), background: S.win }} />
      <span style={{ width: cu(11), height: cu(3.2), borderRadius: cu(1.6), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }} />
      <span style={{ flex: 1 }} />
      <span style={{ width: cu(2.2), height: cu(2.2), borderRadius: "50%", background: S.soft }} />
      <span style={{ width: cu(6.5), height: cu(2.6), borderRadius: cu(1.2), background: S.win }} />
    </div>
  );
};

const FrontPanel = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  const Btn = () => (
    <span style={{ width: cu(5.4), height: cu(5.4), borderRadius: cu(1.2), background: S.win, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: cu(2.4), height: cu(2.4), borderRadius: cu(0.6), background: S.soft }} />
    </span>
  );
  return (
    <div data-testid="chrome-frontpanel" style={{ position: "absolute", left: "50%", bottom: cu(3), transform: "translateX(-50%)", background: S.panel, borderRadius: cu(2), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.4), padding: cu(1.4) }}>
      <Btn /><Btn />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(0.6), padding: cu(0.8), borderRadius: cu(1), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: cu(2.4), height: cu(1.8), borderRadius: cu(0.4), background: S.soft }} />)}
      </div>
      <Btn /><Btn />
    </div>
  );
};

function renderPart(part: ChromePart, onColor: string, key: number): ComponentChildren {
  switch (part.part) {
    case "deskIcons": return <DeskIcons key={key} side={part.side} anchor={part.anchor} icons={part.icons} onColor={onColor} />;
    case "window": return <SharedWindow key={key} left={part.left} top={part.top} w={part.w} body={part.body} onColor={onColor} />;
    case "beosWindow": return <BeosWindow key={key} left={part.left} top={part.top} w={part.w} body={part.body} onColor={onColor} />;
    case "taskbar": return <Taskbar key={key} onColor={onColor} />;
    case "menuBar": return <MenuBar key={key} onColor={onColor} />;
    case "topBar": return <TopBar key={key} onColor={onColor} />;
    case "dock": return <Dock key={key} onColor={onColor} />;
    case "frontPanel": return <FrontPanel key={key} onColor={onColor} />;
    case "beosTab": return <BeosTab key={key} onColor={onColor} />;
  }
}

export function DesktopPreview({ hex, onColor, style }: Props) {
  const spec = CHROME_SPECS[style];
  return (
    <div style={`position: absolute; inset: 0; background-color: ${hex}; overflow: hidden; container-type: inline-size;`}>
      {spec === null ? <ModernScene onColor={onColor} /> : spec.map((part, i) => renderPart(part, onColor, i))}
    </div>
  );
}
```

- [ ] **Step 7: Update `DesktopPreview.test.tsx`**

Replace `src/islands/DesktopPreview.test.tsx` with (drops the `STYLE_CHROME` import; updates the exhaustiveness check to `CHROME_SPECS`; rewrites `chromeFor` for the new primitives):

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { DesktopPreview } from "./DesktopPreview";
import { CHROME_SPECS } from "../lib/chromeSpec";
import { DESKTOP_STYLES } from "../lib/desktopStyle";
import { onColor } from "../lib/color";

const HEX = "#3a6ea5"; // a mid blue; onColor -> white

describe("DesktopPreview", () => {
  // Guards against adding a style to DESKTOP_STYLES without chrome: the exhaustive
  // Record type catches it at compile time; this catches it at run time.
  it("every style renders chrome", () => {
    for (const style of DESKTOP_STYLES) {
      const spec = CHROME_SPECS[style];
      expect(spec === null || spec.length > 0).toBe(true); // null == modern (bespoke)
      const { container, unmount } = render(
        <DesktopPreview hex={HEX} onColor={onColor(HEX)} style={style} />,
      );
      expect(container.querySelectorAll("[data-testid^='chrome-']").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("fills the wallpaper with the selected color", () => {
    const { container } = render(<DesktopPreview hex={HEX} onColor={onColor(HEX)} style="generic" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveStyle(`background-color: ${HEX}`); // jest-dom normalizes hex↔rgb
  });

  it("draws the expected chrome per style", () => {
    const chromeFor = (style: (typeof DESKTOP_STYLES)[number]) => {
      const { container } = render(<DesktopPreview hex={HEX} onColor={onColor(HEX)} style={style} />);
      return [...container.querySelectorAll("[data-testid^='chrome-']")].map((el) => el.getAttribute("data-testid"));
    };
    expect(chromeFor("modern")).toEqual(["chrome-desk-icons", "chrome-windows", "chrome-dock"]);
    expect(chromeFor("win9x")).toEqual(["chrome-deskicons", "chrome-window", "chrome-deskicons", "chrome-taskbar"]);
    expect(chromeFor("win31")).toEqual(["chrome-window"]);
    expect(chromeFor("platinum")).toEqual(["chrome-menubar", "chrome-deskicons", "chrome-window"]);
    expect(chromeFor("beos")).toEqual(["chrome-beostab", "chrome-deskicons", "chrome-beoswindow"]);
    expect(chromeFor("amiga")).toEqual(["chrome-topbar", "chrome-deskicons", "chrome-window"]);
    expect(chromeFor("kde")).toEqual(["chrome-window", "chrome-dock"]);
    expect(chromeFor("cde")).toEqual(["chrome-deskicons", "chrome-window", "chrome-frontpanel"]);
    expect(chromeFor("gem")).toEqual(["chrome-menubar", "chrome-deskicons", "chrome-window"]);
    expect(chromeFor("generic")).toEqual(["chrome-deskicons", "chrome-dock"]);
  });

  it("renders the modern default scene (windows + dock clock)", () => {
    const { getByText, getAllByText } = render(<DesktopPreview hex={HEX} onColor={onColor(HEX)} style="modern" />);
    expect(getByText("Documents")).toBeTruthy();
    expect(getAllByText("Files").length).toBeGreaterThan(0); // icon label + back window
    expect(getByText("10:42")).toBeTruthy(); // dock clock
  });

  it("colors icon labels with onColor for contrast on the wallpaper", () => {
    const dark = "#101820"; // onColor -> white
    const { getByText } = render(<DesktopPreview hex={dark} onColor={onColor(dark)} style="generic" />);
    expect(getByText("Computer")).toHaveStyle("color: #ffffff"); // onColor(dark) === white
  });
});
```

- [ ] **Step 8: Run the island tests**

Run: `npx vitest run src/islands/DesktopPreview.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 9: Full type-check + unit suite**

Run: `npx astro check && npx vitest run`
Expected: `astro check` 0 errors (proves the exhaustive `Record` covers every style); all unit tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/desktopStyle.ts src/lib/chromeSpec.ts src/lib/chromeSpec.test.ts src/islands/DesktopPreview.tsx src/islands/DesktopPreview.test.tsx
git commit -m "feat(chrome): data-driven per-family chrome; add win31/platinum/beos/gem"
```

---

## Task 3: Remap OS content to family styles

Point each OS at its authentic family. Data-only; the schema (already updated) validates every value.

**Files:**
- Modify: 18 files under `src/content/os/*.json`

**Interfaces:**
- Consumes: the `DESKTOP_STYLES` enum from Task 2 (accepts `win31`/`platinum`/`beos`/`gem`, rejects `macos8`).

- [ ] **Step 1: Apply the remapping**

Run this from the repo root (each edit is an exact single-line replace of the `desktopStyle` value):

```bash
cd src/content/os
set_style() { perl -0pi -e "s/\"desktopStyle\":\s*\"[a-z0-9]+\"/\"desktopStyle\": \"$2\"/" "$1"; }
for f in windows-95 windows-98 windows-me windows-nt-4-0 windows-2000 windows-xp; do set_style "$f.json" win9x; done
for f in windows-1-0 windows-2-0 windows-3-0 windows-3-1 windows-nt-3-x; do set_style "$f.json" win31; done
set_style mac-os-8.json platinum
set_style beos.json beos
set_style haiku.json beos
set_style kde-1.json kde
set_style kde-2.json kde
set_style cde.json cde
set_style freegem.json gem
cd ../../..
```

- [ ] **Step 2: Verify the resulting styles**

Run:
```bash
for f in src/content/os/*.json; do printf "%-24s " "$(basename "$f" .json)"; grep -o '"desktopStyle"[^,}]*' "$f"; done
```
Expected (the 26 files):
```
amiga-workbench          "desktopStyle": "amiga"
amiga-workbench-2-0      "desktopStyle": "amiga"
beos                     "desktopStyle": "beos"
bleskos                  "desktopStyle": "generic"
cde                      "desktopStyle": "cde"
freegem                  "desktopStyle": "gem"
haiku                    "desktopStyle": "beos"
kde-1                    "desktopStyle": "kde"
kde-2                    "desktopStyle": "kde"
kde-plasma-6             "desktopStyle": "kde"
mac-os-8                 "desktopStyle": "platinum"
reactos                  "desktopStyle": "win9x"
serenityos               "desktopStyle": "win9x"
solaris-9                "desktopStyle": "cde"
windows-1-0              "desktopStyle": "win31"
windows-2-0              "desktopStyle": "win31"
windows-2000             "desktopStyle": "win9x"
windows-3-0              "desktopStyle": "win31"
windows-3-1              "desktopStyle": "win31"
windows-95               "desktopStyle": "win9x"
windows-98               "desktopStyle": "win9x"
windows-me               "desktopStyle": "win9x"
windows-nt-3-x           "desktopStyle": "win31"
windows-nt-4-0           "desktopStyle": "win9x"
windows-xp               "desktopStyle": "win9x"
xfce                     "desktopStyle": "modern"
```
(If any file had no `desktopStyle` key, the `perl` no-ops — add `"desktopStyle": "<value>",` by hand; the earlier survey showed all 26 have an explicit value.)

- [ ] **Step 3: Build to validate content + prerender**

Run: `npm run build`
Expected: content schema accepts all values; all ~700 pages prerender; exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/content/os/*.json
git commit -m "content: remap OS previews to per-family chrome styles"
```

---

## Task 4: Documentation

Rewrite the chrome-authoring guide for the data-driven model and refresh the entry-point references. No code; verified by the doc-link and enum consistency.

**Files:**
- Rewrite: `docs/adding-a-preview-style.md`
- Modify: `README.md` (the "Adding a preview style" section + the style list under "Adding a new OS")
- Modify: `CLAUDE.md` (the "Start here" one-liner for the preview guide)
- Modify: `docs/architecture-frontend.md` (the `desktopStyle` union, ~line 66)

- [ ] **Step 1: Rewrite `docs/adding-a-preview-style.md`**

Replace the whole file with:

````markdown
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
````

- [ ] **Step 2: Update `README.md`**

In the "Adding a new OS" section, change the inline style list (currently around line
148) from:

```
`win9x | macos8 | kde | cde | amiga | generic`
```
to:
```
`win9x | win31 | platinum | beos | amiga | kde | cde | gem | generic`
```

And update the "## Adding a preview style" section body to describe the data-driven
model, keeping the link:

```markdown
## Adding a preview style

`desktopStyle` picks the schematic desktop chrome (icons, taskbar, menu bar, dock, front
panel, …) drawn behind a color on the detail and fullscreen previews. Each style is a
Zod-validated **chrome spec** (an ordered list of primitives) in
[`src/lib/chromeSpec.ts`](src/lib/chromeSpec.ts). To point a platform at an existing
style, set `"desktopStyle"` in its `src/content/os/*.json`. To add a new style, see the
full guide: **[`docs/adding-a-preview-style.md`](docs/adding-a-preview-style.md)**.
```

- [ ] **Step 3: Update `CLAUDE.md`**

Refresh the preview-guide line in "Start here":

```markdown
- [`docs/adding-a-preview-style.md`](docs/adding-a-preview-style.md) — how the per-OS
  desktop previews work and how to add chrome. Previews are a Zod-validated, data-driven
  **chrome spec** per OS family (`src/lib/chromeSpec.ts`); this guide is the one to
  follow (for humans and LLM agents) when adding or changing chrome.
```

- [ ] **Step 4: Update `docs/architecture-frontend.md`**

Change the `desktopStyle` union near line 66 to:

```ts
  desktopStyle: "modern" | "win9x" | "win31" | "platinum" | "beos" | "amiga" | "kde" | "cde" | "gem" | "generic"; // default "modern"
```

- [ ] **Step 5: Verify no stale `macos8` references remain in live docs/code**

Run: `grep -rn "macos8" src README.md CLAUDE.md docs/adding-a-preview-style.md docs/architecture-frontend.md`
Expected: no matches. (Historical files under `docs/superpowers/plans/` and older specs may still mention it — those are point-in-time records; leave them.)

- [ ] **Step 6: Commit**

```bash
git add docs/adding-a-preview-style.md README.md CLAUDE.md docs/architecture-frontend.md
git commit -m "docs: data-driven chrome authoring guide; refresh style lists"
```

---

## Final verification

- [ ] Run the full suite: `npx astro check && npx vitest run && npm run build`
  Expected: 0 type errors; all unit tests pass; ~700 pages build.
- [ ] `npm run dev` and eyeball one page per family (e.g. `/os/windows-95` win9x,
  `/os/windows-3-1` win31, `/os/mac-os-8` platinum, `/os/haiku` beos, `/os/kde-1` kde,
  `/os/cde` cde, `/os/freegem` gem, `/os/xfce` modern) on both a light and a dark color.
- [ ] Optional: `npm run test:e2e` if preview DOM is asserted there.

## Self-review notes (coverage vs spec)

- §Architecture (data-driven, `null` sentinel, exhaustive Record) → Task 2.
- §Zod schema + vocabulary → Task 1.
- §Shared primitives (all 10, `data-testid`, `soft` tint, `cu` unit) → Task 2 Step 6.
  Deviation from spec wording: family surfaces use a **separate** `chromeSurfaces()`
  (not an extended shared `surfaces()`) so `modern` stays pixel-identical.
- §`sChrome` compositions → Task 2 Step 4 (`CHROME_SPECS`).
- §Style list + `macos8`→`platinum` + remap table → Task 2 Step 3, Task 3.
- §Testing → Task 1 (schema), Task 2 (island + per-style parse), Final verification.
- §Docs (guide + README + CLAUDE.md + architecture-frontend) → Task 4.
