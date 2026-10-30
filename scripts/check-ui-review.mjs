// UI review check (docs/ui-review-guide.md) — the mechanical half of a UI
// review, so a reviewer only has to read for the things a grep can't see.
//
//   node scripts/check-ui-review.mjs            # diff against origin/main
//   node scripts/check-ui-review.mjs main       # or any other base ref
//
// Looks only at lines this branch ADDS (committed or not) in .jsx/.js files
// under src/, so old code doesn't drown the report.
//
// Fails (exit 1) on:
//   1. A native <select> — use ChoiceRow / Chips / SearchableSelect.
//   2. A raw range input — use SliderRow (number beside it, edge-safe).
//   3. A plain <Textarea> — user-authored text uses MentionTextarea.
//   4. window.confirm / alert / prompt — use confirm() from ConfirmDialog.
//   5. A hardcoded alter / fronting / switch / headmate word in visible
//      text or a label/title/placeholder/hint prop — use useTerms().
// Warns (doesn't fail) on things a human must look at:
//   - pill-tab sections: a rounded-full button that sets a tab/section/
//     view state. One screen split into pills is the pattern the inspector
//     guide replaced — use TabBar or drill-in pages (LinkRow → page).
//   - − / + steppers (Minus/Plus icons next to a number) — sizes and counts
//     are SliderRows.
//   - a hand-rolled range of controls next to a label (`flex justify-between`
//     + a switch/checkbox) — that is a SettingRows Row.
//   - fixed full-screen overlays (`fixed inset-0`) — a sheet or an existing
//     modal component is usually the right home.
// A line (or the line above it) marked `ui-ok` is skipped — say why beside it.

import { execSync } from "node:child_process";

const base = process.argv[2] || "origin/main";
let diff;
try {
  const mergeBase = execSync(`git merge-base ${base} HEAD`, { encoding: "utf8" }).trim();
  diff = execSync(`git diff -U0 ${mergeBase} -- src`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error(`Couldn't diff against ${base}: ${e.message}`);
  process.exit(2);
}

// "switch" is left out: as a verb ("Switch to it") it is ordinary English.
const TERM_WORDS = "alters?|fronting|fronters?|fronted|headmates?|co-?front(?:ing|ers?)?";
const RULES = [
  { id: "native-select", re: /<select\b/, msg: "native <select> (use ChoiceRow / Chips / SearchableSelect)" },
  { id: "range-input", re: /type=["']range["']/, msg: "raw range input (use SliderRow)" },
  { id: "plain-textarea", re: /<Textarea\b/, msg: "plain <Textarea> for user text (use MentionTextarea)" },
  { id: "browser-dialog", re: /\bwindow\.(?:confirm|alert|prompt)\(|(?<![\w.]|await\s)(?:alert|prompt)\(\s*["'`]/, msg: "browser confirm/alert/prompt (use confirm() from ConfirmDialog)" },
  {
    id: "hardcoded-term",
    // visible JSX text, or a user-facing string prop
    re: new RegExp(
      `>[^<>{}]*\\b(?:${TERM_WORDS})\\b[^<>{}]*<|\\b(?:label|title|placeholder|hint|aria-label|sub|body)=["'][^"']*\\b(?:${TERM_WORDS})\\b`,
      "i",
    ),
    msg: "hardcoded term in visible text (use useTerms())",
  },
];
const WARNS = [
  { id: "pill-tabs", re: /rounded-full[\s\S]{0,240}set(?:Tab|ActiveTab|Section|View|Pane|Page|Mode)\(|set(?:Tab|ActiveTab|Section|View|Pane|Page|Mode)\([\s\S]{0,240}rounded-full/, msg: "pill tabs splitting a screen? (use TabBar or drill-in pages)" },
  { id: "stepper", re: /<Minus\b[\s\S]{0,400}<Plus\b/, msg: "− / + stepper (sizes and counts are SliderRows)" },
  { id: "hand-row", re: /flex[^"']*justify-between[\s\S]{0,300}(?:<Switch\b|type=["']checkbox["'])/, msg: "hand-rolled setting row (use SwitchRow / Row)" },
  { id: "overlay", re: /\bfixed inset-0\b/, msg: "full-screen overlay (a sheet / existing modal?)" },
];

// Written content, not UI: the changelog and the wiki preview's example text.
const SKIP_FILES = /src\/lib\/(changelog|previewWiki|previewSystems)\.js$|src\/locales\//;

// Parse the diff into { file, line, text } for each added line.
const added = [];
let file = null, line = 0;
for (const l of diff.split("\n")) {
  if (l.startsWith("+++ ")) { file = l.slice(6); continue; }
  const h = /^@@ -\S+ \+(\d+)/.exec(l);
  if (h) { line = Number(h[1]); continue; }
  if (!file || !/\.(jsx|js)$/.test(file) || SKIP_FILES.test(file)) continue;
  if (l.startsWith("+") && !l.startsWith("+++")) { added.push({ file, line, text: l.slice(1) }); line++; }
}

const skip = (i) => added[i].text.includes("ui-ok") || (added[i - 1] && added[i - 1].file === added[i].file && added[i - 1].text.includes("ui-ok"));
const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t);

let failures = 0;
added.forEach((a, i) => {
  if (skip(i) || isComment(a.text)) return;
  for (const r of RULES) {
    if (r.re.test(a.text)) { console.log(`FAIL ${a.file}:${a.line}  ${r.msg}\n     ${a.text.trim().slice(0, 140)}`); failures++; }
  }
});

// Warnings look across a few added lines at once (JSX spreads over lines).
const warned = new Set();
added.forEach((a, i) => {
  if (skip(i) || isComment(a.text)) return;
  const win = added.slice(i, i + 8).filter((b) => b.file === a.file).map((b) => b.text).join("\n");
  for (const w of WARNS) {
    const key = `${w.id}:${a.file}:${Math.floor(a.line / 10)}`;
    if (warned.has(key)) continue;
    if (firstLineMatters(w, a.text) && w.re.test(win)) {
      warned.add(key);
      console.log(`warn ${a.file}:${a.line}  ${w.msg}`);
    }
  }
});
// Only report a window from the line where its pattern starts, so one
// block isn't listed eight times.
function firstLineMatters(w, text) {
  const starts = { "pill-tabs": /rounded-full|set(?:Tab|ActiveTab|Section|View|Pane|Page|Mode)\(/, stepper: /<Minus\b/, "hand-row": /justify-between/, overlay: /fixed inset-0/ };
  return starts[w.id].test(text);
}

console.log(`\n${added.length} added lines checked against ${base}: ${failures} failure${failures === 1 ? "" : "s"}, ${warned.size} to look at.`);
console.log("The rest of the review is the read-through in docs/ui-review-guide.md.");
process.exit(failures ? 1 : 0);
