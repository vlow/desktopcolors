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
  -H 'Content-Type: application/json' -d '{"kind":"osview","os":"windows-95"}'   # -> 204
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
