# MVP Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a push to the `release` branch deploy `desktopcolors.com` on the existing AlmaLinux 8 host, via an hourly systemd timer or a manual `rebuild.sh` run.

**Architecture:** Pull-only. `deploy/rebuild.sh` is the single entry point: it takes a lock, hard-resets the checkout to `origin/release`, rebuilds the Go counter and the static site, and atomically flips the `current` symlink nginx serves. Nothing on GitHub knows the VM exists. There is no rollback mechanism on the box — rollback is `git revert` on `release`, because the hourly job unconditionally rebuilds `origin/release` and would undo any purely local rollback within the hour.

**Tech Stack:** bash, git, systemd (timer + oneshot service), nginx, logrotate, sudo, Node 20, Go 1.25, Astro.

**Spec:** [`docs/superpowers/specs/2026-07-26-mvp-deploy-design.md`](../specs/2026-07-26-mvp-deploy-design.md)

## Global Constraints

- **The target host is shared.** Nothing may modify global nginx config, another site's server block, the stock `/etc/logrotate.d/nginx`, or firewalld. Every constraint below that looks pedantic exists for this reason.
- **SELinux is enforcing.** Config changes that need a boolean or a relabel must say so.
- **`KEEP=3`** retained releases (~72 MB each).
- **Deploy branch is `release`**; the deployed path is `/opt/desktopcolors`; the web root is `/var/www/desktopcolors/current`; mutable state lives in `/var/lib/desktopcolors`.
- **`rebuild.sh` must stay runnable on macOS** for the test harness in Task 1. That means no GNU-only syntax without a fallback: use the `mv -Tf` / `mv -hf` branch and the `hash_file` helper, never bare `sha256sum` or bare `mv -Tf`. This reverses the spec's "drop the BSD fallback" item — see Task 1 Step 3.
- **Never add `NoNewPrivileges=true` to `counter-rebuild.service`.** It blocks the setuid transition `sudo` needs and the counter restart fails. `counter.service` sets it correctly; the asymmetry is deliberate.
- **Retention windows are unchanged** — 14 days access, 7 days error — so the "Server logs" clause in `src/pages/privacy.astro` stays accurate. Do not edit it.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `deploy/rebuild.sh` | Modify | The entire deploy: lock, fetch, build, publish, prune, failure marker |
| `deploy/rebuild.test.sh` | Create | Smoke test for the above, with stubbed externals |
| `deploy/desktopcolors.sudoers` | Create | The single `systemctl restart counter.service` grant |
| `deploy/counter-rebuild.service` | Modify | Build environment (`HOME`, `GOCACHE`, `GOMODCACHE`) |
| `deploy/desktopcolors.nginx.conf` | Modify | `view.json` cache policy, `dc_`-prefixed http-scope names, log paths |
| `deploy/desktopcolors.logrotate` | Modify | Log paths, `nginx adm`, `/run/nginx.pid` |
| `deploy/SETUP.md` | Rewrite | Alma 8 shared-host runbook |
| `.gitignore` | Modify | `.deploy-lock-hash` |
| `README.md` | Modify | Two stale sentences about the pipeline |
| `TESTING.md` | Modify | Note that `deploy/` sits outside the four suites |

`deploy/counter.service` and `deploy/counter-rebuild.timer` are **not** touched.

## What is and is not tested

`deploy/rebuild.test.sh` runs `rebuild.sh` against a throwaway fixture git repo with `npm`, `go`, `sudo`, `systemctl` and `flock` stubbed on `PATH`. It proves the **orchestration**: that the reset lands on the deploy branch, that dependency install is skipped when the lockfile is unchanged, that publish is atomic and not nested, that a failed build leaves the previous release serving and writes a marker, and that pruning respects `KEEP`.

It deliberately does **not** build the site or the counter for real — CI already does both, and stubbing keeps the test fast and hermetic. It also cannot prove locking (`flock` is stubbed, and absent on macOS) or anything about nginx, SELinux, logrotate or sudo. Those are verified on the host by the runbook in Task 7.

Do not try to grow this into a full mock harness for the real build. The reason a deploy script gets a test at all is that two of its failure modes — publishing an empty release, and a marker that is never written or never cleared — are invisible in review and expensive in production.

---

### Task 1: `rebuild.sh` core — lock, fetch, atomic publish, prune

**Files:**
- Create: `deploy/rebuild.test.sh`
- Modify: `deploy/rebuild.sh` (full rewrite)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `deploy/rebuild.sh` honouring these environment overrides, which every later task and the test harness rely on — `REPO_DIR`, `WWW_DIR`, `STATE_DIR`, `DB_PATH`, `COUNTER_BIN`, `BRANCH`, `KEEP`, `LOCKFILE`, `MARKER`, `RESTART_CMD`. Also the shell function `hash_file <path> -> sha256 hex on stdout`.

- [ ] **Step 1: Write the failing test**

Create `deploy/rebuild.test.sh`:

```bash
#!/usr/bin/env bash
# Smoke test for deploy/rebuild.sh.
#
# Runs the real script against a throwaway fixture repo. git is real; npm, go,
# sudo, systemctl and flock are stubbed on PATH, because what breaks in this
# script is the wiring, not the builds — CI builds the site and counter for real.
#
# Run: bash deploy/rebuild.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REBUILD="$SCRIPT_DIR/rebuild.sh"
fails=0

ok()  { printf '  ok   %s\n' "$*"; }
bad() { printf '  FAIL %s\n' "$*"; fails=$((fails + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected '$3', got '$2'"; fi; }

# --- fixture -----------------------------------------------------------------
# Lays out an origin repo with a `release` branch, a clone to deploy from, the
# web/state dirs, and a stub bin dir prepended to PATH.
setup() {
  ROOT="$(mktemp -d)"
  ORIGIN="$ROOT/origin.git"
  REPO="$ROOT/repo"
  WWW="$ROOT/www"
  STATE="$ROOT/state"
  STUB="$ROOT/stub"
  STUB_STATE="$ROOT/stubstate"
  mkdir -p "$WWW/releases" "$STATE" "$STUB" "$STUB_STATE"

  # origin with a release branch
  local seed="$ROOT/seed"
  mkdir -p "$seed/counter"
  printf '{"name":"fixture"}\n' > "$seed/package.json"
  printf 'lock-v1\n' > "$seed/package-lock.json"
  printf 'package main\n' > "$seed/counter/main.go"
  git init -q -b release "$seed"
  git -C "$seed" -c user.email=t@t -c user.name=t add -A
  git -C "$seed" -c user.email=t@t -c user.name=t commit -qm "seed"
  git clone -q --bare "$seed" "$ORIGIN"
  git clone -q -b release "$ORIGIN" "$REPO"

  # counter payload the `go` stub emits; changing it simulates a Go change
  cat > "$STUB_STATE/counter_payload" <<'PAYLOAD'
#!/usr/bin/env bash
out=""
while [ $# -gt 0 ]; do
  case "$1" in --out) out="$2"; shift 2 ;; *) shift ;; esac
done
[ -n "$out" ] && printf '{}\n' > "$out"
exit 0
PAYLOAD

  # stubs
  cat > "$STUB/npm" <<'EOS'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_STATE/npm.log"
case "$1" in
  ci)  mkdir -p node_modules ;;
  run) [ "$2" = "build" ] && { mkdir -p dist && printf 'SITE\n' > dist/index.html; } ;;
esac
if [ -f "$STUB_STATE/npm_build_fails" ] && [ "$1" = "run" ]; then
  echo "stub npm: build failed on purpose" >&2
  exit 1
fi
exit 0
EOS
  cat > "$STUB/go" <<'EOS'
#!/usr/bin/env bash
out=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift 2 ;; *) shift ;; esac
done
[ -n "$out" ] && cat "$STUB_STATE/counter_payload" > "$out"
exit 0
EOS
  cat > "$STUB/systemctl" <<'EOS'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_STATE/systemctl.log"
exit 0
EOS
  cat > "$STUB/sudo" <<'EOS'
#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -*) shift ;; *) break ;; esac; done
exec "$(basename "$1")" "${@:2}"
EOS
  cat > "$STUB/flock" <<'EOS'
#!/usr/bin/env bash
exit 0
EOS
  chmod +x "$STUB"/* "$STUB_STATE/counter_payload"
  export STUB_STATE
  export PATH="$STUB:$PATH"
}

teardown() { [ -n "${ROOT:-}" ] && rm -rf "$ROOT"; }

# Runs rebuild.sh with the fixture wired in. Captures output; returns its status.
#
# The sleep is load-bearing: release directories are named to the second, and
# with stubbed builds several runs would otherwise land in the same second, so
# `mv dist "$rel"` would hit an existing directory. Production runs hourly and
# cannot collide, but the harness would — and it would mask the nesting bug this
# very test exists to catch.
run_rebuild() {
  sleep 1
  ( cd "$REPO" && env \
      REPO_DIR="$REPO" WWW_DIR="$WWW" STATE_DIR="$STATE" \
      COUNTER_BIN="$REPO/counter/counter" BRANCH=release \
      KEEP="${KEEP_OVERRIDE:-3}" \
      RESTART_CMD="sudo /usr/bin/systemctl restart counter.service" \
      bash "$REBUILD" ) > "$ROOT/run.log" 2>&1
}

# Commits a change on the origin's release branch, so the next run picks it up.
commit_to_release() {
  local file="$1" content="$2" work="$ROOT/work"
  rm -rf "$work"
  git clone -q -b release "$ORIGIN" "$work"
  printf '%s\n' "$content" > "$work/$file"
  git -C "$work" -c user.email=t@t -c user.name=t add -A
  git -C "$work" -c user.email=t@t -c user.name=t commit -qm "change $file"
  git -C "$work" push -q origin release
}

# --- tests -------------------------------------------------------------------
echo "publish"
setup
run_rebuild; st=$?
check "exits 0" "$st" "0"
if [ -L "$WWW/current" ]; then ok "current is a symlink"; else bad "current is a symlink"; fi
check "published site is served at the root of the release" \
  "$(cat "$WWW/current/index.html" 2>/dev/null)" "SITE"
if [ -e "$WWW/current/dist" ]; then
  bad "dist must not be nested inside the release"
else
  ok "dist is not nested inside the release"
fi
if [ -e "$WWW/current.tmp" ]; then bad "staging symlink cleaned up"; else ok "staging symlink cleaned up"; fi
check "release count" "$(find "$WWW/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" "1"
teardown

echo "prune"
setup
KEEP_OVERRIDE=2
run_rebuild; commit_to_release package.json '{"name":"b"}'
run_rebuild; commit_to_release package.json '{"name":"c"}'
run_rebuild
check "keeps only KEEP releases" \
  "$(find "$WWW/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" "2"
check "current still resolves" "$(cat "$WWW/current/index.html" 2>/dev/null)" "SITE"
unset KEEP_OVERRIDE
teardown

echo "fetch and reset"
setup
run_rebuild
commit_to_release package.json '{"name":"moved"}'
run_rebuild
check "checkout advanced to origin/release" \
  "$(cat "$REPO/package.json")" '{"name":"moved"}'
teardown

printf '\n%s\n' "$([ "$fails" -eq 0 ] && echo "PASS" || echo "FAIL ($fails)")"
[ "$fails" -eq 0 ]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash deploy/rebuild.test.sh`

Expected: FAIL. The current `rebuild.sh` neither fetches nor accepts `STATE_DIR`/`BRANCH`, and it uses `cp -a dist/.` into a pre-created `$rel`, so `dist is not nested` may pass while `checkout advanced to origin/release` and the release counts fail. Confirm you see failures naming the reset and prune behaviour — not a harness crash. If the harness itself errors (missing `mktemp -d`, git refusing to push to a non-bare origin), fix the harness before continuing.

- [ ] **Step 3: Rewrite `deploy/rebuild.sh`**

Replace the whole file:

```bash
#!/usr/bin/env bash
# Rebuild and atomically publish desktopcolors.com from the `release` branch.
#
# The single entry point for deployment, run either by counter-rebuild.timer
# (hourly) or by hand. Each run resets the checkout to origin/$BRANCH, rebuilds,
# and flips the `current` symlink nginx serves. Safe to re-run, and safe to run
# while another copy is running — the second exits 0 having done nothing.
#
# Rollback is `git revert` on the release branch, never a local operation: this
# script unconditionally rebuilds origin/$BRANCH, so a rollback held only in
# server-side state would be silently undone at the next hourly run.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/desktopcolors}"
WWW_DIR="${WWW_DIR:-/var/www/desktopcolors}"
STATE_DIR="${STATE_DIR:-/var/lib/desktopcolors}"
DB_PATH="${DB_PATH:-$STATE_DIR/counter.db}"
COUNTER_BIN="${COUNTER_BIN:-$REPO_DIR/counter/counter}"
BRANCH="${BRANCH:-release}"
KEEP="${KEEP:-3}"
LOCKFILE="${LOCKFILE:-$STATE_DIR/rebuild.lock}"
MARKER="${MARKER:-$STATE_DIR/LAST_FAILURE}"
RESTART_CMD="${RESTART_CMD:-sudo /usr/bin/systemctl restart counter.service}"
LOCK_HASH_FILE="$REPO_DIR/.deploy-lock-hash"

log() { printf '[rebuild] %s\n' "$*"; }

# GNU coreutils on the host, BSD on a developer's macOS. Kept portable so
# deploy/rebuild.test.sh can run the real script locally.
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

cd "$REPO_DIR"

# Serialize before anything mutates the tree. A manual run overlapping the
# hourly one would otherwise let the `git reset --hard` below rewrite files
# under an in-flight build. Skipping is exit 0, not a failure: hourly runs must
# neither pile up behind a long manual run nor raise a false alarm.
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "another run holds $LOCKFILE; skipping"
  exit 0
fi

# 1. Move the checkout to the tip of the deploy branch. This is what makes a
# GitHub push a deployment. scores.json, counter/counter, node_modules/ and
# dist/ are all gitignored, so the reset cannot clobber them.
log "fetching origin/$BRANCH"
git fetch --prune --quiet origin
git reset --hard --quiet "origin/$BRANCH"
log "at $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# 2. Install dependencies only when the lockfile moved. `npm ci` always deletes
# and reinstalls node_modules (~245 MB), pure waste on the overwhelming majority
# of hourly runs where nothing changed.
new_lock_hash="$(hash_file package-lock.json)"
if [ ! -d node_modules ] || [ "$(cat "$LOCK_HASH_FILE" 2>/dev/null || true)" != "$new_lock_hash" ]; then
  log "package-lock.json changed; installing dependencies"
  npm ci --no-audit --no-fund
  printf '%s\n' "$new_lock_hash" > "$LOCK_HASH_FILE"
else
  log "dependencies unchanged; skipping npm ci"
fi

# 3. Dump current popularity scores for the build to bake in. A missing DB is
# fine on first run: the site reads all-zero scores.
if [ -x "$COUNTER_BIN" ]; then
  "$COUNTER_BIN" dump --db "$DB_PATH" --out "$REPO_DIR/scores.json" \
    || log "dump failed; building with the existing/empty scores.json"
else
  log "no counter binary at $COUNTER_BIN; building with the existing/empty scores.json"
fi

# 4. Build.
log "building site"
npm run build

# 5. Publish atomically: move dist into a new release, then flip the symlink.
trap 'rm -f "$WWW_DIR/current.tmp"' EXIT
ts="$(date -u +%Y%m%d%H%M%S)"
rel="$WWW_DIR/releases/$ts"
mkdir -p "$WWW_DIR/releases"
# Refuse rather than nest. `mv` onto an existing directory would move dist
# *inside* it, publishing "$rel/dist" and an empty release — a silent, total
# outage. Names are second-granular and builds take far longer than a second, so
# this should be unreachable; it is here because the failure it prevents is
# invisible until the site 404s.
if [ -e "$rel" ]; then
  log "release directory $rel already exists; refusing to publish"
  exit 1
fi
# Deliberately no `mkdir -p "$rel"`: see above. The rename also avoids copying
# the whole tree.
mv dist "$rel"
ln -sfn "$rel" "$WWW_DIR/current.tmp"
# mv -Tf is GNU (the host); -hf is the BSD/macOS equivalent. Both replace the
# symlink atomically rather than following it into its target directory.
if ! mv -Tf "$WWW_DIR/current.tmp" "$WWW_DIR/current" 2>/dev/null; then
  mv -hf "$WWW_DIR/current.tmp" "$WWW_DIR/current"
fi
log "published release $ts"

# 6. Prune old releases, keeping the newest $KEEP.
# shellcheck disable=SC2012
ls -1dt "$WWW_DIR"/releases/*/ 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  log "pruning $old"
  rm -rf "$old"
done
log "done"
```

- [ ] **Step 4: Add the hash file to `.gitignore`**

In `.gitignore`, after the `scores.json` line, add:

```
.deploy-lock-hash
```

It must stay untracked so `git reset --hard` leaves it alone.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash deploy/rebuild.test.sh`

Expected: every line `ok`, final line `PASS`, exit 0.

- [ ] **Step 6: Lint**

Run: `bash -n deploy/rebuild.sh && shellcheck deploy/rebuild.sh deploy/rebuild.test.sh`

Expected: no output from `bash -n`. `shellcheck` should be clean; the only permitted suppression is the existing `SC2012` on the prune `ls`. If it flags something else, fix the script rather than adding a suppression.

- [ ] **Step 7: Commit**

```bash
git add deploy/rebuild.sh deploy/rebuild.test.sh .gitignore
git commit -m "feat(deploy): rebuild.sh pulls origin/release and publishes atomically

The script previously built whatever happened to be in the checkout, so
nothing connected a GitHub push to a deploy. It now fetches and hard-resets
to origin/\$BRANCH under an flock, so a push to release goes live at the next
hourly run or on a manual invocation.

Publish moves dist into the release directory instead of copying it, and
deliberately does not pre-create that directory — mv onto an existing dir
would nest it and publish an empty release. Adds a smoke test covering
publish, reset and prune against a fixture repo with stubbed externals."
```

---

### Task 2: Failure marker

**Files:**
- Modify: `deploy/rebuild.sh`
- Modify: `deploy/rebuild.test.sh`

**Interfaces:**
- Consumes: `MARKER` and `STATE_DIR` from Task 1.
- Produces: `$MARKER` (`/var/lib/desktopcolors/LAST_FAILURE`) — present iff the last completed run failed. First line is `FAILED <iso8601> exit=<n> commit=<short-sha>`, followed by the last 20 log lines.

- [ ] **Step 1: Write the failing test**

In `deploy/rebuild.test.sh`, insert before the final `printf`:

```bash
echo "failure marker"
setup
run_rebuild
if [ -e "$STATE/LAST_FAILURE" ]; then bad "no marker after success"; else ok "no marker after success"; fi
first_release="$(readlink "$WWW/current")"

# Break the build and run again.
touch "$STUB_STATE/npm_build_fails"
commit_to_release package.json '{"name":"broken"}'
run_rebuild; st=$?
if [ "$st" -ne 0 ]; then ok "failed run exits nonzero"; else bad "failed run exits nonzero"; fi
if [ -s "$STATE/LAST_FAILURE" ]; then ok "marker written on failure"; else bad "marker written on failure"; fi
check "marker names the failure" \
  "$(head -1 "$STATE/LAST_FAILURE" | cut -d' ' -f1)" "FAILED"
check "previous release still live" "$(readlink "$WWW/current")" "$first_release"
check "previous release still serves" "$(cat "$WWW/current/index.html")" "SITE"
if [ -e "$WWW/current.tmp" ]; then bad "no staging symlink left behind"; else ok "no staging symlink left behind"; fi

# Recover and confirm the marker is cleared.
rm -f "$STUB_STATE/npm_build_fails"
run_rebuild
if [ -e "$STATE/LAST_FAILURE" ]; then bad "marker cleared on recovery"; else ok "marker cleared on recovery"; fi
teardown

echo "lock contention does not clear a marker"
setup
touch "$STUB_STATE/npm_build_fails"
run_rebuild
rm -f "$STUB_STATE/npm_build_fails"
cat > "$STUB/flock" <<'EOS'
#!/usr/bin/env bash
exit 1
EOS
chmod +x "$STUB/flock"
run_rebuild; st=$?
check "skipped run exits 0" "$st" "0"
if [ -s "$STATE/LAST_FAILURE" ]; then ok "marker survives a skipped run"; else bad "marker survives a skipped run"; fi
teardown
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash deploy/rebuild.test.sh`

Expected: FAIL on `marker written on failure`, `marker names the failure`, and `marker cleared on recovery` — nothing writes `$MARKER` yet. The `previous release still live` assertions should already pass; that safety comes from flipping the symlink only after a successful build, which Task 1 preserved.

- [ ] **Step 3: Add the run log and the trap**

In `deploy/rebuild.sh`, immediately after the `cd "$REPO_DIR"` line, insert:

```bash
# Mirror output to a run log so the EXIT trap can quote its tail into the
# failure marker. journalctl -u counter-rebuild always holds the full log.
RUNLOG="$(mktemp)"
exec > >(tee -a "$RUNLOG") 2>&1
```

Then replace the lock block's skip path so it does not leak the run log, and so
it exits *before* the trap is installed — a skipped run must not clear a marker
left by a genuine earlier failure:

```bash
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "another run holds $LOCKFILE; skipping"
  rm -f "$RUNLOG"
  exit 0
fi

cleanup() {
  local st=$?
  rm -f "$WWW_DIR/current.tmp"
  rm -f "$REPO_DIR"/counter/.counter.* 2>/dev/null || true
  if [ "$st" -ne 0 ]; then
    {
      printf 'FAILED %s exit=%s commit=%s\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$st" \
        "$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
      tail -20 "$RUNLOG"
    } > "$MARKER" 2>/dev/null || true
  else
    rm -f "$MARKER"
  fi
  rm -f "$RUNLOG"
}
trap cleanup EXIT
```

Finally, delete the now-redundant `trap 'rm -f "$WWW_DIR/current.tmp"' EXIT` line
from the publish section — `cleanup` has absorbed it. Leaving both means the
second `trap` silently replaces the first and no marker is ever written.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash deploy/rebuild.test.sh`

Expected: all `ok`, final line `PASS`.

- [ ] **Step 5: Lint**

Run: `bash -n deploy/rebuild.sh && shellcheck deploy/rebuild.sh deploy/rebuild.test.sh`

Expected: clean apart from the existing `SC2012` suppression.

- [ ] **Step 6: Commit**

```bash
git add deploy/rebuild.sh deploy/rebuild.test.sh
git commit -m "feat(deploy): record the last failed run in /var/lib

A failed build already left the previous release serving, because the symlink
is only flipped after a successful build — but nothing reported it, and a
working site gives no prompt to go looking. An EXIT trap now writes
LAST_FAILURE with the timestamp, exit status, commit and last 20 log lines,
and removes it on success.

It lives in /var/lib/desktopcolors, not under /var/www: nginx cannot serve
above its root today, but a marker in the web tree would become reachable the
first time someone changed the root or enabled autoindex.

The lock-contention path exits before the trap is installed, so a skipped run
cannot clear a marker left by a real failure."
```

---

### Task 3: Rebuild and conditionally restart the counter

**Files:**
- Modify: `deploy/rebuild.sh`
- Modify: `deploy/rebuild.test.sh`
- Create: `deploy/desktopcolors.sudoers`
- Modify: `deploy/counter-rebuild.service`

**Interfaces:**
- Consumes: `COUNTER_BIN`, `RESTART_CMD` from Task 1.
- Produces: the counter binary at `$COUNTER_BIN` is always current with the deployed source; `counter.service` is restarted only when the compiled bytes changed.

- [ ] **Step 1: Write the failing test**

In `deploy/rebuild.test.sh`, insert before the final `printf`:

```bash
echo "counter rebuild"
setup
run_rebuild
if [ -x "$REPO/counter/counter" ]; then ok "counter binary installed"; else bad "counter binary installed"; fi
check "first run restarts the counter" \
  "$(grep -c 'restart counter.service' "$STUB_STATE/systemctl.log" 2>/dev/null || echo 0)" "1"

# Unchanged Go source must not cause a restart.
commit_to_release package.json '{"name":"nogo"}'
run_rebuild
check "unchanged counter does not restart" \
  "$(grep -c 'restart counter.service' "$STUB_STATE/systemctl.log")" "1"

# A changed binary must.
printf '# changed\n' >> "$STUB_STATE/counter_payload"
run_rebuild
check "changed counter restarts" \
  "$(grep -c 'restart counter.service' "$STUB_STATE/systemctl.log")" "2"
if ls "$REPO"/counter/.counter.* >/dev/null 2>&1; then
  bad "no temp binaries left behind"
else
  ok "no temp binaries left behind"
fi
teardown

echo "dependency gating"
setup
run_rebuild
check "first run installs deps" \
  "$(grep -c '^ci' "$STUB_STATE/npm.log")" "1"
commit_to_release package.json '{"name":"same-lock"}'
run_rebuild
check "unchanged lockfile skips npm ci" \
  "$(grep -c '^ci' "$STUB_STATE/npm.log")" "1"
commit_to_release package-lock.json 'lock-v2'
run_rebuild
check "changed lockfile runs npm ci" \
  "$(grep -c '^ci' "$STUB_STATE/npm.log")" "2"
teardown
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash deploy/rebuild.test.sh`

Expected: FAIL on `counter binary installed` and all three restart assertions — nothing compiles the counter yet. The `dependency gating` block should already pass from Task 1; if it does not, fix the gate before adding the counter logic.

- [ ] **Step 3: Add the counter block to `rebuild.sh`**

In `deploy/rebuild.sh`, insert between the dependency-install block (step 2) and the score dump (step 3), renumbering the comments that follow:

```bash
# 3. Rebuild the counter, and restart it only if the compiled bytes changed.
# Without this, a Go fix pushed to the deploy branch would report a successful
# deploy while the service kept running the old binary, with nothing reporting
# the discrepancy.
tmpbin="$(mktemp "$REPO_DIR/counter/.counter.XXXXXX")"
log "building counter"
(cd counter && CGO_ENABLED=0 go build -o "$tmpbin" .)
if cmp -s "$tmpbin" "$COUNTER_BIN"; then
  log "counter unchanged"
  rm -f "$tmpbin"
else
  chmod 0755 "$tmpbin"
  # `mv`, never `install`/`cp`: Linux returns ETXTBSY when writing to the binary
  # of a running process, while a rename only swaps the directory entry and
  # leaves the running inode alone. The temp file is a sibling for the same
  # reason — a cross-filesystem mv degrades to copy-then-unlink and hits
  # ETXTBSY again.
  mv -f "$tmpbin" "$COUNTER_BIN"
  log "counter changed; restarting service"
  $RESTART_CMD
fi
```

`$RESTART_CMD` is intentionally unquoted — it is a command line, not a filename,
and word-splitting is what invokes it. `shellcheck` will flag this as `SC2086`;
add `# shellcheck disable=SC2086` on the line above it.

- [ ] **Step 4: Create `deploy/desktopcolors.sudoers`**

```
# desktopcolors.com — the one privileged action the deploy needs.
# Install to /etc/sudoers.d/desktopcolors, mode 0440, owner root:root.
# Validate before installing:  visudo -cf deploy/desktopcolors.sudoers
#
# deploy/rebuild.sh runs as the unprivileged `desktopcolors` user and must
# restart the counter after recompiling its binary. This grants exactly that
# one command with a literal argument, and nothing else.
#
# Do NOT add NoNewPrivileges=true to counter-rebuild.service: it blocks the
# setuid transition sudo needs and this restart fails. counter.service does set
# it, correctly — it never calls sudo.
desktopcolors ALL=(root) NOPASSWD: /usr/bin/systemctl restart counter.service
```

- [ ] **Step 5: Add the build environment to `deploy/counter-rebuild.service`**

After the existing `Environment=COUNTER_BIN=...` line, add:

```
# go build and npm ci both fail without a writable cache. Set explicitly rather
# than relying on systemd deriving HOME from the passwd entry.
Environment=HOME=/opt/desktopcolors
Environment=GOCACHE=/opt/desktopcolors/.cache/go-build
Environment=GOMODCACHE=/opt/desktopcolors/.cache/go-mod
```

`ReadWritePaths` already covers `/opt/desktopcolors`, so no change is needed there.

- [ ] **Step 6: Run the test to verify it passes**

Run: `bash deploy/rebuild.test.sh`

Expected: all `ok`, final line `PASS`.

- [ ] **Step 7: Validate the sudoers file and lint**

Run:

```bash
visudo -cf deploy/desktopcolors.sudoers
bash -n deploy/rebuild.sh && shellcheck deploy/rebuild.sh deploy/rebuild.test.sh
systemd-analyze verify deploy/counter-rebuild.service 2>&1 | head || true
```

Expected: `visudo` prints `parsed OK`. `shellcheck` clean apart from the `SC2012` and `SC2086` suppressions. `systemd-analyze` is unavailable on macOS — skip it there and run it on the host during Task 7.

- [ ] **Step 8: Commit**

```bash
git add deploy/rebuild.sh deploy/rebuild.test.sh deploy/desktopcolors.sudoers deploy/counter-rebuild.service
git commit -m "feat(deploy): rebuild the counter and restart only when it changed

The Go binary was compiled once during setup and never again. Once rebuild.sh
started pulling, that became a trap: a Go fix on the deploy branch would
report success while the service kept running the old binary.

The binary is compiled to a sibling temp file and moved into place — Linux
returns ETXTBSY when writing to a running process's binary, and a
cross-filesystem mv would degrade to a copy and hit it again. A hash compare
means the ~1s interruption only happens in the hours Go code actually changed.

The restart needs root, so desktopcolors.sudoers grants that single command."
```

---

### Task 4: nginx — `view.json` caching, collision-proof names, log subdirectory

**Files:**
- Modify: `deploy/desktopcolors.nginx.conf`

**Interfaces:**
- Consumes: nothing.
- Produces: log files at `/var/log/nginx/desktopcolors/{access,error}.log`, which Task 5's logrotate config must match exactly.

There is no automated test here — nginx is not installed locally, and the file is
a fragment that is only valid inside `http{}`. It is verified by `nginx -t` on the
host in Task 7. Read the diff carefully instead.

- [ ] **Step 1: Rename the http-scope names**

These two names sit at `http{}` scope on a host serving other sites. If any other
config already defines either, nginx fails to load with a duplicate error — taking
down **every** site on the box, not just this one.

Replace the `map` and `log_format` block at the top of the file with:

```nginx
# Anonymize client IPs in logs: truncate IPv4 to /24, collapse IPv6, default 0.
# The `dc_` prefix is not decoration: these live at http{} scope on a shared
# host, and a name collision with another site's config fails the whole nginx
# reload, not just this server block.
map $remote_addr $dc_remote_addr_anon {
    ~(?P<v4>\d+\.\d+\.\d+)\.\d+      $v4.0;
    ~(?P<v6>[0-9a-fA-F]+:[0-9a-fA-F]+): $v6::;
    default                          0.0.0.0;
}
log_format dc_anon '$dc_remote_addr_anon - - [$time_local] "$request" '
                   '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
```

- [ ] **Step 2: Update the install path comment**

Replace the file's opening comment with:

```nginx
# desktopcolors.com — nginx server block.
# Install to /etc/nginx/conf.d/desktopcolors.conf. RHEL-family nginx has no
# sites-available/sites-enabled; conf.d is included from inside http{}, so the
# map and log_format below are valid where they are. Run `nginx -t` after
# installing — and note it validates every site on this host, so check it
# before reloading, not after.
```

- [ ] **Step 3: Point the logs at a subdirectory**

Replace the two log directives in the 443 server with:

```nginx
    # Access log is IP-anonymized by the `dc_anon` format above. The error log
    # is NOT: nginx writes the full client IP into error entries and log_format
    # does not apply to it. That is a deliberate trade — it is how broken links
    # get found — so the retention is short instead. See
    # deploy/desktopcolors.logrotate (14 days access, 7 days error), and keep
    # the "Server logs" clause in src/pages/privacy.astro in step with both.
    #
    # The subdirectory is deliberate: the stock /etc/logrotate.d/nginx globs
    # /var/log/nginx/*.log, and logrotate skips any file listed twice — our
    # retention would silently not apply. The stock file is off-limits on this
    # shared host, and *.log does not match a subdirectory.
    access_log /var/log/nginx/desktopcolors/access.log dc_anon;
    error_log  /var/log/nginx/desktopcolors/error.log error;
```

- [ ] **Step 4: Add the `view.json` cache policy**

`/os/<slug>/view.json` is fetched at runtime by `src/islands/OsDetail.tsx:78` from
an **unhashed** URL, and every build regenerates it. With no `expires` directive
nginx sends no `Cache-Control`, so browsers apply heuristic caching and a client
can hold a stale `view.json` while the surrounding HTML is fresh — exactly the
inconsistency the hourly score refresh exists to prevent.

Insert after the `location /_astro/` block:

```nginx
    # Per-OS colour detail, fetched at runtime from an unhashed URL and
    # regenerated by every build. Short expiry rather than no-cache so ordinary
    # browsing is served from cache with no revalidation round trip at all; on
    # an hourly deploy cadence a <=5 minute stale window is immaterial.
    # `expires` emits Cache-Control: max-age=300 on its own.
    location ~ /view\.json$ {
        expires 5m;
        try_files $uri =404;
    }
```

- [ ] **Step 5: Verify the file is internally consistent**

Run:

```bash
grep -n 'remote_addr_anon\|dc_anon\|access_log\|error_log\|view\\.json' deploy/desktopcolors.nginx.conf
```

Expected: no bare `$remote_addr_anon` or `log_format anon` remains; `access_log`
names `dc_anon`; both log paths are under `/var/log/nginx/desktopcolors/`. There
must be exactly one `map`, one `log_format`, and one `view.json` location.

- [ ] **Step 6: Commit**

```bash
git add deploy/desktopcolors.nginx.conf
git commit -m "feat(deploy): cache view.json, and make the conf safe on a shared host

Three changes for the real target, which serves other sites already:

view.json is fetched at runtime from an unhashed URL and regenerated by every
build, with no Cache-Control — so browsers heuristically cached it and could
serve a stale copy beside fresh HTML. Now expires 5m.

The http{}-scope map and log_format are prefixed dc_, because a name collision
with another site's config fails the entire nginx reload.

Logs move to a subdirectory: the stock logrotate globs /var/log/nginx/*.log and
skips duplicates, so our retention would silently not apply, and that file is
off-limits here."
```

---

### Task 5: logrotate for RHEL and the new log paths

**Files:**
- Modify: `deploy/desktopcolors.logrotate`

**Interfaces:**
- Consumes: the log paths produced by Task 4.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Rewrite the header comment**

The current header explains a Debian collision and a Debian fix. Replace
everything above the first path block with:

```
# desktopcolors.com — log retention.
# Install to /etc/logrotate.d/desktopcolors, mode 0644.
#
# The two logs are rotated on different schedules because they carry different
# data. The access log is IP-anonymized by the `dc_anon` log_format (see
# desktopcolors.nginx.conf), so a longer window is harmless. The error log is
# NOT anonymized — nginx always writes the full client IP in error entries and
# log_format does not apply to it — so it is kept only as long as it takes to
# notice and fix a broken link. Both windows are stated in /privacy; if you
# change one here, change it there too.
#
# NOTE: the stock /etc/logrotate.d/nginx globs /var/log/nginx/*.log. logrotate
# errors on a duplicate entry and skips the file, so retention would silently
# not apply. The usual fix is to exclude our files there — but on this shared
# host that file is off-limits, so our logs live in a subdirectory instead,
# which *.log does not match. Confirm with the dry run in SETUP.md § 9.
```

- [ ] **Step 2: Update both path blocks**

Change the two path lines and both `create` lines:

- `/var/log/nginx/desktopcolors.access.log` → `/var/log/nginx/desktopcolors/access.log`
- `/var/log/nginx/desktopcolors.error.log` → `/var/log/nginx/desktopcolors/error.log`
- `create 0640 www-data adm` → `create 0640 nginx adm` (both blocks) — there is no `www-data` user on RHEL, and logrotate fails the entry if the owner does not exist.
- `/var/run/nginx.pid` → `/run/nginx.pid` in both `postrotate` hooks.

Leave `daily`, `rotate 14` / `rotate 7`, `missingok`, `notifempty`, `compress`,
`delaycompress` and `sharedscripts` exactly as they are. The windows are stated
in `src/pages/privacy.astro`; changing them here would make that page wrong.

- [ ] **Step 3: Verify**

Run:

```bash
grep -n 'www-data\|/var/run/\|desktopcolors\.\(access\|error\)' deploy/desktopcolors.logrotate
```

Expected: **no matches**. Any hit means a rename was missed.

Then confirm the retention windows are untouched:

```bash
grep -n 'rotate ' deploy/desktopcolors.logrotate
```

Expected: exactly `rotate 14` and `rotate 7`.

- [ ] **Step 4: Commit**

```bash
git add deploy/desktopcolors.logrotate
git commit -m "feat(deploy): point logrotate at the new paths and the nginx user

Follows the log move in the nginx conf, and fixes two things that would have
failed on RHEL: there is no www-data user for the create directive, and the pid
file is /run/nginx.pid. Retention windows are unchanged, so the privacy page
stays accurate."
```

---

### Task 6: Rewrite `SETUP.md` for the Alma 8 shared host

**Files:**
- Modify: `deploy/SETUP.md`

**Interfaces:**
- Consumes: every file from Tasks 1–5.
- Produces: the runbook Task 7 executes.

Every one of `apt-get`, NodeSource, `sites-available`, `www-data` and the absence
of SELinux in the current file is wrong for this host. Rewrite it.

- [ ] **Step 1: Rewrite the preamble and § 1–3**

```markdown
# Deploying desktopcolors.com

Target: an **AlmaLinux 8** VM that already serves other, unrelated sites. nginx
and certbot are installed and in use, 80/443 are already open, and **SELinux is
enforcing**. Commands are run as root (or via sudo) unless stated otherwise.

Because the host is shared, nothing here modifies global nginx config, another
site's server block, the stock `/etc/logrotate.d/nginx`, or firewalld. Several
steps look pedantic for that reason.

**Deployment is pull-only.** `deploy/rebuild.sh` fetches and hard-resets the
checkout to `origin/release`, so a push to `release` goes live at the next hourly
run of `counter-rebuild.timer`, or immediately if you run `rebuild.sh` by hand.
Nothing on GitHub needs credentials for this host.

## 1. Install toolchains

```bash
# Node 20 from AppStream (not NodeSource — this is RHEL-family)
dnf module reset -y nodejs
dnf module enable -y nodejs:20
dnf install -y nodejs
node -v      # v20.x

# Go >= 1.25 (the modernc.org/sqlite floor) is not packaged for Alma 8
curl -fsSL https://go.dev/dl/go1.25.0.linux-amd64.tar.gz -o /tmp/go.tgz
rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tgz
echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh && . /etc/profile.d/go.sh
go version   # go1.25.x

dnf install -y git
```

## 2. Create the service user and directories

```bash
useradd --system --home-dir /opt/desktopcolors --shell /usr/sbin/nologin desktopcolors || true
mkdir -p /opt/desktopcolors /var/www/desktopcolors/releases /var/lib/desktopcolors
install -d -o nginx -g nginx -m 0755 /var/log/nginx/desktopcolors
```

## 3. Get the code

```bash
git clone -b release https://github.com/vlow/desktopcolors.git /opt/desktopcolors
chown -R desktopcolors:desktopcolors \
  /opt/desktopcolors /var/www/desktopcolors /var/lib/desktopcolors
```

The first `rebuild.sh` run (§ 7) compiles both the counter and the site, so
there is nothing to build by hand here.
```

- [ ] **Step 2: Add the SELinux section as § 4**

This is the step most likely to be skipped and then misdiagnosed as an
application bug.

```markdown
## 4. SELinux

```bash
# Without this, nginx's proxy_pass to 127.0.0.1:8787 is denied and every
# /api/event beacon fails with 502 while the rest of the site works fine.
setsebool -P httpd_can_network_connect 1

# Release trees must carry httpd_sys_content_t for nginx to read them.
restorecon -Rv /var/www/desktopcolors

# The log subdirectory inherits httpd_log_t from /var/log/nginx. Verify rather
# than assume:
ls -Zd /var/log/nginx/desktopcolors     # ...:httpd_log_t:...
```

If a later step fails in a way that makes no sense, check for denials before
anything else:

```bash
ausearch -m avc -ts recent | tail -20
```
```

- [ ] **Step 3: Replace the systemd, sudoers, nginx and TLS sections as § 5–6**

```markdown
## 5. Install systemd units and the sudoers grant

```bash
cp deploy/counter.service deploy/counter-rebuild.service deploy/counter-rebuild.timer \
   /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/counter.service
systemd-analyze verify /etc/systemd/system/counter-rebuild.service

# rebuild.sh restarts the counter after recompiling it, and runs unprivileged.
install -o root -g root -m 0440 deploy/desktopcolors.sudoers /etc/sudoers.d/desktopcolors
visudo -cf /etc/sudoers.d/desktopcolors      # must print "parsed OK"

systemctl daemon-reload
systemctl enable --now counter.service
systemctl enable --now counter-rebuild.timer
systemctl list-timers counter-rebuild.timer --no-pager
```

`counter.service` sets `NoNewPrivileges=true`; `counter-rebuild.service`
deliberately does **not**, because it would block the setuid transition `sudo`
needs and the counter restart would fail. Do not "fix" that asymmetry.

The counter has no database until the first build, so it is expected to be
running with an empty store at this point.

## 6. nginx and TLS

```bash
cp deploy/desktopcolors.nginx.conf /etc/nginx/conf.d/desktopcolors.conf

# nginx -t validates EVERY site on this host. Check it before reloading, so a
# mistake here never takes down the other sites.
nginx -t
systemctl reload nginx

# certbot is already installed and in use. This edits only our conf.d file.
certbot --nginx -d desktopcolors.com -d www.desktopcolors.com
nginx -t && systemctl reload nginx
```

DNS is already in place — `desktopcolors.com` and `www` resolve to this VM.
Confirm rather than configure:

```bash
dig +short desktopcolors.com www.desktopcolors.com
```

**firewalld: nothing to do.** 80/443 are already open for the existing sites.
```

- [ ] **Step 4: Replace § 5 (first build) and the "Updating later" section**

```markdown
## 7. First build and publish

```bash
sudo -u desktopcolors bash /opt/desktopcolors/deploy/rebuild.sh
test -L /var/www/desktopcolors/current && echo "published"
```

The first run installs dependencies, compiles the counter, restarts it, and
publishes a release. Later runs skip `npm ci` unless `package-lock.json` moved,
and skip the counter restart unless the compiled binary changed.

## 8. Verify end-to-end

```bash
curl -fsS https://desktopcolors.com/ | grep -q "desktop color archive" && echo "site OK"

# view.json is fetched at runtime and must be short-cached, not immutable.
curl -fsS -o /dev/null -D- https://desktopcolors.com/os/windows-95/view.json \
  | grep -i 'cache-control'          # -> max-age=300

# A 502 here means § 4 (SELinux) was skipped.
curl -fsS -o /dev/null -w '%{http_code}\n' -X POST https://desktopcolors.com/api/event \
  -H 'Content-Type: application/json' -d '{"kind":"osview","os":"windows-95"}'   # -> 204

# Anonymized access log, and /api/event absent from it:
tail -3 /var/log/nginx/desktopcolors/access.log

# And the other sites on this host still work. Substitute a hostname from
# `grep -rh server_name /etc/nginx/conf.d/ | grep -v desktopcolors`:
nginx -t && curl -fsS -o /dev/null -w '%{http_code}\n' https://OTHER-SITE-HERE/
```

## 10. Deploying a change

Push to `release`. The hourly timer picks it up; to publish immediately:

```bash
sudo -u desktopcolors bash /opt/desktopcolors/deploy/rebuild.sh
```

Both paths run the same script, and it is safe to run while the timer is
mid-build — the second invocation exits 0 without doing anything.

**To roll back, `git revert` on `release`.** There is deliberately no rollback
command on this host: `rebuild.sh` unconditionally rebuilds `origin/release`, so
a rollback held only in server-side state would be silently undone within the
hour.

## 11. Health check

```bash
# Absent = the last run succeeded. Present = it failed; the file says how.
cat /var/lib/desktopcolors/LAST_FAILURE

systemctl status counter-rebuild --no-pager
journalctl -u counter-rebuild -n 50 --no-pager
```

A failed build leaves the previous release serving — the `current` symlink is
only flipped after a successful build — so the site keeps working and nothing
will prompt you to look. Check `LAST_FAILURE` deliberately.
```

- [ ] **Step 5: Keep § 9 (log retention), adjusting the collision note**

Keep the section, but replace the Debian-specific paragraph and commands with:

```markdown
```bash
install -o root -g root -m 0644 deploy/desktopcolors.logrotate /etc/logrotate.d/desktopcolors

# The stock /etc/logrotate.d/nginx globs /var/log/nginx/*.log. Our logs live in
# a subdirectory precisely so that glob cannot match them — that file is
# off-limits on this shared host. Confirm no duplicate is reported:
logrotate -d /etc/logrotate.conf 2>&1 | grep -i "desktopcolors\|duplicate"
```

Expect the dry run to mention our two files and **no** duplicate. Then verify a
real rotation once:

```bash
logrotate -f /etc/logrotate.d/desktopcolors && ls -l /var/log/nginx/desktopcolors/
```
```

- [ ] **Step 6: Check the document is coherent**

Run:

```bash
grep -n 'apt-get\|www-data\|sites-available\|sites-enabled\|NodeSource\|deb\.nodesource' deploy/SETUP.md
```

Expected: **no matches**.

```bash
grep -n '^## ' deploy/SETUP.md
```

Expected: sections numbered 1–11 in order with no gaps or duplicates. Renumber
if § 9 landed out of sequence after the edits above.

- [ ] **Step 7: Commit**

```bash
git add deploy/SETUP.md
git commit -m "docs(deploy): rewrite the runbook for the Alma 8 shared host

The old runbook targeted Debian/Ubuntu on a dedicated box: apt-get, NodeSource,
sites-available, www-data, and no SELinux — every one of which is wrong here.

Adds the SELinux section, whose httpd_can_network_connect boolean is the step
most likely to be skipped and then misdiagnosed as an application bug, and
documents the pull-only deploy, revert-on-release rollback, and the
LAST_FAILURE health check. Notes that nginx -t covers every site on the host."
```

---

### Task 7: Reconcile the docs and cut the `release` branch

**Files:**
- Modify: `README.md:118`, `README.md:66`
- Modify: `TESTING.md` (rules of thumb, after line 75)

**Interfaces:**
- Consumes: everything above.
- Produces: `origin/release`, the branch `rebuild.sh` deploys from.

- [ ] **Step 1: Fix the two stale README lines**

`README.md:118` currently reads:

```
The full `dump → build → atomic-swap` production pipeline is `deploy/rebuild.sh`.
```

Replace with:

```
The full `fetch → dump → build → atomic-swap` production pipeline is
`deploy/rebuild.sh`, which deploys the `release` branch — see
[`deploy/SETUP.md`](deploy/SETUP.md).
```

`README.md:66` currently reads:

```
deploy/                  # rebuild.sh, nginx conf, systemd units, SETUP.md (deployment runbook)
```

Replace with:

```
deploy/                  # rebuild.sh + its test, nginx conf, systemd units, sudoers, SETUP.md
```

- [ ] **Step 2: Note the deploy layer in TESTING.md**

`deploy/` sits outside the four suites, and that is worth stating so nobody
assumes `npm test` covers it. Add to the "Rules of thumb" list after the
"Data shape is not a test's job" bullet:

```markdown
- **`deploy/` is outside these four suites.** `deploy/rebuild.test.sh` (run it
  with `bash deploy/rebuild.test.sh`) covers only the deploy script's
  orchestration — reset to the deploy branch, dependency gating, atomic publish,
  failure marker, prune — against a fixture repo with `npm`, `go`, `sudo`,
  `systemctl` and `flock` stubbed. It exists because two of that script's
  failure modes are invisible in review and expensive in production: publishing
  an empty release, and a failure marker that is never written or never cleared.
  Everything else about deployment — nginx, SELinux, logrotate, sudo, locking —
  is verified on the host by [`deploy/SETUP.md`](deploy/SETUP.md), not here.
```

Do **not** add a `T#` entry. That format is reserved for decisions a real
observed failure or measurement justifies, and this one has neither yet.

Do **not** add a row to the layers table — it says "Four suites", and the deploy
script is deliberately not one of them.

- [ ] **Step 3: Run the full suite**

Run:

```bash
npm test && npm run check && bash deploy/rebuild.test.sh
```

Expected: all pass. Nothing in Tasks 1–7 touched `src/`, so any failure here is
pre-existing — investigate before continuing rather than committing over it.

- [ ] **Step 4: Commit**

```bash
git add README.md TESTING.md
git commit -m "docs: reconcile the README and TESTING with the deploy pipeline

rebuild.sh now fetches before building, and deploy/ has a test and a sudoers
file. Records that deploy/ sits outside the four suites and what its smoke test
does and does not prove."
```

- [ ] **Step 5: Push `main` and cut `release`**

```bash
git push origin main
git switch -c release
git push -u origin release
git switch main
```

Verify both branches point at the same commit:

```bash
git ls-remote --heads origin
```

Expected: `refs/heads/main` and `refs/heads/release` at the same SHA.

`release` must be cut from the pushed tip of `main` — it carries the entire
`view.json` work, without which the first deploy would ship the pre-`5a18cba`
site.

---

### Task 8 (optional — beyond the approved spec): CI on the deploy branch

The spec puts "GitHub Actions involvement of any kind" out of scope. That was
about deploy *triggering*; this task adds no trigger and no credentials — it only
runs the existing checks on the branch that gets deployed, plus the new smoke
test. **Skip this task if you would rather hold the spec's line exactly.**

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Run CI on `release` too**

In `.github/workflows/ci.yml`, change:

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

to:

```yaml
on:
  push:
    branches: [main, release]
  pull_request:
```

CI does not gate the deploy — the pull model does not consult it — so this is
informational only: it makes a broken `release` visible on GitHub before the
hourly run tries to build it.

- [ ] **Step 2: Run the deploy smoke test in CI**

Add a job. It runs on Linux, where `flock` genuinely exists, so it covers
slightly more than a local run:

```yaml
  deploy-script:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: shellcheck deploy/rebuild.sh deploy/rebuild.test.sh
      - run: bash deploy/rebuild.test.sh
```

- [ ] **Step 3: Verify locally, then commit**

Run: `bash deploy/rebuild.test.sh && shellcheck deploy/rebuild.sh deploy/rebuild.test.sh`

Expected: PASS, and no shellcheck output.

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the checks on release and cover the deploy script

CI does not gate the deploy — the pull model never consults it — but running on
release makes a broken deploy branch visible before the hourly build tries it."
git push origin main
```

---

## Post-implementation: on-host verification

Not a code task — run these on the VM after Task 7, following `deploy/SETUP.md`.
They cover everything the local test cannot.

- [ ] `visudo -cf /etc/sudoers.d/desktopcolors` → `parsed OK`
- [ ] `nginx -t` → OK, **before** any reload
- [ ] `logrotate -d /etc/logrotate.conf 2>&1 | grep -i "desktopcolors\|duplicate"` → our files, no duplicate
- [ ] `sudo -u desktopcolors bash /opt/desktopcolors/deploy/rebuild.sh` → publishes; `LAST_FAILURE` absent
- [ ] **Locking, which the stubbed test cannot prove:** start a run in the background, immediately start a second, and confirm the second logs `another run holds` and exits 0 without writing a marker
- [ ] `curl -D- .../os/windows-95/view.json` → 200 with `max-age=300`
- [ ] `curl -X POST .../api/event` → 204 (a 502 means the SELinux boolean was missed)
- [ ] Push a trivial commit to `release`, run `rebuild.sh`, confirm it appears
- [ ] Confirm the other sites on the host still serve, and `systemctl list-timers` shows the next hourly run
