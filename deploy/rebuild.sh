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
# mv -Tf is Linux (GNU coreutils); -hf achieves the same atomic replace on macOS/BSD.
if mv -Tf "$WWW_DIR/current.tmp" "$WWW_DIR/current" 2>/dev/null; then
  :
else
  mv -hf "$WWW_DIR/current.tmp" "$WWW_DIR/current"
fi
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
