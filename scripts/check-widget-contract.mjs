// Widget contract check (docs/widget-contract.md) — the rules a widget can
// break without anything looking wrong until someone changes its options.
//
//   node scripts/check-widget-contract.mjs
//
// Fails (exit 1) on:
//   1. Bracketed rem text sizes (`text-[0.625rem]`) — they ignore the
//      widget's own Text size. Use em brackets or the standard utilities.
//   2. Look fields read straight off `settings` (`settings.bg`, …) — the
//      look arrives as CSS variables through lookToStyle(); a direct read
//      skips the user's styles, presets and inheritance.
//   3. Grey/white text classes that escape the text colour override
//      (`text-gray-400`, `text-white`, …).
// A line (or the line above it) marked `contract-ok` is content, not
// chrome — e.g. white initials on a member's own colour — and is skipped.
// Reports (does not fail) theme-token chrome borders (`border-border`),
// which should move to `var(--v2-accent)` as widgets are touched.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDGET_FILES = [
  "src/v2/widgets.jsx",
  "src/v2/moreWidgets.jsx",
  "src/v2/needsWidgets.jsx",
  "src/v2/commandWidgets.jsx",
  "src/v2/activityWidgets.jsx",
  "src/v2/infoWidgets.jsx",
  "src/v2/gardenProfileWidgets.jsx",
  "src/v2/gardenConnectionWidgets.jsx",
  "src/v2/gardenGroupWidgets.jsx",
  "src/v2/gardenContactWidgets.jsx",
  "src/v2/primitives.jsx",
  "src/v2/notices.jsx",
  "src/lib/widgetRegistry.jsx",
];

const lookSrc = readFileSync(join(root, "src/lib/widgetLook.js"), "utf8");
const start = lookSrc.indexOf("export const LOOK_KEYS");
const LOOK_KEYS = [...lookSrc.slice(start, lookSrc.indexOf("];", start)).matchAll(/"(\w+)"/g)].map((m) => m[1]);
if (!LOOK_KEYS.length) { console.error("Couldn't read LOOK_KEYS from widgetLook.js"); process.exit(1); }

const RULES = [
  { id: "rem-text", re: /\btext-\[[\d.]+rem\]/, msg: "bracketed rem text size (use em)" },
  { id: "look-read", re: new RegExp(`\\bsettings\\??\\.(${LOOK_KEYS.join("|")})\\b`), msg: "look field read off settings (use the CSS variables)" },
  { id: "grey-text", re: /\btext-(?:gray|slate|zinc|neutral|stone)-\d{2,3}\b|\btext-(?:white|black)\b/, msg: "text class that escapes the text colour override" },
];
const WARN = { re: /\bborder-border\b/, msg: "theme-token chrome border (prefer var(--v2-accent))" };

let failures = 0;
const warnings = {};
for (const file of WIDGET_FILES) {
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("contract-ok") || (lines[i - 1] || "").includes("contract-ok")) return;
    const code = line.replace(/\/\/.*$/, "");
    for (const r of RULES) {
      if (r.re.test(code)) {
        failures++;
        console.log(`✗ ${file}:${i + 1} ${r.msg}\n    ${line.trim().slice(0, 140)}`);
      }
    }
    if (WARN.re.test(code)) warnings[file] = (warnings[file] || 0) + 1;
  });
}

for (const [file, n] of Object.entries(warnings)) console.log(`· ${file}: ${n} × ${WARN.msg}`);
if (failures) { console.log(`\n${failures} widget contract violation(s).`); process.exit(1); }
console.log(`Widget contract: ${WIDGET_FILES.length} files clean.`);
