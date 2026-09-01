import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { OsView, EraPeerView, ColorDetail, SimilarView, OsViewJson } from "../lib/detail";
import { denormalizeDetails } from "../lib/detail";
import { DesktopPreview } from "./DesktopPreview";
import { FullscreenPreview } from "./FullscreenPreview";
import { DownloadSheet } from "./DownloadSheet";
import { ColorInfobox, type InfoboxColor } from "./ColorInfobox";
import { track } from "../lib/track";
import { colorPath } from "../lib/links";
import { KnownUsesTimeline } from "./KnownUsesTimeline";
import { DetailSkeleton } from "./DetailSkeleton";
import { Dropdown } from "./Dropdown";
import { SourceNote } from "./SourceNote";

interface Props {
  os: OsView;
  eraPeers: EraPeerView[];
  initialHex?: string | null;
  detailsByHex: Record<string, ColorDetail>;
  viewUrl?: string | null;
}

type CopyKey = string;

const REF_LINK = "display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--ink); font: 500 12px var(--font-ui); border: 1px solid var(--card-border); border-radius: 11px; background: var(--panel); padding: 8px 12px;";
const STEP_CARD = "display: flex; align-items: center; gap: 12px; text-decoration: none; border: 1px solid var(--card-border); border-radius: 11px; background: var(--panel); padding: 11px 15px;";
// The Source toggle takes its neighbours' pill vocabulary (REF_LINK) but is a
// button, not a link — it discloses in-page content rather than navigating, so
// it carries a chevron where the reference pills carry ↗.
const SRC_TOGGLE = `${REF_LINK} cursor: pointer;`;

// scrollTop that centers an item (at `itemOffset` within the container's content
// box, `itemHeight` tall) inside a scroll container, clamped to its scrollable
// range. Pure so the centering logic can be unit-tested without a layout engine.
export function centerScrollTop(
  itemOffset: number,
  itemHeight: number,
  clientHeight: number,
  scrollHeight: number,
): number {
  const ideal = itemOffset - (clientHeight - itemHeight) / 2;
  return Math.max(0, Math.min(ideal, scrollHeight - clientHeight));
}

export function OsDetail({ os, eraPeers, initialHex, detailsByHex, viewUrl }: Props) {
  const colors = os.colors; // ColorView[] — the lightweight swatch list

  // The selected color comes from the server-provided `initialHex` — it is baked
  // into the URL path (/os/<slug>/<hex>), so server and client render identically
  // from the very first paint. No `window`/query reading, so no hydration
  // mismatch and no flash of the default color.
  //
  // When no color is deep-linked (e.g. opening /os/<slug> from Platforms), start on
  // the OS's default color rather than whatever happens to be first in the list.
  const defaultIdx = (): number => {
    const d = colors.findIndex((c) => c.isDefault);
    return d >= 0 ? d : 0;
  };
  const idxOfHex = (hex?: string | null): number => {
    if (!hex) return defaultIdx();
    const i = colors.findIndex((c) => c.hex.toLowerCase() === hex.toLowerCase());
    return i >= 0 ? i : defaultIdx();
  };

  const [sel, setSel] = useState(() => idxOfHex(initialHex));
  const [sheet, setSheet] = useState(false);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [codesExpanded, setCodesExpanded] = useState(false);
  const [simExp, setSimExp] = useState<string | null>(null);
  const [simFull, setSimFull] = useState(false);
  const [simSheet, setSimSheet] = useState<SimilarView | null>(null);
  const [details, setDetails] = useState<Record<string, ColorDetail>>(detailsByHex);
  // Open/closed state for the provenance panel. Owned here, not in either
  // toolbar variant, so the inline pill and the mobile dropdown item cannot
  // disagree about whether the note is open. Deliberately NOT reset when `sel`
  // changes: the note is per-OS, not per-color.
  const [srcOpen, setSrcOpen] = useState(false);

  useEffect(() => { track({ kind: "osview", os: os.slug }); }, [os.slug]);

  // Prefetch the full per-OS detail once, on idle. Until it lands, only the
  // initially-selected color (seeded inline) has heavy detail; others show a
  // skeleton. The inline seed stays authoritative (`...prev` wins).
  useEffect(() => {
    if (!viewUrl) return;
    let alive = true;
    const load = () =>
      fetch(viewUrl)
        .then((r) => r.json())
        .then((json: OsViewJson) => {
          if (!alive) return;
          const dn = denormalizeDetails(json);
          const map: Record<string, ColorDetail> = {};
          colors.forEach((col, i) => { if (dn[i]) map[col.hex.toLowerCase()] = dn[i]; });
          setDetails((prev) => ({ ...map, ...prev }));
        })
        .catch(() => { /* initial color stays functional; others keep skeleton */ });
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(load); else window.setTimeout(load, 0);
    return () => { alive = false; };
  }, [viewUrl]);

  // On first paint, center the initially-selected swatch in the "All colors"
  // list. A deep link (/os/<slug>/<hex>) or a mid-list default (Windows 95's
  // Teal) would otherwise sit below the fold with the list scrolled to the top,
  // reading as if the first swatch were selected. Centering keeps neighbours
  // above and below visible. Mount-only: later clicks must not yank the list.
  // Scrolls the list's own overflow, never the page.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[sel] as HTMLElement | undefined;
    if (!list || !item) return;
    const itemOffset = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTop = centerScrollTop(itemOffset, item.offsetHeight, list.clientHeight, list.scrollHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = colors[sel] ?? colors[0];
  // The first of the entry's other colors, offered to the preview as chrome ink.
  // Only the C64's basicScreen reads it — its border and BASIC text were a
  // second palette color, not a shade of the background — so on the default blue
  // the preview draws the real light blue, and on light blue the real blue.
  const accent = colors.find((c) => c.hex !== summary.hex)?.hex;

  // The References row, flattened to one list so it takes any number of links.
  // `project` and `wikipedia` keep their own icons and fixed ends of the row;
  // everything in `links` sits between them, in the order the JSON lists it.
  const refs: { url: string; label: string; icon: ComponentChildren }[] = [
    ...(os.project ? [{ url: os.project.url, label: os.project.name, icon: "⧉" }] : []),
    ...os.links.map((l) => ({ url: l.url, label: l.name, icon: "⧉" })),
    ...(os.wikipedia ? [{ url: os.wikipedia, label: "Wikipedia", icon: <span style="font: 700 13px var(--font-ui);">W</span> }] : []),
  ];
  const detail = details[summary.hex.toLowerCase()]; // undefined until fetched
  const sim = detail?.similar ?? [];

  // Collapse any expanded similar-color panel when the selected color changes —
  // it refers to a different color's "similar" list once `sel` moves.
  useEffect(() => { setSimExp(null); }, [sel]);

  // Keep the URL in sync with the selected color so it can be copied/shared.
  // Skip the initial mount so the entry URL (a default page or a deep link) is
  // left untouched; replaceState (not push) avoids polluting the back history.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    try {
      window.history.replaceState(window.history.state, "", colorPath(os.slug, summary.hex));
    } catch { /* ignore */ }
  }, [sel]);

  const copy = (key: CopyKey, text: string) => {
    try { navigator.clipboard?.writeText(text)?.catch(() => {}); } catch { /* ignore */ }
    track({ kind: "copy", hex: summary.hex, os: os.slug });
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1300);
  };

  const step = (d: number) => setSel((s) => (s + d + colors.length) % colors.length);

  // Step through the current color's "similar" list inside the fullscreen
  // preview. `simExp` is the single source of truth for the current similar
  // color, so advancing it also makes the expanded panel below follow along.
  const stepSim = (d: number) => {
    const n = (detail?.similar ?? []).length;
    if (n === 0) return;
    const i = (detail?.similar ?? []).findIndex((x) => x.hex === simExp);
    const next = ((i < 0 ? 0 : i) + d + n) % n;
    setSimExp((detail?.similar ?? [])[next].hex);
  };

  const copyRow = (key: CopyKey, label: string, value: string, toCopy: string, swatch?: string) => (
    <div data-testid={`copy-${key}`} onClick={() => copy(key, toCopy)} title={`Copy ${label}`}
      style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 14px; cursor: pointer;">
      <span style="font: 400 11px var(--font-mono); color: var(--faint);">{label}</span>
      <span style="display: inline-flex; align-items: center; gap: 10px;">
        {swatch && <span style={`width: 11px; height: 11px; border-radius: 3px; background-color: ${swatch}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);`} />}
        <span style="font: 500 13px var(--font-mono);">{value}</span>
        <span style={`font: 500 10px var(--font-mono); width: 52px; text-align: right; color: ${copied === key ? "oklch(0.55 0.15 150)" : "#cbc7c1"};`}>{copied === key ? "Copied ✓" : "Copy"}</span>
      </span>
    </div>
  );

  return (
    <div class="dc-detail dc-page-x dc-page-head" style="padding-block-end: 56px;">
      <div data-testid="detail-top-row" style="display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px 18px;">
        <a href="/" style="font: 400 13px var(--font-mono); color: var(--faint);">← Browse all platforms</a>
        {/* D2 collapse-to-dropdown: both variants are always in the DOM and CSS
            flips which one shows, so there is no hydration flash. Inline pills
            wrap onto two or three lines below 760px once an entry carries more
            than a couple of links, pushing the title down the screen. */}
        {(refs.length > 0 || (os.source && os.source.length > 0)) && (
          <>
            <div data-testid="refs-inline" class="dc-desktop-only" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;">
              <span class="dc-control-label">REFERENCES</span>
              {refs.map((ref) => (
                <a key={ref.url} href={ref.url} target="_blank" rel="noopener" style={REF_LINK}>{ref.icon} {ref.label} <span style="opacity: 0.5;">↗</span></a>
              ))}
              {os.source && os.source.length > 0 && (
                <button
                  type="button"
                  data-testid="source-toggle"
                  aria-expanded={srcOpen}
                  aria-controls="source-note-panel"
                  onClick={() => setSrcOpen((v) => !v)}
                  style={SRC_TOGGLE}
                >
                  Source <span style="opacity: 0.5;">{srcOpen ? "⌃" : "⌄"}</span>
                </button>
              )}
            </div>
            <div data-testid="refs-menu" class="dc-mobile-only" style="margin-left: auto;">
              <Dropdown
                ariaLabel={`References: ${refs.length} ${refs.length === 1 ? "link" : "links"}${os.source ? ", and the source note" : ""}`}
                align="right"
                trigger={<>
                  <span class="dc-control-label">REFERENCES</span>
                  <span style="font-size: 12px; color: var(--faint);">{refs.length}</span>
                  <span style="opacity: 0.5;">▾</span>
                </>}
              >
                {(close) => (
                  <>
                    {refs.map((ref) => (
                      <a
                        key={ref.url}
                        role="menuitem"
                        class="dc-menu-item"
                        href={ref.url}
                        target="_blank"
                        rel="noopener"
                        style="text-decoration: none;"
                        onClick={close}
                      >
                        {ref.icon} {ref.label}
                        <span style="margin-left: auto; opacity: 0.5;">↗</span>
                      </a>
                    ))}
                    {/* Provenance is a different kind of thing from the links
                        above it — it discloses in-page content rather than
                        navigating — so it sits last, behind a rule, and carries
                        a chevron instead of ↗. */}
                    {os.source && os.source.length > 0 && (
                      <>
                        {refs.length > 0 && (
                          <hr class="dc-rule" style="margin: 6px 4px;" />
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          data-testid="source-menu-item"
                          class="dc-menu-item"
                          aria-expanded={srcOpen}
                          aria-controls="source-note-panel"
                          onClick={() => { setSrcOpen((v) => !v); close(); }}
                        >
                          Source
                          <span style="margin-left: auto; opacity: 0.5;">{srcOpen ? "⌃" : "⌄"}</span>
                        </button>
                      </>
                    )}
                  </>
                )}
              </Dropdown>
            </div>
          </>
        )}
      </div>
      {os.source && os.source.length > 0 && srcOpen && (
        <div
          id="source-note-panel"
          data-testid="source-panel"
          style="margin-top: 12px; border: 1px solid var(--card-border); border-radius: 11px; background: var(--panel-sunken); padding: 14px 16px; font: 400 13px/1.65 var(--font-ui); color: var(--muted); text-wrap: pretty;"
        >
          <SourceNote nodes={os.source} />
        </div>
      )}
      <div class="dc-page-eyebrow" style="margin-top: 14px;">{os.family} · {os.year}{os.type && <> <span style="color: var(--faint);">·</span> <span style="color: var(--muted);">{os.type}</span></>}</div>
      <h1 class="dc-page-title">{os.name}</h1>
      <p class="dc-page-lead" style="margin-bottom: 16px;">{os.description}</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 560px; margin-bottom: 22px;">
        {os.predecessor && (
          <a href={`/os/${os.predecessor.slug}`} style={STEP_CARD}>
            <span style="font-size: 18px; color: var(--faint);">←</span>
            <span style="min-width: 0;">
              <span style="display: block; font: 500 11px var(--font-ui); color: var(--faint);">Earlier</span>
              <span style="display: block; font: 500 16px var(--font-ui); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{os.predecessor.name}</span>
            </span>
          </a>
        )}
        {os.successor && (
          <a href={`/os/${os.successor.slug}`}
            style={`${STEP_CARD} justify-content: flex-end; text-align: right;${os.predecessor ? "" : " grid-column: 2;"}`}>
            <span style="min-width: 0;">
              <span style="display: block; font: 500 11px var(--font-ui); color: var(--faint);">Later</span>
              <span style="display: block; font: 500 16px var(--font-ui); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{os.successor.name}</span>
            </span>
            <span style="font-size: 18px; color: var(--faint);">→</span>
          </a>
        )}
      </div>

      <div class="dc-detail-hero" style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 28px; align-items: stretch; min-height: 372px;">
        <div style="border-radius: 14px; overflow: hidden; border: 1px solid var(--field-border); box-shadow: 0 10px 28px rgba(0,0,0,0.12); background: var(--panel); display: flex; flex-direction: column; min-height: 340px;">
          <div style="height: 28px; background: #f0eeec; border-bottom: 1px solid var(--field-border); display: flex; align-items: center; gap: 9px; padding: 0 12px; flex: none;">
            <span style="width: 13px; height: 10px; border-radius: 2px; background: #cbc7c1;" />
            <span style="font: 500 11px var(--font-ui); color: #78716c;">Preview</span>
            <span style="margin-left: auto; font: 400 11px var(--font-mono); color: var(--faint);">{summary.hex}</span>
          </div>
          <div style="position: relative; flex: 1; min-height: 0;">
            <DesktopPreview hex={summary.hex} onColor={summary.onColor} style={os.desktopStyle} accent={accent} />
            <button onClick={() => setFull(true)} style="position: absolute; top: 12px; right: 12px; z-index: 2; cursor: pointer; background: rgba(255,255,255,0.92); border: none; border-radius: 9px; padding: 8px 12px; font: 500 12px var(--font-ui);">⤢ Expand</button>
          </div>
        </div>
        <div style="border: 1px solid var(--card-border); border-radius: 14px; background: var(--panel); overflow: hidden; display: flex; flex-direction: column;">
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--card-border); display: flex; align-items: baseline; justify-content: space-between; gap: 12px;">
            <span style="font: 500 14px var(--font-ui);">All colors</span>
            <span style="font: 400 11px var(--font-mono); color: var(--faint);">{os.colorCount} · click to preview</span>
          </div>
          <div ref={listRef} style="flex: 1; overflow-y: auto; padding: 8px; max-height: 320px;">
            {colors.map((col, i) => (
              <div key={col.hex} onClick={() => setSel(i)} data-testid={`color-row-${col.hex.slice(1)}`} aria-current={i === sel ? "true" : undefined} style={`cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 9px; background: ${i === sel ? "var(--accent-tint)" : "transparent"};`}>
                <div style={`width: 32px; height: 32px; border-radius: 7px; background-color: ${col.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
                <div style="flex: 1;">
                  <div style="font: 500 13px var(--font-ui);">{col.name}</div>
                  <div style="font: 400 11px var(--font-mono); color: var(--faint);">{col.hex}</div>
                </div>
                {col.isDefault && <span title="Default" style="width: 7px; height: 7px; border-radius: 50%; background: var(--accent);" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style="border: 1px solid var(--card-border); border-radius: 12px; background: var(--panel); padding: 18px 20px; margin-top: 20px;">
        <div class="dc-detail-selrow" style="display: flex; align-items: center; gap: 14px;">
          <div style={`width: 48px; height: 48px; border-radius: 10px; background-color: ${summary.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);`} />
          <div style="flex: 1;">
            <div style="display: inline-flex; align-items: center; gap: 9px;">
              <span style="font: 500 20px var(--font-ui);">{summary.name}</span>
              {summary.isDefault && <span style="background: var(--accent-tint); color: var(--accent-strong); font: 600 9px var(--font-ui); letter-spacing: 0.5px; padding: 4px 8px; border-radius: 999px;">DEFAULT</span>}
            </div>
            <div style="font: 400 12px var(--font-mono); color: var(--muted); margin-top: 2px;">{summary.note}</div>
          </div>
          <button class="dc-detail-dl" onClick={() => setSheet(true)} style="border: none; cursor: pointer; background: var(--ink); color: #fff; font: 500 13px var(--font-ui); padding: 11px 17px; border-radius: 10px;">↓ Download</button>
        </div>

        <div class="dc-detail-meta" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;">
          {detail ? (
            <KnownUsesTimeline hex={summary.hex} uses={detail.uses} currentSlug={os.slug} />
          ) : (
            <DetailSkeleton label="known uses" />
          )}
          <div style="border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden;">
            <div style="font: 400 9px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; padding: 9px 14px 5px;">COLOR VALUES · CLICK TO COPY</div>
            {copyRow("hex", "HEX", summary.hex, summary.hex)}
            {copyRow("rgb", "RGB", summary.rgb, `rgb(${summary.rgb})`)}
            {copyRow("hsl", "HSL", summary.hsl, summary.hsl)}
            {copyRow("cmyk", "CMYK", summary.cmyk, `cmyk(${summary.cmyk.replace(/ /g, ", ")})`)}
            {detail && codesExpanded && detail.extraFormats.map((r) => copyRow(r.key, r.label, r.value, r.copy, r.swatch))}
            {detail && (
              <a onClick={() => setCodesExpanded((v) => !v)} style="display: block; border-top: 1px solid var(--hairline); padding: 9px 14px; font: 500 11px var(--font-mono); color: var(--accent-strong); cursor: pointer;">
                {codesExpanded ? "Show fewer formats" : `View all ${4 + detail.extraFormats.length} formats →`}
              </a>
            )}
          </div>
        </div>
      </div>

      <div style="border-top: 1px solid var(--hairline); margin-top: 34px; padding-top: 26px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 18px;">
          <h2 style="font: 500 20px var(--font-ui); margin: 0;">Similar colors elsewhere</h2>
          <span style="font: 400 12px var(--font-mono); color: var(--faint);">closest to {summary.name} · {summary.hex}</span>
        </div>
        {!detail ? (
          <DetailSkeleton label="similar colors" />
        ) : sim.length === 0 ? (
          <div style="font: 400 13px var(--font-mono); color: var(--faint);">No close matches on other platforms.</div>
        ) : (
          <>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px;">
              {sim.map((s) => (
                <a key={s.hex + s.primarySlug} onClick={() => setSimExp((x) => (x === s.hex ? null : s.hex))}
                  style={`cursor: pointer; border: 1px solid var(--card-border); border-radius: 13px; overflow: hidden; background: var(--panel); display: block; ${simExp === s.hex ? "outline: 2px solid var(--accent);" : ""}`}>
                  <div style={`position: relative; height: 76px; background-color: ${s.hex};`}>
                    <span style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); color: #1c1917; font: 500 10px var(--font-ui); padding: 3px 8px; border-radius: 999px;">{s.match}% match</span>
                  </div>
                  <div style="padding: 11px 13px 13px;">
                    <div style="font: 500 14px var(--font-ui);">{s.name}</div>
                    <div style="font: 400 11px var(--font-mono); color: var(--faint);">{s.hex}</div>
                  </div>
                </a>
              ))}
            </div>
            {simExp && (() => {
              const s = sim.find((x) => x.hex === simExp);
              if (!s) return null;
              const infoColor: InfoboxColor = { hex: s.hex, name: s.name, onColor: s.onColor, h: s.h, s: s.s, l: s.l, primarySlug: s.primarySlug };
              return (
                <div style="margin-top: 14px;">
                  <ColorInfobox variant="flat" color={infoColor} platforms={s.platforms}
                    onPreview={() => setSimFull(true)} onDownload={() => setSimSheet(s)} />
                </div>
              );
            })()}
          </>
        )}
      </div>

      <div style="border-top: 1px solid var(--hairline); margin-top: 34px; padding-top: 26px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 18px;">
          <h2 style="font: 500 20px var(--font-ui); margin: 0;">Colors of the same era</h2>
          <span style="font: 400 12px var(--font-mono); color: var(--faint);">platforms released around {os.year} · popular defaults</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px;">
          {eraPeers.map((e) => (
            <a key={e.slug} href={e.href} style="border: 1px solid var(--card-border); border-radius: 13px; overflow: hidden; background: var(--panel); display: block;">
              <div style={`position: relative; height: 88px; background-color: ${e.hex};`}>
                <span style={`position: absolute; top: 8px; left: 10px; font: 500 12px var(--font-ui); color: ${e.onColor};`}>{e.colorName}</span>
                <span style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); color: #1c1917; font: 500 10px var(--font-mono); padding: 3px 8px; border-radius: 999px;">{e.rel}</span>
              </div>
              <div style="padding: 11px 13px 13px;">
                <div style="font: 500 14px var(--font-ui);"><span>{e.name}</span> ↗</div>
                <div style="font: 400 11px var(--font-mono); color: var(--faint);">{e.metaLine}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {sheet && <DownloadSheet osSlug={os.slug} color={{ hex: summary.hex, name: summary.name }} onClose={() => setSheet(false)} />}
      {full && (
        <FullscreenPreview
          hex={summary.hex} onColor={summary.onColor} style={os.desktopStyle} accent={accent}
          label={`${os.name} · ${summary.name} · ${summary.hex}`}
          pos={sel + 1} total={colors.length}
          onClose={() => setFull(false)} onPrev={() => step(-1)} onNext={() => step(1)}
        />
      )}
      {simFull && (() => {
        const idx = sim.findIndex((x) => x.hex === simExp);
        const cur = idx >= 0 ? sim[idx] : null;
        if (!cur) return null;
        return (
          <FullscreenPreview
            hex={cur.hex} onColor={cur.onColor} style={cur.style}
            label={`${cur.name} · ${cur.hex}`}
            pos={idx + 1} total={sim.length}
            onClose={() => setSimFull(false)} onPrev={() => stepSim(-1)} onNext={() => stepSim(1)}
          />
        );
      })()}
      {simSheet && <DownloadSheet osSlug={simSheet.primarySlug} color={{ hex: simSheet.hex, name: simSheet.name }} onClose={() => setSimSheet(null)} />}
    </div>
  );
}
