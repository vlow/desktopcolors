# Deploying desktopcolors.com

Target: an **AlmaLinux 8** VM that already serves other, unrelated sites. nginx
and certbot are installed and in use, 80/443 are already open, and **SELinux is
enforcing**. Commands are run as root (or via sudo) unless stated otherwise.

Because the host is shared, nothing here touches global nginx config, another
site's server block, the stock `/etc/logrotate.d/nginx`, or firewalld. Several
steps look pedantic for that reason — on a dedicated box you could skip them;
here you can't.

**Deployment is pull-only.** `deploy/rebuild.sh` fetches and hard-resets the
checkout to `origin/release`, so a push to `release` goes live at the next
hourly run of `counter-rebuild.timer`, or immediately if you run `rebuild.sh`
by hand. Nothing on GitHub needs credentials for this host.

## 1. Install toolchains

```bash
# Node 20 from the AppStream module (this is RHEL-family, not Debian/Ubuntu)
dnf module reset -y nodejs
dnf module enable -y nodejs:20
dnf install -y nodejs
node -v      # v20.x

dnf install -y git

# Go >= 1.25 (the modernc.org/sqlite floor) is not packaged for Alma 8
curl -fsSL https://go.dev/dl/go1.25.0.linux-amd64.tar.gz -o /tmp/go.tgz
rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tgz
```

Go on `/usr/local/go` now needs to be reachable from **non-login** shells,
because both ways `rebuild.sh` actually runs are non-login: the
`counter-rebuild.service` unit, and the documented manual invocation
(`sudo -u desktopcolors bash ...` in § 7/§ 10). A non-login shell never
sources `/etc/profile.d/*`, so the traditional fix below is not what makes the
deploy work — it's for interactive convenience only, e.g. when you `su -` in
to debug:

```bash
echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh && . /etc/profile.d/go.sh
go version   # go1.25.x (only in a login shell, from here on)
```

What actually makes `go` resolve on both non-login paths:

- `deploy/counter-rebuild.service` already carries
  `Environment=PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
  so the systemd timer path needs nothing further from you.
- For the manual `sudo -u desktopcolors bash ...` invocation, create a symlink
  in a directory that's already on systemd's (and sudo's `secure_path`)
  default non-login `PATH`:

  ```bash
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  go version   # now resolves without a login shell too
  ```

`rebuild.sh` also preflight-checks `git`, `npm` and `go` on `PATH` before doing
anything else, so a still-missing tool fails with a named error and a
`LAST_FAILURE` marker (§ 11) instead of a bare, unexplained exit 127 — but
that check is a diagnostic, not a substitute for the symlink above.

## 2. Create the service user and directories

```bash
useradd --system --home-dir /opt/desktopcolors --shell /usr/sbin/nologin desktopcolors || true
mkdir -p /opt/desktopcolors /var/www/desktopcolors/releases /var/lib/desktopcolors

# nginx will not create this itself — nginx -t or the master process's log
# open fails on first start without it. Create it, with nginx ownership,
# before nginx is (re)started or reloaded.
install -d -o nginx -g nginx -m 0755 /var/log/nginx/desktopcolors
```

Budget roughly **600 MB** under `/opt` + `/var/www` for this deploy: a built
`dist/` is ~72 MB, `node_modules` ~245 MB, and `KEEP=3` retained releases
under `/var/www/desktopcolors/releases` run ~216 MB together. Because
publishing **copies** rather than moves (§ 4), `dist/` persists under `/opt`
*and* a copy of it lives in every retained release under `/var/www` — this is
not the several-GB figure an earlier estimate used.

## 3. Get the code

```bash
git clone -b release https://github.com/vlow/desktopcolors.git /opt/desktopcolors
chown -R desktopcolors:desktopcolors \
  /opt/desktopcolors /var/www/desktopcolors /var/lib/desktopcolors
```

The first `rebuild.sh` run (§ 7) compiles both the counter and the site, so
there is nothing to build by hand here.

## 4. SELinux

This is the step most likely to be skipped and then misdiagnosed as an
application bug.

```bash
# Without this, nginx's proxy_pass to 127.0.0.1:8787 is denied and every
# /api/event beacon fails with 502 while the rest of the site works fine.
setsebool -P httpd_can_network_connect 1

# Release trees must carry httpd_sys_content_t for nginx to read them.
restorecon -Rv /var/www/desktopcolors

# The log subdirectory created in § 2 should inherit httpd_log_t from
# /var/log/nginx. Verify rather than assume:
ls -Zd /var/log/nginx/desktopcolors     # ...:httpd_log_t:...
```

The `restorecon` above is a **one-time** setup step, not something later
deploys need to repeat. `rebuild.sh` publishes each release with `cp -R`
(never `cp -a`/`--preserve=context`) — a copy creates new files, which pick up
`httpd_sys_content_t` by SELinux's own type-transition rule for anything
created under `/var/www`. A `mv`/rename would instead have carried `/opt`'s
label over unchanged, silently 403'ing the whole site on nginx's next read.
Because every release is a fresh copy, no per-release relabeling is ever
needed — do not "optimize" that copy into a rename; it would reintroduce
exactly this bug.

If a later step fails in a way that makes no sense, check for denials before
anything else:

```bash
ausearch -m avc -ts recent | tail -20
```

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
deliberately does **not**, because that flag blocks the setuid transition
`sudo` needs, and the counter restart the sudoers grant exists for would then
fail. Do not "fix" that asymmetry — it's the correct state for each unit,
given which one calls `sudo`.

The counter has no database until the first build, so it is expected to be
running with an empty store at this point.

## 6. nginx and TLS

```bash
cp deploy/desktopcolors.nginx.conf /etc/nginx/conf.d/desktopcolors.conf

# nginx -t validates EVERY site on this host. Check it before reloading, so a
# mistake here never takes down the other sites.
nginx -t
systemctl reload nginx

# certbot is already installed and in use on this host. This command only
# edits our conf.d file — it does not touch any other site's server block.
certbot --nginx -d desktopcolors.com -d www.desktopcolors.com
nginx -t && systemctl reload nginx
```

DNS already resolves for both names, so this is verification, not
configuration:

```bash
dig +short desktopcolors.com www.desktopcolors.com
```

**firewalld: nothing to do.** 80/443 are already open for the existing sites.

## 7. First build and publish

```bash
sudo -u desktopcolors bash /opt/desktopcolors/deploy/rebuild.sh
test -L /var/www/desktopcolors/current && echo "published"
```

The first run installs dependencies, compiles the counter, restarts it, and
publishes a release. Later runs skip `npm ci` unless `package-lock.json`
moved, and skip the counter restart unless the compiled binary changed.

If this fails immediately with `required tool '...' not found on PATH`,
that's `rebuild.sh`'s preflight check (§ 1) — go back and confirm the
`/usr/local/bin/go` symlink (or whichever tool is named) rather than assuming
it's an application bug.

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

## 9. Log retention

The access log is IP-anonymized; the error log is **not** (nginx always
writes the full client IP in error entries, and `log_format` cannot change
that). We keep the error log because it is how broken links surface, so it
is retained for 7 days only, against 14 for the access log.

```bash
install -o root -g root -m 0644 deploy/desktopcolors.logrotate /etc/logrotate.d/desktopcolors

# The stock /etc/logrotate.d/nginx globs /var/log/nginx/*.log. Our logs live in
# a subdirectory precisely so that glob cannot match them — that file is
# off-limits on this shared host. Confirm no duplicate is reported:
logrotate -d /etc/logrotate.conf 2>&1 | grep -i "desktopcolors\|duplicate"
```

Expect the dry run to mention our two files and **no** duplicate. Then verify
a real rotation once:

```bash
logrotate -f /etc/logrotate.d/desktopcolors && ls -l /var/log/nginx/desktopcolors/
```

Retention is stated publicly in the "Server logs" clause of
`src/pages/privacy.astro`. Change one, change the other.

## 10. Deploying a change

Push to `release`. The hourly timer picks it up; to publish immediately:

```bash
sudo -u desktopcolors bash /opt/desktopcolors/deploy/rebuild.sh
```

Both paths run the same script, and it is safe to run while the timer is
mid-build — the second invocation exits 0 without doing anything.

**To roll back, `git revert` on `release`.** There is deliberately no rollback
command on this host: `rebuild.sh` unconditionally rebuilds `origin/release`,
so a rollback held only in server-side state (a manual symlink flip, a
checked-out older commit, ...) would be silently undone within the hour.

## 11. Health check

```bash
# Absent = the last run succeeded. Present = it failed; the file says how.
cat /var/lib/desktopcolors/LAST_FAILURE

systemctl status counter-rebuild --no-pager
journalctl -u counter-rebuild -n 50 --no-pager
```

A failed build leaves the previous release serving — the `current` symlink is
only flipped after a successful build — so the site keeps working and nothing
prompts anyone to look. Check `LAST_FAILURE` deliberately; its absence is not
proof of a healthy setup, only proof the last run didn't fail.
