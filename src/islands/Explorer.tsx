import { useMemo, useState } from "preact/hooks";
import type { DesktopStyle } from "../lib/desktopStyle";
import type { FamilyKey, ColorTypeKey } from "../lib/color";
import {
  groupIntoBands, rankColors, familyCounts, typeCounts,
  osMatch, osOptionDisabled, matchesExplorerQuery,
  FAMILY_DEFS, COLOR_TYPE_DEFS,
  type ExplorerColor, type Platform, type OsUniverse, type OsFamily, type OsMode,
} from "../lib/explorer";
import { FullscreenPreview } from "./FullscreenPreview";
import { DownloadSheet } from "./DownloadSheet";
import { ColorInfobox } from "./ColorInfobox";

interface Props {
  colors: ExplorerColor[];
  styleBySlug: Record<string, DesktopStyle>;
  platformsByHex: Record<string, Platform[]>;
  osUniverse: OsUniverse;
}
type Group = "hue" | "flat";
type Sort = "spectrum" | "pop";

const EXP_COLW = 116, EXP_GAP = 12;

const seg = (active: boolean): string =>
  `cursor: pointer; border: none; border-radius: 999px; padding: 7px 15px; font: 500 13px var(--font-ui); background: ${active ? "#fff" : "transparent"}; color: ${active ? "var(--ink)" : "var(--muted)"}; box-shadow: ${active ? "0 1px 3px rgba(0,0,0,0.14)" : "none"};`;

export function Explorer({ colors, styleBySlug, platformsByHex, osUniverse }: Props) {
  const [group, setGroup] = useState<Group>("hue");
  const [sort, setSort] = useState<Sort>("spectrum");
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<FamilyKey | null>(null);
  const [type, setType] = useState<ColorTypeKey | null>(null);
  const [exp, setExp] = useState<string | null>(null);
  const [osOpen, setOsOpen] = useState(false);
  const [osSel, setOsSel] = useState<Record<string, true>>({});
  const [osMode, setOsMode] = useState<OsMode>("any");
  const [pv, setPv] = useState<{ list: ExplorerColor[]; idx: number } | null>(null);
  const [sheet, setSheet] = useState<{ name: string; hex: string; slug: string } | null>(null);
  const [bandWidth, setBandWidth] = useState(850);

  const osSelKeys = useMemo(() => Object.keys(osSel).filter((k) => osSel[k]), [osSel]);

  // Free-text search narrows the working set before any faceting, so the family
  // and type pill counts (and the OS filter results) all reflect the query.
  const matched = useMemo(
    () => colors.filter((c) => matchesExplorerQuery(c, search, platformsByHex)),
    [colors, search, platformsByHex]);
  const empty = matched.length === 0;

  // Facet counts — color pills count against the OTHER color facet only; the OS
  // filter does not affect these counts (they run on the search-narrowed set).
  const counts = useMemo(
    () => familyCounts(matched.filter((c) => !type || c.types.includes(type))),
    [matched, type]);
  const countsAll = useMemo(() => familyCounts(matched), [matched]);
  const tCounts = useMemo(
    () => typeCounts(matched.filter((c) => !family || c.family === family)),
    [matched, family]);
  const tCountsAll = useMemo(() => typeCounts(matched), [matched]);
  const countLabel = (n: number, total: number) => (n === total ? `${total}` : `${n}/${total}`);

  const osMatches = (c: ExplorerColor) => osMatch(c.hex, platformsByHex, osSel, osMode);

  const bands = useMemo(
    () => group === "flat" ? [] :
      groupIntoBands(matched.filter(osMatches),
        { group: "hue", family, types: type ? [type] : [], sort }),
    [matched, platformsByHex, group, family, type, sort, osSel, osMode]);
  const ranking = useMemo(() => {
    if (group !== "flat") return [];
    const base = matched.filter(osMatches);
    const filtered = type ? base.filter((c) => c.types.includes(type)) : base;
    return rankColors(filtered, { family, sort });
  }, [matched, platformsByHex, group, family, type, sort, osSel, osMode]);

  // Universe for OS-option disabling: colors passing the family/type filter only.
  const osUniverseColors = useMemo(
    () => colors.filter((c) => (!family || c.family === family) && (!type || c.types.includes(type))),
    [colors, family, type]);
  const osDisabled = (slug: string) =>
    osOptionDisabled(slug, { universe: osUniverseColors, platformsByHex, osSel, mode: osMode });

  const cols = Math.max(1, Math.floor((bandWidth + EXP_GAP) / (EXP_COLW + EXP_GAP)));
  const bandGridRef = (n: HTMLDivElement | null) => {
    if (n && n.clientWidth && n.clientWidth !== bandWidth) setBandWidth(n.clientWidth);
  };

  const openPv = (list: ExplorerColor[], idx: number) => setPv({ list, idx });
  const stepPv = (d: number) => setPv((s) => s ? { ...s, idx: (s.idx + d + s.list.length) % s.list.length } : s);
  const cur = pv ? pv.list[pv.idx] : null;

  const toggleFamily = (k: FamilyKey) => setFamily((f) => f === k ? null : k);
  const toggleType = (k: ColorTypeKey) => setType((t) => t === k ? null : k);
  const toggleExp = (hex: string) => setExp((e) => e === hex ? null : hex);
  // Keyboard activation for the div-based leaderboard rows (Enter/Space), so the
  // in-place infobox is reachable without a mouse. Space is prevented from scrolling.
  const onRowKey = (e: KeyboardEvent, hex: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExp(hex); }
  };

  const toggleOsSlug = (slug: string) => setOsSel((s) => {
    const next = { ...s };
    if (next[slug]) delete next[slug]; else next[slug] = true;
    return next;
  });
  const toggleOsFam = (f: OsFamily) => {
    const slugs = f.oses.filter((o) => !osDisabled(o.slug)).map((o) => o.slug);
    setOsSel((s) => {
      const next = { ...s };
      const allOn = slugs.length > 0 && slugs.every((x) => next[x]);
      slugs.forEach((x) => { if (allOn) delete next[x]; else next[x] = true; });
      return next;
    });
  };

  const swatch = (c: ExplorerColor) => {
    const open = exp === c.hex;
    const dCount = (platformsByHex[c.hex.toLowerCase()] ?? []).filter((p) => p.isDefault).length;
    return (
      <button key={c.hex} data-testid="explorer-swatch" onClick={() => toggleExp(c.hex)}
        style="width: 116px; cursor: pointer; border: none; background: none; padding: 0; text-align: left; display: block; align-self: start;">
        <div class="dc-swatch" style={`position: relative; height: 78px; border-radius: 10px; background-color: ${c.hex}; box-shadow: ${open ? "inset 0 0 0 2px var(--accent), 0 6px 16px rgba(0,0,0,0.16)" : "inset 0 0 0 1px rgba(0,0,0,0.08)"}; transition: box-shadow 0.12s ease;`}>
          <span style={`position: absolute; left: 9px; bottom: 8px; font: 500 11px var(--font-mono); color: ${c.onColor}; opacity: 0.9;`}>{c.hex}</span>
        </div>
        <div style="font: 500 13px var(--font-ui); margin-top: 8px;">{c.name}</div>
        <div style="display: flex; align-items: center; gap: 7px; font: 400 11px var(--font-mono); color: var(--faint);">
          {c.yearRange}
          {dCount > 0 && <span title={dCount === 1 ? "OS default color" : `Default in ${dCount} OSes`} style="margin-left: auto; flex: none; background: var(--accent-tint); color: var(--accent-strong); font: 600 8px var(--font-ui); letter-spacing: 0.5px; padding: 2px 6px; border-radius: 999px;">DEFAULT</span>}
        </div>
      </button>
    );
  };

  return (
    <div class="dc-explorer dc-page-x" style="padding-block: 26px 56px;">
      <h1 style="font: 700 32px var(--font-ui); letter-spacing: -0.8px; margin: 0;">Color Explorer</h1>
      <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 640px; margin: 8px 0 0;">Group by hue to browse, filter by color type, or ungroup to rank colors by how often people download and copy them.</p>

      <label style="margin-top: 20px; display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid var(--field-border); border-radius: 13px; padding: 0 16px; height: 52px; max-width: 680px;">
        <span aria-hidden="true" style="color: var(--faint); transform: rotate(-45deg); font-size: 17px;">&#9906;</span>
        <input value={search} onInput={(e) => { setSearch((e.target as HTMLInputElement).value); setExp(null); }}
          aria-label="Search colors" placeholder="Search colors — teal, pastel, #008080, 1995…"
          style="border: none; outline: none; background: transparent; font: 400 15px var(--font-ui); color: var(--ink); width: 100%;" />
        {search && <button onClick={() => { setSearch(""); setExp(null); }} aria-label="Clear search" style="border: none; background: transparent; cursor: pointer; font-size: 15px; color: var(--faint); line-height: 1;">✕</button>}
      </label>

      <div style="display: flex; align-items: center; gap: 26px; flex-wrap: wrap; margin-top: 20px;">
        <div style="display: flex; align-items: center; gap: 9px;">
          <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">GROUP</span>
          <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
            <button style={seg(group === "hue")} onClick={() => setGroup("hue")}>By hue</button>
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
        <button onClick={() => setOsOpen((o) => !o)} style={`cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 7px 15px; font: 500 13px var(--font-ui); border: 1px solid ${osOpen || osSelKeys.length ? "var(--ink)" : "var(--field-border)"}; background: ${osOpen || osSelKeys.length ? "var(--ink)" : "#fff"}; color: ${osOpen || osSelKeys.length ? "#fff" : "var(--ink)"};`}>⧉ Filter by OS{osSelKeys.length ? ` · ${osSelKeys.length}` : ""}</button>
      </div>

      <div style="margin-top: 18px;">
        <div style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-bottom: 12px;">BASIC COLORS — CLICK TO NARROW</div>
        <div style="display: flex; gap: 9px; flex-wrap: wrap;">
          {FAMILY_DEFS.filter((f) => countsAll[f.key] > 0).map((f) => {
            const active = family === f.key;
            const n = counts[f.key] ?? 0;
            const dim = n === 0 && !active;
            return (
              <button key={f.key} disabled={dim} onClick={() => toggleFamily(f.key)} style={`cursor: ${dim ? "default" : "pointer"}; opacity: ${dim ? "0.4" : "1"}; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 14px 8px 10px; font: 500 13px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                <span style={`width: 15px; height: 15px; border-radius: 50%; background-color: ${f.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                {f.name}<span class="dc-pill-count" style="font: 400 11px var(--font-mono); opacity: 0.6;">{countLabel(n, countsAll[f.key])}</span>
              </button>
            );
          })}
          {family && <button onClick={() => setFamily(null)} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui); padding: 8px 6px;">Clear ✕</button>}
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap;">
          <span style="font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">TYPE</span>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            {COLOR_TYPE_DEFS.filter((t) => tCountsAll[t.key] > 0).map((t) => {
              const active = type === t.key;
              const n = tCounts[t.key] ?? 0;
              const dim = n === 0 && !active;
              return (
                <button key={t.key} disabled={dim} onClick={() => toggleType(t.key)} style={`cursor: ${dim ? "default" : "pointer"}; opacity: ${dim ? "0.4" : "1"}; display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 6px 12px 6px 8px; font: 500 12px var(--font-ui); border: 1px solid ${active ? "var(--ink)" : "var(--field-border)"}; background: ${active ? "var(--ink)" : "#fff"}; color: ${active ? "#fff" : "var(--ink)"};`}>
                  <span style={`width: 13px; height: 13px; border-radius: 50%; background-color: ${t.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                  {t.name}<span class="dc-pill-count" style="font: 400 10px var(--font-mono); opacity: 0.6;">{countLabel(n, tCountsAll[t.key])}</span>
                </button>
              );
            })}
            {type && <button onClick={() => setType(null)} style="cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 12px var(--font-ui); padding: 6px 4px;">Clear type ✕</button>}
          </div>
        </div>
      </div>

      {osOpen && (
        <div class="dc-os-panel" style="margin-top: 16px; border: 1px solid var(--field-border); border-radius: 14px; background: #fff; padding: 18px 20px;">
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 16px;">
            <span style="font: 500 15px var(--font-ui);">Filter by operating system</span>
            <div style="display: inline-flex; align-items: center; gap: 8px;">
              <span style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SHOW COLORS IN</span>
              <div style="display: inline-flex; background: #efedea; border-radius: 999px; padding: 3px;">
                <button onClick={() => setOsMode("any")} style={seg(osMode === "any")}>ANY picked</button>
                <button onClick={() => setOsMode("all")} style={seg(osMode === "all")}>ALL picked</button>
              </div>
            </div>
            {osSelKeys.length > 0 && <button onClick={() => setOsSel({})} style="margin-left: auto; cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui);">Clear ✕</button>}
          </div>
          <div class="dc-os-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px 26px;">
            {osUniverse.fams.map((f) => {
              const flags = f.oses.map((o) => osDisabled(o.slug));
              const famDisabled = flags.every(Boolean);
              const total = f.oses.length;
              const famOn = f.oses.filter((o) => osSel[o.slug]).length;
              const allOn = famOn === total, someOn = famOn > 0 && famOn < total;
              const boxBg = allOn ? "var(--accent)" : someOn ? "var(--accent-tint)" : "#fff";
              const boxBd = allOn || someOn ? "var(--accent)" : "#cbc7c1";
              return (
                <div key={f.name}>
                  <button disabled={famDisabled} onClick={() => { if (!famDisabled) toggleOsFam(f); }}
                    style={`display: flex; align-items: center; gap: 10px; cursor: ${famDisabled ? "default" : "pointer"}; opacity: ${famDisabled ? "0.4" : "1"}; background: none; border: none; padding: 0 0 9px; width: 100%;`}>
                    <span style={`width: 16px; height: 16px; border-radius: 5px; flex: none; background: ${boxBg}; box-shadow: inset 0 0 0 1.5px ${boxBd};`} />
                    <span style="font: 500 14px var(--font-ui);">{f.name}</span>
                    <span style="margin-left: auto; font: 400 11px var(--font-mono); color: var(--faint);">{famOn}/{total}</span>
                  </button>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-left: 26px;">
                    {f.oses.map((o, oi) => {
                      const sel = !!osSel[o.slug];
                      const dis = flags[oi];
                      return (
                        <button key={o.slug} data-testid="os-option" disabled={dis} onClick={() => { if (!dis) toggleOsSlug(o.slug); }}
                          style={`cursor: ${dis ? "default" : "pointer"}; opacity: ${dis ? "0.4" : "1"}; border-radius: 8px; padding: 5px 10px; font: 500 12px var(--font-ui); border: 1px solid ${sel ? "var(--ink)" : "var(--field-border)"}; background: ${sel ? "var(--ink)" : "#fff"}; color: ${sel ? "#fff" : "var(--muted)"};`}>{o.name}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {empty ? (
        <div style="padding: 64px 0; text-align: center; color: var(--muted);">
          <div style="font: 500 20px var(--font-ui); color: var(--ink);">No colors match “{search}”</div>
          <div style="font-size: 14px; margin-top: 8px;">Try a color name, a group like “teal”, a hex value, or a year.</div>
        </div>
      ) : group !== "flat" ? (
        <div style="margin-top: 18px;">
          {bands.map((b) => {
            const idx = exp ? b.colors.findIndex((c) => c.hex === exp) : -1;
            const hasPanel = idx >= 0;
            const rowEnd = hasPanel ? Math.min(b.colors.length - 1, (Math.floor(idx / cols) + 1) * cols - 1) : -1;
            const head = hasPanel ? b.colors.slice(0, rowEnd + 1) : b.colors;
            const tail = hasPanel ? b.colors.slice(rowEnd + 1) : [];
            const caretLeft = hasPanel ? (idx % cols) * (EXP_COLW + EXP_GAP) + EXP_COLW / 2 : 0;
            const panelColor = hasPanel ? b.colors[idx] : null;
            return (
              <div key={b.key} class="dc-explorer-band" style="display: grid; grid-template-columns: 190px 1fr; gap: 28px; padding: 22px 0; border-bottom: 1px solid var(--card-border); align-items: start;">
                <div>
                  <div style="display: inline-flex; align-items: center; gap: 9px;">
                    <span style={`width: 20px; height: 20px; border-radius: 6px; background-color: ${b.chip}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                    <span data-testid="band-name" style="font: 500 18px var(--font-ui);">{b.name}</span>
                  </div>
                  <div style="font: 400 11px var(--font-mono); color: var(--faint); margin-top: 6px;">{b.colors.length} colors</div>
                </div>
                <div ref={bandGridRef} style="min-width: 0;">
                  <div style="display: grid; grid-template-columns: repeat(auto-fill, 116px); gap: 12px; justify-content: start;">
                    {head.map((c) => swatch(c))}
                  </div>
                  {hasPanel && panelColor && (
                    <div style="position: relative; margin: 12px 0 4px;">
                      <span style={`position: absolute; top: -6px; left: calc(${caretLeft}px - 6px); width: 12px; height: 12px; background: #fff; border-left: 1px solid var(--field-border); border-top: 1px solid var(--field-border); transform: rotate(45deg); z-index: 2;`} />
                      <div class="dc-infobox" style={`border: 1px solid var(--field-border); border-top: 3px solid ${panelColor.hex}; border-radius: 12px; background: #fff; padding: 16px 18px; box-shadow: 0 10px 26px rgba(0,0,0,0.08);`}>
                        <ColorInfobox variant="band" color={panelColor} platforms={platformsByHex[panelColor.hex.toLowerCase()] ?? []}
                          onPreview={() => openPv(b.colors, idx)}
                          onDownload={() => setSheet({ name: panelColor.name, hex: panelColor.hex, slug: panelColor.primarySlug })} />
                      </div>
                    </div>
                  )}
                  {tail.length > 0 && (
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, 116px); gap: 12px; justify-content: start; margin-top: 12px;">
                      {tail.map((c) => swatch(c))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div class="dc-rank-grid" style="margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(660px, 1fr)); gap: 4px 26px; align-items: start;">
          {ranking.map((c, i) => {
            const open = exp === c.hex;
            return (
              <div key={c.hex}>
                <div data-testid="rank-row" class="dc-rank-row" role="button" tabIndex={0}
                  aria-expanded={open} aria-label={`${c.name} ${c.hex} — ${open ? "hide" : "show"} details`}
                  onClick={() => toggleExp(c.hex)} onKeyDown={(e) => onRowKey(e, c.hex)}
                  style={`cursor: pointer; display: grid; grid-template-columns: 40px 56px minmax(0, 1fr) minmax(130px, 210px) 84px; gap: 16px; align-items: center; padding: 10px; border-radius: ${open ? "12px 12px 0 0" : "12px"}; ${open ? "border: 1px solid var(--field-border); border-bottom: none; border-left: 3px solid var(--accent); padding: 9px 9px 10px 7px;" : ""} background: ${open ? "#fbfaf9" : "transparent"};`}>
                  <span style="font: 600 20px var(--font-mono); color: #cbc7c2; text-align: right;">{c.rank}</span>
                  <span class="dc-rank-swatch" style={`display: block; height: 56px; border-radius: 10px; background-color: ${c.hex}; box-shadow: ${open ? "inset 0 0 0 2px var(--accent)" : "inset 0 0 0 1px rgba(0,0,0,0.1)"};`} />
                  <span>
                    <span style="display: block; font: 500 15px var(--font-ui);">{c.name}</span>
                    <span style="display: block; font: 400 12px var(--font-mono); color: var(--faint);">{c.hex} · {c.yearRange}</span>
                  </span>
                  <span class="dc-rank-bar" style="display: flex; align-items: center; gap: 10px;">
                    <span style="flex: 1; height: 8px; border-radius: 999px; background: var(--card-border); overflow: hidden;"><span style={`display: block; height: 100%; width: ${c.pct}%; background: var(--accent);`} /></span>
                    <span style="flex: none; min-width: 52px; text-align: right; font: 500 12px var(--font-mono); color: var(--muted);">{c.scoreLabel}</span>
                  </span>
                  <span class="dc-rank-pv" style="font: 500 12px var(--font-ui); color: var(--accent-strong); text-align: right;">{open ? "Close ✕" : "Details"}</span>
                </div>
                {open && (
                  <div class="dc-infobox" style={`margin: 0 0 10px; border: 1px solid var(--field-border); border-top: none; border-left: 3px solid ${c.hex}; border-radius: 0 0 12px 12px; background: #fbfaf9; padding: 16px 18px;`}>
                    <ColorInfobox variant="flat" color={c} platforms={platformsByHex[c.hex.toLowerCase()] ?? []}
                      onPreview={() => openPv(ranking, i)}
                      onDownload={() => setSheet({ name: c.name, hex: c.hex, slug: c.primarySlug })} />
                  </div>
                )}
              </div>
            );
          })}
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
      {sheet && <DownloadSheet osSlug={sheet.slug} color={{ hex: sheet.hex, name: sheet.name }} onClose={() => setSheet(null)} />}
    </div>
  );
}
