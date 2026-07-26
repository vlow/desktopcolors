# MVP production deployment

Status: approved design, not yet implemented.

Deploy `desktopcolors.com` from the `release` branch onto the existing AlmaLinux 8
host. Deliberately minimal: no environments beyond production, no automatic
rollback, no health probes, no fallback symlink.

## Target host

One AlmaLinux 8 VM that **already serves other, unrelated sites**. nginx and
certbot are installed and in use; 80/443 are already open; SELinux is enforcing.
`desktopcolors.com` and `www.desktopcolors.com` already resolve to this VM.

Nothing in this design may modify global nginx config, another site's server
block, the stock `/etc/logrotate.d/nginx`, or firewalld. Every constraint below
that looks pedantic exists because this host is shared.

## Trigger model: pull only

The VM owns the schedule. `rebuild.sh` is the single entry point and does its own
`git fetch` + `git reset --hard origin/release`. Nothing on GitHub knows the VM
exists — no deploy key, no inbound SSH, no webhook listener, no workflow.

A push to `release` therefore goes live at the next hourly run, or immediately if
someone runs `rebuild.sh` by hand. Both paths are the same script.

### Rollback is `git revert` on `release`

There is intentionally no rollback mechanism on the box. Because the hourly job
unconditionally rebuilds `origin/release`, any rollback held only in local server
state would be silently undone within the hour — that defect is what the earlier
immutable-source-tree proposal existed to work around. Reverting on `release`
removes the need for the workaround: it is the only rollback that survives the
next hourly run, so it is the correct one regardless of how much machinery sits
underneath.

### Failure is already safe

`rebuild.sh` flips the `current` symlink only *after* a successful build. Under
`set -euo pipefail` a failing build aborts before the flip, so the previous
release keeps serving, untouched. A broken commit on `release` produces a failed
systemd unit and a still-working site. This is why no rollback is needed, not a
gap left by omitting one.

## Scheduling: keep the existing systemd timer

`deploy/counter-rebuild.timer` (`OnCalendar=hourly`, `Persistent=true`,
`RandomizedDelaySec=120`) and its `counter-rebuild.service` already exist and are
the hourly trigger. Preferred over a crontab entry: journald captures the logs,
and `Persistent=true` runs a catch-up build after a reboot that spans an hour
boundary.

## `rebuild.sh` changes

The publish half of the script is already correct and stays. Six changes:

### 1. Lock (new)

Wrap the whole run in `flock`:

```bash
LOCKFILE="${LOCKFILE:-/var/lib/desktopcolors/rebuild.lock}"
exec 9>"$LOCKFILE"
flock -n 9 || { log "another run in progress; skipping"; exit 0; }
```

Without this, a manual run overlapping the hourly run lets `git reset --hard`
rewrite files under the in-flight build — a genuine torn-tree failure. This one
line is what makes the single-checkout approach safe.

`flock -n` with `exit 0`, not a wait: a skipped run must not be recorded as a
failure, and hourly runs must not pile up behind a long manual one.

### 2. Fetch and reset (new — the actual missing piece)

```bash
git fetch --prune origin
git reset --hard "origin/${BRANCH:-release}"
```

This is what connects a GitHub push to a deploy; today the script builds whatever
happens to be in `/opt/desktopcolors`. No `git clean`: `reset --hard` is
sufficient, and `clean` risks deleting untracked state.

Safe because `scores.json`, `counter/counter`, `node_modules/` and `dist/` are all
gitignored, so `reset --hard` cannot clobber the score dump or the live binary.

### 3. Gate `npm ci` on the lockfile hash (new)

`npm ci` deletes and reinstalls `node_modules` (~245 MB) unconditionally, every
hour, almost always to reproduce byte-identical output. Gate it:

```bash
new_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat "$LOCK_HASH_FILE" 2>/dev/null)" != "$new_hash" ]; then
  npm ci --no-audit --no-fund
  printf '%s\n' "$new_hash" > "$LOCK_HASH_FILE"
fi
```

`LOCK_HASH_FILE` is `$REPO_DIR/.deploy-lock-hash`, untracked (add to
`.gitignore`), so `reset --hard` leaves it alone.

### 4. Rebuild and conditionally restart the counter (new)

Today the Go binary is compiled once during setup and never again. Once the
script starts pulling, that becomes a trap: a Go fix pushed to `release` would
report a successful deploy while the counter kept running the old binary, with
nothing anywhere reporting the discrepancy.

```bash
tmpbin="$(mktemp "$REPO_DIR/counter/.counter.XXXXXX")"
(cd counter && CGO_ENABLED=0 go build -o "$tmpbin" .)
if ! cmp -s "$tmpbin" "$COUNTER_BIN"; then
  chmod 0755 "$tmpbin"
  mv -f "$tmpbin" "$COUNTER_BIN"
  sudo /usr/bin/systemctl restart counter.service
else
  rm -f "$tmpbin"
fi
```

Two non-obvious requirements:

- **`mv`, never `install` or `cp`.** Linux returns `ETXTBSY` when writing to the
  binary of a running process. `mv` is a rename: it swaps the directory entry and
  leaves the running inode alone.
- **The temp file must live in `$REPO_DIR/counter/`,** not `/tmp`. A cross-filesystem
  `mv` degrades to copy-then-unlink, which reintroduces `ETXTBSY`.

The hash comparison means the ~1 s counter interruption happens only in the hours
where Go code actually changed.

### 5. Failure marker (new)

```bash
MARKER=/var/lib/desktopcolors/LAST_FAILURE
RUNLOG="$(mktemp)"
exec > >(tee -a "$RUNLOG") 2>&1

cleanup() {
  st=$?
  rm -f "$WWW_DIR/current.tmp"
  if [ "$st" -ne 0 ]; then
    { echo "FAILED $(date -u +%FT%TZ) exit=$st commit=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
      tail -20 "$RUNLOG"
    } > "$MARKER" 2>/dev/null || true
  else
    rm -f "$MARKER"
  fi
  rm -f "$RUNLOG"
}
trap cleanup EXIT
```

Replaces the existing `trap 'rm -f .../current.tmp' EXIT`, absorbing its job.

`/var/lib/desktopcolors/`, **not** anywhere under `/var/www`. nginx's `root` is
`/var/www/desktopcolors/current` and cannot serve paths above itself, so a marker
in `/var/www/desktopcolors/` would not in fact be reachable today — but it would
become reachable the first time someone changes the root or enables `autoindex`.
`/var/lib` removes the question, and the service already writes there for SQLite.

Known limitation, accepted for the MVP: `exec > >(tee …)` means the trap can fire
before `tee` flushes its final buffer, so the last line or two may be missing from
the marker. The full log is always in `journalctl -u counter-rebuild`.

### 6. Publish tweaks

- Replace `mkdir -p "$rel"; cp -a dist/. "$rel/"` with `mkdir -p "$WWW_DIR/releases"`
  followed by `mv dist "$rel"`. Note the parent is created but `$rel` itself must
  **not** be — `mv` onto an existing directory nests (`$rel/dist/`) instead of
  becoming it. A rename rather than a copy; `dist/` is regenerated by the next
  build. Never worse than `cp`, and on one filesystem it is free.
- `KEEP=3` (was 5). At ~72 MB per release that is ~216 MB retained.
- Drop the `mv -hf` macOS/BSD fallback branch. Alma 8 has GNU coreutils, so
  `mv -Tf` always succeeds and the second branch is unreachable.

## nginx changes

Installed to **`/etc/nginx/conf.d/desktopcolors.conf`** — RHEL-family nginx has no
`sites-available`/`sites-enabled`. `conf.d` is included from inside `http{}`, so
the `map` and `log_format` at the top of the file remain valid where they are.

### Cache policy for `view.json` (new)

`/os/<slug>/view.json` is fetched at runtime by `src/islands/OsDetail.tsx:78` from
an **unhashed** URL, and every build regenerates it. With no `expires` directive
nginx sends no `Cache-Control`, so browsers apply heuristic caching and a client
can hold a stale `view.json` while the surrounding HTML is fresh — precisely the
inconsistency the hourly score refresh exists to prevent.

```nginx
location ~ /view\.json$ {
    expires 5m;
    try_files $uri =404;
}
```

`expires 5m` (not `no-cache`) so ordinary browsing is served from cache with no
revalidation round trip at all. On an hourly deploy cadence a ≤5 minute stale
window is immaterial. `expires` emits `Cache-Control: max-age=300` on its own; no
`add_header` needed. Regex locations are evaluated before the `location /` prefix
match, so file order does not matter.

`gzip_types` already includes `application/json`, so these already compress.

### Prefix the http-scope names (new)

`map $remote_addr $remote_addr_anon` and `log_format anon` sit at `http{}` scope on
a host serving other sites. If any other conf already defines either name, nginx
fails to load with a duplicate error — taking down every site on the box, not just
this one. Rename to `$dc_remote_addr_anon` and `log_format dc_anon` so a collision
is not possible, and update the `access_log` line to match.

### Move the logs into a subdirectory (new)

`access_log`/`error_log` move to `/var/log/nginx/desktopcolors/{access,error}.log`.

The stock `/etc/logrotate.d/nginx` globs `/var/log/nginx/*.log`, which would also
match our two files. logrotate reports a duplicate entry and **skips** the file, so
our retention rules would silently not apply. The usual fix is to exclude our files
in the stock config, but that file is off-limits on this host. A subdirectory is not
matched by `*.log`, so it sidesteps the collision without touching shared config.

Not claimed anywhere: `default_server`. Our block matches on `server_name` only, so
it coexists with the existing sites.

## logrotate changes

`deploy/desktopcolors.logrotate` → `/etc/logrotate.d/desktopcolors`, mode 0644.

- Paths updated to `/var/log/nginx/desktopcolors/{access,error}.log`.
- `create 0640 www-data adm` → `create 0640 nginx adm`. There is no `www-data`
  user on RHEL.
- `/var/run/nginx.pid` → `/run/nginx.pid` in the postrotate hook.
- Header comment rewritten: it currently explains the Debian collision and the
  Debian fix. Replace with the subdirectory rationale above.

Retention windows are unchanged — 14 days access, 7 days error — so the "Server
logs" clause in `src/pages/privacy.astro` stays accurate and needs no edit.

## New file: `deploy/desktopcolors.sudoers`

Installed to `/etc/sudoers.d/desktopcolors`, mode 0440, validated with
`visudo -cf`. Exactly one grant:

```
desktopcolors ALL=(root) NOPASSWD: /usr/bin/systemctl restart counter.service
```

The unprivileged service user cannot otherwise restart the counter after
recompiling it. Scoped to that single command with a literal argument.

**Do not add `NoNewPrivileges=true` to `counter-rebuild.service`.** It would block
the setuid transition `sudo` requires, and the restart would fail. `counter.service`
does set it, correctly — it never calls `sudo`. The two units differ here on
purpose; the asymmetry is easy to "fix" into a breakage.

## `counter-rebuild.service` changes

Set `HOME`, `GOCACHE` and `GOMODCACHE` explicitly. `go build` and `npm ci` both
fail without a writable cache directory, and relying on systemd deriving `HOME`
from the passwd entry is an unnecessary dependency:

```
Environment=HOME=/opt/desktopcolors
Environment=GOCACHE=/opt/desktopcolors/.cache/go-build
Environment=GOMODCACHE=/opt/desktopcolors/.cache/go-mod
```

`ReadWritePaths` already covers `/opt/desktopcolors`. No other changes;
`counter.service` and `counter-rebuild.timer` are untouched.

## `SETUP.md` rewrite

The current file targets Debian/Ubuntu on a dedicated host. Every one of `apt-get`,
NodeSource, `sites-available`, `www-data`, and the absence of SELinux is wrong
here. Rewrite for Alma 8:

1. **Toolchains.** `dnf module enable nodejs:20 && dnf install -y nodejs`. Go still
   from the go.dev tarball — 1.25 (the `modernc.org/sqlite` floor) is not packaged
   for Alma 8; that section is OS-agnostic and carries over.
2. **User and directories.** `useradd --system --home-dir /opt/desktopcolors --shell
   /usr/sbin/nologin`. Create `/var/www/desktopcolors/releases`,
   `/var/lib/desktopcolors`, and `/var/log/nginx/desktopcolors` (owner `nginx`).
3. **Clone.** `git clone -b release https://github.com/vlow/desktopcolors.git
   /opt/desktopcolors`, then `chown -R desktopcolors:desktopcolors` over
   `/opt/desktopcolors`, `/var/www/desktopcolors` and `/var/lib/desktopcolors`.
4. **SELinux** — new section, and the step most likely to be skipped and then
   misdiagnosed:
   - `setsebool -P httpd_can_network_connect 1`, or the `/api/event` proxy to
     `127.0.0.1:8787` is denied and every beacon fails.
   - `restorecon -Rv /var/www/desktopcolors` so the release trees carry
     `httpd_sys_content_t`.
   - `/var/log/nginx/desktopcolors` inherits `httpd_log_t` from its parent; verify
     with `ls -Zd` rather than assuming.
5. **nginx.** Copy to `conf.d`, `nginx -t`, reload. Call out explicitly that
   `nginx -t` validates *every* site on the host, so a failure here can block a
   reload that other sites depend on — check it before reloading, not after.
6. **TLS.** certbot is already installed; only
   `certbot --nginx -d desktopcolors.com -d www.desktopcolors.com` is needed. It
   edits only our `conf.d` file.
7. **DNS** becomes a verification step (`dig +short`), not a configuration step —
   both names already resolve to this VM.
8. **firewalld:** explicitly nothing to do. 80/443 are already open.
9. **sudoers**, **logrotate** (with the duplicate-check dry run retained, since it
   is still worth confirming), and the first manual `rebuild.sh` run.
10. **Updating later** section replaced: it currently tells you to `git pull` and
    rebuild by hand, which the pull model makes obsolete. Push to `release`, then
    either wait for the hour or run `rebuild.sh`.

Add a health-check section: `cat /var/lib/desktopcolors/LAST_FAILURE` (absent means
the last run succeeded), `systemctl status counter-rebuild`,
`journalctl -u counter-rebuild -n 50`.

## Repository changes

- **Push `main` first.** `origin/main` is at `38071fe`; local `main` is 8 commits
  ahead at `721e2f7` and contains the entire `view.json` work. `release` must be cut
  from the pushed tip, or the first deploy ships the pre-`view.json` site.
- **Create `release` from `main`** and push it.
- `.gitignore`: add `.deploy-lock-hash`.

## Sizing

Measured 2026-07-26, after `5a18cba`:

| Item | Size |
| --- | --- |
| `dist/` | ~72 MB, 735 files |
| `node_modules/` | ~245 MB |
| 3 retained releases | ~216 MB |
| **Total** | **~550 MB** |

`node_modules`, not the retained releases, is the largest single item. An earlier
estimate of several GB was based on a pre-`5a18cba` `dist` of ~370 MB, when the
island architecture inlined the full dataset into every colour page.

## Explicitly out of scope

- `test.desktopcolors.com` and any environment parameterization.
- GitHub Actions involvement of any kind.
- Automatic rollback, health probes, a `fallback` symlink, immutable source trees.
- Email or push notification on failure. The `LAST_FAILURE` file is the whole
  signal; it must be looked at deliberately.
- Any change to global nginx config, other sites, stock logrotate, or firewalld.

## Verification

1. `bash -n deploy/rebuild.sh`; `shellcheck` if available.
2. `visudo -cf deploy/desktopcolors.sudoers`.
3. `nginx -t` after installing the conf, before reloading.
4. `logrotate -d /etc/logrotate.conf 2>&1 | grep -i 'desktopcolors\|duplicate'` —
   must report no duplicate.
5. Run `rebuild.sh` manually; confirm `current` points at a fresh release and
   `LAST_FAILURE` is absent.
6. Run it twice concurrently; confirm the second exits 0 with the skip message and
   writes no failure marker.
7. `curl -fsS https://desktopcolors.com/os/windows-95/view.json -D-` — expect 200
   and `Cache-Control: max-age=300`.
8. `curl -fsS -X POST https://desktopcolors.com/api/event -H 'Content-Type: application/json'
   -d '{"kind":"osview","os":"windows-95"}'` — expect 204. A 502 here means step 4
   of setup (SELinux) was skipped.
9. Push a trivial commit to `release`, run `rebuild.sh`, confirm it appears.
10. Confirm the other sites on the host still serve.
