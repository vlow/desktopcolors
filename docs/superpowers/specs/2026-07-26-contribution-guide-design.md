# Contribution guide — design

**Date:** 2026-07-26
**Status:** approved, ready for implementation planning

## Problem

The footer's only invitation to contribute is a `mailto:` link
(`Suggest a platform`, `src/components/Footer.astro:20`). E-mail is a dead end: the
suggestion arrives as prose, the maintainer does the work, and the contributor learns
nothing about the data model.

The repository already documents *how the data works* in
[`docs/adding-os-data.md`](../../adding-os-data.md) and
[`docs/adding-a-preview-style.md`](../../adding-a-preview-style.md), but those are written
as internal references for maintainers and LLM agents. Neither covers the contributor's
actual workflow: what evidence a color needs, how to verify locally, and what the pull
request must contain.

## Goal

A single `CONTRIBUTING.md` that takes someone from "I know the exact BeOS blue" to a
merged pull request, and that the footer can link to instead of the mailto.

## Audience

A contributor **comfortable with git and GitHub but new to this repository**. The guide
does not explain forking, branching, or what a pull request is. It spends its length on
repository-specific rules: where the file goes, which fields mean what, how to compute a
dithered color, how to verify, and what the PR must show.

This rules out a no-code issue-template path and a web-UI editing path. Both were
considered and dropped.

## Prerequisites (out of scope, but blocking for going live)

Two conditions must hold before the guide is useful to the public. Neither is part of
this work.

1. ~~**No `LICENSE` file exists.**~~ **Resolved 2026-07-26:** the project is licensed
   AGPL-3.0-or-later (`LICENSE`, verbatim from gnu.org; `package.json` carries the SPDX
   id). `CONTRIBUTING.md` states that contributions are under the same terms, with no CLA
   and no copyright assignment. Note that `package.json`'s `"private": true` was never
   part of this blocker — it only prevents an accidental `npm publish` and says nothing
   about the source license; it stays.
2. **`vlow/desktopcolors` is private on GitHub.** The footer link and PR template are
   inert until it is public — the same blocker as the existing
   `TODO(owner): point at the public repo once it exists` on `Footer.astro:18`.

The guide can be written and merged now; it simply does not pay off until both are
resolved.

## Approach: self-contained, with an explicit drift guard

`CONTRIBUTING.md` is **self-contained**. A contributor completing a normal submission —
a new platform, with or without an existing chrome style — never has to open `docs/`.
The audience and the requirements differ enough from the maintainer guides that
delegating mid-flow would fragment the read.

The cost of a self-contained guide is duplication, and duplication drifts. The mitigation
is mechanical rather than aspirational:

- Each maintainer guide (`docs/adding-os-data.md`, `docs/adding-a-preview-style.md`)
  gains a header note that links to `CONTRIBUTING.md` and states that its content is
  mirrored there and **must be updated in the same change**.
- `CLAUDE.md` carries the same rule, so an agent editing either guide is bound by it.

The single exception to self-containment is the deepest tier of chrome work — adding a
new rendering primitive — which is summarized and linked out. See Path B below.

## Structure of `CONTRIBUTING.md`

### 1. What a contribution is

A contribution is one JSON file in `src/content/os/`, optionally accompanied by a chrome
spec. Two paths, and a contributor may take one or both.

This section states the **sourcing rule** up front, because it governs everything after
it:

> Your pull request must name where the color came from.

Any credible source counts — a screenshot of a real or emulated install, a constant in a
source, theme, or resource file, official documentation, or a reputable archive. No fixed
citation format: a sentence in the PR description is enough. The reviewer judges
credibility.

This is deliberately looser than a primary-sources-only rule. Obscure and lost platforms
often have no reachable primary source, and a strict bar would exclude exactly the
entries the archive most wants.

### 2. Setup

Node ≥ 20 (`.nvmrc`), `npm install`, branch. Stated explicitly: **Go is not required**
for content work — the counter service is untouched by every contribution this guide
describes.

### 3. Path A — add a platform

- Filename → slug (`beos.json` → `beos`).
- **The full field table**, all fields, required and optional, with the conventions that
  trip people: `added` is the date the entry joins the catalog and is never bumped to
  "today"; reuse an existing `family` and `type` unless genuinely new; at most one color
  may be `default`.
- Color rules and the RGB → hex snippet.
- **Dithered colors, in full**: what a dither is and why one desktop becomes a cluster of
  entries; the four-entry shape (two blended, two partials); the collapse-to-three rule
  when both averaging methods round to the same hex; area weighting for non-1:1 patterns;
  both averaging snippets (sRGB channel mean and linear-light); and the instruction to
  always recompute rather than eyeball, since the result decides 4-vs-3 entries.

### 4. Path B — desktop chrome

Opens with a table of the eleven existing `desktopStyle` values and what each models, so
a contributor can first check whether an existing style already fits.

Three tiers, descending in frequency and difficulty:

1. **Reuse an existing style** — one line in the platform's JSON. Covers most cases.
2. **New style from existing primitives** — written out in full: register the name in
   `DESKTOP_STYLES` (`src/lib/desktopStyle.ts`), add the `CHROME_SPECS` entry
   (`src/lib/chromeSpec.ts`), add the `chromeFor(...)` assertion in
   `DesktopPreview.test.tsx`. Includes the primitive vocabulary table so a spec can be
   composed without leaving the guide. Notes that the typed `Record` makes a missing
   entry a build failure, so the step cannot be silently skipped.
3. **New primitive** — summarized only: what it involves (a `ChromePart` variant, a Preact
   component, a `renderPart` case, and the translucency and `data-testid` conventions),
   an explicit note that **most contributions will not need this**, and a link to
   [`docs/adding-a-preview-style.md`](../../adding-a-preview-style.md) for the detail.
   This tier is TypeScript and Preact work rather than content, which is why it is the
   one place the guide delegates.

### 5. Verify

The four commands written out with **what each one actually catches**. The table below
was corrected during implementation after two claims in the original draft were found
false; see "Toolchain facts" below for the evidence.

| command | catches |
|---------|---------|
| `npm run build` | the authoritative content check — the Zod schema in `src/content/config.ts` plus the dangling-ref throw in `src/lib/catalog.ts:91`. Also proves every page pre-renders. |
| `npx vitest run` | `src/content/os.test.ts` re-validates every OS JSON against a hand-maintained copy of the schema: bad hex, bad `added` format, more than one `default`, unresolvable `predecessor`/`successor`. Plus the pure logic (color math, catalog derivation, chrome specs). |
| `npx astro check` | TypeScript only — notably a missing `CHROME_SPECS` entry. Does not read the content collection. |
| `npm run dev` | eyeball `/os/<slug>` and the preview on light and dark colors |

### Toolchain facts

Each claim below was established by running the command against a deliberately broken
file, not by reading the existing documentation — which is wrong on this point.

- **`npx astro check` does not validate OS data.** An OS file with `"hex": "336698"`
  (missing `#`) passes with 0 errors. `docs/adding-os-data.md:139` claims the opposite and
  is corrected as part of this work.
- **`npx vitest run` does validate OS data**, via `src/content/os.test.ts`, which
  `readdirSync`s the content directory and parses every file against its own Zod schema.
  That schema is a **hand-maintained duplicate** of `src/content/config.ts` and omits the
  `wikipedia`, `project`, and `type` rules — so it is a fast first check, not a substitute
  for the build.
- **`npx astro check` does not catch a missing `renderPart` case.** `renderPart`
  (`src/islands/DesktopPreview.tsx:376`) returns `ComponentChildren`, which admits
  `undefined`, and the project extends `astro/tsconfigs/strict` rather than `strictest`.
  A new `ChromePart` variant without a matching case renders nothing, silently. Only the
  missing-`CHROME_SPECS`-entry half of that guarantee is real, because `CHROME_SPECS` is
  typed `Record<DesktopStyle, ChromeSpec | null>`.

Plus a worked example of reading a Zod content-schema failure, since that is the error a
first-time contributor is most likely to hit and least likely to parse.

Closes by noting that CI (`.github/workflows/ci.yml`) runs the same checks on the pull
request, so a green local run predicts a green PR.

### 6. Open the PR

- Commit convention matching the repository's history: `feat(os): add BeOS` — a legal,
  invented example, not one pulled from history (no `feat(os)` commit has actually
  landed; real OS-scoped commits skew `fix(os)`/`chore(os)`/`data(os)`). Types in use
  include `feat`, `fix`, `docs`, `chore`, `test`, and `refactor`, plus a handful of
  others — stated as representative, not exhaustive. Scopes are per-area and open-ended:
  history carries roughly 25, the most common being `design`, `explorer`, `islands`,
  `lib`, `os`, and `colors`. An earlier draft of this spec named only `os`, `colors`, and
  `design`, which final review refuted — `explorer`, `islands`, and `lib` are all more
  frequent than `os`. Note that `docs` appears as a *type* (`docs: add TESTING.md`), never
  as a scope.
- What the description must contain: the source citation, and a screenshot for a new or
  changed chrome style.
- The submission checklist, mirrored by the PR template.

## Accompanying changes

| file | change |
|------|--------|
| `.github/pull_request_template.md` | new — prefills the source citation, verification checkboxes, and a screenshot slot, so the evidence arrives with the PR instead of being requested |
| `docs/adding-os-data.md` | header note: links `CONTRIBUTING.md`, requires updating it in the same change |
| `docs/adding-a-preview-style.md` | same header note |
| `CLAUDE.md` | the mirror rule, binding agents editing either guide |
| `src/components/Footer.astro` | `Suggest a platform` mailto → `Add a platform`, href `${git.repoUrl}/blob/main/CONTRIBUTING.md`, degrading via `?? "#"` exactly like the adjacent `Source on GitHub` entry |
| `README.md` | short Contributing section linking to the guide |

The footer needs no new mechanism: `getGitInfo().repoUrl` (`src/lib/gitInfo.ts:28`)
already derives the GitHub repository URL from the origin remote and returns `null`
outside a checkout.

## Testing

The guide itself is prose and carries no tests. The accompanying changes are covered by
the existing suite:

- `npx astro check` and `npm run build` prove `Footer.astro` still compiles and every page
  pre-renders after the link swap.

`Footer.astro` has no test coverage today, and the link swap does not warrant adding a
suite for it: the component is static markup with no logic, and `astro check` plus a
successful build catch the only failure mode a one-line href change can produce.

The substantive verification is manual: follow the guide end to end for one invented
platform and confirm it reaches a passing local build without opening `docs/`. That walk
through is the acceptance test for "self-contained."

## Decisions and rejected alternatives

| decision | rejected alternative | why |
|----------|---------------------|-----|
| Self-contained guide | Front door delegating to `docs/` | Different audience and requirements; mid-flow handoffs fragment the read. Drift handled by the mirror rule instead. |
| Git-comfortable audience | Full git/GitHub tutorial; no-code issue path | Keeps the guide dense and repository-specific. |
| Any credible source | Primary sources only | A strict bar excludes obscure and lost platforms, which is where the archive has the most to gain. |
| Dither math inlined | Link out for the rare case | It is exactly the case a contributor cannot get right unaided, and silent wrongness is the failure mode. |
| Full field table inlined | Link out to `adding-os-data.md` | Inlining the dither math while linking out for what the fields are would be backwards. |
| New primitive linked out | Inline it | TypeScript and Preact work, past what a content guide should carry, and rarely needed. |
