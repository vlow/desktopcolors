import type { DesktopStyle } from "../content/config";

interface Props { hex: string; onColor: string; style: DesktopStyle }

function Icon({ label, onColor }: { label: string; onColor: string }) {
  return (
    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 84px;">
      <div style="width: 52px; height: 44px; background: rgba(255,255,255,0.82); border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.28);" />
      <span style={`font: 400 12px var(--font-ui); color: ${onColor};`}>{label}</span>
    </div>
  );
}

export function DesktopPreview({ hex, onColor, style }: Props) {
  const icons = (
    <div style="position: absolute; left: 4%; top: 5%; display: flex; flex-direction: column; gap: 20px;">
      <Icon label="My Computer" onColor={onColor} />
      <Icon label="Network" onColor={onColor} />
    </div>
  );
  const taskbar = (
    <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 40px; background: rgba(0,0,0,0.16); display: flex; align-items: center; padding: 0 14px;">
      <span style="background: rgba(255,255,255,0.9); color: #1c1917; font: 500 13px var(--font-ui); padding: 6px 16px; border-radius: 6px;">Start</span>
    </div>
  );
  const menubar = (
    <div style="position: absolute; left: 0; right: 0; top: 0; height: 26px; background: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 16px; padding: 0 14px; font: 500 12px var(--font-ui); color: #1c1917;">
      <span></span><span>File</span><span>Edit</span><span>View</span>
    </div>
  );
  const panel = (
    <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 34px; background: rgba(0,0,0,0.2); display: flex; align-items: center; gap: 10px; padding: 0 12px;">
      <span style="width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,0.8);" />
      <span style="width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,0.55);" />
    </div>
  );
  const titlebar = (
    <div style="position: absolute; left: 0; right: 0; top: 0; height: 22px; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font: 500 11px var(--font-ui); color: #1c1917;">
      <span>Workbench</span><span>Amiga</span>
    </div>
  );
  return (
    <div style={`position: absolute; inset: 0; background-color: ${hex}; overflow: hidden;`}>
      {(style === "win9x" || style === "generic") && icons}
      {style === "win9x" && taskbar}
      {style === "macos8" && menubar}
      {(style === "kde" || style === "cde") && panel}
      {style === "amiga" && titlebar}
    </div>
  );
}
