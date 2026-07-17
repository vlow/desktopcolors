import { describe, it, expect } from "vitest";
import { RAL_CLASSIC } from "./ral";

describe("RAL_CLASSIC dataset", () => {
  it("has the full classic set", () => {
    // The authoritative CSV (lunohodov/1995178) currently contains 216 entries.
    // The task brief cited 213 (an older count); 216 is the actual dataset size.
    expect(RAL_CLASSIC.length).toBe(216);
  });

  it("every entry is well-formed", () => {
    for (const r of RAL_CLASSIC) {
      expect(r.code).toMatch(/^RAL \d{4}$/);
      expect(r.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(r.name.length).toBeGreaterThan(0);
    }
  });

  it("matches known anchor colors", () => {
    const by = (code: string) => RAL_CLASSIC.find((r) => r.code === code);
    expect(by("RAL 9005")?.hex).toBe("#0e0e10");
    expect(by("RAL 5015")?.hex).toBe("#007caf");
    expect(by("RAL 6027")?.hex).toBe("#7ebab5");
    expect(by("RAL 1023")?.hex).toBe("#f7b500");
  });
});
