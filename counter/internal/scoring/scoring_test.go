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
