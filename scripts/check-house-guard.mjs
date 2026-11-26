#!/usr/bin/env node
// The house guard (new house step 1.1, building code §9).
//
// Reads EVERY file under src/house/ (whole files, not a diff: the new house
// starts clean and must stay clean) and fails on:
//   1. fixed pixel text: px font-size in CSS, fontSize as a number or "Npx"
//      in JS, text-[Npx] classes — text is rem, or em inside a widget;
//   2. button, chip, tick or tab styles outside the kit (src/house/kit/):
//      a raw <button>, a checkbox/radio input, role="tab|tablist|checkbox|
//      radio|switch", or the old house's button/checkbox/tabs/select/switch/
//      radio-group/badge/toggle components;
//   3. a browser-native date, time, colour or dropdown control outside the
//      kit (type="color" nowhere, not even in the kit: board 38, R3);
//   4. a forced override (!important);
//   5. an "x" / "✕" / "×" / "✗" used as a tick;
//   6. "Update", "Apply" or "Submit" as a button's words (use Save, §1);
//   7. the pixel font named anywhere but its one token (src/house/tokens/roles.js).
//
// The old house is not checked (it would fail on all of these today).
// A line marked `house-ok: <why>` is skipped; say why beside it.
//
//   node scripts/check-house-guard.mjs          # exit 1 on any finding
//   import { runHouseGuard, scanText } from "./check-house-guard.mjs"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HOUSE_DIR = "src/house";
const KIT_DIR = "src/house/kit/";
const PIXEL_FONT_HOME = "src/house/tokens/roles.js";

export const RULES = [
  {
    id: "px-text",
    re: /font-size\s*:\s*-?\d*\.?\d+px|\bfontSize\s*:\s*(?:-?\d|["'`]\s*\d*\.?\d+px)|\btext-\[\d*\.?\d+px\]|\bfont\s*:\s*[^;]*\d+px/,
    msg: "fixed pixel text size (use the type tokens: var(--house-text-*), rem, or em inside a widget)",
  },
  {
    id: "control-outside-kit",
    outsideKitOnly: true,
    re: /<button\b|type=["'](?:checkbox|radio)["']|role=["'](?:tab|tablist|checkbox|radio|radiogroup|switch)["']|from\s+["']@\/components\/ui\/(?:button|checkbox|tabs|select|switch|radio-group|badge|toggle|toggle-group)["']/,
    msg: "button, chip, tick or tab made outside the kit (use the kit's block from src/house/kit/)",
  },
  {
    id: "native-colour",
    re: /type=["']color["']/,
    msg: "browser colour picker (always the kit colour picker; building code R3)",
  },
  {
    id: "native-date-select",
    outsideKitOnly: true,
    re: /<select\b|type=["'](?:date|time|datetime-local|month|week)["']/,
    msg: "browser-native date, time or dropdown control outside the kit",
  },
  {
    id: "important",
    re: /!\s*important\b/,
    msg: "forced override (!important); fix the specificity instead",
  },
  {
    id: "x-as-tick",
    re: /(?:checked|ticked|selected|isOn|\bon|done|active)\s*\?\s*["'`]\s*[xX✕✗×]\s*["'`]|content\s*:\s*["']\s*[xX✕✗×]\s*["']|>\s*[✕✗×]\s*<\/(?:span|i)>\s*\)?\s*:\s*null/,
    msg: "an \"x\" used as a tick (a ticked box shows ✓; building code §3)",
  },
  {
    id: "retired-verb",
    re: /<(?:button|Button|HouseButton)\b[^>]*>\s*(?:Update|Apply|Submit)\s*</,
    msg: "\"Update\" / \"Apply\" / \"Submit\" on a button (the verb is Save; building code §1)",
  },
  {
    id: "pixel-font",
    re: /Pixelify/i,
    allowIn: [PIXEL_FONT_HOME],
    msg: "the pixel font named outside its one token (src/house/tokens/roles.js PIXEL_LABEL_FONT)",
  },
];

const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t);

// Scan one file's text. `file` is repo-relative with forward slashes.
export function scanText(file, text) {
  const findings = [];
  const inKit = file.startsWith(KIT_DIR);
  // Block comments are blanked (line count kept), so prose about a rule
  // never trips it.
  const lines = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).split("\n");
  lines.forEach((line, i) => {
    if (line.includes("house-ok") || (i > 0 && lines[i - 1].includes("house-ok"))) return;
    if (isComment(line)) return;
    for (const r of RULES) {
      if (r.outsideKitOnly && inKit) continue;
      if (r.allowIn && r.allowIn.includes(file)) continue;
      if (r.re.test(line)) findings.push({ file, line: i + 1, id: r.id, msg: r.msg, text: line.trim().slice(0, 140) });
    }
  });
  return findings;
}

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

export function runHouseGuard({ root = ROOT } = {}) {
  const files = walk(path.join(root, HOUSE_DIR));
  const findings = [];
  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    findings.push(...scanText(rel, fs.readFileSync(abs, "utf8")));
  }
  return { files: files.length, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, findings } = runHouseGuard();
  for (const f of findings) console.log(`FAIL ${f.file}:${f.line}  ${f.msg}\n     ${f.text}`);
  console.log(`House guard: ${files} file${files === 1 ? "" : "s"} in ${HOUSE_DIR}/, ${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
  process.exit(findings.length ? 1 : 0);
}
