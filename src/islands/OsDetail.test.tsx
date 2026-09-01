import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { renderToString } from "preact-render-to-string";
import { OsDetail, centerScrollTop } from "./OsDetail";
import type { OsView, EraPeerView, ColorDetail } from "../lib/detail";

const os: OsView = {
  slug: "windows-95", name: "Windows 95", year: 1995, added: "2000-01-01", family: "Windows",
  description: "The teal era.", desktopStyle: "win9x",
  defaultHex: "#008080", colorCount: 2, score: 0, scoreLabel: "< 1k",
  type: "Proprietary", links: [], wikipedia: "https://en.wikipedia.org/wiki/Windows_95",
  predecessor: null, successor: { slug: "windows-98", name: "Windows 98", year: 1998 },
  colors: [
    { hex: "#008080", name: "Teal", note: "default", isDefault: true, rgb: "0, 128, 128", hsl: "180° 100% 25%", cmyk: "100% 0% 0% 50%", onColor: "#ffffff", family: "teal", types: ["cool"], score: 0, scoreLabel: "< 1k" },
    { hex: "#000080", name: "Navy", note: "cool", isDefault: false, rgb: "0, 0, 128", hsl: "240° 100% 25%", cmyk: "100% 100% 0% 50%", onColor: "#ffffff", family: "blue", types: ["dark", "vivid", "cool"], score: 0, scoreLabel: "< 1k" },
  ],
};

const eraPeers: EraPeerView[] = [
  { slug: "cde", name: "CDE", family: "Desktop Env.", year: 1993, hex: "#9aabb9", colorName: "Dusty Blue", rel: "2 yr earlier", onColor: "#1c1917", href: "/os/cde", metaLine: "1993 · Desktop Env." },
];

const detailsByHex: Record<string, ColorDetail> = {
  "#008080": {
    ral: { code: "RAL 5021", name: "Water Blue", hex: "#07737a" },
    ralDesign: { code: "RAL 190 40 20", name: "Deep Sea", hex: "#0d7c7d" },
    extraFormats: [
      { key: "lab", label: "CIELAB", value: "45.2, -20.1, -5.3", copy: "lab(45.2% -20.1 -5.3)" },
      { key: "lch", label: "LCH", value: "45.2, 20.8, 194.8", copy: "lch(45.2% 20.8 194.8)" },
      { key: "oklab", label: "OKLab", value: "0.500, -0.080, -0.020", copy: "oklab(0.500 -0.080 -0.020)" },
      { key: "oklch", label: "OKLCH", value: "0.500, 0.082, 194.0", copy: "oklch(0.500 0.082 194.0)" },
      { key: "ral", label: "Closest RAL Classic", value: "RAL 5021 · Water Blue", copy: "RAL 5021 · Water Blue", swatch: "#07737a" },
      { key: "ralDesign", label: "Closest RAL Design+", value: "RAL 190 40 20 · Deep Sea", copy: "RAL 190 40 20 · Deep Sea", swatch: "#0d7c7d" },
    ],
    similar: [
      { hex: "#4e9a9a", name: "Teal", match: 88, onColor: "#ffffff", h: 178, s: 33, l: 44, primarySlug: "kde-1", style: "generic", platforms: [{ slug: "kde-1", name: "KDE 1", year: 1998, family: "KDE", isDefault: true }] },
      { hex: "#3a8f8f", name: "Pine", match: 82, onColor: "#ffffff", h: 180, s: 42, l: 40, primarySlug: "beos", style: "generic", platforms: [{ slug: "beos", name: "BeOS", year: 1998, family: "BeOS", isDefault: true }] },
    ],
    uses: [
      { slug: "cde", name: "CDE", year: 1993, family: "Desktop Env.", isDefault: false },
      { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
    ],
  },
  "#000080": {
    ral: { code: "RAL 5002", name: "Ultramarine", hex: "#20214f" },
    ralDesign: { code: "RAL 280 20 30", name: "Ink Blue", hex: "#1e2159" },
    extraFormats: [
      { key: "lab", label: "CIELAB", value: "12.5, 30.1, -60.2", copy: "lab(12.5% 30.1 -60.2)" },
      { key: "lch", label: "LCH", value: "12.5, 67.3, 296.5", copy: "lch(12.5% 67.3 296.5)" },
      { key: "oklab", label: "OKLab", value: "0.230, 0.020, -0.130", copy: "oklab(0.230 0.020 -0.130)" },
      { key: "oklch", label: "OKLCH", value: "0.230, 0.131, 278.0", copy: "oklch(0.230 0.131 278.0)" },
      { key: "ral", label: "Closest RAL Classic", value: "RAL 5002 · Ultramarine", copy: "RAL 5002 · Ultramarine", swatch: "#20214f" },
      { key: "ralDesign", label: "Closest RAL Design+", value: "RAL 280 20 30 · Ink Blue", copy: "RAL 280 20 30 · Ink Blue", swatch: "#1e2159" },
    ],
    similar: [],
    uses: [{ slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: false }],
  },
};

const baseProps = { os, eraPeers, detailsByHex };

// An entry with more references than the two special-cased fields, for the
// References-row tests. Expected order: project, then `links` in file order,
// then Wikipedia.
const withLinks: OsView = {
  ...os,
  project: { name: "Project Site", url: "https://example.org/" },
  links: [
    { name: "First", url: "https://example.com/first" },
    { name: "Second", url: "https://example.com/second" },
    { name: "Third", url: "https://example.com/third" },
  ],
};
const EXPECTED_REF_HREFS = [
  "https://example.org/",
  "https://example.com/first",
  "https://example.com/second",
  "https://example.com/third",
  "https://en.wikipedia.org/wiki/Windows_95",
];

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("OsDetail", () => {
  it("shows the OS name and default-selected color values", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByRole("heading", { name: "Windows 95" })).toBeTruthy();
    expect(screen.getAllByText("0, 128, 128").length).toBeGreaterThan(0); // teal RGB (default)
  });

  it("preselects the color from initialHex", () => {
    render(<OsDetail {...baseProps} initialHex="#000080" viewUrl={null} />);
    expect(screen.getAllByText("0, 0, 128").length).toBeGreaterThan(0); // navy RGB
  });

  it("bakes the selected color into the server HTML (no client flash)", () => {
    // The static build renders this markup; it is what the browser paints before
    // any JS runs. The correct color must already be highlighted here, not fixed
    // up later on the client.
    const html = renderToString(<OsDetail {...baseProps} initialHex="#000080" viewUrl={null} />);
    const container = document.createElement("div");
    container.innerHTML = html;
    const highlighted = Array.from(container.querySelectorAll('[aria-current="true"]'))
      .map((d) => d.textContent || "");
    expect(highlighted.length).toBe(1);
    expect(highlighted[0]).toContain("Navy");
    expect(highlighted[0]).not.toContain("Teal");
  });

  it("selects the default color, not the first listed, when no color is deep-linked", () => {
    // Default deliberately placed AFTER a non-default color — mirrors the real
    // Windows 95 palette, where Teal is well down the list rather than first.
    const reordered = { ...baseProps, os: { ...os, colors: [os.colors[1], os.colors[0]] } };
    const html = renderToString(<OsDetail {...reordered} initialHex={null} viewUrl={null} />);
    const container = document.createElement("div");
    container.innerHTML = html;
    const highlighted = Array.from(container.querySelectorAll('[aria-current="true"]'))
      .map((d) => d.textContent || "");
    expect(highlighted.length).toBe(1);
    expect(highlighted[0]).toContain("Teal");
    expect(highlighted[0]).not.toContain("Navy");
  });

  it("switches the selected color on click", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByText("Navy"));
    expect(screen.getAllByText("0, 0, 128").length).toBeGreaterThan(0);
  });

  it("reflects the selected color in the URL when the selection changes", () => {
    window.history.replaceState({}, "", "/os/windows-95");
    try {
      render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
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
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByTestId("copy-hex"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("#008080");
  });

  it("shows CMYK directly and both RAL matches behind the extended formats toggle", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText("CMYK")).toBeTruthy();
    expect(screen.getByText("100% 0% 0% 50%")).toBeTruthy();
    expect(screen.queryByText("Closest RAL Classic")).toBeNull();
    fireEvent.click(screen.getByText(/View all .* formats/));
    expect(screen.getByText("Closest RAL Classic")).toBeTruthy();
    expect(screen.getByText("Closest RAL Design+")).toBeTruthy();
    expect(screen.getByText(/RAL 190 40 20 · Deep Sea/)).toBeTruthy();
    expect(screen.queryByText("Closest RAL")).toBeNull();
  });

  it("copies CMYK as a cmyk() string on click of the CMYK row", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByTestId("copy-cmyk"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("cmyk(100%, 0%, 0%, 50%)");
  });

  it("opens the download sheet", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(screen.getByText(/Download Teal/)).toBeTruthy();
  });

  it("renders similar colors and era peers", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText(/Similar colors elsewhere/)).toBeTruthy();
    const era = screen.getByText(/Colors of the same era/);
    expect(era).toBeTruthy();
    // "CDE" also appears in the KnownUsesTimeline's "First in <CDE>, 1993" text,
    // so assert presence rather than uniqueness.
    expect(screen.getAllByText("CDE").length).toBeGreaterThan(0);
  });

  it("labels the preview header with a name and the selected hex", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText("Preview")).toBeTruthy();
    // header shows the selected color's hex (teal default)
    expect(screen.getAllByText("#008080").length).toBeGreaterThan(0);
  });

  it("labels the All colors list with a click-to-preview hint", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText(/click to preview/i)).toBeTruthy();
  });

  it("labels the Similar colors section with what it lists", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText("closest to Teal · #008080")).toBeTruthy();
  });

  it("labels the Same era section with what it lists", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText("platforms released around 1995 · popular defaults")).toBeTruthy();
  });

  it("renders the type in the meta line and the References links", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText(/Proprietary/)).toBeTruthy();
    const wiki = screen.getByText(/Wikipedia/).closest("a") as HTMLAnchorElement;
    expect(wiki.getAttribute("href")).toContain("wikipedia.org");
  });

  // The References row is built from a flattened list, so an entry can carry any
  // number of links beyond the two special-cased ones. Order is project, then
  // `links` in file order, then Wikipedia.
  it("renders an arbitrary number of reference links, in order", () => {
    render(<OsDetail {...baseProps} os={withLinks} initialHex={null} viewUrl={null} />);
    const row = screen.getByTestId("refs-inline");
    const anchors = [...row.querySelectorAll("a")];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(EXPECTED_REF_HREFS);
    expect(anchors.map((a) => a.textContent?.trim())).toContain("⧉ Second ↗");
    expect(anchors.every((a) => a.getAttribute("target") === "_blank")).toBe(true);
  });

  it("hides the References row when an entry has no links at all", () => {
    const bare: OsView = { ...os, project: undefined, links: [], wikipedia: undefined };
    render(<OsDetail {...baseProps} os={bare} initialHex={null} viewUrl={null} />);
    expect(screen.queryByTestId("refs-inline")).toBeNull();
    expect(screen.queryByTestId("refs-menu")).toBeNull();
  });

  // D2 collapse-to-dropdown: both variants ship in the markup and CSS decides
  // which is visible, so the mobile menu must carry the same links in the same
  // order as the inline pills — jsdom applies no media queries, so this asserts
  // presence and content, not visibility (see TESTING.md).
  it("offers the same references in the mobile dropdown", () => {
    render(<OsDetail {...baseProps} os={withLinks} initialHex={null} viewUrl={null} />);
    const menu = screen.getByTestId("refs-menu");
    // Collapsed: the trigger is the only control, so nothing wraps.
    expect(menu.querySelectorAll("a").length).toBe(0);
    const trigger = menu.querySelector("button") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-label")).toBe("References: 5 links");

    fireEvent.click(trigger);
    const items = [...menu.querySelectorAll("[role='menuitem']")];
    expect(items.map((a) => a.getAttribute("href"))).toEqual(EXPECTED_REF_HREFS);
  });

  it("toggles extended color formats", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.queryByText("CIELAB")).toBeNull();
    fireEvent.click(screen.getByText(/View all .* formats/));
    expect(screen.getByText("CIELAB")).toBeTruthy();
  });

  it("shows the known-uses timeline", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.getByText("KNOWN USES")).toBeTruthy();
  });

  it("expands a similar color into a ColorInfobox panel with platform chips", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    // Teal is default-selected; it has one similar (#4e9a9a on KDE 1)
    fireEvent.click(screen.getByText("#4e9a9a"));
    const chip = screen.getAllByTestId("infobox-platform")[0] as HTMLAnchorElement;
    expect(chip.getAttribute("href")).toBe("/os/kde-1/4e9a9a");
  });

  it("collapses the similar-color panel on a repeat click of the same card", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    expect(screen.getAllByTestId("infobox-platform")[0]).toBeTruthy();
    fireEvent.click(screen.getByText("#4e9a9a"));
    expect(screen.queryByTestId("infobox-platform")).toBeNull();
  });

  it("resets the expanded similar-color panel when the selected color changes", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    expect(screen.getAllByTestId("infobox-platform")[0]).toBeTruthy();
    fireEvent.click(screen.getByText("Navy"));
    expect(screen.queryByTestId("infobox-platform")).toBeNull();
  });

  it("opens the similar-color preview showing its position in the list", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    // Teal is default-selected; expand its first similar (#4e9a9a) and preview it.
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    // The fullscreen must reflect the full similar list, not 1 / 1.
    expect(screen.getByText(/^1 \/ 2$/)).toBeTruthy();
    expect(screen.getByText("Teal · #4e9a9a")).toBeTruthy();
  });

  it("steps through the similar-color list in the fullscreen preview", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next color" }));
    // Fullscreen now shows the second similar color.
    expect(screen.getByText("Pine · #3a8f8f")).toBeTruthy();
    expect(screen.getByText(/^2 \/ 2$/)).toBeTruthy();
  });

  it("wraps to the last similar color when stepping back from the first", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: "Previous color" }));
    expect(screen.getByText("Pine · #3a8f8f")).toBeTruthy();
  });

  it("the expanded panel below follows the preview and stays on close", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    fireEvent.click(screen.getByText("#4e9a9a"));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next color" }));
    // Panel below now reflects the second color (BeOS platform chip).
    expect((screen.getAllByTestId("infobox-platform")[0] as HTMLAnchorElement).getAttribute("href")).toBe("/os/beos/3a8f8f");
    // Close the fullscreen; the panel stays on the landed color.
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(screen.queryByRole("button", { name: "Next color" })).toBeNull();
    expect((screen.getAllByTestId("infobox-platform")[0] as HTMLAnchorElement).getAttribute("href")).toBe("/os/beos/3a8f8f");
  });

  it("shows a skeleton for a color whose detail has not loaded yet", () => {
    // Only the initial color (Navy) is seeded; Teal's detail is absent and there
    // is no viewUrl to fetch it, so selecting Teal must skeleton the heavy panels.
    const seeded = { os, eraPeers, detailsByHex: { "#000080": detailsByHex["#000080"] } };
    render(<OsDetail {...seeded} initialHex="#000080" viewUrl={null} />);
    // light fields still switch instantly
    fireEvent.click(screen.getByText("Teal"));
    expect(screen.getAllByText("0, 128, 128").length).toBeGreaterThan(0); // teal RGB
    // heavy panels are skeletoned
    expect(screen.getAllByTestId("heavy-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("KNOWN USES")).toBeNull();
  });

  it("renders heavy panels (no skeleton) when the selected color's detail is present", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.queryByTestId("heavy-skeleton")).toBeNull();
    expect(screen.getByText("KNOWN USES")).toBeTruthy();
  });
});

describe("OsDetail source note", () => {
  const withSource: OsView = {
    ...os,
    source: [
      { kind: "text", value: "Sampled under " },
      { kind: "link", label: "v86", url: "https://copy.sh/v86/" },
      { kind: "text", value: "." },
    ],
  };

  it("shows a collapsed Source toggle in the inline references row", () => {
    render(<OsDetail {...baseProps} os={withSource} initialHex={null} viewUrl={null} />);
    const toggle = within(screen.getByTestId("refs-inline")).getByTestId("source-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "source-note-panel");
    expect(screen.queryByTestId("source-panel")).toBeNull();
  });

  it("opens the panel when the inline toggle is clicked", () => {
    render(<OsDetail {...baseProps} os={withSource} initialHex={null} viewUrl={null} />);
    fireEvent.click(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle"));
    expect(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle"))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("source-panel").textContent).toContain("Sampled under v86.");
  });

  it("closes the panel when the toggle is clicked again", () => {
    render(<OsDetail {...baseProps} os={withSource} initialHex={null} viewUrl={null} />);
    const toggle = () => within(screen.getByTestId("refs-inline")).getByTestId("source-toggle");
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.queryByTestId("source-panel")).toBeNull();
  });

  it("keeps the panel open when a different color is selected", () => {
    render(<OsDetail {...baseProps} os={withSource} initialHex={null} viewUrl={null} />);
    fireEvent.click(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle"));
    fireEvent.click(screen.getByTestId("color-row-000080"));
    expect(screen.getByTestId("source-panel")).toBeTruthy();
  });

  it("renders no toggle and no panel for an entry without a note", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    expect(screen.queryByTestId("source-toggle")).toBeNull();
    expect(screen.queryByTestId("source-panel")).toBeNull();
  });

  it("renders the references row for an entry with a note but no links", () => {
    render(<OsDetail {...baseProps} os={{ ...withSource, project: undefined, links: [], wikipedia: undefined }} initialHex={null} viewUrl={null} />);
    expect(screen.getByTestId("refs-inline")).toBeTruthy();
    expect(within(screen.getByTestId("refs-inline")).getByTestId("source-toggle")).toBeTruthy();
  });

  const openMenu = () =>
    fireEvent.click(within(screen.getByTestId("refs-menu")).getByRole("button"));

  it("names the source in the dropdown trigger's accessible name", () => {
    render(<OsDetail {...baseProps} os={withSource} initialHex={null} viewUrl={null} />);
    const trigger = within(screen.getByTestId("refs-menu")).getByRole("button");
    expect(trigger.getAttribute("aria-label")).toContain("source");
  });

  it("offers Source as the last item in the references menu", () => {
    render(<OsDetail {...baseProps} os={withSource} initialHex={null} viewUrl={null} />);
    openMenu();
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveAttribute("data-testid", "source-menu-item");
  });

  it("opens the panel and closes the menu when the Source item is chosen", () => {
    render(<OsDetail {...baseProps} os={withSource} initialHex={null} viewUrl={null} />);
    openMenu();
    fireEvent.click(screen.getByTestId("source-menu-item"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("source-panel").textContent).toContain("Sampled under v86.");
  });

  it("offers no Source item for an entry without a note", () => {
    render(<OsDetail {...baseProps} initialHex={null} viewUrl={null} />);
    openMenu();
    expect(screen.queryByTestId("source-menu-item")).toBeNull();
  });
});

describe("centerScrollTop", () => {
  // A 320px-tall list of 48-tall items; total content 2304, scrollable 0..1984.
  const CLIENT = 320, SCROLL = 2304, ITEM = 48;

  it("centers a mid-list item so neighbours show above and below", () => {
    // item at offset 1000 → 1000 - (320-48)/2 = 864
    expect(centerScrollTop(1000, ITEM, CLIENT, SCROLL)).toBe(864);
  });

  it("clamps to the top rather than scrolling negative for an early item", () => {
    expect(centerScrollTop(0, ITEM, CLIENT, SCROLL)).toBe(0);
  });

  it("clamps to the bottom for a late item", () => {
    // last item at offset 2256 → ideal 2120, but max scroll is 2304-320=1984
    expect(centerScrollTop(2256, ITEM, CLIENT, SCROLL)).toBe(1984);
  });

  it("does not scroll a list that fits without overflow", () => {
    expect(centerScrollTop(80, ITEM, 320, 320)).toBe(0);
  });
});
