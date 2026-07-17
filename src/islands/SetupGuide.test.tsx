import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { SetupGuide } from "./SetupGuide";
import { SETUP_GUIDES } from "../lib/setup-guides";

describe("SetupGuide", () => {
  it("renders all guides by default", () => {
    render(<SetupGuide guides={SETUP_GUIDES} />);
    expect(screen.getByText("Windows 11")).toBeTruthy();
    expect(screen.getByText("Android")).toBeTruthy();
  });

  it("filters to Mobile via the category control", () => {
    render(<SetupGuide guides={SETUP_GUIDES} />);
    fireEvent.click(screen.getByRole("button", { name: /Mobile/ }));
    expect(screen.queryByText("Windows 11")).toBeNull();
    expect(screen.getByText("iOS · iPhone")).toBeTruthy();
  });

  it("filters by search query", () => {
    render(<SetupGuide guides={SETUP_GUIDES} />);
    fireEvent.input(screen.getByPlaceholderText(/Search systems/), { target: { value: "kde" } });
    expect(screen.getByText("KDE Plasma")).toBeTruthy();
    expect(screen.queryByText("macOS")).toBeNull();
  });

  it("expands a full guide article on toggle", () => {
    render(<SetupGuide guides={SETUP_GUIDES} />);
    // article text hidden until expanded
    expect(screen.queryByText(/per-account and syncs/)).toBeNull();
    const toggles = screen.getAllByRole("button", { name: /Read full guide/ });
    fireEvent.click(toggles[0]); // Windows 11 is first
    expect(screen.getByText(/per-account and syncs/)).toBeTruthy();
  });

  it("shows an empty state when nothing matches", () => {
    render(<SetupGuide guides={SETUP_GUIDES} />);
    fireEvent.input(screen.getByPlaceholderText(/Search systems/), { target: { value: "zzzz" } });
    expect(screen.getByText(/No systems match/)).toBeTruthy();
  });
});
