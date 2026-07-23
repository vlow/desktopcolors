# Similar-color Preview Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user step through the current color's "Similar colors elsewhere" list inside the fullscreen preview using the existing prev/next mechanism, with the expanded info panel below following along.

**Architecture:** In `src/islands/OsDetail.tsx`, make `simExp` (the expanded similar card's hex) the single source of truth for the current similar color, and replace the `simPreview` object with a boolean `simFull`. A `stepSim(d)` helper advances `simExp` with wraparound; the fullscreen render block derives the current color from `simExp`, and the expanded panel below follows automatically because it is already driven by `simExp`.

**Tech Stack:** Astro + Preact islands, TypeScript, Vitest + `@testing-library/preact`.

## Global Constraints

- No new dependencies.
- Follow existing inline-style conventions in `OsDetail.tsx` (this is a Preact
  island already built entirely with inline styles; do not introduce CSS files).
- Reuse the existing `FullscreenPreview` component and its prev/next contract
  (arrow buttons + ArrowLeft/ArrowRight keys); do not modify it.
- Wraparound navigation must match the existing main-preview `step` helper:
  `(i + d + n) % n`.

---

### Task 1: Similar-color preview navigation

**Files:**
- Modify: `src/islands/OsDetail.tsx` (lines 57, ~102, 245, 283-290)
- Test: `src/islands/OsDetail.test.tsx`

**Interfaces:**
- Consumes: `c.similar: SimilarView[]` (already built in `src/lib/detail.ts`);
  `SimilarView` has `{ hex, name, match, onColor, h, s, l, primarySlug, style, platforms }`.
  `FullscreenPreview` props: `{ hex, onColor, style, label, pos, total, onClose, onPrev, onNext }`.
- Produces: no new exported symbols; behavior change only.

- [ ] **Step 1: Extend the test fixture so the default color has two similar colors**

The existing fixture (`src/islands/OsDetail.test.tsx`) gives the default Teal
color a single similar entry, which cannot exercise navigation. Add a second
entry so `c.similar.length === 2`. Replace the Teal color's `similar` array
(currently lines 28-32) with:

```tsx
      similar: [
        {
          hex: "#4e9a9a", name: "Teal", match: 88, onColor: "#ffffff", h: 178, s: 33, l: 44,
          primarySlug: "kde-1", style: "generic",
          platforms: [{ slug: "kde-1", name: "KDE 1", year: 1998, family: "KDE", isDefault: true }],
        },
        {
          hex: "#3a8f8f", name: "Pine", match: 82, onColor: "#ffffff", h: 180, s: 42, l: 40,
          primarySlug: "beos", style: "generic",
          platforms: [{ slug: "beos", name: "BeOS", year: 1998, family: "BeOS", isDefault: true }],
        },
      ],
```

- [ ] **Step 2: Write the failing tests**

Append these tests inside the `describe("OsDetail", ...)` block in
`src/islands/OsDetail.test.tsx` (before its closing `});`). They open the
similar preview, navigate, and assert the panel follows.

```tsx
  it("opens the similar-color preview showing its position in the list", () => {
    render(<OsDetail view={view} initialHex={null} />);
    // Teal is default-selected; expand its first similar (#4e9a9a) and preview it.
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    // The fullscreen must reflect the full similar list, not 1 / 1.
    expect(screen.getByText(/^1 \/ 2$/)).toBeTruthy();
    expect(screen.getByText("Teal · #4e9a9a")).toBeTruthy();
  });

  it("steps through the similar-color list in the fullscreen preview", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next color" }));
    // Fullscreen now shows the second similar color.
    expect(screen.getByText("Pine · #3a8f8f")).toBeTruthy();
    expect(screen.getByText(/^2 \/ 2$/)).toBeTruthy();
  });

  it("wraps to the last similar color when stepping back from the first", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: "Previous color" }));
    expect(screen.getByText("Pine · #3a8f8f")).toBeTruthy();
  });

  it("the expanded panel below follows the preview and stays on close", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next color" }));
    // Panel below now reflects the second color (BeOS platform chip).
    expect((screen.getAllByTestId("infobox-platform")[0] as HTMLAnchorElement).getAttribute("href")).toBe("/os/beos/3a8f8f");
    // Close the fullscreen; the panel stays on the landed color.
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(screen.queryByRole("button", { name: "Next color" })).toBeNull();
    expect((screen.getAllByTestId("infobox-platform")[0] as HTMLAnchorElement).getAttribute("href")).toBe("/os/beos/3a8f8f");
  });
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run src/islands/OsDetail.test.tsx -t "similar-color preview|steps through the similar-color|wraps to the last similar|expanded panel below follows"`
Expected: FAIL — the current code opens the preview with `pos={1} total={1}` and no-op prev/next, so `1 / 2`, the "Next color" navigation, and the panel-follow assertions all fail.

- [ ] **Step 4: Replace the `simPreview` state with a `simFull` boolean**

In `src/islands/OsDetail.tsx`, change line 57 from:

```tsx
  const [simPreview, setSimPreview] = useState<SimilarView | null>(null);
```

to:

```tsx
  const [simFull, setSimFull] = useState(false);
```

(Leave the `SimilarView` import on line 2 — it is still used by `simSheet`.)

- [ ] **Step 5: Add the `stepSim` navigation helper**

Immediately after the existing `step` helper (line 102):

```tsx
  const step = (d: number) => setSel((s) => (s + d + colors.length) % colors.length);

  // Step through the current color's "similar" list inside the fullscreen
  // preview. `simExp` is the single source of truth for the current similar
  // color, so advancing it also makes the expanded panel below follow along.
  const stepSim = (d: number) => {
    const n = c.similar.length;
    if (n === 0) return;
    const i = c.similar.findIndex((x) => x.hex === simExp);
    const next = ((i < 0 ? 0 : i) + d + n) % n;
    setSimExp(c.similar[next].hex);
  };
```

- [ ] **Step 6: Open the fullscreen via `simFull` instead of `simPreview`**

On line 245, change the `onPreview` handler:

```tsx
                    onPreview={() => setSimFull(true)} onDownload={() => setSimSheet(s)} />
```

- [ ] **Step 7: Rewrite the similar-preview render block**

Replace the whole `simPreview` block (lines 283-290) with a block that derives
the current similar color from `simExp`:

```tsx
      {simFull && (() => {
        const idx = c.similar.findIndex((x) => x.hex === simExp);
        const cur = idx >= 0 ? c.similar[idx] : null;
        if (!cur) return null;
        return (
          <FullscreenPreview
            hex={cur.hex} onColor={cur.onColor} style={cur.style}
            label={`${cur.name} · ${cur.hex}`}
            pos={idx + 1} total={c.similar.length}
            onClose={() => setSimFull(false)} onPrev={() => stepSim(-1)} onNext={() => stepSim(1)}
          />
        );
      })()}
```

- [ ] **Step 8: Run the new tests to verify they pass**

Run: `npx vitest run src/islands/OsDetail.test.tsx -t "similar-color preview|steps through the similar-color|wraps to the last similar|expanded panel below follows"`
Expected: PASS (4 passing).

- [ ] **Step 9: Run the full test suite and the type check**

Run: `npm test && npx astro check`
Expected: all tests pass; `astro check` reports no errors. (If `astro check` is
not wired up, run `npx tsc --noEmit` instead.)

- [ ] **Step 10: Commit**

```bash
git add src/islands/OsDetail.tsx src/islands/OsDetail.test.tsx
git commit -m "feat(os-detail): navigate similar colors in fullscreen preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Prev/next steps through `c.similar` in fullscreen → Steps 5, 7; tests in Step 2.
- Reuses existing mechanism (arrow buttons + keys) → uses unmodified
  `FullscreenPreview`; Step 7 wires `onPrev`/`onNext`/`pos`/`total`.
- Panel "follows the preview" and stays on close → `simExp` single source of
  truth (Steps 4-7); test in Step 2 ("expanded panel below follows").
- Edge cases (single similar wraps to self; `simExp` not found guarded) →
  `stepSim` `n === 0` guard + wrap; render guard `cur == null` returns null.
- Download sheet unchanged → Step 6 leaves `onDownload` untouched.

**Placeholder scan:** none — all steps contain full code and exact commands.

**Type consistency:** `simFull: boolean`, `setSimFull`, `stepSim(d: number)`,
and `SimilarView` fields (`hex`, `onColor`, `style`, `name`) match the
definitions in `src/lib/detail.ts` and the `FullscreenPreview` prop names.
