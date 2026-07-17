import { buildCatalog, type Catalog } from "./catalog";
import { loadScores } from "./scores";
import { loadEntries } from "./entries";

export async function loadCatalog(): Promise<Catalog> {
  return buildCatalog(await loadEntries(), loadScores());
}
