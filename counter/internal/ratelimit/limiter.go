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

func (l *Limiter) key(ip string) string {
	h := sha256.New()
	h.Write(l.salt)
	h.Write([]byte(truncateIP(ip)))
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

	k := l.key(ip)
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
