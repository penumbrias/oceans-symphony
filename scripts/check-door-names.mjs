// The help doors have three names (v0.370.2): Setup (Settings → Setup and
// the welcome steps), Tour (the whole-app tour) and "Show me around this
// page" (one page's walk-through). The older names are retired; copy that
// still points at them sends people looking for a door that doesn't exist.
// Fails on any retired name in user-facing code. Comments and the
// changelog (history) are skipped.
//   node scripts/check-door-names.mjs   (npm run check:doors)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RETIRED = [
  // Case-sensitive: search keywords may keep the old words in lower case.
  /Setup guide/, /Feature tour/, /Re-run setup/, /Guide & tour/i, /Guide &amp; tour/i,
  /Tour & onboarding/i, /Tour &amp; onboarding/i, /Take the full tour/i,
];
const SKIP = new Set(["src/lib/changelog.js"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|mjs)$/.test(name)) yield p;
  }
}

const problems = [];
for (const file of walk("src")) {
  if (SKIP.has(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  let inBlock = false;
  lines.forEach((line, i) => {
    let code = line;
    if (inBlock) { if (!code.includes("*/")) return; code = code.slice(code.indexOf("*/") + 2); inBlock = false; }
    const t = code.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;
    if (t.startsWith("/*")) { if (!t.includes("*/")) inBlock = true; return; }
    code = code.replace(/\{\/\*.*?\*\/\}/g, "").replace(/\s\/\/\s.*$/, "");
    for (const re of RETIRED) if (re.test(code)) problems.push(`${file}:${i + 1}  ${re.source}  ${t.slice(0, 120)}`);
  });
}

if (problems.length) {
  console.error(`Retired help-door names (use Setup, Tour or "Show me around this page"):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("Door names OK: only Setup, Tour and Show me around.");
