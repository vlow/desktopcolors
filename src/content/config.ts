import { defineCollection, z } from "astro:content";
import { DESKTOP_STYLES } from "../lib/desktopStyle";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");

const desktopStyle = z.enum(DESKTOP_STYLES);

const osColor = z.object({
  hex,
  name: z.string().min(1),
  index: z.string().default("—"),
  note: z.string().default(""),
  default: z.boolean().default(false),
});
export type OsColor = z.infer<typeof osColor>;

const osSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  year: z.number().int(),
  family: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  predecessor: z.string().optional(),
  successor: z.string().optional(),
  desktopStyle: desktopStyle.default("generic"),
  colors: z.array(osColor).min(1)
    .refine((cs) => cs.filter((c) => c.default).length <= 1, {
      message: "at most one color may be marked default",
    }),
});
export type OsInput = z.infer<typeof osSchema>;

export const collections = {
  os: defineCollection({ type: "data", schema: osSchema }),
};
