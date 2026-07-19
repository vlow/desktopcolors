import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { Explorer } from "./Explorer";
import type { ExplorerColor } from "../lib/explorer";

const colors: ExplorerColor[] = [
  { hex: "#008080", name: "Teal", family: "teal", types: ["cool"], h: 180, s: 100, l: 25, onColor: "#ffffff", score: 5000, scoreLabel: "5k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95/008080" },
  { hex: "#ff0000", name: "Red", family: "red", types: ["vivid", "neon", "jewel", "warm"], h: 0, s: 100, l: 50, onColor: "#ffffff", score: 1000, scoreLabel: "1k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95/ff0000" },
];
const styleBySlug = { "windows-95": "win9x" as const };

describe("Explorer", () => {
  it("renders grouped bands by hue by default", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).toContain("Reds");
  });

  it("filters to a family when its chip is clicked", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    fireEvent.click(screen.getByRole("button", { name: /Teals/ }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).not.toContain("Reds");
  });

  it("switches to the leaderboard when Ungrouped is chosen", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    fireEvent.click(screen.getByRole("button", { name: "Ungrouped" }));
    fireEvent.click(screen.getByRole("button", { name: "Popularity" }));
    // leaderboard ranks teal (5k) first
    const rows = screen.getAllByTestId("rank-row");
    expect(within(rows[0]).getByText("Teal")).toBeTruthy();
  });

  it("filters to a color type when its chip is clicked", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cool/ }));
    const names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toContain("Teals");
    expect(names).not.toContain("Reds");
  });

  it("single-selects color types — picking another replaces the first", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cool/ }));
    let names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Teals"]); // cool → teal only
    fireEvent.click(screen.getByRole("button", { name: /^Warm/ }));
    names = screen.getAllByTestId("band-name").map((n) => n.textContent);
    expect(names).toEqual(["Reds"]); // warm replaces cool → red only, not additive
  });

  it("shows contextual/total counts and disables zero-in-context type pills", () => {
    render(<Explorer colors={colors} styleBySlug={styleBySlug} />);
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
});
