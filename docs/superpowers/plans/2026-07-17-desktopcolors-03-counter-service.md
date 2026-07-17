# desktopcolors.com — Plan 3: Counter Service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-contained Go service (`counter`) that records synthetic popularity points in SQLite and dumps them for the site build. It exposes `POST /api/event` (copy/download/osview scoring) behind a privacy-preserving in-memory rate limiter, and a `counter dump` CLI that writes `scores.json` in the exact shape Plan 1's `loadScores`/`parseScores` already reads. No personal data is ever persisted.

**Architecture:** One Go module under `counter/`, built as a single static binary (pure-Go SQLite driver, `CGO_ENABLED=0`). Two subcommands: `counter serve` (long-running HTTP service bound to localhost, managed by systemd in Plan 4) and `counter dump` (one-shot, run by the rebuild pipeline in Plan 4). Layered internals: pure `scoring` (validate event → point deltas), `store` (SQLite aggregates), `ratelimit` (salted-hash-of-truncated-IP token bucket, in memory only), and `server` (HTTP wiring). This plan builds and tests the service in isolation; wiring the site's `track()` seam to `/api/event` and all deployment (nginx, systemd, TLS, rebuild timer) is Plan 4.

**Tech Stack:** Go 1.22+ (uses `net/http` 1.22 method-pattern routing), `modernc.org/sqlite` (cgo-free SQLite driver), standard library `testing` + `net/http/httptest`.

## Global Constraints

- **Go 1.22 or newer** (this machine has 1.26). The module's `go` directive is `1.22`. If `go` is missing at execution time, install it (`brew install go` on macOS) before proceeding.
- **Cgo-free static binary.** The only third-party dependency is `modernc.org/sqlite` (pure Go). Build with `CGO_ENABLED=0`. No other modules.
- **No personal data on disk, ever.** SQLite stores ONLY two aggregate tables (`color_scores`, `os_scores`). No IP addresses, no hashes, no per-client rows, no event log. The rate limiter keeps everything in RAM.
- **Scoring rules (exact):** `copy` or `download` → color[hex] **+3** and os[slug] **+3**; `osview` → os[slug] **+1**. Points are integers starting at 0. The counter stores and dumps **raw points** — the `< 1k` / `1.2k` display formatting is the frontend's job (Plan 1's `formatScore`), NOT the counter's.
- **Keying:** colors by **lowercased hex** (canonicalized on write); OSes by **slug** (stored as-is). Both are validated on write.
- **Input validation (reject → 400):** hex must match `^#[0-9a-fA-F]{6}$`; slug must match `^[a-z0-9-]{1,64}$` (matches the site's content slugs and bounds key growth); kind must be one of `copy`/`download`/`osview`.
- **`scores.json` shape** (must match Plan 1 `parseScores` exactly): `{ "colors": { "<lower-hex>": <int>, … }, "os": { "<slug>": <int>, … } }`. Empty DB → `{"colors":{},"os":{}}`.
- **Rate limiting (privacy-preserving):** in-memory token bucket keyed by `SHA-256(salt ‖ truncatedIP)`. IPv4 truncated to `/24`, IPv6 to `/64`. `salt` is random bytes generated in memory at process start and **rotated daily**, never persisted or logged. Buckets live in RAM with idle eviction. Nothing IP-derived touches disk. Over-limit → **429**.
- **Bind localhost only.** Default listen address `127.0.0.1:8787` (only nginx will reach it in Plan 4). Trusting `X-Real-IP`/`X-Forwarded-For` is therefore safe.
- **HTTP contract:** `POST /api/event` → **204** on success, **400** malformed, **429** rate-limited, **405** wrong method (handled by the mux), **500** on store error. `GET /healthz` → **200** `ok`.
- Commit after every task with a `feat:`/`test:`/`chore:` prefixed message. All work happens under `counter/`; nothing in this plan touches `src/`.

## File structure (created across this plan)

```
counter/
  go.mod
  go.sum
  main.go                          # CLI dispatch: serve | dump (+ flags, graceful shutdown)
  internal/
    scoring/
      scoring.go                   # Event, Delta, Validate (pure)
      scoring_test.go
    store/
      store.go                     # SQLite open/schema, Apply, Dump
      store_test.go
    ratelimit/
      limiter.go                   # truncate IP, salted-hash key, token bucket, salt rotation, sweep
      limiter_test.go
    server/
      server.go                    # http.Handler: POST /api/event, GET /healthz
      server_test.go
```

The binary is git-ignored (Plan 1's `.gitignore` already ignores `counter/counter`). `*.db`/`*.db-wal`/`*.db-shm` and `scores.json` are also already ignored.

---

### Task 1: Go module scaffold + SQLite driver

**Files:**
- Create: `counter/go.mod` (via `go mod init`)
- Create: `counter/main.go` (temporary minimal entrypoint, expanded in Task 6)
- Create/updated: `counter/go.sum` (via `go get`)

**Interfaces:**
- Consumes: nothing.
- Produces: a compiling Go module with `modernc.org/sqlite` available and a runnable `go test ./...` (no tests yet → "no test files", exit 0).

- [ ] **Step 1: Verify the Go toolchain**

Run: `go version`
Expected: `go1.22` or newer. If missing, run `brew install go` (macOS) and re-check. If it cannot be installed, STOP and report BLOCKED.

- [ ] **Step 2: Initialize the module**

Run:
```bash
cd counter
go mod init desktopcolors/counter
```
Expected: creates `counter/go.mod` with module path `desktopcolors/counter` and a `go 1.2x` directive.

- [ ] **Step 3: Pin the go directive to 1.22**

Edit `counter/go.mod` so the version line reads exactly `go 1.22` (broadens the toolchain floor for the vServer; 1.22 is when `net/http` method-pattern routing landed). The file should look like:

```
module desktopcolors/counter

go 1.22
```

- [ ] **Step 4: Add the SQLite driver**

Run:
```bash
cd counter
go get modernc.org/sqlite@latest
```
Expected: adds `modernc.org/sqlite` (and its transitive deps) to `go.mod`/`go.sum`. Do not hand-pin a version — let `go get` resolve the latest.

- [ ] **Step 5: Create a temporary `counter/main.go`**

```go
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: counter <serve|dump> [flags]")
		os.Exit(2)
	}
	fmt.Fprintf(os.Stderr, "counter: subcommand %q not wired yet\n", os.Args[1])
	os.Exit(2)
}
```

- [ ] **Step 6: Verify it builds and tests run**

Run:
```bash
cd counter
go build ./...
go test ./...
```
Expected: `go build` succeeds; `go test` prints `no test files` for the module and exits 0.

- [ ] **Step 7: Commit**

```bash
git add counter/go.mod counter/go.sum counter/main.go
git commit -m "chore: scaffold Go counter module with sqlite driver"
```

---

### Task 2: Scoring (pure validation + deltas, TDD)

**Files:**
- Create: `counter/internal/scoring/scoring.go`
- Test: `counter/internal/scoring/scoring_test.go`

**Interfaces:**
- Consumes: nothing (stdlib only).
- Produces:
  - `type Event struct { Kind string; Hex string; Os string }` with JSON tags `kind`/`hex`/`os`.
  - `type Delta struct { Hex string; ColorPts int; Slug string; OsPts int }` — normalized effect of an event (Hex empty ⇒ no color update; Slug always set; points are the amounts to add).
  - Sentinel errors: `ErrBadKind`, `ErrBadHex`, `ErrBadSlug` (all `error`).
  - `func Validate(e Event) (Delta, error)` — validates and normalizes: `copy`/`download` require valid hex + valid slug → `Delta{Hex: lower(hex), ColorPts: 3, Slug: slug, OsPts: 3}`; `osview` requires valid slug → `Delta{Slug: slug, OsPts: 1}`; anything else → the matching sentinel error.
  - `func ValidHex(s string) bool`, `func ValidSlug(s string) bool` (exported for reuse/tests).

- [ ] **Step 1: Write the failing test `counter/internal/scoring/scoring_test.go`**

```go
package scoring

import (
	"errors"
	"testing"
)

func TestValidate_CopyAndDownload(t *testing.T) {
	for _, kind := range []string{"copy", "download"} {
		d, err := Validate(Event{Kind: kind, Hex: "#00FF80", Os: "windows-95"})
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", kind, err)
		}
		if d.Hex != "#00ff80" {
			t.Errorf("%s: hex not lowercased: %q", kind, d.Hex)
		}
		if d.ColorPts != 3 || d.OsPts != 3 {
			t.Errorf("%s: want +3/+3, got %d/%d", kind, d.ColorPts, d.OsPts)
		}
		if d.Slug != "windows-95" {
			t.Errorf("%s: slug = %q", kind, d.Slug)
		}
	}
}

func TestValidate_Osview(t *testing.T) {
	d, err := Validate(Event{Kind: "osview", Os: "windows-95"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Hex != "" || d.ColorPts != 0 {
		t.Errorf("osview must not touch a color, got hex=%q pts=%d", d.Hex, d.ColorPts)
	}
	if d.Slug != "windows-95" || d.OsPts != 1 {
		t.Errorf("osview want slug windows-95 +1, got %q +%d", d.Slug, d.OsPts)
	}
}

func TestValidate_Errors(t *testing.T) {
	cases := []struct {
		name string
		e    Event
		want error
	}{
		{"bad kind", Event{Kind: "nope", Os: "windows-95"}, ErrBadKind},
		{"empty kind", Event{Os: "windows-95"}, ErrBadKind},
		{"copy missing hex", Event{Kind: "copy", Os: "windows-95"}, ErrBadHex},
		{"copy bad hex", Event{Kind: "copy", Hex: "008080", Os: "windows-95"}, ErrBadHex},
		{"copy short hex", Event{Kind: "copy", Hex: "#008", Os: "windows-95"}, ErrBadHex},
		{"copy bad slug", Event{Kind: "copy", Hex: "#008080", Os: "Windows 95"}, ErrBadSlug},
		{"osview missing slug", Event{Kind: "osview"}, ErrBadSlug},
		{"osview bad slug", Event{Kind: "osview", Os: "../etc"}, ErrBadSlug},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := Validate(c.e)
			if !errors.Is(err, c.want) {
				t.Errorf("got %v, want %v", err, c.want)
			}
		})
	}
}

func TestValidHexAndSlug(t *testing.T) {
	if !ValidHex("#008080") || !ValidHex("#ABCDEF") {
		t.Error("valid hexes rejected")
	}
	if ValidHex("#00808") || ValidHex("008080") || ValidHex("#0080800") {
		t.Error("invalid hexes accepted")
	}
	if !ValidSlug("windows-95") || !ValidSlug("kde-2") {
		t.Error("valid slugs rejected")
	}
	if ValidSlug("Windows 95") || ValidSlug("") || ValidSlug("a/b") {
		t.Error("invalid slugs accepted")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd counter && go test ./internal/scoring/`
Expected: FAIL — package/symbols undefined (does not compile).

- [ ] **Step 3: Implement `counter/internal/scoring/scoring.go`**

```go
// Package scoring validates incoming popularity events and computes their
// point deltas. It is pure: no I/O, no state.
package scoring

import (
	"errors"
	"regexp"
	"strings"
)

var (
	ErrBadKind = errors.New("scoring: unknown event kind")
	ErrBadHex  = errors.New("scoring: invalid hex")
	ErrBadSlug = errors.New("scoring: invalid slug")
)

var (
	hexRe  = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	slugRe = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)
)

// Event is the JSON body of POST /api/event.
type Event struct {
	Kind string `json:"kind"`
	Hex  string `json:"hex"`
	Os   string `json:"os"`
}

// Delta is the normalized effect of a valid event. Hex == "" means no color
// update; Slug is always set for valid events.
type Delta struct {
	Hex      string
	ColorPts int
	Slug     string
	OsPts    int
}

func ValidHex(s string) bool  { return hexRe.MatchString(s) }
func ValidSlug(s string) bool { return slugRe.MatchString(s) }

// Validate checks an event and returns its point delta.
func Validate(e Event) (Delta, error) {
	switch e.Kind {
	case "copy", "download":
		if !ValidHex(e.Hex) {
			return Delta{}, ErrBadHex
		}
		if !ValidSlug(e.Os) {
			return Delta{}, ErrBadSlug
		}
		return Delta{Hex: strings.ToLower(e.Hex), ColorPts: 3, Slug: e.Os, OsPts: 3}, nil
	case "osview":
		if !ValidSlug(e.Os) {
			return Delta{}, ErrBadSlug
		}
		return Delta{Slug: e.Os, OsPts: 1}, nil
	default:
		return Delta{}, ErrBadKind
	}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd counter && go test ./internal/scoring/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add counter/internal/scoring/
git commit -m "feat: add event scoring validation and deltas"
```

---

### Task 3: Store (SQLite aggregates, TDD)

**Files:**
- Create: `counter/internal/store/store.go`
- Test: `counter/internal/store/store_test.go`

**Interfaces:**
- Consumes: `database/sql`, `_ "modernc.org/sqlite"`.
- Produces:
  - `type Scores struct { Colors map[string]int64 \`json:"colors"\`; Os map[string]int64 \`json:"os"\` }` — the dump shape (matches Plan 1 `parseScores`).
  - `type Store struct { … }` with an unexported `*sql.DB`.
  - `func Open(dsnPath string) (*Store, error)` — opens (creating) a WAL SQLite DB at `dsnPath` and ensures the schema. `dsnPath` is a filesystem path (e.g. `./counter.db`).
  - `func (s *Store) Close() error`.
  - `func (s *Store) Apply(hex string, colorPts int, slug string, osPts int) error` — in one transaction, upserts `color_scores` by `hex` when `hex != "" && colorPts != 0`, and upserts `os_scores` by `slug` when `slug != "" && osPts != 0`, adding the points. Safe to call with either side zero.
  - `func (s *Store) Dump() (Scores, error)` — reads both tables into maps; always returns non-nil maps (empty DB → empty maps, so JSON is `{}` not `null`).

- [ ] **Step 1: Write the failing test `counter/internal/store/store_test.go`**

```go
package store

import (
	"path/filepath"
	"testing"
)

func openTemp(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestApplyAccumulates(t *testing.T) {
	s := openTemp(t)
	if err := s.Apply("#008080", 3, "windows-95", 3); err != nil {
		t.Fatal(err)
	}
	if err := s.Apply("#008080", 3, "windows-95", 3); err != nil {
		t.Fatal(err)
	}
	if err := s.Apply("", 0, "windows-95", 1); err != nil { // osview
		t.Fatal(err)
	}
	got, err := s.Dump()
	if err != nil {
		t.Fatal(err)
	}
	if got.Colors["#008080"] != 6 {
		t.Errorf("color teal = %d, want 6", got.Colors["#008080"])
	}
	if got.Os["windows-95"] != 7 {
		t.Errorf("os windows-95 = %d, want 7", got.Os["windows-95"])
	}
}

func TestApplyColorOnlyAndOsOnly(t *testing.T) {
	s := openTemp(t)
	if err := s.Apply("#ff0000", 3, "", 0); err != nil { // color only (shouldn't happen in practice, but must be safe)
		t.Fatal(err)
	}
	if err := s.Apply("", 0, "kde-2", 1); err != nil { // os only
		t.Fatal(err)
	}
	got, _ := s.Dump()
	if got.Colors["#ff0000"] != 3 {
		t.Errorf("red = %d, want 3", got.Colors["#ff0000"])
	}
	if got.Os["kde-2"] != 1 {
		t.Errorf("kde-2 = %d, want 1", got.Os["kde-2"])
	}
	if _, ok := got.Os["#ff0000"]; ok {
		t.Error("color leaked into os table")
	}
}

func TestDumpEmptyReturnsEmptyMaps(t *testing.T) {
	s := openTemp(t)
	got, err := s.Dump()
	if err != nil {
		t.Fatal(err)
	}
	if got.Colors == nil || got.Os == nil {
		t.Fatal("maps must be non-nil so JSON marshals to {}")
	}
	if len(got.Colors) != 0 || len(got.Os) != 0 {
		t.Errorf("expected empty, got %+v", got)
	}
}

func TestPersistsAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "p.db")
	s1, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := s1.Apply("#008080", 3, "windows-95", 3); err != nil {
		t.Fatal(err)
	}
	s1.Close()

	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	got, _ := s2.Dump()
	if got.Colors["#008080"] != 3 {
		t.Errorf("did not persist: %d", got.Colors["#008080"])
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd counter && go test ./internal/store/`
Expected: FAIL — package/symbols undefined.

- [ ] **Step 3: Implement `counter/internal/store/store.go`**

```go
// Package store persists aggregate popularity scores in SQLite. It stores ONLY
// two aggregate tables — no IP addresses, no per-client rows, no event log.
package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// Scores is the dump shape, matching the site's scores.json reader.
type Scores struct {
	Colors map[string]int64 `json:"colors"`
	Os     map[string]int64 `json:"os"`
}

type Store struct {
	db *sql.DB
}

const schema = `
CREATE TABLE IF NOT EXISTS color_scores (
	hex    TEXT PRIMARY KEY,
	points INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS os_scores (
	slug   TEXT PRIMARY KEY,
	points INTEGER NOT NULL DEFAULT 0
);`

// Open opens (creating if needed) a WAL-mode SQLite database at path and
// ensures the schema exists.
func Open(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// modernc's driver is safe for concurrent use; a single writer is plenty here.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: schema: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Apply adds points to a color and/or an OS in a single transaction. A side is
// skipped when its key is empty or its points are zero.
func (s *Store) Apply(hex string, colorPts int, slug string, osPts int) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if hex != "" && colorPts != 0 {
		if _, err := tx.Exec(
			`INSERT INTO color_scores(hex, points) VALUES(?, ?)
			 ON CONFLICT(hex) DO UPDATE SET points = points + excluded.points`,
			hex, colorPts); err != nil {
			return err
		}
	}
	if slug != "" && osPts != 0 {
		if _, err := tx.Exec(
			`INSERT INTO os_scores(slug, points) VALUES(?, ?)
			 ON CONFLICT(slug) DO UPDATE SET points = points + excluded.points`,
			slug, osPts); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Dump reads both tables into a Scores value with non-nil maps.
func (s *Store) Dump() (Scores, error) {
	out := Scores{Colors: map[string]int64{}, Os: map[string]int64{}}
	if err := readInto(s.db, "SELECT hex, points FROM color_scores", out.Colors); err != nil {
		return Scores{}, err
	}
	if err := readInto(s.db, "SELECT slug, points FROM os_scores", out.Os); err != nil {
		return Scores{}, err
	}
	return out, nil
}

func readInto(db *sql.DB, query string, dst map[string]int64) error {
	rows, err := db.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var pts int64
		if err := rows.Scan(&key, &pts); err != nil {
			return err
		}
		dst[key] = pts
	}
	return rows.Err()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd counter && go test ./internal/store/`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add counter/internal/store/
git commit -m "feat: add SQLite store with upsert scoring and dump"
```

---

### Task 4: Rate limiter (salted-hash-of-truncated-IP token bucket, TDD)

**Files:**
- Create: `counter/internal/ratelimit/limiter.go`
- Test: `counter/internal/ratelimit/limiter_test.go`

**Interfaces:**
- Consumes: `crypto/rand`, `crypto/sha256`, `net`, `sync`, `time`, `io`.
- Produces:
  - `type Config struct { Capacity float64; RefillPerSec float64; Now func() time.Time; Rand io.Reader }` — `Now`/`Rand` default to `time.Now`/`crypto/rand.Reader` when nil (injectable for tests).
  - `func New(cfg Config) *Limiter`.
  - `func (l *Limiter) Allow(ip string) bool` — truncates `ip` (IPv4→/24, IPv6→/64), rotates the salt if the calendar day changed (clearing buckets), computes `SHA-256(salt‖truncated)`, and consumes one token from that key's bucket. Returns false when the bucket is empty. Unparseable IPs fall back to the raw string as the key (still rate-limited, never stored).
  - `func (l *Limiter) Sweep(maxIdle time.Duration)` — removes buckets untouched for longer than `maxIdle` (called periodically by the server; exported for tests).
  - `func truncateIP(ip string) string` (unexported; tested via `Allow` grouping and a direct test in-package).

- [ ] **Step 1: Write the failing test `counter/internal/ratelimit/limiter_test.go`**

```go
package ratelimit

import (
	"bytes"
	"testing"
	"time"
)

// fixedRand yields deterministic salt bytes for tests.
func fixedRand(b byte) *bytes.Reader {
	buf := make([]byte, 64)
	for i := range buf {
		buf[i] = b
	}
	return bytes.NewReader(buf)
}

func TestAllowConsumesThenBlocks(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	l := New(Config{Capacity: 3, RefillPerSec: 0, Now: func() time.Time { return now }, Rand: fixedRand(1)})
	for i := 0; i < 3; i++ {
		if !l.Allow("203.0.113.7") {
			t.Fatalf("request %d should be allowed", i)
		}
	}
	if l.Allow("203.0.113.7") {
		t.Error("4th request should be blocked (bucket empty, no refill)")
	}
}

func TestRefillOverTime(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	l := New(Config{Capacity: 1, RefillPerSec: 1, Now: func() time.Time { return now }, Rand: fixedRand(1)})
	if !l.Allow("203.0.113.7") {
		t.Fatal("first allowed")
	}
	if l.Allow("203.0.113.7") {
		t.Fatal("second blocked immediately")
	}
	now = now.Add(2 * time.Second) // refills 2 tokens, capped at 1
	if !l.Allow("203.0.113.7") {
		t.Error("should be allowed after refill")
	}
}

func TestSameSubnetSharesBucket(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	l := New(Config{Capacity: 1, RefillPerSec: 0, Now: func() time.Time { return now }, Rand: fixedRand(1)})
	if !l.Allow("203.0.113.7") {
		t.Fatal("first host in /24 allowed")
	}
	if l.Allow("203.0.113.200") { // same /24 -> same bucket, already empty
		t.Error("different host in same /24 should share the (empty) bucket")
	}
}

func TestDifferentSubnetsIndependent(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	l := New(Config{Capacity: 1, RefillPerSec: 0, Now: func() time.Time { return now }, Rand: fixedRand(1)})
	if !l.Allow("203.0.113.7") {
		t.Fatal("net A allowed")
	}
	if !l.Allow("198.51.100.7") { // different /24
		t.Error("net B should have its own bucket")
	}
}

func TestSaltRotationChangesKeyAndResetsBuckets(t *testing.T) {
	day1 := time.Date(2026, 7, 17, 23, 59, 0, 0, time.UTC)
	cur := day1
	l := New(Config{Capacity: 1, RefillPerSec: 0, Now: func() time.Time { return cur }, Rand: fixedRand(1)})
	if !l.Allow("203.0.113.7") {
		t.Fatal("day1 allowed")
	}
	if l.Allow("203.0.113.7") {
		t.Fatal("day1 second blocked")
	}
	cur = day1.Add(24 * time.Hour) // next calendar day -> salt rotates, buckets cleared
	if !l.Allow("203.0.113.7") {
		t.Error("after salt rotation the bucket should be fresh")
	}
}

func TestSweepRemovesIdleBuckets(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	cur := now
	l := New(Config{Capacity: 5, RefillPerSec: 0, Now: func() time.Time { return cur }, Rand: fixedRand(1)})
	l.Allow("203.0.113.7")
	if n := l.Len(); n != 1 {
		t.Fatalf("expected 1 bucket, got %d", n)
	}
	cur = now.Add(time.Hour)
	l.Sweep(30 * time.Minute)
	if n := l.Len(); n != 0 {
		t.Errorf("idle bucket should have been swept, got %d", n)
	}
}

func TestTruncateIP(t *testing.T) {
	cases := map[string]string{
		"203.0.113.7":               "203.0.113.0",
		"203.0.113.200":             "203.0.113.0",
		"2001:db8:1:2:3:4:5:6":      "2001:db8:1:2::",
		"not-an-ip":                 "not-an-ip",
	}
	for in, want := range cases {
		if got := truncateIP(in); got != want {
			t.Errorf("truncateIP(%q) = %q, want %q", in, got, want)
		}
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd counter && go test ./internal/ratelimit/`
Expected: FAIL — package/symbols undefined.

- [ ] **Step 3: Implement `counter/internal/ratelimit/limiter.go`**

```go
// Package ratelimit provides a privacy-preserving in-memory token-bucket
// limiter keyed by SHA-256(rotating-salt ‖ truncated-IP). No IP address or
// hash is ever persisted; the salt lives only in memory and rotates daily.
package ratelimit

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net"
	"sync"
	"time"
)

type Config struct {
	Capacity     float64
	RefillPerSec float64
	Now          func() time.Time
	Rand         io.Reader
}

type bucket struct {
	tokens   float64
	lastFill time.Time
	lastSeen time.Time
}

type Limiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	cap      float64
	refill   float64
	now      func() time.Time
	randr    io.Reader
	salt     []byte
	saltYD   int // year-day the current salt was generated for
	saltYear int
}

func New(cfg Config) *Limiter {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Rand == nil {
		cfg.Rand = rand.Reader
	}
	l := &Limiter{
		buckets: map[string]*bucket{},
		cap:     cfg.Capacity,
		refill:  cfg.RefillPerSec,
		now:     cfg.Now,
		randr:   cfg.Rand,
	}
	l.rotateSalt(l.now())
	return l
}

// rotateSalt generates a fresh salt and drops all buckets. Caller holds l.mu
// (or is New, before the limiter is shared).
func (l *Limiter) rotateSalt(t time.Time) {
	salt := make([]byte, 32)
	if _, err := io.ReadFull(l.randr, salt); err != nil {
		// Extremely unlikely; fall back to a time-derived salt rather than crash.
		salt = []byte(t.String())
	}
	l.salt = salt
	l.saltYD = t.YearDay()
	l.saltYear = t.Year()
	l.buckets = map[string]*bucket{}
}

func (l *Limiter) key(ip string, t time.Time) string {
	h := sha256.New()
	h.Write(l.salt)
	h.Write([]byte(truncateIP(ip)))
	_ = t
	return hex.EncodeToString(h.Sum(nil))
}

// Allow consumes one token for ip's truncated-subnet bucket.
func (l *Limiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	t := l.now()
	if t.YearDay() != l.saltYD || t.Year() != l.saltYear {
		l.rotateSalt(t)
	}

	k := l.key(ip, t)
	b := l.buckets[k]
	if b == nil {
		b = &bucket{tokens: l.cap, lastFill: t, lastSeen: t}
		l.buckets[k] = b
	} else {
		elapsed := t.Sub(b.lastFill).Seconds()
		if elapsed > 0 {
			b.tokens = min(l.cap, b.tokens+elapsed*l.refill)
			b.lastFill = t
		}
	}
	b.lastSeen = t

	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// Sweep removes buckets not seen within maxIdle.
func (l *Limiter) Sweep(maxIdle time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-maxIdle)
	for k, b := range l.buckets {
		if b.lastSeen.Before(cutoff) {
			delete(l.buckets, k)
		}
	}
}

// Len reports the number of live buckets (for tests/metrics).
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// truncateIP zeroes host bits: IPv4 -> /24, IPv6 -> /64. Unparseable input is
// returned unchanged (still used as a bucket key, never persisted).
func truncateIP(s string) string {
	ip := net.ParseIP(s)
	if ip == nil {
		return s
	}
	if v4 := ip.To4(); v4 != nil {
		v4 = v4.Mask(net.CIDRMask(24, 32))
		return v4.String()
	}
	v6 := ip.Mask(net.CIDRMask(64, 128))
	return v6.String()
}
```

Note: Go 1.21+ has a builtin `min`; the local helper is kept to avoid any ambiguity with `float64` and older toolchains at the `go 1.22` floor. If `go vet`/compiler flags a redeclaration conflict with the builtin, delete the local `min` and rely on the builtin.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd counter && go test ./internal/ratelimit/`
Expected: PASS (7 tests). If the local `min` conflicts with the builtin at this toolchain, remove it per the note and re-run.

- [ ] **Step 5: Commit**

```bash
git add counter/internal/ratelimit/
git commit -m "feat: add privacy-preserving in-memory rate limiter"
```

---

### Task 5: HTTP server (TDD)

**Files:**
- Create: `counter/internal/server/server.go`
- Test: `counter/internal/server/server_test.go`

**Interfaces:**
- Consumes: `scoring`, `store`, `ratelimit`; `net/http`, `encoding/json`.
- Produces:
  - `type Limiter interface { Allow(ip string) bool }` — the server depends on this small interface (satisfied by `*ratelimit.Limiter`), so tests can inject a stub.
  - `type Server struct { … }` with unexported store + limiter.
  - `func New(st *store.Store, lim Limiter) *Server`.
  - `func (s *Server) Handler() http.Handler` — a `net/http` 1.22 mux: `POST /api/event` → `handleEvent`, `GET /healthz` → `handleHealth`.
  - `func clientIP(r *http.Request) string` (unexported) — prefers `X-Real-IP`, then the first `X-Forwarded-For` hop, then `r.RemoteAddr` host.
- Behavior of `handleEvent`: cap body at 4 KiB (`http.MaxBytesReader`); reject over rate limit with **429** (checked before parsing); decode JSON (bad JSON → **400**); `scoring.Validate` (error → **400**); `store.Apply` (error → **500**); success → **204**. `handleHealth` → **200** `ok`.

- [ ] **Step 1: Write the failing test `counter/internal/server/server_test.go`**

```go
package server

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"desktopcolors/counter/internal/store"
)

type stubLimiter struct{ allow bool }

func (s stubLimiter) Allow(string) bool { return s.allow }

func newTestServer(t *testing.T, allow bool) (*Server, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	return New(st, stubLimiter{allow: allow}), st
}

func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "203.0.113.7:12345"
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestEvent_CopyReturns204AndScores(t *testing.T) {
	s, st := newTestServer(t, true)
	h := s.Handler()
	rr := do(t, h, "POST", "/api/event", `{"kind":"copy","hex":"#008080","os":"windows-95"}`)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rr.Code)
	}
	got, _ := st.Dump()
	if got.Colors["#008080"] != 3 || got.Os["windows-95"] != 3 {
		t.Errorf("scores not applied: %+v", got)
	}
}

func TestEvent_OsviewScoresOsOnly(t *testing.T) {
	s, st := newTestServer(t, true)
	rr := do(t, s.Handler(), "POST", "/api/event", `{"kind":"osview","os":"kde-2"}`)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rr.Code)
	}
	got, _ := st.Dump()
	if got.Os["kde-2"] != 1 || len(got.Colors) != 0 {
		t.Errorf("osview wrong: %+v", got)
	}
}

func TestEvent_BadJSON400(t *testing.T) {
	s, _ := newTestServer(t, true)
	rr := do(t, s.Handler(), "POST", "/api/event", `{not json`)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rr.Code)
	}
}

func TestEvent_BadFields400(t *testing.T) {
	s, _ := newTestServer(t, true)
	for _, body := range []string{
		`{"kind":"nope","os":"windows-95"}`,
		`{"kind":"copy","hex":"xxx","os":"windows-95"}`,
		`{"kind":"copy","hex":"#008080","os":"Bad Slug"}`,
	} {
		rr := do(t, s.Handler(), "POST", "/api/event", body)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("body %q: status = %d, want 400", body, rr.Code)
		}
	}
}

func TestEvent_RateLimited429(t *testing.T) {
	s, _ := newTestServer(t, false) // limiter denies
	rr := do(t, s.Handler(), "POST", "/api/event", `{"kind":"osview","os":"kde-2"}`)
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d, want 429", rr.Code)
	}
}

func TestEvent_WrongMethod405(t *testing.T) {
	s, _ := newTestServer(t, true)
	rr := do(t, s.Handler(), "GET", "/api/event", "")
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rr.Code)
	}
}

func TestHealth200(t *testing.T) {
	s, _ := newTestServer(t, true)
	rr := do(t, s.Handler(), "GET", "/healthz", "")
	if rr.Code != http.StatusOK || strings.TrimSpace(rr.Body.String()) != "ok" {
		t.Errorf("health = %d %q", rr.Code, rr.Body.String())
	}
}

func TestClientIP(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/event", nil)
	req.RemoteAddr = "10.0.0.1:5000"
	req.Header.Set("X-Forwarded-For", "203.0.113.7, 10.0.0.1")
	if got := clientIP(req); got != "203.0.113.7" {
		t.Errorf("XFF first hop = %q", got)
	}
	req.Header.Set("X-Real-IP", "198.51.100.9")
	if got := clientIP(req); got != "198.51.100.9" {
		t.Errorf("X-Real-IP preferred = %q", got)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd counter && go test ./internal/server/`
Expected: FAIL — package/symbols undefined.

- [ ] **Step 3: Implement `counter/internal/server/server.go`**

```go
// Package server exposes the counter's HTTP API: POST /api/event and
// GET /healthz. It binds the pure scoring rules to the store, behind a rate
// limiter. No request data is logged.
package server

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"desktopcolors/counter/internal/scoring"
	"desktopcolors/counter/internal/store"
)

// Limiter is the subset of the rate limiter the server needs.
type Limiter interface {
	Allow(ip string) bool
}

type Server struct {
	store *store.Store
	lim   Limiter
}

func New(st *store.Store, lim Limiter) *Server {
	return &Server{store: st, lim: lim}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/event", s.handleEvent)
	mux.HandleFunc("GET /healthz", s.handleHealth)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) handleEvent(w http.ResponseWriter, r *http.Request) {
	if !s.lim.Allow(clientIP(r)) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)

	var e scoring.Event
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	d, err := scoring.Validate(e)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := s.store.Apply(d.Hex, d.ColorPts, d.Slug, d.OsPts); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// clientIP prefers X-Real-IP, then the first X-Forwarded-For hop, then the
// connection's remote host. nginx sets these; the service binds localhost so
// only nginx reaches it.
func clientIP(r *http.Request) string {
	if v := strings.TrimSpace(r.Header.Get("X-Real-IP")); v != "" {
		return v
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if i := strings.IndexByte(v, ','); i >= 0 {
			return strings.TrimSpace(v[:i])
		}
		return strings.TrimSpace(v)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd counter && go test ./internal/server/`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole module's tests**

Run: `cd counter && go test ./...`
Expected: all packages pass (scoring, store, ratelimit, server).

- [ ] **Step 6: Commit**

```bash
git add counter/internal/server/
git commit -m "feat: add HTTP server for event scoring and health"
```

---

### Task 6: CLI wiring (`serve` and `dump`)

**Files:**
- Modify: `counter/main.go`

**Interfaces:**
- Consumes: `store`, `ratelimit`, `server`; `flag`, `net/http`, `os/signal`, `context`.
- Produces the real CLI:
  - `counter serve [--addr 127.0.0.1:8787] [--db ./counter.db]` — opens the store, builds a `ratelimit.Limiter` (Capacity 40, RefillPerSec 0.5, real clock/rand), starts a background sweep goroutine (every 10 min, `Sweep(30*time.Minute)`), and serves `server.Handler()` with graceful shutdown on SIGINT/SIGTERM.
  - `counter dump [--db ./counter.db] [--out scores.json]` — opens the store, `Dump()`, marshals indented JSON, writes to `--out` (or stdout when `--out -`).
- No unit test (thin wiring over tested packages); verified by the manual end-to-end run below and by Task 7.

- [ ] **Step 1: Replace `counter/main.go`**

```go
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"desktopcolors/counter/internal/ratelimit"
	"desktopcolors/counter/internal/server"
	"desktopcolors/counter/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: counter <serve|dump> [flags]")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "serve":
		serveCmd(os.Args[2:])
	case "dump":
		dumpCmd(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "counter: unknown subcommand %q\n", os.Args[1])
		os.Exit(2)
	}
}

func serveCmd(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:8787", "listen address")
	dbPath := fs.String("db", "./counter.db", "sqlite database path")
	_ = fs.Parse(args)

	st, err := store.Open(*dbPath)
	if err != nil {
		fatal("open store: %v", err)
	}
	defer st.Close()

	lim := ratelimit.New(ratelimit.Config{Capacity: 40, RefillPerSec: 0.5})
	stopSweep := make(chan struct{})
	go func() {
		tick := time.NewTicker(10 * time.Minute)
		defer tick.Stop()
		for {
			select {
			case <-tick.C:
				lim.Sweep(30 * time.Minute)
			case <-stopSweep:
				return
			}
		}
	}()

	srv := &http.Server{Addr: *addr, Handler: server.New(st, lim).Handler()}

	go func() {
		fmt.Fprintf(os.Stderr, "counter: serving on %s (db %s)\n", *addr, *dbPath)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fatal("serve: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	close(stopSweep)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	fmt.Fprintln(os.Stderr, "counter: stopped")
}

func dumpCmd(args []string) {
	fs := flag.NewFlagSet("dump", flag.ExitOnError)
	dbPath := fs.String("db", "./counter.db", "sqlite database path")
	out := fs.String("out", "scores.json", `output path, or "-" for stdout`)
	_ = fs.Parse(args)

	st, err := store.Open(*dbPath)
	if err != nil {
		fatal("open store: %v", err)
	}
	defer st.Close()

	scores, err := st.Dump()
	if err != nil {
		fatal("dump: %v", err)
	}
	data, err := json.MarshalIndent(scores, "", "  ")
	if err != nil {
		fatal("marshal: %v", err)
	}
	data = append(data, '\n')

	if *out == "-" {
		_, _ = os.Stdout.Write(data)
		return
	}
	if err := os.WriteFile(*out, data, 0o644); err != nil {
		fatal("write %s: %v", *out, err)
	}
	fmt.Fprintf(os.Stderr, "counter: wrote %s (%d colors, %d os)\n", *out, len(scores.Colors), len(scores.Os))
}

func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "counter: "+format+"\n", a...)
	os.Exit(1)
}
```

- [ ] **Step 2: Build**

Run: `cd counter && go build -o counter .`
Expected: produces the `counter/counter` binary, no errors.

- [ ] **Step 3: Manual end-to-end check**

Run:
```bash
cd counter
rm -f /tmp/ctr.db*
./counter serve --db /tmp/ctr.db --addr 127.0.0.1:8799 &
SRV=$!
sleep 0.5
curl -sS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:8799/healthz
curl -sS -o /dev/null -w "copy:%{http_code}\n"   -X POST http://127.0.0.1:8799/api/event -d '{"kind":"copy","hex":"#008080","os":"windows-95"}'
curl -sS -o /dev/null -w "osview:%{http_code}\n" -X POST http://127.0.0.1:8799/api/event -d '{"kind":"osview","os":"windows-95"}'
curl -sS -o /dev/null -w "bad:%{http_code}\n"    -X POST http://127.0.0.1:8799/api/event -d '{"kind":"nope"}'
kill $SRV; wait $SRV 2>/dev/null
./counter dump --db /tmp/ctr.db --out -
```
Expected: `health:200`, `copy:204`, `osview:204`, `bad:400`, and the dump prints `{"colors":{"#008080":3},"os":{"windows-95":4}}` (indented). If the server didn't stop cleanly, `pkill -f 'counter serve'`.

- [ ] **Step 4: Commit**

```bash
git add counter/main.go
git commit -m "feat: wire counter serve and dump CLI"
```

---

### Task 7: Static binary build + verification gate

**Files:**
- No new source; this task proves the cgo-free static build and the full round-trip, and records the build command Plan 4 will reuse.

- [ ] **Step 1: Full module test**

Run: `cd counter && go test ./...`
Expected: all four packages pass.

- [ ] **Step 2: Build the static binary**

Run: `cd counter && CGO_ENABLED=0 go build -o counter .`
Expected: succeeds. Confirm it did not dynamically link libc via cgo:
```bash
cd counter && go version -m counter | grep -q "CGO_ENABLED=0" && echo "cgo-free OK" || echo "check build settings"
```
Expected: prints `cgo-free OK` (the build info records `CGO_ENABLED=0`).

- [ ] **Step 3: Round-trip against a fresh DB**

Run:
```bash
cd counter
rm -f /tmp/ctr2.db*
./counter serve --db /tmp/ctr2.db --addr 127.0.0.1:8798 & SRV=$!
sleep 0.5
for i in 1 2 3; do curl -sS -o /dev/null -X POST http://127.0.0.1:8798/api/event -d '{"kind":"download","hex":"#3A6EA5","os":"windows-nt-4-0"}'; done
kill $SRV; wait $SRV 2>/dev/null
./counter dump --db /tmp/ctr2.db --out /tmp/scores.json
cat /tmp/scores.json
```
Expected: `/tmp/scores.json` contains `"#3a6ea5": 9` under `colors` (hex lowercased, 3×3) and `"windows-nt-4-0": 9` under `os`. Confirms the write→dump round-trip and hex canonicalization.

- [ ] **Step 4: Confirm the dump shape matches the site reader**

The dump JSON must parse cleanly as Plan 1's `scores.json`. Verify keys/shape:
```bash
cd counter
node -e 'const s=require("/tmp/scores.json"); if(!s.colors||!s.os) throw new Error("shape"); console.log("shape OK", Object.keys(s.colors).length, Object.keys(s.os).length)'
```
Expected: prints `shape OK 1 1`. (Node is available from Plan 1; this only validates JSON shape.)

- [ ] **Step 5: Commit the verification record**

If Steps 1–4 required no code changes, record the verified build/run commands in the task report and make an empty marker commit:

```bash
git commit --allow-empty -m "chore: verify cgo-free counter build and write/dump round-trip"
```

---

## Self-review checklist (completed while writing)

- **Spec coverage (Plan 3 scope):** Go single binary, cgo-free ✓ (T1, T7); `serve` + `dump` subcommands ✓ (T6); SQLite aggregates only, no PII/event-log ✓ (T3); scoring +3/+3 and +1 ✓ (T2); raw points stored (formatting stays in the frontend) ✓ (T2/T3); hex lowercased, slug validated, bounded keys ✓ (T2); `scores.json` shape matches Plan 1 `parseScores` ✓ (T3 `Scores`, verified T7); salted-hash-of-truncated-IP token bucket, daily salt rotation, RAM-only, idle sweep ✓ (T4); HTTP contract 204/400/429/405/500 + `/healthz` ✓ (T5); localhost bind + X-Real-IP/XFF handling ✓ (T5, T6). Out of scope (Plan 4): wiring the site `track()` seam to `/api/event`, nginx reverse-proxy + log anonymization, systemd units, TLS/DNS, and the rebuild timer that runs `counter dump` → `astro build` → atomic swap.
- **Placeholder scan:** no TBD/TODO; every code step contains full code. The SQLite driver version is intentionally resolved by `go get` (not hand-pinned) to avoid a wrong version string. The `min` helper carries an explicit note about the Go builtin.
- **Type/interface consistency:** `store.Scores{Colors,Os map[string]int64}` marshals to the exact `{colors,os}` shape Plan 1 reads; `scoring.Delta{Hex,ColorPts,Slug,OsPts}` is unpacked into `store.Apply(hex,colorPts,slug,osPts)` at the one call site in `server.handleEvent`; the server depends on a local `Limiter` interface (`Allow(string) bool`) satisfied by `*ratelimit.Limiter`, enabling the stub in `server_test.go`. Package import path root is `desktopcolors/counter` (Task 1), matching every internal import.
- **Privacy invariant:** grep the finished module for any persistence of IP/hash — there is none; `ratelimit` never calls the store, and `store` only ever sees hex/slug/points. The salt is generated from `crypto/rand`, kept in a struct field, rotated on day change, and never written or logged.
