import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ColorInfobox, type InfoboxColor } from "./ColorInfobox";
import type { Platform } from "../lib/explorer";

const color: InfoboxColor = {
  hex: "#008080", name: "Teal", onColor: "#ffffff",
  h: 180, s: 100, l: 25, primarySlug: "windows-95",
};
const platforms: Platform[] = [
  { slug: "windows-95", name: "Windows 95", year: 1995, family: "Windows", isDefault: true },
  { slug: "beos", name: "BeOS", year: 1998, family: "Be", isDefault: false },
];

describe("ColorInfobox", () => {
  it("links each platform to its color detail page", () => {
    render(<ColorInfobox color={color} platforms={platforms} variant="band" onPreview={() => {}} onDownload={() => {}} />);
    const links = screen.getAllByTestId("infobox-platform") as HTMLAnchorElement[];
    expect(links[0].getAttribute("href")).toBe("/os/windows-95/008080");
    expect(links[1].getAttribute("href")).toBe("/os/beos/008080");
  });

  it("copies a color value and calls the preview/download callbacks", () => {
    const onPreview = vi.fn(), onDownload = vi.fn();
    render(<ColorInfobox color={color} platforms={platforms} variant="band" onPreview={onPreview} onDownload={onDownload} />);
    fireEvent.click(screen.getByTestId("copy-hex"));
    expect(screen.getByTestId("copy-hex").textContent).toContain("Copied");
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it("omits the color header in the flat variant", () => {
    const { rerender } = render(<ColorInfobox color={color} platforms={platforms} variant="band" onPreview={() => {}} onDownload={() => {}} />);
    expect(screen.queryByText("Teal")).toBeTruthy();
    rerender(<ColorInfobox color={color} platforms={platforms} variant="flat" onPreview={() => {}} onDownload={() => {}} />);
    expect(screen.queryByText("Teal")).toBeNull();
  });
});
