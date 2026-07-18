import { useEffect } from "preact/hooks";
import type { DesktopStyle } from "../lib/desktopStyle";
import { DesktopPreview } from "./DesktopPreview";

interface Props {
  hex: string; onColor: string; style: DesktopStyle;
  label: string; pos: number; total: number;
  onClose: () => void; onPrev: () => void; onNext: () => void;
  detailHref?: string;
}

const btn =
  "position: absolute; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.92); border: none; border-radius: 10px; padding: 10px 15px; font: 500 13px var(--font-ui); color: #1c1917; box-shadow: 0 2px 10px rgba(0,0,0,0.2);";

export function FullscreenPreview(props: Props) {
  const { hex, onColor, style, label, pos, total, onClose, onPrev, onNext, detailHref } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") { e.preventDefault(); onNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div style="position: fixed; inset: 0; z-index: 100;">
      <DesktopPreview hex={hex} onColor={onColor} style={style} />
      {detailHref ? (
        <a
          href={detailHref}
          title="Open detail page"
          style="position: absolute; top: 22px; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 9px; background: rgba(255,255,255,0.92); border-radius: 999px; padding: 8px 8px 8px 18px; font: 500 13px var(--font-ui); color: #1c1917; box-shadow: 0 2px 10px rgba(0,0,0,0.2);"
        >
          {label}
          <span style="display: inline-flex; align-items: center; gap: 5px; background: var(--ink); color: #fff; border-radius: 999px; padding: 4px 11px; font: 500 12px var(--font-ui);">Details <span style="font-size: 13px; line-height: 1;">→</span></span>
        </a>
      ) : (
        <div style="position: absolute; top: 22px; left: 50%; transform: translateX(-50%); background: rgba(255,255,255,0.92); border-radius: 999px; padding: 8px 18px; font: 500 13px var(--font-ui); color: #1c1917; box-shadow: 0 2px 10px rgba(0,0,0,0.2);">{label}</div>
      )}
      <button onClick={onClose} title="Close (Esc)" aria-label="Close" style={`${btn} top: 20px; right: 22px;`}>✕ Close</button>
      <button onClick={onPrev} title="Previous (←)" aria-label="Previous color" style={`${btn} top: 50%; left: 22px; transform: translateY(-50%); width: 44px; height: 44px; justify-content: center; font-size: 20px;`}>‹</button>
      <button onClick={onNext} title="Next (→)" aria-label="Next color" style={`${btn} top: 50%; right: 22px; transform: translateY(-50%); width: 44px; height: 44px; justify-content: center; font-size: 20px;`}>›</button>
      <div style="position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.28); color: #fff; font: 500 12px var(--font-mono); padding: 5px 13px; border-radius: 999px;">{pos} / {total}</div>
    </div>
  );
}
