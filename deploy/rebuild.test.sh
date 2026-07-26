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
# Portable "other" bit checks via `find -perm`, since GNU-only `stat -c` is
# off the table and this needs to hold on macOS too: `-perm -004`/`-perm -001`
# match when *all* listed bits are set, here the world-read and world-execute
# bits respectively. A trailing slash on a symlink argument (the "current/"
# callers below) dereferences it, so this reports the target directory's own
# bits rather than the symlink's (which are meaningless — always rwxrwxrwx).
world_readable() { [ -n "$(find "$1" -maxdepth 0 -perm -004 2>/dev/null)" ]; }
world_executable() { [ -n "$(find "$1" -maxdepth 0 -perm -001 2>/dev/null)" ]; }

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
  run)
    if [ "$2" = "build" ]; then
      if [ -f "$STUB_STATE/npm_build_slow" ]; then
        touch "$STUB_STATE/build_started"
        # 5s, not 2s: the signal test polls for build_started every 1s, so a
        # 2s sleep left only about one poll interval of margin between
        # "sentinel detected" and "stub sleep ends on its own" — tight enough
        # for a loaded machine to occasionally race the TERM against the
        # build finishing naturally. 5s gives a comfortable margin without
        # weakening what the test actually asserts.
        sleep 5
      fi
      mkdir -p dist
      if [ -f "$STUB_STATE/npm_build_empty" ]; then
        : > dist/index.html
      else
        printf 'SITE\n' > dist/index.html
      fi
      if [ -f "$STUB_STATE/npm_build_restrictive" ]; then
        chmod 700 dist
        chmod 600 dist/index.html
      fi
    fi
    ;;
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
  # Delegates to the real chmod unless a test flips the trigger flag, in which
  # case it fails — used to exercise the publish section's staging-directory
  # failure path (after "$rel" is assigned, before "$rel.tmp" is renamed into
  # place) without touching rebuild.sh itself.
  cat > "$STUB/chmod" <<'EOS'
#!/usr/bin/env bash
if [ -f "$STUB_STATE/chmod_fails" ]; then
  echo "stub chmod: forced failure" >&2
  exit 1
fi
# Delays the call rebuild.sh makes against "$rel.tmp" — after cp -R has
# created it, before mv renames it into place — so a test can signal the
# script while it holds the lock *and* owns a staging directory. Touches a
# sentinel the instant it starts blocking, mirroring npm_build_slow above,
# so the test polls for that instead of guessing a fixed delay.
if [ -f "$STUB_STATE/chmod_slow" ]; then
  touch "$STUB_STATE/chmod_started"
  sleep 5
fi
exec /bin/chmod "$@"
EOS
  # Absolute path: once $STUB/chmod (below) exists on PATH, a bare `chmod`
  # here is ambiguous — bash's command hash can end up pointing at a prior
  # block's now-torn-down $STUB dir instead of re-searching, aborting with
  # "No such file or directory". Sidestep PATH/hash resolution entirely.
  /bin/chmod +x "$STUB"/* "$STUB_STATE/counter_payload"
  export STUB_STATE
  export PATH="$STUB:$PATH"
}

teardown() { [ -n "${ROOT:-}" ] && rm -rf "$ROOT"; }

# Without -e, an unset-variable abort under `set -u` (or any other early exit)
# would otherwise skip the per-block teardown call and leave the mktemp -d
# fixture — real git clones included — behind on disk.
trap teardown EXIT

# Runs rebuild.sh with the fixture wired in. Captures output; returns its status.
#
# The sleep is load-bearing: release directories are named to the second, and
# with stubbed builds several runs would otherwise land in the same second, so
# publish would hit an existing "$rel" and nest dist inside it. Production runs
# hourly and cannot collide, but the harness would — and it would mask the
# nesting bug this very test exists to catch.
run_rebuild() {
  sleep 1
  ( cd "$REPO" && env \
      REPO_DIR="$REPO" WWW_DIR="$WWW" STATE_DIR="$STATE" \
      COUNTER_BIN="$REPO/counter/counter" BRANCH=release \
      KEEP="${KEEP_OVERRIDE:-3}" \
      RESTART_CMD="sudo /usr/bin/systemctl restart counter.service" \
      bash "$REBUILD" ) > "$ROOT/run.log" 2>&1
}

# Runs rebuild.sh directly in the background — via `exec`, so $! is
# rebuild.sh's own pid rather than a wrapping subshell's — for tests that
# need to deliver a signal mid-run. Sets SPAWN_PID rather than echoing the
# pid: a plain function call runs in the caller's own shell, so the `&`
# background job lands as a direct child the caller can `wait` on. Piping
# through `$(...)` to capture a printed pid would run this function in a
# command-substitution subshell instead, backgrounding the job as a child of
# *that* subshell — which exits (and reaps nothing) the instant it echoes
# the pid, leaving the caller with a pid that is no longer its own child.
#
# Shared by both signal tests rather than inlined twice: two separate
# `export VAR=...; exec bash "$REBUILD"` subshells with the same variable
# names read as conflicting writes to shellcheck (SC2030/SC2031), even
# though each is confined to its own subshell. The `env VAR=... command`
# prefix form here — like run_rebuild above — scopes the assignment to the
# one command instead, which shellcheck does not flag.
spawn_killable_rebuild() {
  local logfile="$1"
  (
    cd "$REPO" || exit 1
    exec env REPO_DIR="$REPO" WWW_DIR="$WWW" STATE_DIR="$STATE" \
      COUNTER_BIN="$REPO/counter/counter" BRANCH=release KEEP=3 \
      RESTART_CMD="sudo /usr/bin/systemctl restart counter.service" \
      bash "$REBUILD"
  ) > "$logfile" 2>&1 &
  SPAWN_PID=$!
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
if [ -n "$(find "$WWW/releases" -mindepth 1 -maxdepth 1 -name '*.tmp')" ]; then
  bad "staging directory cleaned up"
else
  ok "staging directory cleaned up"
fi
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

echo "flock hard failure"
setup
# A non-1 flock exit is not contention (man flock(1): status 1 is reserved for
# "already locked"). 127 stands in for "flock is missing"/a malformed
# invocation/a bad fd — anything else — and must be a loud failure, not the
# quiet "another run holds the lock" skip-with-exit-0.
cat > "$STUB/flock" <<'EOS'
#!/usr/bin/env bash
exit 127
EOS
run_rebuild; st=$?
if [ "$st" -ne 0 ]; then
  ok "non-contention flock failure exits nonzero"
else
  bad "non-contention flock failure exits nonzero — got 0"
fi
if [ -s "$STATE/LAST_FAILURE" ]; then
  ok "hard flock failure writes a marker"
else
  bad "hard flock failure writes a marker"
fi
teardown

echo "stale mtime prune order"
setup
KEEP_OVERRIDE=2
run_rebuild
rel1="$(readlink "$WWW/current")"
commit_to_release package.json '{"name":"b"}'
run_rebuild
rel2="$(readlink "$WWW/current")"
# rel2 is the second-newest release by name and must survive the next prune
# (KEEP=2). Backdate it so mtime order and name order disagree about which of
# rel1/rel2 is older — a regression test for the disagreement a plain
# `mv dist "$rel"` used to cause (it inherited dist's build-time mtime instead
# of getting a fresh one at publish time). Forced here by hand because the
# current copy-based publish no longer produces that staleness on its own.
touch -t 200001010000 "$rel2"
commit_to_release package.json '{"name":"c"}'
run_rebuild; st=$?
check "exits 0 despite mtime/name disagreement" "$st" "0"
if [ -d "$rel2" ]; then
  ok "release kept per name order survives a stale mtime"
else
  bad "release kept per name order survives a stale mtime — $rel2 was pruned"
fi
if [ -d "$rel1" ]; then
  bad "release due for pruning per name order was kept instead — $rel1 still present"
else
  ok "release due for pruning per name order was pruned"
fi
if [ -d "$(readlink "$WWW/current")" ]; then
  ok "current release directory still exists"
else
  bad "current release directory still exists"
fi
check "current still serves" "$(cat "$WWW/current/index.html" 2>/dev/null)" "SITE"
unset KEEP_OVERRIDE
teardown

echo "stale tmp leftover not counted as a release"
setup
KEEP_OVERRIDE=2
run_rebuild
rel1="$(readlink "$WWW/current")"
commit_to_release package.json '{"name":"b"}'
run_rebuild
rel2="$(readlink "$WWW/current")"
# Simulate a killed earlier run: a "<timestamp>.tmp" staging leftover that
# never got renamed into place. Its name (digits plus a ".tmp" suffix) sorts
# above every real release, so before the fix it would occupy one of the
# KEEP=2 slots and push a genuine release out to be pruned instead.
mkdir -p "$WWW/releases/99999999999999.tmp"
commit_to_release package.json '{"name":"c"}'
run_rebuild; st=$?
rel3="$(readlink "$WWW/current")"
check "exits 0 with a stale .tmp leftover present" "$st" "0"
if [ -d "$rel2" ]; then
  ok "second-newest release survives despite the stale .tmp leftover"
else
  bad "second-newest release survives despite the stale .tmp leftover — $rel2 was pruned"
fi
if [ -d "$rel3" ]; then
  ok "newest release survives despite the stale .tmp leftover"
else
  bad "newest release survives despite the stale .tmp leftover — $rel3 was pruned"
fi
if [ -d "$rel1" ]; then
  bad "release due for pruning per name order was kept instead — $rel1 still present"
else
  ok "release due for pruning per name order was pruned despite the stale .tmp leftover"
fi
check "current still serves" "$(cat "$WWW/current/index.html" 2>/dev/null)" "SITE"
# A killed run's ".tmp" leftover isn't just excluded from the KEEP count — a
# subsequent successful run must actually reclaim the disk it occupies rather
# than stranding it under /var/www forever.
if [ -n "$(find "$WWW/releases" -mindepth 1 -maxdepth 1 -name '*.tmp')" ]; then
  bad "stale .tmp leftover from a killed run is swept by the next successful run"
else
  ok "stale .tmp leftover from a killed run is swept by the next successful run"
fi
unset KEEP_OVERRIDE
teardown

echo "restrictive dist permissions"
setup
touch "$STUB_STATE/npm_build_restrictive"
run_rebuild; st=$?
check "exits 0 despite a restrictive dist/ mode" "$st" "0"
if world_readable "$WWW/current/index.html"; then
  ok "published index.html is world-readable regardless of dist/'s mode"
else
  bad "published index.html is world-readable regardless of dist/'s mode"
fi
if world_executable "$WWW/current/"; then
  ok "published release directory is world-executable regardless of dist/'s mode"
else
  bad "published release directory is world-executable regardless of dist/'s mode"
fi
teardown

echo "empty build guard"
setup
run_rebuild
good_rel="$(readlink "$WWW/current")"
commit_to_release package.json '{"name":"broken"}'
touch "$STUB_STATE/npm_build_empty"
run_rebuild; st=$?
if [ "$st" -ne 0 ]; then
  ok "empty build exits nonzero"
else
  bad "empty build exits nonzero — got 0"
fi
check "current still points at the previous good release" \
  "$(readlink "$WWW/current")" "$good_rel"
check "previous good release still serves" \
  "$(cat "$WWW/current/index.html" 2>/dev/null)" "SITE"
teardown

echo "staging failure after rel is assigned sweeps rel.tmp"
setup
run_rebuild
good_rel="$(readlink "$WWW/current")"
# Force the chmod inside the publish section to fail — this fires after
# "$rel" is assigned and dist has been copied into "$rel.tmp", but before
# "$rel.tmp" is renamed into place. Every existing failure injection (build
# fails, empty build, hard flock failure) dies before "rel" is ever assigned,
# so without this the trap's `rm -rf "$rel.tmp"` — the removal that stops a
# killed run stranding the copied dist tree under /var/www — is unverified.
commit_to_release package.json '{"name":"broken-staging"}'
touch "$STUB_STATE/chmod_fails"
run_rebuild; st=$?
if [ "$st" -ne 0 ]; then
  ok "staging failure after rel is assigned exits nonzero"
else
  bad "staging failure after rel is assigned exits nonzero — got 0"
fi
if [ -n "$(find "$WWW/releases" -mindepth 1 -maxdepth 1 -name '*.tmp')" ]; then
  bad "no *.tmp leftover after a staging failure"
else
  ok "no *.tmp leftover after a staging failure"
fi
check "current still points at the previous good release" \
  "$(readlink "$WWW/current")" "$good_rel"
check "previous good release still serves" \
  "$(cat "$WWW/current/index.html" 2>/dev/null)" "SITE"
rm -f "$STUB_STATE/chmod_fails"
teardown

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
# The header/tail-20-lines excerpt is the marker's entire diagnostic value —
# a `cleanup` that wrote the single literal line "FAILED" would still pass
# the check above, so also pin down the exit status, a real commit (not the
# "unknown" fallback), and that the log excerpt actually arrived.
marker_header="$(head -1 "$STATE/LAST_FAILURE")"
check "marker header records the observed exit status" \
  "$(printf '%s' "$marker_header" | grep -oE 'exit=[0-9]+')" "exit=$st"
if printf '%s' "$marker_header" | grep -qE 'commit=[0-9a-f]{7,40}$'; then
  ok "marker header names a sha-shaped commit, not 'unknown'"
else
  bad "marker header names a sha-shaped commit, not 'unknown' — got '$marker_header'"
fi
if grep -q '^\[rebuild\] building site$' "$STATE/LAST_FAILURE"; then
  ok "marker body carries the run's [rebuild] log excerpt"
else
  bad "marker body carries the run's [rebuild] log excerpt"
fi
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

echo "lock contention from a clean state does not create a marker"
setup
if [ -e "$STATE/LAST_FAILURE" ]; then
  bad "no marker before a contended run"
else
  ok "no marker before a contended run"
fi
cat > "$STUB/flock" <<'EOS'
#!/usr/bin/env bash
exit 1
EOS
chmod +x "$STUB/flock"
run_rebuild; st=$?
check "skipped run exits 0" "$st" "0"
# The other contention block only proves an existing marker survives; nothing
# yet proves a skip from a clean state doesn't fabricate one — the same
# skip_marker plumbing that preserves a marker could just as easily leave a
# stray empty one behind if cleanup's structure were wrong.
if [ -e "$STATE/LAST_FAILURE" ]; then
  bad "clean lock contention does not create a marker"
else
  ok "clean lock contention does not create a marker"
fi
teardown

echo "signal-killed run leaves an existing marker intact"
setup
# Seed a genuine marker the same way the "failure marker" block does.
touch "$STUB_STATE/npm_build_fails"
run_rebuild
rm -f "$STUB_STATE/npm_build_fails"
marker_before="$(cat "$STATE/LAST_FAILURE" 2>/dev/null)"
if [ -n "$marker_before" ]; then
  ok "marker seeded before the signal test"
else
  bad "marker seeded before the signal test"
fi

# Run rebuild.sh directly (via `exec`, so $! is rebuild.sh's own pid rather
# than a wrapping subshell's) with a build that blocks long enough to signal
# it mid-run. The npm stub touches a sentinel the instant it starts blocking,
# so we poll for that instead of guessing a fixed delay.
touch "$STUB_STATE/npm_build_slow"
spawn_killable_rebuild "$ROOT/signal_run.log"
sig_pid="$SPAWN_PID"

waited=0
while [ ! -f "$STUB_STATE/build_started" ] && [ "$waited" -lt 20 ]; do
  sleep 1
  waited=$((waited + 1))
done

if [ -f "$STUB_STATE/build_started" ]; then
  ok "build reached before signaling"
  kill -TERM "$sig_pid" 2>/dev/null
  wait "$sig_pid"
  sig_st=$?
  check "signal-killed run exits 143" "$sig_st" "143"
else
  bad "build reached before signaling — timed out waiting for it to start"
  kill -TERM "$sig_pid" 2>/dev/null
  wait "$sig_pid" 2>/dev/null
fi

marker_after="$(cat "$STATE/LAST_FAILURE" 2>/dev/null)"
check "marker unchanged after a signal-killed run" "$marker_after" "$marker_before"
rm -f "$STUB_STATE/npm_build_slow"
teardown

echo "signal-killed run that held the lock sweeps its own rel.tmp"
setup
# Seed a genuine marker the same way the previous signal-test block does, so
# we can also confirm it survives untouched here.
touch "$STUB_STATE/npm_build_fails"
run_rebuild
rm -f "$STUB_STATE/npm_build_fails"
marker_before="$(cat "$STATE/LAST_FAILURE" 2>/dev/null)"
if [ -n "$marker_before" ]; then
  ok "marker seeded before the held-lock signal test"
else
  bad "marker seeded before the held-lock signal test"
fi

# This is the regression the held_lock/skip_marker split exists to prevent:
# a run that holds the lock and is killed by TERM must still sweep "$rel.tmp"
# — unlike the earlier signal test above, which kills the run during the
# build, before "$rel" is even assigned. Delay the chmod call that runs
# against "$rel.tmp" (after cp -R has created it, before mv renames it into
# place) so the TERM below lands squarely inside that window.
touch "$STUB_STATE/chmod_slow"
spawn_killable_rebuild "$ROOT/signal_run2.log"
sig_pid="$SPAWN_PID"

waited=0
while [ ! -f "$STUB_STATE/chmod_started" ] && [ "$waited" -lt 20 ]; do
  sleep 1
  waited=$((waited + 1))
done

if [ -f "$STUB_STATE/chmod_started" ]; then
  ok "rel.tmp exists (chmod reached) before signaling"
  kill -TERM "$sig_pid" 2>/dev/null
  wait "$sig_pid"
  sig_st=$?
  check "signal-killed run holding the lock exits 143" "$sig_st" "143"
else
  bad "rel.tmp exists (chmod reached) before signaling — timed out waiting for it to start"
  kill -TERM "$sig_pid" 2>/dev/null
  wait "$sig_pid" 2>/dev/null
fi

if [ -n "$(find "$WWW/releases" -mindepth 1 -maxdepth 1 -name '*.tmp')" ]; then
  bad "no *.tmp leftover after a signal-killed run that held the lock"
else
  ok "no *.tmp leftover after a signal-killed run that held the lock"
fi

marker_after="$(cat "$STATE/LAST_FAILURE" 2>/dev/null)"
check "marker unchanged after a signal-killed run that held the lock" \
  "$marker_after" "$marker_before"
rm -f "$STUB_STATE/chmod_slow"
teardown

printf '\n%s\n' "$([ "$fails" -eq 0 ] && echo "PASS" || echo "FAIL ($fails)")"
[ "$fails" -eq 0 ]
