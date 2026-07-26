// Placeholder shown in the heavy detail panels (Similar colors, extended
// formats, known-uses timeline) while a non-initial color's detail is still
// being fetched. The lightweight panels (preview, swatch list, HEX/RGB/HSL/CMYK)
// never use this — they render instantly from os.colors.
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div data-testid="heavy-skeleton" aria-hidden="true"
      style="border: 1px solid var(--card-border); border-radius: 12px; background: var(--panel); padding: 18px; min-height: 88px; display: flex; align-items: center; justify-content: center;">
      <span style="font: 400 12px var(--font-mono); color: var(--faint);">Loading {label}…</span>
    </div>
  );
}
