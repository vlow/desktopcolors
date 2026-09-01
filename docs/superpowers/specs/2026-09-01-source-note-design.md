# OS detail source note — design

**Date:** 2026-09-01
**Status:** approved, ready for implementation planning

## Problem

The OS detail page states colors as fact. `#008080` is Windows 95 Teal; the page gives
no way to ask *how we know that*.

The repository takes provenance seriously —
[`docs/researching-desktop-colors.md`](../../researching-desktop-colors.md) is an entire
guide on deriving an entry's colors from a system's own source and version history,
distinguishing palette from shipped default from historical default. None of that
reasoning survives into the site. A reader sees a hex; the research that produced it
lives only in a merged pull request.

The existing References row is close but does a different job: it links to a project page
and Wikipedia — *where to read more about the platform*, not *where these specific values
came from, and how they were obtained*.

## Goal

One optional free-text provenance note per platform, rendered on the detail page, with
inline citations. Absent by default: an entry without a note shows nothing, and no
existing entry is required to gain one.

## Design reference

Claude Design project `aa9e4dd9-0901-421c-9a2f-0b29ca873168`.

- `Source Note Options.dc.html` — a placement exploration with seven candidates
  (1a inline footnote, 1b card beside the preview, 1c colophon band, 2a disclosure row,
  2b folded into the references row, 3a collapsed card, 3b card with a lede).
- `DesktopColors.dc.html` — the main document, which settled on **2b**. Lines 140–151
  carry the markup; lines 1184–1202 the logic.

The reference solves the wide viewport only. Its 390px frame wraps the reference chips
under the title and ignores that this site collapses that row into a `<Dropdown>` below
760px (**D2** in [`DESIGN.md`](../../../DESIGN.md)). The mobile treatment below is ours.

## Decisions

### The note is structured data, not an HTML string

The reference stores the note as raw HTML rendered through `dangerouslySetInnerHTML`
(`sources.js`, `DesktopColors.dc.html:1201`). This design stores it as text plus a link
map instead:

```json
"source": {
  "text": "Sampled from the 48-cell basic palette in the [Display Properties] color dialog under [v86], cross-checked against the shipped `.theme` files.",
  "links": {
    "Display Properties": "https://en.wikipedia.org/wiki/Windows_95",
    "v86": "https://copy.sh/v86/"
  }
}
```

Three reasons, in order of weight:

1. **The site is static.** Content is baked into HTML at build time, so an `onerror=`
   that survives review ships to every visitor of that page. The threat model is not a
   hostile end user — there is no user input anywhere on the site — it is a careless or
   hostile *content* pull request, and this project solicits those
   ([`CONTRIBUTING.md`](../../../CONTRIBUTING.md); PR #2 was a community contribution).
2. **It matches the existing content model.** Every field in `src/content/config.ts` is
   plain text or a validated URL today, and nothing in `src/` calls
   `dangerouslySetInnerHTML`. One HTML field becomes the precedent for the next.
3. **It buys build-time validation** an HTML string cannot: URLs go through
   `z.string().url()`, and a citation whose label has no link fails the build.

The cost is a small parser, and authoring is fussier than writing an anchor tag.

Rejected: **raw HTML as designed** — cheapest to ship and 1:1 with the reference, but
takes the injection surface above; a tag allowlist strong enough to be worth having costs
about as much as the parser. Rejected: **plain prose, citations as References pills** —
safest and nearly free, but the reference copy is built around inline citation, and
without it authors will paste bare URLs into prose.

### Syntax: `[Label]` for links, backticks for code

`[Label]` renders as a link whose visible text is `Label` and whose href is
`links["Label"]`. `` `x` `` renders as `<code>`. Everything else is literal.

- An unmatched `[` or backtick is literal text, not an error. Prose contains stray
  brackets; the parser must not turn that into a build failure.
- No nesting. A `[` inside backticks is literal, and a backtick inside `[]` is literal.
  Flat keeps the tokenizer a single pass and the failure modes obvious.
- No escape syntax. If an entry ever needs a literal `[Foo]` that is not a link, that is
  the moment to design escaping — not before.

Two markers is the whole language, deliberately. The pressure to grow this into a
markdown dialect should be resisted; if a note needs more than links and code, the note
is too elaborate.

### The schema cross-checks labels against links

`osSource` carries a `superRefine` that fails the build when:

- a `[Label]` in `text` has no entry in `links` — the citation would silently render as
  literal brackets, and nobody would notice; or
- a key in `links` never appears in `text` — dead data, usually a rename.

The error message names the offending label. This check is the concrete payoff of the
structured shape and is the reason it is worth the parser.

### Parsing happens at build time

`OsView` gains `source?: SourceNode[]` — already-parsed nodes, produced in `buildCatalog`.
The browser receives nodes, never raw text, so the parser never ships to the client.

```ts
export type SourceNode =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; label: string; url: string };
```

`OsView` is the right home: `project`, `links` and `wikipedia` already live there, and it
is serialized wholesale only into the detail page's bootstrap (`bootstrapFromView`). The
browse page projects `osList` into its own `items` shape, so this adds no weight there.

### Wide viewport: a Source pill in the References row

Following the reference's 2b:

- A **`Source ⌄`** toggle joins `refs-inline` after the existing pills.
- Activating it opens a panel **below the entire top row**, above `.dc-page-eyebrow`,
  spanning the page width.
- Panel: `1px solid var(--card-border)`, `11px` radius, `var(--panel-sunken)` ground,
  `14px 16px` padding, `13px/1.65` in `var(--muted)`, `text-wrap: pretty`.
- Closed by default. Provenance is sought, not served.
- The References block renders when `refs.length > 0 || os.source` — the reference's
  `hasRefs`, extended. An entry with a note but no links still gets the row.

The toggle is a `<button>` with `aria-expanded` and `aria-controls` pointing at the
panel, so the relationship is available to a screen reader that cannot see that the panel
sits below the row.

### Mobile: Source is the last item in the References dropdown

Below 760px the References row already collapses into a `<Dropdown>` (**D2**). The Source
toggle collapses with it:

- It is the **last** menu item, below a hairline divider, so the menu reads as *outbound
  links*, then, separately, *provenance*. It carries a chevron rather than the `↗` its
  neighbours use, because it does not navigate.
- Activating it closes the menu and opens the same panel below the top row — which is
  directly beneath the trigger, so the content appears where the tap happened.
- The trigger's count stays links-only; `ariaLabel` extends to name the source entry.

This keeps **D2** intact: the Source toggle is part of the References toolbar, and D2
already says that toolbar becomes one control on narrow screens. It costs no vertical
space and introduces no pattern that has to be documented as an exception.

The discoverability objection — provenance is two taps deep and invisible — is weaker
than it looks, because the panel is closed by default at *every* width. Provenance is
already opt-in on desktop; mobile is consistent with that, not worse than it.

Rejected: **a Source chip beside the burger**. Defensible — the dropdown collapses an
unbounded list of outbound links, and a disclosure toggle inside a link menu is arguably
a category error. But at 390px, `← Browse all platforms` + `Source ⌄` + `REFERENCES 2 ▾`
exceeds the content width and wraps the top row to two lines where it is currently one.
Pushing the title down the screen is the exact failure D2 exists to prevent.

Rejected: **relocating to a disclosure row under the description on mobile** (the
exploration's 2a). The best phone ergonomics of the three — full-width tap target, panel
opens in reading order where provenance naturally belongs. But it would be the site's
first case of *same content, different location per viewport*; D2 is same content,
different container, **same** location. It needs its own DESIGN.md decision and
duplicates the panel markup, and neither is earned by a secondary block.

### Deviations from the reference

Three, all deliberate:

1. **Pills, not plain accent text.** The mock draws every reference as bare accent-colored
   text; the live row uses bordered pills (`REF_LINK`, `OsDetail.tsx:25`). The Source
   toggle takes the pill vocabulary of its neighbours, with `⌄`/`⌃` where they carry `↗`.
2. **`--panel-sunken`, not an inline `#fbfaf9`.** The mock's panel ground is no existing
   token. A surface color is what [`CLAUDE.md`](../../../CLAUDE.md) means by a value that
   "defines a consistent look across the site", so it becomes a token in
   `src/styles/tokens.css` rather than an inline one-off.
3. **Selecting a color does not close the panel.** The mock resets `srcExp: false` in the
   color row's `select` handler (`DesktopColors.dc.html:1194`). The note is per-OS, not
   per-color, so collapsing it when the reader clicks a swatch is surprising. That looks
   like blanket state-clearing in a prototype rather than intent.

## Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `osSource` in `src/content/config.ts` | Accept and validate the field; fail the build on an unresolved or unused label | the shared tokenizer |
| `src/lib/sourceNote.ts` | Tokenize once; expose `parseSourceNote` (→ nodes) and `sourceNoteLinkErrors` (→ messages) | nothing |
| `buildCatalog` in `src/lib/catalog.ts` | Populate `OsView.source` with parsed nodes | `sourceNote.ts` |
| `src/islands/SourceNote.tsx` | Render nodes → spans / anchors / `<code>`; apply `target="_blank" rel="noopener"` centrally | node types |
| `OsDetail.tsx` | Own the open/closed state; render the toggle in both the inline row and the dropdown, and the panel once | `SourceNote`, `Dropdown` |

The schema and the parser share one tokenizer on purpose. If validation and rendering
disagreed about what counts as a marker, the build would pass on a note that renders
wrong — the single failure this design most needs to exclude.

`parseSourceNote` stays total: an unresolved label degrades to literal text rather than
throwing. Unreachable in practice because the schema rejects it first, but a pure
function that cannot fail is easier to test and cannot take a build down.

## Data flow

```
src/content/os/<slug>.json  { source: { text, links } }
  → Zod (config.ts) — rejects unresolved/unused labels
  → buildCatalog — parseSourceNote(text, links) → SourceNode[]
  → OsView.source
  → bootstrapFromView → OsDetailPage.astro → <OsDetail client:load>
  → SourceNote renders nodes  (no parser in the browser)
```

Open/closed state lives in `OsDetail` as a single `useState`. Both toggles — the inline
pill and the dropdown item — write to it, and one panel reads it, so the two viewports
cannot disagree about whether the note is open.

## Edge cases

| Case | Behaviour |
|---|---|
| No `source` field | No pill, no menu item, no panel. References row unchanged. |
| `source` present, no links at all | Row renders with only the Source toggle. |
| Unmatched `[` or backtick in prose | Literal text. Not an error. |
| `[Label]` with no matching link | **Build fails**, message names the label. |
| `links` key never cited in `text` | **Build fails**, message names the key. |
| Reader selects a different color | Panel state untouched. |
| Reader opens the dropdown, then the panel | Menu closes, panel opens below the row. |

## Testing

Per [`TESTING.md`](../../../TESTING.md), each layer proves what only it can:

- **`lib/` unit** (`src/lib/sourceNote.test.ts`) — the tokenizer and both consumers.
  Links, code, adjacent markers, unmatched delimiters, no-nesting, empty text, and both
  validator failures. This is where the bulk of the coverage belongs; the logic is pure
  and pushed down, per that guide's first rule of thumb.
- **Island unit** (`src/islands/SourceNote.test.tsx`, additions to `OsDetail.test.tsx`) —
  nodes render to the right elements; every anchor carries `rel="noopener"`; the toggle
  flips `aria-expanded`; the dropdown item opens the panel *and* closes the menu; a
  color change leaves the panel open. Assert at the interaction, not downstream (**T3**),
  and hydrate before driving (**T2**).
- **E2E** (`e2e/smoke.spec.ts`) — one case only, for what jsdom is blind to (**T1**):
  that at a narrow viewport the Source toggle is inside the dropdown and not in the top
  row, and that opening it does not push the row to a second line.
- **Schema** — not a test's job. `src/content/config.ts` is the gate; a malformed entry
  must fail the build.

## Documentation

Four files, and the mirror rule in `CLAUDE.md` makes two of them non-optional:

- **`DESIGN.md`** — a new decision, **D7 — Source note**: what the block is for, why it is
  collapsed by default, and why it rides D2 on mobile rather than relocating.
- **`docs/adding-os-data.md`** — the `source` field: syntax, the two markers, the
  label/link cross-check, and worked examples.
- **`CONTRIBUTING.md`** — the same field reference, mirrored. `CLAUDE.md` requires this in
  the *same change*, in either direction.
- **`docs/researching-desktop-colors.md`** — a pointer: the research that guide describes
  now has somewhere to land.

## Out of scope

- Backfilling notes for existing entries. The field is optional; entries gain notes as
  their research is written up. The reference's `sources.js` has copy for five platforms
  that can seed the first few, but writing them is not this change.
- Per-color source notes. The field is per platform.
- Escape syntax for literal `[` or backticks. Design it when an entry needs it.
- Any change to the References row's existing links, or to `Dropdown` beyond accepting a
  divider and a non-link item.
