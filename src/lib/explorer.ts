import { hexToHsl, type FamilyKey, type ToneKey, type ShadeKey } from "./color";
import type { Catalog } from "./catalog";
import { colorPath } from "./links";

export interface ExplorerColor {
  hex: string; name: string;
  family: FamilyKey; tone: ToneKey; shade: ShadeKey;
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
  { key: "neutral", name: "Neutrals", chip: "#9a9a96" },
];

export const TONE_DEFS: { key: ToneKey; name: string; chip: string }[] = [
  { key: "neon", name: "Neon", chip: "#16d6c1" },
  { key: "bright", name: "Bright", chip: "#e0512f" },
  { key: "pastel", name: "Pastel", chip: "#c9b6e8" },
  { key: "muted", name: "Muted", chip: "#8f978f" },
  { key: "dark", name: "Dark", chip: "#2b303c" },
];

export const SHADE_DEFS: { key: ShadeKey; name: string; chip: string }[] = [
  { key: "deep", name: "Deep", chip: "#2a2a2a" },
  { key: "mid", name: "Mid", chip: "#6b6b6b" },
  { key: "light", name: "Light", chip: "#b0b0b0" },
  { key: "pale", name: "Pale", chip: "#e6e6e6" },
];

export function toExplorerColors(catalog: Catalog): ExplorerColor[] {
  return catalog.colors.map((c) => {
    const [h, s, l] = hexToHsl(c.hex);
    return {
      hex: c.hex, name: c.name, family: c.family, tone: c.tone, shade: c.shade,
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

export function shadeCountsFor(colors: ExplorerColor[], family: FamilyKey): Record<ShadeKey, number> {
  const out = {} as Record<ShadeKey, number>;
  for (const d of SHADE_DEFS) out[d.key] = 0;
  for (const c of colors) if (c.family === family) out[c.shade]++;
  return out;
}

const spectrumCmp = (a: ExplorerColor, b: ExplorerColor): number =>
  a.h - b.h || a.l - b.l;
const popCmp = (a: ExplorerColor, b: ExplorerColor): number =>
  b.score - a.score || a.h - b.h;

export interface Band { key: string; name: string; chip: string; colors: ExplorerColor[] }

export function groupIntoBands(
  colors: ExplorerColor[],
  opts: { group: "hue" | "tone"; family: FamilyKey | null; shade: ShadeKey | null; sort: "spectrum" | "pop" },
): Band[] {
  const match = (c: ExplorerColor): boolean =>
    (!opts.family || c.family === opts.family) && (!opts.shade || c.shade === opts.shade);
  const defs = opts.group === "tone"
    ? TONE_DEFS
    : (opts.family ? FAMILY_DEFS.filter((d) => d.key === opts.family) : FAMILY_DEFS);
  const keyOf = (c: ExplorerColor): string => (opts.group === "tone" ? c.tone : c.family);
  const cmp = opts.sort === "pop" ? popCmp : spectrumCmp;
  return defs
    .map((d) => ({
      key: d.key, name: d.name, chip: d.chip,
      colors: colors.filter((c) => keyOf(c) === d.key && match(c)).slice().sort(cmp),
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
