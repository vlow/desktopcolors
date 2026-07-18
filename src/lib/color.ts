import { RAL_CLASSIC, RAL_DESIGN_PLUS, type RalColor } from "./ral";

export type FamilyKey =
  | "red" | "orange" | "yellow" | "green" | "teal"
  | "blue" | "purple" | "pink" | "neutral";

export type ToneKey = "neon" | "bright" | "pastel" | "muted" | "dark";

export type ShadeKey = "deep" | "mid" | "light" | "pale";

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

// Naive RGB -> CMYK (no ICC profile), integer percentages 0–100.
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k === 1) return [0, 0, 0, 100]; // pure black — avoid divide-by-zero
  const c = (1 - rr - k) / (1 - k);
  const m = (1 - gg - k) / (1 - k);
  const y = (1 - bb - k) / (1 - k);
  return [Math.round(c * 100), Math.round(m * 100), Math.round(y * 100), Math.round(k * 100)];
}

export function hexToCmyk(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToCmyk(r, g, b);
}

export function onColor(hex: string): "#1c1917" | "#ffffff" {
  const [, , l] = hexToHsl(hex);
  return l > 55 ? "#1c1917" : "#ffffff";
}

export function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

// Björn Ottosson's sRGB -> OKLab transform.
export function hexToOklab(hex: string): [number, number, number] {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = srgbToLinear(r8), g = srgbToLinear(g8), b = srgbToLinear(b8);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

export function oklabDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export function hueFamily(h: number, s: number): FamilyKey {
  if (s < 12) return "neutral";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

export function tone(h: number, s: number, l: number): ToneKey {
  if (l < 30) return "dark";
  if (s >= 78 && l >= 42 && l <= 72) return "neon";
  if (l >= 70 && s <= 65) return "pastel";
  if (s >= 42) return "bright";
  return "muted";
}

export function shade(l: number): ShadeKey {
  if (l < 32) return "deep";
  if (l < 55) return "mid";
  if (l < 80) return "light";
  return "pale";
}

export function closestRal(hex: string, palette: RalColor[] = RAL_CLASSIC): RalColor {
  const target = hexToOklab(hex);
  let best = palette[0];
  let bestD = Infinity;
  for (const ral of palette) {
    const d = oklabDistance(target, hexToOklab(ral.hex));
    if (d < bestD) { bestD = d; best = ral; }
  }
  return best;
}

export function closestRalDesign(hex: string): RalColor {
  return closestRal(hex, RAL_DESIGN_PLUS);
}

export function formatScore(points: number): string {
  if (points < 1000) return "< 1k";
  const k = points / 1000;
  return `${k.toFixed(1).replace(/\.0$/, "")}k`;
}
