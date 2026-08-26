import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { DesktopPreview } from "./DesktopPreview";
import { CHROME_SPECS } from "../lib/chromeSpec";
import { DESKTOP_STYLES } from "../lib/desktopStyle";
import { onColor } from "../lib/color";

const HEX = "#3a6ea5"; // a mid blue; onColor -> white

describe("DesktopPreview", () => {
  // Guards against adding a style to DESKTOP_STYLES without chrome: the exhaustive
  // Record type catches it at compile time; this catches it at run time.
  it("every style renders chrome", () => {
    for (const style of DESKTOP_STYLES) {
      const spec = CHROME_SPECS[style];
      expect(spec === null || spec.length > 0).toBe(true); // null == modern (bespoke)
      const { container, unmount } = render(
        <DesktopPreview hex={HEX} onColor={onColor(HEX)} style={style} />,
      );
      expect(container.querySelectorAll("[data-testid^='chrome-']").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("fills the wallpaper with the selected color", () => {
    const { container } = render(<DesktopPreview hex={HEX} onColor={onColor(HEX)} style="generic" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveStyle(`background-color: ${HEX}`); // jest-dom normalizes hex↔rgb
  });

  it("draws the expected chrome per style", () => {
    const chromeFor = (style: (typeof DESKTOP_STYLES)[number]) => {
      const { container } = render(<DesktopPreview hex={HEX} onColor={onColor(HEX)} style={style} />);
      return [...container.querySelectorAll("[data-testid^='chrome-']")].map((el) => el.getAttribute("data-testid"));
    };
    expect(chromeFor("modern")).toEqual(["chrome-desk-icons", "chrome-windows", "chrome-dock"]);
    expect(chromeFor("win9x")).toEqual(["chrome-deskicons", "chrome-window", "chrome-deskicons", "chrome-taskbar"]);
    expect(chromeFor("win31")).toEqual(["chrome-window"]);
    expect(chromeFor("platinum")).toEqual(["chrome-menubar", "chrome-deskicons", "chrome-platinumwindow"]);
    expect(chromeFor("beos")).toEqual(["chrome-beostab", "chrome-deskicons", "chrome-beoswindow"]);
    expect(chromeFor("amiga")).toEqual(["chrome-topbar", "chrome-deskicons", "chrome-window"]);
    expect(chromeFor("kde")).toEqual(["chrome-window", "chrome-dock"]);
    expect(chromeFor("cde")).toEqual(["chrome-deskicons", "chrome-cdewindow", "chrome-frontpanel"]);
    expect(chromeFor("gem")).toEqual(["chrome-menubar", "chrome-deskicons", "chrome-gemwindow"]);
    expect(chromeFor("bleskos")).toEqual(["chrome-bleskos"]);
    expect(chromeFor("blackbox")).toEqual(["chrome-rootmenu", "chrome-workspacebar"]);
    expect(chromeFor("c64")).toEqual(["chrome-basicscreen"]);
    expect(chromeFor("generic")).toEqual(["chrome-deskicons", "chrome-dock"]);
  });

  it("renders the modern default scene (windows + dock clock)", () => {
    const { getByText, getAllByText } = render(<DesktopPreview hex={HEX} onColor={onColor(HEX)} style="modern" />);
    expect(getByText("Documents")).toBeTruthy();
    expect(getAllByText("Files").length).toBeGreaterThan(0); // icon label + back window
    expect(getByText("10:42")).toBeTruthy(); // dock clock
  });

  // The C64 border and BASIC text were a second palette color, not a shade of
  // the background, so basicScreen takes the OS's other color as `accent` and
  // draws it exactly — on the C64's own blue that is the real boot screen.
  describe("basicScreen accent", () => {
    const BLUE = "#2e2c9b";       // C64 screen background (the default color)
    const LIGHT_BLUE = "#706deb"; // C64 border + BASIC text

    const c64 = (hex: string, accent?: string) =>
      render(<DesktopPreview hex={hex} onColor={onColor(hex)} style="c64" accent={accent} />);

    it("draws the frame and text in the accent color", () => {
      const { container, getByText } = c64(BLUE, LIGHT_BLUE);
      const frame = container.querySelector("[data-testid='chrome-basicscreen']") as HTMLElement;
      expect(frame.style.boxShadow).toContain(LIGHT_BLUE);
      expect(getByText("READY.")).toHaveStyle(`color: ${LIGHT_BLUE}`);
      expect(getByText("READY.")).toHaveStyle("opacity: 1"); // exact color, not tinted
    });

    it("falls back to translucent surfaces with no accent", () => {
      const { container, getByText } = c64(BLUE);
      const frame = container.querySelector("[data-testid='chrome-basicscreen']") as HTMLElement;
      expect(frame.style.boxShadow).not.toContain(LIGHT_BLUE);
      expect(getByText("READY.")).toHaveStyle(`color: ${onColor(BLUE)}`);
    });

    // A companion color that barely separates from the wallpaper would render
    // the frame and text all but invisible, so it is dropped.
    it("ignores an accent too close to the wallpaper", () => {
      const { getByText } = c64(BLUE, "#302e9d");
      expect(getByText("READY.")).toHaveStyle(`color: ${onColor(BLUE)}`);
    });

    it("centers the two banner lines and left-aligns READY.", () => {
      const { getByText } = c64(BLUE, LIGHT_BLUE);
      expect(getByText("**** COMMODORE 64 BASIC V2 ****")).toHaveStyle("text-align: center");
      expect(getByText(/64K RAM SYSTEM/)).toHaveStyle("text-align: center");
      expect(getByText("READY.")).toHaveStyle("text-align: left");
    });
  });

  it("colors icon labels with onColor for contrast on the wallpaper", () => {
    const dark = "#101820"; // onColor -> white
    const { getByText } = render(<DesktopPreview hex={dark} onColor={onColor(dark)} style="generic" />);
    expect(getByText("Computer")).toHaveStyle("color: #ffffff"); // onColor(dark) === white
  });
});
