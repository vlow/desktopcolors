export interface ResolutionItem {
  w: number;
  h: number;
  label: string;
}
export interface ResolutionGroup {
  label: string;
  items: ResolutionItem[];
}

const mk = (w: number, h: number): ResolutionItem => ({ w, h, label: `${w}×${h}` });

export const RESOLUTION_GROUPS: ResolutionGroup[] = [
  { label: "Desktop", items: [mk(1280, 720), mk(1920, 1080), mk(2560, 1440), mk(3840, 2160)] },
  { label: "Mobile", items: [mk(1170, 2532), mk(1080, 2400), mk(1284, 2778), mk(1440, 3120)] },
  { label: "Classic", items: [mk(640, 480), mk(800, 600), mk(1024, 768)] },
];

export const MIN_DIM = 1;
export const MAX_DIM = 10000;

const slug = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function wallpaperFilename(
  osSlug: string, colorName: string, hex: string, w: number, h: number,
): string {
  return `${slug(osSlug)}-${slug(colorName)}-${hex.replace("#", "").toLowerCase()}-${w}x${h}.png`;
}

export function parseDimension(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (n < MIN_DIM || n > MAX_DIM) return null;
  return n;
}
