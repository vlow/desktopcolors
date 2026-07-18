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

// Which chrome parts each style draws. The `Record<DesktopStyle, …>` type is
// exhaustive: adding a value to DESKTOP_STYLES fails to compile until it is
// given an entry here — so a style can never silently render a blank preview.
export const STYLE_CHROME: Record<DesktopStyle, ChromePart[]> = {
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
    <div style={`position: absolute; inset: 0; background-color: ${hex}; overflow: hidden;`}>
      {parts.map((Part, i) => <Part key={i} onColor={onColor} />)}
    </div>
  );
}
