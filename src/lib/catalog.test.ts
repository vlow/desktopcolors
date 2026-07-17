import { describe, it, expect } from "vitest";
import { buildCatalog } from "./catalog";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import { parseScores } from "./scores";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", ...over,
});

const entries: OsEntry[] = [
  { slug: "windows-95", data: os({ name: "Windows 95", year: 1995, successor: "windows-98", colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "n", default: true },
    { hex: "#000080", name: "Navy", index: "1", note: "", default: false },
  ] }) },
  { slug: "windows-98", data: os({ name: "Windows 98", year: 1998, predecessor: "windows-95", colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "", default: true },
  ] }) },
];

const scores = parseScores({ colors: { "#008080": 48200 }, os: { "windows-95": 900 } });

describe("buildCatalog", () => {
  const cat = buildCatalog(entries, scores);

  it("bakes color scores and formats them", () => {
    const teal = cat.bySlug.get("windows-95")!.colors[0];
    expect(teal.score).toBe(48200);
    expect(teal.scoreLabel).toBe("48.2k");
  });

  it("formats os scores below 1k", () => {
    const w95 = cat.bySlug.get("windows-95")!;
    expect(w95.score).toBe(900);
    expect(w95.scoreLabel).toBe("< 1k");
  });

  it("computes color view fields", () => {
    const teal = cat.bySlug.get("windows-95")!.colors[0];
    expect(teal.rgb).toBe("0, 128, 128");
    expect(teal.hsl).toBe("180° 100% 25%");
    expect(teal.onColor).toBe("#ffffff");
    expect(teal.family).toBe("teal");
  });

  it("resolves predecessor/successor refs", () => {
    const w95 = cat.bySlug.get("windows-95")!;
    expect(w95.successor).toEqual({ slug: "windows-98", name: "Windows 98", year: 1998 });
    expect(w95.predecessor).toBeNull();
  });

  it("exposes merged colors with scores", () => {
    const teal = cat.colors.find((c) => c.hex === "#008080")!;
    expect(teal.platforms.length).toBe(2);
    expect(teal.score).toBe(48200);
    expect(teal.scoreLabel).toBe("48.2k");
  });

  it("throws on an unresolved reference", () => {
    const bad: OsEntry[] = [{ slug: "a", data: os({ successor: "nope", colors: [
      { hex: "#111111", name: "A", index: "—", note: "", default: true },
    ] }) }];
    expect(() => buildCatalog(bad, scores)).toThrow(/nope/);
  });
});
