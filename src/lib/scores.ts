import { readFileSync } from "node:fs";

export interface Scores {
  colors: Record<string, number>;
  os: Record<string, number>;
}

function parseBucket(raw: unknown, lowerKeys: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[lowerKeys ? k.toLowerCase() : k] = v;
      }
    }
  }
  return out;
}

export function parseScores(raw: unknown): Scores {
  if (!raw || typeof raw !== "object") return { colors: {}, os: {} };
  const obj = raw as Record<string, unknown>;
  return { colors: parseBucket(obj.colors, true), os: parseBucket(obj.os, false) };
}

export function loadScores(path = "scores.json"): Scores {
  try {
    return parseScores(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    console.warn(`[scores] ${path} not found or invalid — defaulting all scores to 0`);
    return { colors: {}, os: {} };
  }
}

export function colorScore(scores: Scores, hex: string): number {
  return scores.colors[hex.toLowerCase()] ?? 0;
}

export function osScore(scores: Scores, slug: string): number {
  return scores.os[slug] ?? 0;
}
