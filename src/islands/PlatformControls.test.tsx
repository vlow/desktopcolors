import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { PlatformControls, type PlatformItem } from "./PlatformControls";

const items: PlatformItem[] = [
  { slug: "windows-95", name: "Windows 95", year: 1995, added: "2026-07-17", family: "Windows", defaultHex: "#008080", colorCount: 14, score: 48200, scoreLabel: "48.2k", altColors: [{ hex: "#000080", name: "Navy" }], href: "/os/windows-95", listColors: [{ hex: "#008080", name: "Teal" }, { hex: "#000080", name: "Navy" }] },
  { slug: "amiga-workbench", name: "Amiga Workbench", year: 1985, added: "2026-07-20", family: "Amiga", defaultHex: "#0055aa", colorCount: 5, score: 300, scoreLabel: "< 1k", altColors: [], href: "/os/amiga-workbench", listColors: [{ hex: "#0055aa", name: "Workbench Blue" }] },
];

describe("PlatformControls", () => {
  it("renders all platforms as links", () => {
    render(<PlatformControls items={items} />);
    expect(screen.getByRole("link", { name: /Windows 95/ })).toHaveAttribute("href", "/os/windows-95");
    expect(screen.getByText("Amiga Workbench")).toBeTruthy();
  });

  it("filters by query against name and color", () => {
    render(<PlatformControls items={items} />);
    fireEvent.input(screen.getByPlaceholderText(/Search/), { target: { value: "amiga" } });
    expect(screen.queryByText("Windows 95")).toBeNull();
    expect(screen.getByText("Amiga Workbench")).toBeTruthy();
  });

  it("shows an empty state when nothing matches", () => {
    render(<PlatformControls items={items} />);
    fireEvent.input(screen.getByPlaceholderText(/Search/), { target: { value: "zzzz" } });
    expect(screen.getByText(/No platforms or colors match/)).toBeTruthy();
  });

  it("sorts A–Z when chosen", () => {
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /A.Z/ }));
    const names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench");
  });

  it("toggles to list view and shows platform color strips", () => {
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    // list view renders a color swatch link to the color's detail URL
    const link = screen.getByRole("link", { name: /Teal swatch/ });
    expect(link).toHaveAttribute("href", "/os/windows-95/008080");
  });

  it("toggles back to card view", () => {
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cards/ }));
    // card view shows the "N colors" count label
    expect(screen.getAllByText(/colors$/).length).toBeGreaterThan(0);
  });

  it("sorts by newest added first, and reverses to oldest first", () => {
    render(<PlatformControls items={items} />);
    const newBtn = screen.getByRole("button", { name: /New/ });
    fireEvent.click(newBtn); // select → newest first
    let names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench"); // 2026-07-20 is newer than 2026-07-17
    fireEvent.click(newBtn); // click active → reverse → oldest first
    names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Windows 95");
  });

  it("keeps both the desktop View controls and the mobile Sort dropdown in the DOM", () => {
    render(<PlatformControls items={items} />);
    // Desktop inline controls
    expect(screen.getByRole("button", { name: /Cards/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /List/ })).toBeTruthy();
    // Mobile dropdown trigger (accessible name is "Sort: <current>")
    expect(screen.getByRole("button", { name: /^Sort:/ })).toBeTruthy();
  });

  it("sorts A–Z from the mobile Sort dropdown", () => {
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /A.Z/ }));
    const names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench");
  });

  it("reverses direction when the active sort is tapped in the dropdown", () => {
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    // "New" selects newest-first (Amiga 2026-07-20 before Windows 2026-07-17); menu closes
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /New/ }));
    let names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Amiga Workbench");
    // reopen the menu and tap the now-active "New" to reverse to oldest-first
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /New/ }));
    names = screen.getAllByTestId("os-name").map((n) => n.textContent);
    expect(names[0]).toBe("Windows 95");
  });

  it("forces Cards view on narrow viewports even when List is selected", () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    render(<PlatformControls items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    // Card view shows "N colors" count labels; list view does not.
    expect(screen.getAllByText(/colors$/).length).toBeGreaterThan(0);
    window.matchMedia = orig;
  });
});
