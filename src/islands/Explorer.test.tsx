import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { Explorer } from "./Explorer";
import type { ExplorerColor } from "../lib/explorer";

const colors: ExplorerColor[] = [
  { hex: "#008080", name: "Teal", family: "teal", tone: "dark", shade: "deep", h: 180, s: 100, l: 25, onColor: "#ffffff", score: 5000, scoreLabel: "5k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95?hex=%23008080" },
  { hex: "#ff0000", name: "Red", family: "red", tone: "bright", shade: "mid", h: 0, s: 100, l: 50, onColor: "#ffffff", score: 1000, scoreLabel: "1k", yearRange: "1995", primarySlug: "windows-95", href: "/os/windows-95?hex=%23ff0000" },
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
});
