import { useState } from "preact/hooks";

const LINKS = [
  { key: "browse", label: "Browse", href: "/" },
  { key: "explorer", label: "Color Explorer", href: "/explorer" },
  { key: "setup", label: "Setup Guide", href: "/setup" },
  { key: "about", label: "About", href: "/about" },
];

export function MobileNav({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style="position: relative;">
      <button onClick={() => setOpen((o) => !o)} aria-label="Menu" style="cursor: pointer; display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--field-border); border-radius: 10px; padding: 9px 13px; font: 500 14px var(--font-ui); color: var(--ink);">
        <span style="font-size: 15px; line-height: 1;">{open ? "✕" : "☰"}</span> Menu
      </button>
      {open && (
        <div style="position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; min-width: 180px; background: #fff; border: 1px solid var(--field-border); border-radius: 12px; box-shadow: 0 14px 34px rgba(0,0,0,0.16); padding: 6px; display: flex; flex-direction: column;">
          {LINKS.map((l) => (
            <a key={l.key} href={l.href} onClick={() => setOpen(false)} style={`display: block; padding: 11px 13px; border-radius: 8px; font: 500 14px var(--font-ui); color: ${l.key === active ? "var(--ink)" : "var(--muted)"};;`}>{l.label}</a>
          ))}
        </div>
      )}
    </div>
  );
}
