import { useMemo, useState } from "preact/hooks";
import { colorPath } from "../lib/links";

export interface BrowseItem {
  slug: string;
  name: string;
  year: number;
  family: string;
  tagline: string;
  defaultHex: string;
  colorCount: number;
  score: number;
  scoreLabel: string;
  altColors: { hex: string; name: string }[];
  href: string;
  listColors: { hex: string; name: string; default?: boolean }[];
}

type SortKey = "popular" | "year" | "alpha";

// icon = the sort *type* glyph (★ popularity, ◷ chronological, none for A–Z).
const SORTS: { key: SortKey; label: string; icon: string; full: string }[] = [
  { key: "popular", label: "Popular", icon: "★", full: "Popularity" },
  { key: "year", label: "Year", icon: "◷", full: "Chronological" },
  { key: "alpha", label: "A–Z", icon: "", full: "Alphabetical" },
];

// A selected control is fully underlined (the icon glyphs are inline text inside
// the button, so text-decoration underlines them along with the label).
const underline = (active: boolean): string =>
  active
    ? "text-decoration: underline; text-underline-offset: 6px; text-decoration-thickness: 2px; text-decoration-color: var(--accent);"
    : "text-decoration: none;";

export function BrowseControls({ items }: { items: BrowseItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [rev, setRev] = useState(false);
  const [view, setView] = useState<"card" | "list">("card");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = items.filter((it) =>
        it.name.toLowerCase().includes(q) ||
        it.family.toLowerCase().includes(q) ||
        it.tagline.toLowerCase().includes(q) ||
        it.defaultHex.includes(q) ||
        it.altColors.some((c) => c.name.toLowerCase().includes(q) || c.hex.includes(q)));
    }
    // Default direction per sort: popularity → most first, year → oldest first,
    // A–Z → ascending. Reverse flips whichever is active.
    const cmp: Record<SortKey, (a: BrowseItem, b: BrowseItem) => number> = {
      popular: (a, b) => b.score - a.score,
      year: (a, b) => a.year - b.year,
      alpha: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort((a, b) => (rev ? -cmp[sort](a, b) : cmp[sort](a, b)));
  }, [items, query, sort, rev]);

  // First click selects a sort (default direction); clicking the active sort reverses it.
  const selectSort = (key: SortKey) => {
    if (key === sort) setRev((r) => !r);
    else { setSort(key); setRev(false); }
  };

  const dirWord: Record<SortKey, string> = {
    popular: rev ? "least first" : "most first",
    year: rev ? "newest first" : "oldest first",
    alpha: rev ? "Z → A" : "A → Z",
  };

  return (
    <div>
      <div style="padding: 34px 48px 22px; border-bottom: 1px solid var(--hairline);">
        <div style="font: 700 30px var(--font-ui); letter-spacing: -0.5px;">The desktop color archive</div>
        <div style="color: var(--muted); font-size: 15px; margin-top: 6px; max-width: 560px; line-height: 1.5;">
          Every solid desktop background color shipped by classic operating systems and desktop environments.
        </div>
        <label style="margin-top: 26px; display: flex; align-items: center; gap: 12px; background: var(--panel); border: 1px solid var(--field-border); border-radius: 13px; padding: 0 16px; height: 52px; max-width: 680px;">
          <span style="color: var(--faint); transform: rotate(-45deg);">&#9906;</span>
          <input
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Search platforms or colors — Windows 95, teal, #008080…"
            style="border: none; outline: none; background: transparent; font: 400 15px var(--font-ui); color: var(--ink); width: 100%;"
          />
        </label>
        <div style="display: flex; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap;">
          <span style="font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">VIEW</span>
          <button
            onClick={() => setView("card")}
            style={`cursor: pointer; border: none; background: none; padding: 0; font: 500 15px var(--font-ui); color: ${view === "card" ? "var(--ink)" : "var(--faint)"}; ${underline(view === "card")}`}
          ><span style="font-size: 13px;">&#9635;</span> Cards</button>
          <span style="color: #d6d3d1;">|</span>
          <button
            onClick={() => setView("list")}
            style={`cursor: pointer; border: none; background: none; padding: 0; font: 500 15px var(--font-ui); color: ${view === "list" ? "var(--ink)" : "var(--faint)"}; ${underline(view === "list")}`}
          ><span style="font-size: 13px;">&#9776;</span> List</button>

          <span style="margin-left: auto; font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SORT</span>
          {SORTS.map((s) => {
            const active = sort === s.key;
            return (
              <button
                key={s.key}
                onClick={() => selectSort(s.key)}
                title={active ? `${s.full} — click to reverse (${dirWord[s.key]})` : `Sort by ${s.full.toLowerCase()}`}
                style={`cursor: pointer; border: none; background: none; padding: 0; font: 500 15px var(--font-ui); color: ${active ? "var(--ink)" : "var(--faint)"}; ${underline(active)}`}
              >
                {s.icon && <span style="font-size: 13px;">{s.icon} </span>}
                {s.label}
                <span style={`font-size: 12px; opacity: ${active ? "1" : "0.25"};`}> {active && rev ? "↑" : "↓"}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <div style="padding: 72px 48px; text-align: center; color: var(--muted);">
          <div style="font: 500 20px var(--font-ui); color: var(--ink);">No platforms or colors match &ldquo;{query}&rdquo;</div>
          <div style="font-size: 14px; margin-top: 8px;">Try a platform name, a color name like &ldquo;teal&rdquo;, or a hex value.</div>
        </div>
      ) : view === "card" ? (
        <main style="padding: 32px 48px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px;">
          {shown.map((it) => (
            <a key={it.slug} href={it.href} class="dc-card" style="border: 1px solid var(--card-border); border-radius: 16px; overflow: hidden; background: var(--panel); display: block;">
              <div style={`position: relative; height: 132px; background-color: ${it.defaultHex};`}>
                <span style="position: absolute; left: 14px; bottom: 12px; background: rgba(255,255,255,0.92); color: var(--ink); font: 500 12px var(--font-mono); padding: 4px 9px; border-radius: 7px;">{it.defaultHex}</span>
              </div>
              <div style="padding: 16px 18px 18px;">
                <div style="display: inline-flex; align-items: center; gap: 6px;">
                  <span data-testid="os-name" style="font: 500 18px var(--font-ui);">{it.name}</span>
                  <span aria-hidden="true" style="font-size: 13px; color: var(--accent);">↗</span>
                </div>
                <div style="font: 400 12px var(--font-mono); color: var(--faint); margin-top: 4px;">{it.year} · {it.family}</div>
                <div style="font-size: 12px; color: var(--muted); margin-top: 8px; line-height: 1.45; min-height: 34px;">{it.tagline}</div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 14px;">
                  <div style="display: flex; gap: 6px;">
                    {it.altColors.slice(0, 4).map((c) => (
                      <span key={c.hex} title={c.name} style={`width: 22px; height: 22px; border-radius: 6px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);`} />
                    ))}
                  </div>
                  <span style="margin-left: auto; font: 400 11px var(--font-mono); color: var(--faint);">{it.colorCount} colors</span>
                </div>
              </div>
            </a>
          ))}
        </main>
      ) : (
        <main style="padding: 6px 48px 80px;">
          {shown.map((it) => (
            <div key={it.slug} style="display: grid; grid-template-columns: 230px 1fr; gap: 32px; padding: 26px 0; border-bottom: 1px solid var(--card-border); align-items: start;">
              <div>
                <a href={it.href} data-testid="os-name" style="font: 500 19px var(--font-ui);">{it.name} ↗</a>
                <div style="font: 400 12px var(--font-mono); color: var(--faint); margin-top: 6px;">{it.year} · {it.family} · {it.colorCount} colors</div>
                <div style="font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.5;">{it.tagline}</div>
              </div>
              <div style="display: flex; gap: 14px; flex-wrap: wrap;">
                {it.listColors.map((c) => (
                  <a key={c.hex} href={colorPath(it.slug, c.hex)} aria-label={`${c.name} swatch`} style="width: 100px;">
                    <div class="dc-swatch" style={`height: 76px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.09);`} />
                    <div style="font: 500 12px var(--font-mono); margin-top: 8px;">{c.hex}</div>
                    <div style="font-size: 11px; color: var(--faint);">{c.name}</div>
                    {c.default && (
                      <div style="display: inline-flex; align-items: center; gap: 5px; font: 600 10px var(--font-ui); color: var(--accent-strong); letter-spacing: 0.4px; margin-top: 3px;">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--accent);" />
                        DEFAULT
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </main>
      )}
    </div>
  );
}
