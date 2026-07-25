import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { Colors } from "./Colors";
import type { ColorEntry, Platform, OsUniverse } from "../lib/colorCatalog";

const colors: ColorEntry[] = [
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

describe("Colors", () => {
  it("renders grouped bands by hue by default", () => {
    render(<Colors {...props} />);
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).toContain("Reds");
  });

  it("filters to a family when its chip is clicked", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Teals/ }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).not.toContain("Reds");
  });

  it("switches to the leaderboard when Ungrouped is chosen", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Ungrouped" }));
    fireEvent.click(screen.getByRole("button", { name: "Popularity" }));
    // leaderboard ranks teal (5k) first
    const rows = screen.getAllByTestId("rank-row");
    expect(within(rows[0]).getByText("Teal")).toBeTruthy();
  });

  it("filters to a color type when its chip is clicked", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cool/ }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).not.toContain("Reds");
  });

  it("single-selects color types — picking another replaces the first", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cool/ }));
    let names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Teals"]); // cool → teal only
    fireEvent.click(screen.getByRole("button", { name: /^Warm/ }));
    names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Reds"]); // warm replaces cool → red only, not additive
  });

  it("shows contextual/total counts and disables zero-in-context type pills", () => {
    render(<Colors {...props} />);
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
    render(<Colors {...props} />);
    const swatch = screen.getAllByTestId("colors-swatch")[0];
    fireEvent.click(swatch);
    expect(screen.getByText("SHIPPED ON THESE PLATFORMS")).toBeTruthy();
    fireEvent.click(swatch);
    expect(screen.queryByText("SHIPPED ON THESE PLATFORMS")).toBeNull();
  });

  it("infobox platform chips link to the color detail page", () => {
    render(<Colors {...props} />);
    // Click the Teal swatch specifically (rather than assuming DOM position):
    // bands render in FAMILY_DEFS order, which puts Reds before Teals, so
    // "the first swatch" is not Teal even though the fixture's teal href
    // targets 008080.
    const tealSwatch = screen.getAllByTestId("colors-swatch").find((s) => s.textContent?.includes("Teal"))!;
    fireEvent.click(tealSwatch);
    const links = screen.getAllByTestId("infobox-platform") as HTMLAnchorElement[];
    expect(links.some((a) => a.getAttribute("href")?.endsWith("/008080"))).toBe(true);
  });

  it("ANY OS filter narrows results to colors on the picked OS", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    fireEvent.click(screen.getByRole("button", { name: "BeOS" }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Reds");   // red ships on beos
    expect(names).not.toContain("Teals"); // teal does not
  });

  it("ALL OS filter requires the color on every picked OS", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    fireEvent.click(screen.getByRole("button", { name: "ALL picked" }));
    fireEvent.click(screen.getByRole("button", { name: "Windows 95" }));
    fireEvent.click(screen.getByRole("button", { name: "Windows 98" }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");  // only teal is on both
    expect(names).not.toContain("Reds");
  });

  it("disables an impossible OS given the active family filter", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Reds/ }));       // family = red
    fireEvent.click(screen.getByRole("button", { name: /Filter by OS/ }));
    // red ships only on windows-95 + beos, never windows-98 → disabled
    expect((screen.getByRole("button", { name: "Windows 98" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "BeOS" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("search narrows the bands by name/hex/year/color", () => {
    render(<Colors {...props} />);
    const box = screen.getByPlaceholderText(/Search colors/i);
    fireEvent.input(box, { target: { value: "teal" } });
    let names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Teals"]);            // by color name
    fireEvent.input(box, { target: { value: "#ff0000" } });
    names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Reds"]);             // by hex
  });

  it("shows an empty state when nothing matches the search", () => {
    render(<Colors {...props} />);
    fireEvent.input(screen.getByPlaceholderText(/Search colors/i), { target: { value: "zzzznope" } });
    expect(screen.queryAllByTestId("band-name")).toHaveLength(0);
    expect(screen.getByText(/No colors match/i)).toBeTruthy();
  });

  it("clears the search with the clear button", () => {
    render(<Colors {...props} />);
    const box = screen.getByPlaceholderText(/Search colors/i) as HTMLInputElement;
    fireEvent.input(box, { target: { value: "teal" } });
    expect(screen.getAllByTestId("band-name").map((n) => n.textContent)).toEqual(["Teals"]);
    fireEvent.click(screen.getByRole("button", { name: /Clear search/i }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).toContain("Reds");             // both back after clearing
  });

  it("ungrouped rows are keyboard-operable (role=button, tabindex, Enter toggles)", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Ungrouped" }));
    const row = screen.getAllByTestId("rank-row")[0];
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(screen.getByText("SHIPPED ON THESE PLATFORMS")).toBeTruthy();
    expect(screen.getAllByTestId("rank-row")[0].getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps both the desktop segmented controls and the mobile dropdowns in the DOM", () => {
    render(<Colors {...props} />);
    expect(screen.getByRole("button", { name: "Ungrouped" })).toBeTruthy(); // desktop group
    expect(screen.getByRole("button", { name: "Popularity" })).toBeTruthy(); // desktop sort
    expect(screen.getByRole("button", { name: /^Group:/ })).toBeTruthy();   // mobile group trigger
    expect(screen.getByRole("button", { name: /^Sort:/ })).toBeTruthy();    // mobile sort trigger
  });

  it("switches to the leaderboard from the mobile Group and Sort dropdowns", () => {
    render(<Colors {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Group:/ }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Ungrouped" }));
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Popularity" }));
    const rows = screen.getAllByTestId("rank-row");
    expect(within(rows[0]).getByText("Teal")).toBeTruthy();
  });
});
