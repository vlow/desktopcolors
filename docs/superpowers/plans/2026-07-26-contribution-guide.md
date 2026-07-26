# Contribution Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-contained `CONTRIBUTING.md` that takes a git-comfortable contributor from a color to a merged pull request, and point the site's footer at it instead of a `mailto:` link.

**Architecture:** One new root-level `CONTRIBUTING.md` carries the whole contributor workflow inline — field reference, dither math, chrome specs, verification, PR shape. The existing maintainer guides in `docs/` stay authoritative for agents and gain a reciprocal link plus a rule requiring `CONTRIBUTING.md` to be updated in the same change, so the deliberate duplication cannot drift silently. A PR template, a footer link swap, and a README pointer complete the funnel.

**Tech Stack:** Markdown; Astro 4 (`src/components/Footer.astro`); no new dependencies.

**Spec:** [`docs/superpowers/specs/2026-07-26-contribution-guide-design.md`](../specs/2026-07-26-contribution-guide-design.md)

## Global Constraints

- **Audience:** a contributor comfortable with git and GitHub but new to this repository. Never explain forking, branching, or what a pull request is.
- **Self-contained:** a contributor completing a normal submission (a platform, with or without an existing chrome style) must never need to open `docs/`. The single exception is adding a new chrome *primitive*, which is summarized and linked out.
- **Sourcing rule, stated verbatim in the guide:** "Your pull request must name where the color came from." Any credible source counts — a screenshot of a real or emulated install, a constant in a source, theme, or resource file, official documentation, or a reputable archive. No fixed citation format.
- **Verified toolchain facts.** Each was established by running the command against a deliberately broken file. Two of them contradict claims in `docs/adding-os-data.md`; that file is wrong and Task 3 corrects it.
  - `npm run build` is the **authoritative** content check: the Zod schema in `src/content/config.ts` plus the dangling-ref throw in `src/lib/catalog.ts:91`.
  - `npx vitest run` **also validates OS data**, via `src/content/os.test.ts`, which reads every file in `src/content/os/` and parses it against its own Zod schema — catching a bad hex, a bad `added` format, more than one `default`, and an unresolvable `predecessor`/`successor`. That schema is a **hand-maintained duplicate** of `config.ts` and omits the `wikipedia`, `project`, and `type` rules, so it is a fast first check rather than a substitute for the build.
  - `npx astro check` is TypeScript only. It **passes clean with 0 errors on an invalid OS JSON file**, and it does **not** catch a missing `renderPart` case — `renderPart` (`src/islands/DesktopPreview.tsx:376`) returns `ComponentChildren`, which admits `undefined`. It *does* catch a missing `CHROME_SPECS` entry, because that record is typed `Record<DesktopStyle, ChromeSpec | null>`.
- **Commit convention:** conventional commits. Types in use: `feat`, `fix`, `docs`, `chore`, `test`. Scopes in use: `os`, `colors`, `design`, `specs`, `plans`. `docs` is a **type**, not a scope (`docs: add TESTING.md`).
- **Do not** add a `LICENSE` file, flip `package.json`'s `"private": true`, or change repository visibility. Those are named prerequisites in the spec and are explicitly out of scope.

## File Structure

| file | status | responsibility |
|------|--------|----------------|
| `CONTRIBUTING.md` | create | the entire contributor workflow, self-contained |
| `.github/pull_request_template.md` | create | prefills source citation, verification checkboxes, screenshot slot |
| `docs/adding-os-data.md` | modify | mirror note; **correct the wrong verify claim** |
| `docs/adding-a-preview-style.md` | modify | mirror note |
| `CLAUDE.md` | modify | bind agents to the mirror rule |
| `src/components/Footer.astro` | modify (`:16-21`) | swap the mailto for the guide link |
| `README.md` | modify | Contributing section |

---

### Task 1: Write `CONTRIBUTING.md`

The largest deliverable, and the one every other task points at. Build it section by section, committing once at the end — a half-written guide is not independently reviewable.

**Files:**
- Create: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the anchors later tasks link to — `#add-a-platform`, `#desktop-chrome`, `#verify`, `#open-the-pull-request`. Task 2's template and Task 3's mirror notes reference these by name; keep the headings exactly as written below so the anchors resolve.

- [ ] **Step 1: Create the file with the intro and the sourcing rule**

Open with what the project archives and what a contribution is: one JSON file in `src/content/os/`, optionally a chrome spec. State the two paths and that a contributor may take one or both.

Then the sourcing rule, as its own subsection so it can be linked from the PR template:

```markdown
## Sourcing

**Your pull request must name where the color came from.**

Any credible source counts:

- a screenshot of a real or emulated install, with the pixel sampled
- a constant in a source, theme, or resource file
- official documentation or a manual
- a reputable archive or preservation project

There is no fixed citation format — a sentence in the pull request description is
enough. If you sampled a pixel, say which screenshot and where you got it. If you read a
constant, link the file and line.

We would rather have a well-sourced approximation with an honest note than a confident
wrong hex. If you are unsure, say so in the `note` field and in the PR.
```

- [ ] **Step 2: Add the Setup section**

Node ≥ 20 (per `.nvmrc`), `npm install`, and a branch. State explicitly that **Go is not required** — the counter service is untouched by every contribution this guide describes. Contributors seeing `Go ≥ 1.25` in the README prerequisites otherwise assume they need it.

- [ ] **Step 3: Add "Add a platform" — the field reference**

Heading must be exactly `## Add a platform`.

Cover: the file goes in `src/content/os/<slug>.json`, and the filename becomes the slug (`beos.json` → `beos`). Show a complete realistic example file. Then this table, which reflects the live schema in `src/content/config.ts`:

| field | required | rules |
|-------|----------|-------|
| `name` | yes | display name, non-empty |
| `year` | yes | integer release year |
| `added` | yes | `YYYY-MM-DD` — the date the entry joins the catalog. Never bump it later; it drives the "newest" sort. |
| `family` | yes | groups the platform. Reuse an existing value (`Windows`, `Mac OS`, `Amiga`, `Desktop Env.`, …) unless genuinely new. |
| `tagline` | yes | one evocative line |
| `description` | yes | one or two sentences of real context |
| `colors` | yes | at least one entry; **at most one** may be `"default": true` |
| `slug` | no | defaults to the filename; lowercase letters, digits, hyphens |
| `predecessor`, `successor` | no | slug refs to other entries. A dangling ref fails the build. |
| `desktopStyle` | no | defaults to `modern` — see [Desktop chrome](#desktop-chrome) |
| `type` | no | `Proprietary` or `Open Source` — reuse existing values |
| `wikipedia` | no | URL |
| `project` | no | `{ "name", "url" }` for the project's own site |

Then the color rules: `hex` is lowercase `#rrggbb`; `name` is a human name, qualified for light/dark variants (`French Blue (Light)`); `note` is optional and terse; `default` marks the out-of-the-box desktop color, at most one per file. Include the RGB → hex snippet:

```js
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
hex([179, 179, 218]); // "#b3b3da"
```

- [ ] **Step 4: Add the dithered-colors subsection, in full**

This is the part a contributor cannot get right unaided, and the failure mode is silent wrongness — so inline all of it. It must cover:

1. **What a dither is and why it becomes a cluster.** Some desktops never showed a solid color: a fixed hardware palette forced the OS to checkerboard two palette colors to fake a third. `#rrggbb` holds only a solid color, so one dithered desktop becomes several entries. Point at the live examples: `windows-1-0.json` (green + cyan, 75/25), `freegem.json` (gray + blue, 1:1), `mac-os-8.json` (gray + gray, 1:1).
2. **The four-entry shape**, in this order: `<Name> (Averaged)` — the per-channel arithmetic mean in sRGB, weighted by pattern share; `<Name> (Gamma-Corrected)` — the same mix averaged in linear light, which tracks perception better and is usually lighter; then the two partials, each named by its actual color (`Phosphor Green`, `Stone Gray`) with a note giving its share of the pattern. Cross-reference the hexes in the notes.
3. **When `default` goes on the averaged entry:** only when the dither *is* the platform's actual desktop (FreeGEM, Windows 1.0) — not when it is one option among solid colors (Mac OS 8, where `default` sits on a solid color).
4. **Weighting.** If the pattern is not 1:1, weight *both* averages by area and say so in the note. Windows 1.0 is 75% green / 25% cyan — each 8×8 green block holds a 4×4 cyan patch.
5. **The collapse rule.** When the two sources are close or near-neutral, both averages round to the same hex and listing both would duplicate a swatch. Collapse to a single `<Name> (Dithered)` plus the two partials — three entries — and note that both methods agree at 8-bit precision. Mac OS 8 is canonical: `#a5a5a5` + `#969696` at 1:1 gives simple `157.5` and linear-light `157.7`, both rounding to `#9e9e9e`. Grays barely span a gamma gap; a wide mix like gray + blue does not.
6. **Always recompute, never eyeball** — whether the methods diverge is what decides four entries versus three.

Include both snippets verbatim:

```js
// per channel c is 0–255; wA + wB = 1 (use 0.5 / 0.5 for a 1:1 dither)
const round = v => Math.round(v);

// 1) simple pixel average (sRGB channel mean)
const simple = (a, b, wA = 0.5, wB = 0.5) => round(a * wA + b * wB);

// 2) linear-light (gamma-corrected) average
const toLin  = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = l => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055) * 255;
const gamma  = (a, b, wA = 0.5, wB = 0.5) => round(toSrgb(toLin(a) * wA + toLin(b) * wB));
```

- [ ] **Step 5: Add "Desktop chrome" — tier 1 and the style table**

Heading must be exactly `## Desktop chrome`.

Explain what a preview is: the schematic desktop mockup on `/os/<slug>` and in the fullscreen viewer — a box filled with the selected color plus translucent overlays (icons, taskbar, menu bar, dock, window), built from `<div>`s and `<svg>`s only so it works on any color. Note that `desktopStyle` affects **only** the on-screen preview; the downloadable wallpaper is always a plain solid-color PNG.

Then the table of the eleven live styles, so a contributor checks for a fit before building anything:

| `desktopStyle` | chrome | modeled on |
|----------------|--------|------------|
| `modern` | corner icons + two windows + segmented dock with clock | platform-neutral **default** |
| `win9x` | icons + window + Recycle Bin + taskbar | Windows 95/98/Me/NT 4.0/2000/XP, ReactOS, SerenityOS |
| `win31` | Program Manager window (two group panes) | Windows 1.0/2.0/3.0/3.1, NT 3.x |
| `platinum` | menu bar + icons + Platinum window | Mac OS 8 |
| `beos` | deskbar tab + icons + tabbed window | BeOS, Haiku |
| `amiga` | top bar + icons + window | Amiga Workbench |
| `kde` | window + bottom dock | KDE 1/2, Plasma 6 |
| `cde` | icon + Motif window + front panel | CDE, Solaris |
| `gem` | menu bar + icons + GEM window | Digital Research GEM (FreeGEM) |
| `bleskos` | full-screen program switcher | BleskOS |
| `generic` | icons + dock | minimal / unknown shells |

Tier 1 — **reuse an existing style** — is one line in the platform's JSON, and covers most contributions:

```json
"desktopStyle": "kde"
```

- [ ] **Step 6: Add chrome tier 2 — a new style from existing primitives**

Three edits, written out in full.

First, register the name in `src/lib/desktopStyle.ts` — the only place the set is declared:

```ts
export const DESKTOP_STYLES = ["modern", "win9x", "win31", "platinum", "beos", "amiga", "kde", "cde", "gem", "bleskos", "generic", "nextstep"] as const;
```

Second, add the spec to `CHROME_SPECS` in `src/lib/chromeSpec.ts`:

```ts
  nextstep: [
    { part: "deskIcons", side: "right", icons: [{ kind: "drive", label: "Disk" }] },
    { part: "dock" },
  ],
```

State that this step cannot be silently skipped: `CHROME_SPECS` is typed `Record<DesktopStyle, ChromeSpec | null>`, so `npx astro check` fails until every style has an entry. Use `null` only for a bespoke-rendered style — today just `modern`.

Third, add one assertion to `src/islands/DesktopPreview.test.tsx`, which iterates `DESKTOP_STYLES`:

```ts
expect(chromeFor("nextstep")).toEqual(["chrome-deskicons", "chrome-dock"]);
```

Include the primitive vocabulary so a spec can be composed without leaving the guide:

| `part` | params | draws |
|--------|--------|-------|
| `deskIcons` | `side: "left"\|"right"`, `anchor?: "top"\|"bottom"`, `icons: {kind,label}[]` | a column of line-art desktop icons with labels |
| `window` | `left`, `top`, `w`, `body` | a translucent window (title bar + dots + body) |
| `beosWindow` | `left`, `top`, `w`, `body` | a BeOS-style tabbed window |
| `platinumWindow` | `left`, `top`, `w`, `body` | a Mac OS 8 Platinum window |
| `cdeWindow` | `left`, `top`, `w`, `body` | a CDE/Motif window |
| `gemWindow` | `left`, `top`, `w`, `body` | a GEM window |
| `taskbar` | — | Win9x bottom taskbar |
| `menuBar` | — | Mac Platinum / GEM top menu bar |
| `topBar` | — | Amiga Workbench top bar |
| `dock` | — | KDE / generic bottom dock |
| `frontPanel` | — | CDE front panel |
| `beosTab` | — | BeOS deskbar tab (top-right) |
| `bleskos` | — | BleskOS full-screen program switcher |

And the `body` shapes: `{ kind: "gridIcons", icons: IconKind[], cols }`, `{ kind: "rows", widths: number[] }` (percentages), `{ kind: "panes", count: 2 }`. `IconKind` is `computer | folder | trash | drive | disk`.

- [ ] **Step 7: Add chrome tier 3 — a new primitive (summary + link out)**

Short. State plainly that **most contributions will not need this**, and that it is TypeScript and Preact work rather than content. Summarize the four moving parts — a `part` variant on the `ChromePart` discriminated union in `chromeSpec.ts`, a matching component in `DesktopPreview.tsx`, a `case` in the `renderPart` switch, and the authoring conventions (translucent surfaces derived from `chromeSurfaces(onColor)` so chrome stays legible on any wallpaper, sizing in `cu()` units, `<div>`/`<svg>` only, `data-testid="chrome-<name>"`). Then link out for the full detail — from the repository
root the link is written `[docs/adding-a-preview-style.md](docs/adding-a-preview-style.md)`.

**Warn explicitly that the compiler will not catch a forgotten `renderPart` case.**
`renderPart` (`src/islands/DesktopPreview.tsx:376`) returns `ComponentChildren`, which
admits `undefined`, so a `ChromePart` variant with no matching case type-checks cleanly and
renders nothing. This is the one place in the chrome system where a mistake is silent, so
the guide must say to check the preview in the browser.

- [ ] **Step 8: Add the Verify section**

Heading must be exactly `## Verify`.

**Use this table exactly — the "what it catches" column was established empirically and contradicts the older claim still sitting in `docs/adding-os-data.md`, which Task 3 corrects.**

```markdown
| command | what it catches |
|---------|-----------------|
| `npm run build` | **the authoritative check on your JSON** — the content schema (bad hex, missing field, more than one `default`) and dangling `predecessor`/`successor` refs. Also proves every page still pre-renders. |
| `npx vitest run` | `src/content/os.test.ts` re-reads every file in `src/content/os/` and parses it, so most mistakes surface here first and fastest. It uses its own copy of the schema, which omits the `wikipedia`, `project`, and `type` rules — a pass here is encouraging, not conclusive. |
| `npx astro check` | TypeScript only — notably a missing `CHROME_SPECS` entry. It does not read your JSON at all. |
| `npm run dev` | your own eyes: open `/os/<slug>` and check the swatches and the preview on both light and dark colors. |
```

If you only run one thing, run `npm run build` — it is the check CI treats as authoritative.

Then the worked example of a schema failure. This is real captured output from a file whose `hex` was missing its `#`:

```
[InvalidContentEntryFrontmatterError] [astro:content-imports] os → zzz-temp-broken frontmatter does not match collection schema.
must be #rrggbb
file: /…/src/content/os/zzz-temp-broken.json?astroDataCollectionEntry=true:0:0
```

Explain how to read it: the entry name after `os →` is your file; the bare line under it (`must be #rrggbb`) is the schema's message. The reported location is always `:0:0` and **the message does not say which field or array index failed** — so when a file has several colors, check each `hex` by hand. Give the sibling case too: a dangling ref surfaces as a thrown `Unresolved predecessor "…" referenced by "…"` rather than a schema message.

Close by noting that CI (`.github/workflows/ci.yml`) runs `npm run check`, `npm test`, and `npm run build` on every pull request, so a green local build predicts a green PR.

- [ ] **Step 9: Add the "Open the pull request" section**

Heading must be exactly `## Open the pull request`.

Commit convention, matching the repository's history:

```
feat(os): add BeOS
fix(colors): correct the Windows 95 teal
feat(design): add the nextstep chrome style
```

Types in use: `feat`, `fix`, `docs`, `chore`, `test`. Scopes in use: `os`, `colors`, `design`. Note `docs` is a **type**, not a scope — a docs-only change is `docs: …`, not `docs(docs): …`.

What the description must contain: the source citation (per [Sourcing](#sourcing)), and — for a new or changed chrome style — a screenshot of the preview on both a light and a dark color. Then the checklist, which the PR template mirrors:

```markdown
- [ ] The file is `src/content/os/<slug>.json`, `hex` values are lowercase `#rrggbb`, and at most one color is `default`.
- [ ] `family` and `type` reuse existing values unless genuinely new.
- [ ] Any dithered desktop has its blended entry(ies) plus partials, with **recomputed** averages and the collapse rule applied.
- [ ] `npm run build` passes.
- [ ] The PR description names the source of every color.
```

- [ ] **Step 10: Verify the guide is self-consistent**

Run: `npm run build`
Expected: PASS — confirms nothing in the repo broke. (The guide is prose; the build does not read it. Its real acceptance test is Task 5.)

Re-read the file and confirm every internal anchor (`#sourcing`, `#add-a-platform`, `#desktop-chrome`, `#verify`, `#open-the-pull-request`) matches a heading that exists, and that the relative link to `docs/adding-a-preview-style.md` resolves from the repository root.

- [ ] **Step 11: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add a self-contained contribution guide"
```

---

### Task 2: Add the pull request template

**Files:**
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: the checklist and the sourcing rule from Task 1's `CONTRIBUTING.md`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Create the template**

Write `.github/pull_request_template.md`:

```markdown
<!--
Thanks for contributing! See CONTRIBUTING.md for the full guide.
Delete any section that does not apply.
-->

## What this adds

<!-- e.g. "BeOS (1995) with its four desktop colors" -->

## Source

<!--
Required. Where did the color(s) come from? A sentence is enough.
A screenshot of a real or emulated install, a constant in a source/theme/resource
file, official documentation, or a reputable archive all count. If you sampled a
pixel, say which screenshot. If you read a constant, link the file.
-->

## Screenshots

<!-- Required only for a new or changed desktop chrome style: the preview on
     both a light and a dark color. -->

## Checklist

- [ ] The file is `src/content/os/<slug>.json`, `hex` values are lowercase `#rrggbb`, and at most one color is `default`.
- [ ] `family` and `type` reuse existing values unless genuinely new.
- [ ] Any dithered desktop has its blended entry(ies) plus partials, with **recomputed** averages and the collapse rule applied.
- [ ] `npm run build` passes.
- [ ] The description above names the source of every color.
```

- [ ] **Step 2: Confirm the checklist matches the guide**

Diff this checklist against the one written in Task 1 Step 9. They must be identical — a contributor who ticks the template must have satisfied the guide. Fix whichever drifted.

- [ ] **Step 3: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "docs: add a pull request template for content contributions"
```

---

### Task 3: Add the drift guards and correct the verify claim

Two things at once because they touch the same lines: wire the mirror rule into both maintainer guides and `CLAUDE.md`, and fix a factual error those guides already carry.

**Files:**
- Modify: `docs/adding-os-data.md` (header; verify block at `:136-143`; checklist item at `:152`)
- Modify: `docs/adding-a-preview-style.md` (header)
- Modify: `CLAUDE.md` ("Start here" list)

**Interfaces:**
- Consumes: `CONTRIBUTING.md` from Task 1 — the notes link to it and to its `#verify` anchor.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the mirror note to `docs/adding-os-data.md`**

Insert directly after the existing intro paragraph, before `## The file shape`:

```markdown
> **Mirrored in [`CONTRIBUTING.md`](../CONTRIBUTING.md).** That guide is the
> contributor-facing copy of this material and is deliberately self-contained. **If you
> change the field rules, the color conventions, or the dithering workflow here, update
> `CONTRIBUTING.md` in the same change.**
```

- [ ] **Step 2: Correct the verify block in `docs/adding-os-data.md`**

The current block is wrong: it claims `npx astro check` rejects a bad content file. It does not — verified by running it against a file with an invalid `hex`, which passed with 0 errors. Replace lines 136–143:

Find (the four comment lines inside the existing `## Verify` bash block):

````markdown
```bash
npx astro check     # type-checks; the Zod content schema rejects a bad file
npx vitest run      # unit tests
npm run build       # every page still pre-renders
npm run dev         # eyeball /os/<slug> and the swatches
```
````

Replace the whole `## Verify` section with:

````markdown
## Verify

```bash
npm run build       # authoritative: the content schema + dangling-ref check
npx vitest run      # src/content/os.test.ts re-parses every OS file — fastest feedback
npx astro check     # TypeScript only; passes clean on a broken JSON file
npm run dev         # eyeball /os/<slug> and the swatches
```

Two commands read your JSON, and they are not equivalent. `npm run build` is
authoritative: the Zod schema in `src/content/config.ts` rejects a bad hex, a missing
field, or more than one `default`, and `buildCatalog` (`src/lib/catalog.ts:91`) throws on
a dangling `predecessor`/`successor`. `src/content/os.test.ts` re-validates the same files
under vitest and usually fails first, but against a **hand-maintained duplicate** of the
schema that omits the `wikipedia`, `project`, and `type` rules — keep it in sync when you
change `config.ts`. `astro check` does not read the content collection at all.
````

- [ ] **Step 3: Correct the matching checklist item in `docs/adding-os-data.md`**

Find (item 6):

```markdown
6. [ ] `npx astro check` and `npx vitest run` pass; eyeballed via `npm run dev`.
```

Replace with:

```markdown
6. [ ] `npm run build` and `npx vitest run` pass (both validate the JSON; the build is authoritative); eyeballed via `npm run dev`.
```

- [ ] **Step 4: Add the mirror note to `docs/adding-a-preview-style.md`**

Insert after the opening paragraphs, before `## How it fits together (data flow)`. Note this guide's own verify block is already correct — do not change it.

```markdown
> **Partly mirrored in [`CONTRIBUTING.md`](../CONTRIBUTING.md).** That guide carries a
> contributor-facing copy of the style table, the primitive vocabulary, and the
> "add a new style" steps; it links here for adding a new *primitive*. **If you change
> any of those, update `CONTRIBUTING.md` in the same change.**
```

- [ ] **Step 5: Bind agents to the rule in `CLAUDE.md`**

Add a bullet to the "Start here" list, after the `adding-a-preview-style.md` entry:

```markdown
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — the contributor-facing guide. It is deliberately
  **self-contained**: it duplicates the field reference, the dithering workflow, and the
  chrome style/primitive tables from the two guides above. **Any change to those topics in
  `docs/adding-os-data.md` or `docs/adding-a-preview-style.md` must be applied to
  `CONTRIBUTING.md` in the same change**, or the copies drift.
```

- [ ] **Step 6: Verify the corrected claim is actually true**

Prove the correction rather than trusting it — an earlier draft of this plan asserted that no test reads the content directory, which was false and shipped into Task 1 before review caught it. Exercise **all three** commands against a deliberately broken file:

```bash
cat > src/content/os/zzz-verify-check.json <<'EOF'
{ "name": "T", "year": 1995, "added": "2026-07-26", "family": "BeOS",
  "tagline": "t", "description": "d",
  "colors": [{ "hex": "336698", "name": "Bad Hex" }] }
EOF
npx astro check > /dev/null 2>&1;                    echo "astro check exit: $?"
npx vitest run src/content/os.test.ts > /dev/null 2>&1; echo "vitest exit:      $?"
npm run build > /dev/null 2>&1;                      echo "build exit:       $?"
rm -f src/content/os/zzz-verify-check.json
```

Expected: `astro check exit: 0`, `vitest exit: 1`, `build exit: 1`. If any differs, the table is wrong — stop, re-derive it, and report before continuing.

- [ ] **Step 7: Confirm the working tree is clean of the probe file**

Run: `git status --short src/content/os/`
Expected: no output. If `zzz-verify-check.json` appears, delete it before committing.

- [ ] **Step 8: Commit**

```bash
git add docs/adding-os-data.md docs/adding-a-preview-style.md CLAUDE.md
git commit -m "docs: mirror-rule the contributor guide, fix the verify claim

astro check does not validate the content collection — verified against a file
with an invalid hex, which it passes with 0 errors. Only npm run build reads
src/content/os/*.json."
```

---

### Task 4: Swap the footer link and add the README pointer

**Files:**
- Modify: `src/components/Footer.astro:16-21`
- Modify: `README.md`

**Interfaces:**
- Consumes: `getGitInfo().repoUrl` from `src/lib/gitInfo.ts:28` — already derives the GitHub repository URL from the origin remote and returns `null` outside a checkout. No new mechanism.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Swap the link in `Footer.astro`**

Find (lines 16–21):

```astro
const projectLinks = [
  { label: "About", href: "/about" },
  // TODO(owner): point at the public repo once it exists.
  { label: "Source on GitHub", href: git.repoUrl ?? "#" },
  { label: "Suggest a platform", href: "mailto:hello@desktopcolors.com?subject=Suggest%20a%20platform" },
];
```

Replace with:

```astro
const projectLinks = [
  { label: "About", href: "/about" },
  // TODO(owner): both GitHub links 404 until the repo is public.
  { label: "Source on GitHub", href: git.repoUrl ?? "#" },
  { label: "Add a platform", href: git.repoUrl ? `${git.repoUrl}/blob/main/CONTRIBUTING.md` : "#" },
];
```

The `git.repoUrl ? … : "#"` form matches the adjacent entry's degradation, so a build from a tarball (no git) renders `#` rather than a broken URL.

- [ ] **Step 2: Type-check and build**

Run: `npx astro check && npm run build`
Expected: both PASS — 0 errors, every page pre-renders.

`Footer.astro` has no test coverage, and this change does not warrant adding a suite: the component is static markup with no logic, and a type-check plus a successful build cover the only failure mode a one-line href change can produce.

- [ ] **Step 3: Eyeball the rendered footer**

Run: `npm run dev`
Open `http://localhost:4321/` and scroll to the footer. Expected: the PROJECT column reads **About / Source on GitHub / Add a platform**, and `Add a platform` points at `https://github.com/vlow/desktopcolors/blob/main/CONTRIBUTING.md`. The link will 404 until the repository is public — that is the known, out-of-scope prerequisite, not a bug in this change.

- [ ] **Step 4: Add the README Contributing section**

Insert after the existing "Adding a preview style" section and before "Deploy":

```markdown
## Contributing

Adding a platform or a desktop chrome style from outside the project? Start with
**[`CONTRIBUTING.md`](CONTRIBUTING.md)** — a self-contained walkthrough from the JSON file
to the pull request, including the sourcing rule and the dithered-colors workflow. The two
`docs/` guides above remain the maintainer reference.
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Footer.astro README.md
git commit -m "feat(design): point the footer at the contribution guide

Replaces the Suggest a platform mailto with a link to CONTRIBUTING.md,
degrading to # outside a git checkout like the adjacent repo link."
```

---

### Task 5: Walk the guide end to end

The acceptance test for "self-contained." Everything above can be individually correct and still fail this.

**Files:**
- Temporarily create then delete: `src/content/os/zzz-walkthrough.json`
- Modify (only if the walkthrough finds gaps): `CONTRIBUTING.md`

**Interfaces:**
- Consumes: all of Tasks 1–4.
- Produces: the final state of the guide.

- [ ] **Step 1: Follow the guide for an invented platform, without opening `docs/`**

Close `docs/adding-os-data.md` and `docs/adding-a-preview-style.md`. Using **only** `CONTRIBUTING.md`, create `src/content/os/zzz-walkthrough.json` for a fictional platform that exercises the hard paths:

- all required fields plus `predecessor` (point it at a real slug, e.g. `beos`)
- at least three colors, exactly one `default`
- **a dithered cluster**, computed with the guide's snippets — do the arithmetic, do not copy an existing file's numbers
- `desktopStyle` set to an existing style

Record every moment you had to guess, infer, or reach for another file. Those are the gaps.

- [ ] **Step 2: Verify using only the guide's Verify section**

Run: `npm run build`
Expected: PASS.

If it fails, confirm the guide's worked example was enough to diagnose it unaided. If it was not, that is a gap.

- [ ] **Step 3: Confirm the dither math was reproducible**

Check your computed averages against the collapse rule: did you correctly decide four entries versus three? Re-run both snippets on Mac OS 8's `#a5a5a5` + `#969696` at 1:1 and confirm you get `#9e9e9e` from both — if the guide's snippets do not reproduce the documented result, they are wrong.

- [ ] **Step 4: Delete the walkthrough file**

```bash
rm -f src/content/os/zzz-walkthrough.json
git status --short src/content/os/
```

Expected: no output. The fictional platform must not ship.

- [ ] **Step 5: Fix every gap found**

Edit `CONTRIBUTING.md` to close each point where you had to guess or leave the file. If a gap can only be closed by pulling in more of `docs/`, pull it in — self-containment is the requirement.

- [ ] **Step 6: Final verification**

```bash
npx astro check && npm run build && npx vitest run
git status --short
```

Expected: all three PASS, and `git status` shows only `CONTRIBUTING.md` if Step 5 changed it — no stray JSON.

- [ ] **Step 7: Commit any fixes**

```bash
git add CONTRIBUTING.md
git commit -m "docs: close the gaps found walking the contribution guide end to end"
```

Skip this commit if Step 5 found nothing to change.

---

## Out of scope (spec prerequisites)

Do not do these, and do not treat them as blockers for the tasks above:

- Adding a `LICENSE` file or flipping `package.json`'s `"private": true`.
- Making `vlow/desktopcolors` public.

Both are named in the spec as conditions for the guide to *pay off*, not conditions for it to be written. The footer link and PR template are inert until the repository is public; that is expected and is already flagged in the `TODO(owner)` comment retained in Task 4.
