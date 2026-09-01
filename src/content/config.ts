import { defineCollection, z } from "astro:content";
import { DESKTOP_STYLES } from "../lib/desktopStyle";
import { sourceNoteLinkErrors } from "../lib/sourceNote";

// Lowercase-only on purpose: uppercase is functionally harmless (every hex is
// lowercased in toColorView/mergeColorsByHex before it reaches a view), but keeping
// the source files single-case makes them greppable by color code.
const hex = z.string().regex(/^#[0-9a-f]{6}$/, "must be lowercase #rrggbb");

const desktopStyle = z.enum(DESKTOP_STYLES);

// z.string().url() only checks that the value parses as a URL — it happily accepts
// `javascript:`, `data:`, and `vbscript:` schemes, all of which reach a real `href`
// or `src` on the rendered page. This site is static and ships every content file's
// URLs straight to every visitor with no CSP to fall back on, so a malicious scheme
// slipping through review would execute for everyone. Every URL field in this schema
// uses this instead of the bare `.url()`.
const httpUrl = z
  .string()
  .url()
  .refine(
    (u) => /^https?:$/.test(new URL(u).protocol),
    "must be an http(s) URL",
  );

const osColor = z.object({
  hex,
  name: z.string().min(1),
  note: z.string().default(""),
  default: z.boolean().default(false),
});
export type OsColor = z.infer<typeof osColor>;

// One entry in the References row on the detail page. `project` and `wikipedia`
// stay as their own fields — they carry their own icons and a fixed position —
// and `links` is the open-ended rest: any number of further references, in file
// order, for sources that are neither the platform's project page nor Wikipedia.
const osLink = z.object({ name: z.string().min(1), url: httpUrl });

// A provenance note: where this entry's colors were actually obtained, as
// opposed to `links`, which say where to read more about the platform. `text`
// is authored with two markers — [Label] for a link, `x` for code — and every
// [Label] must resolve in `links`. Stored structured rather than as HTML: the
// site is static, so content is baked into every visitor's page at build time.
// See docs/adding-os-data.md.
const osSource = z
  .object({
    text: z.string().min(1),
    links: z.record(z.string().min(1), httpUrl).default({}),
  })
  .superRefine((val, ctx) => {
    // Both directions: an uncited marker renders as literal brackets and nobody
    // notices; an unused link entry is dead data. Fail the build on either.
    for (const message of sourceNoteLinkErrors(val.text, val.links)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });

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
  project: osLink.optional(),
  links: z.array(osLink).default([]),
  wikipedia: httpUrl.optional(),
  source: osSource.optional(),
  colors: z.array(osColor).min(1)
    .refine((cs) => cs.filter((c) => c.default).length <= 1, {
      message: "at most one color may be marked default",
    }),
});
export type OsInput = z.infer<typeof osSchema>;

export const collections = {
  os: defineCollection({ type: "data", schema: osSchema }),
};
