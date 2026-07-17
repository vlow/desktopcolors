import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { DownloadSheet } from "./DownloadSheet";

const color = { hex: "#008080", name: "Teal" };

describe("DownloadSheet", () => {
  it("renders preset resolution buttons", () => {
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1920×1080" })).toBeTruthy();
    expect(screen.getByText("Desktop")).toBeTruthy();
  });

  it("invokes onDownload with preset dimensions", () => {
    const spy = vi.fn();
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={spy} />);
    fireEvent.click(screen.getByRole("button", { name: "1920×1080" }));
    expect(spy).toHaveBeenCalledWith("windows-95", "Teal", "#008080", 1920, 1080);
  });

  it("disables Get for invalid custom dimensions and enables for valid", () => {
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={vi.fn()} />);
    const get = screen.getByRole("button", { name: "Get" }) as HTMLButtonElement;
    expect(get.disabled).toBe(true);
    fireEvent.input(screen.getByPlaceholderText("width"), { target: { value: "1600" } });
    fireEvent.input(screen.getByPlaceholderText("height"), { target: { value: "900" } });
    expect(get.disabled).toBe(false);
    fireEvent.input(screen.getByPlaceholderText("width"), { target: { value: "abc" } });
    expect((screen.getByRole("button", { name: "Get" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("invokes onDownload with custom dimensions", () => {
    const spy = vi.fn();
    render(<DownloadSheet osSlug="windows-95" color={color} onClose={() => {}} onDownload={spy} />);
    fireEvent.input(screen.getByPlaceholderText("width"), { target: { value: "1600" } });
    fireEvent.input(screen.getByPlaceholderText("height"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "Get" }));
    expect(spy).toHaveBeenCalledWith("windows-95", "Teal", "#008080", 1600, 900);
  });
});
