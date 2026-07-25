import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { MobileNav } from "./MobileNav";

describe("MobileNav", () => {
  it("hides the menu until the burger is clicked", () => {
    render(<MobileNav />);
    expect(screen.queryByRole("link", { name: "Colors" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Menu/ }));
    expect(screen.getByRole("link", { name: "Colors" })).toHaveAttribute("href", "/colors");
  });

  it("closes when a link is clicked", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /Menu/ }));
    fireEvent.click(screen.getByRole("link", { name: "About" }));
    expect(screen.queryByRole("link", { name: "About" })).toBeNull();
  });
});
