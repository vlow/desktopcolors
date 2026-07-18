/**
 * Path to an OS detail page focused on a specific color.
 *
 * The color is encoded in the path (not a `?hex=` query) so each color is its
 * own statically pre-rendered page — the correct color is baked into the HTML
 * at build time, with no client-side flash. Hex digits are URL-safe, so no
 * escaping is needed.
 */
export const colorPath = (slug: string, hex: string): string =>
  `/os/${slug}/${hex.replace(/^#/, "")}`;
