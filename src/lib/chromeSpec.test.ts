import { describe, it, expect } from "vitest";
import { ChromeSpec, CHROME_SPECS } from "./chromeSpec";
import { DESKTOP_STYLES } from "./desktopStyle";

describe("ChromeSpec schema", () => {
  it("accepts a well-formed spec", () => {
    const spec = [
      { part: "deskIcons", side: "left", icons: [{ kind: "computer", label: "My Computer" }] },
      { part: "window", left: 28, top: 8, w: 54, body: { kind: "gridIcons", icons: ["drive", "folder"], cols: 3 } },
      { part: "taskbar" },
    ];
    expect(() => ChromeSpec.parse(spec)).not.toThrow();
  });

  it("rejects an unknown part", () => {
    expect(() => ChromeSpec.parse([{ part: "wormhole" }])).toThrow();
  });

  it("rejects an unknown icon kind", () => {
    expect(() => ChromeSpec.parse([{ part: "deskIcons", side: "left", icons: [{ kind: "nope", label: "x" }] }])).toThrow();
  });

  it("rejects a window with a non-positive width", () => {
    expect(() => ChromeSpec.parse([{ part: "window", left: 0, top: 0, w: 0, body: { kind: "rows", widths: [50] } }])).toThrow();
  });

  it("rejects empty icon arrays", () => {
    expect(() => ChromeSpec.parse([{ part: "deskIcons", side: "left", icons: [] }])).toThrow();
  });
});

describe("CHROME_SPECS", () => {
  it("every style has a valid spec or null (modern)", () => {
    for (const style of DESKTOP_STYLES) {
      const spec = CHROME_SPECS[style];
      if (spec === null) {
        expect(style).toBe("modern");
      } else {
        expect(() => ChromeSpec.parse(spec)).not.toThrow();
        expect(spec.length).toBeGreaterThan(0);
      }
    }
  });
});
