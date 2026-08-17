import { defineCollection, z } from "astro:content";
import { DESKTOP_STYLES } from "../lib/desktopStyle";

// Lowercase-only on purpose: uppercase is functionally harmless (every hex is
// lowercased in toColorView/mergeColorsByHex before it reaches a view), but keeping
// the source files single-case makes them greppable by color code.
const hex = z.string().regex(/^#[0-9a-f]{6}$/, "must be lowercase #rrggbb");

const desktopStyle = z.enum(DESKTOP_STYLES);

const osColor = z.object({
  hex,
  name: z.string().min(1),
  note: z.string().default(""),
  default: z.boolean().default(false),
});
export type OsColor = z.infer<typeof osColor>;

const osSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.number().int(),
  added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  family: z.string().min(1),
  description: z.string().default(""),
  predecessor: z.string().optional(),
  successor: z.string().optional(),
  desktopStyle: desktopStyle.default("modern"),
  type: z.string().min(1).optional(),
  project: z.object({ name: z.string().min(1), url: z.string().url() }).optional(),
  wikipedia: z.string().url().optional(),
  colors: z.array(osColor).min(1)
    .refine((cs) => cs.filter((c) => c.default).length <= 1, {
      message: "at most one color may be marked default",
    }),
});
export type OsInput = z.infer<typeof osSchema>;

export const collections = {
  os: defineCollection({ type: "data", schema: osSchema }),
};
