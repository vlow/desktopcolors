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
