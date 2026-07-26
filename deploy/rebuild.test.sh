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
  run)
    if [ "$2" = "build" ]; then
      mkdir -p dist
      if [ -f "$STUB_STATE/npm_build_empty" ]; then
        : > dist/index.html
      else
        printf 'SITE\n' > dist/index.html
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
  chmod +x "$STUB"/* "$STUB_STATE/counter_payload"
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

printf '\n%s\n' "$([ "$fails" -eq 0 ] && echo "PASS" || echo "FAIL ($fails)")"
[ "$fails" -eq 0 ]
