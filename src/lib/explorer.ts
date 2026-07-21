import { hexToHsl, type FamilyKey, type ColorTypeKey } from "./color";
import type { Catalog } from "./catalog";
import { colorPath } from "./links";

export interface ExplorerColor {
  hex: string; name: string;
  family: FamilyKey; types: ColorTypeKey[];
  h: number; s: number; l: number;
  onColor: string; score: number; scoreLabel: string;
  yearRange: string; primarySlug: string; href: string;
}

export const FAMILY_DEFS: { key: FamilyKey; name: string; chip: string }[] = [
  { key: "red", name: "Reds", chip: "#cc3333" },
  { key: "orange", name: "Oranges", chip: "#d2762f" },
  { key: "yellow", name: "Yellows", chip: "#d8c020" },
  { key: "green", name: "Greens", chip: "#4e9a5f" },
  { key: "teal", name: "Teals", chip: "#2aa5a5" },
  { key: "blue", name: "Blues", chip: "#3a6ea5" },
  { key: "purple", name: "Purples", chip: "#8a5cc0" },
  { key: "pink", name: "Pinks", chip: "#c0559a" },
  { key: "achromatic", name: "Achromatic", chip: "#9a9a96" },
];

export const COLOR_TYPE_DEFS: { key: ColorTypeKey; name: string; chip: string }[] = [
  { key: "neutral", name: "Neutral", chip: "#9a9a96" },
  { key: "light", name: "Light", chip: "#e6e6e6" },
  { key: "dark", name: "Dark", chip: "#2b303c" },
  { key: "warm", name: "Warm", chip: "#d2762f" },
  { key: "cool", name: "Cool", chip: "#3a6ea5" },
  { key: "muted", name: "Muted", chip: "#8f978f" },
  { key: "vivid", name: "Vivid", chip: "#e0512f" },
  { key: "pastel", name: "Pastel", chip: "#c9b6e8" },
  { key: "earth", name: "Earth", chip: "#8a5a2b" },
  { key: "jewel", name: "Jewel", chip: "#7a1f5c" },
  { key: "neon", name: "Neon", chip: "#16d6c1" },
];

export function toExplorerColors(catalog: Catalog): ExplorerColor[] {
  return catalog.colors.map((c) => {
    const [h, s, l] = hexToHsl(c.hex);
    return {
      hex: c.hex, name: c.name, family: c.family, types: c.types,
      h, s, l, onColor: c.onColor, score: c.score, scoreLabel: c.scoreLabel,
      yearRange: c.yearRange, primarySlug: c.primarySlug,
      href: colorPath(c.primarySlug, c.hex),
    };
  });
}

export function familyCounts(colors: ExplorerColor[]): Record<FamilyKey, number> {
  const out = {} as Record<FamilyKey, number>;
  for (const d of FAMILY_DEFS) out[d.key] = 0;
  for (const c of colors) out[c.family]++;
  return out;
}

export function typeCounts(colors: ExplorerColor[]): Record<ColorTypeKey, number> {
  const out = {} as Record<ColorTypeKey, number>;
  for (const d of COLOR_TYPE_DEFS) out[d.key] = 0;
  for (const c of colors) for (const t of c.types) out[t]++;
  return out;
}

const spectrumCmp = (a: ExplorerColor, b: ExplorerColor): number =>
  a.h - b.h || a.l - b.l;
const popCmp = (a: ExplorerColor, b: ExplorerColor): number =>
  b.score - a.score || a.h - b.h;

export interface Band { key: string; name: string; chip: string; colors: ExplorerColor[] }

export function groupIntoBands(
  colors: ExplorerColor[],
  opts: { group: "hue"; family: FamilyKey | null; types: ColorTypeKey[]; sort: "spectrum" | "pop" },
): Band[] {
  const match = (c: ExplorerColor): boolean =>
    (!opts.family || c.family === opts.family) &&
    (opts.types.length === 0 || opts.types.some((t) => c.types.includes(t)));
  const defs = opts.family ? FAMILY_DEFS.filter((d) => d.key === opts.family) : FAMILY_DEFS;
  const cmp = opts.sort === "pop" ? popCmp : spectrumCmp;
  return defs
    .map((d) => ({
      key: d.key, name: d.name, chip: d.chip,
      colors: colors.filter((c) => c.family === d.key && match(c)).slice().sort(cmp),
    }))
    .filter((b) => b.colors.length > 0);
}

export function rankColors(
  colors: ExplorerColor[],
  opts: { family: FamilyKey | null; sort: "spectrum" | "pop" },
): (ExplorerColor & { rank: number; pct: number })[] {
  const filtered = colors.filter((c) => !opts.family || c.family === opts.family);
  const maxScore = filtered.reduce((mx, c) => Math.max(mx, c.score), 0);
  const cmp = opts.sort === "pop" ? popCmp : spectrumCmp;
  return filtered.slice().sort(cmp).map((c, i) => ({
    ...c, rank: i + 1,
    pct: maxScore > 0 ? Math.round((c.score / maxScore) * 100) : 0,
  }));
}

export interface Platform {
  slug: string;
  name: string;
  year: number;
  family: string;
  isDefault: boolean;
}

export interface OsFamily {
  name: string;
  oses: { slug: string; name: string; year: number; family: string }[];
}

export interface OsUniverse {
  fams: OsFamily[];
}

export function buildPlatformsByHex(catalog: Catalog): Record<string, Platform[]> {
  const map: Record<string, Platform[]> = {};
  for (const o of catalog.osList) {
    for (const c of o.colors) {
      const key = c.hex.toLowerCase();
      (map[key] ??= []).push({
        slug: o.slug, name: o.name, year: o.year, family: o.family, isDefault: c.isDefault,
      });
    }
  }
  for (const key in map) {
    map[key].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  }
  return map;
}

export function buildOsUniverse(catalog: Catalog): OsUniverse {
  const oses = catalog.osList
    .map((o) => ({ slug: o.slug, name: o.name, year: o.year, family: o.family }))
    .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  const fams: OsFamily[] = [];
  for (const o of oses) {
    let f = fams.find((x) => x.name === o.family);
    if (!f) { f = { name: o.family, oses: [] }; fams.push(f); }
    f.oses.push(o);
  }
  return { fams };
}
