import { describe, it, expect } from "vitest";
import { parseScores, colorScore, osScore } from "./scores";

describe("parseScores", () => {
  it("returns empty scores for garbage", () => {
    expect(parseScores(null)).toEqual({ colors: {}, os: {} });
    expect(parseScores(42)).toEqual({ colors: {}, os: {} });
    expect(parseScores({})).toEqual({ colors: {}, os: {} });
  });
  it("lowercases hex keys and keeps integers", () => {
    const s = parseScores({ colors: { "#00FF00": 1200 }, os: { "windows-95": 30 } });
    expect(s.colors["#00ff00"]).toBe(1200);
    expect(s.os["windows-95"]).toBe(30);
  });
  it("drops non-numeric values", () => {
    const s = parseScores({ colors: { "#abc": "x" }, os: {} });
    expect(s.colors).toEqual({});
  });
});

describe("colorScore / osScore", () => {
  const s = parseScores({ colors: { "#008080": 48200 }, os: { "windows-95": 51000 } });
  it("looks up case-insensitively with 0 default", () => {
    expect(colorScore(s, "#008080")).toBe(48200);
    expect(colorScore(s, "#008080".toUpperCase())).toBe(48200);
    expect(colorScore(s, "#ffffff")).toBe(0);
    expect(osScore(s, "windows-95")).toBe(51000);
    expect(osScore(s, "beos")).toBe(0);
  });
});
