import { describe, it, expect } from "vitest";
import {
  toExplorerColors, groupIntoBands, rankColors, familyCounts, FAMILY_DEFS,
} from "./explorer";
import { buildCatalog } from "./catalog";
import { parseScores } from "./scores";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", colors: over.colors, ...over,
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
    expect(teal.href).toMatch(/^\/os\/.+\?hex=/);
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
});
