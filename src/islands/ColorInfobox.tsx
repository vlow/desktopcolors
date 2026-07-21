import { useState } from "preact/hooks";
import { hexToRgb, rgbToCmyk } from "../lib/color";
import { colorPath } from "../lib/links";
import { track } from "../lib/track";
import type { Platform } from "../lib/explorer";

export interface InfoboxColor {
  hex: string;
  name: string;
  onColor: string;
  h: number;
  s: number;
  l: number;
  primarySlug: string;
}

interface Props {
  color: InfoboxColor;
  platforms: Platform[];
  variant: "band" | "flat";
  onPreview: () => void;
  onDownload: () => void;
}

type CopyKey = "hex" | "rgb" | "hsl" | "cmyk";

const actionBtns = (onPreview: () => void, onDownload: () => void) => (
  <div style="display: flex; gap: 8px; flex: none;">
    <button onClick={onPreview} style="border: 1px solid var(--field-border); cursor: pointer; background: #fff; color: var(--ink); font: 500 13px var(--font-ui); padding: 10px 15px; border-radius: 10px;">⤢ Preview</button>
    <button onClick={onDownload} style="border: none; cursor: pointer; background: var(--ink); color: #fff; font: 500 13px var(--font-ui); padding: 11px 17px; border-radius: 10px;">↓ Download</button>
  </div>
);

export function ColorInfobox({ color, platforms, variant, onPreview, onDownload }: Props) {
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [r, g, b] = hexToRgb(color.hex);
  const [cy, mg, ye, k] = rgbToCmyk(r, g, b);
  const hh = Math.round(color.h), ss = Math.round(color.s), ll = Math.round(color.l);

  const copy = (key: CopyKey, text: string) => {
    try { navigator.clipboard?.writeText(text)?.catch(() => {}); } catch { /* ignore */ }
    track({ kind: "copy", hex: color.hex, os: color.primarySlug });
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1300);
  };

  const rows: { key: CopyKey; label: string; value: string; toCopy: string }[] = [
    { key: "hex", label: "HEX", value: color.hex.toUpperCase(), toCopy: color.hex.toUpperCase() },
    { key: "rgb", label: "RGB", value: `${r}, ${g}, ${b}`, toCopy: `rgb(${r}, ${g}, ${b})` },
    { key: "hsl", label: "HSL", value: `${hh}°, ${ss}%, ${ll}%`, toCopy: `hsl(${hh}, ${ss}%, ${ll}%)` },
    { key: "cmyk", label: "CMYK", value: `${cy}, ${mg}, ${ye}, ${k}`, toCopy: `cmyk(${cy}%, ${mg}%, ${ye}%, ${k}%)` },
  ];

  const dCount = platforms.filter((p) => p.isDefault).length;
  const countLabel = platforms.length === 1 ? "1 OS" : `${platforms.length} OSes`;
  const defaultLabel = dCount === 0 ? "no default use" : dCount === 1 ? "1 default" : `${dCount} defaults`;

  return (
    <div>
      {variant === "band" ? (
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style={`width: 40px; height: 40px; border-radius: 9px; background-color: ${color.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); flex: none;`} />
            <div>
              <div style="font: 500 15px var(--font-ui);">{color.name} <span style="font: 400 12px var(--font-mono); color: var(--faint);">{color.hex.toUpperCase()}</span></div>
              <div style="font: 400 11px var(--font-mono); color: var(--faint); margin-top: 2px;">Shipped by {countLabel} · {defaultLabel}</div>
            </div>
          </div>
          {actionBtns(onPreview, onDownload)}
        </div>
      ) : (
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap;">
          <div style="font: 400 11px var(--font-mono); color: var(--faint);">Shipped by {countLabel} · {defaultLabel}</div>
          {actionBtns(onPreview, onDownload)}
        </div>
      )}

      <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; background: #fff; margin-bottom: 14px;">
        <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 6px;">COLOR VALUES · CLICK TO COPY</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 14px 14px;">
          {rows.map((row) => (
            <span key={row.key} data-testid={`copy-${row.key}`} title={`Copy ${row.label}`} onClick={() => copy(row.key, row.toCopy)} style="display: inline-flex; align-items: center; gap: 9px; border: 1px solid var(--card-border); border-radius: 8px; padding: 7px 11px; cursor: pointer;">
              <span style="font: 400 9px var(--font-mono); letter-spacing: 1px; color: var(--faint);">{row.label}</span>
              <span style="font: 500 13px var(--font-mono); color: var(--ink);">{row.value}</span>
              <span style={`font: 500 10px var(--font-mono); width: 60px; text-align: right; color: ${copied === row.key ? "var(--accent-strong)" : "#cbc7c1"};`}>{copied === row.key ? "Copied ✓" : "Copy"}</span>
            </span>
          ))}
        </div>
      </div>

      <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-bottom: 7px;">SHIPPED ON THESE PLATFORMS</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px;">
        {platforms.map((p) => (
          <a key={p.slug} href={colorPath(p.slug, color.hex)} data-testid="infobox-platform" style={`text-decoration: none; color: var(--ink); display: flex; align-items: center; gap: 10px; padding: 8px 11px; border-radius: 9px; border: 1px solid ${p.isDefault ? "var(--accent)" : "var(--card-border)"}; background: ${p.isDefault ? "var(--accent-tint)" : "var(--panel)"};`}>
            <span style={`width: 16px; height: 16px; border-radius: 4px; background-color: ${color.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15); flex: none;`} />
            <span style="flex: 1; min-width: 0; font: 500 13px var(--font-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{p.name}</span>
            {p.isDefault && <span style="flex: none; background: var(--accent-tint); color: var(--accent-strong); font: 600 8px var(--font-ui); letter-spacing: 0.5px; padding: 3px 7px; border-radius: 999px;">DEFAULT</span>}
            <span style="font: 500 11px var(--font-mono); color: var(--faint); flex: none;">{p.year}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
