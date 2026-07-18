# Architecture — the edge (counter service)

The **edge** is the only piece of desktopcolors.com that runs at request time: a tiny
Go service called `counter`. Everything else (the site) is static files. The counter's
entire job is to record synthetic popularity **points** for colors and operating systems,
and to dump those points as `scores.json` for the static build to bake in.

It is deliberately minimal — one Go module, one static binary, one SQLite file, two
aggregate tables. There are **no read APIs at request time**: the site never queries the
counter to render a page. Scores flow into the site only at build time via `counter dump`.

```
Browser ──POST /api/event──▶ nginx ──proxy──▶ counter (127.0.0.1:8787) ──▶ SQLite (WAL)
                                                   │
scheduled rebuild ──▶ counter dump ──▶ scores.json ┘  (read only at build time)
```

For where this sits in the whole system and the write-live / read-at-build data flow, see
the [README architecture section](../README.md#architecture). For deployment (systemd
units, the rebuild timer, nginx), see [`deploy/SETUP.md`](../deploy/SETUP.md).

---

## Where things live

```
counter/
  main.go                     # CLI entrypoint: `serve` and `dump` subcommands + process wiring
  internal/
    scoring/    scoring.go     # PURE: validate an event → point delta. No I/O, no state.
    store/      store.go       # SQLite persistence: two aggregate tables. Apply + Dump.
    server/     server.go      # HTTP API: POST /api/event, GET /healthz. Binds scoring → store.
    ratelimit/  limiter.go     # In-memory, privacy-preserving token bucket. No IP persisted.
  go.mod / go.sum             # module `desktopcolors/counter`; only dep: modernc.org/sqlite (pure-Go)
```

Every package has a `*_test.go` beside it. The module has **one** external dependency, the
pure-Go SQLite driver `modernc.org/sqlite` — chosen so the binary builds with
`CGO_ENABLED=0` into a single static file with no libc requirement.

---

## The packages and their responsibilities

The dependency direction is strictly one-way, which is what keeps the core testable:

```
main ──▶ server ──▶ scoring   (pure)
          │    └──▶ store      (SQLite)
          └──▶ ratelimit       (in-memory)
```

`scoring` depends on nothing. `store` depends only on the SQLite driver. `server` wires
scoring + store + a rate limiter together behind HTTP. `main` owns process lifecycle and
the CLI.

### `internal/scoring` — the rules (pure)

The single source of truth for **what an event is worth**. No I/O, no state, trivially
unit-testable. If you want to change point values, add an event kind, or tighten
validation, this is the only file you touch.

```go
// Event is the JSON body of POST /api/event.
type Event struct {
    Kind string `json:"kind"` // "copy" | "download" | "osview"
    Hex  string `json:"hex"`  // "#rrggbb" (required for copy/download)
    Os   string `json:"os"`   // slug, [a-z0-9-]{1,64}
}

// Delta is the normalized effect of a valid event.
// Hex == "" means "no color update"; Slug is always set for a valid event.
type Delta struct {
    Hex      string
    ColorPts int
    Slug     string
    OsPts    int
}

func Validate(e Event) (Delta, error) // ErrBadKind | ErrBadHex | ErrBadSlug
```

Current rules: `copy`/`download` → +3 to the color **and** +3 to the OS; `osview` → +1 to
the OS only. Hex is lower-cased on the way through so scores merge case-insensitively.

### `internal/store` — persistence

Owns the SQLite database and the **only two tables that exist**: `color_scores(hex,
points)` and `os_scores(slug, points)`. There is no IP column, no per-request row, no event
log — the schema makes it structurally impossible to store anything client-identifying.

```go
func Open(path string) (*Store, error) // WAL mode, busy_timeout, MaxOpenConns(1); creates schema
func (s *Store) Apply(hex string, colorPts int, slug string, osPts int) error // one upsert txn
func (s *Store) Dump() (Scores, error) // read both tables

type Scores struct {
    Colors map[string]int64 `json:"colors"` // hex   → points
    Os     map[string]int64 `json:"os"`     // slug  → points
}
```

`Apply` runs both upserts in one transaction and skips a side whose key is empty or points
are zero (so an `osview` never touches `color_scores`). `Scores` is the exact JSON shape the
site's `scores.json` reader expects — **this struct and the frontend's `Scores` interface
must stay in sync** (see the frontend doc's `lib/scores.ts`).

### `internal/server` — the HTTP surface

The public API, and the only package that speaks HTTP. Two routes:

- `POST /api/event` → rate-limit → decode (max 4 KiB body) → `scoring.Validate` →
  `store.Apply` → `204 No Content`. Bad body/validation → `400`; rate-limited → `429`;
  store error → `500`.
- `GET /healthz` → `200 ok` (used by systemd / uptime checks).

It depends on the rate limiter through a **narrow interface**, not the concrete type, so
tests can inject a fake:

```go
type Limiter interface { Allow(ip string) bool }
func New(st *store.Store, lim Limiter) *Server
func (s *Server) Handler() http.Handler
```

`clientIP` resolves the caller from `X-Real-IP`, then the first `X-Forwarded-For` hop, then
`RemoteAddr` — because the service binds `127.0.0.1` and only nginx reaches it. **No request
data is ever logged here.**

### `internal/ratelimit` — abuse control without identity

A token-bucket limiter that must throttle abusers **without ever storing an IP**. It keys
each bucket by `SHA-256(rotating-salt ‖ truncated-IP)`:

- IPs are truncated to subnet first (IPv4 → /24, IPv6 → /64), so buckets are coarse.
- A 32-byte random salt lives **only in memory** and **rotates daily**; on rotation all
  buckets are dropped. There is no way to reverse a key back to an IP.
- `Sweep` (called every 10 min from `main`) evicts buckets idle > 30 min so memory stays
  bounded.

```go
func New(cfg Config) *Limiter   // Config{Capacity, RefillPerSec, Now, Rand}
func (l *Limiter) Allow(ip string) bool
func (l *Limiter) Sweep(maxIdle time.Duration)
```

`Config.Now` and `Config.Rand` are injectable so tests can control time and salt
deterministically. Production config (in `main`): capacity 40, refill 0.5 tokens/sec.

### `main` — CLI + process lifecycle

Dispatches two subcommands and owns everything that isn't a pure unit of logic:

- `counter serve [--addr 127.0.0.1:8787] [--db ./counter.db]` — opens the store,
  constructs the limiter, starts the background sweep goroutine, serves HTTP, and shuts down
  gracefully on SIGINT/SIGTERM (5 s drain).
- `counter dump [--db ./counter.db] [--out scores.json|-]` — opens the store, `Dump()`s it,
  and writes indented JSON (`-` = stdout). This is the build-time bridge to the site.

---

## Where does my change go?

| I want to…                                        | Touch                                   |
|---------------------------------------------------|-----------------------------------------|
| Change point values or add an event `kind`        | `internal/scoring/scoring.go`           |
| Tighten/loosen what counts as a valid hex or slug | `internal/scoring/scoring.go`           |
| Add/rename a stored table or column               | `internal/store/store.go` (+ `Scores`)  |
| Add or change an HTTP route or status code        | `internal/server/server.go`             |
| Change the request-body size cap                  | `internal/server/server.go` (`MaxBytesReader`) |
| Tune rate-limit capacity / refill / sweep cadence | `main.go` (config) — logic in `ratelimit` |
| Change the salt-rotation or IP-truncation policy  | `internal/ratelimit/limiter.go`         |
| Add a CLI flag or subcommand                       | `main.go`                               |
| Change the `scores.json` output shape             | `internal/store/store.go` **and** the frontend's `lib/scores.ts` |

### Invariants to preserve

- **Nothing client-identifying is ever persisted or logged.** No IP columns, no per-request
  rows, no request logging in the handler. The rate-limiter salt stays in memory only.
- **The core stays pure.** `scoring` must have no I/O so the rules stay trivially testable.
- **`store.Scores` ⟷ site `Scores` stay in lockstep.** They are the contract carried by
  `scores.json`; a field rename on one side silently zeroes scores on the other.
- **The site never reads from the counter at request time.** Any new "read" path belongs in
  the build (a `dump`-style command), not in a request handler.

### Testing

```bash
cd counter && go vet ./... && go test ./...
```

Each package is tested in isolation (`scoring` with table-driven cases, `store` against a
temp DB, `server` with a fake `Limiter`, `ratelimit` with injected time/rand). The
cross-stack path (browser beacon → nginx → counter → SQLite) is covered by the Playwright
e2e test in [`e2e/`](../e2e/).
