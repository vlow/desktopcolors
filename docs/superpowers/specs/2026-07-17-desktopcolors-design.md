# desktopcolors.com — Design Spec

**Date:** 2026-07-17
**Status:** Approved for planning
**Source design:** Claude Design project *Desktop Colors Reference* (`3e2cd655-6216-4a72-b43c-f8c1789a4960`), imported and used as the visual reference. The proprietary DC runtime (`x-dc`, `sc-if`, `sc-for`, `DCLogic`, `dc-import`) is a prototype only and is **not** carried into the build.

## 1. Product summary

An archive of the solid desktop **background colors** shipped by classic operating systems and desktop
environments (Windows 95/NT4/2000/XP, Amiga Workbench, KDE 1/2, CDE, BeOS, Mac OS 8, …). Visitors browse
platforms and colors, open a color to see its values and a live desktop preview, copy the color code in
several formats, and download a solid-color wallpaper at any resolution. A synthetic popularity score ranks
colors and platforms.

This is a **real, public, self-hosted production site**, SEO-first.

## 2. Goals & non-goals

**Goals**
- Faithfully reproduce the prototype's pages and interactions in a real, maintainable stack.
- Excellent SEO: every platform and color reachable as pre-rendered HTML.
- Adding a new OS is a one-file operation (drop a JSON, rebuild).
- Real usage tracking driving a synthetic popularity score, with **no personal data stored**.
- Client-side wallpaper generation (the server never handles images).

**Non-goals (v1)**
- User accounts, comments, or submissions.
- Historical/trend charts of popularity (aggregates only; no event log).
- Horizontal scaling / multi-node (single box is sufficient).
- A CMS (content lives in versioned JSON files).

## 3. Architecture overview

Three parts on one Linux vServer:

```
                    ┌─────────────────── vServer (Linux) ───────────────────┐
  Browser  ──TLS──▶ │  nginx (:443)                                          │
                    │    ├── /       → static files  /var/www/desktopcolors  │
                    │    └── /api/*  → reverse-proxy → 127.0.0.1:8787         │
                    │                                                         │
                    │  counter service (Go static binary, systemd)           │
                    │      └── SQLite file (WAL)  — aggregate scores only     │
                    └─────────────────────────────────────────────────────┘
```

1. **Static site — Astro (SSG).** Every page pre-rendered to HTML at build time. Interactive parts are
   small **Preact** islands. No runtime dependency on the counter for the page to work.
2. **Counter service — Go single binary + SQLite (pure-Go driver, no cgo).** Two responsibilities:
   accept scoring events (`counter serve`) and dump current scores for the build (`counter dump`).
   Managed by systemd, bound to `127.0.0.1`.
3. **nginx** serves static files and reverse-proxies `/api/*` to the counter. Terminates TLS
   (Let's Encrypt). Anonymizes/omits client IPs in logs.

Wallpaper PNGs are generated **client-side** via canvas — the box never touches images.

### 3.1 Environment assumptions
- nginx already installed on the box.
- **Node not yet installed** — plan includes Node setup (for the Astro build) via NodeSource or nvm.
- **No domain/TLS yet** — plan includes DNS + Let's Encrypt (certbot) setup for nginx.
- Go toolchain needed at build time for the counter binary (or ship a prebuilt binary).

## 4. Content model — one JSON per OS (single source of truth)

OS data lives in `src/content/os/*.json`, one file per platform, as an **Astro content collection**
validated by a **Zod schema at build time**. `getCollection('os')` feeds every page; `getStaticPaths()`
generates one `/os/<slug>` page per file. Browse and Explorer derive their content from the same
collection. **Adding an OS = drop a JSON file and rebuild.**

The JSON stores only **facts**. All derived data (RGB/HSL, hue family, tone, closest RAL, "first known
use," "similar colors elsewhere," "same-era peers," merged-by-hex popularity) is **computed at build time**
by shared TS functions in `src/lib/`.

### 4.1 Schema (per OS file)

```jsonc
{
  "name": "Windows 95",              // required
  "slug": "windows-95",              // optional; defaults from filename
  "year": 1995,                      // required, integer
  "family": "Windows",              // required (e.g. Windows, Amiga, Desktop Env., Mac OS, BeOS)
  "tagline": "Teal defined the era — the first face millions saw at boot.", // required, short
  "description": "The OS that put a solid teal desktop in front of millions…", // required
  "predecessor": "windows-3-1",      // optional slug ref; must resolve to an existing OS at build
  "successor": "windows-98",         // optional slug ref; must resolve at build
  "desktopStyle": "win9x",           // optional: win9x | macos8 | kde | cde | amiga | generic (default generic)
  "colors": [                         // required, ≥1
    { "hex": "#008080", "name": "Teal", "index": "3", "note": "The signature default.", "default": true },
    { "hex": "#808080", "name": "Gray", "index": "8", "note": "A neutral desktop." }
  ]
}
```

**Validation rules (fail the build):** valid `#rrggbb` hex; `year` integer; non-empty required fields;
**at most one** color with `"default": true` (if none, the first color is treated as default);
`predecessor`/`successor`, when present, resolve to existing slugs.

### 4.2 Derived data (build-time, pure TS)
- **Color math:** hex→RGB→HSL; luminance → on-color (light/dark text over the swatch).
- **Hue family** (Reds/Oranges/…/Neutrals) and **tone** (Neon/Bright/Pastel/Muted/Dark) classification.
- **Closest RAL** classic color (nearest RGB distance against a small RAL table).
- **Merge by hex** across all platforms → the Explorer's per-color entries (name, platforms, year range).
- **Similar colors elsewhere:** nearest colors from *other* platforms by RGB distance.
- **Same-era peers:** platforms released within ±3 years, with their default color.
- **First known use:** earliest platform (by year) that shipped an exact hex.

## 5. Rendering model

**Static by default; islands only where there is real interaction.** Each island receives the full,
build-computed dataset (including baked score values) as props, so search / filter / sort / grouping run
**in-browser over data already present** — no API calls for reads, and no reorder "jump."

| Page | Static (Astro) | Island (Preact) |
|---|---|---|
| **Browse** `/` | header/nav, chrome, card/list HTML in baked order | search, card/list toggle, sort (re-sorts embedded data) |
| **OS detail** `/os/<slug>` | title, description, prev/next, color values, RAL, first-use, similar, era peers | color selector, live preview, copy-to-clipboard, download sheet, fullscreen viewer + keyboard nav |
| **Color Explorer** `/explorer` | header, chrome | grouping (hue/tone), family+shade filters, spectrum/popularity sort, leaderboard, fullscreen preview |
| **About** `/about`, **Setup Guide** `/setup` | fully static | — |

**Desktop preview component** draws fake desktop chrome (icons, taskbar) over the solid color, selected by
the OS's `desktopStyle` (win9x / macos8 / kde / cde / amiga → generic fallback). Used inline on the detail
page and in the fullscreen viewer.

**Framework choice:** Preact for islands — React-shaped (maps ~1:1 onto the prototype's `DCLogic`
components) but ~4 KB.

**Design tokens** extracted once from the `.dc` files into CSS custom properties: fonts (Space Grotesk,
IBM Plex Mono), `--bg #fafaf9`, `--ink #1c1917`, the stone gray scale, and the `oklch(0.55 0.17 255)`
accent. Shared across all pages instead of per-file inline styles.

## 6. Popularity scoring

Synthetic **points**, all starting at **0**, reflecting only real activity.

| Action (where) | Effect |
|---|---|
| Copy a color code **or** download a wallpaper (OS detail) | color[hex] **+3**, os[slug] **+3** |
| View an OS detail page | os[slug] **+1** |

- **Colors** are scored **by hex, globally** (drives the Explorer leaderboard).
- **OSes** are scored **by slug** (drives the "Popular" sort on Browse).
- The crediting OS is the page context where the action happened (unambiguous — copy/download originate on
  the OS detail page).

**UI display:** show `< 1k` until an entity reaches 1,000 points; at/above 1,000 show the formatted number
(e.g. `1.2k`). Formatting is applied at build time.

**Ordering freshness:** the **default** sort order and all labels are **baked into the build** from a score
snapshot, so first paint, SEO, and the no-JS case are always correct. A scheduled rebuild (systemd timer,
~hourly) regenerates the static site to refresh them. There is **no background fetch that reorders content
on its own** — the jarring reflow is avoided. When the user *actively* selects a different sort/filter, the
island re-sorts the dataset **already embedded in its props** (which includes the baked score values); that
reorder is user-initiated, not a surprise. Trade-off: scores lag by up to the rebuild interval, which is
acceptable for this archive.

## 7. Data flow

**Write path (browser → counter):**
1. Island fires a fire-and-forget `POST /api/event`.
2. nginx proxies to the Go service on `127.0.0.1:8787`.
3. Go validates, applies points, upserts SQLite (WAL mode).

```
POST /api/event
  kind="copy" | "download"  → requires {hex, os}  → color[hex]+=3 ; os[slug]+=3
  kind="osview"             → requires {os}        → os[slug]+=1
```

**SQLite schema (aggregates only — no PII, no event log):**
```sql
CREATE TABLE color_scores (hex  TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0);
CREATE TABLE os_scores    (slug TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0);
```

**Read path (build, not browser):** hourly systemd timer runs the rebuild:
`counter dump` → `scores.json` → `astro build` (reads content collections + `scores.json`, computes derived
data, bakes ordering + `<1k`/`1.2k` labels) → output **atomically swapped** into `/var/www` (build to temp
dir, then `mv`/symlink flip) so visitors never see a half-written site.

**Wallpaper generation (client-side):** the download sheet draws a canvas at the chosen resolution
(presets + custom W×H), fills the solid hex, `canvas.toBlob()` → downloads e.g.
`windows-95-teal-008080-1920x1080.png`, and fires the `download` event.

## 8. Privacy & rate limiting

**No personal data is ever stored.** SQLite holds only aggregate scores.

**Rate limiting (light, vanity-metric protection):** in-memory token bucket keyed by
`SHA-256(salt ‖ truncatedIP)` where:
- the IP (from nginx `X-Real-IP`/`X-Forwarded-For`) is **truncated first** — IPv4 → `/24`, IPv6 → `/64`;
- `salt` is random, generated **in memory at process start and rotated daily**, **never persisted or
  logged** (hashes are therefore unlinkable across days and non-reversible);
- the bucket map lives **in RAM only** with TTL eviction. **Nothing IP-derived touches disk.**

**nginx log anonymization:** a custom log format that omits/truncates the client address for this site
(or `access_log off;` on the `/api` location), so no raw IPs land in access logs either.

## 9. Error handling

- **Build:** Zod schema rejects bad OS JSON (invalid hex, missing fields, >1 default, unresolved
  predecessor/successor slug) and **fails the build**. Missing `scores.json` → build proceeds with all
  scores 0 and warns.
- **API:** malformed/absent fields → 400; unknown `kind` → 400; rate-limited → 429; SQLite error → 500
  (logged). Service down → site unaffected (writes silently no-op in the browser).
- **Client:** clipboard API unavailable → fallback + "copy manually" hint; canvas/download failure → small
  error toast.

## 10. Testing (TDD)

- **Go:** scoring rules, rate limiter (bucket + salt rotation), SQLite upserts (temp DB), handler
  happy/error paths.
- **Derivation (TS):** pure-function tests for hex→rgb→hsl, hue-family & tone classification, closest-RAL,
  similarity ranking, era peers, first-known-use, merge-by-hex.
- **Content:** a test asserting every committed OS JSON passes the schema.
- **E2E (Playwright smoke):** load Browse → search → open an OS → copy a value → generate + download a
  wallpaper → toggle sorts; assert event POSTs fire.

## 11. Repo layout

```
src/
  content/os/*.json          # one file per OS — source of truth
  content/config.ts          # Zod schema + referential checks
  lib/{color,derive,scores}.ts
  pages/{index,explorer,about,setup}.astro
  pages/os/[slug].astro
  components/*.astro          # static UI
  islands/*.tsx              # Preact: browse controls, explorer, os-detail, preview, download sheet
  styles/tokens.css
counter/                     # Go module: main, scoring, store, ratelimit + _test.go
deploy/
  desktopcolors.nginx.conf   # static + /api proxy + log anonymization
  counter.service            # systemd unit for `counter serve`
  counter-rebuild.service    # oneshot: counter dump + astro build + atomic swap
  counter-rebuild.timer      # ~hourly
  deploy.sh                  # git pull → build → swap → restart
  SETUP.md                   # Node install, Go build, DNS + Let's Encrypt steps
docs/superpowers/specs/
```

## 12. Deployment
- **First-time setup (SETUP.md):** install Node; build the Go counter (or drop in a prebuilt static
  binary); install systemd units; point DNS at the box; obtain a Let's Encrypt cert for nginx; install the
  nginx server block.
- **Deploys:** `deploy.sh` — git pull → `astro build` → atomic swap into `/var/www` → `systemctl restart
  counter` (only when the binary changed).
- **Rebuild cadence:** `counter-rebuild.timer` fires ~hourly to refresh baked scores.

## 13. Open items for the implementation plan
- Seed the catalog with the platforms present in the prototype (Windows 3.1/95/NT4/98/2000/XP, Amiga
  Workbench, CDE, BeOS, Mac OS 8, KDE 1/2), each as its own JSON file.
- Exact resolution presets for the download sheet (Desktop / Mobile / Classic groups from the prototype).
- The small RAL classic table used for nearest-color matching.
- Per-`desktopStyle` preview chrome details.
