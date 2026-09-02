import { hexToHsl, type FamilyKey, type ColorTypeKey } from "./color";
import type { Catalog } from "./catalog";
import { colorPath } from "./links";

export interface ColorEntry {
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

export function toColorEntries(catalog: Catalog): ColorEntry[] {
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

export function familyCounts(colors: ColorEntry[]): Record<FamilyKey, number> {
  const out = {} as Record<FamilyKey, number>;
  for (const d of FAMILY_DEFS) out[d.key] = 0;
  for (const c of colors) out[c.family]++;
  return out;
}

export function typeCounts(colors: ColorEntry[]): Record<ColorTypeKey, number> {
  const out = {} as Record<ColorTypeKey, number>;
  for (const d of COLOR_TYPE_DEFS) out[d.key] = 0;
  for (const c of colors) for (const t of c.types) out[t]++;
  return out;
}

// Free-text color search. Matches a color against the query by name, family
// (key + display name), hex, year range, color-type names, and the names of the
// OSes that shipped it. A bare four-digit year also matches any color whose year
// range spans it, even when that exact year isn't written in the label.
export function matchesColorQuery(
  c: ColorEntry,
  query: string,
  platformsByHex: Record<string, Platform[]>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const famName = FAMILY_DEFS.find((f) => f.key === c.family)?.name ?? "";
  const typeNames = c.types
    .map((t) => COLOR_TYPE_DEFS.find((d) => d.key === t)?.name ?? t)
    .join(" ");
  const oses = (platformsByHex[c.hex.toLowerCase()] ?? [])
    .map((p) => `${p.name} ${p.family}`)
    .join(" ");
  const hay = [c.name, famName, c.family, c.hex, c.yearRange, typeNames, oses]
    .join(" ")
    .toLowerCase();
  if (hay.includes(q)) return true;
  if (/^\d{4}$/.test(q)) {
    const ys = c.yearRange.match(/\d{4}/g);
    if (ys) {
      const a = +ys[0], b = +ys[ys.length - 1];
      if (+q >= a && +q <= b) return true;
    }
  }
  return false;
}

const spectrumCmp = (a: ColorEntry, b: ColorEntry): number =>
  a.h - b.h || a.l - b.l;
const popCmp = (a: ColorEntry, b: ColorEntry): number =>
  b.score - a.score || a.h - b.h;

export interface Band { key: string; name: string; chip: string; colors: ColorEntry[] }

export function groupIntoBands(
  colors: ColorEntry[],
  opts: { group: "hue"; family: FamilyKey | null; types: ColorTypeKey[]; sort: "spectrum" | "pop" },
): Band[] {
  const match = (c: ColorEntry): boolean =>
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
  colors: ColorEntry[],
  opts: { family: FamilyKey | null; sort: "spectrum" | "pop" },
): (ColorEntry & { rank: number; pct: number })[] {
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

export type OsMode = "any" | "all";

export function osMatch(
  hex: string,
  platformsByHex: Record<string, Platform[]>,
  osSel: Record<string, true>,
  mode: OsMode,
): boolean {
  const keys = Object.keys(osSel).filter((k) => osSel[k]);
  if (keys.length === 0) return true;
  const slugs = new Set((platformsByHex[hex.toLowerCase()] ?? []).map((p) => p.slug));
  return mode === "all" ? keys.every((k) => slugs.has(k)) : keys.some((k) => slugs.has(k));
}

// "Defaults only" narrows to the colors a system shipped as ITS default background,
// using the same ANY/ALL semantics as osMatch: with no OS picked a color passes if
// it is the default anywhere, and with OSes picked it must be the default of one
// (ANY) or all (ALL) of them. Coupling it to the selection is the point — picking
// Windows 95 and asking for defaults means Windows 95's default, not any default
// that happens to also ship there.
export function defaultMatch(
  hex: string,
  platformsByHex: Record<string, Platform[]>,
  osSel: Record<string, true>,
  mode: OsMode,
): boolean {
  const defaults = (platformsByHex[hex.toLowerCase()] ?? []).filter((p) => p.isDefault);
  const keys = Object.keys(osSel).filter((k) => osSel[k]);
  if (keys.length === 0) return defaults.length > 0;
  const slugs = new Set(defaults.map((p) => p.slug));
  return mode === "all" ? keys.every((k) => slugs.has(k)) : keys.some((k) => slugs.has(k));
}

export function osOptionDisabled(
  candidateSlug: string,
  opts: {
    universe: ColorEntry[];
    platformsByHex: Record<string, Platform[]>;
    osSel: Record<string, true>;
    mode: OsMode;
    // When set, only an OS's *default* color counts as shipping on it, matching
    // defaultMatch. Without this the panel would happily offer a pick that
    // empties the grid.
    defaultsOnly?: boolean;
  },
): boolean {
  const { universe, platformsByHex, osSel, mode, defaultsOnly } = opts;
  const selected = Object.keys(osSel).filter((k) => osSel[k]);
  if (selected.includes(candidateSlug)) return false; // never disable a selected OS
  const shipsOn = (hex: string, slug: string): boolean =>
    (platformsByHex[hex.toLowerCase()] ?? [])
      .some((p) => p.slug === slug && (!defaultsOnly || p.isDefault));
  if (mode === "all") {
    const need = [...selected, candidateSlug];
    return !universe.some((c) => need.every((s) => shipsOn(c.hex, s)));
  }
  return !universe.some((c) => shipsOn(c.hex, candidateSlug));
}
