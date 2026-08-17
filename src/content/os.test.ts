import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { DESKTOP_STYLES } from "../lib/desktopStyle";

// Mirrors src/content/config.ts — lowercase-only, so the files stay greppable.
const hex = z.string().regex(/^#[0-9a-f]{6}$/);
const osColor = z.object({
  hex,
  name: z.string().min(1),
  note: z.string().optional(),
  default: z.boolean().optional(),
});
const osSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.number().int(),
  added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  family: z.string().min(1),
  description: z.string().optional(),
  predecessor: z.string().optional(),
  successor: z.string().optional(),
  desktopStyle: z.enum(DESKTOP_STYLES).optional(),
  colors: z.array(osColor).min(1),
});

type ParsedEntry = { slug: string; data: z.infer<typeof osSchema> };

const dir = "src/content/os";
const files: string[] = readdirSync(dir).filter((f: string) => f.endsWith(".json"));
const slugOf = (f: string) => f.replace(/\.json$/, "");

describe("os content files", () => {
  it("has at least the seeded platforms", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  const parsed: ParsedEntry[] = files.map((f: string) => ({
    slug: slugOf(f),
    data: osSchema.parse(JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))),
  }));

  it.each(parsed)("$slug passes the schema and has <=1 default", (entry: ParsedEntry) => {
    expect(entry.data.colors.filter((c) => c.default).length).toBeLessThanOrEqual(1);
  });

  it("resolves every predecessor/successor slug", () => {
    const slugs = new Set(parsed.map((p: ParsedEntry) => p.data.slug ?? p.slug));
    for (const { slug, data } of parsed) {
      if (data.predecessor) expect(slugs, `${slug}.predecessor`).toContain(data.predecessor);
      if (data.successor) expect(slugs, `${slug}.successor`).toContain(data.successor);
    }
  });

  // description and the per-color note are prose fields no entry carries any more.
  // They stay in the schema (defaulted to "" by config.ts) so an entry *may* set
  // them, but an entry that omits both has to parse — which every real file does.
  it("accepts an entry with no description and no colour note", () => {
    expect(osSchema.safeParse({
      name: "X", year: 2000, added: "2000-01-01", family: "F",
      colors: [{ hex: "#000000", name: "Black" }],
    }).success).toBe(true);
  });

  // `tagline` is gone from the schema entirely — not defaulted, removed. Zod strips
  // unknown keys rather than rejecting them, so a re-added "tagline" would parse
  // clean and then vanish silently on the way to the view. Check the raw JSON.
  it("has no tagline key left in any entry", () => {
    for (const f of files) {
      const raw = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      expect(raw, f).not.toHaveProperty("tagline");
    }
  });

  it("requires added in YYYY-MM-DD form", () => {
    const base = {
      name: "X", year: 2000, added: "2000-01-01", family: "F",
      description: "d",
      colors: [{ hex: "#000000", name: "Black" }],
    };
    expect(osSchema.safeParse(base).success).toBe(true);
    expect(osSchema.safeParse({ ...base, added: "2026-7-1" }).success).toBe(false); // wrong format
    const { added: _omit, ...missing } = base;
    expect(osSchema.safeParse(missing).success).toBe(false); // missing entirely
  });
});
