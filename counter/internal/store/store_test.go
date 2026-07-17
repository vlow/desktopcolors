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
