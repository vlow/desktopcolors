import { describe, it, expect } from "vitest";
import {
  toColorEntries, groupIntoBands, rankColors, familyCounts, typeCounts,
  COLOR_TYPE_DEFS, FAMILY_DEFS, buildPlatformsByHex, buildOsUniverse,
  matchesColorQuery,
} from "./colorCatalog";
import { buildCatalog } from "./catalog";
import { parseScores } from "./scores";
import type { OsEntry } from "./derive";
import type { OsInput } from "../content/config";
import type { ColorEntry, Platform } from "./colorCatalog";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, added: "2000-01-01", family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", ...over,
});

const entries: OsEntry[] = [
  { slug: "a", data: os({ name: "A", year: 1995, colors: [
    { hex: "#008080", name: "Teal", note: "", default: true },
    { hex: "#000080", name: "Navy", note: "", default: false },
  ] }) },
  { slug: "b", data: os({ name: "B", year: 2000, colors: [
    { hex: "#ff0000", name: "Red", note: "", default: true },
  ] }) },
];
const catalog = buildCatalog(entries, parseScores({ colors: { "#008080": 5000, "#ff0000": 1000 }, os: {} }));
const colors = toColorEntries(catalog);

describe("toColorEntries", () => {
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
      ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "achromatic"]);
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
    const bands = groupIntoBands(colors, { group: "hue", family: null, types: [], sort: "spectrum" });
    const keys = bands.map((b) => b.key);
    expect(keys).toContain("teal");
    expect(keys).toContain("red");
    expect(bands.every((b) => b.colors.length > 0)).toBe(true);
  });
  it("filters to a single family", () => {
    const bands = groupIntoBands(colors, { group: "hue", family: "teal", types: [], sort: "spectrum" });
    expect(bands.length).toBe(1);
    expect(bands[0].colors[0].hex).toBe("#008080");
  });
});

describe("matchesColorQuery", () => {
  const platformsByHex = buildPlatformsByHex(catalog);
  const teal = colors.find((c) => c.hex === "#008080")!;
  const red = colors.find((c) => c.hex === "#ff0000")!;

  it("empty/whitespace query matches everything", () => {
    expect(matchesColorQuery(teal, "", platformsByHex)).toBe(true);
    expect(matchesColorQuery(teal, "   ", platformsByHex)).toBe(true);
  });

  it("matches by color name, case-insensitively", () => {
    expect(matchesColorQuery(teal, "teal", platformsByHex)).toBe(true);
    expect(matchesColorQuery(teal, "TEAL", platformsByHex)).toBe(true);
    expect(matchesColorQuery(red, "teal", platformsByHex)).toBe(false);
  });

  it("matches by full or partial hex", () => {
    expect(matchesColorQuery(teal, "#008080", platformsByHex)).toBe(true);
    expect(matchesColorQuery(teal, "0080", platformsByHex)).toBe(true);
  });

  it("matches by family key and family display name", () => {
    expect(matchesColorQuery(teal, "teal", platformsByHex)).toBe(true); // key
    expect(matchesColorQuery(teal, "teals", platformsByHex)).toBe(true); // "Teals"
  });

  it("matches by the name of an OS that shipped the color", () => {
    // Teal ships on OS "A"; Red ships on OS "B".
    expect(matchesColorQuery(red, "b", platformsByHex)).toBe(true);
    expect(matchesColorQuery(teal, "b", platformsByHex)).toBe(false);
  });

  it("matches a literal year present in the range", () => {
    expect(matchesColorQuery(teal, "1995", platformsByHex)).toBe(true);
    expect(matchesColorQuery(red, "1995", platformsByHex)).toBe(false);
  });

  it("matches a year that falls inside a multi-year range", () => {
    const ranged: ColorEntry = { ...teal, yearRange: "1990–2000" };
    expect(matchesColorQuery(ranged, "1995", {})).toBe(true); // between, not literal
    expect(matchesColorQuery(ranged, "1985", {})).toBe(false);
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
    const zeroScores: ColorEntry[] = [
      {
        hex: "#ff0000", name: "Red", family: "red", types: ["vivid", "warm"],
        h: 0, s: 100, l: 50, onColor: "#ffffff", score: 0, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "a", href: "/os/a/ff0000",
      },
      {
        hex: "#00ff00", name: "Green", family: "green", types: ["vivid"],
        h: 120, s: 100, l: 50, onColor: "#ffffff", score: 0, scoreLabel: "< 1k",
        yearRange: "2000–2001", primarySlug: "b", href: "/os/b/00ff00",
      },
      {
        hex: "#0000ff", name: "Blue", family: "blue", types: ["vivid", "cool"],
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

describe("COLOR_TYPE_DEFS", () => {
  it("covers all eleven types in a stable order", () => {
    expect(COLOR_TYPE_DEFS.map((d) => d.key)).toEqual([
      "neutral", "light", "dark", "warm", "cool", "muted",
      "vivid", "pastel", "earth", "jewel", "neon",
    ]);
  });
});

describe("typeCounts", () => {
  it("counts colors per type across the whole set", () => {
    const counts = typeCounts(colors);
    // #008080 (teal) and #000080 (navy) are both cool; #ff0000 is warm.
    expect(counts.cool).toBeGreaterThanOrEqual(2);
    expect(counts.warm).toBeGreaterThanOrEqual(1);
    // Every type key is present (0 allowed), never undefined.
    for (const d of COLOR_TYPE_DEFS) expect(typeof counts[d.key]).toBe("number");
  });
});

describe("groupIntoBands with a type filter", () => {
  it("keeps only colors carrying at least one selected type (OR)", () => {
    const bands = groupIntoBands(colors, {
      group: "hue", family: null, types: ["warm"], sort: "spectrum",
    });
    const hexes = bands.flatMap((b) => b.colors.map((c) => c.hex));
    expect(hexes).toContain("#ff0000"); // warm
    expect(hexes).not.toContain("#008080"); // cool teal, filtered out
  });
  it("with no types selected, includes everything (family filter still applies)", () => {
    const bands = groupIntoBands(colors, {
      group: "hue", family: "teal", types: [], sort: "spectrum",
    });
    expect(bands.length).toBe(1);
    expect(bands[0].colors[0].hex).toBe("#008080");
  });
});

describe("buildPlatformsByHex", () => {
  it("groups platforms by lowercased hex, sorted by year then name", () => {
    const map = buildPlatformsByHex(catalog);
    expect(map["#008080"].map((p) => p.slug)).toEqual(["a"]);
    expect(map["#008080"][0]).toMatchObject({ name: "A", year: 1995, isDefault: true });
    expect(map["#ff0000"][0]).toMatchObject({ slug: "b", isDefault: true });
  });

  it("lists every platform that shipped a shared hex", () => {
    const shared: OsEntry[] = [
      { slug: "old", data: os({ name: "Old", year: 1998, colors: [
        { hex: "#008080", name: "Teal", note: "", default: false }] }) },
      { slug: "new", data: os({ name: "New", year: 1995, colors: [
        { hex: "#008080", name: "Teal", note: "", default: true }] }) },
    ];
    const cat = buildCatalog(shared, parseScores({ colors: {}, os: {} }));
    const map = buildPlatformsByHex(cat);
    // sorted by year: 1995 "New" before 1998 "Old"
    expect(map["#008080"].map((p) => p.slug)).toEqual(["new", "old"]);
    expect(map["#008080"][0].isDefault).toBe(true);
  });
});

describe("buildOsUniverse", () => {
  it("groups OSes by family, each group sorted by year then name", () => {
    const multi: OsEntry[] = [
      { slug: "w98", data: os({ name: "Windows 98", year: 1998, family: "Windows", colors: [
        { hex: "#008080", name: "Teal", note: "", default: true }] }) },
      { slug: "w95", data: os({ name: "Windows 95", year: 1995, family: "Windows", colors: [
        { hex: "#000080", name: "Navy", note: "", default: true }] }) },
      { slug: "beos", data: os({ name: "BeOS", year: 1996, family: "Be", colors: [
        { hex: "#ff0000", name: "Red", note: "", default: true }] }) },
    ];
    const cat = buildCatalog(multi, parseScores({ colors: {}, os: {} }));
    const uni = buildOsUniverse(cat);
    const win = uni.fams.find((f) => f.name === "Windows")!;
    expect(win.oses.map((o) => o.slug)).toEqual(["w95", "w98"]);
    expect(uni.fams.map((f) => f.name)).toContain("Be");
  });
});

import { osMatch, osOptionDisabled } from "./colorCatalog";

const P = (slug: string, isDefault = false): Platform =>
  ({ slug, name: slug, year: 2000, family: "F", isDefault });

// teal ships on w95+w98; red ships on w95+beos.
const pmap: Record<string, Platform[]> = {
  "#008080": [P("w95", true), P("w98", true)],
  "#ff0000": [P("w95"), P("beos", true)],
};
const C = (hex: string, family: ColorEntry["family"], types: ColorEntry["types"]): ColorEntry =>
  ({ hex, name: hex, family, types, h: 0, s: 0, l: 0, onColor: "#fff", score: 0, scoreLabel: "0", yearRange: "2000", primarySlug: "w95", href: "/x" });
const universe: ColorEntry[] = [C("#008080", "teal", ["cool"]), C("#ff0000", "red", ["warm"])];

describe("osMatch", () => {
  it("matches all when nothing is selected", () => {
    expect(osMatch("#008080", pmap, {}, "any")).toBe(true);
  });
  it("ANY: color ships on at least one selected OS", () => {
    expect(osMatch("#ff0000", pmap, { beos: true }, "any")).toBe(true);
    expect(osMatch("#008080", pmap, { beos: true }, "any")).toBe(false);
  });
  it("ALL: color ships on every selected OS", () => {
    expect(osMatch("#008080", pmap, { w95: true, w98: true }, "all")).toBe(true);
    expect(osMatch("#ff0000", pmap, { w95: true, w98: true }, "all")).toBe(false);
  });
});

describe("osOptionDisabled", () => {
  const base = { universe, platformsByHex: pmap, osSel: {} as Record<string, true>, mode: "any" as const };

  it("ANY: disabled when no color in the universe ships on it", () => {
    // restrict universe to reds only → w98 (teal-only) is impossible
    const redOnly = { ...base, universe: [C("#ff0000", "red", ["warm"])] };
    expect(osOptionDisabled("w98", redOnly)).toBe(true);
    expect(osOptionDisabled("beos", redOnly)).toBe(false);
  });

  it("never disables an already-selected OS", () => {
    const redOnly = { ...base, universe: [C("#ff0000", "red", ["warm"])], osSel: { w98: true } as Record<string, true> };
    expect(osOptionDisabled("w98", redOnly)).toBe(false);
  });

  it("ALL: disabled when adding it would empty the result", () => {
    // beos selected in ALL mode; only red ships on beos. Adding w98 (teal-only) empties it.
    const allBeos = { ...base, mode: "all" as const, osSel: { beos: true } as Record<string, true> };
    expect(osOptionDisabled("w98", allBeos)).toBe(true);
    // w95 also ships red, so beos+w95 still yields red → enabled
    expect(osOptionDisabled("w95", allBeos)).toBe(false);
  });
});
