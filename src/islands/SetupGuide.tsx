import { useMemo, useState } from "preact/hooks";
import {
  filterGuides, guideCounts, type SetupGuideEntry, type GuideCat,
} from "../lib/setup-guides";

const seg = (active: boolean): string =>
  `cursor: pointer; border: none; border-radius: 8px; padding: 9px 16px; font: 500 13px var(--font-ui); background: ${active ? "#fff" : "transparent"}; color: ${active ? "var(--ink)" : "var(--muted)"}; box-shadow: ${active ? "0 1px 3px rgba(0,0,0,0.12)" : "none"};`;

export function SetupGuide({ guides }: { guides: SetupGuideEntry[] }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<GuideCat | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => guideCounts(guides, query), [guides, query]);
  const shown = useMemo(() => filterGuides(guides, { query, cat }), [guides, query, cat]);

  const filters: { key: GuideCat | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "desktop", label: "Desktop", count: counts.desktop },
    { key: "mobile", label: "Mobile", count: counts.mobile },
  ];

  return (
    <div>
      <div class="dc-page-x" style="padding-block: 34px 4px;">
        <div style="font: 400 12px var(--font-mono); color: var(--faint); letter-spacing: 1.5px;">SETUP GUIDE</div>
        <h1 style="font: 700 34px var(--font-ui); letter-spacing: -0.8px; margin: 8px 0;">Set a solid color on a modern OS</h1>
        <p style="font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 640px; margin: 0;">Every hex on this site works as a plain desktop background today. Pick a color, copy its hex, then follow the steps for your system.</p>
      </div>

      <div class="dc-page-x" style="padding-block: 20px 20px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
        <label style="flex: 1; min-width: 240px; max-width: 460px; display: flex; align-items: center; gap: 11px; background: var(--panel); border: 1px solid var(--field-border); border-radius: 12px; padding: 0 15px; height: 46px;">
          <span style="color: var(--faint); transform: rotate(-45deg); display: inline-block;">⌕</span>
          <input value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} placeholder="Search systems — Windows, macOS, GNOME, iOS…" style="border: none; outline: none; background: transparent; font: 400 14px var(--font-ui); color: var(--ink); width: 100%;" />
        </label>
        <div style="display: inline-flex; gap: 4px; background: #f0eeec; border-radius: 11px; padding: 4px;">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setCat(f.key)} style={seg(cat === f.key)}>
              {f.label}<span style="font: 400 11px var(--font-mono); opacity: 0.55; margin-left: 6px;">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div class="dc-page-x"><hr class="dc-rule" /></div>

      {shown.length === 0 ? (
        <div class="dc-page-x" style="padding-block: 60px; text-align: center; color: var(--muted);">
          <div style="font: 500 19px var(--font-ui); color: var(--ink);">No systems match your filters</div>
          <div style="font-size: 14px; margin-top: 6px;">Try a different search term or switch categories.</div>
        </div>
      ) : (
        <div class="dc-page-x" style="padding-block: 16px 72px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; align-items: start;">
          {shown.map((g) => {
            const expanded = open === g.key;
            return (
              <div
                key={g.key}
                class={expanded ? "dc-guide-card--expanded" : undefined}
                style="background: var(--panel); border: 1px solid var(--card-border); border-radius: 14px; padding: 20px 22px 18px; display: flex; flex-direction: column;"
              >
                <div style="display: flex; align-items: center; gap: 11px;">
                  <span style={`width: 30px; height: 30px; border-radius: 8px; background-color: ${g.swatch}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); flex: none;`} />
                  <div style="flex: 1;">
                    <div style="font: 600 17px var(--font-ui);">{g.os}</div>
                    <div style="font: 400 11px var(--font-mono); color: var(--faint);">{g.note}</div>
                  </div>
                  <span style="flex: none; font: 500 10px var(--font-ui); letter-spacing: 0.5px; color: var(--muted); background: #f5f4f2; padding: 4px 9px; border-radius: 999px;">{g.cat === "mobile" ? "Mobile" : "Desktop"}</span>
                </div>

                <div class="dc-guide-content">
                  <div style="min-width: 0;">
                    <ol style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 11px;">
                      {g.steps.map((text, i) => (
                        <li key={i} style="display: flex; gap: 11px; align-items: flex-start; font-size: 13.5px; line-height: 1.5; color: #44403c;">
                          <span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: #f0eeec; color: var(--muted); font: 600 11px var(--font-mono); display: flex; align-items: center; justify-content: center; margin-top: 1px;">{i + 1}</span>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ol>

                    {g.code && (
                      <pre style="margin: 15px 0 0; background: var(--ink); color: var(--hairline); border-radius: 10px; padding: 13px 15px; font: 400 12px var(--font-mono); line-height: 1.6; overflow-x: auto; white-space: pre; max-width: 100%;">{g.code}</pre>
                    )}
                  </div>

                  {expanded && (
                    <div style="min-width: 0;">
                      <div style="font: 400 10px var(--font-mono); color: var(--faint); letter-spacing: 1.5px; margin-bottom: 8px;">FULL GUIDE</div>
                      {g.article.map((para, i) => (
                        <p key={i} style="font-size: 13.5px; line-height: 1.65; color: #44403c; margin: 0 0 11px;">{para}</p>
                      ))}
                      {g.shots && g.shots.length > 0 && (
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 6px;">
                          {g.shots.map((sh, i) => (
                            <figure key={i} style="margin: 0;">
                              <div style="height: 150px; border-radius: 10px; overflow: hidden; border: 1px solid var(--card-border); background: #f5f4f2; display: flex; align-items: center; justify-content: center; color: var(--faint); font: 400 11px var(--font-mono); text-align: center; padding: 8px;">{sh.label}</div>
                              <figcaption style="font: 400 11px var(--font-mono); color: var(--faint); margin-top: 6px;">{sh.label}</figcaption>
                            </figure>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={() => setOpen((k) => k === g.key ? null : g.key)} style="align-self: flex-start; margin-top: 16px; cursor: pointer; background: transparent; border: none; color: var(--accent-strong); font: 500 13px var(--font-ui); padding: 4px 0;">
                  {expanded ? "Show less ↑" : "Read full guide ↓"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
