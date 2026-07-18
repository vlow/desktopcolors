import { describe, it, expect } from "vitest";
import {
  toExplorerColors, groupIntoBands, rankColors, familyCounts, shadeCountsFor, FAMILY_DEFS,
} from "./explorer";
import { buildCatalog } from "./catalog";
import { parseScores } from "./scores";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import type { ExplorerColor } from "./explorer";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", ...over,
});

const entries: OsEntry[] = [
  { slug: "a", data: os({ name: "A", year: 1995, colors: [
    { hex: "#008080", name: "Teal", index: "—", note: "", default: true },
    { hex: "#000080", name: "Navy", index: "—", note: "", default: false },
  ] }) },
  { slug: "b", data: os({ name: "B", year: 2000, colors: [
    { hex: "#ff0000", name: "Red", index: "—", note: "", default: true },
  ] }) },
];
const catalog = buildCatalog(entries, parseScores({ colors: { "#008080": 5000, "#ff0000": 1000 }, os: {} }));
const colors = toExplorerColors(catalog);

describe("toExplorerColors", () => {
  it("maps merged colors with hsl and href", () => {
    const teal = colors.find((c) => c.hex === "#008080")!;
    expect(teal.family).toBe("teal");
    expect(teal.h).toBeGreaterThan(0);
    expect(teal.href).toMatch(/^\/os\/.+\/[0-9a-f]{6}$/);
  });
});

describe("FAMILY_DEFS", () => {
  it("covers all nine families", () => {
    expect(FAMILY_DEFS.map((f) => f.key)).toEqual(
      ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "neutral"]);
  });
});

describe("familyCounts", () => {
  it("counts colors per family", () => {
    const counts = familyCounts(colors);
    expect(counts.teal).toBe(1);
    expect(counts.blue).toBe(1); // navy
    expect(counts.red).toBe(1);
  });
});

describe("groupIntoBands", () => {
  it("groups by hue and drops empty bands", () => {
    const bands = groupIntoBands(colors, { group: "hue", family: null, shade: null, sort: "spectrum" });
    const keys = bands.map((b) => b.key);
    expect(keys).toContain("teal");
    expect(keys).toContain("red");
    expect(bands.every((b) => b.colors.length > 0)).toBe(true);
  });
  it("filters to a single family", () => {
    const bands = groupIntoBands(colors, { group: "hue", family: "teal", shade: null, sort: "spectrum" });
    expect(bands.length).toBe(1);
    expect(bands[0].colors[0].hex).toBe("#008080");
  });
});

describe("rankColors", () => {
  it("ranks by popularity with pct bars", () => {
    const ranked = rankColors(colors, { family: null, sort: "pop" });
    expect(ranked[0].hex).toBe("#008080"); // score 5000 highest
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].pct).toBe(100);
    const red = ranked.find((c) => c.hex === "#ff0000")!;
    expect(red.pct).toBe(20); // 1000/5000
  });

  it("all-zero-scores → pct 0 (no divide-by-zero, no NaN)", () => {
    const zeroScores: ExplorerColor[] = [
      {
        hex: "#ff0000", name: "Red", family: "red", tone: "bright", shade: "mid",
        h: 0, s: 100, l: 50, onColor: "#ffffff", score: 0, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "a", href: "/os/a/ff0000",
      },
      {
        hex: "#00ff00", name: "Green", family: "green", tone: "bright", shade: "light",
        h: 120, s: 100, l: 50, onColor: "#ffffff", score: 0, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "b", href: "/os/b/00ff00",
      },
      {
        hex: "#0000ff", name: "Blue", family: "blue", tone: "bright", shade: "mid",
        h: 240, s: 100, l: 50, onColor: "#ffffff", score: 0, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "c", href: "/os/c/0000ff",
      },
    ];
    const ranked = rankColors(zeroScores, { family: null, sort: "pop" });
    expect(ranked).toHaveLength(3);
    ranked.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
      expect(r.pct).toBe(0); // no divide-by-zero, all 0
      expect(Number.isNaN(r.pct)).toBe(false);
    });
  });
});

describe("shadeCountsFor", () => {
  it("counts colors per shade within a family", () => {
    // Build fixture with differing lightness: deep (<32), mid (<55), light (<80), pale (>=80)
    const fixture: ExplorerColor[] = [
      {
        hex: "#1a1a1a", name: "Deep Red", family: "red", tone: "dark", shade: "deep",
        h: 0, s: 100, l: 15, onColor: "#ffffff", score: 100, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "a", href: "/os/a/1a1a1a",
      },
      {
        hex: "#8b0000", name: "Mid Red", family: "red", tone: "bright", shade: "mid",
        h: 0, s: 100, l: 42, onColor: "#ffffff", score: 100, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "a", href: "/os/a/8b0000",
      },
      {
        hex: "#ff6666", name: "Light Red", family: "red", tone: "bright", shade: "light",
        h: 0, s: 100, l: 70, onColor: "#1c1917", score: 100, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "a", href: "/os/a/ff6666",
      },
      {
        hex: "#ff9999", name: "Pale Red", family: "red", tone: "pastel", shade: "pale",
        h: 0, s: 100, l: 85, onColor: "#1c1917", score: 100, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "a", href: "/os/a/ff9999",
      },
      {
        hex: "#ffcccc", name: "Pale Red 2", family: "red", tone: "pastel", shade: "pale",
        h: 0, s: 100, l: 90, onColor: "#1c1917", score: 100, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "a", href: "/os/a/ffcccc",
      },
      // Add a different-family color to verify filtering
      {
        hex: "#0000ff", name: "Blue", family: "blue", tone: "bright", shade: "mid",
        h: 240, s: 100, l: 50, onColor: "#ffffff", score: 100, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "b", href: "/os/b/0000ff",
      },
    ];
    const counts = shadeCountsFor(fixture, "red");
    expect(counts.deep).toBe(1);
    expect(counts.mid).toBe(1);
    expect(counts.light).toBe(1);
    expect(counts.pale).toBe(2);
  });
});
