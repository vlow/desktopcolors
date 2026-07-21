# Explorer in-place infobox + OS filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Color Explorer's direct swatch→OS links with an in-place infobox (color values, platforms, preview/download) and add an OS filter whose impossible options are disabled.

**Architecture:** Two pure build-time derivations (`buildPlatformsByHex`, `buildOsUniverse`) and two pure filter helpers (`osMatch`, `osOptionDisabled`) go in `src/lib/explorer.ts`. `src/pages/explorer.astro` builds them from the catalog and passes them as props. A new presentational `ColorInfobox` island renders the shared infobox body; `Explorer.tsx` owns all state and wires the infobox into both the grouped (band) and list (flat) views plus the OS filter panel.

**Tech Stack:** Astro static site, Preact islands (`preact/hooks`), TypeScript, Vitest + `@testing-library/preact`, plain CSS tokens (`src/styles/tokens.css`).

## Global Constraints

- **Design source of truth:** `DesktopColors.dc.html` in the Claude Design project. Translate x-dc → Preact; map the design's hard-coded hex values to existing tokens (`--ink` `#1c1917`, `--muted` `#57534e`, `--faint` `#a8a29e`, `--field-border` `#e2ded9`, `--card-border` `#eceae8`, `--panel` `#ffffff`, `--accent`, `--accent-strong`, `--font-ui`, `--font-mono`).
- **Styling (CLAUDE.md):** no inline styles for site-wide values — put shared/responsive rules in `tokens.css` as tokens/classes; inline is only for one-offs.
- **Column math constants (from design):** `EXP_COLW = 116`, `EXP_GAP = 12`.
- **OS-option disabling = "both, combined":** ANY mode disables an OS with no colors in the family/type universe; ALL mode disables an OS whose addition empties the result; an already-selected OS is never disabled; a family checkbox is disabled only when all its children are.
- **Copy tracking:** every copy calls `track({ kind: "copy", hex, os })` with `os` = the color's `primarySlug`; clipboard write mirrors `OsDetail.tsx` (`navigator.clipboard?.writeText(text)?.catch(() => {})` in try/catch, `window.setTimeout(..., 1300)`).
- **Test command:** `npm test` (runs `vitest run`). Single file: `npx vitest run <path>`.

---

## File Structure

- `src/lib/explorer.ts` (modify) — add `Platform`, `OsFamily`, `OsUniverse`, `OsMode` types + `buildPlatformsByHex`, `buildOsUniverse`, `osMatch`, `osOptionDisabled`.
- `src/lib/explorer.test.ts` (modify) — unit tests for the four new functions.
- `src/islands/ColorInfobox.tsx` (create) — shared infobox body (`band`/`flat` variants), owns copy state.
- `src/islands/Explorer.tsx` (modify) — new state + infobox wiring (both views) + OS filter panel + disabling.
- `src/islands/Explorer.test.tsx` (modify) — updated fixtures + infobox/OS-filter component tests.
- `src/pages/explorer.astro` (modify) — build and pass `platformsByHex` + `osUniverse`.
- `src/styles/tokens.css` (modify) — `--accent-tint` token + responsive rules for `.dc-infobox` / `.dc-os-panel` / `.dc-os-grid`.

---

## Task 1: Build-time data derivations (`platformsByHex`, `osUniverse`)

**Files:**
- Modify: `src/lib/explorer.ts`
- Test: `src/lib/explorer.test.ts`

**Interfaces:**
- Consumes: `Catalog` from `./catalog` (has `osList: OsView[]`; each `OsView` has `slug`, `name`, `year`, `family`, `colors: ColorView[]` with `hex`, `isDefault`).
- Produces:
  - `interface Platform { slug: string; name: string; year: number; family: string; isDefault: boolean }`
  - `interface OsFamily { name: string; oses: { slug: string; name: string; year: number; family: string }[] }`
  - `interface OsUniverse { fams: OsFamily[] }`
  - `buildPlatformsByHex(catalog: Catalog): Record<string, Platform[]>` (keys are lowercased hex; each list sorted by year then name)
  - `buildOsUniverse(catalog: Catalog): OsUniverse`

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/lib/explorer.test.ts`:

```ts
import {
  buildPlatformsByHex, buildOsUniverse,
} from "./explorer";

describe("buildPlatformsByHex", () => {
  it("groups platforms by lowercased hex, sorted by year then name", () => {
    const map = buildPlatformsByHex(catalog);
    expect(map["#008080"].map((p) => p.slug)).toEqual(["a"]);
    expect(map["#008080"][0]).toMatchObject({ name: "A", year: 1995, isDefault: true });
    expect(map["#ff0000"][0]).toMatchObject({ slug: "b", isDefault: true });
  });

  it("lists every platform that shipped a shared hex", () => {
    const shared: OsEntry[] = [
      { slug: "old", data: os({ name: "Old", year: 1998, colors: [
        { hex: "#008080", name: "Teal", index: "—", note: "", default: false }] }) },
      { slug: "new", data: os({ name: "New", year: 1995, colors: [
        { hex: "#008080", name: "Teal", index: "—", note: "", default: true }] }) },
    ];
    const cat = buildCatalog(shared, parseScores({ colors: {}, os: {} }));
    const map = buildPlatformsByHex(cat);
    // sorted by year: 1995 "New" before 1998 "Old"
    expect(map["#008080"].map((p) => p.slug)).toEqual(["new", "old"]);
    expect(map["#008080"][0].isDefault).toBe(true);
  });
});

describe("buildOsUniverse", () => {
  it("groups OSes by family, each group sorted by year then name", () => {
    const multi: OsEntry[] = [
      { slug: "w98", data: os({ name: "Windows 98", year: 1998, family: "Windows", colors: [
        { hex: "#008080", name: "Teal", index: "—", note: "", default: true }] }) },
      { slug: "w95", data: os({ name: "Windows 95", year: 1995, family: "Windows", colors: [
        { hex: "#000080", name: "Navy", index: "—", note: "", default: true }] }) },
      { slug: "beos", data: os({ name: "BeOS", year: 1996, family: "Be", colors: [
        { hex: "#ff0000", name: "Red", index: "—", note: "", default: true }] }) },
    ];
    const cat = buildCatalog(multi, parseScores({ colors: {}, os: {} }));
    const uni = buildOsUniverse(cat);
    const win = uni.fams.find((f) => f.name === "Windows")!;
    expect(win.oses.map((o) => o.slug)).toEqual(["w95", "w98"]);
    expect(uni.fams.map((f) => f.name)).toContain("Be");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: FAIL — `buildPlatformsByHex`/`buildOsUniverse` are not exported.

- [ ] **Step 3: Implement the builders**

In `src/lib/explorer.ts`, add the import of `Catalog` if missing (the file already imports `Catalog` from `./catalog`), then append:

```ts
export interface Platform {
  slug: string;
  name: string;
  year: number;
  family: string;
  isDefault: boolean;
}

export interface OsFamily {
  name: string;
  oses: { slug: string; name: string; year: number; family: string }[];
}

export interface OsUniverse {
  fams: OsFamily[];
}

export function buildPlatformsByHex(catalog: Catalog): Record<string, Platform[]> {
  const map: Record<string, Platform[]> = {};
  for (const o of catalog.osList) {
    for (const c of o.colors) {
      const key = c.hex.toLowerCase();
      (map[key] ??= []).push({
        slug: o.slug, name: o.name, year: o.year, family: o.family, isDefault: c.isDefault,
      });
    }
  }
  for (const key in map) {
    map[key].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  }
  return map;
}

export function buildOsUniverse(catalog: Catalog): OsUniverse {
  const oses = catalog.osList
    .map((o) => ({ slug: o.slug, name: o.name, year: o.year, family: o.family }))
    .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  const fams: OsFamily[] = [];
  for (const o of oses) {
    let f = fams.find((x) => x.name === o.family);
    if (!f) { f = { name: o.family, oses: [] }; fams.push(f); }
    f.oses.push(o);
  }
  return { fams };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: PASS (all describe blocks, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/explorer.ts src/lib/explorer.test.ts
git commit -m "feat(explorer): platformsByHex + osUniverse builders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: OS matching + impossible-option disabling

**Files:**
- Modify: `src/lib/explorer.ts`
- Test: `src/lib/explorer.test.ts`

**Interfaces:**
- Consumes: `Platform` (Task 1), `ExplorerColor` (existing in this file).
- Produces:
  - `type OsMode = "any" | "all"`
  - `osMatch(hex: string, platformsByHex: Record<string, Platform[]>, osSel: Record<string, true>, mode: OsMode): boolean`
  - `osOptionDisabled(candidateSlug: string, opts: { universe: ExplorerColor[]; platformsByHex: Record<string, Platform[]>; osSel: Record<string, true>; mode: OsMode }): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/explorer.test.ts`:

```ts
import { osMatch, osOptionDisabled } from "./explorer";
import type { Platform, ExplorerColor } from "./explorer";

const P = (slug: string, isDefault = false): Platform =>
  ({ slug, name: slug, year: 2000, family: "F", isDefault });

// teal ships on w95+w98; red ships on w95+beos.
const pmap: Record<string, Platform[]> = {
  "#008080": [P("w95", true), P("w98", true)],
  "#ff0000": [P("w95"), P("beos", true)],
};
const C = (hex: string, family: ExplorerColor["family"], types: ExplorerColor["types"]): ExplorerColor =>
  ({ hex, name: hex, family, types, h: 0, s: 0, l: 0, onColor: "#fff", score: 0, scoreLabel: "0", yearRange: "2000", primarySlug: "w95", href: "/x" });
const universe: ExplorerColor[] = [C("#008080", "teal", ["cool"]), C("#ff0000", "red", ["warm"])];

describe("osMatch", () => {
  it("matches all when nothing is selected", () => {
    expect(osMatch("#008080", pmap, {}, "any")).toBe(true);
  });
  it("ANY: color ships on at least one selected OS", () => {
    expect(osMatch("#ff0000", pmap, { beos: true }, "any")).toBe(true);
    expect(osMatch("#008080", pmap, { beos: true }, "any")).toBe(false);
  });
  it("ALL: color ships on every selected OS", () => {
    expect(osMatch("#008080", pmap, { w95: true, w98: true }, "all")).toBe(true);
    expect(osMatch("#ff0000", pmap, { w95: true, w98: true }, "all")).toBe(false);
  });
});

describe("osOptionDisabled", () => {
  const base = { universe, platformsByHex: pmap, osSel: {} as Record<string, true>, mode: "any" as const };

  it("ANY: disabled when no color in the universe ships on it", () => {
    // restrict universe to reds only → w98 (teal-only) is impossible
    const redOnly = { ...base, universe: [C("#ff0000", "red", ["warm"])] };
    expect(osOptionDisabled("w98", redOnly)).toBe(true);
    expect(osOptionDisabled("beos", redOnly)).toBe(false);
  });

  it("never disables an already-selected OS", () => {
    const redOnly = { ...base, universe: [C("#ff0000", "red", ["warm"])], osSel: { w98: true } };
    expect(osOptionDisabled("w98", redOnly)).toBe(false);
  });

  it("ALL: disabled when adding it would empty the result", () => {
    // beos selected in ALL mode; only red ships on beos. Adding w98 (teal-only) empties it.
    const allBeos = { ...base, mode: "all" as const, osSel: { beos: true } };
    expect(osOptionDisabled("w98", allBeos)).toBe(true);
    // w95 also ships red, so beos+w95 still yields red → enabled
    expect(osOptionDisabled("w95", allBeos)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: FAIL — `osMatch`/`osOptionDisabled` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/explorer.ts`:

```ts
export type OsMode = "any" | "all";

export function osMatch(
  hex: string,
  platformsByHex: Record<string, Platform[]>,
  osSel: Record<string, true>,
  mode: OsMode,
): boolean {
  const keys = Object.keys(osSel).filter((k) => osSel[k]);
  if (keys.length === 0) return true;
  const slugs = new Set((platformsByHex[hex.toLowerCase()] ?? []).map((p) => p.slug));
  return mode === "all" ? keys.every((k) => slugs.has(k)) : keys.some((k) => slugs.has(k));
}

export function osOptionDisabled(
  candidateSlug: string,
  opts: {
    universe: ExplorerColor[];
    platformsByHex: Record<string, Platform[]>;
    osSel: Record<string, true>;
    mode: OsMode;
  },
): boolean {
  const { universe, platformsByHex, osSel, mode } = opts;
  const selected = Object.keys(osSel).filter((k) => osSel[k]);
  if (selected.includes(candidateSlug)) return false; // never disable a selected OS
  const shipsOn = (hex: string, slug: string): boolean =>
    (platformsByHex[hex.toLowerCase()] ?? []).some((p) => p.slug === slug);
  if (mode === "all") {
    const need = [...selected, candidateSlug];
    return !universe.some((c) => need.every((s) => shipsOn(c.hex, s)));
  }
  return !universe.some((c) => shipsOn(c.hex, candidateSlug));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/explorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/explorer.ts src/lib/explorer.test.ts
git commit -m "feat(explorer): osMatch + osOptionDisabled filter helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `--accent-tint` token + `ColorInfobox` component

**Files:**
- Modify: `src/styles/tokens.css`
- Create: `src/islands/ColorInfobox.tsx`
- Test: `src/islands/ColorInfobox.test.tsx`

**Interfaces:**
- Consumes: `Platform` (Task 1); `hexToRgb`, `rgbToCmyk` from `../lib/color`; `colorPath` from `../lib/links`; `track` from `../lib/track`.
- Produces:
  - `interface InfoboxColor { hex: string; name: string; onColor: string; h: number; s: number; l: number; primarySlug: string }`
  - `ColorInfobox(props: { color: InfoboxColor; platforms: Platform[]; variant: "band" | "flat"; onPreview: () => void; onDownload: () => void })`

- [ ] **Step 1: Add the tint token**

In `src/styles/tokens.css`, inside `:root { … }`, add after the `--accent-strong` line:

```css
  --accent-tint: oklch(0.96 0.03 255);
```

- [ ] **Step 2: Write the failing test**

Create `src/islands/ColorInfobox.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ColorInfobox, type InfoboxColor } from "./ColorInfobox";
import type { Platform } from "../lib/explorer";

const color: InfoboxColor = {
  hex: "#008080", name: "Teal", onColor: "#ffffff",
  h: 180, s: 100, l: 25, primarySlug: "windows-95",
};
const platforms: Platform[] = [
  { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
  { slug: "beos", name: "BeOS", year: 1998, family: "Be", isDefault: false },
];

describe("ColorInfobox", () => {
  it("links each platform to its color detail page", () => {
    render(<ColorInfobox color={color} platforms={platforms} variant="band" onPreview={() => {}} onDownload={() => {}} />);
    const links = screen.getAllByTestId("infobox-platform") as HTMLAnchorElement[];
    expect(links[0].getAttribute("href")).toBe("/os/windows-95/008080");
    expect(links[1].getAttribute("href")).toBe("/os/beos/008080");
  });

  it("copies a color value and calls the preview/download callbacks", () => {
    const onPreview = vi.fn(), onDownload = vi.fn();
    render(<ColorInfobox color={color} platforms={platforms} variant="band" onPreview={onPreview} onDownload={onDownload} />);
    fireEvent.click(screen.getByTestId("copy-hex"));
    expect(screen.getByTestId("copy-hex").textContent).toContain("Copied");
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it("omits the color header in the flat variant", () => {
    const { rerender } = render(<ColorInfobox color={color} platforms={platforms} variant="band" onPreview={() => {}} onDownload={() => {}} />);
    expect(screen.queryByText("Teal")).toBeTruthy();
    rerender(<ColorInfobox color={color} platforms={platforms} variant="flat" onPreview={() => {}} onDownload={() => {}} />);
    expect(screen.queryByText("Teal")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/islands/ColorInfobox.test.tsx`
Expected: FAIL — `./ColorInfobox` does not exist.

- [ ] **Step 4: Implement `ColorInfobox`**

Create `src/islands/ColorInfobox.tsx`:

```tsx
import { useState } from "preact/hooks";
import { hexToRgb, rgbToCmyk } from "../lib/color";
import { colorPath } from "../lib/links";
import { track } from "../lib/track";
import type { Platform } from "../lib/explorer";

export interface InfoboxColor {
  hex: string;
  name: string;
  onColor: string;
  h: number;
  s: number;
  l: number;
  primarySlug: string;
}

interface Props {
  color: InfoboxColor;
  platforms: Platform[];
  variant: "band" | "flat";
  onPreview: () => void;
  onDownload: () => void;
}

type CopyKey = "hex" | "rgb" | "hsl" | "cmyk";

const actionBtns = (onPreview: () => void, onDownload: () => void) => (
  <div style="display: flex; gap: 8px; flex: none;">
    <button onClick={onPreview} style="border: 1px solid var(--field-border); cursor: pointer; background: #fff; color: var(--ink); font: 500 13px var(--font-ui); padding: 10px 15px; border-radius: 10px;">⤢ Preview</button>
    <button onClick={onDownload} style="border: none; cursor: pointer; background: var(--ink); color: #fff; font: 500 13px var(--font-ui); padding: 11px 17px; border-radius: 10px;">↓ Download</button>
  </div>
);

export function ColorInfobox({ color, platforms, variant, onPreview, onDownload }: Props) {
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [r, g, b] = hexToRgb(color.hex);
  const [cy, mg, ye, k] = rgbToCmyk(r, g, b);
  const hh = Math.round(color.h), ss = Math.round(color.s), ll = Math.round(color.l);

  const copy = (key: CopyKey, text: string) => {
    try { navigator.clipboard?.writeText(text)?.catch(() => {}); } catch { /* ignore */ }
    track({ kind: "copy", hex: color.hex, os: color.primarySlug });
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1300);
  };

  const rows: { key: CopyKey; label: string; value: string; toCopy: string }[] = [
    { key: "hex", label: "HEX", value: color.hex.toUpperCase(), toCopy: color.hex.toUpperCase() },
    { key: "rgb", label: "RGB", value: `${r}, ${g}, ${b}`, toCopy: `rgb(${r}, ${g}, ${b})` },
    { key: "hsl", label: "HSL", value: `${hh}°, ${ss}%, ${ll}%`, toCopy: `hsl(${hh}, ${ss}%, ${ll}%)` },
    { key: "cmyk", label: "CMYK", value: `${cy}, ${mg}, ${ye}, ${k}`, toCopy: `cmyk(${cy}%, ${mg}%, ${ye}%, ${k}%)` },
  ];

  const dCount = platforms.filter((p) => p.isDefault).length;
  const countLabel = platforms.length === 1 ? "1 OS" : `${platforms.length} OSes`;
  const defaultLabel = dCount === 0 ? "no default use" : dCount === 1 ? "1 default" : `${dCount} defaults`;

  return (
    <div>
      {variant === "band" ? (
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style={`width: 40px; height: 40px; border-radius: 9px; background-color: ${color.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); flex: none;`} />
            <div>
              <div style="font: 500 15px var(--font-ui);">{color.name} <span style="font: 400 12px var(--font-mono); color: var(--faint);">{color.hex.toUpperCase()}</span></div>
              <div style="font: 400 11px var(--font-mono); color: var(--faint); margin-top: 2px;">Shipped by {countLabel} · {defaultLabel}</div>
            </div>
          </div>
          {actionBtns(onPreview, onDownload)}
        </div>
      ) : (
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap;">
          <div style="font: 400 11px var(--font-mono); color: var(--faint);">Shipped by {countLabel} · {defaultLabel}</div>
          {actionBtns(onPreview, onDownload)}
        </div>
      )}

      <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; background: #fff; margin-bottom: 14px;">
        <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 6px;">COLOR VALUES · CLICK TO COPY</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 14px 14px;">
          {rows.map((row) => (
            <span key={row.key} data-testid={`copy-${row.key}`} title={`Copy ${row.label}`} onClick={() => copy(row.key, row.toCopy)} style="display: inline-flex; align-items: center; gap: 9px; border: 1px solid var(--card-border); border-radius: 8px; padding: 7px 11px; cursor: pointer;">
              <span style="font: 400 9px var(--font-mono); letter-spacing: 1px; color: var(--faint);">{row.label}</span>
              <span style="font: 500 13px var(--font-mono); color: var(--ink);">{row.value}</span>
              <span style={`font: 500 10px var(--font-mono); width: 60px; text-align: right; color: ${copied === row.key ? "var(--accent-strong)" : "#cbc7c1"};`}>{copied === row.key ? "Copied ✓" : "Copy"}</span>
            </span>
          ))}
        </div>
      </div>

      <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-bottom: 7px;">SHIPPED ON THESE PLATFORMS</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px;">
        {platforms.map((p) => (
          <a key={p.slug} href={colorPath(p.slug, color.hex)} data-testid="infobox-platform" style={`text-decoration: none; color: var(--ink); display: flex; align-items: center; gap: 10px; padding: 8px 11px; border-radius: 9px; border: 1px solid ${p.isDefault ? "var(--accent)" : "var(--card-border)"}; background: ${p.isDefault ? "var(--accent-tint)" : "var(--panel)"};`}>
            <span style={`width: 16px; height: 16px; border-radius: 4px; background-color: ${color.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15); flex: none;`} />
            <span style="flex: 1; min-width: 0; font: 500 13px var(--font-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{p.name}</span>
            {p.isDefault && <span style="flex: none; background: var(--accent-tint); color: var(--accent-strong); font: 600 8px var(--font-ui); letter-spacing: 0.5px; padding: 3px 7px; border-radius: 999px;">DEFAULT</span>}
            <span style="font: 500 11px var(--font-mono); color: var(--faint); flex: none;">{p.year}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/islands/ColorInfobox.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/islands/ColorInfobox.tsx src/islands/ColorInfobox.test.tsx
git commit -m "feat(explorer): ColorInfobox component + accent-tint token

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire the infobox and OS filter into `Explorer`

**Files:**
- Modify: `src/islands/Explorer.tsx` (full rewrite — content below)
- Modify: `src/pages/explorer.astro`
- Test: `src/islands/Explorer.test.tsx`

**Interfaces:**
- Consumes: `groupIntoBands`, `rankColors`, `familyCounts`, `typeCounts`, `FAMILY_DEFS`, `COLOR_TYPE_DEFS`, `osMatch`, `osOptionDisabled`, and types `ExplorerColor`, `Platform`, `OsUniverse`, `OsMode` from `../lib/explorer` (Tasks 1–2); `ColorInfobox`, `InfoboxColor` from `./ColorInfobox` (Task 3); existing `FullscreenPreview`, `DownloadSheet`.
- Produces: `Explorer(props: { colors: ExplorerColor[]; styleBySlug: Record<string, DesktopStyle>; platformsByHex: Record<string, Platform[]>; osUniverse: OsUniverse })`.

- [ ] **Step 1: Update the Astro page to build and pass the new props**

Replace `src/pages/explorer.astro` with:

```astro
---
import Base from "../layouts/Base.astro";
import { Explorer } from "../islands/Explorer";
import { loadCatalog } from "../lib/loadCatalog";
import { toExplorerColors, buildPlatformsByHex, buildOsUniverse } from "../lib/explorer";
import type { DesktopStyle } from "../lib/desktopStyle";

const catalog = await loadCatalog();
const colors = toExplorerColors(catalog);
const platformsByHex = buildPlatformsByHex(catalog);
const osUniverse = buildOsUniverse(catalog);
const styleBySlug: Record<string, DesktopStyle> = {};
for (const o of catalog.osList) styleBySlug[o.slug] = o.desktopStyle;
---
<Base title="Color Explorer — desktopcolors.com" description="Every solid desktop background color, grouped by hue, filterable by color type, and ranked by popularity." active="explorer">
  <Explorer colors={colors} styleBySlug={styleBySlug} platformsByHex={platformsByHex} osUniverse={osUniverse} client:load />
</Base>
```

- [ ] **Step 2: Update existing test fixtures + add new failing tests**

At the top of `src/islands/Explorer.test.tsx`, replace the fixture block (the `colors`/`styleBySlug` consts) with:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { Explorer } from "./Explorer";
import type { ExplorerColor, Platform, OsUniverse } from "../lib/explorer";

const colors: ExplorerColor[] = [
  { hex: "#008080", name: "Teal", family: "teal", types: ["cool"], h: 180, s: 100, l: 25, onColor: "#ffffff", score: 5000, scoreLabel: "5k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95/008080" },
  { hex: "#ff0000", name: "Red", family: "red", types: ["vivid", "neon", "jewel", "warm"], h: 0, s: 100, l: 50, onColor: "#ffffff", score: 1000, scoreLabel: "1k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95/ff0000" },
];
const styleBySlug = { "windows-95": "win9x" as const };
const platformsByHex: Record<string, Platform[]> = {
  "#008080": [
    { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
    { slug: "windows-98", name: "Windows 98", year: 1998, family: "Windows", isDefault: true },
  ],
  "#ff0000": [
    { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: false },
    { slug: "beos", name: "BeOS", year: 1998, family: "Be", isDefault: true },
  ],
};
const osUniverse: OsUniverse = {
  fams: [
    { name: "Windows", oses: [
      { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows" },
      { slug: "windows-98", name: "Windows 98", year: 1998, family: "Windows" },
    ] },
    { name: "Be", oses: [
      { slug: "beos", name: "BeOS", year: 1998, family: "Be" },
    ] },
  ],
};
const props = { colors, styleBySlug, platformsByHex, osUniverse };
```

Then, in every existing test, replace `render(<Explorer colors={colors} styleBySlug={styleBySlug} />)` with `render(<Explorer {...props} />)` (mechanical: same replacement in each `it` block).

Add these new tests inside the `describe("Explorer", () => { … })` block:

```tsx
  it("opens an infobox when a swatch is clicked and closes it on a second click", () => {
    render(<Explorer {...props} />);
    const swatch = screen.getAllByTestId("explorer-swatch")[0];
    fireEvent.click(swatch);
    expect(screen.getByText("SHIPPED ON THESE PLATFORMS")).toBeTruthy();
    fireEvent.click(swatch);
    expect(screen.queryByText("SHIPPED ON THESE PLATFORMS")).toBeNull();
  });

  it("infobox platform chips link to the color detail page", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getAllByTestId("explorer-swatch")[0]);
    const links = screen.getAllByTestId("infobox-platform") as HTMLAnchorElement[];
    expect(links.some((a) => a.getAttribute("href")?.endsWith("/008080"))).toBe(true);
  });

  it("ANY OS filter narrows results to colors on the picked OS", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    fireEvent.click(screen.getByRole("button", { name: "BeOS" }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Reds");   // red ships on beos
    expect(names).not.toContain("Teals"); // teal does not
  });

  it("ALL OS filter requires the color on every picked OS", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    fireEvent.click(screen.getByRole("button", { name: "ALL picked" }));
    fireEvent.click(screen.getByRole("button", { name: "Windows 95" }));
    fireEvent.click(screen.getByRole("button", { name: "Windows 98" }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");  // only teal is on both
    expect(names).not.toContain("Reds");
  });

  it("disables an impossible OS given the active family filter", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Reds/ }));       // family = red
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    // red ships only on windows-95 + beos, never windows-98 → disabled
    expect((screen.getByRole("button", { name: "Windows 98" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "BeOS" }) as HTMLButtonElement).disabled).toBe(false);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/islands/Explorer.test.tsx`
Expected: FAIL — `Explorer` does not accept `platformsByHex`/`osUniverse` and the new behaviors don't exist.

- [ ] **Step 4: Rewrite `Explorer.tsx`**

Replace the entire contents of `src/islands/Explorer.tsx` with:

```tsx
import { useMemo, useState } from "preact/hooks";
import type { DesktopStyle } from "../lib/desktopStyle";
import type { FamilyKey, ColorTypeKey } from "../lib/color";
import {
  groupIntoBands, rankColors, familyCounts, typeCounts,
  osMatch, osOptionDisabled,
  FAMILY_DEFS, COLOR_TYPE_DEFS,
  type ExplorerColor, type Platform, type OsUniverse, type OsFamily, type OsMode,
} from "../lib/explorer";
import { FullscreenPreview } from "./FullscreenPreview";
import { DownloadSheet } from "./DownloadSheet";
import { ColorInfobox } from "./ColorInfobox";

interface Props {
  colors: ExplorerColor[];
  styleBySlug: Record<string, DesktopStyle>;
  platformsByHex: Record<string, Platform[]>;
  osUniverse: OsUniverse;
}
type Group = "hue" | "flat";
type Sort = "spectrum" | "pop";

const EXP_COLW = 116, EXP_GAP = 12;

const seg = (active: boolean): string =>
  `cursor: pointer; border: none; border-radius: 999px; padding: 7px 15px; font: 500 13px var(--font-ui); background: ${active ? "#fff" : "transparent"}; color: ${active ? "var(--ink)" : "var(--muted)"}; box-shadow: ${active ? "0 1px 3px rgba(0,0,0,0.14)" : "none"};`;

export function Explorer({ colors, styleBySlug, platformsByHex, osUniverse }: Props) {
  const [group, setGroup] = useState<Group>("hue");
  const [sort, setSort] = useState<Sort>("spectrum");
  const [family, setFamily] = useState<FamilyKey | null>(null);
  const [type, setType] = useState<ColorTypeKey | null>(null);
  const [exp, setExp] = useState<string | null>(null);
  const [osOpen, setOsOpen] = useState(false);
  const [osSel, setOsSel] = useState<Record<string, true>>({});
  const [osMode, setOsMode] = useState<OsMode>("any");
  const [pv, setPv] = useState<{ list: ExplorerColor[]; idx: number } | null>(null);
  const [sheet, setSheet] = useState<{ name: string; hex: string; slug: string } | null>(null);
  const [bandWidth, setBandWidth] = useState(850);

  const osSelKeys = useMemo(() => Object.keys(osSel).filter((k) => osSel[k]), [osSel]);

  // Facet counts (unchanged from prior behavior — color pills count against the
  // OTHER color facet only; the OS filter does not affect these counts).
  const counts = useMemo(
    () => familyCounts(colors.filter((c) => !type || c.types.includes(type))),
    [colors, type]);
  const countsAll = useMemo(() => familyCounts(colors), [colors]);
  const tCounts = useMemo(
    () => typeCounts(colors.filter((c) => !family || c.family === family)),
    [colors, family]);
  const tCountsAll = useMemo(() => typeCounts(colors), [colors]);
  const countLabel = (n: number, total: number) => (n === total ? `${total}` : `${n}/${total}`);

  const osMatches = (c: ExplorerColor) => osMatch(c.hex, platformsByHex, osSel, osMode);

  const bands = useMemo(
    () => group === "flat" ? [] :
      groupIntoBands(colors.filter(osMatches),
        { group: "hue", family, types: type ? [type] : [], sort }),
    [colors, platformsByHex, group, family, type, sort, osSel, osMode]);
  const ranking = useMemo(() => {
    if (group !== "flat") return [];
    const base = colors.filter(osMatches);
    const filtered = type ? base.filter((c) => c.types.includes(type)) : base;
    return rankColors(filtered, { family, sort });
  }, [colors, platformsByHex, group, family, type, sort, osSel, osMode]);

  // Universe for OS-option disabling: colors passing the family/type filter only.
  const osUniverseColors = useMemo(
    () => colors.filter((c) => (!family || c.family === family) && (!type || c.types.includes(type))),
    [colors, family, type]);
  const osDisabled = (slug: string) =>
    osOptionDisabled(slug, { universe: osUniverseColors, platformsByHex, osSel, mode: osMode });

  const cols = Math.max(1, Math.floor((bandWidth + EXP_GAP) / (EXP_COLW + EXP_GAP)));
  const bandGridRef = (n: HTMLDivElement | null) => {
    if (n && n.clientWidth && n.clientWidth !== bandWidth) setBandWidth(n.clientWidth);
  };

  const openPv = (list: ExplorerColor[], idx: number) => setPv({ list, idx });
  const stepPv = (d: number) => setPv((s) => s ? { ...s, idx: (s.idx + d + s.list.length) % s.list.length } : s);
  const cur = pv ? pv.list[pv.idx] : null;

  const toggleFamily = (k: FamilyKey) => setFamily((f) => f === k ? null : k);
  const toggleType = (k: ColorTypeKey) => setType((t) => t === k ? null : k);
  const toggleExp = (hex: string) => setExp((e) => e === hex ? null : hex);

  const toggleOsSlug = (slug: string) => setOsSel((s) => {
    const next = { ...s };
    if (next[slug]) delete next[slug]; else next[slug] = true;
    return next;
  });
  const toggleOsFam = (f: OsFamily) => {
    const slugs = f.oses.filter((o) => !osDisabled(o.slug)).map((o) => o.slug);
    setOsSel((s) => {
      const next = { ...s };
      const allOn = slugs.length > 0 && slugs.every((x) => next[x]);
      slugs.forEach((x) => { if (allOn) delete next[x]; else next[x] = true; });
      return next;
    });
  };

  const swatch = (c: ExplorerColor) => {
    const open = exp === c.hex;
    const dCount = (platformsByHex[c.hex.toLowerCase()] ?? []).filter((p) => p.isDefault).length;
    return (
      <button key={c.hex} data-testid="explorer-swatch" onClick={() => toggleExp(c.hex)}
        style="width: 116px; cursor: pointer; border: none; background: none; padding: 0; text-align: left; display: block;">
        <div class="dc-swatch" style={`position: relative; height: 78px; border-radius: 10px; background-color: ${c.hex}; box-shadow: ${open ? "inset 0 0 0 2px var(--accent), 0 6px 16px rgba(0,0,0,0.16)" : "inset 0 0 0 1px rgba(0,0,0,0.08)"}; transition: box-shadow 0.12s ease;`}>
          <span style={`position: absolute; left: 9px; bottom: 8px; font: 500 11px var(--font-mono); color: ${c.onColor}; opacity: 0.9;`}>{c.hex}</span>
        </div>
        <div style="font: 500 13px var(--font-ui); margin-top: 8px;">{c.name}</div>
        <div style="display: flex; align-items: center; gap: 7px; font: 400 11px var(--font-mono); color: var(--faint);">
          {c.yearRange}
          {dCount > 0 && <span title={dCount === 1 ? "OS default color" : `Default in ${dCount} OSes`} style="margin-left: auto; flex: none; background: var(--accent-tint); color: var(--accent-strong); font: 600 8px var(--font-ui); letter-spacing: 0.5px; padding: 2px 6px; border-radius: 999px;">DEFAULT</span>}
        </div>
      </button>
    );
  };

  return (
    <div class="dc-explorer dc-page-x" style="padding-block: 26px 56px;">
      <h1 style="font: 700 32px var(--font-ui); letter-spacing: -0.8px; margin: 0;">Color Explorer</h1>
      <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 640px; margin: 8px 0 0;">Group by hue to browse, filter by color type, or ungroup to rank colors by how often people download and copy them.</p>

      <div style="display: flex; align-items: center; gap: 26px; flex-wrap: wrap; margin-top: 20px;">
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">GROUP</span>
          <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
            <button style={seg(group === "hue")} onClick={() => setGroup("hue")}>By hue</button>
            <button style={seg(group === "flat")} onClick={() => setGroup("flat")}>Ungrouped</button>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
          <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
            <button style={seg(sort === "spectrum")} onClick={() => setSort("spectrum")}>Spectrum</button>
            <button style={seg(sort === "pop")} onClick={() => setSort("pop")}>Popularity</button>
          </div>
        </div>
        <button onClick={() => setOsOpen((o) => !o)} style={`cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 7px 15px; font: 500 13px var(--font-ui); border: 1px solid ${osOpen || osSelKeys.length ? "var(--ink)" : "var(--field-border)"}; background: ${osOpen || osSelKeys.length ? "var(--ink)" : "#fff"}; color: ${osOpen || osSelKeys.length ? "#fff" : "var(--ink)"};`}>⧉ Filter by OS{osSelKeys.length ? ` · ${osSelKeys.length}` : ""}</button>
      </div>

      <div style="margin-top: 18px;">
        <div style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-bottom: 12px;">BASIC COLORS — CLICK TO NARROW</div>
        <div style="display: flex; gap: 9px; flex-wrap: wrap;">
          {FAMILY_DEFS.filter((f) => countsAll[f.key] > 0).map((f) => {
            const active = family === f.key;
            const n = counts[f.key] ?? 0;
            const dim = n === 0 && !active;
            return (
              <button key={f.key} disabled={dim} onClick={() => toggleFamily(f.key)} style={`cursor: ${dim ? "default" : "pointer"}; opacity: ${dim ? "0.4" : "1"}; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 14px 8px 10px; font: 500 13px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                <span style={`width: 15px; height: 15px; border-radius: 50%; background-color: ${f.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                {f.name}<span class="dc-pill-count" style="font: 400 11px var(--font-mono); opacity: 0.6;">{countLabel(n, countsAll[f.key])}</span>
              </button>
            );
          })}
          {family && <button onClick={() => setFamily(null)} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui); padding: 8px 6px;">Clear ✕</button>}
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap;">
          <span style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">TYPE</span>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            {COLOR_TYPE_DEFS.filter((t) => tCountsAll[t.key] > 0).map((t) => {
              const active = type === t.key;
              const n = tCounts[t.key] ?? 0;
              const dim = n === 0 && !active;
              return (
                <button key={t.key} disabled={dim} onClick={() => toggleType(t.key)} style={`cursor: ${dim ? "default" : "pointer"}; opacity: ${dim ? "0.4" : "1"}; display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 6px 12px 6px 8px; font: 500 12px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                  <span style={`width: 13px; height: 13px; border-radius: 50%; background-color: ${t.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                  {t.name}<span class="dc-pill-count" style="font: 400 10px var(--font-mono); opacity: 0.6;">{countLabel(n, tCountsAll[t.key])}</span>
                </button>
              );
            })}
            {type && <button onClick={() => setType(null)} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 12px var(--font-ui); padding: 6px 4px;">Clear type ✕</button>}
          </div>
        </div>
      </div>

      {osOpen && (
        <div class="dc-os-panel" style="margin-top: 16px; border: 1px solid var(--field-border); border-radius: 14px; background: #fff; padding: 18px 20px;">
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 16px;">
            <span style="font: 500 15px var(--font-ui);">Filter by operating system</span>
            <div style="display: inline-flex; align-items: center; gap: 8px;">
              <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SHOW COLORS IN</span>
              <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
                <button onClick={() => setOsMode("any")} style={seg(osMode === "any")}>ANY picked</button>
                <button onClick={() => setOsMode("all")} style={seg(osMode === "all")}>ALL picked</button>
              </div>
            </div>
            {osSelKeys.length > 0 && <button onClick={() => setOsSel({})} style="margin-left: auto; cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui);">Clear ✕</button>}
          </div>
          <div class="dc-os-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px 26px;">
            {osUniverse.fams.map((f) => {
              const flags = f.oses.map((o) => osDisabled(o.slug));
              const famDisabled = flags.every(Boolean);
              const total = f.oses.length;
              const famOn = f.oses.filter((o) => osSel[o.slug]).length;
              const allOn = famOn === total, someOn = famOn > 0 && famOn < total;
              const boxBg = allOn ? "var(--accent)" : someOn ? "var(--accent-tint)" : "#fff";
              const boxBd = allOn || someOn ? "var(--accent)" : "#cbc7c1";
              return (
                <div key={f.name}>
                  <button disabled={famDisabled} onClick={() => { if (!famDisabled) toggleOsFam(f); }}
                    style={`display: flex; align-items: center; gap: 10px; cursor: ${famDisabled ? "default" : "pointer"}; opacity: ${famDisabled ? "0.4" : "1"}; background: none; border: none; padding: 0 0 9px; width: 100%;`}>
                    <span style={`width: 16px; height: 16px; border-radius: 5px; flex: none; background: ${boxBg}; box-shadow: inset 0 0 0 1.5px ${boxBd};`} />
                    <span style="font: 500 14px var(--font-ui);">{f.name}</span>
                    <span style="margin-left: auto; font: 400 11px var(--font-mono); color: var(--faint);">{famOn}/{total}</span>
                  </button>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-left: 26px;">
                    {f.oses.map((o, oi) => {
                      const sel = !!osSel[o.slug];
                      const dis = flags[oi];
                      return (
                        <button key={o.slug} data-testid="os-option" disabled={dis} onClick={() => { if (!dis) toggleOsSlug(o.slug); }}
                          style={`cursor: ${dis ? "default" : "pointer"}; opacity: ${dis ? "0.4" : "1"}; border-radius: 8px; padding: 5px 10px; font: 500 12px var(--font-ui); border: 1px solid ${sel ? "var(--ink)" : "var(--field-border)"}; background: ${sel ? "var(--ink)" : "#fff"}; color: ${sel ? "#fff" : "var(--muted)"};`}>{o.name}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {group !== "flat" ? (
        <div style="margin-top: 18px;">
          {bands.map((b) => {
            const idx = exp ? b.colors.findIndex((c) => c.hex === exp) : -1;
            const hasPanel = idx >= 0;
            const rowEnd = hasPanel ? Math.min(b.colors.length - 1, (Math.floor(idx / cols) + 1) * cols - 1) : -1;
            const head = hasPanel ? b.colors.slice(0, rowEnd + 1) : b.colors;
            const tail = hasPanel ? b.colors.slice(rowEnd + 1) : [];
            const caretLeft = hasPanel ? (idx % cols) * (EXP_COLW + EXP_GAP) + EXP_COLW / 2 : 0;
            const panelColor = hasPanel ? b.colors[idx] : null;
            return (
              <div key={b.key} class="dc-explorer-band" style="display: grid; grid-template-columns: 190px 1fr; gap: 28px; padding: 22px 0; border-bottom: 1px solid var(--card-border); align-items: start;">
                <div>
                  <div style="display: inline-flex; align-items: center; gap: 9px;">
                    <span style={`width: 20px; height: 20px; border-radius: 6px; background-color: ${b.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                    <span data-testid="band-name" style="font: 500 18px var(--font-ui);">{b.name}</span>
                  </div>
                  <div style="font: 400 11px var(--font-mono); color: var(--faint); margin-top: 6px;">{b.colors.length} colors</div>
                </div>
                <div ref={bandGridRef} style="min-width: 0;">
                  <div style="display: grid; grid-template-columns: repeat(auto-fill, 116px); gap: 12px; justify-content: start;">
                    {head.map((c) => swatch(c))}
                  </div>
                  {hasPanel && panelColor && (
                    <div style="position: relative; margin: 12px 0 4px;">
                      <span style={`position: absolute; top: -6px; left: calc(${caretLeft}px - 6px); width: 12px; height: 12px; background: #fff; border-left: 1px solid var(--field-border); border-top: 1px solid var(--field-border); transform: rotate(45deg); z-index: 2;`} />
                      <div class="dc-infobox" style={`border: 1px solid var(--field-border); border-top: 3px solid ${panelColor.hex}; border-radius: 12px; background: #fff; padding: 16px 18px; box-shadow: 0 10px 26px rgba(0,0,0,0.08);`}>
                        <ColorInfobox variant="band" color={panelColor} platforms={platformsByHex[panelColor.hex.toLowerCase()] ?? []}
                          onPreview={() => openPv(b.colors, idx)}
                          onDownload={() => setSheet({ name: panelColor.name, hex: panelColor.hex, slug: panelColor.primarySlug })} />
                      </div>
                    </div>
                  )}
                  {tail.length > 0 && (
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, 116px); gap: 12px; justify-content: start; margin-top: 12px;">
                      {tail.map((c) => swatch(c))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 4px; max-width: 1000px;">
          {ranking.map((c, i) => {
            const open = exp === c.hex;
            return (
              <div key={c.hex}>
                <div data-testid="rank-row" class="dc-rank-row" onClick={() => toggleExp(c.hex)}
                  style={`cursor: pointer; display: grid; grid-template-columns: 40px 56px 1fr 220px 84px; gap: 16px; align-items: center; padding: 10px; border-radius: ${open ? "12px 12px 0 0" : "12px"}; ${open ? "border: 1px solid var(--field-border); border-bottom: none; border-left: 3px solid var(--accent); padding: 9px 9px 10px 8px;" : ""} background: ${open ? "#fbfaf9" : "transparent"};`}>
                  <span style="font: 600 20px var(--font-mono); color: #cbc7c2; text-align: right;">{c.rank}</span>
                  <span class="dc-rank-swatch" style={`display: block; height: 56px; border-radius: 10px; background-color: ${c.hex}; box-shadow: ${open ? "inset 0 0 0 2px var(--accent)" : "inset 0 0 0 1px rgba(0,0,0,0.1)"};`} />
                  <span>
                    <span style="display: block; font: 500 15px var(--font-ui);">{c.name}</span>
                    <span style="display: block; font: 400 12px var(--font-mono); color: var(--faint);">{c.hex} · {c.yearRange}</span>
                  </span>
                  <span class="dc-rank-bar" style="display: flex; align-items: center; gap: 10px;">
                    <span style="flex: 1; height: 8px; border-radius: 999px; background: var(--card-border); overflow: hidden;"><span style={`display: block; height: 100%; width: ${c.pct}%; background: var(--accent);`} /></span>
                    <span style="flex: none; min-width: 52px; text-align: right; font: 500 12px var(--font-mono); color: var(--muted);">{c.scoreLabel}</span>
                  </span>
                  <span class="dc-rank-pv" style="font: 500 12px var(--font-ui); color: var(--accent-strong); text-align: right;">{open ? "Close ✕" : "Details"}</span>
                </div>
                {open && (
                  <div class="dc-infobox" style={`margin: 0 0 10px; border: 1px solid var(--field-border); border-top: none; border-left: 3px solid ${c.hex}; border-radius: 0 0 12px 12px; background: #fbfaf9; padding: 16px 18px;`}>
                    <ColorInfobox variant="flat" color={c} platforms={platformsByHex[c.hex.toLowerCase()] ?? []}
                      onPreview={() => openPv(ranking, i)}
                      onDownload={() => setSheet({ name: c.name, hex: c.hex, slug: c.primarySlug })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cur && (
        <FullscreenPreview
          hex={cur.hex} onColor={cur.onColor} style={styleBySlug[cur.primarySlug] ?? "generic"}
          label={`${cur.name} · ${cur.hex}`} pos={pv!.idx + 1} total={pv!.list.length}
          detailHref={cur.href}
          onClose={() => setPv(null)} onPrev={() => stepPv(-1)} onNext={() => stepPv(1)}
        />
      )}
      {sheet && <DownloadSheet osSlug={sheet.slug} color={{ hex: sheet.hex, name: sheet.name }} onClose={() => setSheet(null)} />}
    </div>
  );
}
```

- [ ] **Step 5: Run the Explorer tests to verify they pass**

Run: `npx vitest run src/islands/Explorer.test.tsx`
Expected: PASS (existing + new tests).

- [ ] **Step 6: Run the full test suite + typecheck + build**

Run: `npm test && npm run check && npm run build`
Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/islands/Explorer.tsx src/islands/Explorer.test.tsx src/pages/explorer.astro
git commit -m "feat(explorer): in-place infobox + OS filter with impossible-option disabling

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Mobile responsive rules + end-to-end verification

**Files:**
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Consumes: the `.dc-infobox`, `.dc-os-panel`, `.dc-os-grid` classes emitted by Tasks 3–4.
- Produces: (CSS only, no JS surface.)

- [ ] **Step 1: Add responsive rules**

In `src/styles/tokens.css`, inside the existing `@media (max-width: 759.98px) { … }` block that already contains the `.dc-explorer` / `.dc-explorer-band` / `.dc-rank-*` rules, add:

```css
  .dc-os-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
  .dc-os-panel { padding: 14px 14px !important; }
  .dc-infobox { padding: 14px 14px !important; }
```

- [ ] **Step 2: Verify the app in a real browser (desktop + mobile widths)**

Use the `/run` skill (or `npm run dev`) to launch the site and open `/explorer`. Confirm, at a desktop width and at ~375px:
- Clicking a swatch (By hue) opens the caret infobox after that swatch's row; a second click closes it; the caret sits under the clicked swatch.
- In Ungrouped view, clicking a row opens the attached panel with "Close ✕"; no color header shown.
- Copy chips flip to "Copied ✓"; platform chips navigate to the OS detail page.
- `⧉ Filter by OS` opens the panel; ANY vs ALL change results; picking a family checkbox toggles its OSes; impossible OSes are greyed and unclickable; Clear resets.
- At 375px: the band collapses to one column with the caret centered; the OS grid is single-column; infobox header/actions and chips wrap without horizontal page scroll.

- [ ] **Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "style(explorer): responsive rules for infobox + OS filter panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Infobox replacing swatch→OS link, two variants — Tasks 3 (component) + 4 (band caret panel / flat attached panel). ✓
- Click-to-copy HEX/RGB/HSL/CMYK from existing converters + `h/s/l` — Task 3. ✓
- Platform chips → `colorPath` (color→OS navigation) — Task 3. ✓
- Preview → `FullscreenPreview`, Download → `DownloadSheet` — Task 4. ✓
- `platformsByHex` + `osUniverse` build-time derivations — Task 1, plumbed in Task 4 Step 1. ✓
- OS filter panel, ANY/ALL, tri-state family checkbox, Clear, `osMatch` gating — Tasks 2 + 4. ✓
- "Both, combined" disabling via `osOptionDisabled`; family disabled when all children disabled — Tasks 2 + 4. ✓
- Mobile via `tokens.css` classes — Task 5. ✓
- Tests: lib pure functions + component behaviors — Tasks 1–4. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. ✓

**Type consistency:** `Platform`, `OsFamily`, `OsUniverse`, `OsMode`, `InfoboxColor` names/shapes are identical across Tasks 1–4; `osOptionDisabled`'s `opts` object (`universe`/`platformsByHex`/`osSel`/`mode`) matches its call site in `Explorer.tsx` (`osDisabled`); `osMatch` argument order matches its call in `osMatches`. ✓
