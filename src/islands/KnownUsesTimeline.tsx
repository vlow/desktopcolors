import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Platform } from "../lib/colorCatalog";
import { colorPath } from "../lib/links";

interface Props { hex: string; uses: Platform[]; currentSlug: string }
type Hover = { year: number; idx: number | null } | null;

const ACCENT = "var(--accent)";
const ACCENT_STRONG = "var(--accent-strong)";

export function KnownUsesTimeline({ hex, uses, currentSlug }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<Hover>(null);

  const n = uses.length;
  const minY = uses[0].year, maxY = uses[n - 1].year;
  const span = Math.max(1, maxY - minY);
  const countLabel = n === 1 ? "1 palette" : `${n} palettes · ${minY}–${maxY}`;

  const header = (
    <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px;">
      <span style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">KNOWN USES</span>
      <span style="font: 500 10px var(--font-mono); color: var(--faint);">{countLabel}</span>
    </div>
  );

  const box = (inner: ComponentChildren) => (
    <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
      <div style="padding: 12px 14px 14px;">{header}{inner}</div>
    </div>
  );

  if (n <= 1) {
    return box(<div style="font: 400 12.5px var(--font-ui); color: var(--muted);">Only in this palette so far.</div>);
  }

  const isCurrent = (u: Platform) => u.slug === currentSlug;
  const tickActive = (u: Platform) => !!hover && hover.year === u.year;
  const rowActive = (u: Platform, i: number) => !!hover && (hover.idx === i || (hover.idx == null && hover.year === u.year));

  const tallyRest = n - 1 === 1
    ? "Also in 1 other palette."
    : `Recurs across ${n} palettes through ${uses[n - 1].name}, ${maxY}.`;

  return box(
    <>
      <div style="position: relative; height: 24px; margin: 8px 3px 12px;">
        <div style="position: absolute; top: 11px; left: 0; right: 0; height: 2px; background: var(--card-border);" />
        {uses.map((u) => {
          const active = tickActive(u), cur = isCurrent(u);
          const size = active ? 13 : cur ? 11 : 8;
          const bg = cur ? ACCENT_STRONG : ACCENT;
          const ring = active
            ? "box-shadow: 0 0 0 3px var(--accent-tint);"
            : cur ? "box-shadow: 0 0 0 3px var(--accent-tint);" : "opacity: 0.8;";
          return (
            <span key={u.slug} onMouseEnter={() => setHover({ year: u.year, idx: null })} onMouseLeave={() => setHover(null)}
              style={`position: absolute; top: ${12 - size / 2}px; left: ${((u.year - minY) / span) * 100}%; width: ${size}px; height: ${size}px; border-radius: 50%; background: ${bg}; transform: translateX(-50%); cursor: pointer; transition: width .12s, height .12s; z-index: ${active ? 2 : 1}; ${ring}`} />
          );
        })}
        <span style="position: absolute; top: 16px; left: 0; font: 400 9px var(--font-mono); color: var(--faint);">{minY}</span>
        <span style="position: absolute; top: 16px; right: 0; font: 400 9px var(--font-mono); color: var(--faint);">{maxY}</span>
      </div>

      <div style="font: 400 12.5px var(--font-ui); color: var(--muted); line-height: 1.5;">
        First in <strong>{uses[0].name}</strong>, {minY}. {tallyRest}
      </div>

      <a onClick={() => { setExpanded((v) => !v); setHover(null); }}
        style="display: inline-block; margin-top: 11px; font: 500 11px var(--font-mono); color: var(--accent-strong); cursor: pointer;">
        {expanded ? "Hide palettes" : `View all ${n} palettes →`}
      </a>

      {expanded && (
        <div style="border-top: 1px solid var(--hairline); margin-top: 13px; padding-top: 5px;">
          {uses.map((u, i) => {
            const active = rowActive(u, i), cur = isCurrent(u), isFirst = i === 0, isLast = i === n - 1;
            const dot = cur
              ? `width: 11px; height: 11px; border-radius: 50%; background: ${ACCENT_STRONG}; box-shadow: 0 0 0 3px var(--accent-tint); position: relative; z-index: 1;`
              : `width: 9px; height: 9px; border-radius: 50%; background: ${active ? ACCENT : "var(--panel)"}; box-shadow: inset 0 0 0 2px ${ACCENT}; position: relative; z-index: 1;`;
            let line = "position: absolute; left: 50%; width: 2px; background: var(--hairline); transform: translateX(-50%);";
            line += isFirst ? "top: 50%; bottom: -7px;" : isLast ? "top: -7px; height: 50%;" : "top: -7px; bottom: -7px;";
            const rowStyle = `text-decoration: none; display: grid; grid-template-columns: 16px 1fr auto; align-items: center; gap: 10px; padding: 7px 6px; margin: 0 -6px; border-radius: 7px; cursor: ${cur ? "default" : "pointer"}; ${active ? "background: var(--accent-tint);" : ""}`;
            const rail = (
              <span style="justify-self: center; position: relative; width: 16px; display: flex; justify-content: center;">
                <span style={line} /><span style={dot} />
              </span>
            );
            const meta = (
              <span style="display: inline-flex; align-items: center; gap: 6px;">
                {isFirst && <span style="font: 600 8px var(--font-mono); letter-spacing: 1px; color: var(--muted); background: var(--hairline); padding: 2px 5px; border-radius: 4px;">FIRST</span>}
                {u.isDefault && <span style="font: 600 8px var(--font-ui); letter-spacing: 0.5px; color: var(--accent-strong); background: var(--accent-tint); padding: 2px 6px; border-radius: 999px;">DEFAULT</span>}
                <span style="font: 500 12px var(--font-mono); color: var(--faint);">{u.year}</span>
              </span>
            );
            const nameColor = cur ? "var(--accent-strong)" : "var(--ink)";
            const props = { style: rowStyle, onMouseEnter: () => setHover({ year: u.year, idx: i }), onMouseLeave: () => setHover(null) };
            const inner = <>{rail}<span style={`font: 500 13px var(--font-ui); color: ${nameColor};`}>{u.name}</span>{meta}</>;
            return cur
              ? <div key={u.slug} {...props}>{inner}</div>
              : <a key={u.slug} href={colorPath(u.slug, hex)} {...props}>{inner}</a>;
          })}
        </div>
      )}
    </>
  );
}
