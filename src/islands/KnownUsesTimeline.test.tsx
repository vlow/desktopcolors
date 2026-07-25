import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { KnownUsesTimeline } from "./KnownUsesTimeline";
import type { Platform } from "../lib/colorCatalog";

const uses: Platform[] = [
  { slug: "cde", name: "CDE", year: 1993, family: "Desktop Env.", isDefault: false },
  { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
];

describe("KnownUsesTimeline", () => {
  it("solo state when only one platform uses the hex", () => {
    render(<KnownUsesTimeline hex="#008080" uses={[uses[1]]} currentSlug="windows-95" />);
    expect(screen.getByText(/Only in this palette so far/)).toBeTruthy();
  });

  it("multi state shows count label and first-use summary", () => {
    render(<KnownUsesTimeline hex="#008080" uses={uses} currentSlug="windows-95" />);
    expect(screen.getByText(/2 palettes · 1993–1995/)).toBeTruthy();
    expect(screen.getByText(/First in/)).toBeTruthy();
  });

  it("expands to a list that links non-current platforms to their color page", () => {
    render(<KnownUsesTimeline hex="#008080" uses={uses} currentSlug="windows-95" />);
    fireEvent.click(screen.getByText(/View all 2 palettes/));
    // "CDE" also appears in the "First in CDE, 1993." summary text, so pick
    // the occurrence that's actually a link (the expanded row).
    const link = screen.getAllByText("CDE")
      .map((el) => el.closest("a"))
      .find((a): a is HTMLAnchorElement => a !== null)!;
    expect(link.getAttribute("href")).toBe("/os/cde/008080");
  });
});
