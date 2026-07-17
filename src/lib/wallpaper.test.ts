import { describe, it, expect } from "vitest";
import { RESOLUTION_GROUPS, wallpaperFilename, parseDimension } from "./wallpaper";

describe("RESOLUTION_GROUPS", () => {
  it("has Desktop, Mobile, Classic groups with items", () => {
    const labels = RESOLUTION_GROUPS.map((g) => g.label);
    expect(labels).toEqual(["Desktop", "Mobile", "Classic"]);
    for (const g of RESOLUTION_GROUPS) {
      expect(g.items.length).toBeGreaterThan(0);
      for (const it of g.items) {
        expect(it.w).toBeGreaterThan(0);
        expect(it.h).toBeGreaterThan(0);
        expect(it.label).toMatch(/^\d+×\d+$/);
      }
    }
  });
  it("includes 1920×1080 in Desktop", () => {
    const desktop = RESOLUTION_GROUPS.find((g) => g.label === "Desktop")!;
    expect(desktop.items.some((i) => i.w === 1920 && i.h === 1080)).toBe(true);
  });
});

describe("wallpaperFilename", () => {
  it("slugs os, color, and hex into a png name", () => {
    expect(wallpaperFilename("windows-95", "Teal", "#008080", 1920, 1080))
      .toBe("windows-95-teal-008080-1920x1080.png");
  });
  it("handles multi-word color names and uppercase hex", () => {
    expect(wallpaperFilename("windows-xp", "Olive Green", "#7BA05B", 2560, 1440))
      .toBe("windows-xp-olive-green-7ba05b-2560x1440.png");
  });
});

describe("parseDimension", () => {
  it("accepts integers in range", () => {
    expect(parseDimension("1920")).toBe(1920);
    expect(parseDimension(" 800 ")).toBe(800);
    expect(parseDimension("1")).toBe(1);
    expect(parseDimension("10000")).toBe(10000);
  });
  it("rejects junk, decimals, and out-of-range", () => {
    expect(parseDimension("")).toBeNull();
    expect(parseDimension("abc")).toBeNull();
    expect(parseDimension("12.5")).toBeNull();
    expect(parseDimension("0")).toBeNull();
    expect(parseDimension("10001")).toBeNull();
    expect(parseDimension("-5")).toBeNull();
  });
});
