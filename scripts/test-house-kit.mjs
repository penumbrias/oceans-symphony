#!/usr/bin/env node
// The new house's kit, step 1.2: the pure logic behind the fields (numbers,
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

console.log(`\n${passed} passed.`);
