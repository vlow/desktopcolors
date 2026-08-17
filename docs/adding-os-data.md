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

> **Mirrored in [`CONTRIBUTING.md`](../CONTRIBUTING.md).** That guide is the
> contributor-facing copy of this material and is deliberately self-contained. **If you
> change the field rules, the color conventions, or the dithering workflow here, update
> `CONTRIBUTING.md` in the same change.**

## The file shape

```json
{
  "name": "BeOS",
  "year": 1995,
  "added": "2026-07-17",
  "family": "BeOS",
  "predecessor": "some-slug",
  "successor": "some-slug",
  "desktopStyle": "beos",
  "colors": [
    { "hex": "#336698", "name": "Steel Blue", "default": true }
  ],
  "type": "Proprietary",
  "wikipedia": "https://en.wikipedia.org/wiki/BeOS"
}
```

| field | required | notes |
|-------|----------|-------|
| `name` | ✅ | Display name. Don't include a `(Demo)`/placeholder suffix once real data lands. |
| `year` | ✅ | Integer release year. |
| `added` | ✅ | `YYYY-MM-DD`, the date the entry was **added to the catalog** — keep the original when you later fill in real data; don't bump it to "today". |
| `family` | ✅ | Groups the OS on Platforms. Reuse an existing value (`Windows`, `Mac OS`, `Amiga`, `Desktop Env.`, …) unless it's genuinely a new family. |
| `slug` | — | Defaults to the filename (`beos.json` → `beos`). |
| `predecessor`, `successor` | — | Slug refs to other entries; a dangling ref fails the build. |
| `desktopStyle` | — | Preview chrome; defaults to `modern`. See [`adding-a-preview-style.md`](adding-a-preview-style.md). |
| `type` | — | `Proprietary` or `Open Source` (reuse existing values). |
| `wikipedia` | — | URL. |
| `project` | — | `{ "name", "url" }` for the OS's own site (open-source projects). |
| `colors` | ✅ | ≥1 entry; **≤1** may be `"default": true`. |

### The retired prose fields

`description` and the per-color `note` still exist in the schema, defaulted to `""`, and
the UI still renders them when set. **No entry carries them any more** — the archive holds
color data, not prose — so don't add them to a new file. Everything they used to say (why
a color matters, where it came from, how a dither is weighted) belongs in the pull request
instead, where the reviewer reads it.

`tagline` is gone outright: out of the schema, out of `OsView`, out of the platform cards.
Zod strips unknown keys instead of rejecting them, so a `"tagline"` left in a file parses
without complaint and is then silently dropped — `src/content/os.test.ts` fails on one to
keep that from going unnoticed.

## Colors

Each color is `{ hex, name, default? }`:

- **`hex`** — `#rrggbb`, lowercase. Convert from RGB by hand or with the snippet below.
  Lowercase is **build-checked** (`/^#[0-9a-f]{6}$/` in `src/content/config.ts`, mirrored
  in `src/content/os.test.ts`): uppercase is harmless at runtime, since every hex is
  lowercased in `toColorView`/`mergeColorsByHex` before it reaches a view, but rejecting
  it keeps the content files single-case and greppable by color code.
- **`name`** — a human name for the swatch. For a family with light/dark variants,
  qualify it: `French Blue (Light)`, `Olive (Dark)`.
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
   `Stone Gray`).
4. **partial B** — the other source color.

Order the two blended entries first, then the two partials. Nothing in the file records
which entries belong to one cluster or how the pattern is weighted — the entry names carry
the structure, and the rest goes in the pull request. Mark the **`(Averaged)`** entry
`default` **only if the dither IS the OS's actual desktop** (as in FreeGEM and
Windows 1.0) — not when it's just one option among several solid colors (as in Mac OS 8,
where the gray dither is one wallpaper and `default` sits on a solid color).

### Weighting

If the pattern isn't 1:1, weight **both** averages by area and state the ratio in the PR.
Windows 1.0 is 75% green / 25% cyan: each 8×8 green block holds a 4×4 cyan patch.

### The collapse rule (→ 3 entries)

When the two source colors are close and/or near-neutral, the pixel average and the
linear-light average **round to the same hex** — listing both would be a duplicate
swatch. In that case, **collapse to a single `<Name> (Dithered)`** entry (plus the two
partials, so 3 total), and say in the PR that both averaging methods agree at 8-bit
precision.

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
npm run build       # authoritative: the content schema + dangling-ref check
npx vitest run      # src/content/os.test.ts re-parses every OS file — fastest feedback
npx astro check     # TypeScript only; passes clean on a broken JSON file
npm run dev         # eyeball /os/<slug> and the swatches
```

Two commands read your JSON, and they are not equivalent. `npm run build` is
authoritative: the Zod schema in `src/content/config.ts` rejects a bad hex, a missing
field, or more than one `default`, and `buildCatalog` (`src/lib/catalog.ts:91`) throws on
a dangling `predecessor`/`successor`. `src/content/os.test.ts` re-validates the same files
under vitest and usually fails first, but against a **hand-maintained duplicate** of the
schema that omits the `wikipedia`, `project`, and `type` rules — keep it in sync when you
change `config.ts`. `astro check` does not read the content collection at all.

## Checklist

1. [ ] Created/edited `src/content/os/<slug>.json` with all required fields.
2. [ ] `hex` values are lowercase `#rrggbb` (build-enforced); at most one color is `default`.
3. [ ] Reused an existing `family`/`type` value unless genuinely new.
4. [ ] `desktopStyle` set (or left `modern`) — see [`adding-a-preview-style.md`](adding-a-preview-style.md).
5. [ ] For any dithered desktop: added the blended entry(ies) + partials, **recomputed** both averages, and applied the collapse rule if they matched.
6. [ ] `npm run build` and `npx vitest run` pass (both validate the JSON; the build is authoritative); eyeballed via `npm run dev`.
