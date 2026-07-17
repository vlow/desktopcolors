import { getCollection } from "astro:content";
import { buildCatalog, type Catalog } from "./catalog";
import { loadScores } from "./scores";
import type { OsEntry } from "./derive";

export async function loadCatalog(): Promise<Catalog> {
  const collection = await getCollection("os");
  const entries: OsEntry[] = collection.map((e) => ({
    slug: e.data.slug ?? e.id.replace(/\.json$/, ""),
    data: e.data,
  }));
  return buildCatalog(entries, loadScores());
}
