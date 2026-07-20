# desktopcolors.com

An archive of the solid desktop **background colors** shipped by classic operating systems and desktop
environments — the teal of Windows 95, the dusty blue of CDE, the four-color Amiga Workbench palette, and
more. Browse platforms and colors, preview any color as a full desktop, copy its HEX/RGB/HSL and closest
RAL match, and download a matching wallpaper at any resolution.

## Architecture

Three parts, designed so the site is fully static and the only runtime backend is a tiny counter:

```
                     ┌──────────────────── Linux vServer ────────────────────┐
   Browser  ──TLS──▶ │  nginx (:443)                                          │
     │               │    ├── /       → static files  /var/www/.../current    │
     │  fire-and-    │    └── /api/*  → reverse-proxy → 127.0.0.1:8787         │
     │  forget       │                                                        │
     └── beacon ────▶│  counter (Go static binary, systemd) ── SQLite (WAL)   │
        /api/event   │     • POST /api/event  (scoring)                        │
                     │     • counter dump     (scores.json for the build)      │
                     └────────────────────────────────────────────────────────┘
```

1. **Static site — Astro (SSG) + Preact islands.** Every page (Browse, each `/os/<slug>`, Color Explorer,
   About, Setup Guide) is pre-rendered to HTML at build time for SEO. Interactive bits are small Preact
   islands that receive the full, build-computed dataset as props and do all search/filter/sort **in the
   browser** — no read APIs at runtime.
2. **Counter — Go single binary + SQLite.** Records synthetic popularity **points** (copy/download = +3 to
   the color and +3 to the OS; viewing an OS page = +1 to the OS) and dumps them for the build. Stores only
   two aggregate tables — **no IP addresses, no per-request rows, no event log**.
3. **nginx** serves the static files and reverse-proxies `/api/*` to the localhost counter, with
   IP-anonymized access logs.

For a module-by-module map of each tier — packages, responsibilities, key interfaces, and where a
given change belongs — see **[`docs/architecture-frontend.md`](docs/architecture-frontend.md)** (the
static site) and **[`docs/architecture-edge.md`](docs/architecture-edge.md)** (the counter service).

**Data flow.** Popularity is *written* live (the browser fires a fire-and-forget `sendBeacon` to
`/api/event`) but *read* only at build time: a scheduled rebuild runs `counter dump` → `scores.json` →
`astro build` (which bakes the scores and ordering into the HTML) → an **atomic symlink swap** into the
served directory. So the site never queries the counter at request time, scores are always correct in the
shipped HTML (no client-side reorder flicker), and the site works even if the counter is down.

**Single source of truth.** Each OS is one JSON file in `src/content/os/`, validated by a Zod schema at
build time. Everything derived — RGB/HSL, hue family, multi-label OKLCH color types, closest RAL
(perceptual **OKLab** distance), "first known use", "similar colors elsewhere", same-era peers, merged-by-hex
popularity — is computed at build time by pure, unit-tested TypeScript in `src/lib/`.

**Privacy.** Wallpapers are generated in the browser via `<canvas>` (the server never touches images). The
counter keeps only aggregate scores; its rate limiter keys on `SHA-256(rotating-salt ‖ truncated-IP)` in
memory only and never persists or logs anything IP-derived. nginx logs are IP-anonymized.

## Repository layout

```
src/
  content/os/*.json      # one JSON per platform — the source of truth (+ Zod schema in config.ts)
  lib/                   # pure, tested build-time logic (color, derive, catalog, explorer, detail, scores, wallpaper, track)
  islands/*.tsx          # Preact interactive components (Browse controls, OsDetail, Explorer, DownloadSheet, previews, MobileNav, SetupGuide)
  components/ layouts/    # static Astro shell (Header, Base)
  pages/                 # routes: index, explorer, about, setup, os/[slug]
  styles/tokens.css      # design tokens
counter/                 # Go module: cmd (serve|dump) + internal/{scoring,store,ratelimit,server}
deploy/                  # rebuild.sh, nginx conf, systemd units, SETUP.md (deployment runbook)
e2e/                     # Playwright cross-stack smoke test
docs/                    # adding-a-preview-style.md guide; superpowers/ = design spec + implementation plans
.github/workflows/ci.yml # CI: astro check + vitest + build, go vet + test, Playwright e2e
```

## Prerequisites

- **Node ≥ 20** (see `.nvmrc`)
- **Go ≥ 1.25** (required by the `modernc.org/sqlite` driver; only needed to build/run the counter)

## Run locally

Install dependencies once:

```bash
npm install
```

### The site

```bash
npm run dev        # dev server with HMR at http://localhost:4321
# or, to serve the real production build:
npm run build && npm run preview
```

In `dev`/`preview` there is no `/api` proxy, so popularity beacons simply no-op (they're fire-and-forget by
design) — the site is fully functional without the counter. Scores default to `< 1k` when no `scores.json`
is present.

### The counter (optional, for exercising `/api/event`)

```bash
cd counter
go build -o counter .          # or: CGO_ENABLED=0 go build -o counter .  (static binary)
./counter serve --db /tmp/counter.db --addr 127.0.0.1:8787

# in another shell — record an event and read scores back:
curl -X POST http://127.0.0.1:8787/api/event \
  -H 'Content-Type: application/json' \
  -d '{"kind":"copy","hex":"#008080","os":"windows-95"}'      # -> 204
./counter dump --db /tmp/counter.db --out -                    # prints scores.json
```

To bake live scores into a local build: dump to the repo root, then build.

```bash
cd counter && ./counter dump --db /tmp/counter.db --out ../scores.json && cd ..
npm run build   # loadScores() reads ./scores.json and bakes it in
```

The full `dump → build → atomic-swap` production pipeline is `deploy/rebuild.sh`.

## Test everything

```bash
npm run check      # astro check — full TypeScript + .astro type checking
npm test           # vitest unit suite (color math, derivation, catalog, islands, scores, wallpaper, track)
npm run build      # verify all pages pre-render
npm run test:e2e   # Playwright: builds + previews the site, drives Chromium, asserts the
                   # copy/download/osview beacons fire with the right payload and a wallpaper downloads
                   # (first run: npx playwright install chromium)

cd counter && go vet ./... && go test ./...   # counter unit tests
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR.

## Adding a new OS

1. Drop a JSON file in `src/content/os/`, e.g. `beos.json`:
   ```json
   {
     "name": "BeOS", "year": 1995, "family": "BeOS",
     "tagline": "…", "description": "…",
     "colors": [
       { "hex": "#33aabb", "name": "Cyan", "note": "…", "default": true },
       { "hex": "#dedede", "name": "Light Gray" }
     ]
   }
   ```
   (`slug` defaults to the filename; `predecessor`/`successor` are optional slug refs; `desktopStyle` is
   optional and defaults to `modern` — the platform-neutral default preview — or one of
   `win9x | macos8 | kde | cde | amiga | generic`, see [Adding a preview style](#adding-a-preview-style).)
2. `npm run build`. The Zod schema validates the file (a bad hex, missing field, >1 default, or dangling
   predecessor/successor **fails the build**), and the new platform automatically flows into Browse, the
   Explorer, similarity matches, and era sections — no other edits needed.

## Adding a preview style

`desktopStyle` picks the schematic desktop chrome (icons, taskbar, menu bar, …) drawn behind a color on the
detail and fullscreen previews. To point a platform at an existing style, just set `"desktopStyle"` in its
JSON. To add a **new** style, add its name to `DESKTOP_STYLES` (`src/lib/desktopStyle.ts`) and an entry to
the type-checked `STYLE_CHROME` registry (`src/islands/DesktopPreview.tsx`) — a missing entry fails the
build. See the full guide, written for humans and LLM agents, in
**[`docs/adding-a-preview-style.md`](docs/adding-a-preview-style.md)**.

## Deploy

See **[`deploy/SETUP.md`](deploy/SETUP.md)** for the full runbook (Go/Node install, service user, systemd
units, nginx + Let's Encrypt, first publish, and end-to-end verification).

## Design & plans

The design spec and the four implementation plans live in
[`docs/superpowers/`](docs/superpowers/) — start with the
[design spec](docs/superpowers/specs/2026-07-17-desktopcolors-design.md).
