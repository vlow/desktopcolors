import { useMemo, useState } from "preact/hooks";
import type { DesktopStyle } from "../content/config";
import type { FamilyKey, ShadeKey } from "../lib/color";
import {
  groupIntoBands, rankColors, familyCounts, shadeCountsFor,
  FAMILY_DEFS, SHADE_DEFS, type ExplorerColor,
} from "../lib/explorer";
import { FullscreenPreview } from "./FullscreenPreview";

interface Props { colors: ExplorerColor[]; styleBySlug: Record<string, DesktopStyle> }
type Group = "hue" | "tone" | "flat";
type Sort = "spectrum" | "pop";

const seg = (active: boolean): string =>
  `cursor: pointer; border: none; border-radius: 999px; padding: 7px 15px; font: 500 13px var(--font-ui); background: ${active ? "#fff" : "transparent"}; color: ${active ? "var(--ink)" : "var(--muted)"}; box-shadow: ${active ? "0 1px 3px rgba(0,0,0,0.14)" : "none"};`;

export function Explorer({ colors, styleBySlug }: Props) {
  const [group, setGroup] = useState<Group>("hue");
  const [sort, setSort] = useState<Sort>("spectrum");
  const [family, setFamily] = useState<FamilyKey | null>(null);
  const [shade, setShade] = useState<ShadeKey | null>(null);
  const [pv, setPv] = useState<{ list: ExplorerColor[]; idx: number } | null>(null);

  const counts = useMemo(() => familyCounts(colors), [colors]);
  const shadeCounts = useMemo(() => family ? shadeCountsFor(colors, family) : null, [colors, family]);

  const bands = useMemo(
    () => group === "flat" ? [] : groupIntoBands(colors, { group: group === "tone" ? "tone" : "hue", family, shade, sort }),
    [colors, group, family, shade, sort]);
  const ranking = useMemo(
    () => group === "flat" ? rankColors(colors, { family, sort }) : [],
    [colors, group, family, sort]);

  const openPv = (list: ExplorerColor[], idx: number) => setPv({ list, idx });
  const stepPv = (d: number) => setPv((s) => s ? { ...s, idx: (s.idx + d + s.list.length) % s.list.length } : s);
  const cur = pv ? pv.list[pv.idx] : null;

  const toggleFamily = (k: FamilyKey) => { setFamily((f) => f === k ? null : k); setShade(null); };

  return (
    <div style="max-width: 1180px; margin: 0 auto; padding: 26px 32px 56px;">
      <h1 style="font: 700 32px var(--font-ui); letter-spacing: -0.8px; margin: 0;">Color Explorer</h1>
      <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 640px; margin: 8px 0 0;">Group by hue or tone to browse, or ungroup to rank colors by how often people download and copy them.</p>

      <div style="display: flex; align-items: center; gap: 26px; flex-wrap: wrap; margin-top: 20px;">
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">GROUP</span>
          <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
            <button style={seg(group === "hue")} onClick={() => { setGroup("hue"); setShade(null); }}>By hue</button>
            <button style={seg(group === "tone")} onClick={() => { setGroup("tone"); setShade(null); }}>By tone</button>
            <button style={seg(group === "flat")} onClick={() => setGroup("flat")}>Ungrouped</button>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
          <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
            <button style={seg(sort === "spectrum")} onClick={() => setSort("spectrum")}>Spectrum</button>
            <button style={seg(sort === "pop")} onClick={() => setSort("pop")}>Popularity</button>
          </div>
        </div>
      </div>

      <div style="margin-top: 18px;">
        <div style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-bottom: 12px;">BASIC COLORS — CLICK TO NARROW</div>
        <div style="display: flex; gap: 9px; flex-wrap: wrap;">
          {FAMILY_DEFS.map((f) => {
            const active = family === f.key;
            return (
              <button key={f.key} onClick={() => toggleFamily(f.key)} style={`cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 14px 8px 10px; font: 500 13px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                <span style={`width: 15px; height: 15px; border-radius: 50%; background-color: ${f.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                {f.name}<span style="font: 400 11px var(--font-mono); opacity: 0.6;">{counts[f.key]}</span>
              </button>
            );
          })}
          {family && <button onClick={() => { setFamily(null); setShade(null); }} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui); padding: 8px 6px;">Clear ✕</button>}
        </div>
        {group === "hue" && family && shadeCounts && SHADE_DEFS.filter((s) => shadeCounts[s.key] > 0).length > 1 && (
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 14px;">
            <span style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SHADE</span>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              {SHADE_DEFS.filter((s) => shadeCounts[s.key] > 0).map((s) => {
                const active = shade === s.key;
                return (
                  <button key={s.key} onClick={() => setShade((x) => x === s.key ? null : s.key)} style={`cursor: pointer; display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 6px 12px 6px 8px; font: 500 12px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                    <span style={`width: 13px; height: 13px; border-radius: 50%; background-color: ${s.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                    {s.name}<span style="font: 400 10px var(--font-mono); opacity: 0.6;">{shadeCounts[s.key]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {group !== "flat" ? (
        <div style="margin-top: 18px;">
          {bands.map((b) => (
            <div key={b.key} style="display: grid; grid-template-columns: 190px 1fr; gap: 28px; padding: 22px 0; border-bottom: 1px solid var(--card-border); align-items: start;">
              <div>
                <div style="display: inline-flex; align-items: center; gap: 9px;">
                  <span style={`width: 20px; height: 20px; border-radius: 6px; background-color: ${b.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                  <span data-testid="band-name" style="font: 500 18px var(--font-ui);">{b.name}</span>
                </div>
                <div style="font: 400 11px var(--font-mono); color: var(--faint); margin-top: 6px;">{b.colors.length} colors</div>
              </div>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                {b.colors.map((c, i) => (
                  <div key={c.hex} style="width: 116px;">
                    <a href={c.href} style="display: block;">
                      <div style={`position: relative; height: 78px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);`}>
                        <span style={`position: absolute; left: 9px; bottom: 8px; font: 500 11px var(--font-mono); color: ${c.onColor}; opacity: 0.9;`}>{c.hex}</span>
                      </div>
                      <div style="font: 500 13px var(--font-ui); margin-top: 8px;">{c.name}</div>
                      <div style="font: 400 11px var(--font-mono); color: var(--faint);">{c.yearRange}</div>
                    </a>
                    <button onClick={() => openPv(b.colors, i)} style="cursor: pointer; border: none; background: none; padding: 3px 0 0; font: 500 11px var(--font-ui); color: var(--accent-strong);">⤢ Preview</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 4px; max-width: 1000px;">
          {ranking.map((c, i) => (
            <div key={c.hex} data-testid="rank-row" style="display: grid; grid-template-columns: 40px 56px 1fr 220px 84px; gap: 16px; align-items: center; padding: 10px; border-radius: 12px;">
              <a href={c.href} style="font: 600 20px var(--font-mono); color: #cbc7c2; text-align: right;">{c.rank}</a>
              <a href={c.href} style={`display: block; height: 56px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);`} />
              <a href={c.href}>
                <span style="display: block; font: 500 15px var(--font-ui);">{c.name}</span>
                <span style="display: block; font: 400 12px var(--font-mono); color: var(--faint);">{c.hex} · {c.yearRange}</span>
              </a>
              <span style="display: flex; align-items: center; gap: 10px;">
                <span style="flex: 1; height: 8px; border-radius: 999px; background: var(--card-border); overflow: hidden;"><span style={`display: block; height: 100%; width: ${c.pct}%; background: var(--accent);`} /></span>
                <span style="flex: none; min-width: 52px; text-align: right; font: 500 12px var(--font-mono); color: var(--muted);">{c.scoreLabel}</span>
              </span>
              <button onClick={() => openPv(ranking, i)} style="cursor: pointer; border: none; background: none; font: 500 12px var(--font-ui); color: var(--accent-strong); text-align: right;">⤢ Preview</button>
            </div>
          ))}
        </div>
      )}

      {cur && (
        <FullscreenPreview
          hex={cur.hex} onColor={cur.onColor} style={styleBySlug[cur.primarySlug] ?? "generic"}
          label={`${cur.name} · ${cur.hex}`} pos={pv!.idx + 1} total={pv!.list.length}
          detailHref={cur.href}
          onClose={() => setPv(null)} onPrev={() => stepPv(-1)} onNext={() => stepPv(1)}
        />
      )}
    </div>
  );
}
