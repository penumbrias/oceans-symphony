// Fails when a file reads the SystemSettings singleton with a bare `[0]`.
// A boot-created empty stub can sit alongside the real record, so `[0]` can
// read (and worse, write) the wrong row. Use pickPrimarySystemSettings(rows).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const VARS = "settingsList|settingsRows|ssList|systemSettingsList|systemSettingsData|systemSettings|settings|rows|list|fresh";
const BARE = new RegExp(`\\b(?:${VARS})\\??\\.?\\[0\\]`);
const AWAIT = /SystemSettings\.list\(\)[^;\n]*\)\??\.?\[0\]/;
const DATA = /SystemSettings\.list\(\) \}\)\.data\??\.?\[0\]/;

const bad = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(jsx?|mjs)$/.test(e.name)) continue;
    const text = fs.readFileSync(p, "utf8");
    if (!text.includes("SystemSettings")) continue;
    if (p.endsWith("systemSettingsSingleton.js")) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (line.includes("pickPrimarySystemSettings")) return;
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (!(AWAIT.test(line) || DATA.test(line))) {
        if (!BARE.test(line)) return;
        // Only flag when the file reads SystemSettings into that variable.
        const v = line.match(BARE)[0].replace(/\??\.?\[0\]$/, "");
        const reads = new RegExp(`(?:${v}\\b[^\\n]*=|data: ${v}\\b)[^\\n]*SystemSettings|SystemSettings\\.list\\(\\)[\\s\\S]{0,200}\\b${v}\\b`);
        if (!reads.test(text)) return;
      }
      bad.push(`${path.relative(process.cwd(), p)}:${i + 1}: ${line.trim()}`);
    });
  }
}
walk(ROOT);
if (bad.length) {
  console.error("SystemSettings read with a bare [0] — use pickPrimarySystemSettings(rows):");
  for (const b of bad) console.error("  " + b);
  process.exit(1);
}
console.log("check-settings-singleton: ok");
