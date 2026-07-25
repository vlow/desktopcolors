# Mobile-collapsed toolbars for Platforms & Colors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On viewports below 760px, drop the Platforms VIEW switcher (always show Cards) and collapse the Platforms Sort and the Colors Group + Sort controls into compact dropdown menus, freeing the vertical space they currently waste.

**Architecture:** Both the desktop control and its mobile dropdown are rendered in the DOM; CSS media queries (`.dc-desktop-only` / `.dc-mobile-only`) decide which is visible, so there is no hydration flash. A single shared `<Dropdown>` Preact component owns open/close behavior and is reused three times. One small SSR-safe `useIsNarrow()` hook handles the only thing CSS cannot: switching the Platforms content branch from List to Cards when a desktop window is narrowed.

**Tech Stack:** Astro + Preact islands (inline styles referencing `tokens.css` custom properties), Vitest + `@testing-library/preact` (jsdom).

## Global Constraints

- Single site-wide breakpoint: **760px** — mobile is `@media (max-width: 759.98px)`, desktop is `@media (min-width: 760px)`. Do not introduce another breakpoint.
- No new dependencies.
- Inline styles reference `tokens.css` custom properties (`var(--ink)`, `var(--panel)`, `var(--font-ui)`, …). Anything shared across components (utility classes, hover states, media queries) lives in `src/styles/tokens.css`, never inline (per `CLAUDE.md`).
- Islands have **no scoped `<style>`**; responsive rules live in `tokens.css` and hook onto class names with `!important` to beat inline styles.
- Render both control variants and toggle with CSS — never conditionally render a variant based on a JS breakpoint (that reintroduces flash). The sole JS breakpoint use is `useIsNarrow()` for the Platforms content branch.
- jsdom has no `window.matchMedia`; a default stub is added in `src/test-setup.ts` (Task 1).
- Run tests with `npx vitest run <file>` (single file) or `npm test` (all). Type-check with `npm run check`.
- Commit message trailer on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: `useIsNarrow` hook + `matchMedia` test stub

**Files:**
- Modify: `src/test-setup.ts` (add a default `window.matchMedia` stub)
- Create: `src/lib/useIsNarrow.ts`
- Test: `src/lib/useIsNarrow.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `useIsNarrow(query?: string): boolean` — `true` below 760px. Defaults to `false` on the server and first client render, then updates after mount. PlatformControls (Task 3) consumes it.

- [ ] **Step 1: Add a default `matchMedia` stub to the test setup**

Read `src/test-setup.ts` first (it currently only imports jest-dom), then replace its contents with:

```ts
import "@testing-library/jest-dom";

// jsdom does not implement matchMedia. Provide a default (desktop: never
// matches) so components using media queries render deterministically. A test
// can override window.matchMedia before render to simulate a narrow viewport.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/useIsNarrow.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { useIsNarrow } from "./useIsNarrow";

function Probe() {
  return <span>{useIsNarrow() ? "narrow" : "wide"}</span>;
}

const origMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = origMatchMedia; });

describe("useIsNarrow", () => {
  it("reports wide when the media query does not match", () => {
    render(<Probe />);
    expect(screen.getByText("wide")).toBeTruthy();
  });

  it("reports narrow when the media query matches", () => {
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    render(<Probe />);
    expect(screen.getByText("narrow")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/useIsNarrow.test.tsx`
Expected: FAIL — cannot resolve `./useIsNarrow`.

- [ ] **Step 4: Implement the hook**

Create `src/lib/useIsNarrow.ts`:

```ts
import { useEffect, useState } from "preact/hooks";

const NARROW_QUERY = "(max-width: 759.98px)";

/**
 * True when the viewport is below the site's 760px mobile breakpoint.
 * SSR-safe: defaults to false so the first client render matches the server,
 * then a post-mount effect reads matchMedia and subscribes to changes.
 */
export function useIsNarrow(query: string = NARROW_QUERY): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setNarrow(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return narrow;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/useIsNarrow.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite to confirm the stub broke nothing**

Run: `npm test`
Expected: PASS (all existing tests still green).

- [ ] **Step 7: Commit**

```bash
git add src/test-setup.ts src/lib/useIsNarrow.ts src/lib/useIsNarrow.test.tsx
git commit -m "feat: add useIsNarrow hook and matchMedia test stub

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared `<Dropdown>` component

**Files:**
- Create: `src/islands/Dropdown.tsx`
- Test: `src/islands/Dropdown.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `Dropdown` component with props
  `{ trigger: ComponentChildren; children: (close: () => void) => ComponentChildren; ariaLabel: string; align?: "left" | "right" }`.
  Renders a trigger `<button>` (accessible name = `ariaLabel`, `aria-haspopup="menu"`, `aria-expanded`) and, when open, a `role="menu"` panel containing `children(close)`. Closes on outside `mousedown` and `Escape`. Menu rows are supplied by callers as `<button role="menuitem">`. PlatformControls (Task 3) and Colors (Task 4) consume it.

- [ ] **Step 1: Write the failing test**

Create `src/islands/Dropdown.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { Dropdown } from "./Dropdown";

function setup() {
  return render(
    <Dropdown ariaLabel="Sort menu" trigger={<span>Sort</span>}>
      {(close) => (
        <>
          <button role="menuitem" onClick={close}>Option A</button>
          <button role="menuitem" onClick={close}>Option B</button>
        </>
      )}
    </Dropdown>,
  );
}

describe("Dropdown", () => {
  it("is closed initially", () => {
    setup();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Sort menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on trigger click", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort menu" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes when a menuitem calls close", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Option B" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on an outside mousedown", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/Dropdown.test.tsx`
Expected: FAIL — cannot resolve `./Dropdown`.

- [ ] **Step 3: Implement the component**

Create `src/islands/Dropdown.tsx`:

```tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

interface DropdownProps {
  /** Visible content of the trigger button (label, glyphs, chevron). */
  trigger: ComponentChildren;
  /** Menu contents; receives a `close` callback to dismiss the menu. */
  children: (close: () => void) => ComponentChildren;
  /** Accessible name for the trigger button. */
  ariaLabel: string;
  /** Which edge the panel aligns to. Default "left". */
  align?: "left" | "right";
}

export function Dropdown({ trigger, children, ariaLabel, align = "left" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} style="position: relative;">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        style="cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--field-border); background: var(--panel); color: var(--ink); border-radius: 999px; padding: 8px 14px; font: 500 14px var(--font-ui);"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          style={`position: absolute; top: calc(100% + 8px); ${align === "right" ? "right: 0;" : "left: 0;"} min-width: 210px; background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,0.18); padding: 6px; z-index: 60;`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/islands/Dropdown.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/islands/Dropdown.tsx src/islands/Dropdown.test.tsx
git commit -m "feat: add shared Dropdown menu component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Platforms toolbar — hide VIEW on mobile, force Cards, collapse Sort

**Files:**
- Modify: `src/styles/tokens.css` (add utility + menu-item classes; replace the dead Platforms list-note/inert block)
- Modify: `src/islands/PlatformControls.tsx`
- Test: `src/islands/PlatformControls.test.tsx`

**Interfaces:**
- Consumes: `useIsNarrow` (Task 1), `Dropdown` (Task 2).
- Produces: utility classes `.dc-desktop-only`, `.dc-mobile-only`, `.dc-menu-item` in `tokens.css` (Colors, Task 4, reuses them).

- [ ] **Step 1: Add the shared CSS classes and retire the dead Platforms rules**

In `src/styles/tokens.css`, replace this block (currently near line 68):

```css
/* Platforms — list view is a wide-screen affordance. Below 760px the List toggle
   is greyed and inert, a note explains why, and (as a safety net for a resize
   from a wide list view) the list rows collapse to a single column. */
.dc-list-note { display: none; }
@media (max-width: 759.98px) {
  .dc-list-toggle { pointer-events: none; color: #cbc7c1 !important; }
  .dc-list-note { display: block; }
  .dc-platform-list-row { grid-template-columns: 1fr !important; gap: 16px !important; }
}
```

with:

```css
/* Collapsible toolbar controls. Below 760px the Platforms VIEW switcher and the
   inline Sort/Group controls (.dc-desktop-only) hide, and a dropdown
   (.dc-mobile-only) takes their place. Both variants are always in the DOM;
   only visibility flips, so there is no hydration flash. */
.dc-mobile-only { display: none !important; }
@media (max-width: 759.98px) {
  .dc-desktop-only { display: none !important; }
  .dc-mobile-only { display: block !important; }
  /* Safety net: during a wide→narrow resize, before useIsNarrow forces Cards,
     any still-rendered list rows collapse to a single column. */
  .dc-platform-list-row { grid-template-columns: 1fr !important; gap: 16px !important; }
}

/* A row inside a <Dropdown> menu (role="menuitem"). Active row uses
   aria-current="true". Base + hover here; per-row state stays inline. */
.dc-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 9px 12px; border: none; background: none; border-radius: 8px;
  cursor: pointer; font: 500 14px var(--font-ui); color: var(--ink); text-align: left;
}
.dc-menu-item:hover { background: var(--panel); }
.dc-menu-item[aria-current="true"] { color: var(--accent-strong); }
```

- [ ] **Step 2: Write the failing tests**

Add these tests inside the `describe("PlatformControls", ...)` block in `src/islands/PlatformControls.test.tsx` (keep the existing imports; they already include `render, screen, fireEvent` — add `within` to the import from `@testing-library/preact`):

```tsx
  it("keeps both the desktop View controls and the mobile Sort dropdown in the DOM", () => {
    render(<PlatformControls items={items} />);
    // Desktop inline controls
    expect(screen.getByRole("button", { name: /Cards/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /List/ })).toBeTruthy();
    // Mobile dropdown trigger (accessible name is "Sort: <current>")
    expect(screen.getByRole("button", { name: /^Sort:/ })).toBeTruthy();
  });

  it("sorts A–Z from the mobile Sort dropdown", () => {
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /A.Z/ }));
    const names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench");
  });

  it("reverses direction when the active sort is tapped in the dropdown", () => {
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    // "New" selects newest-first (Amiga 2026-07-20 before Windows 2026-07-17)
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /New/ }));
    let names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench");
    // Tapping the now-active "New" reverses to oldest-first; menu stays open
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /New/ }));
    names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Windows 95");
  });

  it("forces Cards view on narrow viewports even when List is selected", () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    // Card view shows "N colors" count labels; list view does not.
    expect(screen.getAllByText(/colors$/).length).toBeGreaterThan(0);
    window.matchMedia = orig;
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/islands/PlatformControls.test.tsx`
Expected: FAIL — no `Sort:`-named button / no `menu` role yet.

- [ ] **Step 4: Wire up the hook and dropdown in `PlatformControls.tsx`**

Update the imports at the top of `src/islands/PlatformControls.tsx`:

```tsx
import { useMemo, useState } from "preact/hooks";
import { colorPath } from "../lib/links";
import { useIsNarrow } from "../lib/useIsNarrow";
import { Dropdown } from "./Dropdown";
```

Inside the component, after `const [view, setView] = useState<"card" | "list">("card");`, add:

```tsx
  const isNarrow = useIsNarrow();
  const effectiveView = isNarrow ? "card" : view;
  const activeSort = SORTS.find((s) => s.key === sort)!;
```

- [ ] **Step 5: Replace the toolbar markup**

Replace the toolbar `<div>` (the block currently spanning from `<div style="display: flex; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap;">` through its closing `</div>`, immediately followed by the `<div class="dc-list-note" ...>` line) with:

```tsx
        <div style="display: flex; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap;">
          <div class="dc-view-controls dc-desktop-only" style="display: flex; align-items: center; gap: 14px;">
            <span style="font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">VIEW</span>
            <button
              onClick={() => setView("card")}
              style={`cursor: pointer; border: none; background: none; padding: 0; font: 500 15px var(--font-ui); color: ${view === "card" ? "var(--ink)" : "var(--faint)"}; ${underline(view === "card")}`}
            ><span style="font-size: 13px;">&#9635;</span> Cards</button>
            <span style="color: #d6d3d1;">|</span>
            <button
              onClick={() => setView("list")}
              style={`cursor: pointer; border: none; background: none; padding: 0; font: 500 15px var(--font-ui); color: ${view === "list" ? "var(--ink)" : "var(--faint)"}; ${underline(view === "list")}`}
            ><span style="font-size: 13px;">&#9776;</span> List</button>
          </div>

          <div class="dc-sort-inline dc-desktop-only" style="display: flex; align-items: center; gap: 14px; margin-left: auto;">
            <span style="font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
            {SORTS.map((s) => {
              const active = sort === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => selectSort(s.key)}
                  title={active ? `${s.full} — click to reverse (${dirWord[s.key]})` : `Sort by ${s.full.toLowerCase()}`}
                  style={`cursor: pointer; border: none; background: none; padding: 0; font: 500 15px var(--font-ui); color: ${active ? "var(--ink)" : "var(--faint)"}; ${underline(active)}`}
                >
                  {s.icon && <span style="font-size: 13px;">{s.icon} </span>}
                  {s.label}
                  <span style={`font-size: 12px; opacity: ${active ? "1" : "0.25"};`}> {active && rev ? "↑" : "↓"}</span>
                </button>
              );
            })}
          </div>

          <div class="dc-sort-menu dc-mobile-only" style="margin-left: auto;">
            <Dropdown
              ariaLabel={`Sort: ${activeSort.label}`}
              align="right"
              trigger={<>
                <span style="font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
                {activeSort.icon && <span style="font-size: 13px;">{activeSort.icon}</span>}
                <span>{activeSort.label}</span>
                <span style="opacity: 0.7;">{rev ? "↑" : "↓"}</span>
                <span style="opacity: 0.5;">▾</span>
              </>}
            >
              {(close) => SORTS.map((s) => {
                const active = sort === s.key;
                return (
                  <button
                    key={s.key}
                    role="menuitem"
                    class="dc-menu-item"
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      if (s.key === sort) { setRev((r) => !r); }
                      else { setSort(s.key); setRev(false); close(); }
                    }}
                  >
                    {s.icon && <span style="font-size: 13px;">{s.icon} </span>}
                    {s.label}
                    <span style="margin-left: auto; font-size: 12px;">{active ? (rev ? "↑" : "↓") : ""}</span>
                  </button>
                );
              })}
            </Dropdown>
          </div>
        </div>
```

Note: the `<div class="dc-list-note" ...>List view needs a wider screen</div>` line is deleted (not replaced) — the CSS that showed it was removed in Step 1.

- [ ] **Step 6: Switch the content branch to `effectiveView`**

In the render, change the view conditional from:

```tsx
      ) : view === "card" ? (
```

to:

```tsx
      ) : effectiveView === "card" ? (
```

(The `shown.length === 0` empty-state branch above it is unchanged.)

- [ ] **Step 7: Run the Platforms tests**

Run: `npx vitest run src/islands/PlatformControls.test.tsx`
Expected: PASS (existing tests + the 4 new ones).

- [ ] **Step 8: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/styles/tokens.css src/islands/PlatformControls.tsx src/islands/PlatformControls.test.tsx
git commit -m "feat(platforms): collapse View/Sort toolbar into a dropdown on mobile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Colors toolbar — collapse Group + Sort into dropdowns

**Files:**
- Modify: `src/islands/Colors.tsx`
- Test: `src/islands/Colors.test.tsx`

**Interfaces:**
- Consumes: `Dropdown` (Task 2), and the `.dc-desktop-only` / `.dc-mobile-only` / `.dc-menu-item` classes (Task 3).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing tests**

The test file already imports `render, screen, fireEvent, within`. Add these tests inside `describe("Colors", ...)` in `src/islands/Colors.test.tsx`:

```tsx
  it("keeps both the desktop segmented controls and the mobile dropdowns in the DOM", () => {
    render(<Colors {...props} />);
    expect(screen.getByRole("button", { name: "Ungrouped" })).toBeTruthy(); // desktop group
    expect(screen.getByRole("button", { name: "Popularity" })).toBeTruthy(); // desktop sort
    expect(screen.getByRole("button", { name: /^Group:/ })).toBeTruthy();   // mobile group trigger
    expect(screen.getByRole("button", { name: /^Sort:/ })).toBeTruthy();    // mobile sort trigger
  });

  it("switches to the leaderboard from the mobile Group and Sort dropdowns", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Group:/ }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Ungrouped" }));
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Popularity" }));
    const rows = screen.getAllByTestId("rank-row");
    expect(within(rows[0]).getByText("Teal")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/islands/Colors.test.tsx`
Expected: FAIL — no `Group:` / `Sort:` trigger buttons yet.

- [ ] **Step 3: Import `Dropdown`**

Add to the imports at the top of `src/islands/Colors.tsx` (place alongside the other island imports):

```tsx
import { Dropdown } from "./Dropdown";
```

- [ ] **Step 4: Add `dc-desktop-only` to the two segmented control wrappers**

In the toolbar block (near line 150), change the Group wrapper opening tag from:

```tsx
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">GROUP</span>
```

to:

```tsx
        <div class="dc-desktop-only" style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">GROUP</span>
```

and the Sort wrapper opening tag from:

```tsx
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
```

to:

```tsx
        <div class="dc-desktop-only" style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
```

- [ ] **Step 5: Add the two mobile dropdowns**

Immediately after the closing `</div>` of the desktop Sort wrapper and **before** the `<button ...>⧉ Filter by OS...` line, insert:

```tsx
        <div class="dc-mobile-only">
          <Dropdown
            ariaLabel={`Group: ${group === "hue" ? "By hue" : "Ungrouped"}`}
            trigger={<>
              <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">GROUP</span>
              <span>{group === "hue" ? "By hue" : "Ungrouped"}</span>
              <span style="opacity: 0.5;">▾</span>
            </>}
          >
            {(close) => (["hue", "flat"] as const).map((g) => (
              <button
                key={g}
                role="menuitem"
                class="dc-menu-item"
                aria-current={group === g ? "true" : undefined}
                onClick={() => { setGroup(g); close(); }}
              >
                {g === "hue" ? "By hue" : "Ungrouped"}
                <span style="margin-left: auto;">{group === g ? "✓" : ""}</span>
              </button>
            ))}
          </Dropdown>
        </div>
        <div class="dc-mobile-only">
          <Dropdown
            ariaLabel={`Sort: ${sort === "spectrum" ? "Spectrum" : "Popularity"}`}
            trigger={<>
              <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
              <span>{sort === "spectrum" ? "Spectrum" : "Popularity"}</span>
              <span style="opacity: 0.5;">▾</span>
            </>}
          >
            {(close) => (["spectrum", "pop"] as const).map((s) => (
              <button
                key={s}
                role="menuitem"
                class="dc-menu-item"
                aria-current={sort === s ? "true" : undefined}
                onClick={() => { setSort(s); close(); }}
              >
                {s === "spectrum" ? "Spectrum" : "Popularity"}
                <span style="margin-left: auto;">{sort === s ? "✓" : ""}</span>
              </button>
            ))}
          </Dropdown>
        </div>
```

- [ ] **Step 6: Run the Colors tests**

Run: `npx vitest run src/islands/Colors.test.tsx`
Expected: PASS (existing tests + the 2 new ones). The existing exact-name queries (`{ name: "Ungrouped" }`, `{ name: "Popularity" }`) still match only the desktop `role="button"` controls, because the dropdown rows are `role="menuitem"` and the triggers are named `Group:`/`Sort:`.

- [ ] **Step 7: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/islands/Colors.tsx src/islands/Colors.test.tsx
git commit -m "feat(colors): collapse Group/Sort controls into dropdowns on mobile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Document the pattern in DESIGN.md (D2)

**Files:**
- Modify: `DESIGN.md` (add decision D2)

**Interfaces:**
- Consumes: nothing.
- Produces: DESIGN.md decision D2 documenting the collapse-to-dropdown pattern.

- [ ] **Step 1: Add the D2 decision entry**

In `DESIGN.md`, directly after the end of the `### D1 — Section rule ...` section (before end of file), append:

```markdown
### D2 — Collapse-to-dropdown on mobile (`.dc-desktop-only` / `.dc-mobile-only` + `<Dropdown>`): fit a wide toolbar onto a narrow screen

- **Element** — a toolbar renders **both** its desktop control and a mobile
  `<Dropdown>` (`src/islands/Dropdown.tsx`); visibility is toggled by the
  `.dc-desktop-only` / `.dc-mobile-only` utility classes in
  [`src/styles/tokens.css`](src/styles/tokens.css). Menu rows are
  `<button role="menuitem" class="dc-menu-item">`.

- **Purpose (UX)** — a heading-zone toolbar with several inline controls (view
  switcher, sort, grouping) wraps onto multiple lines below 760px and steals
  vertical space. Collapsing the controls into a single dropdown button keeps
  the setup zone compact while preserving every option one tap away.

- **Use it when** — a page's inline toolbar controls overflow on narrow screens.
  In play on Platforms (Sort) and Colors (Group + Sort).

- **Don't use it when**
  - A control is meaningless on mobile (e.g. the Platforms List view): drop it
    entirely with `.dc-desktop-only` rather than moving it into a menu.
  - A single primary action fits fine (e.g. the Colors "Filter by OS" button):
    leave it inline.

- **How**
  - Render both variants; never conditionally render one based on a JS
    breakpoint — that reintroduces hydration flash. `.dc-mobile-only` is
    `display:none` by default and shown below 760px; `.dc-desktop-only` is
    hidden below 760px.
  - The `<Dropdown>` owns open/close (outside-click + Escape); callers pass a
    `trigger` and `children(close)` and render their own `menuitem` rows,
    marking the active one with `aria-current="true"`.
  - Where a JS branch (not just styling) must react to the breakpoint — e.g.
    forcing the Platforms content to Cards when a desktop window is narrowed —
    use the `useIsNarrow()` hook (`src/lib/useIsNarrow.ts`), the one sanctioned
    JS breakpoint read. Keep it out of visual layout so no flash is introduced.

- **Why this way** — rendering both variants and toggling with CSS keeps the
  site's flash-free, server-rendered responsive model (the same reason islands
  put their media queries in `tokens.css` rather than in JS). A single shared
  `<Dropdown>` keeps the three menus identical and the open/close logic in one
  place, per `CLAUDE.md`'s reuse-first styling rules.
```

- [ ] **Step 2: Verify the full suite and type-check are clean**

Run: `npm test && npm run check`
Expected: all tests PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): add D2 collapse-to-dropdown-on-mobile decision

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Breakpoint 760px, render-both-toggle-with-CSS mechanism → Task 3 Step 1 (utility classes), used in Tasks 3 & 4. ✓
- `useIsNarrow` SSR-safe hook, used only for `effectiveView` → Task 1, Task 3 Steps 4 & 6. ✓
- Shared `<Dropdown>` reused 3× → Task 2 (component), Task 3 (Platforms sort), Task 4 (Colors group + sort). ✓
- Platforms: VIEW hidden on mobile, always Cards, Sort dropdown with tap-active-to-reverse; dead list-note/inert CSS + note markup removed; list-row fallback kept → Task 3. ✓
- Colors: Group + Sort dropdowns, facet pills untouched → Task 4 (only the two segmented wrappers touched). ✓
- New utility classes in tokens.css + DESIGN.md D2 → Task 3 Step 1, Task 5. ✓
- Tests for all three surfaces (Dropdown, Platforms, Colors) + hook → Tasks 1–4. ✓

**Placeholder scan:** No TBD/TODO; every code and test step shows complete code and exact run commands. ✓

**Type consistency:** `useIsNarrow(query?: string): boolean` defined in Task 1 and imported/called with no args in Task 3. `Dropdown` prop shape (`trigger`, `children: (close) => …`, `ariaLabel`, `align?`) defined in Task 2 and matched at all three call sites in Tasks 3–4 (`children` always used as `(close) => …`). Sort keys/labels come from the existing `SORTS` array; Colors group values `"hue" | "flat"` and sort values `"spectrum" | "pop"` match the existing `Group`/`Sort` types and `setGroup`/`setSort` setters. ✓

## Out of scope
- Colors facet filter pills (unchanged).
- Any new breakpoint or responsive framework.
- Keyboard arrow-key navigation within menus (Escape + click-away + Tab-focusable rows only).
```
