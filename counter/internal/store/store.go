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
