import { loadCatalog } from "./loadCatalog";
import { loadEntries } from "./entries";
import { buildOsDetail, type OsDetailView } from "./detail";

// Memoized per-slug detail view. `buildOsDetail` produces the same view for all
// of an OS's colors (it does not depend on the selected hex), yet the
// `/os/[slug]/[hex]` route renders one page per color. Without this cache the
// full per-OS detail — including the O(all-colors) similar-color scan for every
// color — is recomputed once per hex page, i.e. O(colors²) work per OS. Caching
// by slug collapses that back to once per OS.
const detailCache = new Map<string, OsDetailView>();

export async function loadOsDetail(slug: string): Promise<OsDetailView> {
  const cached = detailCache.get(slug);
  if (cached) return cached;
  const [catalog, entries] = await Promise.all([loadCatalog(), loadEntries()]);
  const view = buildOsDetail(entries, catalog, slug);
  detailCache.set(slug, view);
  return view;
}
