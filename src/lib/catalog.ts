import {
  hexToRgb, hexToHsl, hexToCmyk, onColor, hueFamily, colorTypes, formatScore,
  type FamilyKey, type ColorTypeKey,
} from "./color";
import {
  defaultColor, mergeColorsByHex, type OsEntry, type MergedColor,
} from "./derive";
import { colorScore, osScore, type Scores } from "./scores";
import type { DesktopStyle } from "./desktopStyle";

export interface ColorView {
  hex: string;
  name: string;
  note: string;
  isDefault: boolean;
  rgb: string;
  hsl: string;
  cmyk: string;
  onColor: string;
  family: FamilyKey;
  types: ColorTypeKey[];
  score: number;
  scoreLabel: string;
}

export interface OsRef {
  slug: string;
  name: string;
  year: number;
}

export interface OsView {
  slug: string;
  name: string;
  year: number;
  added: string;
  family: string;
  description: string;
  desktopStyle: DesktopStyle;
  type?: string;
  project?: { name: string; url: string };
  wikipedia?: string;
  colors: ColorView[];
  defaultHex: string;
  colorCount: number;
  score: number;
  scoreLabel: string;
  predecessor: OsRef | null;
  successor: OsRef | null;
}

export interface MergedColorView extends MergedColor {
  onColor: string;
  types: ColorTypeKey[];
  score: number;
  scoreLabel: string;
  primarySlug: string;
}

export interface Catalog {
  osList: OsView[];
  bySlug: Map<string, OsView>;
  colors: MergedColorView[];
}

function toColorView(hex: string, name: string, note: string, isDefault: boolean, scores: Scores): ColorView {
  const key = hex.toLowerCase();
  const [r, g, b] = hexToRgb(key);
  const [h, s, l] = hexToHsl(key);
  const [c, m, y, kk] = hexToCmyk(key);
  const score = colorScore(scores, key);
  return {
    hex: key, name, note, isDefault,
    rgb: `${r}, ${g}, ${b}`,
    hsl: `${h}° ${s}% ${l}%`,
    cmyk: `${c}% ${m}% ${y}% ${kk}%`,
    onColor: onColor(key),
    family: hueFamily(h, s),
    types: colorTypes(key),
    score, scoreLabel: formatScore(score),
  };
}

export function buildCatalog(entries: OsEntry[], scores: Scores): Catalog {
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
  const refOf = (slug: string | undefined, field: string, from: string): OsRef | null => {
    if (!slug) return null;
    const target = entryBySlug.get(slug);
    if (!target) {
      throw new Error(`Unresolved ${field} "${slug}" referenced by "${from}"`);
    }
    return { slug, name: target.data.name, year: target.data.year };
  };

  const osList: OsView[] = entries.map(({ slug, data }) => {
    const colors = data.colors.map((c) =>
      toColorView(c.hex, c.name, c.note, c.default, scores));
    const def = defaultColor(data);
    const score = osScore(scores, slug);
    return {
      slug, name: data.name, year: data.year, added: data.added, family: data.family,
      description: data.description, desktopStyle: data.desktopStyle,
      type: data.type, project: data.project, wikipedia: data.wikipedia,
      colors, defaultHex: def.hex.toLowerCase(), colorCount: colors.length,
      score, scoreLabel: formatScore(score),
      predecessor: refOf(data.predecessor, "predecessor", slug),
      successor: refOf(data.successor, "successor", slug),
    };
  });

  const bySlug = new Map(osList.map((o) => [o.slug, o]));

  const colors: MergedColorView[] = mergeColorsByHex(entries).map((m) => {
    const score = colorScore(scores, m.hex);
    return {
      ...m,
      onColor: onColor(m.hex),
      types: colorTypes(m.hex),
      score, scoreLabel: formatScore(score),
      primarySlug: m.platforms[0].slug,
    };
  });

  return { osList, bySlug, colors };
}
