# desktopcolors.com — Plan 4: Integration & Deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the static site (Plans 1–2) to the counter service (Plan 3) and ship the whole thing to the Linux vServer. Wire the site's `track()` seam to `POST /api/event`; build the rebuild pipeline (`counter dump` → `astro build` → atomic swap); author the nginx reverse-proxy (with IP-anonymized logs), systemd units (counter service + hourly rebuild timer), a full deployment runbook, a CI workflow, and a Playwright end-to-end smoke test.

**Architecture:** The site stays fully static; the only runtime coupling is the browser firing fire-and-forget beacons to `/api/event`, which nginx reverse-proxies to the localhost counter. Popularity is read only at build time: an hourly systemd timer runs `counter dump` → `scores.json`, rebuilds the site, and atomically swaps the new release under `/var/www` (symlink flip) so visitors never see a half-written site. TLS and static serving are nginx's job; the counter binds localhost and never sees a raw client IP it persists.

**Tech Stack:** Existing Astro site + Go counter; adds `@astrojs/check` (build-time type checking), `@playwright/test` (E2E), a GitHub Actions workflow, a bash rebuild script, an nginx server block, and systemd unit files. Deployment target: Debian/Ubuntu-family Linux with nginx already installed.

## Global Constraints

- **Two verification natures — be honest about which applies per task:**
  - **Dev-verifiable** (runs on this machine in execution): Tasks 1 (track wiring), 2 (astro check + CI file), 3 (rebuild script, run against temp dirs), 7 (Playwright E2E), 8 (final gate). These have real green-test gates.
  - **Box-verifiable only** (authored on this machine; verified on the vServer): Tasks 4 (nginx), 5 (systemd), 6 (SETUP runbook). The implementer AUTHORS these files and sanity-checks syntax where a local tool exists, but their real verification (`nginx -t`, `systemd-analyze verify`, `curl https://desktopcolors.com`) happens on the server and is documented, NOT faked on the Mac. Do not run `systemctl`/`nginx` against the dev machine.
- **`track()` is fire-and-forget and must never disrupt the UI.** Prefer `navigator.sendBeacon`; fall back to `fetch(..., {keepalive:true})`; swallow all errors; no-op during SSR/build (`typeof window === "undefined"`). It posts to the same-origin path `/api/event`.
- **The counter contract is fixed by Plan 3** — `POST /api/event` with `{kind,hex,os}` (or `{kind:"osview",os}`), 204 on success. Do not change the counter; this plan only calls it.
- **`scores.json` lives at the repo root at build time** (Plan 1 `loadScores()` default path is `scores.json` in the build cwd). The rebuild writes it there before `astro build`.
- **Atomic publish:** build to `dist/`, copy into a timestamped release dir, then flip a `current` symlink with an atomic `mv -T`. nginx's root is the `current` symlink. Never build in place under the served directory.
- **nginx logs must be IP-anonymized** (truncate IPv4 to /24 in the log format) and `/api/` access logging is off entirely. The counter already anonymizes internally; nginx must not leak raw IPs to disk either.
- **Go ≥ 1.25 and Node ≥ 20 on the vServer** (Go 1.25 is the modernc.org/sqlite floor from Plan 3). The runbook installs both.
- **No secrets in the repo.** TLS certs are obtained on the box via certbot; no keys committed.
- Commit after every task with a `feat:`/`test:`/`chore:`/`docs:` prefixed message.

## File structure (created across this plan)

```
src/lib/track.ts              # MODIFY: no-op seam -> sendBeacon/fetch to /api/event
src/lib/track.test.ts         # NEW: TDD for the beacon wiring
package.json                  # MODIFY: add "check" script + @astrojs/check, @playwright/test devDeps
.github/workflows/ci.yml      # NEW: astro check + vitest + go test/vet
playwright.config.ts          # NEW: build+preview webServer, chromium
e2e/smoke.spec.ts             # NEW: cross-stack smoke intercepting /api/event
deploy/
  rebuild.sh                  # NEW: dump -> build -> atomic swap (parameterized, dev-testable)
  desktopcolors.nginx.conf    # NEW: static + /api proxy + anonymized logs (box-verified)
  counter.service             # NEW: systemd unit for `counter serve` (box-verified)
  counter-rebuild.service     # NEW: systemd oneshot running rebuild.sh (box-verified)
  counter-rebuild.timer       # NEW: ~hourly timer (box-verified)
  SETUP.md                    # NEW: deployment runbook (Go/Node install, DNS, certbot, first deploy)
```

---

### Task 1: Wire `track()` to POST /api/event (TDD)

**Files:**
- Modify: `src/lib/track.ts`
- Test: `src/lib/track.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `track(event: TrackEvent): void` now sends the event to `/api/event` via `navigator.sendBeacon` (preferred) or `fetch` (fallback), fire-and-forget, browser-only. `TrackEvent` type unchanged. Exports an unexported-made-testable seam via the two code paths (tested by stubbing `navigator.sendBeacon` / `globalThis.fetch`).

- [ ] **Step 1: Write the failing test `src/lib/track.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { track } from "./track";

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error cleanup optional beacon stub
  delete navigator.sendBeacon;
});

describe("track", () => {
  it("uses navigator.sendBeacon when available, posting to /api/event", () => {
    const beacon = vi.fn(() => true);
    // @ts-expect-error assign stub
    navigator.sendBeacon = beacon;
    track({ kind: "copy", hex: "#008080", os: "windows-95" });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/event");
  });

  it("sends the event payload as the beacon body", async () => {
    let captured = "";
    const beacon = vi.fn((_url: string, body: Blob) => { captured = "blob"; void body; return true; });
    // @ts-expect-error assign stub
    navigator.sendBeacon = beacon;
    track({ kind: "osview", os: "kde-2" });
    expect(beacon).toHaveBeenCalledWith("/api/event", expect.any(Blob));
    expect(captured).toBe("blob");
  });

  it("falls back to fetch with keepalive when sendBeacon is absent", () => {
    // ensure no beacon
    // @ts-expect-error cleanup
    delete navigator.sendBeacon;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    track({ kind: "download", hex: "#3a6ea5", os: "windows-nt-4-0" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/event");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init.body)).toEqual({ kind: "download", hex: "#3a6ea5", os: "windows-nt-4-0" });
  });

  it("never throws when transports fail", () => {
    const beacon = vi.fn(() => { throw new Error("boom"); });
    // @ts-expect-error assign stub
    navigator.sendBeacon = beacon;
    expect(() => track({ kind: "osview", os: "kde-2" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/track.test.ts`
Expected: FAIL — current `track` is a no-op that never calls sendBeacon/fetch.

- [ ] **Step 3: Implement `src/lib/track.ts`**

```ts
export type TrackEvent =
  | { kind: "copy"; hex: string; os: string }
  | { kind: "download"; hex: string; os: string }
  | { kind: "osview"; os: string };

const ENDPOINT = "/api/event";

/**
 * Fire-and-forget popularity beacon. Prefers navigator.sendBeacon (survives
 * page unload), falls back to fetch with keepalive. Browser-only; a no-op
 * during SSR/build. Never throws — tracking must not disrupt the UI.
 */
export function track(event: TrackEvent): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify(event);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    if (typeof fetch === "function") {
      void fetch(ENDPOINT, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    }
  } catch {
    /* fire-and-forget: swallow everything */
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/track.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Run the full suite (no regressions in the islands that call track)**

Run: `npm test`
Expected: all green — the OsDetail/DownloadSheet island tests still pass (track no longer no-ops, but stays non-throwing in jsdom where sendBeacon is absent and a relative-URL fetch rejects harmlessly).

- [ ] **Step 6: Commit**

```bash
git add src/lib/track.ts src/lib/track.test.ts
git commit -m "feat: send popularity beacons to /api/event"
```

---

### Task 2: Build-time type checking + CI workflow

**Files:**
- Modify: `package.json` (add `check` script; add `@astrojs/check` + `typescript` devDeps if missing)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm run check` → `astro check` (full TS + `.astro` type checking, stricter than `astro build`); a CI workflow running check + vitest + Go tests on push/PR.
- Note: this is the FIRST time `astro check` runs against the codebase. It may surface latent type issues that `astro build` (transpile-only) never caught. **Resolving anything it flags is part of this task.**

- [ ] **Step 1: Add the dependency and script**

Run:
```bash
npm install --save-dev @astrojs/check typescript
```
(Astro's `check` needs `@astrojs/check` and a `typescript` install.) Then add to `package.json` `scripts`:
```json
    "check": "astro check"
```

- [ ] **Step 2: Run astro check and resolve anything it reports**

Run: `npm run check`
Expected: ideally `0 errors`. If it reports type errors in existing `src/` code, FIX them (they are real — `astro build` doesn't full-type-check). Keep fixes minimal and type-correct; do not silence with `any` or `@ts-ignore` unless a genuine Astro-types limitation with a one-line justification. Re-run until `0 errors, 0 warnings` (hints are acceptable). If a surfaced error is non-trivial or ambiguous, STOP and report it with the exact message rather than guessing.

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm run build

  counter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
      - working-directory: counter
        run: go vet ./...
      - working-directory: counter
        run: go test ./...
```

- [ ] **Step 4: Verify the site commands the workflow runs all pass locally**

Run: `npm run check && npm test && npm run build`
Expected: all succeed (this mirrors the `site` job). The `counter` job commands were verified in Plan 3.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .github/workflows/ci.yml src/
git commit -m "chore: add astro check and CI workflow"
```

Note: with no git remote configured yet, the workflow activates once the repo is pushed to GitHub — it is authored now so it runs from the first push.

---

### Task 3: Rebuild pipeline script (dump → build → atomic swap)

**Files:**
- Create: `deploy/rebuild.sh`

**Interfaces:**
- Produces: `deploy/rebuild.sh` — parameterized by environment variables so it is testable locally and reused by the systemd timer:
  - `REPO_DIR` (default `/opt/desktopcolors`), `WWW_DIR` (default `/var/www/desktopcolors`), `DB_PATH` (default `/var/lib/desktopcolors/counter.db`), `COUNTER_BIN` (default `$REPO_DIR/counter/counter`), `INSTALL_CMD` (default `npm ci --no-audit --no-fund`), `KEEP` (default `5`).
  - Steps: dump scores → `$REPO_DIR/scores.json`; install deps; `npm run build`; copy `dist/` into `$WWW_DIR/releases/<UTC timestamp>`; atomically flip `$WWW_DIR/current` → the new release; prune all but the newest `$KEEP` releases.
- Verified locally against temp dirs (real dump + build + swap), and on the box by the systemd timer.

- [ ] **Step 1: Create `deploy/rebuild.sh`**

```bash
#!/usr/bin/env bash
# Rebuild and atomically publish desktopcolors.com.
# Safe to re-run; each run publishes a fresh timestamped release and flips the
# `current` symlink that nginx serves.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/desktopcolors}"
WWW_DIR="${WWW_DIR:-/var/www/desktopcolors}"
DB_PATH="${DB_PATH:-/var/lib/desktopcolors/counter.db}"
COUNTER_BIN="${COUNTER_BIN:-$REPO_DIR/counter/counter}"
INSTALL_CMD="${INSTALL_CMD:-npm ci --no-audit --no-fund}"
KEEP="${KEEP:-5}"

log() { printf '[rebuild] %s\n' "$*"; }

cd "$REPO_DIR"

# 1. Dump current popularity scores for the build to bake in.
#    A missing DB is fine on first run: the site reads all-zero scores.
if [ -f "$COUNTER_BIN" ]; then
  "$COUNTER_BIN" dump --db "$DB_PATH" --out "$REPO_DIR/scores.json" || log "dump failed; building with existing/empty scores.json"
else
  log "counter binary not found at $COUNTER_BIN; building with existing/empty scores.json"
fi

# 2. Install deps and build.
log "installing deps"
eval "$INSTALL_CMD"
log "building"
npm run build

# 3. Publish atomically: copy dist into a new release, then flip the symlink.
ts="$(date -u +%Y%m%d%H%M%S)"
rel="$WWW_DIR/releases/$ts"
mkdir -p "$rel"
cp -a dist/. "$rel/"
ln -sfn "$rel" "$WWW_DIR/current.tmp"
mv -Tf "$WWW_DIR/current.tmp" "$WWW_DIR/current"
log "published release $ts"

# 4. Prune old releases, keeping the newest $KEEP.
if [ -d "$WWW_DIR/releases" ]; then
  # shellcheck disable=SC2012
  ls -1dt "$WWW_DIR"/releases/*/ 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    log "pruning $old"
    rm -rf "$old"
  done
fi
log "done"
```

- [ ] **Step 2: Make it executable and shellcheck it (if available)**

Run:
```bash
chmod +x deploy/rebuild.sh
command -v shellcheck >/dev/null && shellcheck deploy/rebuild.sh || echo "shellcheck not installed; skipping (fine)"
```
Expected: executable bit set; shellcheck (if present) reports no errors (the one `SC2012` is explicitly disabled).

- [ ] **Step 3: Verify the full pipeline locally against temp dirs**

This runs the REAL dump + build + atomic swap against throwaway directories, using the counter binary built in Plan 3 (build it if absent). Deps are already installed, so `INSTALL_CMD=true` skips reinstalling.

Run:
```bash
# ensure the counter binary exists
[ -f counter/counter ] || (cd counter && CGO_ENABLED=0 go build -o counter .)
# seed a tiny DB with one event via the counter
rm -rf /tmp/dc-www /tmp/dc.db*; 
counter/counter serve --db /tmp/dc.db --addr 127.0.0.1:8791 & SRV=$!
for i in $(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:8791/healthz && break; sleep 0.2; done
curl -sS -o /dev/null -X POST http://127.0.0.1:8791/api/event -d '{"kind":"copy","hex":"#008080","os":"windows-95"}'
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
# run the rebuild against temp dirs
REPO_DIR="$PWD" WWW_DIR=/tmp/dc-www DB_PATH=/tmp/dc.db COUNTER_BIN="$PWD/counter/counter" INSTALL_CMD=true KEEP=2 bash deploy/rebuild.sh
# assertions
test -L /tmp/dc-www/current && echo "current is a symlink OK"
test -f /tmp/dc-www/current/index.html && echo "published index OK"
grep -q "windows-95" /tmp/dc-www/current/index.html && echo "content OK"
grep -q '"#008080"' scores.json && echo "scores dumped OK"
```
Expected: prints all four OK lines. `scores.json` contains the teal score; the published `current/index.html` is the built home page. Clean up: `rm -rf /tmp/dc-www /tmp/dc.db* scores.json` (do NOT commit scores.json — it is git-ignored).

- [ ] **Step 4: Commit**

```bash
git add deploy/rebuild.sh
git commit -m "feat: add atomic rebuild-and-publish pipeline script"
```

---

### Task 4: nginx server block (box-verified)

**Files:**
- Create: `deploy/desktopcolors.nginx.conf`

**Interfaces:**
- Produces: an nginx `server` block serving the static `current` release, reverse-proxying `/api/` to the localhost counter, with IP-anonymized access logs. This file is AUTHORED here; it is verified on the box with `nginx -t` (see Task 6). Do NOT run nginx on the dev machine.

- [ ] **Step 1: Create `deploy/desktopcolors.nginx.conf`**

```nginx
# desktopcolors.com — nginx server block.
# Install to /etc/nginx/sites-available/desktopcolors and symlink into
# sites-enabled. The `map` below must live at http{} scope; if your nginx
# includes sites from within http{}, keep the map here (it is valid at that
# include point). Run `nginx -t` after installing.

# Anonymize client IPs in logs: truncate IPv4 to /24, collapse IPv6, default 0.
map $remote_addr $remote_addr_anon {
    ~(?P<v4>\d+\.\d+\.\d+)\.\d+      $v4.0;
    ~(?P<v6>[0-9a-fA-F]+:[0-9a-fA-F]+): $v6::;
    default                          0.0.0.0;
}
log_format anon '$remote_addr_anon - - [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" "$http_user_agent"';

server {
    listen 80;
    listen [::]:80;
    server_name desktopcolors.com www.desktopcolors.com;
    # certbot will manage the redirect to HTTPS; until then this serves too.
    location / { return 301 https://desktopcolors.com$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name desktopcolors.com www.desktopcolors.com;

    # ssl_certificate / ssl_certificate_key lines are added by certbot --nginx.

    root /var/www/desktopcolors/current;
    index index.html;

    access_log /var/log/nginx/desktopcolors.access.log anon;
    error_log  /var/log/nginx/desktopcolors.error.log;

    # Redirect the www host to the bare domain.
    if ($host = www.desktopcolors.com) { return 301 https://desktopcolors.com$request_uri; }

    # Popularity beacons -> localhost counter. No access logging (no IPs to disk).
    location = /api/event {
        access_log off;
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 5s;
    }

    # Hashed Astro assets are immutable — cache hard.
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Static site with directory-style URLs (Astro emits <path>/index.html).
    location / {
        try_files $uri $uri/index.html $uri/ =404;
    }

    # Downloadable wallpapers are generated client-side; nothing to serve here.
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

- [ ] **Step 2: Best-effort local syntax sanity (optional)**

Run: `command -v nginx >/dev/null && nginx -t -c "$PWD/deploy/desktopcolors.nginx.conf" 2>&1 | head -5 || echo "nginx not on dev machine; will verify on the box (Task 6)"`
Expected: on the Mac, prints the "will verify on the box" line (nginx isn't installed, and the file references paths/certs that only exist on the server). This is expected — real verification is `nginx -t` on the vServer.

- [ ] **Step 3: Commit**

```bash
git add deploy/desktopcolors.nginx.conf
git commit -m "feat: add nginx server block with anonymized logs and /api proxy"
```

---

### Task 5: systemd units (box-verified)

**Files:**
- Create: `deploy/counter.service`
- Create: `deploy/counter-rebuild.service`
- Create: `deploy/counter-rebuild.timer`

**Interfaces:**
- Produces: a long-running service for `counter serve`, plus a oneshot service + timer that runs `rebuild.sh` ~hourly. Authored here; verified on the box (`systemd-analyze verify`, `systemctl status`). Assumes a dedicated system user `desktopcolors` (created in Task 6).

- [ ] **Step 1: Create `deploy/counter.service`**

```ini
[Unit]
Description=desktopcolors.com popularity counter
After=network.target

[Service]
Type=simple
User=desktopcolors
Group=desktopcolors
ExecStart=/opt/desktopcolors/counter/counter serve --db /var/lib/desktopcolors/counter.db --addr 127.0.0.1:8787
Restart=always
RestartSec=2
# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/desktopcolors
StateDirectory=desktopcolors

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Create `deploy/counter-rebuild.service`**

```ini
[Unit]
Description=Rebuild and publish desktopcolors.com (dump scores, build, atomic swap)
After=network.target counter.service
Wants=counter.service

[Service]
Type=oneshot
User=desktopcolors
Group=desktopcolors
WorkingDirectory=/opt/desktopcolors
Environment=REPO_DIR=/opt/desktopcolors
Environment=WWW_DIR=/var/www/desktopcolors
Environment=DB_PATH=/var/lib/desktopcolors/counter.db
Environment=COUNTER_BIN=/opt/desktopcolors/counter/counter
ExecStart=/usr/bin/env bash /opt/desktopcolors/deploy/rebuild.sh
# Build + publish needs to write the release dir and the repo's node_modules/dist.
ReadWritePaths=/var/www/desktopcolors /opt/desktopcolors
```

- [ ] **Step 3: Create `deploy/counter-rebuild.timer`**

```ini
[Unit]
Description=Hourly rebuild of desktopcolors.com

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: Best-effort local validation (optional)**

Run: `command -v systemd-analyze >/dev/null && systemd-analyze verify deploy/counter.service deploy/counter-rebuild.service deploy/counter-rebuild.timer || echo "systemd not on dev machine (macOS); will verify on the box (Task 6)"`
Expected: on the Mac, prints the "will verify on the box" line. Real verification is on the Linux server.

- [ ] **Step 5: Commit**

```bash
git add deploy/counter.service deploy/counter-rebuild.service deploy/counter-rebuild.timer
git commit -m "feat: add systemd units for counter service and rebuild timer"
```

---

### Task 6: Deployment runbook (SETUP.md)

**Files:**
- Create: `deploy/SETUP.md`

**Interfaces:**
- Produces: a step-by-step runbook to deploy from scratch on the Debian/Ubuntu vServer. Documentation only; no code gate. Must be accurate to the files authored in Tasks 3–5 (paths, user, ports, env vars).

- [ ] **Step 1: Create `deploy/SETUP.md`**

````markdown
# Deploying desktopcolors.com

Target: a Debian/Ubuntu Linux vServer with **nginx already installed**. All
commands are run as root (or via sudo). Replace `desktopcolors.com` if needed.

## 1. Install toolchains

```bash
# Go >= 1.25 (modernc.org/sqlite floor)
curl -fsSL https://go.dev/dl/go1.25.0.linux-amd64.tar.gz -o /tmp/go.tgz
rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tgz
echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh && . /etc/profile.d/go.sh
go version   # go1.25.x

# Node >= 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v      # v20.x
```

## 2. Create the service user and directories

```bash
useradd --system --home /opt/desktopcolors --shell /usr/sbin/nologin desktopcolors || true
mkdir -p /opt/desktopcolors /var/www/desktopcolors/releases /var/lib/desktopcolors
```

## 3. Get the code and build

```bash
git clone <your-repo-url> /opt/desktopcolors
cd /opt/desktopcolors
npm ci
(cd counter && CGO_ENABLED=0 go build -o counter .)
chown -R desktopcolors:desktopcolors /opt/desktopcolors /var/www/desktopcolors /var/lib/desktopcolors
```

## 4. Install systemd units

```bash
cp deploy/counter.service deploy/counter-rebuild.service deploy/counter-rebuild.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/counter.service        # sanity check
systemctl daemon-reload
systemctl enable --now counter.service
systemctl enable --now counter-rebuild.timer
systemctl status counter.service --no-pager
curl -fsS http://127.0.0.1:8787/healthz && echo   # -> ok
```

## 5. First build/publish

```bash
sudo -u desktopcolors REPO_DIR=/opt/desktopcolors WWW_DIR=/var/www/desktopcolors \
  DB_PATH=/var/lib/desktopcolors/counter.db COUNTER_BIN=/opt/desktopcolors/counter/counter \
  bash /opt/desktopcolors/deploy/rebuild.sh
test -L /var/www/desktopcolors/current && echo "published"
```

## 6. DNS

Point an `A` record (and `AAAA` if you have IPv6) for `desktopcolors.com` and
`www.desktopcolors.com` at the server's public IP. Wait for propagation
(`dig +short desktopcolors.com`).

## 7. nginx + TLS

```bash
cp deploy/desktopcolors.nginx.conf /etc/nginx/sites-available/desktopcolors
ln -sf /etc/nginx/sites-available/desktopcolors /etc/nginx/sites-enabled/desktopcolors
nginx -t                 # must pass
systemctl reload nginx

# TLS via Let's Encrypt (installs certs and rewrites the 443 server for you)
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d desktopcolors.com -d www.desktopcolors.com
nginx -t && systemctl reload nginx
```

## 8. Verify end-to-end

```bash
curl -fsS https://desktopcolors.com/ | grep -q "desktop color archive" && echo "site OK"
curl -fsS -o /dev/null -w '%{http_code}\n' -X POST https://desktopcolors.com/api/event \
  -d '{"kind":"osview","os":"windows-95"}'   # -> 204
# confirm logs are anonymized (last IPv4 octet zeroed, /api not logged):
tail -3 /var/log/nginx/desktopcolors.access.log
```

## Updating later

```bash
cd /opt/desktopcolors && git pull
npm ci && (cd counter && CGO_ENABLED=0 go build -o counter .)
systemctl restart counter.service     # only if the binary changed
sudo -u desktopcolors bash deploy/rebuild.sh   # republish now (or wait for the hourly timer)
```

## Notes

- Popularity refreshes at most hourly (the rebuild timer). Scores are baked
  into the static HTML at build time — the site never queries the counter at
  request time.
- The counter stores only aggregate scores (no IPs). nginx logs are
  IP-anonymized and `/api/event` is not logged at all.
- Fill in the real Buy-Me-a-Coffee handle in `src/pages/about.astro` before launch
  (marked with a `TODO(owner)` comment).
````

- [ ] **Step 2: Sanity-check internal consistency**

Re-read SETUP.md against the authored files: paths (`/opt/desktopcolors`, `/var/www/desktopcolors`, `/var/lib/desktopcolors`), user (`desktopcolors`), port (`8787`), env vars, and unit filenames must all match Tasks 3–5. Fix any drift.

- [ ] **Step 3: Commit**

```bash
git add deploy/SETUP.md
git commit -m "docs: add deployment runbook"
```

---

### Task 7: Playwright end-to-end smoke test

**Files:**
- Modify: `package.json` (add `test:e2e` script; `@playwright/test` devDep)
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: a Playwright smoke test that builds + previews the static site and drives the real browser through the core flows, intercepting `/api/event` to assert the `track()` beacons fire end-to-end (osview on an OS page, copy, download). No counter backend needed — the route is intercepted.

- [ ] **Step 1: Install Playwright + chromium**

Run:
```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Add the script to `package.json`**

```json
    "test:e2e": "playwright test"
```

- [ ] **Step 3: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:4321" },
  webServer: {
    // Build the static site, then serve dist/ with astro preview.
    command: "npm run build && npm run preview -- --port 4321 --host 127.0.0.1",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

- [ ] **Step 4: Create `e2e/smoke.spec.ts`**

```ts
import { test, expect, type Request } from "@playwright/test";

// Capture every /api/event beacon the page fires.
function collectEvents(page: import("@playwright/test").Page): Request[] {
  const reqs: Request[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/event")) reqs.push(r);
  });
  return reqs;
}

test("home lists platforms and search filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("The desktop color archive")).toBeVisible();
  await expect(page.getByText("Windows 95")).toBeVisible();
  await page.getByPlaceholder(/Search platforms/).fill("amiga");
  await expect(page.getByText("Amiga Workbench")).toBeVisible();
  await expect(page.getByText("Windows 95")).toHaveCount(0);
});

test("opening an OS page fires an osview beacon", async ({ page }) => {
  const events = collectEvents(page);
  await page.goto("/os/windows-95");
  await expect(page.getByRole("heading", { name: "Windows 95" })).toBeVisible();
  // beacon fires on mount; give the island a tick to hydrate + send.
  await expect.poll(() => events.some((r) => r.url().includes("/api/event"))).toBe(true);
});

test("copying a color value fires a copy beacon", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const events = collectEvents(page);
  await page.goto("/os/windows-95");
  await page.getByTestId("copy-hex").click();
  await expect(page.getByText("Copied ✓")).toBeVisible();
  await expect
    .poll(() => events.some((r) => (r.postData() || "").includes('"kind":"copy"')))
    .toBe(true);
});

test("download sheet generates a wallpaper and fires a download beacon", async ({ page }) => {
  const events = collectEvents(page);
  await page.goto("/os/windows-95");
  await page.getByRole("button", { name: /Download/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "1920×1080" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/windows-95-teal-008080-1920x1080\.png/);
  await expect
    .poll(() => events.some((r) => (r.postData() || "").includes('"kind":"download"')))
    .toBe(true);
});
```

- [ ] **Step 5: Run the E2E suite**

Run: `npm run test:e2e`
Expected: all 4 specs pass. Playwright builds + previews the site, drives Chromium, and confirms the beacons fire with the right `kind` and the wallpaper downloads with the expected filename. If the copy/clipboard step is flaky in headless mode, the beacon assertion (not the clipboard contents) is the real gate — keep the `Copied ✓` check but the poll on the event is what proves the wiring.

If a selector doesn't match the actual rendered DOM (island markup may differ slightly from these guesses), adjust the SELECTOR to match what the site renders — do not change app behavior to fit the test. Report any selector you had to change.

- [ ] **Step 6: Ignore Playwright artifacts and commit**

Add to `.gitignore` (if not already): `test-results/`, `playwright-report/`, `/playwright/.cache/`.

```bash
git add package.json package-lock.json playwright.config.ts e2e/ .gitignore
git commit -m "test: add Playwright end-to-end smoke covering beacons and download"
```

---

### Task 8: Final integration verification

**Files:**
- No new source; a whole-stack gate on the dev-verifiable pieces.

- [ ] **Step 1: Unit + type + build**

Run: `npm run check && npm test && npm run build`
Expected: type check clean, all vitest green, 16-page build succeeds.

- [ ] **Step 2: Counter module**

Run: `cd counter && go vet ./... && go test ./... && CGO_ENABLED=0 go build -o counter . && cd ..`
Expected: vet clean, all Go tests pass, static binary builds.

- [ ] **Step 3: Rebuild pipeline round-trip** (repeat Task 3 Step 3's temp-dir run)

Expected: `current` symlink flips to a fresh release containing the built site; `scores.json` reflects a seeded event.

- [ ] **Step 4: End-to-end browser smoke**

Run: `npm run test:e2e`
Expected: all specs pass — beacons fire, wallpaper downloads.

- [ ] **Step 5: Confirm the box-only artifacts exist and are internally consistent**

Run:
```bash
for f in deploy/rebuild.sh deploy/desktopcolors.nginx.conf deploy/counter.service \
         deploy/counter-rebuild.service deploy/counter-rebuild.timer deploy/SETUP.md; do
  test -f "$f" && echo "OK $f" || echo "MISSING $f"
done
```
Expected: all `OK`. (These are verified for real on the vServer via SETUP.md — `nginx -t`, `systemd-analyze verify`, and a live `curl`.)

- [ ] **Step 6: Commit the verification record**

```bash
git commit --allow-empty -m "chore: verify Plan 4 integration (beacons, rebuild, E2E) on dev; box config authored"
```

---

## Self-review checklist (completed while writing)

- **Spec coverage (Plan 4 scope):** `track()` → `/api/event` beacon wiring ✓ (T1); rebuild pipeline dump→build→atomic-swap ✓ (T3); nginx reverse-proxy + IP-anonymized logs + `/api` no-log ✓ (T4); systemd counter service + hourly rebuild timer ✓ (T5); Go/Node install + DNS + certbot + first deploy runbook ✓ (T6); `astro check` + CI ✓ (T2); Playwright E2E across the stack ✓ (T7); whole-stack gate ✓ (T8). This completes the 4-plan arc; nothing in the spec remains unimplemented.
- **Honesty about verification:** dev-verifiable tasks (1,2,3,7,8) have real green gates run on this machine; box-only tasks (4,5,6) are authored + syntax-sanity-checked where a local tool exists, with real verification steps documented in SETUP.md for the server. No task fakes a box check on the Mac.
- **Placeholder scan:** no TBD/TODO except the pre-existing, intentionally-flagged `TODO(owner)` Buy-Me-a-Coffee handle (surfaced again in SETUP.md's launch notes). The Go download URL/version in SETUP.md is concrete (go1.25.0); bump if a newer patch is desired.
- **Consistency:** paths/user/port/env-vars are identical across `rebuild.sh`, the systemd units, the nginx block, and SETUP.md (`/opt/desktopcolors`, `/var/www/desktopcolors/current`, `/var/lib/desktopcolors/counter.db`, user `desktopcolors`, `127.0.0.1:8787`). `track()` posts to `/api/event`, which nginx `location = /api/event` proxies to the counter — the paths line up. `scores.json` is written to the repo root, matching Plan 1 `loadScores()`'s default cwd path. The counter contract (`{kind,hex,os}` → 204) matches Plan 3 exactly.
- **Risk called out:** Task 2 runs `astro check` for the first time and may surface latent type errors in Plan 1–2 code; the task explicitly includes resolving them (or escalating if non-trivial), so it is not a hidden placeholder.
