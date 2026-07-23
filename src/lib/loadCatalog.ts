import { buildCatalog, type Catalog } from "./catalog";
import { loadScores } from "./scores";
import { loadEntries } from "./entries";

// Memoized: the catalog is derived from the (also memoized) entries and scores
// and is identical for every page render during a build. Building it once
// avoids re-parsing all entries + re-reading scores.json on every page.
let catalogPromise: Promise<Catalog> | undefined;

export function loadCatalog(): Promise<Catalog> {
  return (catalogPromise ??= (async () =>
    buildCatalog(await loadEntries(), loadScores()))());
}
