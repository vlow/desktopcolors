import { describe, it, expect } from "vitest";
import { SETUP_GUIDES, filterGuides, guideCounts } from "./setup-guides";

describe("SETUP_GUIDES", () => {
  it("has the eight documented platforms", () => {
    expect(SETUP_GUIDES.map((g) => g.key)).toEqual(
      ["win11", "win10", "macos", "gnome", "kde", "x11", "ios", "android"]);
  });
  it("carries the GNOME gsettings code block", () => {
    const gnome = SETUP_GUIDES.find((g) => g.key === "gnome")!;
    expect(gnome.code).toContain("gsettings set org.gnome.desktop.background primary-color");
  });
  it("carries the X11 xsetroot command", () => {
    const x11 = SETUP_GUIDES.find((g) => g.key === "x11")!;
    expect(x11.code).toBe("xsetroot -solid '#008080'");
  });
});

describe("filterGuides", () => {
  it("filters by category", () => {
    const mobile = filterGuides(SETUP_GUIDES, { query: "", cat: "mobile" });
    expect(mobile.map((g) => g.key).sort()).toEqual(["android", "ios"]);
  });
  it("filters by query across os/steps/article", () => {
    const res = filterGuides(SETUP_GUIDES, { query: "GNOME", cat: "all" });
    expect(res.map((g) => g.key)).toEqual(["gnome"]);
  });
  it("returns everything for empty query + all", () => {
    expect(filterGuides(SETUP_GUIDES, { query: "", cat: "all" }).length).toBe(8);
  });
});

describe("guideCounts", () => {
  it("counts by category honoring the query, not the category filter", () => {
    expect(guideCounts(SETUP_GUIDES, "")).toEqual({ all: 8, desktop: 6, mobile: 2 });
    const c = guideCounts(SETUP_GUIDES, "iphone");
    expect(c.all).toBe(1);
    expect(c.mobile).toBe(1);
    expect(c.desktop).toBe(0);
  });
});
