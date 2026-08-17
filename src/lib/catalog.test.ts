import { describe, it, expect } from "vitest";
import { buildCatalog } from "./catalog";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import { parseScores } from "./scores";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, added: "2000-01-01", family: "Fam", description: "d",
  desktopStyle: "generic", ...over,
});

const entries: OsEntry[] = [
  { slug: "windows-95", data: os({ name: "Windows 95", year: 1995, added: "2026-07-17", successor: "windows-98", colors: [
    { hex: "#008080", name: "Teal", note: "n", default: true },
    { hex: "#000080", name: "Navy", note: "", default: false },
  ] }) },
  { slug: "windows-98", data: os({ name: "Windows 98", year: 1998, predecessor: "windows-95", colors: [
    { hex: "#008080", name: "Teal", note: "", default: true },
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

  it("threads the added archive date onto the OsView", () => {
    expect(cat.bySlug.get("windows-95")!.added).toBe("2026-07-17");
    expect(cat.bySlug.get("windows-98")!.added).toBe("2000-01-01");
  });

  it("exposes merged colors with scores", () => {
    const teal = cat.colors.find((c) => c.hex === "#008080")!;
    expect(teal.platforms.length).toBe(2);
    expect(teal.score).toBe(48200);
    expect(teal.scoreLabel).toBe("48.2k");
  });

  it("throws on an unresolved reference", () => {
    const bad: OsEntry[] = [{ slug: "a", data: os({ successor: "nope", colors: [
      { hex: "#111111", name: "A", note: "", default: true },
    ] }) }];
    expect(() => buildCatalog(bad, scores)).toThrow(/nope/);
  });
});

describe("buildCatalog metadata fields", () => {
  it("threads type/project/wikipedia onto the OsView", () => {
    const cat = buildCatalog([
      { slug: "haiku", data: os({ name: "Haiku", year: 2009, colors: [
        { hex: "#336698", name: "Steel Blue", note: "", default: true },
      ], type: "Open Source", project: { name: "Haiku", url: "https://www.haiku-os.org" }, wikipedia: "https://en.wikipedia.org/wiki/Haiku_(operating_system)" }) },
    ], { colors: {}, os: {} });
    const v = cat.bySlug.get("haiku")!;
    expect(v.type).toBe("Open Source");
    expect(v.project).toEqual({ name: "Haiku", url: "https://www.haiku-os.org" });
    expect(v.wikipedia).toContain("wikipedia.org");
  });
});

describe("buildCatalog color types", () => {
  it("assigns a non-empty multi-label types array, tagging teal as cool", () => {
    const cat = buildCatalog(entries, parseScores({ colors: {}, os: {} }));
    const teal = cat.colors.find((c) => c.hex === "#008080")!;
    expect(Array.isArray(teal.types)).toBe(true);
    expect(teal.types.length).toBeGreaterThan(0);
    expect(teal.types).toContain("cool");
  });
});
