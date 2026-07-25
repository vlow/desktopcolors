import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

interface DropdownProps {
  /** Visible content of the trigger button (label, glyphs, chevron). */
  trigger: ComponentChildren;
  /** Menu contents; receives a `close` callback to dismiss the menu. */
  children: (close: () => void) => ComponentChildren;
  /** Accessible name for the trigger button. */
  ariaLabel: string;
  /** Which edge the panel aligns to. Default "left". */
  align?: "left" | "right";
}

export function Dropdown({ trigger, children, ariaLabel, align = "left" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} style="position: relative;">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        style="cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--field-border); background: var(--panel); color: var(--ink); border-radius: 999px; padding: 8px 14px; font: 500 14px var(--font-ui);"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          style={`position: absolute; top: calc(100% + 8px); ${align === "right" ? "right: 0;" : "left: 0;"} min-width: 210px; background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,0.18); padding: 6px; z-index: 60;`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
