import { describe, it, expect } from "vitest";
import { SETUP_GUIDES, filterGuides, guideCounts } from "./setup-guides";

describe("SETUP_GUIDES", () => {
  it("has the seven documented platforms", () => {
    expect(SETUP_GUIDES.map((g) => g.key)).toEqual(
      ["win11", "win10", "macos", "gnome", "kde", "ios", "android"]);
  });
  it("carries the GNOME gsettings code block", () => {
    const gnome = SETUP_GUIDES.find((g) => g.key === "gnome")!;
    expect(gnome.code).toContain("gsettings set org.gnome.desktop.background primary-color");
  });
});

describe("filterGuides", () => {
  it("filters by category", () => {
    const mobile = filterGuides(SETUP_GUIDES, { query: "", cat: "mobile" });
    expect(mobile.map((g) => g.key).sort()).toEqual(["android", "ios"]);
  });
  it("filters by query across os/steps/article", () => {
    const res = filterGuides(SETUP_GUIDES, { query: "terminal", cat: "all" });
    expect(res.map((g) => g.key)).toEqual(["gnome"]);
  });
  it("returns everything for empty query + all", () => {
    expect(filterGuides(SETUP_GUIDES, { query: "", cat: "all" }).length).toBe(7);
  });
});

describe("guideCounts", () => {
  it("counts by category honoring the query, not the category filter", () => {
    expect(guideCounts(SETUP_GUIDES, "")).toEqual({ all: 7, desktop: 5, mobile: 2 });
    const c = guideCounts(SETUP_GUIDES, "iphone");
    expect(c.all).toBe(1);
    expect(c.mobile).toBe(1);
    expect(c.desktop).toBe(0);
  });
});
