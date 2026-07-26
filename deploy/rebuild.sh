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
mkdir -p "$STATE_DIR"
exec 9>"$LOCKFILE"
# flock -n exits 1 specifically for "already locked" (man flock(1)). Any other
# status — 127 if flock itself is missing, a bad-fd error, a malformed
# invocation — is not contention, and treating it as such would log a benign
# "skipping" and exit 0 while never having published anything: an hourly timer
# would report success forever. Only status 1 gets the quiet skip; anything
# else is a loud failure with the real status preserved.
if flock -n 9; then
  :
else
  flock_status=$?
  if [ "$flock_status" -eq 1 ]; then
    log "another run holds $LOCKFILE; skipping"
    exit 0
  fi
  log "flock failed unexpectedly (exit $flock_status) on $LOCKFILE"
  exit "$flock_status"
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

# `set -e` only catches a nonzero `npm run build`; it says nothing about a
# build that exits 0 but produced nothing or a truncated index.html. This is
# the one check standing between a broken build and a published empty site,
# so it fails loudly rather than letting the mv below publish it.
if [ ! -s dist/index.html ]; then
  log "dist/index.html missing or empty after build; refusing to publish"
  exit 1
fi

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

# 6. Prune old releases, keeping the newest $KEEP. Sort by directory name, not
# mtime: releases are named "$ts" (%Y%m%d%H%M%S, publish time by construction),
# and lexicographic order on that name is chronological. mtime order broke
# when publish switched to `mv dist "$rel"`: a rename carries dist's mtime
# rather than getting a fresh one at publish time, so sorting by mtime is now
# incidental, not structural.
#
# Also never prune whatever "current" resolves to right now, as insurance
# against unlinking the live tree even if name/mtime ordering is ever wrong.
current_target="$(readlink "$WWW_DIR/current" 2>/dev/null || true)"
case "$current_target" in
  /*) ;;
  ?*) current_target="$WWW_DIR/$current_target" ;;
esac
prune_failed=0
while IFS= read -r old; do
  old="${old%/}"
  if [ -n "$current_target" ] && [ "$old" = "$current_target" ]; then
    log "skipping prune of $old: current points at it"
    continue
  fi
  log "pruning $old"
  rm -rf "$old" || prune_failed=1
done < <(printf '%s\n' "$WWW_DIR"/releases/*/ | sort -r | tail -n "+$((KEEP + 1))")
# The publish above already succeeded; a stray rm -rf failure here (e.g.
# EACCES) must not turn a live, correctly published release into a nonzero
# script exit — a later task keys a failure marker off this exit status, and
# that alarm must mean the publish failed, not that a prune hiccupped.
if [ "$prune_failed" -ne 0 ]; then
  log "one or more releases failed to prune; publish already succeeded, not failing the run"
fi
log "done"
