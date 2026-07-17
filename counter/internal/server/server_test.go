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
