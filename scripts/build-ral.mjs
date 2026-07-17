// Usage: node scripts/build-ral.mjs <path-to-ral_classic.csv>
// Writes src/data/ral-classic.json as [{ code, name, hex }] with lowercased hex.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) { console.error("pass the CSV path"); process.exit(1); }

const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
const header = lines[0].split(",");
const iCode = header.indexOf("RAL");
const iHex = header.indexOf("HEX");
const iName = header.indexOf("English");
if (iCode < 0 || iHex < 0 || iName < 0) {
  console.error("unexpected CSV header:", lines[0]); process.exit(1);
}

const out = lines.slice(1).map((line) => {
  const f = line.split(",");
  return { code: f[iCode].trim(), name: f[iName].trim(), hex: f[iHex].trim().toLowerCase() };
}).filter((r) => /^#[0-9a-f]{6}$/.test(r.hex) && r.code && r.name);

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/ral-classic.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} RAL colors`);
