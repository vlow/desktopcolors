# Browse — "Sort by newest" (added-to-archive date)

**Date:** 2026-07-21
**Status:** Approved, ready for implementation plan

## Problem

The Browse page (`/`) lets visitors sort platforms by Popularity, release Year, and
A–Z. There is no way to see *what was recently added to the archive*. The existing
Year sort orders by an OS's historical **release year** (e.g. Windows 95 → 1995), so
reversing it surfaces the newest *operating systems*, not the newest *entries on the
site*. These are different axes: a freshly added entry for an old OS should be
discoverable as "new" even though its release year is decades old.

## Goal

Add a fourth Browse sort, **"New"**, that orders platforms by the date their entry was
added to desktopcolors.com — newest first by default. This requires a new
creation-date field on each OS record, threaded from the content schema through the
build-time view models to the Browse island.

## Non-goals

- No change to the existing Popular / Year / A–Z sorts or to the baked default page
  order (which stays Popular).
- No visible rendering of the added date on cards or list rows (sort-only). The card
  face keeps reading `{year} · {family}`.
- No precise release-date field; the integer `year` remains the OS release-year axis.

## Data model

Add a **required** `added` field to the OS schema in `src/content/config.ts`:

```ts
added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
```

- **Semantics:** the date the entry was added to the archive — distinct from `year`
  (OS release year).
- **Required**, so the schema gate forces every new OS file to declare it; a missing or
  malformed value fails the build. This upholds the "`content/config.ts` is the schema
  gate" invariant in `docs/architecture-frontend.md`.
- **Format:** `YYYY-MM-DD` string. ISO date strings sort correctly with lexical
  comparison, so no date parsing is needed in the sort path.

### Backfill for the 26 existing files

Derive each existing file's `added` value from its first-commit date in git:

```bash
git log --diff-filter=A --follow --format='%as' -1 -- src/content/os/<file>.json
```

Write that date into each JSON's `added` field. Files introduced in the same commit
share a date; ties fall back to input order, consistent with how the other sorts break
ties. The backfill is a one-time edit to the 26 content files — no runtime git
dependency.

## Threading through the layers

Following the `content → lib → pages → islands` pipeline:

1. **`src/content/config.ts`** — add `added` to `osSchema` (above). `OsInput` type
   picks it up automatically via `z.infer`.
2. **`src/lib/catalog.ts`** — add `added: string` to the `OsView` interface and
   populate it from `data.added` in `buildCatalog`'s `osList.map`.
3. **`src/pages/index.astro`** — add `added: o.added` to the `BrowseItem` mapping.
4. **`src/islands/BrowseControls.tsx`** — add `added: string` to the `BrowseItem`
   interface and wire the new sort (below).

`OsRef` and the detail/explorer view models are **not** touched — the field is only
needed on the Browse island.

## UI — fourth sort button

In `src/islands/BrowseControls.tsx`:

- Extend `SortKey` to `"popular" | "year" | "alpha" | "new"`.
- Add an entry to `SORTS`: `{ key: "new", label: "New", icon: "✦", full: "Recently added" }`,
  placed **after Year, before A–Z**. (The ✦ glyph is a placeholder for "newly added"
  and may be retuned during implementation; it must stay visually distinct from Year's
  ◷ clock.)
- Add to the `cmp` map: `new: (a, b) => b.added.localeCompare(a.added)` — **newest
  first** by default (descending ISO string).
- Add to `dirWord`: `new: rev ? "oldest first" : "newest first"`.

The existing select/reverse interaction (first click selects with default direction;
clicking the active sort reverses it) applies unchanged to the new button.

## Testing

- **Schema** (`src/content/config.test.ts` if present, else add coverage): `added` is
  required and rejects non-`YYYY-MM-DD` strings.
- **`src/lib/catalog.test.ts`**: `OsView.added` is threaded from the entry data.
- **`src/islands/BrowseControls.test.tsx`**: selecting "New" orders items by `added`
  descending; reversing it flips to ascending.
- **`npm run check`**: TypeScript across the new field and interfaces.
- **`npm run build`**: pre-renders every page, proving all 26 JSON files carry a valid
  `added` value (the schema gate).

## Files touched

| File | Change |
|------|--------|
| `src/content/config.ts` | Add required `added` field to `osSchema` |
| `src/content/os/*.json` (×26) | Backfill `added` from git first-commit date |
| `src/lib/catalog.ts` | Add `added` to `OsView` + populate it |
| `src/pages/index.astro` | Map `added` into `BrowseItem` |
| `src/islands/BrowseControls.tsx` | Add `added` to `BrowseItem`; add "New" sort |
| `src/lib/catalog.test.ts` | Assert `added` threaded |
| `src/islands/BrowseControls.test.tsx` | Assert "New" sort order + reverse |
