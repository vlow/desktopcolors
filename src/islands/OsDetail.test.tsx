import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { renderToString } from "preact-render-to-string";
import { OsDetail } from "./OsDetail";
import type { OsDetailView } from "../lib/detail";

const view: OsDetailView = {
  os: {
    slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows",
    tagline: "t", description: "The teal era.", desktopStyle: "win9x",
    defaultHex: "#008080", colorCount: 2, score: 0, scoreLabel: "< 1k",
    predecessor: null, successor: { slug: "windows-98", name: "Windows 98", year: 1998 },
    colors: [],
  },
  colors: [
    { hex: "#008080", name: "Teal", index: "3", note: "default", isDefault: true, rgb: "0, 128, 128", hsl: "180° 100% 25%", onColor: "#ffffff", family: "teal", tone: "dark", shade: "deep", score: 0, scoreLabel: "< 1k", ral: { code: "RAL 5021", name: "Water Blue", hex: "#07737a" }, similar: [{ hex: "#4e9a9a", name: "Teal", osSlug: "kde-1", osName: "KDE 1", match: 88, onColor: "#ffffff", href: "/os/kde-1/4e9a9a" }], firstUse: { slug: "cde", name: "CDE", year: 1993, self: false, href: "/os/cde" } },
    { hex: "#000080", name: "Navy", index: "1", note: "cool", isDefault: false, rgb: "0, 0, 128", hsl: "240° 100% 25%", onColor: "#ffffff", family: "blue", tone: "dark", shade: "deep", score: 0, scoreLabel: "< 1k", ral: { code: "RAL 5002", name: "Ultramarine", hex: "#20214f" }, similar: [], firstUse: { slug: "windows-95", name: "Windows 95", year: 1995, self: true, href: "/os/windows-95" } },
  ],
  eraPeers: [{ slug: "cde", name: "CDE", family: "Desktop Env.", year: 1993, hex: "#9aabb9", colorName: "Dusty Blue", rel: "2 yr earlier", onColor: "#1c1917", href: "/os/cde" }],
};

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("OsDetail", () => {
  it("shows the OS name and default-selected color values", () => {
    render(<OsDetail view={view} initialHex={null} />);
    expect(screen.getByRole("heading", { name: "Windows 95" })).toBeTruthy();
    expect(screen.getAllByText("0, 128, 128").length).toBeGreaterThan(0); // teal RGB (default)
  });

  it("preselects the color from initialHex", () => {
    render(<OsDetail view={view} initialHex="#000080" />);
    expect(screen.getAllByText("0, 0, 128").length).toBeGreaterThan(0); // navy RGB
  });

  it("bakes the selected color into the server HTML (no client flash)", () => {
    // The static build renders this markup; it is what the browser paints before
    // any JS runs. The correct color must already be highlighted here, not fixed
    // up later on the client.
    const html = renderToString(<OsDetail view={view} initialHex="#000080" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    const highlighted = Array.from(container.querySelectorAll("div"))
      .filter((d) => (d.getAttribute("style") || "").includes("oklch(0.96 0.03 255)"))
      .map((d) => d.textContent || "");
    expect(highlighted.length).toBe(1);
    expect(highlighted[0]).toContain("Navy");
    expect(highlighted[0]).not.toContain("Teal");
  });

  it("switches the selected color on click", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByText("Navy"));
    expect(screen.getAllByText("0, 0, 128").length).toBeGreaterThan(0);
  });

  it("reflects the selected color in the URL when the selection changes", () => {
    window.history.replaceState({}, "", "/os/windows-95");
    try {
      render(<OsDetail view={view} initialHex={null} />);
      // Mount must not rewrite the entry URL (default page stays canonical).
      expect(window.location.pathname).toBe("/os/windows-95");
      // Changing the selection updates the URL so it can be copied/shared.
      fireEvent.click(screen.getByText("Navy"));
      expect(window.location.pathname).toBe("/os/windows-95/000080");
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });

  it("copies the hex value on click of the HEX row", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByTestId("copy-hex"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("#008080");
  });

  it("opens the download sheet", () => {
    render(<OsDetail view={view} initialHex={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(screen.getByText(/Download Teal/)).toBeTruthy();
  });

  it("renders similar colors and era peers", () => {
    render(<OsDetail view={view} initialHex={null} />);
    expect(screen.getByText(/Similar colors elsewhere/)).toBeTruthy();
    const era = screen.getByText(/Colors of the same era/);
    expect(era).toBeTruthy();
    expect(screen.getByText("CDE")).toBeTruthy();
  });
});
