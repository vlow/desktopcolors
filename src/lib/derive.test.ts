import { describe, it, expect } from "vitest";
import {
  defaultColor, mergeColorsByHex, similarColors, eraPeers, firstKnownUse,
  type OsEntry,
} from "./derive";
import type { OsInput } from "../content/config";

const os = (over: Partial<OsInput> & { colors: OsInput["colors"] }): OsInput => ({
  name: "X", year: 2000, family: "Fam", tagline: "t", description: "d",
  desktopStyle: "generic", ...over,
});

const entries: OsEntry[] = [
  { slug: "win-95", data: os({ name: "Windows 95", year: 1995, colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "", default: true },
    { hex: "#000080", name: "Navy", index: "1", note: "", default: false },
  ] }) },
  { slug: "cde", data: os({ name: "CDE", year: 1993, colors: [
    { hex: "#9aabb9", name: "Dusty Blue", index: "—", note: "", default: true },
    { hex: "#008080", name: "Teal", index: "—", note: "", default: false },
  ] }) },
  { slug: "kde-2", data: os({ name: "KDE 2", year: 2000, colors: [
    { hex: "#5a7ea5", name: "Blue", index: "—", note: "", default: true },
  ] }) },
];

describe("defaultColor", () => {
  it("returns the default-flagged color", () => {
    expect(defaultColor(entries[0].data).name).toBe("Teal");
  });
  it("falls back to the first color", () => {
    const d = os({ colors: [{ hex: "#111111", name: "A", index: "—", note: "", default: false }] });
    expect(defaultColor(d).name).toBe("A");
  });
});

describe("mergeColorsByHex", () => {
  const merged = mergeColorsByHex(entries);
  it("groups the shared teal across platforms", () => {
    const teal = merged.find((m) => m.hex === "#008080")!;
    expect(teal.platforms.map((p) => p.slug).sort()).toEqual(["cde", "win-95"]);
    expect(teal.yearRange).toBe("1993–1995");
  });
  it("uses a single year when the range collapses", () => {
    const blue = merged.find((m) => m.hex === "#5a7ea5")!;
    expect(blue.yearRange).toBe("2000");
  });
});

describe("similarColors", () => {
  it("excludes the source platform and ranks by distance", () => {
    const sims = similarColors("#008080", entries, "win-95", 5);
    expect(sims.every((s) => s.osSlug !== "win-95")).toBe(true);
    expect(sims[0].osSlug).toBe("cde"); // exact teal match in CDE
    expect(sims[0].match).toBe(100);
  });
});

describe("eraPeers", () => {
  it("returns platforms within the window, excluding self", () => {
    const peers = eraPeers(entries[0], entries, 3); // Windows 95 (1995), window 3 -> 1992..1998
    expect(peers.map((p) => p.slug)).toContain("cde");
    expect(peers.some((p) => p.slug === "win-95")).toBe(false);
  });
  it("labels relative years", () => {
    const peers = eraPeers(entries[0], entries, 3);
    const cde = peers.find((p) => p.slug === "cde")!;
    expect(cde.rel).toBe("2 yr earlier");
  });
});

describe("firstKnownUse", () => {
  it("finds the earliest platform shipping the hex", () => {
    expect(firstKnownUse("#008080", entries).slug).toBe("cde"); // 1993 < 1995
  });
});
