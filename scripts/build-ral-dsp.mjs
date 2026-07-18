// Usage: node scripts/build-ral-dsp.mjs <path-to-wikitext.txt>
// Parses the "RAL Design System+" table from the raw wikitext of
// https://en.wikipedia.org/wiki/List_of_RAL_colours and writes
// src/data/ral-design-plus.json as [{ code, name, hex }] with lowercased hex.
//
// Each data row looks like:
//   | Ink Black ||{{N/A|0°}}||15%||0%||{{#invoke:biglist|coltit|rgb=33,33,34}}|| 33|| 33|| 34|| H000L15C00
// i.e. cells joined by "||", the last four being Red, Green, Blue, Code.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const srcPath = process.argv[2];
if (!srcPath) { console.error("pass the wikitext path"); process.exit(1); }

const hex2 = (n) => n.toString(16).padStart(2, "0");

// Wikipedia code "H000L15C00" -> official notation "RAL 000 15 00".
function formatCode(raw) {
  const m = /^H(\d{3})L(\d{2})C(\d{2})$/.exec(raw);
  return m ? `RAL ${m[1]} ${m[2]} ${m[3]}` : raw;
}

const out = [];
for (const line of readFileSync(srcPath, "utf8").split(/\r?\n/)) {
  if (!/H\d{3}L\d{2}C\d{2}\s*$/.test(line)) continue; // only DSP+ data rows
  const cells = line.split("||").map((c) => c.trim());
  if (cells.length < 5) continue;
  const code = cells[cells.length - 1];
  const r = Number(cells[cells.length - 2 - 2]);
  const g = Number(cells[cells.length - 2 - 1]);
  const b = Number(cells[cells.length - 2]);
  const name = cells[0].replace(/^\|/, "").trim();
  if (![r, g, b].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) continue;
  if (!name) continue;
  out.push({ code: formatCode(code), name, hex: `#${hex2(r)}${hex2(g)}${hex2(b)}` });
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/ral-design-plus.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} RAL Design System+ colors`);
