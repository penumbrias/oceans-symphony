// Tour step check — the page tutorials ("New to this page?") and the full
// feature tour play buildSteps() one card at a time, so each card has to
// stay a short, single idea.
//
//   node scripts/check-tour-steps.mjs
//
// Fails (exit 1) on:
//   1. A body longer than STEP_BODY_LIMIT characters — split it into more
//      steps instead of writing a longer one.
//   2. The same step (route + title) listed twice.
//   3. A `target` (or one of its fallbacks) with no matching data-tour="…"
//      anywhere in src/ — the spotlight would silently highlight nothing.
//   4. A step missing its title, body or emoji.
// Every combination is checked: classic and new UI, with and without a
// profile to visit, with and without the demo profile.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tourPath = join(root, "src/components/onboarding/FeatureTour.jsx");
const src = readFileSync(tourPath, "utf8");

// buildSteps is a pure function of the terms, so it runs here without
// React: take its source (and its constants) and evaluate it.
const start = src.indexOf("export const STEP_BODY_LIMIT");
const end = src.indexOf("// `restrictToRoute`");
if (start < 0 || end < 0) {
  console.error("check-tour-steps: couldn't find buildSteps in FeatureTour.jsx");
  process.exit(1);
}
const code = src.slice(start, end).replace(/export (const|function) /g, "$1 ")
  + "\nreturn { buildSteps, STEP_BODY_LIMIT };";
const { buildSteps, STEP_BODY_LIMIT } = new Function(code)();

// Default-length terms: each key reads as itself ("alters", "Fronting"…),
// which is about the length of the default words.
const terms = new Proxy({}, { get: (_, k) => String(k) });

// Every data-tour id in the app (static and the few computed ones).
const anchors = new Set();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(jsx?|tsx?)$/.test(name)) continue;
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/(?:data-tour|tourId)=["']([^"'$]+)["']/g)) anchors.add(m[1]);
    for (const m of text.matchAll(/tour:\s*["']([^"']+)["']/g)) anchors.add(m[1]);
    for (const m of text.matchAll(/"data-tour":\s*["']([^"']+)["']/g)) anchors.add(m[1]);
  }
};
walk(join(root, "src"));
// Computed ids: Settings sections (`settings-${id}`), Reminders tabs and the
// Check-in manager's Feelings tab.
for (const m of readFileSync(join(root, "src/pages/Settings.jsx"), "utf8").matchAll(/<Section id="([^"]+)"/g)) anchors.add(`settings-${m[1]}`);
for (const tab of ["inbox", "manage"]) anchors.add(`reminders-${tab}-tab`);
anchors.add("checkin-feelings-tab");

const problems = new Set();
let total = 0;
for (const uiV2On of [false, true]) {
  for (const [alterId, demo] of [[null, false], ["ALTER", false], ["ALTER", true]]) {
    const steps = buildSteps(terms, alterId, demo, uiV2On);
    total = Math.max(total, steps.length);
    const seen = new Set();
    for (const s of steps) {
      const where = `"${s.title}" (${s.route})`;
      if (!s.title || !s.body || !s.emoji) problems.add(`${where}: missing title, body or emoji`);
      if ((s.body || "").length > STEP_BODY_LIMIT) {
        problems.add(`${where}: body is ${s.body.length} characters (limit ${STEP_BODY_LIMIT}) — split it into more steps`);
      }
      const key = `${s.route}|${s.title}`;
      if (seen.has(key)) problems.add(`${where}: listed twice`);
      seen.add(key);
      for (const id of [].concat(s.target || [])) {
        if (!anchors.has(id)) problems.add(`${where}: no data-tour="${id}" in src/`);
      }
    }
  }
}

if (problems.size) {
  console.error(`Tour steps: ${problems.size} problem(s)\n`);
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(`Tour steps OK — up to ${total} steps, every body ≤ ${STEP_BODY_LIMIT} characters, every target found.`);
