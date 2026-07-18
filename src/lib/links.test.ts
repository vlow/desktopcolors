import { describe, it, expect } from "vitest";
import { colorPath } from "./links";

describe("colorPath", () => {
  it("builds a path with the hex as a segment, stripping the leading #", () => {
    expect(colorPath("windows-95", "#000080")).toBe("/os/windows-95/000080");
  });

  it("works when the hex has no leading #", () => {
    expect(colorPath("beos", "3d85c6")).toBe("/os/beos/3d85c6");
  });
});
