import { closestRal, closestRalDesign, onColor, hexToHsl, hexToRgb, rgbToLab, labToLch, rgbToOklab } from "./color";
import { similarColors, eraPeers, type OsEntry, type SimilarColor, type EraPeer } from "./derive";
import { buildPlatformsByHex, type Platform } from "./colorCatalog";
import type { Catalog, OsView, ColorView } from "./catalog";

export type { OsView };
import type { DesktopStyle } from "./desktopStyle";

export interface RalMatch { code: string; name: string; hex: string }
export interface CopyRow { key: string; label: string; value: string; copy: string; swatch?: string }

export interface SimilarView {
  hex: string; name: string; match: number;
  onColor: string; h: number; s: number; l: number;
  primarySlug: string; style: DesktopStyle; platforms: Platform[];
}

export interface DetailColor extends ColorView {
  ral: RalMatch;
  ralDesign: RalMatch;
  extraFormats: CopyRow[];
  similar: SimilarView[];
  uses: Platform[];
}

export interface EraPeerView extends EraPeer { onColor: string; href: string; metaLine: string }

export interface OsDetailView {
  os: OsView;
  colors: DetailColor[];
  eraPeers: EraPeerView[];
}

export type PlatformRef = { slug: string; isDefault: boolean };
export type OsMeta = { name: string; year: number; family: string };
export type OsMetaTable = Record<string, OsMeta>;

export interface ColorDetail {
  ral: RalMatch;
  ralDesign: RalMatch;
  extraFormats: CopyRow[];
  similar: SimilarView[];
  uses: Platform[];
}

export interface SimilarViewWire extends Omit<SimilarView, "platforms"> {
  platforms: PlatformRef[];
}
export interface ColorDetailWire {
  ral: RalMatch;
  ralDesign: RalMatch;
  extraFormats: CopyRow[];
  similar: SimilarViewWire[];
  uses: PlatformRef[];
}
export interface OsViewJson {
  osMeta: OsMetaTable;
  details: ColorDetailWire[];
}

export function dedupeSimilarByHex(list: SimilarColor[]): SimilarColor[] {
  const seen = new Set<string>();
  const out: SimilarColor[] = [];
  for (const c of list) {
    if (seen.has(c.hex)) continue;
    seen.add(c.hex);
    out.push(c);
  }
  return out;
}

const n1 = (x: number) => x.toFixed(1);
const n3 = (x: number) => x.toFixed(3);

function extraFormats(hex: string, ral: RalMatch, ralDesign: RalMatch): CopyRow[] {
  const [r, g, b] = hexToRgb(hex);
  const [L, a, bl] = rgbToLab(r, g, b);
  const [Ll, Cc, Hh] = labToLch(L, a, bl);
  const [ol, oa, ob] = rgbToOklab(r, g, b);
  const Coq = Math.sqrt(oa * oa + ob * ob);
  let Hoq = (Math.atan2(ob, oa) * 180) / Math.PI; if (Hoq < 0) Hoq += 360;
  return [
    { key: "lab", label: "CIELAB", value: `${n1(L)}, ${n1(a)}, ${n1(bl)}`, copy: `lab(${n1(L)}% ${n1(a)} ${n1(bl)})` },
    { key: "lch", label: "LCH", value: `${n1(Ll)}, ${n1(Cc)}, ${n1(Hh)}`, copy: `lch(${n1(Ll)}% ${n1(Cc)} ${n1(Hh)})` },
    { key: "oklab", label: "OKLab", value: `${n3(ol)}, ${n3(oa)}, ${n3(ob)}`, copy: `oklab(${n3(ol)} ${n3(oa)} ${n3(ob)})` },
    { key: "oklch", label: "OKLCH", value: `${n3(ol)}, ${n3(Coq)}, ${n1(Hoq)}`, copy: `oklch(${n3(ol)} ${n3(Coq)} ${n1(Hoq)})` },
    { key: "ral", label: "Closest RAL Classic", value: `${ral.code} · ${ral.name}`, copy: `${ral.code} · ${ral.name}`, swatch: ral.hex },
    { key: "ralDesign", label: "Closest RAL Design+", value: `${ralDesign.code} · ${ralDesign.name}`, copy: `${ralDesign.code} · ${ralDesign.name}`, swatch: ralDesign.hex },
  ];
}

export function buildOsDetail(entries: OsEntry[], catalog: Catalog, slug: string): OsDetailView {
  const os = catalog.bySlug.get(slug);
  const entry = entries.find((e) => e.slug === slug);
  if (!os || !entry) throw new Error(`Unknown OS slug "${slug}"`);

  const platformsByHex = buildPlatformsByHex(catalog);
  const styleBySlug: Record<string, DesktopStyle> = {};
  for (const o of catalog.osList) styleBySlug[o.slug] = o.desktopStyle;

  const colors: DetailColor[] = os.colors.map((c: ColorView) => {
    const ral = closestRal(c.hex);
    const ralDesign = closestRalDesign(c.hex);
    const similar: SimilarView[] = dedupeSimilarByHex(similarColors(c.hex, entries, slug, 24))
      .filter((s) => s.match < 100 && s.hex.toLowerCase() !== c.hex.toLowerCase())
      .slice(0, 6)
      .map((s) => {
        const [h, sat, l] = hexToHsl(s.hex);
        const platforms = platformsByHex[s.hex.toLowerCase()] ?? [];
        const primarySlug = platforms[0]?.slug ?? s.osSlug;
        return {
          hex: s.hex, name: s.name, match: s.match, onColor: onColor(s.hex),
          h, s: sat, l, primarySlug, style: styleBySlug[primarySlug] ?? "generic", platforms,
        };
      });
    return {
      ...c,
      ral: { code: ral.code, name: ral.name, hex: ral.hex },
      ralDesign: { code: ralDesign.code, name: ralDesign.name, hex: ralDesign.hex },
      extraFormats: extraFormats(c.hex, ral, ralDesign),
      similar,
      uses: platformsByHex[c.hex.toLowerCase()] ?? [],
    };
  });

  const peers: EraPeerView[] = eraPeers(entry, entries, 3).map((p) => ({
    ...p, onColor: onColor(p.hex), href: `/os/${p.slug}`, metaLine: `${p.year} · ${p.family}`,
  }));

  return { os, colors, eraPeers: peers };
}

export function pickColorDetail(dc: DetailColor): ColorDetail {
  return {
    ral: dc.ral, ralDesign: dc.ralDesign, extraFormats: dc.extraFormats,
    similar: dc.similar, uses: dc.uses,
  };
}

const refOf = (p: Platform): PlatformRef => ({ slug: p.slug, isDefault: p.isDefault });

export function normalizeDetails(details: ColorDetail[]): OsViewJson {
  const osMeta: OsMetaTable = {};
  const note = (p: Platform) => {
    osMeta[p.slug] ??= { name: p.name, year: p.year, family: p.family };
  };
  const wire: ColorDetailWire[] = details.map((d) => {
    d.uses.forEach(note);
    d.similar.forEach((s) => s.platforms.forEach(note));
    return {
      ral: d.ral, ralDesign: d.ralDesign, extraFormats: d.extraFormats,
      similar: d.similar.map((s) => ({ ...s, platforms: s.platforms.map(refOf) })),
      uses: d.uses.map(refOf),
    };
  });
  return { osMeta, details: wire };
}

export function denormalizeDetails(json: OsViewJson): ColorDetail[] {
  const hydrate = (ref: PlatformRef): Platform => {
    const m = json.osMeta[ref.slug];
    return { slug: ref.slug, name: m.name, year: m.year, family: m.family, isDefault: ref.isDefault };
  };
  return json.details.map((d) => ({
    ral: d.ral, ralDesign: d.ralDesign, extraFormats: d.extraFormats,
    similar: d.similar.map((s) => ({ ...s, platforms: s.platforms.map(hydrate) })),
    uses: d.uses.map(hydrate),
  }));
}

export interface OsDetailBootstrap {
  os: OsView;
  eraPeers: EraPeerView[];
  initialHex: string | null;
  detailsByHex: Record<string, ColorDetail>;
  viewUrl: string;
}

export function bootstrapFromView(view: OsDetailView, initialHex: string | null): OsDetailBootstrap {
  const idx = initialHex
    ? view.colors.findIndex((c) => c.hex.toLowerCase() === initialHex.toLowerCase())
    : -1;
  const chosen = idx >= 0 ? view.colors[idx] : (view.colors.find((c) => c.isDefault) ?? view.colors[0]);
  return {
    os: view.os,
    eraPeers: view.eraPeers,
    initialHex,
    detailsByHex: { [chosen.hex.toLowerCase()]: pickColorDetail(chosen) },
    viewUrl: `/os/${view.os.slug}/view.json`,
  };
}

export function osViewJsonFromView(view: OsDetailView): OsViewJson {
  return normalizeDetails(view.colors.map(pickColorDetail));
}
