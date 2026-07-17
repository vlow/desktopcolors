import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const osColor = z.object({
  hex,
  name: z.string().min(1),
  index: z.string().optional(),
  note: z.string().optional(),
  default: z.boolean().optional(),
});
const osSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.number().int(),
  family: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  predecessor: z.string().optional(),
  successor: z.string().optional(),
  desktopStyle: z.enum(["win9x", "macos8", "kde", "cde", "amiga", "generic"]).optional(),
  colors: z.array(osColor).min(1),
});

const dir = "src/content/os";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const slugOf = (f: string) => f.replace(/\.json$/, "");

describe("os content files", () => {
  it("has at least the seeded platforms", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  const parsed = files.map((f) => ({
    slug: slugOf(f),
    data: osSchema.parse(JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))),
  }));

  it.each(parsed)("$slug passes the schema and has <=1 default", ({ data }) => {
    expect(data.colors.filter((c) => c.default).length).toBeLessThanOrEqual(1);
  });

  it("resolves every predecessor/successor slug", () => {
    const slugs = new Set(parsed.map((p) => p.data.slug ?? p.slug));
    for (const { slug, data } of parsed) {
      if (data.predecessor) expect(slugs, `${slug}.predecessor`).toContain(data.predecessor);
      if (data.successor) expect(slugs, `${slug}.successor`).toContain(data.successor);
    }
  });
});
