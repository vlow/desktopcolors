import type { ComponentChildren } from "preact";
import type { DesktopStyle } from "../lib/desktopStyle";
import { CHROME_SPECS, type ChromePart, type WindowBody } from "../lib/chromeSpec";

interface Props { hex: string; onColor: string; style: DesktopStyle }

/* ────────────────────────────────────────────────────────────────────────
   MODERN scene — the platform-neutral default. Preserved verbatim (only the
   component identifiers are prefixed `Modern*` to avoid clashing with the
   family primitives below). Its surfaces()/U/u are private to this block.
   ──────────────────────────────────────────────────────────────────────── */

function surfaces(onColor: string) {
  const light = onColor === "#1c1917";
  return {
    ink: onColor,
    panel: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.14)",
    win: light ? "rgba(0,0,0,0.11)" : "rgba(255,255,255,0.20)",
    border: light ? "rgba(0,0,0,0.24)" : "rgba(255,255,255,0.34)",
  };
}
const U = "min(1cqw, 11px)";
const u = (n: number) => `calc(var(--u) * ${n})`;

const ModernDeskIcons = ({ onColor }: { onColor: string }) => {
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

const ModernWindowStack = ({ onColor }: { onColor: string }) => {
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

const ModernDock = ({ onColor }: { onColor: string }) => {
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

const ModernScene = ({ onColor }: { onColor: string }) => (
  <>
    <ModernDeskIcons onColor={onColor} />
    <ModernWindowStack onColor={onColor} />
    <ModernDock onColor={onColor} />
  </>
);

/* ────────────────────────────────────────────────────────────────────────
   FAMILY chrome — translucent, wallpaper-adaptive primitives (design 4a).
   Surfaces + scale unit are separate from modern's so modern stays identical.
   ──────────────────────────────────────────────────────────────────────── */

function chromeSurfaces(onColor: string) {
  const light = onColor === "#1c1917";
  return {
    ink: onColor,
    panel: light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.14)",
    win: light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.20)",
    border: light ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.34)",
    soft: light ? "rgba(0,0,0,0.13)" : "rgba(255,255,255,0.26)",
  };
}
type Surfaces = ReturnType<typeof chromeSurfaces>;
const cu = (n: number) => `calc(min(1cqw, 9px) * ${n})`;

const ICON_PATHS: Record<string, string[]> = {
  computer: ["M3 5.5 h18 v10 h-18 z", "M9 19.5 h6", "M12 15.5 v4"],
  folder: ["M3 7 h6 l2 2 h10 v9 h-18 z"],
  trash: ["M5 7 h14", "M8 7 v-2 h8 v2", "M7 7 l1 12 h8 l1 -12"],
  drive: ["M4 6 h16 v12 h-16 z", "M7 10 h4", "M7 14 h10"],
  disk: ["M5 4 h11 l4 4 v12 h-19 v-16 z", "M8 4 v5 h6 v-5", "M8 13 h8 v7 h-8 z"],
};

const LineIcon = ({ kind, onColor, size = 6 }: { kind: string; onColor: string; size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={onColor} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style={{ width: cu(size), height: cu(size), opacity: 0.9 }}>
    {(ICON_PATHS[kind] ?? ICON_PATHS.folder).map((d, i) => <path key={i} d={d} />)}
  </svg>
);

const Dots = ({ S, n }: { S: Surfaces; n: number }) => (
  <div style={{ display: "flex", gap: cu(1) }}>
    {Array.from({ length: n }).map((_, i) => <span key={i} style={{ width: cu(1.8), height: cu(1.8), borderRadius: "50%", boxShadow: `inset 0 0 0 ${cu(0.35)} ${S.border}` }} />)}
  </div>
);

const Pane = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div style={{ background: S.panel, borderRadius: cu(1.4), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }}>
      <div style={{ height: cu(4), boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}`, display: "flex", alignItems: "center", padding: `0 ${cu(1.4)}` }}>
        <span style={{ width: cu(8), height: cu(1.3), borderRadius: cu(0.8), background: S.soft }} />
      </div>
      <div style={{ padding: cu(1.4), display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: cu(1.6), justifyItems: "center" }}>
        {["folder", "folder", "folder", "disk", "drive", "folder"].map((k, i) => <LineIcon key={i} kind={k} onColor={onColor} size={4} />)}
      </div>
    </div>
  );
};

const WindowBodyView = ({ body, onColor }: { body: WindowBody; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  if (body.kind === "gridIcons") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${body.cols}, 1fr)`, gap: cu(1.6), justifyItems: "center" }}>
        {body.icons.map((k, i) => <LineIcon key={i} kind={k} onColor={onColor} size={4} />)}
      </div>
    );
  }
  if (body.kind === "rows") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: cu(1.4) }}>
        {body.widths.map((w, i) => <span key={i} style={{ height: cu(1.4), width: `${w}%`, borderRadius: cu(0.8), background: S.border }} />)}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(2) }}>
      <Pane onColor={onColor} /><Pane onColor={onColor} />
    </div>
  );
};

const DeskIcons = ({ side, anchor = "top", icons, onColor }: { side: "left" | "right"; anchor?: "top" | "bottom"; icons: { kind: string; label: string }[]; onColor: string }) => {
  const pos = side === "right" ? { right: cu(4.5) } : { left: cu(4) };
  const vert = anchor === "bottom" ? { bottom: cu(11) } : { top: cu(6) };
  return (
    <div data-testid="chrome-deskicons" style={{ position: "absolute", ...vert, ...pos, display: "flex", flexDirection: "column", gap: cu(3.2), alignItems: "center" }}>
      {icons.map((ic, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: cu(0.9), width: cu(13) }}>
          <LineIcon kind={ic.kind} onColor={onColor} size={6} />
          <span style={{ font: `500 ${cu(2.4)} var(--font-ui)`, color: onColor, opacity: 0.85, textAlign: "center", lineHeight: 1.15 }}>{ic.label}</span>
        </div>
      ))}
    </div>
  );
};

const SharedWindow = ({ left, top, w, body, onColor }: { left: number; top: number; w: number; body: WindowBody; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-window" style={{ position: "absolute", left: cu(left), top: cu(top), width: cu(w), background: S.win, borderRadius: cu(1.8), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}, 0 ${cu(2.4)} ${cu(6)} rgba(0,0,0,0.18)`, overflow: "hidden" }}>
      <div style={{ height: cu(5.5), display: "flex", alignItems: "center", gap: cu(1.2), padding: `0 ${cu(2)}`, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}` }}>
        <span style={{ width: cu(12), height: cu(1.5), borderRadius: cu(0.8), background: S.soft }} />
        <span style={{ flex: 1 }} />
        <Dots S={S} n={3} />
      </div>
      <div style={{ padding: cu(2.2) }}><WindowBodyView body={body} onColor={onColor} /></div>
    </div>
  );
};

const BeosWindow = ({ left, top, w, body, onColor }: { left: number; top: number; w: number; body: WindowBody; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-beoswindow" style={{ position: "absolute", left: cu(left), top: cu(top), width: cu(w) }}>
      <div style={{ width: cu(22), height: cu(4.4), borderRadius: `${cu(1.6)} ${cu(1.6)} 0 0`, background: S.win, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.2), padding: `0 ${cu(1.8)}` }}>
        <span style={{ width: cu(9), height: cu(1.5), borderRadius: cu(0.8), background: S.soft }} />
      </div>
      <div style={{ background: S.win, borderRadius: `0 ${cu(1.6)} ${cu(1.6)} ${cu(1.6)}`, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}, 0 ${cu(2.4)} ${cu(6)} rgba(0,0,0,0.18)`, padding: cu(2.2) }}>
        <WindowBodyView body={body} onColor={onColor} />
      </div>
    </div>
  );
};

// Mac OS 8 "Platinum" window: a close box at the left, horizontal pinstripe
// "racing stripes" that break around a centered title block, and a zoom +
// collapse box pair at the right — the signature decorations that distinguish
// Platinum from the generic SharedWindow.
const PlatinumBox = ({ S }: { S: Surfaces }) => (
  <span style={{ position: "relative", width: cu(2.8), height: cu(2.8), borderRadius: cu(0.5), background: S.win, boxShadow: `inset 0 0 0 ${cu(0.35)} ${S.border}` }} />
);

const PlatinumWindow = ({ left, top, w, body, onColor }: { left: number; top: number; w: number; body: WindowBody; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  // The pinstripes are drawn as two layers — left of the centered title and right
  // of it — so the lines genuinely break around the title (clean window fill in
  // the gap) rather than being masked by an overlay. Each layer is inset from the
  // controls so stripes never touch the close/zoom/collapse boxes. `gap` = half
  // the clear space kept on either side of the title block.
  const stripes = `repeating-linear-gradient(to bottom, ${S.border} 0, ${S.border} ${cu(0.3)}, transparent ${cu(0.3)}, transparent ${cu(0.8)})`;
  const gap = cu(8); // distance from centre to where the stripes resume
  return (
    <div data-testid="chrome-platinumwindow" style={{ position: "absolute", left: cu(left), top: cu(top), width: cu(w), background: S.win, borderRadius: `${cu(1.2)} ${cu(1.2)} ${cu(0.5)} ${cu(0.5)}`, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}, 0 ${cu(2.4)} ${cu(6)} rgba(0,0,0,0.18)`, overflow: "hidden" }}>
      <div style={{ position: "relative", height: cu(5.5), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${cu(1.8)}`, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}` }}>
        <div style={{ position: "absolute", left: cu(5.2), right: `calc(50% + ${gap})`, top: cu(1), bottom: cu(1), backgroundImage: stripes }} />
        <div style={{ position: "absolute", left: `calc(50% + ${gap})`, right: cu(9), top: cu(1), bottom: cu(1), backgroundImage: stripes }} />
        <PlatinumBox S={S} />
        <div style={{ display: "flex", gap: cu(1) }}>
          <PlatinumBox S={S} /><PlatinumBox S={S} />
        </div>
        <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: cu(12), height: cu(1.6), borderRadius: cu(0.8), background: S.soft }} />
      </div>
      <div style={{ padding: cu(2.2) }}><WindowBodyView body={body} onColor={onColor} /></div>
    </div>
  );
};

// A "gadget box" window: the title bar carries a single square gadget at the
// left, a centered title, and one or more square gadgets at the right — squarer
// corners than the rounded generic SharedWindow. Both CDE/Motif (a minimize +
// maximize pair — two right) and GEM (a single sizer — one right) draw this
// shape, differing only in `rightBoxes`.
const GadgetWindow = ({ testid, left, top, w, body, rightBoxes, onColor }: { testid: string; left: number; top: number; w: number; body: WindowBody; rightBoxes: number; onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid={testid} style={{ position: "absolute", left: cu(left), top: cu(top), width: cu(w), background: S.win, borderRadius: cu(0.8), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}, 0 ${cu(2.4)} ${cu(6)} rgba(0,0,0,0.18)`, overflow: "hidden" }}>
      <div style={{ position: "relative", height: cu(5.5), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${cu(1.8)}`, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}` }}>
        <PlatinumBox S={S} />
        <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: cu(14), height: cu(1.6), borderRadius: cu(0.8), background: S.soft }} />
        <div style={{ display: "flex", gap: cu(1) }}>
          {Array.from({ length: rightBoxes }).map((_, i) => <PlatinumBox key={i} S={S} />)}
        </div>
      </div>
      <div style={{ padding: cu(2.2) }}><WindowBodyView body={body} onColor={onColor} /></div>
    </div>
  );
};

const Taskbar = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-taskbar" style={{ position: "absolute", left: cu(3), right: cu(3), bottom: cu(3), height: cu(6.4), borderRadius: cu(2), background: S.panel, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.6), padding: `0 ${cu(2)}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(0.6), width: cu(3.2), height: cu(3.2) }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ borderRadius: cu(0.4), background: S.ink, opacity: 0.85 }} />)}
      </div>
      <span style={{ width: cu(0.4), height: cu(4), background: S.border }} />
      <span style={{ width: cu(9), height: cu(3), borderRadius: cu(1.4), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }} />
      <span style={{ flex: 1 }} />
      <span style={{ width: cu(9), height: cu(3), borderRadius: cu(1.4), background: S.win }} />
    </div>
  );
};

const MenuBar = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-menubar" style={{ position: "absolute", left: 0, right: 0, top: 0, height: cu(5.4), background: S.panel, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}`, display: "flex", alignItems: "center", gap: cu(2.4), padding: `0 ${cu(2.4)}` }}>
      <span style={{ width: cu(2.6), height: cu(2.6), borderRadius: "50%", background: S.soft }} />
      {[0, 1, 2].map((i) => <span key={i} style={{ width: cu(5), height: cu(1.4), borderRadius: cu(0.8), background: S.soft }} />)}
      <span style={{ marginLeft: "auto", width: cu(7), height: cu(2), borderRadius: cu(1), background: S.soft }} />
    </div>
  );
};

const TopBar = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-topbar" style={{ position: "absolute", left: 0, right: 0, top: 0, height: cu(5), background: S.panel, boxShadow: `inset 0 calc(${cu(0.3)} * -1) 0 ${S.border}`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: cu(1.2), padding: `0 ${cu(1.8)}` }}>
      <span style={{ marginRight: "auto", width: cu(16), height: cu(1.6), borderRadius: cu(0.8), background: S.soft }} />
      {[0, 1].map((i) => <span key={i} style={{ width: cu(3.6), height: cu(3), borderRadius: cu(0.8), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }} />)}
    </div>
  );
};

const BeosTab = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-beostab" style={{ position: "absolute", right: cu(4), top: 0, width: cu(20), height: cu(5), borderRadius: `0 0 ${cu(1.8)} ${cu(1.8)}`, background: S.panel, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.2), padding: `0 ${cu(1.8)}` }}>
      <span style={{ width: cu(2.4), height: cu(2.4), borderRadius: cu(0.6), background: S.soft }} />
      {[0, 1].map((i) => <span key={i} style={{ flex: 1, height: cu(1.3), borderRadius: cu(0.8), background: S.soft }} />)}
    </div>
  );
};

const Dock = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  return (
    <div data-testid="chrome-dock" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: cu(5.8), background: S.panel, boxShadow: `inset 0 ${cu(0.3)} 0 ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.4), padding: `0 ${cu(2)}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(0.6), width: cu(3.2), height: cu(3.2) }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ borderRadius: cu(0.4), background: S.ink, opacity: 0.85 }} />)}
      </div>
      <span style={{ width: cu(11), height: cu(3.2), borderRadius: cu(1.6), background: S.win }} />
      <span style={{ width: cu(11), height: cu(3.2), borderRadius: cu(1.6), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }} />
      <span style={{ flex: 1 }} />
      <span style={{ width: cu(2.2), height: cu(2.2), borderRadius: "50%", background: S.soft }} />
      <span style={{ width: cu(6.5), height: cu(2.6), borderRadius: cu(1.2), background: S.win }} />
    </div>
  );
};

const FrontPanel = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  const Btn = () => (
    <span style={{ width: cu(5.4), height: cu(5.4), borderRadius: cu(1.2), background: S.win, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: cu(2.4), height: cu(2.4), borderRadius: cu(0.6), background: S.soft }} />
    </span>
  );
  return (
    <div data-testid="chrome-frontpanel" style={{ position: "absolute", left: "50%", bottom: cu(3), transform: "translateX(-50%)", background: S.panel, borderRadius: cu(2), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.4), padding: cu(1.4) }}>
      <Btn /><Btn />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: cu(0.6), padding: cu(0.8), borderRadius: cu(1), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}` }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: cu(2.4), height: cu(1.8), borderRadius: cu(0.4), background: S.soft }} />)}
      </div>
      <Btn /><Btn />
    </div>
  );
};

// BleskOS has no window, taskbar, or dock: it is a windowless, full-screen
// program switcher, so the desktop IS a full-bleed menu. A title bar at top,
// two columns of grouped menu buttons — each with a leading keyboard-shortcut
// square — and a hint at the bottom-right. Fills the whole preview (inset 0).
const Bleskos = ({ onColor }: { onColor: string }) => {
  const S = chromeSurfaces(onColor);
  const label = (w: number) => (
    <span style={{ display: "block", width: cu(w), height: cu(1.3), borderRadius: cu(0.7), background: S.soft }} />
  );
  // A menu entry: leading key-hint square + a label bar filling `w`% of the row.
  const btn = (k: number, w: number) => (
    <div key={k} style={{ height: cu(4), borderRadius: cu(1), background: S.win, boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, display: "flex", alignItems: "center", gap: cu(1.4), padding: `0 ${cu(1.6)}` }}>
      <span style={{ width: cu(2.6), height: cu(2.6), borderRadius: cu(0.6), boxShadow: `inset 0 0 0 ${cu(0.3)} ${S.border}`, flex: "none" }} />
      <span style={{ height: cu(1.3), width: `${w}%`, borderRadius: cu(0.7), background: S.soft }} />
    </div>
  );
  const group = (labelW: number, widths: number[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: cu(1.2) }}>
      {label(labelW)}
      <div style={{ display: "flex", flexDirection: "column", gap: cu(1.3) }}>{widths.map((w, i) => btn(i, w))}</div>
    </div>
  );
  return (
    <div data-testid="chrome-bleskos" style={{ position: "absolute", inset: 0, padding: `${cu(3)} ${cu(4.5)} ${cu(8.5)}`, display: "flex", flexDirection: "column" }}>
      {label(26)}
      <div style={{ display: "flex", gap: cu(5.5), marginTop: cu(2.6), flex: 1 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: cu(2.6) }}>
          {group(11, [58, 66, 54, 72])}
          {group(9, [50, 78, 44])}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {group(20, [70, 46, 82, 60])}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", marginTop: cu(1.6) }}>
        {label(28)}
      </div>
    </div>
  );
};

function renderPart(part: ChromePart, onColor: string, key: number): ComponentChildren {
  switch (part.part) {
    case "deskIcons": return <DeskIcons key={key} side={part.side} anchor={part.anchor} icons={part.icons} onColor={onColor} />;
    case "window": return <SharedWindow key={key} left={part.left} top={part.top} w={part.w} body={part.body} onColor={onColor} />;
    case "beosWindow": return <BeosWindow key={key} left={part.left} top={part.top} w={part.w} body={part.body} onColor={onColor} />;
    case "platinumWindow": return <PlatinumWindow key={key} left={part.left} top={part.top} w={part.w} body={part.body} onColor={onColor} />;
    case "cdeWindow": return <GadgetWindow key={key} testid="chrome-cdewindow" left={part.left} top={part.top} w={part.w} body={part.body} rightBoxes={2} onColor={onColor} />;
    case "taskbar": return <Taskbar key={key} onColor={onColor} />;
    case "menuBar": return <MenuBar key={key} onColor={onColor} />;
    case "topBar": return <TopBar key={key} onColor={onColor} />;
    case "dock": return <Dock key={key} onColor={onColor} />;
    case "frontPanel": return <FrontPanel key={key} onColor={onColor} />;
    case "beosTab": return <BeosTab key={key} onColor={onColor} />;
    case "bleskos": return <Bleskos key={key} onColor={onColor} />;
  }
}

export function DesktopPreview({ hex, onColor, style }: Props) {
  const spec = CHROME_SPECS[style];
  return (
    <div style={`position: absolute; inset: 0; background-color: ${hex}; overflow: hidden; container-type: inline-size;`}>
      {spec === null ? <ModernScene onColor={onColor} /> : spec.map((part, i) => renderPart(part, onColor, i))}
    </div>
  );
}
