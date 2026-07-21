# Browse "Sort by Newest" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth Browse sort, "New", that orders platforms by the date their entry was added to the archive (newest first), backed by a new required `added` date field on every OS record.

**Architecture:** Follow the existing `content → lib → pages → islands` pipeline. Add a required `added` (`YYYY-MM-DD`) field to the Zod content schema, backfill all 26 existing files from their git first-commit date, thread the field through the `OsView` build-time view model and the `BrowseItem` island prop, and add a reversible "New" sort button to `BrowseControls`.

**Tech Stack:** Astro (SSG) + Preact islands, Zod content schema, Vitest + @testing-library/preact.

## Global Constraints

- `added` is **required** in the schema, format **`YYYY-MM-DD`** (regex `/^\d{4}-\d{2}-\d{2}$/`). A missing/malformed value must fail the build (schema gate).
- `added` means *date added to the archive* — semantically distinct from `year` (OS release year). Do not conflate them.
- ISO date strings sort correctly with lexical (`localeCompare`) comparison — no date parsing in the sort path.
- **New** sort defaults to **newest first**; reversing gives oldest first.
- The baked default Browse page order stays **Popular** (`pages/index.astro`) — do not change it.
- Sort-only: **do not** render the `added` date on cards or list rows.
- `lib/` stays pure (no DOM/Astro/Preact imports). Islands receive data as props only.

---

### Task 1: Add `added` to the content schema and backfill all 26 files

**Files:**
- Modify: `src/content/config.ts` (add field to `osSchema`)
- Modify: `src/content/os/*.json` (×26 — insert `added`)

**Interfaces:**
- Consumes: nothing.
- Produces: `OsInput` (inferred from `osSchema`) gains `added: string`. Every `content/os/*.json` has an `added` `YYYY-MM-DD` value. Consumed by Task 2.

- [ ] **Step 1: Add the required field to the schema**

In `src/content/config.ts`, add `added` immediately after the `year` line in `osSchema`:

```ts
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.number().int(),
  added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  family: z.string().min(1),
```

- [ ] **Step 2: Run the build to verify it now fails (the failing test)**

Run: `npm run build`
Expected: FAIL — Zod content validation errors for the 26 `os/*.json` files, each reporting that `added` is Required.

- [ ] **Step 3: Backfill every file's `added` from its git first-commit date**

Run this from the repo root. It derives each file's add-date from git and inserts a `  "added": "<date>",` line right after that file's `"year": …,` line, preserving all other formatting:

```bash
for f in src/content/os/*.json; do
  d=$(git log --diff-filter=A --follow --format='%as' -1 -- "$f")
  perl -0pi -e 's/^(  "year":\s*-?\d+,)$/$1\n  "added": "'"$d"'",/m' "$f"
done
```

Expected resulting values (verify against this table):

| file | added | file | added |
|------|-------|------|-------|
| amiga-workbench | 2026-07-17 | serenityos | 2026-07-20 |
| amiga-workbench-2-0 | 2026-07-20 | solaris-9 | 2026-07-21 |
| beos | 2026-07-17 | windows-1-0 | 2026-07-20 |
| bleskos | 2026-07-20 | windows-2-0 | 2026-07-20 |
| cde | 2026-07-17 | windows-2000 | 2026-07-17 |
| freegem | 2026-07-20 | windows-3-0 | 2026-07-17 |
| haiku | 2026-07-20 | windows-3-1 | 2026-07-17 |
| kde-1 | 2026-07-17 | windows-95 | 2026-07-17 |
| kde-2 | 2026-07-17 | windows-98 | 2026-07-17 |
| kde-plasma-6 | 2026-07-20 | windows-me | 2026-07-17 |
| mac-os-8 | 2026-07-17 | windows-nt-3-x | 2026-07-20 |
| reactos | 2026-07-20 | windows-nt-4-0 | 2026-07-17 |
| xfce | 2026-07-21 | windows-xp | 2026-07-17 |

- [ ] **Step 4: Verify every file received the field**

Run: `grep -L '"added"' src/content/os/*.json`
Expected: no output (every file matched; none was skipped by the regex). If any file is listed, its `"year"` line has non-standard formatting — add the `"added"` line to it by hand.

- [ ] **Step 5: Run the build to verify it passes**

Run: `npm run build`
Expected: PASS — all pages pre-render; Zod validation passes for all 26 files.

- [ ] **Step 6: Commit**

```bash
git add src/content/config.ts src/content/os/
git commit -m "feat(data): add required 'added' archive date to OS schema, backfill from git"
```

---

### Task 2: Thread `added` through the `OsView` view model

**Files:**
- Modify: `src/lib/catalog.ts` (`OsView` interface + `buildCatalog`)
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `OsInput.added` (Task 1).
- Produces: `OsView` gains `added: string`, populated from `data.added`. Consumed by Task 3.

- [ ] **Step 1: Update the test fixture and write the failing test**

In `src/lib/catalog.test.ts`, add `added` to the `os()` helper defaults and to the `windows-95` entry, then add a test.

Change the `os()` helper (add `added` to the defaults object):

```ts
const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, added: "2000-01-01", family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", ...over,
});
```

Add `added` to the `windows-95` entry (leave `windows-98` on the default):

```ts
  { slug: "windows-95", data: os({ name: "Windows 95", year: 1995, added: "2026-07-17", successor: "windows-98", colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "n", default: true },
    { hex: "#000080", name: "Navy", index: "1", note: "", default: false },
  ] }) },
```

Add this test inside the `describe("buildCatalog", …)` block:

```ts
  it("threads the added archive date onto the OsView", () => {
    expect(cat.bySlug.get("windows-95")!.added).toBe("2026-07-17");
    expect(cat.bySlug.get("windows-98")!.added).toBe("2000-01-01");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog.test.ts -t "threads the added"`
Expected: FAIL — `added` is `undefined` (not yet on `OsView`), so `toBe("2026-07-17")` fails.

- [ ] **Step 3: Add `added` to `OsView` and populate it**

In `src/lib/catalog.ts`, add to the `OsView` interface (after `year`):

```ts
export interface OsView {
  slug: string;
  name: string;
  year: number;
  added: string;
  family: string;
```

And populate it in `buildCatalog`'s `osList` map (add `added: data.added,` in the returned object, after `year: data.year,`):

```ts
    return {
      slug, name: data.name, year: data.year, added: data.added, family: data.family,
      tagline: data.tagline, description: data.description, desktopStyle: data.desktopStyle,
      colors, defaultHex: def.hex.toLowerCase(), colorCount: colors.length,
      score, scoreLabel: formatScore(score),
      predecessor: refOf(data.predecessor, "predecessor", slug),
      successor: refOf(data.successor, "successor", slug),
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "feat(lib): thread 'added' archive date onto OsView"
```

---

### Task 3: Add the "New" sort to Browse and wire the page mapping

**Files:**
- Modify: `src/islands/BrowseControls.tsx` (`BrowseItem` interface, `SortKey`, `SORTS`, `cmp`, `dirWord`)
- Modify: `src/pages/index.astro` (map `added` into `BrowseItem`)
- Test: `src/islands/BrowseControls.test.tsx`

**Interfaces:**
- Consumes: `OsView.added` (Task 2), mapped to `BrowseItem.added`.
- Produces: end-user "New" sort. No further consumers.

- [ ] **Step 1: Update the test fixture and write the failing test**

In `src/islands/BrowseControls.test.tsx`, add `added` to both fixture items — `windows-95` older, `amiga-workbench` newer:

```ts
const items: BrowseItem[] = [
  { slug: "windows-95", name: "Windows 95", year: 1995, added: "2026-07-17", family: "Windows", tagline: "Teal era", defaultHex: "#008080", colorCount: 14, score: 48200, scoreLabel: "48.2k", altColors: [{ hex: "#000080", name: "Navy" }], href: "/os/windows-95", listColors: [{ hex: "#008080", name: "Teal" }, { hex: "#000080", name: "Navy" }] },
  { slug: "amiga-workbench", name: "Amiga Workbench", year: 1985, added: "2026-07-20", family: "Amiga", tagline: "Four-color glory", defaultHex: "#0055aa", colorCount: 5, score: 300, scoreLabel: "< 1k", altColors: [], href: "/os/amiga-workbench", listColors: [{ hex: "#0055aa", name: "Workbench Blue" }] },
];
```

Add this test inside the `describe("BrowseControls", …)` block:

```ts
  it("sorts by newest added first, and reverses to oldest first", () => {
    render(<BrowseControls items={items} />);
    const newBtn = screen.getByRole("button", { name: /New/ });
    fireEvent.click(newBtn); // select → newest first
    let names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench"); // 2026-07-20 is newer than 2026-07-17
    fireEvent.click(newBtn); // click active → reverse → oldest first
    names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Windows 95");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/BrowseControls.test.tsx -t "sorts by newest"`
Expected: FAIL — `getByRole("button", { name: /New/ })` throws because no "New" sort button exists yet.

- [ ] **Step 3: Add `added` to the `BrowseItem` interface**

In `src/islands/BrowseControls.tsx`, add `added` after `year`:

```ts
export interface BrowseItem {
  slug: string;
  name: string;
  year: number;
  added: string;
  family: string;
```

- [ ] **Step 4: Add the `"new"` sort key, button, comparator, and direction word**

Extend `SortKey`:

```ts
type SortKey = "popular" | "year" | "alpha" | "new";
```

Add the button to `SORTS`, after `year` and before `alpha`:

```ts
const SORTS: { key: SortKey; label: string; icon: string; full: string }[] = [
  { key: "popular", label: "Popular", icon: "★", full: "Popularity" },
  { key: "year", label: "Year", icon: "◷", full: "Chronological" },
  { key: "new", label: "New", icon: "✦", full: "Recently added" },
  { key: "alpha", label: "A–Z", icon: "", full: "Alphabetical" },
];
```

Add to the `cmp` map (newest first by default — descending ISO string):

```ts
    const cmp: Record<SortKey, (a: BrowseItem, b: BrowseItem) => number> = {
      popular: (a, b) => b.score - a.score,
      year: (a, b) => a.year - b.year,
      new: (a, b) => b.added.localeCompare(a.added),
      alpha: (a, b) => a.name.localeCompare(b.name),
    };
```

Add to the `dirWord` map:

```ts
  const dirWord: Record<SortKey, string> = {
    popular: rev ? "least first" : "most first",
    year: rev ? "newest first" : "oldest first",
    new: rev ? "oldest first" : "newest first",
    alpha: rev ? "Z → A" : "A → Z",
  };
```

- [ ] **Step 5: Map `added` into `BrowseItem` on the Browse page**

In `src/pages/index.astro`, add `added: o.added,` to the `items` mapping (after `year: o.year,`):

```ts
const items: BrowseItem[] = ordered.map((o) => ({
  slug: o.slug, name: o.name, year: o.year, added: o.added, family: o.family, tagline: o.tagline,
  defaultHex: o.defaultHex, colorCount: o.colorCount, score: o.score, scoreLabel: o.scoreLabel,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/islands/BrowseControls.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 7: Typecheck and full build**

Run: `npm run check && npm run build`
Expected: both PASS — no type errors; every page pre-renders.

- [ ] **Step 8: Commit**

```bash
git add src/islands/BrowseControls.tsx src/islands/BrowseControls.test.tsx src/pages/index.astro
git commit -m "feat(browse): add 'New' sort by archive-added date"
```

---

## Final verification

- [ ] Run the whole suite: `npm test`
- [ ] Confirm `npm run check` and `npm run build` are green.
