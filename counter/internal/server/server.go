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
