# OS Detail Source Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each OS entry an optional provenance note — where its colors were actually obtained — rendered on the detail page as a collapsible panel opened from the References row.

**Architecture:** A new optional `source` field on the OS content schema holds `{ text, links }`, where `text` uses two authoring markers (`[Label]` for a link, backticks for code) and `links` maps every label to a validated URL. One tokenizer in `src/lib/sourceNote.ts` serves two consumers: the Zod schema cross-checks labels against links at build time, and `buildCatalog` parses the note into `SourceNode[]` on `OsView`. The browser therefore receives nodes, never raw text, and no parser ships to the client. On the detail page a `Source ⌄` toggle joins the References row and opens a full-width panel below it; below 760px that toggle collapses into the existing References `<Dropdown>` alongside the links, per **D2**.

**Tech Stack:** Astro (SSG) · Preact islands · Zod (content schema) · Vitest + `@testing-library/preact` · Playwright

**Spec:** [`docs/superpowers/specs/2026-09-01-source-note-design.md`](../specs/2026-09-01-source-note-design.md)

## Global Constraints

- **Two markers, no more.** `[Label]` → link, `` `x` `` → code. No nesting, no escape syntax. An unmatched `[` or backtick is **literal text, never a build error**.
- **Both directions of the label/link cross-check fail the build:** a `[Label]` with no entry in `links`, and a `links` key never cited in `text`.
- **Parsing is build-time only.** `parseSourceNote` must not be imported by any file under `src/islands/`.
- **Every rendered link carries `target="_blank" rel="noopener"`,** applied in exactly one place so an author cannot omit it.
- **Panel is closed by default at every viewport width.**
- **Selecting a different color must not close the panel** — the note is per-OS, not per-color.
- **Styling:** reuse existing tokens from `src/styles/tokens.css`. The panel's ground is a **new** token `--panel-sunken: #fbfaf9`; do not inline that hex. Follow `CLAUDE.md`'s reuse-first rule.
- **Test layer discipline** (`TESTING.md`): pure logic → `lib/` unit; component behaviour and ARIA → island unit; layout/overflow → Playwright only. **Data shape is not a test's job** — the Zod schema is the gate.
- **Docs mirror rule** (`CLAUDE.md`): any change to the field reference in `docs/adding-os-data.md` **must** be applied to `CONTRIBUTING.md` in the same change.

---

### Task 1: The source-note tokenizer and parser

Pure, dependency-free, and the foundation everything else consumes. One tokenizer with two consumers so validation and rendering can never disagree about what counts as a marker.

**Files:**
- Create: `src/lib/sourceNote.ts`
- Test: `src/lib/sourceNote.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type SourceNode = { kind: "text"; value: string } | { kind: "code"; value: string } | { kind: "link"; label: string; url: string }`
  - `export function tokenizeSourceNote(text: string): Token[]`
  - `export function sourceNoteLinkErrors(text: string, links: Record<string, string>): string[]`
  - `export function parseSourceNote(text: string, links: Record<string, string>): SourceNode[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sourceNote.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSourceNote, sourceNoteLinkErrors, tokenizeSourceNote } from "./sourceNote";

const LINKS = {
  "Display Properties": "https://en.wikipedia.org/wiki/Windows_95",
  v86: "https://copy.sh/v86/",
};

describe("tokenizeSourceNote", () => {
  it("returns a single literal run for prose with no markers", () => {
    expect(tokenizeSourceNote("Sampled from a running install.")).toEqual([
      { kind: "text", value: "Sampled from a running install." },
    ]);
  });

  it("returns an empty array for empty text", () => {
    expect(tokenizeSourceNote("")).toEqual([]);
  });

  it("splits a [Label] marker out of the surrounding prose", () => {
    expect(tokenizeSourceNote("run under [v86] here")).toEqual([
      { kind: "text", value: "run under " },
      { kind: "marker", label: "v86" },
      { kind: "text", value: " here" },
    ]);
  });

  it("splits a backtick code span", () => {
    expect(tokenizeSourceNote("the `.theme` files")).toEqual([
      { kind: "text", value: "the " },
      { kind: "code", value: ".theme" },
      { kind: "text", value: " files" },
    ]);
  });

  it("handles adjacent markers with no text between them", () => {
    expect(tokenizeSourceNote("[a][b]")).toEqual([
      { kind: "marker", label: "a" },
      { kind: "marker", label: "b" },
    ]);
  });

  it("treats an unclosed [ as literal text", () => {
    expect(tokenizeSourceNote("a [b c")).toEqual([{ kind: "text", value: "a [b c" }]);
  });

  it("treats an unclosed backtick as literal text", () => {
    expect(tokenizeSourceNote("a `b c")).toEqual([{ kind: "text", value: "a `b c" }]);
  });

  it("treats an empty [] as literal text", () => {
    expect(tokenizeSourceNote("a [] b")).toEqual([{ kind: "text", value: "a [] b" }]);
  });

  it("does not nest: a [ inside a code span stays literal", () => {
    expect(tokenizeSourceNote("`a[b`")).toEqual([{ kind: "code", value: "a[b" }]);
  });

  it("does not nest: a backtick inside a label is part of the label", () => {
    expect(tokenizeSourceNote("[a`b]")).toEqual([{ kind: "marker", label: "a`b" }]);
  });
});

describe("sourceNoteLinkErrors", () => {
  it("reports nothing when every marker resolves and every link is cited", () => {
    expect(sourceNoteLinkErrors("[Display Properties] under [v86]", LINKS)).toEqual([]);
  });

  it("reports nothing for prose with no markers and no links", () => {
    expect(sourceNoteLinkErrors("Read off the shipped disc.", {})).toEqual([]);
  });

  it("names a marker that has no link entry", () => {
    const errs = sourceNoteLinkErrors("under [QEMU]", {});
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("[QEMU]");
  });

  it("names a link entry that is never cited", () => {
    const errs = sourceNoteLinkErrors("plain prose", { v86: "https://copy.sh/v86/" });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("v86");
  });

  it("accepts one link entry cited twice", () => {
    expect(sourceNoteLinkErrors("[v86] and again [v86]", { v86: "https://copy.sh/v86/" })).toEqual([]);
  });

  it("does not treat an unclosed bracket as an uncited marker", () => {
    expect(sourceNoteLinkErrors("a [b c", {})).toEqual([]);
  });
});

describe("parseSourceNote", () => {
  it("maps a marker to a link node carrying its url", () => {
    expect(parseSourceNote("under [v86].", LINKS)).toEqual([
      { kind: "text", value: "under " },
      { kind: "link", label: "v86", url: "https://copy.sh/v86/" },
      { kind: "text", value: "." },
    ]);
  });

  it("maps a backtick span to a code node", () => {
    expect(parseSourceNote("the `.theme` files", {})).toEqual([
      { kind: "text", value: "the " },
      { kind: "code", value: ".theme" },
      { kind: "text", value: " files" },
    ]);
  });

  it("degrades an unresolved marker to literal text rather than throwing", () => {
    expect(parseSourceNote("under [QEMU].", {})).toEqual([
      { kind: "text", value: "under " },
      { kind: "text", value: "[QEMU]" },
      { kind: "text", value: "." },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sourceNote.test.ts`
Expected: FAIL — `Failed to resolve import "./sourceNote"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/sourceNote.ts`:

```ts
// A provenance note's `text` is authored with exactly two markers:
//   [Label]  → a link, its href looked up in the entry's `links` map
//   `code`   → a <code> span
// Everything else is literal. Two markers is the whole language, deliberately —
// a note needing more than links and code is too elaborate for this block.
//
// One tokenizer, two consumers: the Zod schema (via sourceNoteLinkErrors) and
// the view builder (via parseSourceNote). If validation and rendering disagreed
// about what counts as a marker, the build would pass on a note that renders
// wrong — the single failure this module exists to exclude.

export type SourceNode =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; label: string; url: string };

export type Token =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "marker"; label: string };

/**
 * Split `text` into literal runs, code spans and `[Label]` markers.
 *
 * An unclosed `[` or backtick is literal text, not an error: prose contains
 * stray brackets and a build must not fail on one. Markers never nest — the
 * first delimiter opened runs until its own closer, so a `[` inside a code span
 * and a backtick inside a label are both just characters.
 */
export function tokenizeSourceNote(text: string): Token[] {
  const out: Token[] = [];
  let lit = "";
  const flush = () => {
    if (lit) out.push({ kind: "text", value: lit });
    lit = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[" || ch === "`") {
      const close = text.indexOf(ch === "[" ? "]" : "`", i + 1);
      // close === i + 1 is an empty marker ("[]" / "``"); leave it literal.
      if (close > i + 1) {
        flush();
        const inner = text.slice(i + 1, close);
        out.push(ch === "[" ? { kind: "marker", label: inner } : { kind: "code", value: inner });
        i = close;
        continue;
      }
    }
    lit += ch;
  }
  flush();
  return out;
}

/** Distinct `[Label]`s in `text`, in first-occurrence order. */
function markersOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokenizeSourceNote(text)) {
    if (t.kind === "marker" && !seen.has(t.label)) {
      seen.add(t.label);
      out.push(t.label);
    }
  }
  return out;
}

/**
 * Build-time cross-check between a note's markers and its link map. Returns one
 * message per problem, empty when the note is sound.
 *
 * Both directions matter. An uncited marker renders as literal brackets, which
 * nobody catches in review; an unused link entry is dead data, usually a rename.
 */
export function sourceNoteLinkErrors(text: string, links: Record<string, string>): string[] {
  const markers = markersOf(text);
  const cited = new Set(markers);
  const errs: string[] = [];
  for (const label of markers) {
    if (!(label in links)) errs.push(`source note cites [${label}] but "links" has no such entry`);
  }
  for (const key of Object.keys(links)) {
    if (!cited.has(key)) errs.push(`source note "links" entry "${key}" is never cited as [${key}] in "text"`);
  }
  return errs;
}

/**
 * Parse a note into render-ready nodes.
 *
 * Total by construction: an unresolved marker degrades to literal text rather
 * than throwing. Unreachable in practice — the schema rejects it first — but a
 * pure function that cannot fail is easier to test and cannot take a build down.
 */
export function parseSourceNote(text: string, links: Record<string, string>): SourceNode[] {
  return tokenizeSourceNote(text).map((t): SourceNode => {
    if (t.kind !== "marker") return t;
    const url = links[t.label];
    return url === undefined
      ? { kind: "text", value: `[${t.label}]` }
      : { kind: "link", label: t.label, url };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/sourceNote.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sourceNote.ts src/lib/sourceNote.test.ts
git commit -m "(source note) tokenizer, link validator and parser"
```

---

### Task 2: Schema field and `OsView.source`

Wires the field from JSON to the view. The schema itself cannot be unit-tested — `src/content/config.ts` imports `astro:content`, which is why `src/content/os.test.ts` mirrors the schema rather than importing it — so the build-time guard is verified by watching it fail on a deliberately broken entry (**T4** in `TESTING.md`: watch the guard fail, on the path it will run). The parse-into-`OsView` half is covered by a normal unit test.

**Files:**
- Modify: `src/content/config.ts`
- Modify: `src/lib/catalog.ts:32-54` (the `OsView` interface) and `src/lib/catalog.ts:99-114` (the `osList` map)
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `parseSourceNote`, `sourceNoteLinkErrors`, `SourceNode` from Task 1.
- Produces:
  - `OsInput["source"]`, typed `{ text: string; links: Record<string, string> } | undefined`
  - `OsView.source?: SourceNode[]`

- [ ] **Step 1: Write the failing test**

Append to the `describe("buildCatalog", …)` block in `src/lib/catalog.test.ts`:

```ts
  it("parses an entry's source note into nodes on the view", () => {
    const withSource: OsEntry[] = [
      { slug: "beos", data: os({
        name: "BeOS",
        colors: [{ hex: "#336698", name: "Steel Blue", note: "", default: true }],
        source: {
          text: "Taken from the constants in the [Haiku source tree] (`InterfaceDefs.h`).",
          links: { "Haiku source tree": "https://github.com/haiku/haiku" },
        },
      }) },
    ];
    const view = buildCatalog(withSource, parseScores({ colors: {}, os: {} })).bySlug.get("beos")!;
    expect(view.source).toEqual([
      { kind: "text", value: "Taken from the constants in the " },
      { kind: "link", label: "Haiku source tree", url: "https://github.com/haiku/haiku" },
      { kind: "text", value: " (" },
      { kind: "code", value: "InterfaceDefs.h" },
      { kind: "text", value: ")." },
    ]);
  });

  it("leaves source undefined for an entry without a note", () => {
    expect(cat.bySlug.get("windows-95")!.source).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: FAIL — TypeScript rejects `source` as an unknown property of `OsInput`, and `view.source` is not a property of `OsView`.

- [ ] **Step 3: Add the schema field**

In `src/content/config.ts`, add the import at the top, beside the existing `DESKTOP_STYLES` import:

```ts
import { sourceNoteLinkErrors } from "../lib/sourceNote";
```

Then add this above `const osSchema = z.object({`:

```ts
// A provenance note: where this entry's colors were actually obtained, as
// opposed to `links`, which say where to read more about the platform. `text`
// is authored with two markers — [Label] for a link, `x` for code — and every
// [Label] must resolve in `links`. Stored structured rather than as HTML: the
// site is static, so content is baked into every visitor's page at build time.
// See docs/adding-os-data.md.
const osSource = z
  .object({
    text: z.string().min(1),
    links: z.record(z.string().min(1), z.string().url()).default({}),
  })
  .superRefine((val, ctx) => {
    // Both directions: an uncited marker renders as literal brackets and nobody
    // notices; an unused link entry is dead data. Fail the build on either.
    for (const message of sourceNoteLinkErrors(val.text, val.links)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
```

And add the field to `osSchema`, directly after the `wikipedia` line:

```ts
  source: osSource.optional(),
```

- [ ] **Step 4: Add `source` to `OsView` and populate it**

In `src/lib/catalog.ts`, extend the `derive` import line to also pull the parser — add a new import beneath the existing `desktopStyle` type import:

```ts
import { parseSourceNote, type SourceNode } from "./sourceNote";
```

In the `OsView` interface, add after the `wikipedia?: string;` line:

```ts
  // Provenance note, parsed at build time so the browser receives nodes and the
  // parser never ships to it. Absent when the entry has no note.
  source?: SourceNode[];
```

In the `osList` map's returned object, add after the `type, project, links, wikipedia` line:

```ts
      source: data.source ? parseSourceNote(data.source.text, data.source.links) : undefined,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/catalog.test.ts && npm run check`
Expected: PASS, and `astro check` reports no errors.

- [ ] **Step 6: Watch the build-time guard fail on the path it will run**

This is the only way to confirm the `superRefine` is actually wired into the collection schema. Create a deliberately broken entry:

```bash
cat > src/content/os/zzz-temp-broken.json <<'JSON'
{
  "name": "Temp Broken", "year": 2000, "added": "2000-01-01", "family": "Windows",
  "colors": [{ "hex": "#000000", "name": "Black" }],
  "source": { "text": "run under [QEMU]", "links": {} }
}
JSON
npm run build
```

Expected: the build **fails** with `source note cites [QEMU] but "links" has no such entry`.

Now check the other direction:

```bash
cat > src/content/os/zzz-temp-broken.json <<'JSON'
{
  "name": "Temp Broken", "year": 2000, "added": "2000-01-01", "family": "Windows",
  "colors": [{ "hex": "#000000", "name": "Black" }],
  "source": { "text": "plain prose", "links": { "v86": "https://copy.sh/v86/" } }
}
JSON
npm run build
```

Expected: the build **fails** with `source note "links" entry "v86" is never cited as [v86] in "text"`.

Record both messages verbatim — Task 7 puts them in `CONTRIBUTING.md`'s schema-failure table. Then remove the file:

```bash
rm src/content/os/zzz-temp-broken.json
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/content/config.ts src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "(source note) optional source field, parsed into OsView"
```

---

### Task 3: The `SourceNote` rendering island

A leaf component with one job: nodes in, elements out. It is the single place `rel="noopener"` is applied, which is the whole reason links go through it rather than being spelled out at each call site.

**Files:**
- Create: `src/islands/SourceNote.tsx`
- Test: `src/islands/SourceNote.test.tsx`

**Interfaces:**
- Consumes: `SourceNode` from Task 1.
- Produces: `export function SourceNote({ nodes }: { nodes: SourceNode[] }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `src/islands/SourceNote.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { SourceNote } from "./SourceNote";
import type { SourceNode } from "../lib/sourceNote";

describe("SourceNote", () => {
  it("renders literal text", () => {
    render(<SourceNote nodes={[{ kind: "text", value: "Sampled from a disc." }]} />);
    expect(screen.getByText("Sampled from a disc.")).toBeTruthy();
  });

  it("renders a link node as an anchor that cannot leak the opener", () => {
    const nodes: SourceNode[] = [{ kind: "link", label: "v86", url: "https://copy.sh/v86/" }];
    render(<SourceNote nodes={nodes} />);
    const a = screen.getByRole("link", { name: "v86" });
    expect(a).toHaveAttribute("href", "https://copy.sh/v86/");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener");
  });

  it("renders a code node as a <code> element", () => {
    render(<SourceNote nodes={[{ kind: "code", value: ".theme" }]} />);
    expect(screen.getByText(".theme").tagName).toBe("CODE");
  });

  it("renders mixed nodes in order", () => {
    const nodes: SourceNode[] = [
      { kind: "text", value: "under " },
      { kind: "link", label: "v86", url: "https://copy.sh/v86/" },
      { kind: "text", value: ", against " },
      { kind: "code", value: ".theme" },
    ];
    const { container } = render(<SourceNote nodes={nodes} />);
    expect(container.textContent).toBe("under v86, against .theme");
  });

  it("renders nothing for an empty node list", () => {
    const { container } = render(<SourceNote nodes={[]} />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/SourceNote.test.tsx`
Expected: FAIL — `Failed to resolve import "./SourceNote"`.

- [ ] **Step 3: Write the implementation**

Create `src/islands/SourceNote.tsx`:

```tsx
import type { SourceNode } from "../lib/sourceNote";

// Renders a parsed provenance note. Nodes arrive already parsed from the build
// (see src/lib/sourceNote.ts), so no parsing happens in the browser.
//
// Every anchor gets target/rel here and only here: an author writes a [Label]
// and a URL, never an element, so there is no call site that can forget them.
export function SourceNote({ nodes }: { nodes: SourceNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === "link") {
          return (
            <a key={i} href={n.url} target="_blank" rel="noopener" style="color: var(--accent-strong);">
              {n.label}
            </a>
          );
        }
        if (n.kind === "code") {
          return <code key={i} style="font: 400 12px var(--font-mono);">{n.value}</code>;
        }
        return <span key={i}>{n.value}</span>;
      })}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/islands/SourceNote.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/islands/SourceNote.tsx src/islands/SourceNote.test.tsx
git commit -m "(source note) SourceNote island renders parsed nodes"
```

---

### Task 4: Wide-viewport toggle and panel

The visible feature at ≥760px. Also seeds the first real note so there is something to look at, and adds the `--panel-sunken` token.

**Files:**
- Modify: `src/styles/tokens.css:3-24` (the `:root` token block)
- Modify: `src/islands/OsDetail.tsx` — state near the other `useState` calls (`:63-72`), the `refs-inline` block (`:184-192`), and the top-row container (`:180`)
- Modify: `src/content/os/windows-95.json`
- Test: `src/islands/OsDetail.test.tsx`

**Interfaces:**
- Consumes: `SourceNote` from Task 3; `OsView.source` from Task 2.
- Produces: DOM contract the mobile task and the E2E task both rely on —
  - `data-testid="detail-top-row"` on the back-link/references flex row
  - `data-testid="source-toggle"` on the inline pill, `id="source-note-panel"` on the panel, `data-testid="source-panel"` on the panel
  - `const [srcOpen, setSrcOpen] = useState(false)` in `OsDetail`, shared by both viewports

- [ ] **Step 1: Write the failing test**

Add to `src/islands/OsDetail.test.tsx`. First extend the imports at the top of the file so `within` is available:

```ts
import { render, screen, fireEvent, within } from "@testing-library/preact";
```

Then add this `describe` block at the end of the file:

```tsx
describe("OsDetail source note", () => {
  const withSource: OsView = {
    ...os,
    source: [
      { kind: "text", value: "Sampled under " },
      { kind: "link", label: "v86", url: "https://copy.sh/v86/" },
      { kind: "text", value: "." },
    ],
  };

  const renderWith = (o: OsView) =>
    render(<OsDetail os={o} eraPeers={eraPeers} detailsByHex={detailsByHex} />);

  it("shows a collapsed Source toggle in the inline references row", () => {
    renderWith(withSource);
    const toggle = within(screen.getByTestId("refs-inline")).getByTestId("source-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "source-note-panel");
    expect(screen.queryByTestId("source-panel")).toBeNull();
  });

  it("opens the panel when the inline toggle is clicked", () => {
    renderWith(withSource);
    fireEvent.click(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle"));
    expect(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle"))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("source-panel").textContent).toContain("Sampled under v86.");
  });

  it("closes the panel when the toggle is clicked again", () => {
    renderWith(withSource);
    const toggle = () => within(screen.getByTestId("refs-inline")).getByTestId("source-toggle");
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.queryByTestId("source-panel")).toBeNull();
  });

  it("keeps the panel open when a different color is selected", () => {
    renderWith(withSource);
    fireEvent.click(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle"));
    fireEvent.click(screen.getByTestId("color-row-000080"));
    expect(screen.getByTestId("source-panel")).toBeTruthy();
  });

  it("renders no toggle and no panel for an entry without a note", () => {
    renderWith(os);
    expect(screen.queryByTestId("source-toggle")).toBeNull();
    expect(screen.queryByTestId("source-panel")).toBeNull();
  });

  it("renders the references row for an entry with a note but no links", () => {
    renderWith({ ...withSource, project: undefined, links: [], wikipedia: undefined });
    expect(screen.getByTestId("refs-inline")).toBeTruthy();
    expect(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/OsDetail.test.tsx`
Expected: FAIL — six failures in the new block, each `Unable to find an element by: [data-testid="source-toggle"]` or `[data-testid="refs-inline"]`. `OsView.source` already type-checks; Task 2 added it.

- [ ] **Step 3: Add the token**

In `src/styles/tokens.css`, add inside `:root`, directly after the `--panel: #ffffff;` line:

```css
  /* A recessed surface: sits on --bg but reads a shade lighter, for inset
     panels that are part of the page rather than a card floating above it.
     First use: the OS detail source note (DESIGN.md D7). */
  --panel-sunken: #fbfaf9;
```

- [ ] **Step 4: Add the state, the toggle and the panel**

In `src/islands/OsDetail.tsx`:

Add the import beside the other island imports:

```ts
import { SourceNote } from "./SourceNote";
```

Add a style constant beside `REF_LINK` and `STEP_CARD` at the top of the file:

```ts
// The Source toggle takes its neighbours' pill vocabulary (REF_LINK) but is a
// button, not a link — it discloses in-page content rather than navigating, so
// it carries a chevron where the reference pills carry ↗.
const SRC_TOGGLE = `${REF_LINK} cursor: pointer;`;
```

Add the state beside the other `useState` calls:

```ts
  // Open/closed state for the provenance panel. Owned here, not in either
  // toolbar variant, so the inline pill and the mobile dropdown item cannot
  // disagree about whether the note is open. Deliberately NOT reset when `sel`
  // changes: the note is per-OS, not per-color.
  const [srcOpen, setSrcOpen] = useState(false);
```

Change the refs gate so a note alone is enough to render the row. Replace `{refs.length > 0 && (` with:

```tsx
      {(refs.length > 0 || os.source) && (
```

Add `data-testid="detail-top-row"` to the flex container that holds the back link and the references block (the `<div>` opening the return, currently `style="display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px 18px;"`).

Inside the `refs-inline` div, after the `{refs.map(…)}` expression, add:

```tsx
              {os.source && (
                <button
                  type="button"
                  data-testid="source-toggle"
                  aria-expanded={srcOpen}
                  aria-controls="source-note-panel"
                  onClick={() => setSrcOpen((v) => !v)}
                  style={SRC_TOGGLE}
                >
                  Source <span style="opacity: 0.5;">{srcOpen ? "⌃" : "⌄"}</span>
                </button>
              )}
```

Immediately after the closing `</>` of the refs fragment and its `)}`, and **before** the `dc-page-eyebrow` div, add the panel:

```tsx
      {os.source && srcOpen && (
        <div
          id="source-note-panel"
          data-testid="source-panel"
          style="margin-top: 12px; border: 1px solid var(--card-border); border-radius: 11px; background: var(--panel-sunken); padding: 14px 16px; font: 400 13px/1.65 var(--font-ui); color: var(--muted); text-wrap: pretty;"
        >
          <SourceNote nodes={os.source} />
        </div>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/islands/OsDetail.test.tsx && npm run check`
Expected: PASS, no type errors.

- [ ] **Step 6: Seed the first real note**

Add to `src/content/os/windows-95.json`, after the `"description"` line. This is the copy from the design reference's `sources.js`, converted to the marker syntax:

```json
  "source": {
    "text": "Swatch values were sampled from the 48-cell basic palette in the [Display Properties] color dialog, running under [v86], and cross-checked against the shipped `.theme` files on the Plus! disc. Theme attributions follow [Microsoft Plus! for Windows 95].",
    "links": {
      "Display Properties": "https://en.wikipedia.org/wiki/Windows_95",
      "v86": "https://copy.sh/v86/",
      "Microsoft Plus! for Windows 95": "https://en.wikipedia.org/wiki/Microsoft_Plus!"
    }
  },
```

This is the only entry seeded here; the rest gain notes as their research is written up (see the spec's *Out of scope*).

- [ ] **Step 7: Verify it in a browser**

Run: `npm run dev`, open `http://localhost:4321/os/windows-95` at a window wider than 760px.
Expected: a `Source ⌄` pill sits after the Wikipedia pill; clicking it opens a panel spanning the page width above the `Windows · 1995` eyebrow, with **Display Properties**, **v86** and **Microsoft Plus! for Windows 95** as links and `.theme` in mono. Clicking a swatch in *All colors* leaves the panel open.

- [ ] **Step 8: Commit**

```bash
git add src/styles/tokens.css src/islands/OsDetail.tsx src/islands/OsDetail.test.tsx src/content/os/windows-95.json
git commit -m "(source note) Source toggle and panel on the detail page"
```

---

### Task 5: Mobile — the toggle collapses into the References dropdown

Below 760px the References row is already a `<Dropdown>` (**D2**). The Source toggle joins it as the last item, under a divider, and shares the panel state from Task 4.

**Files:**
- Modify: `src/islands/OsDetail.tsx` — the `refs-menu` block (`:193-227`)
- Test: `src/islands/OsDetail.test.tsx`

**Interfaces:**
- Consumes: `srcOpen` / `setSrcOpen` and the `source-panel` testid from Task 4.
- Produces: `data-testid="source-menu-item"` on the dropdown's Source row.

- [ ] **Step 1: Write the failing test**

Add to the `describe("OsDetail source note", …)` block from Task 4:

```tsx
  const openMenu = () =>
    fireEvent.click(within(screen.getByTestId("refs-menu")).getByRole("button"));

  it("names the source in the dropdown trigger's accessible name", () => {
    renderWith(withSource);
    const trigger = within(screen.getByTestId("refs-menu")).getByRole("button");
    expect(trigger.getAttribute("aria-label")).toContain("source");
  });

  it("offers Source as the last item in the references menu", () => {
    renderWith(withSource);
    openMenu();
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveAttribute("data-testid", "source-menu-item");
  });

  it("opens the panel and closes the menu when the Source item is chosen", () => {
    renderWith(withSource);
    openMenu();
    fireEvent.click(screen.getByTestId("source-menu-item"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("source-panel").textContent).toContain("Sampled under v86.");
  });

  it("offers no Source item for an entry without a note", () => {
    renderWith(os);
    openMenu();
    expect(screen.queryByTestId("source-menu-item")).toBeNull();
  });
});
```

Note: this replaces the closing `});` of the Task 4 block — the new tests go **inside** it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/islands/OsDetail.test.tsx`
Expected: FAIL — no `source-menu-item`, and the trigger's `aria-label` does not mention the source.

- [ ] **Step 3: Extend the dropdown**

In `src/islands/OsDetail.tsx`, replace the `<Dropdown …>` opening tag's `ariaLabel` with one that names both parts:

```tsx
                ariaLabel={`References: ${refs.length} ${refs.length === 1 ? "link" : "links"}${os.source ? ", and the source note" : ""}`}
```

Then, inside the `{(close) => …}` children, wrap the existing `refs.map(…)` and append the Source row. Replace the whole children expression with:

```tsx
                {(close) => (
                  <>
                    {refs.map((ref) => (
                      <a
                        key={ref.url}
                        role="menuitem"
                        class="dc-menu-item"
                        href={ref.url}
                        target="_blank"
                        rel="noopener"
                        style="text-decoration: none;"
                        onClick={close}
                      >
                        {ref.icon} {ref.label}
                        <span style="margin-left: auto; opacity: 0.5;">↗</span>
                      </a>
                    ))}
                    {/* Provenance is a different kind of thing from the links
                        above it — it discloses in-page content rather than
                        navigating — so it sits last, behind a rule, and carries
                        a chevron instead of ↗. */}
                    {os.source && (
                      <>
                        {refs.length > 0 && (
                          <hr class="dc-rule" style="margin: 6px 4px;" />
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          data-testid="source-menu-item"
                          class="dc-menu-item"
                          aria-expanded={srcOpen}
                          aria-controls="source-note-panel"
                          onClick={() => { setSrcOpen((v) => !v); close(); }}
                        >
                          Source
                          <span style="margin-left: auto; opacity: 0.5;">{srcOpen ? "⌃" : "⌄"}</span>
                        </button>
                      </>
                    )}
                  </>
                )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/islands/OsDetail.test.tsx && npm run check`
Expected: PASS, no type errors.

- [ ] **Step 5: Verify it in a browser**

Run: `npm run dev`, open `http://localhost:4321/os/windows-95`, and narrow the window below 760px.
Expected: the `Source ⌄` pill disappears from the row; the `REFERENCES 1 ▾` trigger opens a menu with Wikipedia, a rule, then Source; tapping Source closes the menu and opens the panel directly beneath the row. The back link and the trigger stay on one line.

- [ ] **Step 6: Commit**

```bash
git add src/islands/OsDetail.tsx src/islands/OsDetail.test.tsx
git commit -m "(source note) collapse the Source toggle into the references dropdown"
```

---

### Task 6: E2E — the narrow-viewport layout claim

One case, for the one thing jsdom cannot see (**T1**): that the `dc-desktop-only` / `dc-mobile-only` CSS actually applies at 390px, and that adding the toggle did not wrap the top row onto a second line — the exact failure **D2** exists to prevent.

**Files:**
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `detail-top-row`, `refs-inline`, `refs-menu`, `source-menu-item`, `source-panel` testids from Tasks 4 and 5; the seeded `windows-95` note from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `e2e/smoke.spec.ts`, following the file's existing conventions (it already has a 390px case at `:133` to copy the viewport idiom from, and every island-driving test awaits the hydration helper defined at the top of the file):

```ts
test("the source note collapses into the references menu on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/os/windows-95");
  await islandsHydrated(page);

  // The inline pill is CSS-hidden; the dropdown takes its place. Both are in the
  // DOM either way — that is the D2 no-hydration-flash trick — so visibility,
  // not presence, is the claim.
  await expect(page.getByTestId("refs-inline")).toBeHidden();
  await expect(page.getByTestId("refs-menu")).toBeVisible();

  const rowBefore = (await page.getByTestId("detail-top-row").boundingBox())!;
  const trigger = (await page.getByTestId("refs-menu").boundingBox())!;
  // One line: the row is no taller than its tallest control, plus slack.
  expect(rowBefore.height).toBeLessThan(trigger.height * 1.6);

  await page.getByTestId("refs-menu").getByRole("button").click();
  await page.getByTestId("source-menu-item").click();

  await expect(page.getByTestId("source-panel")).toBeVisible();
  await expect(page.getByTestId("source-panel")).toContainText(".theme");

  // Opening the panel must not have wrapped the row it hangs beneath.
  const rowAfter = (await page.getByTestId("detail-top-row").boundingBox())!;
  expect(rowAfter.height).toBeCloseTo(rowBefore.height, 0);
});
```

`islandsHydrated` is the file's existing hydration gate (`e2e/smoke.spec.ts:50`). Every test that drives an island must await it first — `page.goto()` resolves on `load`, and an interaction landing before Preact mounts is silently dropped (**T2**).

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `npm run test:e2e -- -g "source note collapses"`

If Tasks 4 and 5 are complete this passes on the first run. To confirm the test is not vacuous (**T4**), temporarily delete the `{os.source && (` guard around the dropdown's Source row so the item never renders, re-run, and watch it fail on `source-menu-item`. Restore the guard.

- [ ] **Step 3: Run the whole suite**

Run: `npm test && npm run test:e2e && npm run check`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "(source note) e2e: the toggle collapses into the menu at 390px"
```

---

### Task 7: Documentation

Four files. Two of them are bound by `CLAUDE.md`'s bidirectional mirror rule, so they change together or they drift. One paragraph in `docs/adding-os-data.md` currently tells authors the **opposite** of what this feature establishes and must be corrected.

**Files:**
- Modify: `DESIGN.md` (append after D6, which ends at `:340`)
- Modify: `docs/adding-os-data.md:40-51` (field table), after `:78` (new section), and `:96-98` (the contradicting sentence)
- Modify: `CONTRIBUTING.md:91-105` (field table), after `:126` (new section), and the schema-failure table at `:474-480`
- Modify: `docs/researching-desktop-colors.md` (pointer at the end)

**Interfaces:**
- Consumes: the two verbatim error messages recorded in Task 2 Step 6.
- Produces: nothing.

- [ ] **Step 1: Add decision D7 to `DESIGN.md`**

Append at the end of the file, following the template at `DESIGN.md:44-51`:

```markdown
### D7 — Source note (`source` field + References-row toggle): say where the colors came from

- **Element** — an optional per-entry provenance note. A `Source ⌄` toggle in the
  detail page's References row (`src/islands/OsDetail.tsx`) opens a full-width
  panel below the whole top row, on `--panel-sunken`. Below 760px the toggle
  collapses into the References `<Dropdown>` as its last item (**D2**).

- **Purpose (UX)** — the page states colors as fact. This is where a reader who
  wants to know *how we know* finds out: which emulator, which shipped file,
  which source tree. It is distinct from the References links, which say where to
  read more about the **platform**, not where these **values** came from.

- **Use it when** — an entry's colors were derived from something citable: a
  running system, a source tree, a shipped theme file, a disc.

- **Don't use it when** — the reasoning justifies the *edit* rather than the
  data ("why I picked this swatch name"). That belongs in the pull request. And
  never for per-color provenance — the field is per platform; a single color's
  origin inside the OS goes in its `note`.

- **How**
  - Content: `source: { text, links }` in the entry's JSON. `text` takes two
    markers — `[Label]` for a link, backticks for code — and every `[Label]`
    must resolve in `links` or the build fails. See
    [`docs/adding-os-data.md`](docs/adding-os-data.md).
  - Parsed at build time by `src/lib/sourceNote.ts` into `OsView.source`;
    `src/islands/SourceNote.tsx` renders the nodes and is the only place
    `rel="noopener"` is applied.
  - **Closed by default at every width.** Provenance is sought, not served.
  - **Not reset when the selected color changes** — the note is per-OS.

- **Why this way** — three alternatives were weighed (see the
  [design spec](docs/superpowers/specs/2026-09-01-source-note-design.md)). Folding
  the toggle into the References row keeps everything about *where this data comes
  from* in one strip, and lets the mobile treatment be **D2** unchanged rather than
  a new pattern: a chip beside the burger wraps the top row to two lines at 390px,
  and relocating the note under the description on mobile only would be the site's
  first per-viewport **relocation**, which a secondary block does not earn.

  The note is stored as text plus a validated link map rather than as an HTML
  string, as the design reference had it. The site is static, so content is baked
  into every visitor's page at build time and a merged content PR is the threat
  model. The structured shape also buys the label/link cross-check, which an HTML
  string cannot.
```

- [ ] **Step 2: Update `docs/adding-os-data.md`**

Add a row to the field table, after the `links` row at `:50`:

```markdown
| `source` | — | `{ "text", "links" }` — where these colors came from. See [The source note](#the-source-note). |
```

Add a new section after the *Reference links* section (i.e. before `### The prose fields` at `:74`):

```markdown
### The source note

`source` records **where the values in this file were actually obtained** — the
emulator, the source tree, the shipped file. It is not the same job as `links`,
which point at background reading about the platform. It renders on the detail
page as a panel behind a `Source` toggle in the References row, closed by default.

```json
"source": {
  "text": "Sampled from the 48-cell basic palette in the [Display Properties] color dialog under [v86], cross-checked against the shipped `.theme` files.",
  "links": {
    "Display Properties": "https://en.wikipedia.org/wiki/Windows_95",
    "v86": "https://copy.sh/v86/"
  }
}
```

`text` takes exactly two markers:

| marker | renders as |
|--------|-----------|
| `[Label]` | a link, labelled `Label`, whose URL is `links["Label"]` |
| `` `x` `` | inline mono, for filenames and identifiers |

Everything else is literal, including an unmatched `[` or backtick — prose with a
stray bracket is fine and will not fail the build. Markers do not nest, and there
is no escape syntax.

The schema cross-checks the two halves **in both directions**, so both of these
fail the build:

- a `[Label]` with no matching key in `links` — it would otherwise render as
  literal brackets, which nobody notices in review;
- a key in `links` never cited in `text` — dead data, usually left behind by a
  rename.

Keep the note to a couple of sentences, and cite the specific artefact rather than
the general one: *the shipped `.theme` files on the Plus! disc* is useful, *the
internet* is not. The field is optional and most entries do not have one yet; add
one when you have done the research to back it.
```

Now fix the contradiction. In *The prose fields* at `:96-98`, the last bullet currently reads:

> - Keep it to a sentence. Reasoning that justifies the *edit* — why you chose a swatch
>   name, how you weighted a dither, what source you read — goes in the pull request,
>   where the reviewer reads it, not in the file.

Replace it with:

```markdown
- Keep it to a sentence. Reasoning that justifies the *edit* — why you chose a swatch
  name, how you weighted a dither — goes in the pull request, where the reviewer reads
  it, not in the file. **What source you read** is the exception: that belongs in the
  entry's [`source`](#the-source-note) note, which exists to publish it.
```

- [ ] **Step 3: Mirror into `CONTRIBUTING.md`**

`CLAUDE.md` requires this in the same change. Add the field-table row after the `links` row at `:105`:

```markdown
| `source` | no | `{ "text", "links" }` — where these colors came from. See [The source note](#the-source-note). |
```

Add the same `### The source note` section written in Step 2 after the *Reference links* section (before `#### The prose fields` at `:127`), demoted one heading level to `#### The source note` to match this file's nesting.

Apply the same correction to this file's *prose fields* bullet about what belongs in the pull request.

Add both build-failure messages — verbatim, as recorded in Task 2 Step 6 — to the hand-written-message table at `:474-480`:

```markdown
| `source note cites [X] but "links" has no such entry` | a `[X]` in `source.text` has no matching key in `source.links` |
| `source note "links" entry "X" is never cited as [X] in "text"` | `source.links` has a key that `source.text` never uses |
```

- [ ] **Step 4: Point `docs/researching-desktop-colors.md` at the field**

That guide is about deriving colors from a system's own source and history; it now has somewhere for its output to land. Append to the end of the file:

```markdown
## Publishing what you found

The research above has a home in the entry itself. `source` is an optional
per-platform note — the emulator you ran, the source file you read, the disc you
pulled the themes off — rendered on the detail page behind a `Source` toggle. Write
it as you finish the research, while you still remember which file you read.

Field reference and marker syntax: [`adding-os-data.md`](adding-os-data.md#the-source-note).
```

- [ ] **Step 5: Verify the docs**

Run: `npm run build`
Expected: succeeds.

Then check by eye that the two mirrored sections match:

```bash
diff <(sed -n '/^### The source note/,/^#\{1,4\} /p' docs/adding-os-data.md) \
     <(sed -n '/^#### The source note/,/^#\{1,4\} /p' CONTRIBUTING.md)
```

Expected: only the heading level differs.

- [ ] **Step 6: Commit**

```bash
git add DESIGN.md docs/adding-os-data.md CONTRIBUTING.md docs/researching-desktop-colors.md
git commit -m "(docs) D7 source note, field reference, and the mirror in CONTRIBUTING"
```

---

## Final verification

- [ ] `npm test` — all unit suites pass
- [ ] `npm run test:e2e` — all Playwright specs pass
- [ ] `npm run check` — `astro check` reports no errors
- [ ] `npm run build` — succeeds, including all content entries
- [ ] `grep -rn "parseSourceNote\|tokenizeSourceNote" src/islands/` returns **nothing** — the parser must not ship to the browser
- [ ] `grep -rn "dangerouslySetInnerHTML" src/` returns **nothing**
- [ ] `grep -rn "#fbfaf9" src/ --include=*.tsx --include=*.astro` returns **nothing** — the panel ground is `var(--panel-sunken)`

## Notes for the implementer

- **`src/content/os.test.ts` needs no change.** Its schema is a deliberate partial mirror (it already omits `project`, `type` and `wikipedia`), and Zod strips unknown keys, so a `source` key in a content file parses there without complaint.
- **`src/content/config.ts` cannot be unit-tested** — it imports `astro:content`, which does not resolve under Vitest. That is why Task 2 verifies the guard by watching a real build fail. Do not try to import the schema into a test.
- **`OsInput` is `z.infer`, i.e. the schema's *output* type.** Because `links` carries `.default({})`, a `source` object constructed in a test must supply `links` explicitly, even when empty.
- **Both toolbar variants are always in the DOM** (the **D2** no-hydration-flash trick), so a bare `getByTestId("source-toggle")` in an island test can match the inline pill while you meant the menu item, or vice versa. Scope every query with `within(screen.getByTestId("refs-inline"))` or `within(screen.getByTestId("refs-menu"))`.
