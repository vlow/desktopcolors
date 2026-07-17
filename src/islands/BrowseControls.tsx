import { useMemo, useState } from "preact/hooks";

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
  listColors: { hex: string; name: string }[];
}

type SortKey = "popular" | "year" | "alpha";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "year", label: "Year" },
  { key: "alpha", label: "A–Z" },
];

export function BrowseControls({ items }: { items: BrowseItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
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
    const cmp: Record<SortKey, (a: BrowseItem, b: BrowseItem) => number> = {
      popular: (a, b) => b.score - a.score,
      year: (a, b) => a.year - b.year,
      alpha: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(cmp[sort]);
  }, [items, query, sort]);

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
          <button onClick={() => setView("card")} style={`cursor: pointer; border: none; background: none; font: 500 15px var(--font-ui); color: ${view === "card" ? "var(--ink)" : "var(--faint)"};`}>&#x25A6; Cards</button>
          <button onClick={() => setView("list")} style={`cursor: pointer; border: none; background: none; font: 500 15px var(--font-ui); color: ${view === "list" ? "var(--ink)" : "var(--faint)"};`}>&#x2630; List</button>
          <span style="font: 500 11px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-left: 8px;">SORT</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              style={`cursor: pointer; border: none; background: none; font: 500 15px var(--font-ui); color: ${sort === s.key ? "var(--ink)" : "var(--faint)"}; text-decoration: ${sort === s.key ? "underline" : "none"}; text-underline-offset: 6px; text-decoration-thickness: 2px; text-decoration-color: var(--accent);`}
            >{s.label}</button>
          ))}
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
            <a key={it.slug} href={it.href} style="border: 1px solid var(--card-border); border-radius: 16px; overflow: hidden; background: var(--panel); display: block;">
              <div style={`position: relative; height: 132px; background-color: ${it.defaultHex};`}>
                <span style="position: absolute; left: 14px; bottom: 12px; background: rgba(255,255,255,0.92); color: var(--ink); font: 500 12px var(--font-mono); padding: 4px 9px; border-radius: 7px;">{it.defaultHex}</span>
              </div>
              <div style="padding: 16px 18px 18px;">
                <div data-testid="os-name" style="font: 500 18px var(--font-ui);">{it.name}</div>
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
                  <a key={c.hex} href={`/os/${it.slug}?hex=${encodeURIComponent(c.hex)}`} aria-label={`${c.name} swatch`} style="width: 100px;">
                    <div style={`height: 76px; border-radius: 10px; background-color: ${c.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.09);`} />
                    <div style="font: 500 12px var(--font-mono); margin-top: 8px;">{c.hex}</div>
                    <div style="font-size: 11px; color: var(--faint);">{c.name}</div>
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
