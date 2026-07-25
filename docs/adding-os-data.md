# Adding OS data & colors

Every operating system / desktop environment on the site is **one JSON file** in
[`src/content/os/`](../src/content/os). Adding or editing a platform means editing that
file — nothing else. The Zod schema in
[`src/content/config.ts`](../src/content/config.ts) validates every file at build time,
so a bad hex, a missing field, more than one `default` color, or a dangling
`predecessor`/`successor` **fails the build**.

This is the full guide (for humans and LLM agents). For the quick version see
[README → Adding a new OS](../README.md#adding-a-new-os); for the desktop preview chrome
(`desktopStyle`) see [`adding-a-preview-style.md`](adding-a-preview-style.md).

## The file shape

```json
{
  "name": "BeOS",
  "year": 1995,
  "added": "2026-07-17",
  "family": "BeOS",
  "tagline": "The multimedia OS with a calm, steady blue desktop.",
  "description": "One or two sentences of context…",
  "predecessor": "some-slug",
  "successor": "some-slug",
  "desktopStyle": "beos",
  "type": "Proprietary",
  "wikipedia": "https://en.wikipedia.org/wiki/BeOS",
  "colors": [
    { "hex": "#336698", "name": "Steel Blue", "note": "The BeOS desktop blue.", "default": true }
  ]
}
```

| field | required | notes |
|-------|----------|-------|
| `name` | ✅ | Display name. Don't include a `(Demo)`/placeholder suffix once real data lands. |
| `year` | ✅ | Integer release year. |
| `added` | ✅ | `YYYY-MM-DD`, the date the entry was **added to the catalog** — keep the original when you later fill in real data; don't bump it to "today". |
| `family` | ✅ | Groups the OS on Platforms. Reuse an existing value (`Windows`, `Mac OS`, `Amiga`, `Desktop Env.`, …) unless it's genuinely a new family. |
| `tagline` | ✅ | One evocative line. |
| `description` | ✅ | One or two sentences of real context. |
| `slug` | — | Defaults to the filename (`beos.json` → `beos`). |
| `predecessor`, `successor` | — | Slug refs to other entries; a dangling ref fails the build. |
| `desktopStyle` | — | Preview chrome; defaults to `modern`. See [`adding-a-preview-style.md`](adding-a-preview-style.md). |
| `type` | — | `Proprietary` or `Open Source` (reuse existing values). |
| `wikipedia` | — | URL. |
| `project` | — | `{ "name", "url" }` for the OS's own site (open-source projects). |
| `colors` | ✅ | ≥1 entry; **≤1** may be `"default": true`. |

## Colors

Each color is `{ hex, name, note?, default? }`:

- **`hex`** — `#rrggbb`, lowercase. Convert from RGB by hand or with the snippet below.
- **`name`** — a human name for the swatch. For a family with light/dark variants,
  qualify it: `French Blue (Light)`, `Olive (Dark)`.
- **`note`** — optional; a short factual sentence (where the color is used, which theme
  it belongs to). Keep it terse.
- **`default`** — mark the OS's out-of-the-box desktop color. **At most one** per file.

RGB → hex helper:

```js
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
hex([179, 179, 218]); // "#b3b3da"
```

## Dithered colors

Some desktops don't show a solid color — the OS couldn't (a fixed hardware palette) or
didn't display the color directly, so it **dithers**: it checkerboards two palette colors
in a repeating pattern to fake a third. `#rrggbb` can only hold a solid color, so a
dithered desktop is represented as a small **cluster** of entries rather than one.

Existing examples: [`windows-1-0.json`](../src/content/os/windows-1-0.json) (green + cyan,
75/25), [`freegem.json`](../src/content/os/freegem.json) (gray + blue, 1:1),
[`mac-os-8.json`](../src/content/os/mac-os-8.json) (gray + gray, 1:1).

### The cluster: up to 4 entries

For a dither of two source colors **A** and **B**, add:

1. **`<Name> (Averaged)`** — the **conventional pixel average**: the per-channel
   arithmetic mean in sRGB, weighted by each color's share of the pattern, rounded to
   8-bit. This is the naive "what it blurs to" color.
2. **`<Name> (Gamma-Corrected)`** — the same mix **averaged in linear light** (sRGB →
   linear, mean, → sRGB). This tracks human perception of the blend better and is
   usually lighter/airier than the pixel average.
3. **partial A** — one source color, named by its actual color (e.g. `Phosphor Green`,
   `Stone Gray`), with a note giving its share of the pattern.
4. **partial B** — the other source color.

Order the two blended entries first, then the two partials. Cross-reference the hexes in
the notes (see the existing files for the exact phrasing). Mark the **`(Averaged)`** entry
`default` **only if the dither IS the OS's actual desktop** (as in FreeGEM and
Windows 1.0) — not when it's just one option among several solid colors (as in Mac OS 8,
where the gray dither is one wallpaper and `default` sits on a solid color).

### Weighting

If the pattern isn't 1:1, weight **both** averages by area and say so in the note.
Windows 1.0 is 75% green / 25% cyan: each 8×8 green block holds a 4×4 cyan patch.

### The collapse rule (→ 3 entries)

When the two source colors are close and/or near-neutral, the pixel average and the
linear-light average **round to the same hex** — listing both would be a duplicate
swatch. In that case, **collapse to a single `<Name> (Dithered)`** entry (plus the two
partials, so 3 total) and note that both averaging methods agree at 8-bit precision.

Mac OS 8's gray dither is the canonical case: `#a5a5a5` + `#969696` at 1:1 → simple
`157.5` and linear-light `157.7`, both rounding to `#9e9e9e`. Grays barely span any gamma
gap, so the methods converge; a wide mix like gray + blue does not.

**Always recompute — never eyeball.** Whether the methods diverge decides 4-vs-3 entries.

### Computing the averages

```js
// per channel c is 0–255; wA + wB = 1 (use 0.5 / 0.5 for a 1:1 dither)
const round = v => Math.round(v);

// 1) simple pixel average (sRGB channel mean)
const simple = (a, b, wA = 0.5, wB = 0.5) => round(a * wA + b * wB);

// 2) linear-light (gamma-corrected) average
const toLin  = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = l => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055) * 255;
const gamma  = (a, b, wA = 0.5, wB = 0.5) => round(toSrgb(toLin(a) * wA + toLin(b) * wB));
```

Apply each to the R, G, B channels of the two source colors. If `simple` and `gamma`
produce the same `#rrggbb`, apply the collapse rule.

## Verify

```bash
npx astro check     # type-checks; the Zod content schema rejects a bad file
npx vitest run      # unit tests
npm run build       # every page still pre-renders
npm run dev         # eyeball /os/<slug> and the swatches
```

## Checklist

1. [ ] Created/edited `src/content/os/<slug>.json` with all required fields.
2. [ ] `hex` values are lowercase `#rrggbb`; at most one color is `default`.
3. [ ] Reused an existing `family`/`type` value unless genuinely new.
4. [ ] `desktopStyle` set (or left `modern`) — see [`adding-a-preview-style.md`](adding-a-preview-style.md).
5. [ ] For any dithered desktop: added the blended entry(ies) + partials, **recomputed** both averages, and applied the collapse rule if they matched.
6. [ ] `npx astro check` and `npx vitest run` pass; eyeballed via `npm run dev`.
