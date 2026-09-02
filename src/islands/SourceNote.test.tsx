import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { SourceNote } from "./SourceNote";
import type { SourceNode } from "../lib/sourceNote";

describe("SourceNote", () => {
  it("renders literal text", () => {
    render(<SourceNote nodes={[{ kind: "text", value: "Sampled from a disc." }]} />);
    expect(screen.getByText("Sampled from a disc.")).toBeTruthy();
  });

  it("renders a link node as an anchor that cannot leak the opener", () => {
    const nodes: SourceNode[] = [{ kind: "link", label: "v86", url: "https://copy.sh/v86/" }];
    render(<SourceNote nodes={nodes} />);
    const a = screen.getByRole("link", { name: "v86" });
    expect(a).toHaveAttribute("href", "https://copy.sh/v86/");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener");
  });

  it("renders a code node as a <code> element", () => {
    render(<SourceNote nodes={[{ kind: "code", value: ".theme" }]} />);
    expect(screen.getByText(".theme").tagName).toBe("CODE");
  });

  it("renders mixed nodes in order", () => {
    const nodes: SourceNode[] = [
      { kind: "text", value: "under " },
      { kind: "link", label: "v86", url: "https://copy.sh/v86/" },
      { kind: "text", value: ", against " },
      { kind: "code", value: ".theme" },
    ];
    const { container } = render(<SourceNote nodes={nodes} />);
    expect(container.textContent).toBe("under v86, against .theme");
  });

  it("renders nothing for an empty node list", () => {
    const { container } = render(<SourceNote nodes={[]} />);
    expect(container.textContent).toBe("");
  });
});
