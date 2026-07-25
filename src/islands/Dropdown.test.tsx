import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/preact";
import { Dropdown } from "./Dropdown";

function setup() {
  return render(
    <Dropdown ariaLabel="Sort menu" trigger={<span>Sort</span>}>
      {(close) => (
        <>
          <button role="menuitem" onClick={close}>Option A</button>
          <button role="menuitem" onClick={close}>Option B</button>
        </>
      )}
    </Dropdown>,
  );
}

describe("Dropdown", () => {
  it("is closed initially", () => {
    setup();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Sort menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on trigger click", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort menu" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes when a menuitem calls close", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Option B" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on an outside mousedown", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sort menu" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
