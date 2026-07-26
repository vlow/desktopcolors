import type { APIRoute } from "astro";
import { loadCatalog } from "../../../lib/loadCatalog";
import { loadOsViewJson } from "../../../lib/osDetail";

export async function getStaticPaths() {
  const catalog = await loadCatalog();
  return catalog.osList.map((o) => ({ params: { slug: o.slug } }));
}

export const GET: APIRoute = async ({ params }) => {
  const json = await loadOsViewJson(params.slug!);
  return new Response(JSON.stringify(json), {
    headers: { "content-type": "application/json" },
  });
};
