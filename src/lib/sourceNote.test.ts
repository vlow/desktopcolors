import { describe, it, expect } from "vitest";
import { parseSourceNote, sourceNoteLinkErrors, tokenizeSourceNote } from "./sourceNote";

const LINKS = {
  "Display Properties": "https://en.wikipedia.org/wiki/Windows_95",
  v86: "https://copy.sh/v86/",
};

describe("tokenizeSourceNote", () => {
  it("returns a single literal run for prose with no markers", () => {
    expect(tokenizeSourceNote("Sampled from a running install.")).toEqual([
      { kind: "text", value: "Sampled from a running install." },
    ]);
  });

  it("returns an empty array for empty text", () => {
    expect(tokenizeSourceNote("")).toEqual([]);
  });

  it("splits a [Label] marker out of the surrounding prose", () => {
    expect(tokenizeSourceNote("run under [v86] here")).toEqual([
      { kind: "text", value: "run under " },
      { kind: "marker", label: "v86" },
      { kind: "text", value: " here" },
    ]);
  });

  it("splits a backtick code span", () => {
    expect(tokenizeSourceNote("the `.theme` files")).toEqual([
      { kind: "text", value: "the " },
      { kind: "code", value: ".theme" },
      { kind: "text", value: " files" },
    ]);
  });

  it("handles adjacent markers with no text between them", () => {
    expect(tokenizeSourceNote("[a][b]")).toEqual([
      { kind: "marker", label: "a" },
      { kind: "marker", label: "b" },
    ]);
  });

  it("treats an unclosed [ as literal text", () => {
    expect(tokenizeSourceNote("a [b c")).toEqual([{ kind: "text", value: "a [b c" }]);
  });

  it("treats an unclosed backtick as literal text", () => {
    expect(tokenizeSourceNote("a `b c")).toEqual([{ kind: "text", value: "a `b c" }]);
  });

  it("treats an empty [] as literal text", () => {
    expect(tokenizeSourceNote("a [] b")).toEqual([{ kind: "text", value: "a [] b" }]);
  });

  it("does not nest: a [ inside a code span stays literal", () => {
    expect(tokenizeSourceNote("`a[b`")).toEqual([{ kind: "code", value: "a[b" }]);
  });

  it("does not nest: a backtick inside a label is part of the label", () => {
    expect(tokenizeSourceNote("[a`b]")).toEqual([{ kind: "marker", label: "a`b" }]);
  });
});

describe("sourceNoteLinkErrors", () => {
  it("reports nothing when every marker resolves and every link is cited", () => {
    expect(sourceNoteLinkErrors("[Display Properties] under [v86]", LINKS)).toEqual([]);
  });

  it("reports nothing for prose with no markers and no links", () => {
    expect(sourceNoteLinkErrors("Read off the shipped disc.", {})).toEqual([]);
  });

  it("names a marker that has no link entry", () => {
    const errs = sourceNoteLinkErrors("under [QEMU]", {});
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("[QEMU]");
  });

  it("names a link entry that is never cited", () => {
    const errs = sourceNoteLinkErrors("plain prose", { v86: "https://copy.sh/v86/" });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("v86");
  });

  it("accepts one link entry cited twice", () => {
    expect(sourceNoteLinkErrors("[v86] and again [v86]", { v86: "https://copy.sh/v86/" })).toEqual([]);
  });

  it("does not treat an unclosed bracket as an uncited marker", () => {
    expect(sourceNoteLinkErrors("a [b c", {})).toEqual([]);
  });
});

describe("parseSourceNote", () => {
  it("maps a marker to a link node carrying its url", () => {
    expect(parseSourceNote("under [v86].", LINKS)).toEqual([
      { kind: "text", value: "under " },
      { kind: "link", label: "v86", url: "https://copy.sh/v86/" },
      { kind: "text", value: "." },
    ]);
  });

  it("maps a backtick span to a code node", () => {
    expect(parseSourceNote("the `.theme` files", {})).toEqual([
      { kind: "text", value: "the " },
      { kind: "code", value: ".theme" },
      { kind: "text", value: " files" },
    ]);
  });

  it("degrades an unresolved marker to literal text rather than throwing", () => {
    expect(parseSourceNote("under [QEMU].", {})).toEqual([
      { kind: "text", value: "under " },
      { kind: "text", value: "[QEMU]" },
      { kind: "text", value: "." },
    ]);
  });
});
