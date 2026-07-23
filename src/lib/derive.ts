import {
  hexToOklab, oklabDistance, hueFamily, hexToHsl, type FamilyKey,
} from "./color";
import type { OsInput, OsColor } from "../content/config";

export interface OsEntry {
  slug: string;
  data: OsInput;
}

export function defaultColor(data: OsInput): OsColor {
  return data.colors.find((c) => c.default) ?? data.colors[0];
}

export interface MergedColor {
  hex: string;
  name: string;
  platforms: { slug: string; name: string; year: number }[];
  yearRange: string;
  family: FamilyKey;
}

export function mergeColorsByHex(entries: OsEntry[]): MergedColor[] {
  interface Acc {
    hex: string;
    names: Map<string, number>;
    defaultName: string | null;
    platforms: { slug: string; name: string; year: number }[];
  }
  const map = new Map<string, Acc>();
  for (const { slug, data } of entries) {
    for (const c of data.colors) {
      const key = c.hex.toLowerCase();
      let acc = map.get(key);
      if (!acc) {
        acc = { hex: key, names: new Map(), defaultName: null, platforms: [] };
        map.set(key, acc);
      }
      acc.names.set(c.name, (acc.names.get(c.name) ?? 0) + 1);
      if (c.default) acc.defaultName = c.name;
      acc.platforms.push({ slug, name: data.name, year: data.year });
    }
  }
  const out: MergedColor[] = [];
  for (const acc of map.values()) {
    const name = acc.defaultName ??
      [...acc.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const years = acc.platforms.map((p) => p.year).sort((a, b) => a - b);
    const lo = years[0], hi = years[years.length - 1];
    const yearRange = lo === hi ? `${lo}` : `${lo}–${hi}`;
    const [h, s] = hexToHsl(acc.hex);
    out.push({ hex: acc.hex, name, platforms: acc.platforms, yearRange, family: hueFamily(h, s) });
  }
  return out;
}

export interface SimilarColor {
  hex: string;
  name: string;
  osSlug: string;
  osName: string;
  distance: number;
  match: number;
}

export function similarColors(
  hex: string, entries: OsEntry[], excludeSlug: string, limit: number,
): SimilarColor[] {
  const target = hexToOklab(hex);
  const all: SimilarColor[] = [];
  for (const { slug, data } of entries) {
    if (slug === excludeSlug) continue;
    for (const c of data.colors) {
      const distance = oklabDistance(target, hexToOklab(c.hex));
      all.push({
        hex: c.hex.toLowerCase(), name: c.name, osSlug: slug, osName: data.name,
        distance, match: Math.max(0, Math.round(100 * (1 - distance / 0.4))),
      });
    }
  }
  all.sort((a, b) => a.distance - b.distance);
  return all.slice(0, limit);
}

export interface EraPeer {
  slug: string;
  name: string;
  family: string;
  year: number;
  hex: string;
  colorName: string;
  rel: string;
}

export function eraPeers(entry: OsEntry, entries: OsEntry[], windowYears: number): EraPeer[] {
  const base = entry.data.year;
  return entries
    .filter((e) => e.slug !== entry.slug && Math.abs(e.data.year - base) <= windowYears)
    .map((e) => {
      const dy = e.data.year - base;
      const rel = dy === 0
        ? "same year"
        : `${Math.abs(dy)} yr ${dy < 0 ? "earlier" : "later"}`;
      const def = defaultColor(e.data);
      return {
        slug: e.slug, name: e.data.name, family: e.data.family, year: e.data.year,
        hex: def.hex.toLowerCase(), colorName: def.name, rel,
      };
    })
    .sort((a, b) => a.year - b.year);
}
