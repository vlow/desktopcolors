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
