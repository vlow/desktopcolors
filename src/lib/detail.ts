import { closestRal, onColor } from "./color";
import {
  similarColors, eraPeers, firstKnownUse,
  type OsEntry, type SimilarColor, type EraPeer, type FirstUse,
} from "./derive";
import type { Catalog, OsView, ColorView } from "./catalog";

export interface RalMatch { code: string; name: string; hex: string }

export interface SimilarView {
  hex: string; name: string; osSlug: string; osName: string;
  match: number; onColor: string; href: string;
}

export interface DetailColor extends ColorView {
  ral: RalMatch;
  similar: SimilarView[];
  firstUse: FirstUse & { self: boolean; href: string };
}

export interface EraPeerView extends EraPeer { onColor: string; href: string }

export interface OsDetailView {
  os: OsView;
  colors: DetailColor[];
  eraPeers: EraPeerView[];
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

const colorHref = (slug: string, hex: string): string =>
  `/os/${slug}?hex=${encodeURIComponent(hex)}`;

export function buildOsDetail(entries: OsEntry[], catalog: Catalog, slug: string): OsDetailView {
  const os = catalog.bySlug.get(slug);
  const entry = entries.find((e) => e.slug === slug);
  if (!os || !entry) throw new Error(`Unknown OS slug "${slug}"`);

  const colors: DetailColor[] = os.colors.map((c: ColorView) => {
    const ral = closestRal(c.hex);
    const similar = dedupeSimilarByHex(similarColors(c.hex, entries, slug, 24))
      .slice(0, 6)
      .map((s): SimilarView => ({
        hex: s.hex, name: s.name, osSlug: s.osSlug, osName: s.osName,
        match: s.match, onColor: onColor(s.hex), href: colorHref(s.osSlug, s.hex),
      }));
    const fu = firstKnownUse(c.hex, entries);
    return {
      ...c,
      ral: { code: ral.code, name: ral.name, hex: ral.hex },
      similar,
      firstUse: { ...fu, self: fu.slug === slug, href: `/os/${fu.slug}` },
    };
  });

  const peers: EraPeerView[] = eraPeers(entry, entries, 3).map((p) => ({
    ...p, onColor: onColor(p.hex), href: `/os/${p.slug}`,
  }));

  return { os, colors, eraPeers: peers };
}
