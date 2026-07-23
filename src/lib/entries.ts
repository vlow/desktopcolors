import { getCollection } from "astro:content";
import type { OsEntry } from "./derive";

// Memoized: the OS collection is identical for every page render during a
// build, so parse and map it once and reuse the same promise thereafter.
let entriesPromise: Promise<OsEntry[]> | undefined;

export function loadEntries(): Promise<OsEntry[]> {
  return (entriesPromise ??= getCollection("os").then((collection) =>
    collection.map((e) => ({
      slug: e.data.slug ?? e.id.replace(/\.json$/, ""),
      data: e.data,
    })),
  ));
}
