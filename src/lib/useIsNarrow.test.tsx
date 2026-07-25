import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { useIsNarrow } from "./useIsNarrow";

function Probe() {
  return <span>{useIsNarrow() ? "narrow" : "wide"}</span>;
}

const origMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = origMatchMedia; });

describe("useIsNarrow", () => {
  it("reports wide when the media query does not match", () => {
    render(<Probe />);
    expect(screen.getByText("wide")).toBeTruthy();
  });

  it("reports narrow when the media query matches", () => {
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    render(<Probe />);
    expect(screen.getByText("narrow")).toBeTruthy();
  });
});
