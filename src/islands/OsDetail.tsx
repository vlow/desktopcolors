import { useEffect, useRef, useState } from "preact/hooks";
import type { OsDetailView, DetailColor } from "../lib/detail";
import { DesktopPreview } from "./DesktopPreview";
import { FullscreenPreview } from "./FullscreenPreview";
import { DownloadSheet } from "./DownloadSheet";
import { track } from "../lib/track";
import { colorPath } from "../lib/links";

interface Props { view: OsDetailView; initialHex?: string | null }

type CopyKey = "hex" | "rgb" | "hsl" | "cmyk" | "ral" | "ralDesign";

export function OsDetail({ view, initialHex }: Props) {
  const { os, colors, eraPeers } = view;

  // The selected color comes from the server-provided `initialHex` — it is baked
  // into the URL path (/os/<slug>/<hex>), so server and client render identically
  // from the very first paint. No `window`/query reading, so no hydration
  // mismatch and no flash of the default color.
  const idxOfHex = (hex?: string | null): number => {
    if (!hex) return 0;
    const i = colors.findIndex((c) => c.hex.toLowerCase() === hex.toLowerCase());
    return i >= 0 ? i : 0;
  };

  const [sel, setSel] = useState(() => idxOfHex(initialHex));
  const [sheet, setSheet] = useState(false);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState<CopyKey | null>(null);

  useEffect(() => { track({ kind: "osview", os: os.slug }); }, [os.slug]);

  const c: DetailColor = colors[sel] ?? colors[0];

  // Keep the URL in sync with the selected color so it can be copied/shared.
  // Skip the initial mount so the entry URL (a default page or a deep link) is
  // left untouched; replaceState (not push) avoids polluting the back history.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    try {
      window.history.replaceState(window.history.state, "", colorPath(os.slug, c.hex));
    } catch { /* ignore */ }
  }, [sel]);

  const copy = (key: CopyKey, text: string) => {
    try { navigator.clipboard?.writeText(text)?.catch(() => {}); } catch { /* ignore */ }
    track({ kind: "copy", hex: c.hex, os: os.slug });
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1300);
  };

  const step = (d: number) => setSel((s) => (s + d + colors.length) % colors.length);

  const copyRow = (key: CopyKey, label: string, value: string, toCopy: string, swatch?: string) => (
    <div data-testid={`copy-${key}`} onClick={() => copy(key, toCopy)} title={`Copy ${label}`}
      style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 14px; cursor: pointer;">
      <span style="font: 400 11px var(--font-mono); color: var(--faint);">{label}</span>
      <span style="display: inline-flex; align-items: center; gap: 10px;">
        {swatch && <span style={`width: 11px; height: 11px; border-radius: 3px; background-color: ${swatch}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);`} />}
        <span style="font: 500 13px var(--font-mono);">{value}</span>
        <span style={`font: 500 10px var(--font-mono); width: 52px; text-align: right; color: ${copied === key ? "oklch(0.55 0.15 150)" : "#cbc7c1"};`}>{copied === key ? "Copied ✓" : "Copy"}</span>
      </span>
    </div>
  );

  return (
    <div class="dc-detail dc-page-x" style="padding-block: 18px 56px;">
      <a href="/" style="font: 400 13px var(--font-mono); color: var(--faint);">← Browse all platforms</a>
      <div style="font: 400 12px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-top: 14px;">{os.family} · {os.year}</div>
      <h1 style="font: 700 36px var(--font-ui); letter-spacing: -0.8px; margin: 6px 0 8px;">{os.name}</h1>
      <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 680px; margin: 0 0 16px;">{os.description}</p>

      <div style="display: flex; gap: 8px; margin-bottom: 22px;">
        {os.predecessor && <a href={`/os/${os.predecessor.slug}`} style="border: 1px solid var(--card-border); border-radius: 9px; background: var(--panel); padding: 8px 13px; font: 500 13px var(--font-ui);">← {os.predecessor.name}</a>}
        {os.successor && <a href={`/os/${os.successor.slug}`} style="border: 1px solid var(--card-border); border-radius: 9px; background: var(--panel); padding: 8px 13px; font: 500 13px var(--font-ui);">{os.successor.name} →</a>}
      </div>

      <div class="dc-detail-hero" style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 28px; align-items: stretch; min-height: 372px;">
        <div style="border-radius: 14px; overflow: hidden; border: 1px solid var(--field-border); box-shadow: 0 10px 28px rgba(0,0,0,0.12); background: var(--panel); display: flex; flex-direction: column; min-height: 340px;">
          <div style="height: 28px; background: #f0eeec; border-bottom: 1px solid var(--field-border); display: flex; align-items: center; gap: 9px; padding: 0 12px; flex: none;">
            <span style="width: 13px; height: 10px; border-radius: 2px; background: #cbc7c1;" />
            <span style="font: 500 11px var(--font-ui); color: #78716c;">Preview</span>
            <span style="margin-left: auto; font: 400 11px var(--font-mono); color: var(--faint);">{c.hex}</span>
          </div>
          <div style="position: relative; flex: 1; min-height: 0;">
            <DesktopPreview hex={c.hex} onColor={c.onColor} style={os.desktopStyle} />
            <button onClick={() => setFull(true)} style="position: absolute; top: 12px; right: 12px; z-index: 2; cursor: pointer; background: rgba(255,255,255,0.92); border: none; border-radius: 9px; padding: 8px 12px; font: 500 12px var(--font-ui);">⤢ Expand</button>
          </div>
        </div>
        <div style="border: 1px solid var(--card-border); border-radius: 14px; background: var(--panel); overflow: hidden; display: flex; flex-direction: column;">
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--card-border); display: flex; align-items: baseline; justify-content: space-between; gap: 12px;">
            <span style="font: 500 14px var(--font-ui);">All colors</span>
            <span style="font: 400 11px var(--font-mono); color: var(--faint);">{os.colorCount} · click to preview</span>
          </div>
          <div style="flex: 1; overflow-y: auto; padding: 8px; max-height: 320px;">
            {colors.map((col, i) => (
              <div key={col.hex} onClick={() => setSel(i)} style={`cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 9px; background: ${i === sel ? "oklch(0.96 0.03 255)" : "transparent"};`}>
                <div style={`width: 32px; height: 32px; border-radius: 7px; background-color: ${col.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                <div style="flex: 1;">
                  <div style="font: 500 13px var(--font-ui);">{col.name}</div>
                  <div style="font: 400 11px var(--font-mono); color: var(--faint);">{col.hex} · idx {col.index}</div>
                </div>
                {col.isDefault && <span title="Default" style="width: 7px; height: 7px; border-radius: 50%; background: var(--accent);" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style="border: 1px solid var(--card-border); border-radius: 12px; background: var(--panel); padding: 18px 20px; margin-top: 20px;">
        <div class="dc-detail-selrow" style="display: flex; align-items: center; gap: 14px;">
          <div style={`width: 48px; height: 48px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
          <div style="flex: 1;">
            <div style="display: inline-flex; align-items: center; gap: 9px;">
              <span style="font: 500 20px var(--font-ui);">{c.name}</span>
              {c.isDefault && <span style="background: oklch(0.96 0.03 255); color: var(--accent-strong); font: 600 9px var(--font-ui); letter-spacing: 0.5px; padding: 4px 8px; border-radius: 999px;">DEFAULT</span>}
            </div>
            <div style="font: 400 12px var(--font-mono); color: var(--muted); margin-top: 2px;">{c.note}</div>
          </div>
          <button class="dc-detail-dl" onClick={() => setSheet(true)} style="border: none; cursor: pointer; background: var(--ink); color: #fff; font: 500 13px var(--font-ui); padding: 11px 17px; border-radius: 10px;">↓ Download</button>
        </div>

        <div class="dc-detail-meta" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;">
          <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
            <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 5px;">DETAILS</div>
            <div style="display: flex; justify-content: space-between; padding: 7px 14px;"><span style="font: 400 11px var(--font-mono); color: var(--faint);">Palette index</span><span style="font: 500 13px var(--font-mono);">{c.index}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 7px 14px 11px;"><span style="font: 400 11px var(--font-mono); color: var(--faint);">First known use</span>{c.firstUse.self ? <span style="font: 500 13px var(--font-mono); color: var(--accent-strong);">{c.firstUse.name} · {c.firstUse.year}</span> : <a href={c.firstUse.href} style="font: 500 13px var(--font-mono); color: var(--accent-strong);">{c.firstUse.name} · {c.firstUse.year} ↗</a>}</div>
          </div>
          <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
            <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 5px;">COLOR VALUES · CLICK TO COPY</div>
            {copyRow("hex", "HEX", c.hex, c.hex)}
            {copyRow("rgb", "RGB", c.rgb, `rgb(${c.rgb})`)}
            {copyRow("hsl", "HSL", c.hsl, c.hsl)}
            {copyRow("cmyk", "CMYK", c.cmyk, `cmyk(${c.cmyk.replace(/ /g, ", ")})`)}
            {copyRow("ral", "Closest RAL Classic", `${c.ral.code} · ${c.ral.name}`, `${c.ral.code} · ${c.ral.name}`, c.ral.hex)}
            {copyRow("ralDesign", "Closest RAL Design+", `${c.ralDesign.code} · ${c.ralDesign.name}`, `${c.ralDesign.code} · ${c.ralDesign.name}`, c.ralDesign.hex)}
          </div>
        </div>
      </div>

      <div style="border-top: 1px solid var(--hairline); margin-top: 34px; padding-top: 26px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 18px;">
          <h2 style="font: 500 20px var(--font-ui); margin: 0;">Similar colors elsewhere</h2>
          <span style="font: 400 12px var(--font-mono); color: var(--faint);">closest to {c.name} · {c.hex}</span>
        </div>
        {c.similar.length === 0 ? (
          <div style="font: 400 13px var(--font-mono); color: var(--faint);">No close matches on other platforms.</div>
        ) : (
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px;">
            {c.similar.map((s) => (
              <a key={s.hex + s.osSlug} href={s.href} style="border: 1px solid var(--card-border); border-radius: 13px; overflow: hidden; background: var(--panel); display: block;">
                <div style={`position: relative; height: 76px; background-color: ${s.hex};`}>
                  <span style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); color: #1c1917; font: 500 10px var(--font-ui); padding: 3px 8px; border-radius: 999px;">{s.match}% match</span>
                </div>
                <div style="padding: 11px 13px 13px;">
                  <div style="font: 500 14px var(--font-ui);">{s.name}</div>
                  <div style="font: 400 11px var(--font-mono); color: var(--faint);">{s.hex}</div>
                  <div style="font: 400 12px var(--font-ui); color: var(--muted); margin-top: 8px;">{s.osName} ↗</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      <div style="border-top: 1px solid var(--hairline); margin-top: 34px; padding-top: 26px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 18px;">
          <h2 style="font: 500 20px var(--font-ui); margin: 0;">Colors of the same era</h2>
          <span style="font: 400 12px var(--font-mono); color: var(--faint);">platforms released around {os.year} · popular defaults</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px;">
          {eraPeers.map((e) => (
            <a key={e.slug} href={e.href} style="border: 1px solid var(--card-border); border-radius: 13px; overflow: hidden; background: var(--panel); display: block;">
              <div style={`position: relative; height: 88px; background-color: ${e.hex};`}>
                <span style={`position: absolute; top: 8px; left: 10px; font: 500 12px var(--font-ui); color: ${e.onColor};`}>{e.colorName}</span>
                <span style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); color: #1c1917; font: 500 10px var(--font-mono); padding: 3px 8px; border-radius: 999px;">{e.rel}</span>
              </div>
              <div style="padding: 11px 13px 13px;">
                <div style="font: 500 14px var(--font-ui);"><span>{e.name}</span> ↗</div>
                <div style="font: 400 11px var(--font-mono); color: var(--faint);">{e.year} · {e.family}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {sheet && <DownloadSheet osSlug={os.slug} color={{ hex: c.hex, name: c.name }} onClose={() => setSheet(false)} />}
      {full && (
        <FullscreenPreview
          hex={c.hex} onColor={c.onColor} style={os.desktopStyle}
          label={`${os.name} · ${c.name} · ${c.hex}`}
          pos={sel + 1} total={colors.length}
          onClose={() => setFull(false)} onPrev={() => step(-1)} onNext={() => step(1)}
        />
      )}
    </div>
  );
}
