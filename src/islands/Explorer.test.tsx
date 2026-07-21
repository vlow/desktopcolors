import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { Explorer } from "./Explorer";
import type { ExplorerColor, Platform, OsUniverse } from "../lib/explorer";

const colors: ExplorerColor[] = [
  { hex: "#008080", name: "Teal", family: "teal", types: ["cool"], h: 180, s: 100, l: 25, onColor: "#ffffff", score: 5000, scoreLabel: "5k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95/008080" },
  { hex: "#ff0000", name: "Red", family: "red", types: ["vivid", "neon", "jewel", "warm"], h: 0, s: 100, l: 50, onColor: "#ffffff", score: 1000, scoreLabel: "1k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95/ff0000" },
];
const styleBySlug = { "windows-95": "win9x" as const };
const platformsByHex: Record<string, Platform[]> = {
  "#008080": [
    { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
    { slug: "windows-98", name: "Windows 98", year: 1998, family: "Windows", isDefault: true },
  ],
  "#ff0000": [
    { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: false },
    { slug: "beos", name: "BeOS", year: 1998, family: "Be", isDefault: true },
  ],
};
const osUniverse: OsUniverse = {
  fams: [
    { name: "Windows", oses: [
      { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows" },
      { slug: "windows-98", name: "Windows 98", year: 1998, family: "Windows" },
    ] },
    { name: "Be", oses: [
      { slug: "beos", name: "BeOS", year: 1998, family: "Be" },
    ] },
  ],
};
const props = { colors, styleBySlug, platformsByHex, osUniverse };

describe("Explorer", () => {
  it("renders grouped bands by hue by default", () => {
    render(<Explorer {...props} />);
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).toContain("Reds");
  });

  it("filters to a family when its chip is clicked", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Teals/ }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).not.toContain("Reds");
  });

  it("switches to the leaderboard when Ungrouped is chosen", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Ungrouped" }));
    fireEvent.click(screen.getByRole("button", { name: "Popularity" }));
    // leaderboard ranks teal (5k) first
    const rows = screen.getAllByTestId("rank-row");
    expect(within(rows[0]).getByText("Teal")).toBeTruthy();
  });

  it("filters to a color type when its chip is clicked", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cool/ }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).not.toContain("Reds");
  });

  it("single-selects color types — picking another replaces the first", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cool/ }));
    let names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Teals"]); // cool → teal only
    fireEvent.click(screen.getByRole("button", { name: /^Warm/ }));
    names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Reds"]); // warm replaces cool → red only, not additive
  });

  it("shows contextual/total counts and disables zero-in-context type pills", () => {
    render(<Explorer {...props} />);
    // No filter yet: Cool's contextual count equals its total (1 teal), so a single number.
    expect(screen.getByRole("button", { name: /^Cool/ }).textContent).toContain("1");
    // Narrow to the Red family — the only cool color (teal) is now out of scope.
    fireEvent.click(screen.getByRole("button", { name: /Reds/ }));
    const cool = screen.getByRole("button", { name: /^Cool/ }) as HTMLButtonElement;
    expect(cool.disabled).toBe(true);            // C: zero-in-context pill is disabled
    expect(cool.textContent).toContain("0/1");   // B: contextual/total, 0 of 1
    const warm = screen.getByRole("button", { name: /^Warm/ }) as HTMLButtonElement;
    expect(warm.disabled).toBe(false);           // red is warm, so still selectable
  });

  it("opens an infobox when a swatch is clicked and closes it on a second click", () => {
    render(<Explorer {...props} />);
    const swatch = screen.getAllByTestId("explorer-swatch")[0];
    fireEvent.click(swatch);
    expect(screen.getByText("SHIPPED ON THESE PLATFORMS")).toBeTruthy();
    fireEvent.click(swatch);
    expect(screen.queryByText("SHIPPED ON THESE PLATFORMS")).toBeNull();
  });

  it("infobox platform chips link to the color detail page", () => {
    render(<Explorer {...props} />);
    // Click the Teal swatch specifically (rather than assuming DOM position):
    // bands render in FAMILY_DEFS order, which puts Reds before Teals, so
    // "the first swatch" is not Teal even though the fixture's teal href
    // targets 008080.
    const tealSwatch = screen.getAllByTestId("explorer-swatch").find((s) => s.textContent?.includes("Teal"))!;
    fireEvent.click(tealSwatch);
    const links = screen.getAllByTestId("infobox-platform") as HTMLAnchorElement[];
    expect(links.some((a) => a.getAttribute("href")?.endsWith("/008080"))).toBe(true);
  });

  it("ANY OS filter narrows results to colors on the picked OS", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    fireEvent.click(screen.getByRole("button", { name: "BeOS" }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Reds");   // red ships on beos
    expect(names).not.toContain("Teals"); // teal does not
  });

  it("ALL OS filter requires the color on every picked OS", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    fireEvent.click(screen.getByRole("button", { name: "ALL picked" }));
    fireEvent.click(screen.getByRole("button", { name: "Windows 95" }));
    fireEvent.click(screen.getByRole("button", { name: "Windows 98" }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");  // only teal is on both
    expect(names).not.toContain("Reds");
  });

  it("disables an impossible OS given the active family filter", () => {
    render(<Explorer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Reds/ }));       // family = red
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    // red ships only on windows-95 + beos, never windows-98 → disabled
    expect((screen.getByRole("button", { name: "Windows 98" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "BeOS" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
