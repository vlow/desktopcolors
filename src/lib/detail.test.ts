import { describe, it, expect } from "vitest";
import { buildOsDetail, dedupeSimilarByHex } from "./detail";
import { buildCatalog } from "./catalog";
import { parseScores } from "./scores";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import type { SimilarColor } from "./derive";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", colors: over.colors, ...over,
});

const entries: OsEntry[] = [
  { slug: "windows-95", data: os({ name: "Windows 95", year: 1995, colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "n", default: true },
    { hex: "#000080", name: "Navy", index: "1", note: "", default: false },
  ] }) },
  { slug: "cde", data: os({ name: "CDE", year: 1993, colors: [
    { hex: "#008080", name: "Teal", index: "—", note: "", default: true },
    { hex: "#9aabb9", name: "Dusty Blue", index: "—", note: "", default: false },
  ] }) },
  { slug: "kde-2", data: os({ name: "KDE 2", year: 2000, colors: [
    { hex: "#008080", name: "Teal", index: "—", note: "", default: true },
  ] }) },
];

const catalog = buildCatalog(entries, parseScores({ colors: { "#008080": 1200 }, os: {} }));

describe("dedupeSimilarByHex", () => {
  it("keeps the first (nearest) occurrence of each hex", () => {
    const list: SimilarColor[] = [
      { hex: "#008080", name: "Teal", osSlug: "cde", osName: "CDE", distance: 0, match: 100 },
      { hex: "#008080", name: "Teal", osSlug: "kde-2", osName: "KDE 2", distance: 0, match: 100 },
      { hex: "#9aabb9", name: "Dusty Blue", osSlug: "cde", osName: "CDE", distance: 0.2, match: 50 },
    ];
    const out = dedupeSimilarByHex(list);
    expect(out.map((c) => c.hex)).toEqual(["#008080", "#9aabb9"]);
    expect(out[0].osSlug).toBe("cde");
  });
});

describe("buildOsDetail", () => {
  const view = buildOsDetail(entries, catalog, "windows-95");

  it("returns the OsView and a DetailColor per color", () => {
    expect(view.os.slug).toBe("windows-95");
    expect(view.colors.length).toBe(2);
  });
  it("attaches a closest RAL match to each color", () => {
    const teal = view.colors[0];
    expect(teal.ral.code).toMatch(/^RAL \d{4}$/);
    expect(teal.ral.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("dedupes similar colors by hex and links them", () => {
    const teal = view.colors[0];
    // #008080 also in cde and kde-2 -> one deduped entry, not two
    const tealMatches = teal.similar.filter((s) => s.hex === "#008080");
    expect(tealMatches.length).toBe(1);
    expect(teal.similar.every((s) => s.osSlug !== "windows-95")).toBe(true);
    expect(teal.similar[0].href).toMatch(/^\/os\/.+\?hex=/);
  });
  it("computes first known use with self flag", () => {
    const teal = view.colors[0]; // teal first shipped by CDE (1993) < Win95 (1995)
    expect(teal.firstUse.slug).toBe("cde");
    expect(teal.firstUse.self).toBe(false);
    const navy = view.colors[1]; // navy only in win95
    expect(navy.firstUse.self).toBe(true);
  });
  it("includes era peers with hrefs", () => {
    expect(view.eraPeers.some((p) => p.slug === "cde")).toBe(true);
    expect(view.eraPeers.every((p) => p.slug !== "windows-95")).toBe(true);
  });
  it("throws on unknown slug", () => {
    expect(() => buildOsDetail(entries, catalog, "nope")).toThrow(/nope/);
  });
});
