import type { FunctionComponent } from "preact";
import type { DesktopStyle } from "../lib/desktopStyle";

interface Props { hex: string; onColor: string; style: DesktopStyle }

// A chrome part is drawn over the solid-color wallpaper. It receives `onColor`
// (the readable foreground for text placed directly on the wallpaper); parts that
// only draw on their own translucent surface accept it and ignore it.
// To add a preview style, see `docs/adding-a-preview-style.md`.
type ChromePart = FunctionComponent<{ onColor: string }>;

function Icon({ label, onColor }: { label: string; onColor: string }) {
  return (
    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 84px;">
      <div style="width: 52px; height: 44px; background: rgba(255,255,255,0.82); border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.28);" />
      <span style={`font: 400 12px var(--font-ui); color: ${onColor};`}>{label}</span>
    </div>
  );
}

// Desktop icons stacked top-left. Labels sit on the wallpaper, so they use onColor.
const Icons: ChromePart = ({ onColor }) => (
  <div data-testid="chrome-icons" style="position: absolute; left: 4%; top: 5%; display: flex; flex-direction: column; gap: 20px;">
    <Icon label="My Computer" onColor={onColor} />
    <Icon label="Network" onColor={onColor} />
  </div>
);

// Windows 9x bottom taskbar with a Start button.
const Taskbar: ChromePart = () => (
  <div data-testid="chrome-taskbar" style="position: absolute; left: 0; right: 0; bottom: 0; height: 40px; background: rgba(0,0,0,0.16); display: flex; align-items: center; padding: 0 14px;">
    <span style="background: rgba(255,255,255,0.9); color: #1c1917; font: 500 13px var(--font-ui); padding: 6px 16px; border-radius: 6px;">Start</span>
  </div>
);

// Mac OS 8 top menu bar.
const MenuBar: ChromePart = () => (
  <div data-testid="chrome-menubar" style="position: absolute; left: 0; right: 0; top: 0; height: 26px; background: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 16px; padding: 0 14px; font: 500 12px var(--font-ui); color: #1c1917;">
    <span></span><span>File</span><span>Edit</span><span>View</span>
  </div>
);

// KDE / CDE bottom panel with launcher swatches.
const Panel: ChromePart = () => (
  <div data-testid="chrome-panel" style="position: absolute; left: 0; right: 0; bottom: 0; height: 34px; background: rgba(0,0,0,0.2); display: flex; align-items: center; gap: 10px; padding: 0 12px;">
    <span style="width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,0.8);" />
    <span style="width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,0.55);" />
  </div>
);

// Amiga Workbench top title bar.
const TitleBar: ChromePart = () => (
  <div data-testid="chrome-titlebar" style="position: absolute; left: 0; right: 0; top: 0; height: 22px; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font: 500 11px var(--font-ui); color: #1c1917;">
    <span>Workbench</span><span>Amiga</span>
  </div>
);

// --- "modern": the platform-neutral default preview (ported from the source
// design's "Desktop Preview"). A cohesive scene — corner icons, two overlapping
// windows, and a segmented dock with a clock — sized with a capped scale unit (see
// `U` below) so it scales with the preview box but stops growing when enlarged.
// Surface tints are derived from `onColor` (the app's contrast pick), so it reads on
// any wallpaper.

function surfaces(onColor: string) {
  const light = onColor === "#1c1917"; // dark ink ⇒ light wallpaper
  return {
    ink: onColor,
    panel: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.14)",
    win: light ? "rgba(0,0,0,0.11)" : "rgba(255,255,255,0.20)",
    border: light ? "rgba(0,0,0,0.24)" : "rgba(255,255,255,0.34)",
  };
}

// Scale unit for the modern scene. It tracks the preview width (`1cqw`) so the scene
// stays responsive in the small inline preview, but is capped so that when the preview
// is enlarged (the fullscreen viewer on a big screen) the chrome stops growing and the
// wallpaper simply reveals more open desktop — a larger desktop, not a linear zoom.
// The cap sits above the inline preview's ~6px/cqw, so the inline preview is unchanged;
// chrome stays full-bleed (dock pinned to the bottom, icons to the top).
const U = "min(1cqw, 11px)";
const u = (n: number) => `calc(var(--u) * ${n})`;

// Line-art desktop icons in the top-left corner. Labels sit on the wallpaper (onColor).
const DeskIcons: ChromePart = ({ onColor }) => {
  const icons = [
    { label: "Files", d: "M3 6.5 h6 l2 2 h10 v10 h-18 z" },
    { label: "Trash", d: "M5 7 h14 M8 7 v-2 h8 v2 M6.5 7 l1 13 h9 l1 -13" },
  ];
  return (
    <div data-testid="chrome-desk-icons" style={`--u: ${U}; position: absolute; left: ${u(4)}; top: ${u(5)}; display: flex; flex-direction: column; gap: ${u(3)};`}>
      {icons.map((ic) => (
        <div key={ic.label} style={`display: flex; flex-direction: column; align-items: center; gap: ${u(0.8)}; width: ${u(12)};`}>
          <svg viewBox="0 0 24 24" fill="none" stroke={onColor} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style={`width: ${u(6)}; height: ${u(6)};`}><path d={ic.d} /></svg>
          <span style={`font: 500 ${u(2.4)} var(--font-ui); opacity: 0.85; color: ${onColor};`}>{ic.label}</span>
        </div>
      ))}
    </div>
  );
};

// Two overlapping windows (Files behind, Documents in front).
const WindowStack: ChromePart = ({ onColor }) => {
  const { win, border, ink } = surfaces(onColor);
  return (
    <div data-testid="chrome-windows" style={`--u: ${U};`}>
      <div style={`position: absolute; left: ${u(24)}; top: ${u(5)}; width: ${u(46)}; height: ${u(26)}; border-radius: ${u(1.6)}; background: ${win}; box-shadow: inset 0 0 0 ${u(0.3)} ${border}, 0 ${u(2)} ${u(5)} rgba(0,0,0,0.16); overflow: hidden;`}>
        <div style={`height: ${u(6)}; display: flex; align-items: center; padding: 0 ${u(2.4)}; box-shadow: inset 0 ${u(-0.4)} 0 ${ink};`}><span style={`font: 500 ${u(2.6)} var(--font-ui); opacity: 0.75; color: ${ink};`}>Files</span></div>
      </div>
      <div style={`position: absolute; left: ${u(38)}; top: ${u(13)}; width: ${u(52)}; height: ${u(30)}; border-radius: ${u(1.6)}; background: ${win}; box-shadow: inset 0 0 0 ${u(0.3)} ${border}, 0 ${u(3)} ${u(7)} rgba(0,0,0,0.22); overflow: hidden;`}>
        <div style={`height: ${u(6)}; display: flex; align-items: center; padding: 0 ${u(2.4)}; box-shadow: inset 0 ${u(-0.4)} 0 ${ink};`}><span style={`font: 500 ${u(2.6)} var(--font-ui); opacity: 0.8; color: ${ink};`}>Documents</span></div>
        <div style={`padding: ${u(2.4)}; display: flex; flex-direction: column; gap: ${u(1.6)};`}>
          <span style={`height: ${u(1.5)}; width: 80%; border-radius: ${u(1)}; background: ${border};`} />
          <span style={`height: ${u(1.5)}; width: 62%; border-radius: ${u(1)}; background: ${border};`} />
          <span style={`height: ${u(1.5)}; width: 71%; border-radius: ${u(1)}; background: ${border};`} />
        </div>
      </div>
    </div>
  );
};

// Rounded segmented dock with launcher squares and a clock.
const Dock: ChromePart = ({ onColor }) => {
  const { panel, border, ink } = surfaces(onColor);
  return (
    <div data-testid="chrome-dock" style={`--u: ${U}; position: absolute; left: ${u(4)}; right: ${u(4)}; bottom: ${u(4)}; height: ${u(6)}; border-radius: ${u(3)}; background: ${panel}; display: flex; align-items: center; gap: ${u(2.4)}; padding: 0 ${u(3)};`}>
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${ink};`} />
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${border};`} />
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${border};`} />
      <span style={`width: ${u(0.3)}; height: ${u(3)}; background: ${border};`} />
      <span style={`width: ${u(2.4)}; height: ${u(2.4)}; border-radius: ${u(0.6)}; background: ${border};`} />
      <span style={`margin-left: auto; font: 500 ${u(2.8)} var(--font-mono); opacity: 0.9; color: ${ink};`}>10:42</span>
    </div>
  );
};

// Which chrome parts each style draws. The `Record<DesktopStyle, …>` type is
// exhaustive: adding a value to DESKTOP_STYLES fails to compile until it is
// given an entry here — so a style can never silently render a blank preview.
export const STYLE_CHROME: Record<DesktopStyle, ChromePart[]> = {
  modern: [DeskIcons, WindowStack, Dock],
  win9x: [Icons, Taskbar],
  generic: [Icons],
  macos8: [MenuBar],
  kde: [Panel],
  cde: [Panel],
  amiga: [TitleBar],
};

export function DesktopPreview({ hex, onColor, style }: Props) {
  const parts = STYLE_CHROME[style] ?? STYLE_CHROME.generic;
  return (
    <div style={`position: absolute; inset: 0; background-color: ${hex}; overflow: hidden; container-type: inline-size;`}>
      {parts.map((Part, i) => <Part key={i} onColor={onColor} />)}
    </div>
  );
}
