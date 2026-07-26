# TESTING.md

How we decide **which layer** a test belongs in, and **what that layer can
actually prove** — the reasoning behind desktopcolors' test suites.

This guide is the **judgement** layer. It does not duplicate:

- [`README.md` → Test everything](README.md) — the commands to run.
- [`docs/architecture-frontend.md` → Testing](docs/architecture-frontend.md) —
  where test files live and why `lib/` is cheap to cover.

If those say _how to run the tests_, this file says _what to test where, and
which assertions are worth writing_.

The aim: a human or an LLM agent can pick the right layer from its **purpose**
alone, and avoid the specific traps this project has already been burned by.

## How to use this guide

### When adding a feature

1. Start at **The layers** below and pick the cheapest layer that can actually
   prove the behaviour. Most logic belongs in `lib/` and needs only vitest.
2. Walk the **Testing decisions**. For each, test its **Applies when** trigger
   against your change.
3. Write the test first and **watch it fail** (see **T4**). A test you never saw
   fail proves nothing.

### When fixing a bug

1. Reproduce it in a test at the layer that can see it. If no existing layer can
   see it, that is itself the finding — say so, and add the layer or the guard.
2. Confirm the new test fails against the **unfixed** code, then fix.
3. If the bug survived the existing suite, ask **why** the suite missed it and
   record the answer here as a decision. That question is the point of this file.

### Recording a decision

Lead with the **failure it prevents**, not the mechanism — a reader should learn
_when this bites_ before any API is mentioned. Give each entry a stable `T#` id
so code review and other docs can reference it. Use this template:

```
### T# — <short name>: <the failure it prevents>
- **Applies when** — the trigger(s).
- **Do** — the concrete practice, with the helper/file to use.
- **Don't** — the tempting shortcut, and why it fails.
- **Evidence** — how we know (the bug it let through, or the measurement).
```

Keep entries grounded. A decision belongs here once a real failure or a
measurement justifies it — not on the strength of a general principle.

## The layers

Four suites, in ascending cost. Each proves something the others cannot, and
each has a blind spot worth knowing before you pick one.

| Layer | Command | Proves | Blind to |
|---|---|---|---|
| **`lib/` unit** (vitest, jsdom) | `npm test` | Pure build-time logic: color math, derivation, catalog, scoring, wallpaper | Anything touching the DOM, layout, or the network |
| **Island unit** (vitest + `@testing-library/preact`) | `npm test` | Component behaviour: state, callbacks, ARIA attributes, conditional rendering | **All layout and CSS** — see **T1** |
| **E2E** (Playwright, real Chromium) | `npm run test:e2e` | Layout and overflow, cross-stack flows, beacons, downloads, static-HTML correctness | Cheap edge cases — slow, so keep it to what only a browser can see |
| **Counter** (Go) | `cd counter && go vet ./... && go test ./...` | The one service running at request time: scoring, rate limiting, store | The frontend entirely |

Rules of thumb:

- **Push logic down.** `lib/` is pure by design
  ([architecture](docs/architecture-frontend.md)); if a behaviour can be tested
  there, it should live there. That is why `lib/` coverage is exhaustive and E2E
  is a handful of tests.
- **Reach for E2E only for what needs a browser or the whole stack.** Layout,
  overflow, hydration, navigation, downloads, beacons.
- **Data shape is not a test's job.** `src/content/config.ts` is the Zod schema
  gate — a malformed OS entry must fail the build, not a test.
- **`deploy/` is outside these four suites.** `deploy/rebuild.test.sh` (run it
  with `bash deploy/rebuild.test.sh`) covers only the deploy script's
  orchestration — reset to the deploy branch, dependency gating, atomic publish,
  failure marker, prune — against a fixture repo with `npm`, `go`, `sudo`,
  `systemctl` and `flock` stubbed. It exists because two of that script's
  failure modes are invisible in review and expensive in production: publishing
  an empty release, and a failure marker that is never written or never cleared.
  Everything else about deployment — nginx, SELinux, logrotate, sudo, locking —
  is verified on the host by [`deploy/SETUP.md`](deploy/SETUP.md), not here.

## Testing decisions

### T1 — Layout belongs in Playwright, never jsdom: a CSS rule that never applied

- **Applies when** — a change concerns layout: grid/flex tracks, widths,
  overflow, wrapping, responsive breakpoints, or anything in a `@media` block in
  [`src/styles/tokens.css`](src/styles/tokens.css).

- **Do** — assert it in `e2e/smoke.spec.ts` with a real viewport. For overflow,
  the canonical check is:

  ```ts
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )).toBe(false);
  ```

- **Don't** — expect the vitest island tests to catch it. **jsdom has no layout
  engine.** It parses CSS but computes no geometry: every element reports zero
  size, `scrollWidth` is meaningless, and a `@media` block's contents are never
  applied. A jsdom test cannot fail on a layout bug, however obviously broken the
  page looks.

  jsdom *can* still cover the **JS** side of responsive behaviour, because
  `useIsNarrow()` reads `matchMedia` rather than geometry: override
  `window.matchMedia` before `render()` (see
  [`src/lib/useIsNarrow.test.tsx`](src/lib/useIsNarrow.test.tsx) and
  `src/test-setup.ts`, which stubs a desktop default). That proves the branch
  was taken — never that the result fits on screen.

- **Evidence** — checked directly against the installed jsdom: every geometry
  property (`clientWidth`, `offsetWidth`, `scrollWidth`,
  `getBoundingClientRect().width`) returns `0`, and a `@media` override is
  ignored even when its query *should* match jsdom's 1024px default window —
  `getComputedStyle()` returns the base rule's `500px`, never the override's
  `100px`.

  The bug this cost us: the mobile rules for `.dc-rank-row` (Colors leaderboard) were
  written, shipped, and **never once took effect**: the container set
  `minmax(660px, 1fr)`, whose minimum cannot shrink, so the row's `1fr` columns
  resolved against a 660px track and the page overflowed a 390px viewport by
  286px. 243 passing unit tests could not see it; the Playwright check in **T1**
  form fails immediately. Fixed in `a37c9e4`, written up in
  [`docs/superpowers/specs/2026-07-25-ungrouped-colors-mobile-design.md`](docs/superpowers/specs/2026-07-25-ungrouped-colors-mobile-design.md).

### T2 — Wait for island hydration before interacting: silently dropped clicks

- **Applies when** — an E2E test clicks, types into, or otherwise drives a
  Preact island (that is, nearly every E2E test).

- **Do** — `await islandsHydrated(page)` (helper in `e2e/smoke.spec.ts`) after
  `goto()` and before the first interaction. It waits for Astro to drop the
  `ssr` attribute from every `<astro-island>`, which is a deterministic mount
  signal rather than a timeout. Where a test's purpose is to assert
  server-rendered output, put the gate *after* those assertions and immediately
  before the interaction, so they still sample the pre-hydration DOM.

- **Don't** — assume `goto()` or a visible SSR element means the page is
  interactive. `page.goto()` resolves on `load`, and Playwright's actionability
  checks (visible / enabled / stable) **cannot see whether Preact has attached
  its event listeners**. An interaction landing before mount is dropped with no
  error at all; the test then fails at a later, unrelated-looking assertion.
  Don't paper over it with `waitForTimeout` either — that trades a flake for a
  slower flake.

- **Evidence** — instrumenting the suite caught a failing home-search run with
  `islandsPendingAtFill=2/2`: the input value was set to `"amiga"` but no
  `onInput` fired, so the list never filtered. Passing runs showed `0/2`. Which
  test loses the race is random — runs variously failed the download-sheet and
  copy-beacon tests instead. Measured hydration under the suite's 4 workers:
  ~124ms median on the production build the Playwright config serves, ~265ms
  against `astro dev` (61 unbundled module requests per page vs 8), against a
  first interaction at ~280–420ms. So dev was a coin flip and production's margin
  is real but unremarkable — this was latent, not dev-only. Fixed in `34d026f`.

### T3 — Assert the effect at the interaction, not downstream: the vacuous assertion

- **Applies when** — a test acts and then checks a consequence, especially after
  a filter, search, sort, or any state change that reduces a visible set.

- **Do** — assert something that can **only** be true if the action took effect.
  For a filter, the surviving **count** is that assertion:

  ```ts
  await expect(page.getByTestId("os-name")).toHaveCount(2); // 22 platforms unfiltered
  ```

- **Don't** — assert that an expected item is present when it is *also* present
  before the action. It cannot distinguish "the filter worked" from "nothing
  happened", so it passes vacuously and pushes the failure to a later assertion
  that reads as a different bug entirely.

- **Evidence** — the home-search test asserted `Amiga Workbench 1.x` was visible
  after filtering, but both Amiga cards are in the unfiltered list too. Proven
  deterministically by aborting all island JS so hydration could never happen:
  with the fill provably dropped, the old assertion **passed** (`visible: true`)
  while the count assertion failed (22, not 2). The real failure then surfaced
  two lines later as a confusing stable `Windows 95` count of 1.

### T4 — Watch the guard fail, on the path it will run: untested tests

- **Applies when** — adding any regression guard, and especially an E2E one.

- **Do** — confirm the new test fails against the **unfixed** code before
  committing the fix, and do it on the path the suite actually uses. The
  Playwright config serves a **production build**
  (`npm run build && npm run preview`), so verify there — temporarily revert the
  fix, watch it go red, restore, watch it go green.

- **Don't** — settle for "it passes now". A guard that never failed may be
  asserting nothing (see **T3**), and dev-server behaviour can differ materially
  from the built output (**T2**: 61 module requests vs 8, ~2× hydration latency).
  Equally, don't trust a *failure* until you have read it: a test can fail on a
  broken locator while the behaviour under test is fine.

- **Evidence** — the mobile-overflow guard was verified red against a production
  build with only the container fix reverted, then green with it restored. Its
  first failure, though, was a lost click from **T2** — not the overflow
  assertion at all. Reading the message rather than trusting the red is what
  surfaced the hydration bug that became **T2**.
