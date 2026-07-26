import { describe, it, expect } from "vitest";
import {
  buildOsDetail, dedupeSimilarByHex,
  pickColorDetail, normalizeDetails, denormalizeDetails,
  bootstrapFromView, osViewJsonFromView,
} from "./detail";
import { buildCatalog } from "./catalog";
import { parseScores } from "./scores";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import type { SimilarColor } from "./derive";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, added: "2000-01-01", family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", ...over,
});

const entries: OsEntry[] = [
  { slug: "win-95", data: os({ name: "Windows 95", year: 1995, colors: [
    { hex: "#008080", name: "Teal", note: "n", default: true },
    { hex: "#000080", name: "Navy", note: "", default: false },
  ] }) },
  { slug: "cde", data: os({ name: "CDE", year: 1993, colors: [
    { hex: "#008080", name: "Teal", note: "", default: false },
    { hex: "#9aabb9", name: "Dusty Blue", note: "", default: true },
  ] }) },
  { slug: "kde-2", data: os({ name: "KDE 2", year: 2000, colors: [
    { hex: "#5a7ea5", name: "Blue", note: "", default: true },
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
  const view = buildOsDetail(entries, catalog, "win-95");

  it("returns the OsView and a DetailColor per color", () => {
    expect(view.os.slug).toBe("win-95");
    expect(view.colors.length).toBe(2);
  });
  it("attaches a closest RAL match to each color", () => {
    const teal = view.colors[0];
    expect(teal.ral.code).toMatch(/^RAL \d{4}$/);
    expect(teal.ral.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("lists all platforms using the exact hex (known uses), sorted by year", () => {
    const view = buildOsDetail(entries, catalog, "win-95");
    const teal = view.colors.find((c) => c.hex === "#008080")!;
    expect(teal.uses.map((u) => u.slug)).toEqual(["cde", "win-95"]); // 1993 then 1995
    expect(teal.uses.find((u) => u.slug === "win-95")!.isDefault).toBe(true);
  });

  it("excludes identical-hex matches from similar", () => {
    const view = buildOsDetail(entries, catalog, "win-95");
    const teal = view.colors.find((c) => c.hex === "#008080")!;
    expect(teal.similar.every((s) => s.hex !== "#008080")).toBe(true);
    expect(teal.similar.every((s) => s.match < 100)).toBe(true);
  });

  it("builds extended-format rows including RAL", () => {
    const view = buildOsDetail(entries, catalog, "win-95");
    const teal = view.colors.find((c) => c.hex === "#008080")!;
    const keys = teal.extraFormats.map((r) => r.key);
    expect(keys).toEqual(["lab", "lch", "oklab", "oklch", "ral", "ralDesign"]);
    expect(teal.extraFormats.find((r) => r.key === "ral")!.swatch).toMatch(/^#/);
  });

  it("includes era peers with hrefs", () => {
    expect(view.eraPeers.some((p) => p.slug === "cde")).toBe(true);
    expect(view.eraPeers.every((p) => p.slug !== "win-95")).toBe(true);
  });
  it("throws on unknown slug", () => {
    expect(() => buildOsDetail(entries, catalog, "nope")).toThrow(/nope/);
  });
});

describe("normalizeDetails / denormalizeDetails", () => {
  const view = buildOsDetail(entries, catalog, "win-95");
  const details = view.colors.map(pickColorDetail);

  it("round-trips detail through the normalized wire form", () => {
    const json = normalizeDetails(details);
    expect(denormalizeDetails(json)).toEqual(details);
  });

  it("collapses each referenced OS's metadata into osMeta exactly once", () => {
    const { osMeta } = normalizeDetails(details);
    // cde supplies the teal known-use + era peer metadata
    expect(osMeta["cde"]).toEqual({ name: "CDE", year: 1993, family: "Fam" });
    // every platform slug referenced by any detail must be present
    for (const d of details) {
      for (const p of d.uses) expect(osMeta[p.slug]).toBeDefined();
      for (const s of d.similar) for (const p of s.platforms) expect(osMeta[p.slug]).toBeDefined();
    }
  });

  it("reduces wire platforms to slug + isDefault only", () => {
    const { details: wire } = normalizeDetails(details);
    for (const d of wire) {
      for (const p of d.uses) expect(Object.keys(p).sort()).toEqual(["isDefault", "slug"]);
    }
  });
});

describe("bootstrapFromView", () => {
  const view = buildOsDetail(entries, catalog, "win-95");

  it("inlines only the initial color's detail, keyed by lowercase hex", () => {
    const b = bootstrapFromView(view, "#000080"); // Navy
    expect(Object.keys(b.detailsByHex)).toEqual(["#000080"]);
    expect(b.detailsByHex["#000080"].ral.code).toMatch(/^RAL /);
    expect(b.viewUrl).toBe("/os/win-95/view.json");
    expect(b.os.slug).toBe("win-95");
  });

  it("falls back to the default color when no hex is given", () => {
    const b = bootstrapFromView(view, null);
    // Teal (#008080) is the default in the fixture
    expect(Object.keys(b.detailsByHex)).toEqual(["#008080"]);
  });
});

describe("osViewJsonFromView", () => {
  it("emits one wire detail per color, aligned to os.colors order", () => {
    const view = buildOsDetail(entries, catalog, "win-95");
    const json = osViewJsonFromView(view);
    expect(json.details.length).toBe(view.os.colors.length);
    expect(json.details.length).toBe(2);
  });
});
