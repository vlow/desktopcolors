import { useState } from "preact/hooks";
import { RESOLUTION_GROUPS, wallpaperFilename, parseDimension } from "../lib/wallpaper";
import { track } from "../lib/track";

export async function generateWallpaper(hex: string, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}

export async function downloadWallpaper(
  osSlug: string, colorName: string, hex: string, w: number, h: number,
): Promise<void> {
  const blob = await generateWallpaper(hex, w, h);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = wallpaperFilename(osSlug, colorName, hex, w, h);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  track({ kind: "download", hex, os: osSlug });
}

interface Props {
  osSlug: string;
  color: { hex: string; name: string };
  onClose: () => void;
  onDownload?: (osSlug: string, colorName: string, hex: string, w: number, h: number) => void;
}

export function DownloadSheet({ osSlug, color, onClose, onDownload = downloadWallpaper }: Props) {
  const [cw, setCw] = useState("");
  const [ch, setCh] = useState("");
  const customW = parseDimension(cw);
  const customH = parseDimension(ch);
  const customValid = customW !== null && customH !== null;

  const stop = (e: Event) => e.stopPropagation();

  return (
    <div onClick={onClose} class="dc-sheet-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 90; display: flex; align-items: center; justify-content: center;">
      <div onClick={stop} class="dc-sheet" style="width: 100%; max-width: 460px; max-height: 92vh; overflow-y: auto; background: var(--bg); border-radius: 18px; padding: 18px 20px 22px; box-shadow: 0 14px 40px rgba(0,0,0,0.25);">
        <div class="dc-sheet-handle" style="width: 44px; height: 5px; border-radius: 3px; background: #d6d3d1; margin: 0 auto 12px;" />
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style={`width: 34px; height: 34px; border-radius: 8px; background-color: ${color.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
            <div>
              <div style="font: 500 15px var(--font-ui);">Download {color.name}</div>
              <div style="font: 400 11px var(--font-mono); color: var(--muted);">{color.hex} · PNG</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style="border: none; background: transparent; cursor: pointer; font-size: 18px; color: var(--faint);">✕</button>
        </div>

        {RESOLUTION_GROUPS.map((g) => (
          <div key={g.label}>
            <div style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1px; margin: 12px 0 7px;">{g.label}</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 7px;">
              {g.items.map((it) => (
                <button
                  key={it.label}
                  onClick={() => onDownload(osSlug, color.name, color.hex, it.w, it.h)}
                  style="border: 1px solid var(--field-border); background: var(--panel); color: var(--ink); cursor: pointer; font: 500 12px var(--font-mono); padding: 9px 8px; border-radius: 9px;"
                >{it.label}</button>
              ))}
            </div>
          </div>
        ))}

        <div style="display: flex; align-items: center; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--card-border);">
          <input value={cw} onInput={(e) => setCw((e.target as HTMLInputElement).value)} placeholder="width" style="flex: 1; border: 1px solid var(--field-border); background: var(--panel); font: 500 12px var(--font-mono); padding: 9px 10px; border-radius: 9px; min-width: 0;" />
          <span style="color: var(--faint);">×</span>
          <input value={ch} onInput={(e) => setCh((e.target as HTMLInputElement).value)} placeholder="height" style="flex: 1; border: 1px solid var(--field-border); background: var(--panel); font: 500 12px var(--font-mono); padding: 9px 10px; border-radius: 9px; min-width: 0;" />
          <button
            disabled={!customValid}
            onClick={() => { if (customValid) onDownload(osSlug, color.name, color.hex, customW!, customH!); }}
            style={`border: none; cursor: ${customValid ? "pointer" : "not-allowed"}; background: ${customValid ? "var(--ink)" : "#cbc7c1"}; color: #fff; font: 500 13px var(--font-ui); padding: 10px 16px; border-radius: 9px;`}
          >Get</button>
        </div>
      </div>
    </div>
  );
}
