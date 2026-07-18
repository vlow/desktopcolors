import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { DesktopPreview, STYLE_CHROME } from "./DesktopPreview";
import { DESKTOP_STYLES } from "../lib/desktopStyle";
import { onColor } from "../lib/color";

const HEX = "#3a6ea5"; // a mid blue; onColor -> white

describe("DesktopPreview", () => {
  // Guards against adding a style to DESKTOP_STYLES without giving it chrome:
  // the exhaustive Record type catches it at compile time, this catches it at run time.
  it("every style has at least one chrome part and renders it", () => {
    for (const style of DESKTOP_STYLES) {
      expect(STYLE_CHROME[style]?.length ?? 0).toBeGreaterThan(0);
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
    expect(chromeFor("win9x")).toEqual(["chrome-icons", "chrome-taskbar"]);
    expect(chromeFor("generic")).toEqual(["chrome-icons"]); // icons, but no taskbar
    expect(chromeFor("macos8")).toEqual(["chrome-menubar"]);
    expect(chromeFor("amiga")).toEqual(["chrome-titlebar"]);
    expect(chromeFor("kde")).toEqual(["chrome-panel"]);
    expect(chromeFor("cde")).toEqual(["chrome-panel"]); // kde and cde share the panel
  });

  it("renders the modern default scene (windows + dock clock)", () => {
    const { getByText, getAllByText } = render(<DesktopPreview hex={HEX} onColor={onColor(HEX)} style="modern" />);
    expect(getByText("Documents")).toBeTruthy();
    expect(getAllByText("Files").length).toBeGreaterThan(0); // icon label + back window
    expect(getByText("10:42")).toBeTruthy(); // dock clock
  });

  it("colors icon labels with onColor for contrast on the wallpaper", () => {
    const dark = "#101820"; // onColor -> white
    const { getByText } = render(<DesktopPreview hex={dark} onColor={onColor(dark)} style="generic" />);
    expect(getByText("My Computer")).toHaveStyle("color: #ffffff"); // onColor(dark) === white
  });
});
