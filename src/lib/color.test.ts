import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHsl, hexToHsl, onColor, rgbDistance,
  hexToOklab, oklabDistance, hueFamily, tone, shade, closestRal, closestRalDesign,
  rgbToCmyk, hexToCmyk, formatScore,
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
  it("classifies low saturation as neutral", () => {
    expect(hueFamily(200, 5)).toBe("neutral");
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

describe("tone", () => {
  it("classifies very dark as dark", () => {
    expect(tone(240, 100, 25)).toBe("dark");
  });
  it("classifies high-sat mid-light as neon", () => {
    expect(tone(180, 90, 55)).toBe("neon");
  });
  it("classifies light low-sat as pastel", () => {
    expect(tone(240, 40, 80)).toBe("pastel");
  });
});

describe("shade", () => {
  it("buckets lightness", () => {
    expect(shade(20)).toBe("deep");
    expect(shade(40)).toBe("mid");
    expect(shade(60)).toBe("light");
    expect(shade(90)).toBe("pale");
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
