# Similar-color preview navigation

## Goal

On the OS details page, when the user opens a fullscreen preview from the
"Similar colors elsewhere" pane, let them switch between colors in that same
pane using the existing left/right previous/next mechanism (arrow buttons and
arrow keys), exactly as the main "All colors" preview already allows.

Additionally, the expanded info panel below the pane (the `ColorInfobox` for a
similar color) **follows the preview**: as the user steps through similar
colors in fullscreen, the panel tracks the same color, so on close the panel
reflects wherever they landed.

## Current behavior

In `src/islands/OsDetail.tsx`:

- The **main preview** (`full`) steps through `colors` via `step(d)`
  (`(s + d + colors.length) % colors.length`, wrapping) and renders
  `FullscreenPreview` with `pos={sel + 1} total={colors.length}` plus working
  `onPrev`/`onNext`.
- The **similar-color preview** (`simPreview: SimilarView | null`) renders
  `FullscreenPreview` with `pos={1} total={1}` and no-op `onPrev`/`onNext`. It
  is opened from within an expanded `ColorInfobox` panel via `onPreview`.
- `simExp: string | null` holds the hex of the currently expanded similar-color
  card. It drives the card's selected outline and which `ColorInfobox` renders.

So there are two overlapping pieces of state for similar colors: `simExp` (the
expanded card's hex) and `simPreview` (the full object shown in fullscreen).

## Approach

Make `simExp` the **single source of truth** for "which similar color is
current," and replace `simPreview` with a boolean `simFull` ("is the similar
fullscreen open"). One cursor drives both the fullscreen preview and the
expanded panel, so "follow the preview" needs no extra syncing wiring.

Rejected alternative: a separate `simPreviewIdx` plus an effect to keep it in
sync with `simExp`. That is redundant state — since the panel must follow the
preview, a single cursor is simpler and cannot drift.

## Design

All changes are in `src/islands/OsDetail.tsx` (plus tests). `FullscreenPreview`,
`detail.ts`, and `ColorInfobox` are unchanged.

### State

- Remove `const [simPreview, setSimPreview] = useState<SimilarView | null>(null)`.
- Add `const [simFull, setSimFull] = useState(false)`.
- `simExp: string | null` stays and becomes the shared cursor.

### Opening the preview

`ColorInfobox`'s `onPreview` sets `simFull = true`. The card is already
expanded when the preview button is visible, so `simExp` already points at the
correct color — no need to set it here.

### Navigation

Add a helper mirroring the existing `step`:

```ts
const stepSim = (d: number) => {
  const n = c.similar.length;
  if (n === 0) return;
  const i = c.similar.findIndex((x) => x.hex === simExp);
  const next = ((i < 0 ? 0 : i) + d + n) % n;
  setSimExp(c.similar[next].hex);
};
```

Because `simExp` also drives the expanded card outline and which
`ColorInfobox` renders, updating it makes the panel below follow automatically,
including after the fullscreen is closed.

### Fullscreen render block

Replace the `simPreview && (...)` block with logic that derives the current
similar color from `simExp`:

```tsx
{simFull && (() => {
  const idx = c.similar.findIndex((x) => x.hex === simExp);
  const cur = idx >= 0 ? c.similar[idx] : null;
  if (!cur) return null;
  return (
    <FullscreenPreview
      hex={cur.hex} onColor={cur.onColor} style={cur.style}
      label={`${cur.name} · ${cur.hex}`}
      pos={idx + 1} total={c.similar.length}
      onClose={() => setSimFull(false)}
      onPrev={() => stepSim(-1)} onNext={() => stepSim(1)}
    />
  );
})()}
```

`onClose` leaves `simExp` intact, so the expanded panel stays on the color the
user landed on.

### Download sheet

`simSheet` is unchanged: it is still opened per-card from the infobox with its
own `SimilarView` object via `onDownload`.

## Edge cases

- **Single similar color** (`c.similar.length === 1`): prev/next wrap to the
  same color (harmless, matches the main preview's wrap behavior).
- **Selected page color changes**: cannot happen while the fullscreen is open;
  the existing `useEffect(() => setSimExp(null), [sel])` still applies otherwise.
- **`simExp` not found in `c.similar`**: the render guard returns `null`, so no
  broken fullscreen is shown.

## Testing

Add tests to `src/islands/OsDetail.test.tsx`. The existing fixture has only one
similar color on the default (Teal); extend the fixture (or add a dedicated
one) so the selected color has at least two similar colors to exercise
navigation. Cover:

1. Opening the similar preview shows `pos / total` reflecting the list length
   (e.g. `1 / 2`), not `1 / 1`.
2. Clicking next (or pressing ArrowRight) advances the fullscreen preview to the
   next similar color's hex and updates `pos`.
3. The expanded panel below follows — after navigating, the `ColorInfobox`
   reflects the newly-current similar color.
4. Closing the preview leaves the expanded panel on the landed color.
