import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHsl, hexToHsl, onColor, relativeLuminance, rgbDistance,
  hexToOklab, oklabDistance, hueFamily, closestRal, closestRalDesign,
  rgbToCmyk, hexToCmyk, formatScore, hexToOklch, colorTypes,
} from "./color";

describe("hexToRgb", () => {
  it("parses lowercase and uppercase hex", () => {
    expect(hexToRgb("#008080")).toEqual([0, 128, 128]);
    expect(hexToRgb("#FF00FF")).toEqual([255, 0, 255]);
  });
});

describe("rgbToHsl", () => {
  it("computes teal", () => {
    expect(rgbToHsl(0, 128, 128)).toEqual([180, 100, 25]);
  });
  it("computes a neutral gray as 0 saturation", () => {
    const [, s] = rgbToHsl(128, 128, 128);
    expect(s).toBe(0);
  });
});

describe("hexToHsl", () => {
  it("chains hex -> rgb -> hsl", () => {
    expect(hexToHsl("#008080")).toEqual([180, 100, 25]);
  });
});

describe("onColor", () => {
  it("returns dark ink over a light color", () => {
    expect(onColor("#ece9d8")).toBe("#1c1917");
  });
  it("returns white over a dark color", () => {
    expect(onColor("#000080")).toBe("#ffffff");
  });
  // Bright, saturated hues sit at HSL lightness 50 but are perceptually bright,
  // so they need dark ink. The old lightness test wrongly gave them white.
  it("returns dark ink over bright/mid saturated hues (yellow/cyan/lime/red)", () => {
    expect(onColor("#ffff00")).toBe("#1c1917"); // yellow
    expect(onColor("#00ffff")).toBe("#1c1917"); // cyan
    expect(onColor("#00ff00")).toBe("#1c1917"); // lime
    expect(onColor("#ff0000")).toBe("#1c1917"); // red — black is the higher-contrast pick
  });
  it("keeps white over deep/dark hues", () => {
    expect(onColor("#008080")).toBe("#ffffff"); // teal
    expect(onColor("#000080")).toBe("#ffffff"); // navy
    expect(onColor("#0000ff")).toBe("#ffffff"); // blue
    expect(onColor("#800000")).toBe("#ffffff"); // maroon
  });
  it("picks the higher-contrast ink, never the lower one", () => {
    for (const hex of ["#ffff00", "#00ffff", "#808080", "#008080", "#000000", "#ffffff"]) {
      const L = relativeLuminance(hex);
      const cr = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const chosen = onColor(hex);
      const cDark = cr(L, relativeLuminance("#1c1917"));
      const cLight = cr(L, relativeLuminance("#ffffff"));
      expect(chosen).toBe(cDark >= cLight ? "#1c1917" : "#ffffff");
    }
  });
});

describe("rgbDistance", () => {
  it("is zero for identical colors", () => {
    expect(rgbDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it("is euclidean", () => {
    expect(rgbDistance([0, 0, 0], [0, 3, 4])).toBe(5);
  });
});

describe("hexToOklab / oklabDistance", () => {
  it("maps black to L≈0 and white to L≈1", () => {
    const [lb] = hexToOklab("#000000");
    const [lw] = hexToOklab("#ffffff");
    expect(lb).toBeCloseTo(0, 3);
    expect(lw).toBeCloseTo(1, 2);
  });
  it("is zero for identical colors and positive otherwise", () => {
    expect(oklabDistance(hexToOklab("#008080"), hexToOklab("#008080"))).toBe(0);
    expect(oklabDistance(hexToOklab("#000000"), hexToOklab("#ffffff"))).toBeGreaterThan(0.9);
  });
});

describe("hueFamily", () => {
  it("classifies low saturation as achromatic", () => {
    expect(hueFamily(200, 5)).toBe("achromatic");
  });
  it("classifies teal hue", () => {
    expect(hueFamily(180, 100)).toBe("teal");
  });
  it("wraps reds past 345", () => {
    expect(hueFamily(350, 80)).toBe("red");
  });
  it("classifies blue", () => {
    expect(hueFamily(215, 50)).toBe("blue");
  });
});

describe("closestRal", () => {
  it("matches a near-black to Jet black (RAL 9005)", () => {
    expect(closestRal("#050505").code).toBe("RAL 9005");
  });
  it("matches a near-traffic-yellow to RAL 1023", () => {
    expect(closestRal("#f7b400").code).toBe("RAL 1023");
  });
});

describe("rgbToCmyk / hexToCmyk", () => {
  it("returns pure K for black without dividing by zero", () => {
    expect(rgbToCmyk(0, 0, 0)).toEqual([0, 0, 0, 100]);
    expect(hexToCmyk("#000000")).toEqual([0, 0, 0, 100]);
  });
  it("returns all zeros for white", () => {
    expect(hexToCmyk("#ffffff")).toEqual([0, 0, 0, 0]);
  });
  it("converts a pure primary (red)", () => {
    expect(rgbToCmyk(255, 0, 0)).toEqual([0, 100, 100, 0]);
  });
  it("converts teal (#008080)", () => {
    expect(hexToCmyk("#008080")).toEqual([100, 0, 0, 50]);
  });
});

describe("closestRalDesign", () => {
  it("matches a near-black to a dark RAL Design+ color", () => {
    const m = closestRalDesign("#212122");
    expect(m.code).toBe("RAL 000 15 00");
    expect(m.name).toBe("Ink Black");
  });
  it("returns a valid RAL Design+ code for an arbitrary color", () => {
    expect(closestRalDesign("#008080").code).toMatch(/^RAL \d{3} \d{2} \d{2}$/);
  });
});

describe("formatScore", () => {
  it("shows < 1k below 1000", () => {
    expect(formatScore(0)).toBe("< 1k");
    expect(formatScore(999)).toBe("< 1k");
  });
  it("formats thousands with one decimal, trimming .0", () => {
    expect(formatScore(1000)).toBe("1k");
    expect(formatScore(1200)).toBe("1.2k");
    expect(formatScore(48200)).toBe("48.2k");
  });
});

describe("hexToOklch", () => {
  it("maps pure red to its OKLCH coordinates", () => {
    const { L, C, H } = hexToOklch("#ff0000");
    expect(L).toBeCloseTo(0.628, 2);
    expect(C).toBeCloseTo(0.258, 2);
    expect(H).toBeCloseTo(29.2, 0);
  });
  it("maps blue with a hue in [0,360)", () => {
    const { H } = hexToOklch("#0000ff");
    expect(H).toBeCloseTo(264.1, 0);
    expect(H).toBeGreaterThanOrEqual(0);
    expect(H).toBeLessThan(360);
  });
  it("gives gray near-zero chroma", () => {
    expect(hexToOklch("#808080").C).toBeLessThan(0.02);
  });
});

describe("colorTypes", () => {
  it("tags a gray as the neutral type and neither warm nor cool", () => {
    const t = colorTypes("#808080");
    expect(t).toContain("neutral");
    expect(t).not.toContain("warm");
    expect(t).not.toContain("cool");
    expect(t).not.toContain("vivid");
  });
  it("tags a light gray as light too", () => {
    expect(colorTypes("#e0e0e0")).toEqual(
      expect.arrayContaining(["neutral", "light"]));
  });
  it("tags pure red as vivid + neon + warm", () => {
    expect(colorTypes("#ff0000")).toEqual(
      expect.arrayContaining(["vivid", "neon", "warm"]));
  });
  it("tags navy as dark + vivid + cool", () => {
    expect(colorTypes("#000080")).toEqual(
      expect.arrayContaining(["dark", "vivid", "cool"]));
  });
  it("tags a tan as earth + muted + warm", () => {
    expect(colorTypes("#a67b5b")).toEqual(
      expect.arrayContaining(["earth", "muted", "warm"]));
  });
  it("tags dark-olive as earth (hue ceiling reaches 130)", () => {
    expect(colorTypes("#556b2f")).toContain("earth");
  });
  it("tags a soft blue tint with multiple labels incl. pastel + light + cool", () => {
    expect(colorTypes("#b7c9e8")).toEqual(
      expect.arrayContaining(["pastel", "light", "cool"]));
  });
  it("does NOT tag fully-saturated cyan as pastel (chroma cap excludes vivid lights)", () => {
    // #00ffff is electric cyan (C≈0.155); with the 0.10 chroma cap it is light+cool, not pastel.
    expect(colorTypes("#00ffff")).not.toContain("pastel");
  });
  it("treats hues >= 340 as warm (crimson/pink wrap)", () => {
    expect(colorTypes("#ff1493")).toContain("warm");
  });
  it("treats magenta (~328) as cool, not warm", () => {
    const t = colorTypes("#ff00ff");
    expect(t).toContain("cool");
    expect(t).not.toContain("warm");
  });
  it("never returns an empty tag list for a range of colors", () => {
    for (const hex of ["#000000", "#ffffff", "#808080", "#ff0000", "#00ff00",
      "#0000ff", "#556b2f", "#a67b5b", "#c9b6e8", "#008080"]) {
      expect(colorTypes(hex).length).toBeGreaterThan(0);
    }
  });
});
