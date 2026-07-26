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
