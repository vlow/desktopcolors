# robots.txt and sitemap — design

**Date:** 2026-08-09
**Status:** approved, ready for implementation planning

## Problem

The site ships neither a `robots.txt` nor a `sitemap.xml`. A `grep -ri "robots\|sitemap"`
over the repository returns nothing.

Every page is pre-rendered to HTML at build time explicitly so it can be indexed
(`README.md`, "Static site — Astro (SSG)"), so the absence is an oversight rather than a
decision. Two concrete costs:

1. Each crawler request for `/robots.txt` is a 404 in
   `/var/log/nginx/desktopcolors/error.log`. That log keeps **full** client IPs and is
   retained 7 days (`deploy/desktopcolors.nginx.conf`,
   `deploy/desktopcolors.logrotate`) — it exists to surface broken links, and a
   permanent, expected 404 is noise in exactly the place that is supposed to be signal.
2. Crawlers reach the ~704 generated pages only by following in-page links. There is no
   machine-readable inventory of what exists.

## Goal

A `robots.txt` that welcomes crawlers and points at a generated sitemap, both produced by
the normal build and carried to production by the existing deploy path with no change to
`deploy/`.

## Decisions

### All crawlers are welcome

No AI/LLM crawler blocklist, no search-engine allowlist. The site is a public archive of
historical colors; being quoted by an answer engine serves its purpose rather than
undermining it.

This is also the only variant that stays correct without maintenance. A named blocklist
(`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, …) is stale the day a new crawler
ships, and an allowlist blocks harmless bots — archive.org, feed readers, link
previews — as collateral.

Rejected: blocking AI training crawlers; allowlisting only search engines.

### The only `Disallow` is `/api/`

`/api/event` accepts the popularity beacon and nothing else. There is no document to
crawl, and a crawling `GET` produces an error-log entry — the log the first cost above is
about. One line removes it.

`/os/<slug>/view.json` is deliberately **not** disallowed. It is fetched by JavaScript at
runtime and linked from no page, so crawlers rarely encounter it. Excluding it would need
a wildcard path (`/os/*/view.json`), which is not part of the original robots.txt
specification and is honoured inconsistently — a rule that mostly does not apply, for a
problem that does not occur. It is kept out of the *sitemap* instead, where exclusion is
exact (see below).

### The sitemap comes from `@astrojs/sitemap`

A `Sitemap:` line pointing at nothing is worse than no line, so the sitemap is part of
this work rather than a follow-up.

`@astrojs/sitemap` is the official integration, needs one line of config, and `site` is
already set in `astro.config.mjs` — its only prerequisite. Rejected: a hand-written
`src/pages/sitemap.xml.ts` over the content catalog, which avoids a dependency but adds
maintained, testable code for what an integration does correctly.

## Design

### `public/robots.txt`

`astro build` copies `public/` into `dist/` verbatim, so the file needs no Astro code.

```
# desktopcolors.com
# Everything here is a public, static archive and is meant to be indexed.
# Deliberately minimal: no bot allowlist to go stale.

User-agent: *
Disallow: /api/

Sitemap: https://desktopcolors.com/sitemap-index.xml
```

The absolute `Sitemap:` URL is required by the sitemap protocol; it matches `site` in
`astro.config.mjs`.

### `astro.config.mjs`

```js
import sitemap from "@astrojs/sitemap";

integrations: [
  preact(),
  sitemap({ filter: (page) => !page.endsWith("/view.json") }),
],
```

Adds `@astrojs/sitemap` to `dependencies` (and `package-lock.json`). The build then emits
`sitemap-index.xml` plus `sitemap-0.xml` covering the ~704 HTML pages.

The `filter` is the part that is easy to miss: the integration enumerates **every**
generated route, and `src/pages/os/[slug]/view.json.ts` produces one route per OS. Without
the filter those JSON endpoints would be advertised as indexable pages.

### Deployment — unchanged

`deploy/rebuild.sh:291` does `cp -R dist "$rel.tmp"` and then swaps the release symlink
atomically, so both artefacts ship with the next scheduled rebuild. nginx's
`location /` already resolves them through `try_files $uri $uri/index.html $uri/ =404`.
No file under `deploy/` is touched.

## Testing

One test in `e2e/smoke.spec.ts`. Playwright is the layer that sees build artefacts served
over HTTP; the vitest suites see neither (`TESTING.md`, "The layers").

The test fetches `/robots.txt`, asserts a 200 and that a `Sitemap:` line is present, then
fetches **the URL that line names** and asserts a 200.

Following the line rather than asserting a hardcoded path is the point: it is what fails
when the sitemap path is mistyped, when the integration is dropped from
`astro.config.mjs`, or when a future Astro version renames the emitted index. Asserting
`/sitemap-index.xml` directly would pass while `robots.txt` pointed somewhere else.

Per `TESTING.md` § "Watch the guard fail" (T4), the assertion is confirmed to fail before
it is confirmed to pass — verify by temporarily breaking the `Sitemap:` URL.

## Documentation

One entry in `docs/architecture-frontend.md` where build output is described: `robots.txt`
ships from `public/`, the sitemap is generated by `@astrojs/sitemap`, and the `view.json`
filter is deliberate.

`CONTRIBUTING.md` mirrors only the OS-data and chrome-spec material (`CLAUDE.md`), none of
which this touches — no mirrored change is needed.

## Out of scope

- Per-crawler rules of any kind, including `Crawl-delay`.
- `<meta name="robots">` on individual pages.
- Submitting the sitemap to Google Search Console or Bing Webmaster Tools.
- Any change to nginx, systemd, or `deploy/rebuild.sh`.
