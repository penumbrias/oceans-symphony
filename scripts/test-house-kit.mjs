#!/usr/bin/env node
// The new house's kit, steps 1.2 and 1.3: the pure logic behind the fields (numbers,
// days, times, durations, the save-state words), the guard still clean with
// the kit in place (and still catching a raw control outside it), the
// shadow tokens safe to combine, and the kit loaded only lazily. Pure:
// nothing is written anywhere.
//
//   node scripts/test-house-kit.mjs

import assert from "node:assert/strict";
import fs from "node:fs";

const V = await import("../src/house/kit/values.js");
const G = await import("./check-house-guard.mjs");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── Numbers ───────────────────────────────────────────────────────────
test("numbers: typed text commits clamped, garbage commits nothing", () => {
  assert.equal(V.commitNumber("3", { min: 0, max: 5 }), 3);
  assert.equal(V.commitNumber("9", { min: 0, max: 5 }), 5);
  assert.equal(V.commitNumber("-2", { min: 0, max: 5 }), 0);
  assert.equal(V.commitNumber("2,5"), 2.5);
  assert.equal(V.commitNumber(" 4 "), 4);
  assert.equal(V.commitNumber("abc"), null);
  assert.equal(V.commitNumber(""), null);
  assert.equal(V.commitNumber("7", { min: 0, max: 10, step: 5 }), 5);
});

// ── Days ──────────────────────────────────────────────────────────────
const today = "2026-11-24"; // a Tuesday
test("days: stored as YYYY-MM-DD, read at local noon", () => {
  assert.ok(V.isDay("2026-02-28"));
  assert.ok(!V.isDay("2026-02-30"));
  assert.ok(!V.isDay("2026-2-3"));
  const d = V.dayToDate("2026-03-29");
  assert.equal(d.getHours(), 12);
  assert.equal(V.toDay(d), "2026-03-29");
  assert.equal(V.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(V.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(V.addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(V.addMonths("2026-03-15", -3), "2025-12-15");
});

test("days: typed words people use", () => {
  const p = (s, o = {}) => V.parseDayInput(s, { today, ...o });
  assert.equal(p("today"), today);
  assert.equal(p("Tomorrow"), "2026-11-25");
  assert.equal(p("yesterday"), "2026-11-23");
  assert.equal(p("fri"), "2026-11-27");
  assert.equal(p("tue"), today);
  assert.equal(p("next tue"), "2026-12-01");
  assert.equal(p("2026-11-23"), "2026-11-23");
  assert.equal(p("2026/1/5"), "2026-01-05");
  assert.equal(p("23 Nov"), "2026-11-23");
  assert.equal(p("Nov 23"), "2026-11-23");
  assert.equal(p("23rd November 2025"), "2025-11-23");
  assert.equal(p("Mon 23 Nov"), "2026-11-23");
  assert.equal(p("23 sept"), "2026-09-23");
  assert.equal(p("23/11"), "2026-11-23");
  assert.equal(p("23/11/26"), "2026-11-23");
  assert.equal(p("11/23", { order: "mdy" }), "2026-11-23");
  assert.equal(p("31 Feb"), null);
  assert.equal(p("blah"), null);
  assert.equal(p(""), null);
  assert.equal(V.parseDayInput("today", { today: "nope" }), null);
});

test("days: shown in plain words, spoken in full", () => {
  assert.equal(V.formatDayWords("2026-11-23", { today, locale: "en-GB" }), "Yesterday, Mon 23 Nov");
  assert.equal(V.formatDayWords("2026-11-27", { today, locale: "en-GB" }), "Fri 27 Nov");
  assert.equal(V.formatDayWords("2019-03-14", { today, locale: "en-GB" }), "Thu 14 Mar 2019");
  assert.equal(V.formatDayWords("2026-11-24", { today, locale: "en-GB", relative: false }), "Tue 24 Nov");
  assert.equal(V.formatDayLong("2026-11-23", { locale: "en-GB" }), "Monday 23 November 2026");
  assert.equal(V.formatDayWords("bad", { today }), "");
  assert.equal(V.localeDateOrder("en-US"), "mdy");
  assert.equal(V.localeDateOrder("en-GB"), "dmy");
});

test("days: a month view is six whole weeks from the week start", () => {
  const mon = V.monthGrid(2026, 10, 1); // November 2026, weeks from Monday
  assert.equal(mon.length, 42);
  assert.equal(mon[0].day, "2026-10-26");
  assert.equal(V.dayToDate(mon[0].day).getDay(), 1);
  assert.equal(mon.filter((c) => c.inMonth).length, 30);
  const sun = V.monthGrid(2026, 10, 0);
  assert.equal(sun[0].day, "2026-11-01");
});

// ── Times ─────────────────────────────────────────────────────────────
test("times: typed on either clock, stored as HH:mm", () => {
  const cases = { "9": "09:00", "930": "09:30", "0930": "09:30", "9:30": "09:30", "9.30": "09:30", "21:30": "21:30",
    "9pm": "21:00", "9:30 pm": "21:30", "9:30PM": "21:30", "12am": "00:00", "12pm": "12:00", "12:15 a": "00:15", "noon": "12:00", "midnight": "00:00", "0": "00:00" };
  for (const [s, want] of Object.entries(cases)) assert.equal(V.parseTimeInput(s), want, s);
  for (const s of ["25:00", "9:75", "13pm", "0am", "abc", "", "9:3"]) assert.equal(V.parseTimeInput(s), null, s);
});

test("times: shown on the person's clock", () => {
  assert.equal(V.formatTimeValue("21:30", "24"), "21:30");
  assert.equal(V.formatTimeValue("21:30", "12"), "9:30 pm");
  assert.equal(V.formatTimeValue("00:05", "12"), "12:05 am");
  assert.equal(V.formatTimeValue("12:00", "12"), "12:00 pm");
  assert.equal(V.formatTimeValue("bad", "12"), "");
  assert.equal(V.timeSlots(15).length, 96);
  assert.equal(V.timeSlots(30)[1], "00:30");
  assert.equal(V.nearestSlot("09:08", 15), "09:15");
  assert.equal(V.nearestSlot("23:55", 15), "00:00");
});

// ── Durations ─────────────────────────────────────────────────────────
test("durations: typed the ways people write them, stored as minutes", () => {
  const cases = { "90": 90, "1:30": 90, "1h30": 90, "1h 30m": 90, "1 h 30 min": 90, "1.5h": 90, "2 hours": 120, "45m": 45,
    "45 mins": 45, "1d 2h": 1560, "half an hour": 30, "an hour": 60, "0": 0, "2hrs 5min": 125 };
  for (const [s, want] of Object.entries(cases)) assert.equal(V.parseDuration(s), want, s);
  for (const s of ["abc", "1h x", "-5", "", "1:75", "5 parsecs"]) assert.equal(V.parseDuration(s), null, s);
});

test("durations: short words for the field, long words for screen readers", () => {
  assert.equal(V.formatDuration(90), "1 h 30 min");
  assert.equal(V.formatDuration(45), "45 min");
  assert.equal(V.formatDuration(120), "2 h");
  assert.equal(V.formatDuration(1560), "1 d 2 h");
  assert.equal(V.formatDuration(0), "0 min");
  assert.equal(V.formatDuration(-1), "");
  assert.equal(V.formatDurationLong(61), "1 hour 1 minute");
  assert.equal(V.formatDurationLong(150), "2 hours 30 minutes");
  // Round trip: what the field shows reads back as the same minutes.
  for (const m of [0, 5, 45, 60, 90, 125, 1440, 1561]) assert.equal(V.parseDuration(V.formatDuration(m).replace(/ d/, "d").replace(/ h/, "h").replace(/ min/, "m")), m, String(m));
});

test("save state: plain words, and a failure says the typing is kept", () => {
  assert.equal(V.saveStateWords("idle"), "");
  assert.equal(V.saveStateWords("saving"), "Saving…");
  assert.equal(V.saveStateWords("saved"), "Saved");
  assert.match(V.saveStateWords("failed", { error: "storage is full" }), /Not saved: storage is full\. Your typing is kept\./);
});

// ── The guard, with the kit in place ─────────────────────────────────
test("guard: the new house is still clean with the kit in it", () => {
  const { files, findings } = G.runHouseGuard();
  assert.ok(files >= 20, `scanned ${files} files`);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line} ${f.id}`), []);
});

test("guard: raw controls are fine in the kit and caught outside it", () => {
  const raw = '<button type="button">Save</button>\n<input type="date" />\n<select></select>';
  assert.equal(G.scanText("src/house/kit/X.jsx", raw).length, 0);
  const outside = G.scanText("src/house/rooms/X.jsx", raw).map((f) => f.id);
  assert.ok(outside.includes("control-outside-kit"));
  assert.ok(outside.includes("native-date-select"));
  // These stay caught even inside the kit.
  assert.ok(G.scanText("src/house/kit/X.jsx", '<input type="color" />').some((f) => f.id === "native-colour"));
  assert.ok(G.scanText("src/house/kit/x.css", ".a { font-size: 13px; }").some((f) => f.id === "px-text"));
  assert.ok(G.scanText("src/house/kit/x.css", ".a { color: red !important; }").some((f) => f.id === "important"));
});

test("kit: no browser colour picker and no x as a tick anywhere in it", () => {
  for (const f of ["Button.jsx", "Field.jsx", "Choices.jsx", "FormRow.jsx", "Menu.jsx", "Pickers.jsx", "KitLayer.jsx", "kit.css"]) {
    const src = read(`src/house/kit/${f}`);
    assert.ok(!/type=["']color["']/.test(src), f);
    assert.ok(!/<input[^>]*type=["'](?:date|time|datetime-local)["']/.test(src), `${f}: a browser date/time input`);
  }
  const choices = read("src/house/kit/Choices.jsx");
  assert.match(choices, /<Check\b/);
  assert.ok(!/<X\b[^>]*\/>\s*:\s*mixed/.test(choices));
});

test("tokens: shadow tokens are never `none` (they're combined in lists)", () => {
  for (const f of ["look-smooth.css", "look-pixel.css", "tokens.css"]) {
    const css = read(`src/house/tokens/${f}`).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/--house-(raise|sink|surface-shadow)\s*:\s*([^;]+);/g)) {
      assert.notEqual(m[2].trim(), "none", `${f} --house-${m[1]}`);
    }
  }
});

test("kit: reached only lazily (the app's entry never imports it)", () => {
  const app = read("src/App.jsx");
  assert.ok(!/^import[^\n]*@\/house\//m.test(app), "App.jsx imports the house statically");
  assert.match(app, /lazy\(\(\) => import\('@\/house\/sample\/ControlsSample'\)\)/);
  const main = read("src/main.jsx");
  assert.ok(!/@\/house\//.test(main));
});

test("kit: pickers reuse today's shared components", () => {
  const p = read("src/house/kit/Pickers.jsx");
  for (const c of ["AlterSearchSelect", "SearchableSelect", "ColorPicker", "IconPicker", "AssetPickerModal"]) {
    assert.match(p, new RegExp(`import[^\\n]*${c}[^\\n]*from "@/components/shared/`), c);
  }
  assert.match(read("src/house/kit/Field.jsx"), /import MentionTextarea from "@\/components\/shared\/MentionTextarea"/);
});

// ── Step 1.3: lists, trees, layers, chips, the toast clock ───────────
const L = await import("../src/house/kit/lists.js");

test("lists: up to 200 rows drawn whole, beyond that 100 a page", () => {
  const items = (n) => Array.from({ length: n }, (_, i) => i);
  assert.equal(L.pageSlice(items(2), 0).rows.length, 2);
  assert.equal(L.pageSlice(items(200), 0).paged, false);
  assert.equal(L.pageSlice(items(200), 0).rows.length, 200);
  const s = L.pageSlice(items(1000), 3);
  assert.equal(s.paged, true);
  assert.equal(s.pages, 10);
  assert.equal(s.start, 300);
  assert.equal(s.rows.length, 100);
  assert.equal(L.pageSlice(items(250), 9).page, 2, "a page past the end is clamped");
  assert.equal(L.pageSlice(items(250), -4).page, 0);
  assert.equal(L.pageOf(150), 1);
  assert.match(L.rangeWords(s, 1000), /301/);
  assert.equal(L.pageSlice([], 0).rows.length, 0);
});

test("trees: loops, self-parents and missing parents become roots; nothing is lost", () => {
  const nodes = [
    { id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" },
    { id: "self", parentId: "self" },
    { id: "x", parentId: "y" }, { id: "y", parentId: "x" },
    { id: "orphan", parentId: "gone" },
    { id: "b", parentId: null }, // a duplicate id is drawn once
  ];
  const rows = L.flattenTree(nodes);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["a", "b", "c", "orphan", "self", "x", "y"]);
  const lv = Object.fromEntries(rows.map((r) => [r.id, r.level]));
  assert.equal(lv.a, 1); assert.equal(lv.b, 2); assert.equal(lv.c, 3);
  for (const root of ["self", "x", "y", "orphan"]) assert.equal(lv[root], 1, root);
  // Folding a branch hides its children; "open all" lists the branches.
  const folded = L.flattenTree(nodes, { expanded: new Set() });
  assert.ok(!folded.some((r) => r.id === "b"));
  assert.deepEqual(L.branchIds(rows), ["a", "b"]);
});

test("trees: a very deep chain keeps its real level but clamps the indent", () => {
  const chain = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, parentId: i ? `n${i - 1}` : null }));
  const rows = L.flattenTree(chain);
  assert.equal(rows.length, 40);
  assert.equal(rows[39].level, 40);
  assert.equal(rows[39].depth, L.MAX_TREE_DEPTH);
  assert.equal(rows[0].posInSet, 1);
});

test("layers: moving by buttons or keys, and what a screen reader hears", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const ids = (l) => l.map((x) => x.id).join("");
  assert.equal(ids(L.moveById(list, "b", -1)), "bac");
  assert.equal(ids(L.moveById(list, "b", 1)), "acb");
  assert.equal(ids(L.moveById(list, "a", -1)), "abc", "the top stays put");
  assert.equal(ids(L.moveById(list, "c", "top")), "cab");
  assert.equal(ids(L.moveById(list, "a", "bottom")), "bca");
  assert.equal(ids(L.moveById(list, "zz", 1)), "abc");
  assert.equal(ids(list), "abc", "the original is never changed");
  assert.equal(L.moveWords("Notes", 0, 3), "Notes moved to the top, 1 of 3");
  assert.equal(L.moveWords("Notes", 1, 3), "Notes moved to 2 of 3");
  assert.equal(L.moveWords("Notes", 2, 3), "Notes moved to the bottom, 3 of 3");
});

test("chips: never folds a single person, names the rest in words", () => {
  const seven = ["A", "B", "C", "D", "E", "F", "G"];
  assert.deepEqual(L.overflowSplit(seven.slice(0, 4), 3).hidden, []);
  const s = L.overflowSplit(seven, 3);
  assert.equal(s.shown.length, 3);
  assert.deepEqual(s.hidden, ["D", "E", "F", "G"]);
  assert.equal(L.namesWords(["Ash"]), "Ash");
  assert.equal(L.namesWords(["Ash", "River"]), "Ash and River");
  assert.equal(L.namesWords(seven), "A, B, C and 4 others");
  assert.equal(L.namesWords(["A", "B", "C", "D"]), "A, B, C and 1 other");
});

test("toast: at least 10 seconds, and time stops while it's held", () => {
  assert.equal(L.toastClock(3000).total, L.TOAST_MIN_MS);
  let c = L.toastTick(L.toastClock(), 0);
  c = L.toastTick(c, 4000);
  assert.equal(c.left, 6000);
  c = L.toastPause(c, "focus", 5000);
  c = L.toastPause(c, "hover", 6000);
  c = L.toastTick(c, 60000);
  assert.equal(c.left, 5000);
  assert.ok(!L.toastExpired(c));
  c = L.toastResume(c, "focus", 61000);
  c = L.toastTick(c, 99000);
  assert.equal(c.left, 5000, "still held by the pointer");
  c = L.toastResume(c, "hover", 100000);
  c = L.toastTick(c, 104000);
  assert.equal(c.left, 1000);
  c = L.toastTick(c, 106000);
  assert.ok(L.toastExpired(c));
});

test("charts: the text version's numbers", () => {
  const m = L.seriesSummary([{ v: 2 }, { v: 5 }, { v: "x" }, {}], "v");
  assert.equal(m.total, 7); assert.equal(m.min, 2); assert.equal(m.max, 5); assert.equal(m.count, 2);
});

// ── Step 1.3: wiring ─────────────────────────────────────────────────
test("pop-ups: additive — the shared pickers wear the house only inside a PopupTheme", () => {
  const theme = read("src/components/shared/popupTheme.js");
  assert.match(theme, /if \(!theme\) return EMPTY;/);
  for (const f of ["AlterSearchSelect", "SearchableSelect", "ColorPicker", "IconPicker", "AssetPickerModal"]) {
    const src = read(`src/components/shared/${f}.jsx`);
    assert.match(src, /usePopupTheme\(/, f);
    assert.match(src, /\{\.\.\.popTheme\.attrs\}/, f);
  }
  const css = read("src/house/kit/sharedPops.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of css.split("}").map((r) => r.trim()).filter(Boolean)) {
    const sel = rule.split("{")[0].trim();
    if (sel.startsWith("@")) continue;
    const parts = []; let depth = 0, cur = "";
    for (const ch of sel) { if (ch === "(" || ch === "[") depth += 1; if (ch === ")" || ch === "]") depth -= 1; if (ch === "," && !depth) { parts.push(cur); cur = ""; } else cur += ch; }
    parts.push(cur);
    for (const part of parts) assert.match(part.trim(), /^\[data-house\][^\s]*\[data-shared-pop/, part.trim());
  }
  assert.match(read("src/house/kit/Pickers.jsx"), /<HousePopups>/);
});

test("kit 1.3: panels, content and sheets are built from the kit and stay lazy", () => {
  const app = read("src/App.jsx");
  assert.match(app, /lazy\(\(\) => import\('@\/house\/sample\/PanelsSample'\)\)/);
  assert.match(app, /path="\/house\/kit\/panels"/);
  // recharts stays out of the kit's index (Chart is imported on its own).
  assert.ok(!/Charts/.test(read("src/house/kit/index.js").replace(/\/\/.*$/gm, "")));
  const toast = read("src/house/kit/Toast.jsx");
  assert.match(toast, /useAttentionSlot\("house-toast"/);
  assert.match(toast, /withTrashBatch/);
  assert.match(toast, /restoreTrashBatch/);
  const sheet = read("src/house/kit/Sheet.jsx");
  assert.match(sheet, /useEdgeSafeSliders/);
  assert.match(sheet, /data-safe/);
  assert.match(read("src/house/kit/Content.jsx"), /useResolvedAvatarUrl/);
  assert.match(read("src/house/kit/Content.jsx"), /useAlterLabel/);
  assert.match(read("src/house/kit/Field.jsx"), /usePlannerPrefs/);
  for (const f of ["Panel.jsx", "TreeList.jsx", "Info.jsx", "Inspector.jsx", "Layers.jsx", "States.jsx", "Content.jsx", "Charts.jsx", "Toast.jsx", "Sheet.jsx", "panels.css", "sharedPops.css"]) {
    const src = read(`src/house/kit/${f}`);
    assert.ok(!/type=["']color["']/.test(src), f);
    assert.ok(!/<select\b/.test(src), `${f}: a native select`);
  }
});

// ── Kit gate fixes (phase 1 gate, items 1–7) ─────────────────────────
test("gate 1: a value box is at least as wide as its words (or placeholder)", () => {
  assert.equal(V.valueChars("1 h 30 min"), 10);
  assert.equal(V.valueChars("", "45 min, 1h 30m…"), 12);
  assert.equal(V.valueChars("3"), 2);
  assert.equal(V.valueChars(null, null), 2);
  const css = read("src/house/kit/kit.css");
  assert.match(css, /min-width: min\(100%, calc\(\(var\(--hk-chars/);
  assert.match(css, /@container \(max-width: 18rem\)[\s\S]*hk-inputwrap--stepper/);
  const field = read("src/house/kit/Field.jsx");
  assert.equal((field.match(/"--hk-chars": valueChars\(/g) || []).length, 4, "number, date, time and duration set --hk-chars");
});
test("gate 1: words break between words, never inside one", () => {
  for (const f of ["kit.css", "panels.css"]) assert.ok(!/overflow-wrap:\s*anywhere/.test(read(`src/house/kit/${f}`)), f);
});
test("gate 3: the toast sits above an open sheet when it fits whole, else waits", () => {
  assert.deepEqual(L.toastPlacement({ viewportH: 844, sheetTop: null, toastH: 120 }), { mode: "free" });
  assert.deepEqual(L.toastPlacement({ viewportH: 844, sheetTop: 400, toastH: 120 }), { mode: "above", bottom: 452 });
  assert.deepEqual(L.toastPlacement({ viewportH: 844, sheetTop: 200, toastH: 225 }), { mode: "held" });
  assert.deepEqual(L.toastPlacement({ viewportH: 844, sheetTop: 0, toastH: 60 }), { mode: "held" });
  // held stops the clock ("sheet" reason) until the sheet closes
  let c = L.toastPause(L.toastTick(L.toastClock(), 0), "sheet", 1000);
  c = L.toastTick(c, 60000);
  assert.ok(!L.toastExpired(c));
  const toast = read("src/house/kit/Toast.jsx");
  assert.match(toast, /toastPause\(clockRef\.current, "sheet"/);
  assert.match(read("src/house/kit/panels.css"), /\.hk-toast \{[\s\S]*?max-height: 40dvh/);
  const sheet = read("src/house/kit/Sheet.jsx");
  assert.equal((sheet.match(/useRegisterSheet\(open && !inline, boxRef\)/g) || []).length, 2, "Sheet and SafetySheet register");
});
test("gate 4: Tab off a floating pop-up closes it and returns to the trigger", () => {
  const layer = read("src/house/kit/KitLayer.jsx");
  assert.match(layer, /e\.key === "Tab"[\s\S]*tabLeavesPop[\s\S]*onClose\(\);\s*anchorRef\.current\?\.focus/);
  assert.match(read("src/house/kit/Field.jsx"), /e\.key === "Tab"\) \{ e\.preventDefault\(\); onClose\(\); \}/);
});
test("gate 5: the tree's fold target is the row's height and never under 44 px", () => {
  const css = read("src/house/kit/panels.css");
  assert.match(css, /\.hk-tree-toggle \{[^}]*width: max\(44px,[^}]*min-height: var\(--house-h-row\)/);
  assert.match(read("src/house/kit/TreeList.jsx"), /hk-tree-toggle" aria-hidden="true" data-fold=""/);
});
test("gate 6: the Layers eye has one name and says its state with aria-pressed", () => {
  const src = read("src/house/kit/Layers.jsx");
  assert.match(src, /label=\{`Show \$\{name\}`\}\s*aria-pressed=\{visible\}/);
  assert.ok(!/`Hide \$\{name\}`/.test(src));
});
test("gate 7: stacked confirm buttons put Keep it at the bottom", () => {
  const css = read("src/house/kit/panels.css");
  assert.match(css, /\.hk-confirm-actions \{ display: flex; flex-wrap: wrap;/);
  assert.ok(!/hk-confirm-actions[^}]*wrap-reverse/.test(css));
  const sheet = read("src/house/kit/Sheet.jsx");
  assert.ok(sheet.indexOf('rank="danger"') < sheet.indexOf("Keep it</Button>"), "Delete first in the DOM, so Keep it is the lower line");
});
test("typed dates: number, date, time and duration report words they couldn't read", () => {
  const field = read("src/house/kit/Field.jsx");
  assert.equal((field.match(/^  useInvalidReport\(bad, onInvalidChange\);$/gm) || []).length, 4);
});

console.log(`\n${passed} passed.`);
