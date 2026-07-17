import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { BrowseControls, type BrowseItem } from "./BrowseControls";

const items: BrowseItem[] = [
  { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", tagline: "Teal era", defaultHex: "#008080", colorCount: 14, score: 48200, scoreLabel: "48.2k", altColors: [{ hex: "#000080", name: "Navy" }], href: "/os/windows-95" },
  { slug: "amiga-workbench", name: "Amiga Workbench", year: 1985, family: "Amiga", tagline: "Four-color glory", defaultHex: "#0055aa", colorCount: 5, score: 300, scoreLabel: "< 1k", altColors: [], href: "/os/amiga-workbench" },
];

describe("BrowseControls", () => {
  it("renders all platforms as links", () => {
    render(<BrowseControls items={items} />);
    expect(screen.getByRole("link", { name: /Windows 95/ })).toHaveAttribute("href", "/os/windows-95");
    expect(screen.getByText("Amiga Workbench")).toBeTruthy();
  });

  it("filters by query against name and color", () => {
    render(<BrowseControls items={items} />);
    fireEvent.input(screen.getByPlaceholderText(/Search/), { target: { value: "amiga" } });
    expect(screen.queryByText("Windows 95")).toBeNull();
    expect(screen.getByText("Amiga Workbench")).toBeTruthy();
  });

  it("shows an empty state when nothing matches", () => {
    render(<BrowseControls items={items} />);
    fireEvent.input(screen.getByPlaceholderText(/Search/), { target: { value: "zzzz" } });
    expect(screen.getByText(/No platforms or colors match/)).toBeTruthy();
  });

  it("sorts A–Z when chosen", () => {
    render(<BrowseControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /A.Z/ }));
    const names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench");
  });
});
