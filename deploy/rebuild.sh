#!/usr/bin/env bash
# Rebuild and atomically publish desktopcolors.com from the `release` branch.
#
# The single entry point for deployment, run either by counter-rebuild.timer
# (hourly) or by hand. Each run resets the checkout to origin/$BRANCH, rebuilds,
# and flips the `current` symlink nginx serves. Safe to re-run, and safe to run
# while another copy is running — the second exits 0 having done nothing.
#
# Every run also asserts the counter is actually serving (step 3), and exits
# nonzero when it isn't — so `systemctl restart` reporting success over a
# service that cannot start surfaces in $MARKER within the hour, instead of
# never.
#
# Rollback is `git revert` on the release branch, never a local operation: this
# script unconditionally rebuilds origin/$BRANCH, so a rollback held only in
# server-side state would be silently undone at the next hourly run.
set -euo pipefail

log() { printf '[rebuild] %s\n' "$*"; }

REPO_DIR="${REPO_DIR:-/opt/desktopcolors}"
WWW_DIR="${WWW_DIR:-/var/www/desktopcolors}"
STATE_DIR="${STATE_DIR:-/var/lib/desktopcolors}"
DB_PATH="${DB_PATH:-$STATE_DIR/counter.db}"
COUNTER_BIN="${COUNTER_BIN:-$REPO_DIR/counter/counter}"
# Set here, not on the systemd unit, so both invocation paths — the unit and
# the documented manual `sudo -u desktopcolors bash ...` run — agree. Without
# this, `go` falls back to $HOME/go/pkg/mod (HOME is desktopcolors' home dir,
# /opt/desktopcolors, either way) which differs from what the unit used to set
# explicitly, and the host ends up downloading and storing
# modernc.org/sqlite and its dependencies (~360 MB) twice.
GOCACHE="${GOCACHE:-$REPO_DIR/.cache/go-build}"
GOMODCACHE="${GOMODCACHE:-$REPO_DIR/.cache/go-mod}"
# Keep Go's *work* directory under $REPO_DIR too, and not for cache reasons:
# `go build -o` does not write the binary in place. It links into a work
# directory made with os.MkdirTemp($GOTMPDIR, ...) — falling back to $TMPDIR,
# i.e. /tmp — and then *renames* the result onto the -o path (cmd/go's
# moveOrCopyFile prefers os.Rename, copying only when the source sits inside
# $GOCACHE, on Windows, or when the destination directory is setgid). A rename
# carries the source inode's SELinux label with it, so with the default /tmp
# the freshly built binary arrives in /opt still labelled user_tmp_t —
# clobbering the correctly labelled mktemp file below in the process. systemd
# is not permitted to execute user_tmp_t, so counter.service then dies at
# every single start with status=203/EXEC. Pointing GOTMPDIR at $REPO_DIR
# makes the rename source inherit /opt's usr_t by the same type-transition
# rule that would have applied to the temp file, so the installed binary is
# correctly labelled by construction. This is the only fix available here: a
# per-run `restorecon` needs privileges this script deliberately does not have.
GOTMPDIR="${GOTMPDIR:-$REPO_DIR/.cache/tmp}"
export GOCACHE GOMODCACHE GOTMPDIR
BRANCH="${BRANCH:-release}"
KEEP="${KEEP:-3}"
# A non-numeric KEEP (empty, "abc", ...) would make $((KEEP + 1)) abort the
# process-substitution subshell under `set -u` below, so the prune loop reads
# zero lines and the script exits 0 with retention silently switched off — no
# alarm, no log. Reject it here instead, loudly and early.
case "$KEEP" in
  ''|*[!0-9]*)
    log "KEEP must be a non-negative integer, got '$KEEP'"
    exit 1
    ;;
esac
LOCKFILE="${LOCKFILE:-$STATE_DIR/rebuild.lock}"
MARKER="${MARKER:-$STATE_DIR/LAST_FAILURE}"
RESTART_CMD="${RESTART_CMD:-sudo /usr/bin/systemctl restart counter.service}"
# Must agree with counter.service's --addr, which hardcodes 127.0.0.1:8787.
# Change one, change the other.
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/healthz}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-15}"
LOCK_HASH_FILE="$REPO_DIR/.deploy-lock-hash"

# GNU coreutils on the host, BSD on a developer's macOS. Kept portable so
# deploy/rebuild.test.sh can run the real script locally.
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Does the counter actually answer? Polls rather than sleeping a fixed amount:
# a plain restart binds in well under a second, but one that has to wait out
# the unit's RestartSec, or a cold sqlite open on a large store, can take
# longer, and a single immediate probe would report a false failure. Bounded,
# so a genuinely dead counter is reported rather than hanging the run.
counter_healthy() {
  local i
  for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
    if curl -fsS --max-time 2 -o /dev/null "$HEALTH_URL"; then
      return 0
    fi
    # Spelled as a full `if` rather than `[ ... ] && sleep 1`, which would
    # leave the loop body's status at 1 on the final pass and make the
    # function's behaviour depend on `set -e` being suspended by the caller's
    # condition context.
    if [ "$i" -lt "$HEALTH_ATTEMPTS" ]; then
      sleep 1
    fi
  done
  return 1
}

cd "$REPO_DIR"

# Mirror output to a run log so the EXIT trap below can quote its tail into
# the failure marker.
#
# Known limitation: tee's writes race the trap on exit, so a run that dies
# right at the very end can leave the marker's tail short its last line or
# two. The full log is always in journalctl -u counter-rebuild.
RUNLOG="$(mktemp)"
exec > >(tee -a "$RUNLOG") 2>&1

# Set by the lock-contention skip path below, and by the signal traps right
# after it. A skipped or signal-killed run must neither record a failure of
# its own nor erase a marker left by a genuine earlier failure, so cleanup
# leaves $MARKER completely alone whenever this is set — see cleanup() below.
skip_marker=0
# Set immediately after this run acquires the lock (flock -n succeeds,
# below) — never by the signal traps. A run that never held the lock — lock
# contention, or a signal that arrived before the lock was taken — created
# none of current.tmp, "$rel.tmp" or the .counter.* scratch files, so it must
# not remove them: those belong to whichever process actually holds the
# lock. A run that did hold the lock owns those files regardless of how it
# ends — success, failure, or a signal — and must sweep them; see cleanup()
# below. This is deliberately a separate flag from skip_marker: holding the
# lock and being a signal death are independent facts about a run.
held_lock=0
# Set when step 3 finds the counter already dead without this run having
# changed its binary. Such a run still publishes — a counter outage that
# predates it must not block an unrelated content deploy — but it must not
# report success either, so it exits nonzero at the very end instead; see the
# end of step 3 and the final check below.
counter_unhealthy=0

# Installed before the lock so it covers the whole run, not just the publish
# step further down: a run that held the lock must sweep its staging
# leftovers no matter how it ends, and unless skip_marker says otherwise must
# record or clear $MARKER.
cleanup() {
  local st=$?
  # Disarm the signal traps before doing any work. Without this, a second
  # TERM/INT/HUP arriving mid-cleanup re-enters this same trap: the
  # `> "$MARKER"` redirect a few lines down would be caught mid-write,
  # leaving $MARKER truncated to empty, and $RUNLOG's removal below could
  # never be reached, leaking it. From here on a second signal is ignored
  # until this run exits on its own.
  trap '' TERM INT HUP
  # A run that held the lock owns current.tmp, "$rel.tmp" and the
  # .counter.* scratch files regardless of how it ends — success, failure,
  # or a signal — and must sweep them so a killed run never strands the
  # staging tree under /var/www. A run that never held the lock — lock
  # contention, or a signal that arrived before the lock was acquired — owns
  # none of them; they belong to whichever process actually holds the lock,
  # so this run must leave them alone.
  if [ "$held_lock" -eq 1 ]; then
    rm -rf "$WWW_DIR/current.tmp" || true
    if [ -n "${rel:-}" ]; then
      rm -rf "$rel.tmp" || true
    fi
    rm -f "$REPO_DIR"/counter/.counter.* 2>/dev/null || true
  fi
  # Contention and signal deaths both leave $MARKER completely untouched —
  # neither writing a failure of their own nor clearing a genuine earlier
  # one. Only a run that actually ran to completion (success or a real
  # failure) may touch it.
  if [ "$skip_marker" -eq 0 ]; then
    if [ "$st" -ne 0 ]; then
      {
        printf 'FAILED %s exit=%s commit=%s\n' \
          "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$st" \
          "$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
        tail -20 "$RUNLOG"
      } > "$MARKER" 2>/dev/null || true
    else
      rm -f "$MARKER" || true
    fi
  fi
  # $RUNLOG is this run's own scratch file on every path — contention,
  # signal, success, or failure — so it is always removed.
  rm -f "$RUNLOG" || true
}
trap cleanup EXIT
# bash runs the EXIT trap for a signal death too (only SIGKILL bypasses it),
# but $? inside that trap is 0 in that case even though the script itself
# exits 128+signum — so without this, systemctl stop/a reboot/a timeout
# mid-build would take cleanup's *success* branch and erase a marker
# recording a real earlier failure. Route signal deaths into the same "leave
# $MARKER completely alone" path already built for lock contention instead:
# an operator-aborted run is not a build failure (systemd reports the signal
# itself), so it must neither write a marker nor clear one. This says
# nothing about held_lock: a signal-killed run that holds the lock still
# owns its staging files and cleanup still sweeps them; see cleanup() above.
#
# Exit 128+signum per signal (143/130/129) rather than hardcoding 143 for
# all three, so INT and HUP are reported to journald honestly instead of
# every signal death showing up as a SIGTERM.
trap 'skip_marker=1; exit 143' TERM
trap 'skip_marker=1; exit 130' INT
trap 'skip_marker=1; exit 129' HUP

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
  held_lock=1
else
  flock_status=$?
  if [ "$flock_status" -eq 1 ]; then
    log "another run holds $LOCKFILE; skipping"
    skip_marker=1
    exit 0
  fi
  log "flock failed unexpectedly (exit $flock_status) on $LOCKFILE"
  exit "$flock_status"
fi

# Preflight: git, npm, go and curl must all be resolvable on PATH before
# anything below tries to use them. Both ways this script runs — the
# counter-rebuild.service unit (systemd's default service PATH has no
# /usr/local/go/bin) and the documented manual `sudo -u desktopcolors bash
# ...` invocation in SETUP.md — are non-login shells, so
# /etc/profile.d/go.sh, which only login shells source, never runs and `go`
# can resolve nowhere. Without this check that's a bare exit 127 from deep
# inside the build; check all four up front instead, so a missing tool
# produces one message naming it. The fix is not a /usr/local/bin/go symlink
# — AlmaLinux 8's stock sudo secure_path has no /usr/local/bin on it, unlike
# Debian's — but the scoped secure_path override in deploy/desktopcolors.sudoers;
# see deploy/SETUP.md § 1 and § 5 for the full setup.
#
# curl is here for the counter health probe in step 3. It is checked up front
# with the rest rather than guarded at its call site, so a host without it
# fails with the same named message instead of silently skipping the one
# assertion that proves the deployed counter actually serves.
for tool in git npm go curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    log "required tool '$tool' not found on PATH; see deploy/SETUP.md"
    exit 1
  fi
done

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

# 3. Rebuild the counter, and restart it only if the compiled bytes changed.
# Without this, a Go fix pushed to the deploy branch would report a successful
# deploy while the service kept running the old binary, with nothing reporting
# the discrepancy.
#
# $GOTMPDIR has to exist before `go build` runs — go calls os.MkdirTemp inside
# it and aborts with "creating work dir" if it is missing, unlike GOCACHE and
# GOMODCACHE, which it creates itself. See the GOTMPDIR comment at the top for
# why the work directory must not be left to default to /tmp.
mkdir -p "$GOTMPDIR"
tmpbin="$(mktemp "$REPO_DIR/counter/.counter.XXXXXX")"
log "building counter"
(cd counter && CGO_ENABLED=0 go build -o "$tmpbin" .)
if cmp -s "$tmpbin" "$COUNTER_BIN"; then
  log "counter unchanged"
  rm -f "$tmpbin"
  # `cmp` compares bytes, so it says nothing about whether the *installed*
  # binary can still run. A host-side problem — a wrong SELinux label on it, a
  # full disk, a corrupt store — leaves the compiled bytes identical, takes
  # this branch, skips the restart, and used to end here with nothing having
  # looked at the service at all. That is exactly how a status=203/EXEC outage
  # went unnoticed: every hourly run reported a clean publish over a counter
  # that had never once started.
  #
  # Don't fail here, though. A counter outage that predates this run must not
  # block an unrelated content deploy, so record it, publish as normal, and
  # fail at the very end — which still writes $MARKER (SETUP.md § 11).
  if counter_healthy; then
    log "counter healthy at $HEALTH_URL"
  else
    log "counter is not answering at $HEALTH_URL; publishing anyway, then failing this run"
    counter_unhealthy=1
  fi
else
  chmod 0755 "$tmpbin"
  # `mv`, never `install`/`cp`: Linux returns ETXTBSY when writing to the binary
  # of a running process, while a rename only swaps the directory entry and
  # leaves the running inode alone. The temp file is a sibling for the same
  # reason — a cross-filesystem mv degrades to copy-then-unlink and hits
  # ETXTBSY again.
  mv -f "$tmpbin" "$COUNTER_BIN"
  log "counter changed; restarting service"
  read -ra restart_argv <<< "$RESTART_CMD"
  "${restart_argv[@]}"
  # Prove the restart produced a *serving* counter instead of trusting
  # systemctl's exit status, which only reports that systemd was asked to
  # start the unit: for a Type=simple service it returns 0 well before — and
  # regardless of whether — the binary can be executed at all (203/EXEC) or
  # the store opens. This is the one check standing between a broken counter
  # and a release published as if it were healthy, so it fails loudly and
  # *before* the publish, in the same spirit as the empty-dist guard below.
  if ! counter_healthy; then
    log "counter did not come up at $HEALTH_URL after restart; refusing to publish"
    exit 1
  fi
  log "counter healthy at $HEALTH_URL"
fi

# 4. Dump current popularity scores for the build to bake in. A missing DB is
# fine on first run: the site reads all-zero scores.
if [ -x "$COUNTER_BIN" ]; then
  "$COUNTER_BIN" dump --db "$DB_PATH" --out "$REPO_DIR/scores.json" \
    || log "dump failed; building with the existing/empty scores.json"
else
  log "no counter binary at $COUNTER_BIN; building with the existing/empty scores.json"
fi

# 5. Build.
log "building site"
npm run build

# `set -e` only catches a nonzero `npm run build`; it says nothing about a
# build that exits 0 but produced nothing or a truncated index.html. This is
# the one check standing between a broken build and a published empty site,
# so it fails loudly rather than letting the copy below publish it.
if [ ! -s dist/index.html ]; then
  log "dist/index.html missing or empty after build; refusing to publish"
  exit 1
fi

# 6. Publish atomically: copy dist into a new release via a staging directory,
# rename the staging directory into place, then flip the symlink.
ts="$(date -u +%Y%m%d%H%M%S)"
rel="$WWW_DIR/releases/$ts"
mkdir -p "$WWW_DIR/releases"
# Refuse rather than nest. If $rel already exists, `mv "$rel.tmp" "$rel"`
# below would move the staging directory *inside* it instead of replacing it,
# landing as "$rel/$ts.tmp" — publishing the *old* release's contents with a
# permanently orphaned staging tree nested inside. Names are second-granular
# and builds take far longer than a second, so this should be unreachable; it
# is here because that failure is invisible until someone finds the orphaned
# nested directory.
if [ -e "$rel" ]; then
  log "release directory $rel already exists; refusing to publish"
  exit 1
fi
# Copy, never rename, dist into the release. SELinux labels a file by type
# transition from its parent directory *at creation time*; `mv` is a rename
# and would carry /opt's label into /var/www, where nginx (httpd_t, read-only
# on httpd_sys_content_t) would then silently 403 the entire release. `cp -R`
# creates new files, which inherit the destination's label by construction.
#
# Never use `cp -a`, `cp -p`, `--preserve=all`, `--preserve=context` or `-Z`
# here: `-a` implies `--preserve=all`, which would preserve exactly the wrong
# label and silently recreate the bug this change exists to fix.
#
# Stage into "$rel.tmp" (cp -R creates it — if it already existed, cp -R would
# nest dist *inside* it instead of becoming it) so the release appears
# atomically in one rename; sweep any stale leftovers from killed previous
# runs first (see the prune-time sweep below for why this covers more than
# just "$rel.tmp").
rm -rf "$WWW_DIR"/releases/*.tmp
cp -R dist "$rel.tmp"
# nginx must be able to read every published file and traverse every
# published directory, regardless of what mode dist/ was built with (a
# restrictive ambient umask, a UMask= systemd setting, whatever). Set that
# explicitly rather than relying on a umask, which can only clear bits it
# never had a chance to set in the first place — it cannot fix a dist/ that
# was already written 600/700. `a+rX` adds read for everyone and adds execute
# only where it's already set for someone (i.e. directories, plus files that
# were already executable), which is exactly the web-root requirement.
chmod -R a+rX "$rel.tmp"
mv "$rel.tmp" "$rel" # SELinux-safe: both paths are already under /var/www
ln -sfn "$rel" "$WWW_DIR/current.tmp"
# mv -Tf is GNU (the host); -hf is the BSD/macOS equivalent. Both replace the
# symlink atomically rather than following it into its target directory.
if ! mv -Tf "$WWW_DIR/current.tmp" "$WWW_DIR/current" 2>/dev/null; then
  mv -hf "$WWW_DIR/current.tmp" "$WWW_DIR/current"
fi
log "published release $ts"

# 7. Prune old releases, keeping the newest $KEEP. Names are publish-time
# "$ts" (%Y%m%d%H%M%S), so lexicographic order is chronological by
# construction, independent of mtime.
#
# Only consider release-shaped names (14 digits): a killed run's leftover
# "$ts.tmp" directory, or any other stray directory under releases/, would
# otherwise sort into the listing below and occupy one of the KEEP slots
# meant for real releases.
#
# Also never prune whatever "current" resolves to right now, as insurance
# against unlinking the live tree even if name/mtime ordering is ever wrong.
# Compared by inode (`-ef`), not by string: a manual rollback such as
# `ln -sfn releases/<ts>/ current` (trailing slash) or a relative
# `./releases/<ts>` target produces a string that a readlink/case comparison
# would never match, even though it resolves to the same directory. `-ef`
# compares device and inode through symlinks, needs no path normalization,
# and is correctly false when "current" does not exist yet (first run).
prune_failed=0
# Filter to release-shaped names *before* sorting, in a plain loop rather than
# inside the process substitution below: on bash 3.2 (the system bash on
# macOS), a `case` pattern's `)` inside a `<( ... )` process substitution is a
# syntax error — and an unbalanced `)` inside a comment there passes `bash -n`
# but fails at runtime with a `/dev/fd/...: No such file or directory` error.
# Keep pattern matching outside the process substitution to avoid both.
release_dirs=""
for d in "$WWW_DIR"/releases/*/; do
  base="${d%/}"
  base="${base##*/}"
  case "$base" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) release_dirs="$release_dirs$d"$'\n' ;;
  esac
done
while IFS= read -r old; do
  old="${old%/}"
  if [ "$old" -ef "$WWW_DIR/current" ]; then
    log "skipping prune of $old: current points at it"
    continue
  fi
  log "pruning $old"
  rm -rf "$old" || prune_failed=1
done < <(printf '%s' "$release_dirs" | sort -r | tail -n "+$((KEEP + 1))")
# The publish above already succeeded; a stray rm -rf failure here (e.g.
# EACCES) must not turn a live, correctly published release into a nonzero
# script exit — a later task keys a failure marker off this exit status, and
# that alarm must mean this run failed to deliver a working deploy, not that a
# prune hiccupped. A dead counter does qualify, which is why the check below
# is allowed to fail the run and this one is not.
if [ "$prune_failed" -ne 0 ]; then
  log "one or more releases failed to prune; publish already succeeded, not failing the run"
fi
log "done"

# Deliberately the very last thing the script does. Step 3 found the counter
# already down without this run having changed its binary, so the publish was
# allowed to complete — content deploys must not be held hostage to a counter
# outage they had no part in — but the run must not report success while the
# service answering /api/event is dead. Failing here is what puts it in
# $MARKER and in front of whoever reads SETUP.md § 11; silence is precisely
# what kept the original outage invisible.
if [ "$counter_unhealthy" -ne 0 ]; then
  log "publish succeeded, but the counter is not serving at $HEALTH_URL"
  exit 1
fi
