import { getCollection } from "astro:content";
import type { OsEntry } from "./derive";

export async function loadEntries(): Promise<OsEntry[]> {
  const collection = await getCollection("os");
  return collection.map((e) => ({
    slug: e.data.slug ?? e.id.replace(/\.json$/, ""),
    data: e.data,
  }));
}
