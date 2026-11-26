#!/usr/bin/env node
// The house's Planner room (plan step 5.1, board 04-Planner): the pages and
// views and the keys they share with the old planner, the stretch on screen
// and the arrows, where entries sit and how they look (needs a decision,
// called off…), the all-day row, the week's counts, the month and year
// grids, the plans list, the addresses that land on the room, the drag
// maths and the patch a drag writes. Also: the room is drawn only on
// /planner and writes only through the planner's write paths.
// Pure: storage is an in-memory stand-in; nothing real is written.
//
//   node scripts/test-house-planner.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(src)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
globalThis.localStorage = memStore();
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const M = await import("../src/house/planner/plannerModel.js");
const K = await import("../src/house/kit/timeColumnsModel.js");
const P = await import("../src/lib/planner/movePatch.js");
const S = await import("../src/lib/houseSwitch.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m); // November 2026; the 20th is a Friday
const now = at(20, 16, 45);
const iso = (d) => d.toISOString();

test("the page and zoom are remembered under the old planner's keys", () => {
  const s = memStore();
  assert.deepEqual(M.readPlannerState(s), { view: "week", section: "calendar" });
  const old = memStore({ symphony_act_view_mode: JSON.stringify("month") });
  assert.equal(M.readPlannerState(old).view, "month");
  M.writePlannerState(s, { view: "day", section: "plans" });
  assert.deepEqual(M.readPlannerState(s), { view: "day", section: "plans" });
  M.writePlannerState(s, { view: "nonsense", section: "insights" });
  assert.deepEqual(M.readPlannerState(s), { view: "day", section: "insights" });
  assert.deepEqual(M.readPlannerState(memStore({ [M.VIEW_KEY]: "{broken" })), { view: "week", section: "calendar" });
});

test("one radio row: Day · Week · Month · Year · Plans list (Insights picks none)", () => {
  assert.deepEqual(M.PLANNER_PICKS.map((p) => p.id), ["day", "week", "month", "year", "plans"]);
  assert.equal(M.pickOf({ section: "calendar", view: "month" }), "month");
  assert.equal(M.pickOf({ section: "plans", view: "month" }), "plans");
  assert.equal(M.pickOf({ section: "insights", view: "month" }), null);
  assert.deepEqual(M.stateForPick("plans", { section: "calendar", view: "day" }), { section: "plans", view: "day" });
  assert.deepEqual(M.stateForPick("year", { section: "insights", view: "day" }), { section: "calendar", view: "year" });
});

test("the stretch on screen, its words and the arrows", () => {
  const w = M.rangeOf("week", now, 1);
  assert.equal(w.days.length, 7);
  assert.equal(w.from.getDate(), 16);
  assert.equal(M.rangeWords("week", now, 1), "Nov 16 to 22");
  assert.equal(M.rangeWords("week", now, 0), "Nov 15 to 21");
  assert.equal(M.rangeWords("week", at(30, 9), 1), "Nov 30 to Dec 6");
  assert.equal(M.rangeWords("day", now), "Fri Nov 20");
  assert.equal(M.rangeWords("month", now), "November 2026");
  assert.equal(M.rangeWords("year", now), "2026");
  assert.equal(M.stepAnchor("week", now, 1).getDate(), 27);
  assert.equal(M.stepAnchor("day", now, -1).getDate(), 19);
  assert.equal(M.stepAnchor("month", new Date(2026, 0, 31), 1).getMonth(), 1);
  assert.equal(M.holdsToday("week", now, 1, now), true);
  assert.equal(M.holdsToday("week", M.stepAnchor("week", now, 1), 1, now), false);
});

test("how an entry looks: plan, needs a decision, done, skipped, called off", () => {
  const plan = { id: "p", status: "scheduled", timestamp: iso(at(21, 9)), duration_minutes: 60 };
  assert.equal(M.entryTone(plan, now), "plan");
  const open = { id: "o", status: "scheduled", timestamp: iso(at(20, 12, 30)), duration_minutes: 30 };
  assert.equal(M.entryTone(open, now), "open");
  const runningOver = { id: "r", status: "scheduled", timestamp: iso(at(20, 16)), duration_minutes: 90 };
  assert.equal(M.entryTone(runningOver, now), "plan", "a plan still running isn't waiting on a decision");
  assert.equal(M.entryTone({ ...open, status: "done" }, now), "done");
  assert.equal(M.entryTone({ ...open, status: "skipped" }, now), "skipped");
  assert.equal(M.entryTone({ ...open, status: "cancelled" }, now), "cancelled");
  assert.equal(M.TONE_WORDS.cancelled, "called off");
  assert.equal(M.TONE_WORDS.open, "needs a decision");
  assert.deepEqual(M.needsDecision([plan, open, runningOver], now).map((a) => a.id), ["o"]);
});

test("colours come from the entry, its category, or the nearest coloured parent (loops are safe)", () => {
  const byId = { a: { id: "a", color: "#111" }, b: { id: "b", parent_category_id: "a" }, x: { id: "x", parent_category_id: "y" }, y: { id: "y", parent_category_id: "x" } };
  assert.equal(M.colourOf({ color: "#f00", parent_category_id: "a" }, byId), "#f00");
  assert.equal(M.colourOf({ parent_category_id: "b" }, byId), "#111");
  assert.equal(M.colourOf({ parent_category_id: "x" }, byId), null);
});

test("day columns: timed blocks, a night across midnight on both days, and the all-day row", () => {
  const days = M.rangeOf("week", now, 1).days;
  const acts = [
    { id: "w", activity_name: "Walk", status: "logged", timestamp: iso(at(16, 17)), duration_minutes: 30 },
    { id: "n", activity_name: "Sleep", status: "logged", timestamp: iso(at(17, 23)), duration_minutes: 480 },
    { id: "u", activity_name: "Market", status: "scheduled", planned_date: iso(at(21, 12)) },
  ];
  const tasks = [{ id: "task:1", _isTask: true, _dueOnly: true, activity_name: "Call pharmacy", timestamp: iso(at(19, 12)) }];
  const events = [{ id: "e1", title: "Payday", date: "2026-11-20", recurrence: null }];
  const cols = M.dayColumns({ days, activities: acts, tasks, events, now });
  assert.equal(cols[0].blocks[0].label, "Walk");
  assert.equal(cols[0].blocks[0].startMin, 17 * 60);
  assert.ok(cols[1].blocks.some((b) => b.key === "n"), "the night starts on Tuesday");
  assert.ok(cols[2].blocks.some((b) => b.key === "n"), "and carries into Wednesday");
  assert.equal(cols[3].allDay[0].kind, "todo");
  assert.equal(cols[5].allDay[0].kind, "untimed");
  assert.equal(cols[4].today, true);
  assert.equal(M.nowFraction(days[4], now) > 0.69, true);
  assert.equal(M.nowFraction(days[3], now), null);
});

test("the week's counts and their words", () => {
  const { from, to } = M.rangeOf("week", now, 1);
  const acts = [
    { status: "logged", timestamp: iso(at(16, 9)) },
    { status: "scheduled", timestamp: iso(at(21, 9)) },
    { status: "done", timestamp: iso(at(18, 9)) },
    { status: "logged", timestamp: iso(at(25, 9)) },
  ];
  const c = M.weekCounts({ activities: acts, events: [], from, to });
  assert.deepEqual(c, { plans: 2, logs: 1, events: 0 });
  assert.equal(M.countWords({ plans: 1, logs: 9, events: 2 }), "1 plan, 9 logs, 2 events");
  assert.equal(M.hoursWords(130), "2 h 10");
  assert.equal(M.hoursWords(120), "2 h");
  assert.equal(M.hoursWords(45), "45 m");
});

test("month and year grids: whole weeks; twelve months with busy days", () => {
  const cells = M.monthCells(now, 1);
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0].date.getDay(), 1);
  assert.equal(cells.filter((c) => c.inMonth).length, 30);
  assert.deepEqual(M.weekdayLetters(1), ["M", "T", "W", "T", "F", "S", "S"]);
  assert.equal(M.weekdayLetters(0)[0], "S");
  const months = M.yearMonths(2026, [{ status: "logged", timestamp: iso(at(20, 9)) }, { status: "logged", timestamp: iso(at(20, 11)) }], []);
  assert.equal(months.length, 12);
  assert.equal(months[10].count, 2);
  assert.equal(months[10].busy.get(M.dayKeyOf(now)), 2);
});

test("the plans list: needs a decision, today, this week, later; a series is one row", () => {
  const acts = [
    { id: "o", status: "scheduled", timestamp: iso(at(20, 9)), duration_minutes: 30 },
    { id: "t", status: "scheduled", timestamp: iso(at(20, 19)) },
    { id: "s1", status: "scheduled", timestamp: iso(at(21, 9)), recurrence_group_id: "g" },
    { id: "s2", status: "scheduled", timestamp: iso(at(28, 9)), recurrence_group_id: "g" },
    { id: "l", status: "scheduled", timestamp: iso(at(30, 9)) },
    { id: "d", status: "done", timestamp: iso(at(19, 9)) },
  ];
  const g = M.plansListGroups(acts, { now, weekStart: 1 });
  assert.deepEqual(g.map((x) => x.id), ["open", "today", "week", "later"]);
  const series = g.find((x) => x.id === "week").rows[0];
  assert.equal(series.series, true);
  assert.equal(series.count, 2);
  assert.deepEqual(g.find((x) => x.id === "later").rows.map((r) => r.key), ["l"]);
  const r = M.plansListGroups(acts, { now, resolved: true });
  assert.deepEqual(r[0].rows.map((x) => x.key), ["d"]);
});

test("addresses that land on the room", () => {
  const l = M.plannerLanding("?date=2026-11-20&view=day&activityId=a1");
  assert.equal(l.date.getDate(), 20);
  assert.equal(l.view, "day");
  assert.equal(l.activityId, "a1");
  assert.equal(l.any, true);
  assert.equal(M.plannerLanding("?highlight=h1").activityId, "h1");
  assert.equal(M.plannerLanding("?view=plans").view, "plans");
  assert.equal(M.plannerLanding("?view=nope").view, null);
  assert.equal(M.plannerLanding("").any, false);
  assert.equal(M.plannerLanding("?event=e1&date=2026-11-20").eventId, "e1");
});

test("drag maths: 15-minute grain, at least 15 minutes, never out of the day", () => {
  assert.deepEqual(K.dragRange(9 * 60 + 7, 8 * 60 + 2), { fromMin: 8 * 60, toMin: 9 * 60 });
  assert.deepEqual(K.dragRange(600, 600), { fromMin: 600, toMin: 615 });
  assert.deepEqual(K.dragRange(1439, 1440), { fromMin: 1425, toMin: 1440 });
  assert.deepEqual(K.dragBlock({ startMin: 600, endMin: 660 }, 37), { startMin: 630, endMin: 690 });
  assert.deepEqual(K.dragBlock({ startMin: 1380, endMin: 1440 }, 120), { startMin: 1380, endMin: 1440 });
  assert.deepEqual(K.dragBlock({ startMin: 0, endMin: 60 }, -90), { startMin: 0, endMin: 60 });
  assert.deepEqual(K.dragBlock({ startMin: 600, endMin: 660 }, 30, "resize"), { startMin: 600, endMin: 690 });
  assert.deepEqual(K.dragBlock({ startMin: 600, endMin: 660 }, -120, "resize"), { startMin: 600, endMin: 615 });
});

test("a drag's patch: the same length field, reschedule history for a plan, nothing else", () => {
  const plan = { id: "p", status: "scheduled", timestamp: iso(at(21, 9)), duration_minutes: 60, activity_name: "Gym", notes: "x" };
  const p = P.movePatch(plan, { start: at(21, 10), minutes: 90 }, now);
  assert.deepEqual(Object.keys(p).sort(), ["duration_minutes", "reschedule_history", "timestamp"]);
  assert.equal(p.duration_minutes, 90);
  assert.equal(p.reschedule_history.length, 1);
  assert.equal(p.reschedule_history[0].from, plan.timestamp);
  assert.equal(p.status, undefined, "a move never changes the status");
  const logged = { id: "l", status: "logged", timestamp: iso(at(19, 9)), duration_minutes: 30, actual_duration_minutes: 40 };
  const q = P.movePatch(logged, { start: at(19, 9), minutes: 55 }, now);
  assert.deepEqual(q, { timestamp: logged.timestamp, actual_duration_minutes: 55 });
  const kept = P.movePatch({ ...plan, reschedule_history: [{ from: "a", to: "b", ts: "c" }] }, { start: at(22, 9), minutes: 60 }, now);
  assert.equal(kept.reschedule_history.length, 2);
  assert.equal(P.movePatch(plan, { start: new Date("nope"), minutes: 60 }), null);
  assert.equal(P.movePatch(plan, { start: at(21, 9), minutes: 10 ** 9 }).duration_minutes, P.MOVE_MAX_MINUTES);
});

test("the Planner room is drawn by the house only on /planner", () => {
  assert.equal(S.housePlannerRoom("/planner"), true);
  assert.equal(S.housePlannerRoom("/planner/"), true);
  assert.equal(S.housePlannerRoom("/planners"), false);
  assert.equal(S.housePlannerRoom("/activities"), false);
  assert.equal(S.houseRebuiltRoom("/planner"), true);
  assert.equal(S.houseRebuiltRoom("/timeline"), true);
  assert.match(read("src/App.jsx"), /path="\/planner" element=\{<HouseRoomGate><PlannerPage \/><\/HouseRoomGate>\}/);
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) assert.ok(read(f).includes("<HousePlanner"), `${f} draws the room`);
});

test("the room writes only through the planner's write paths", () => {
  const dir = "src/house/planner";
  const files = [...readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`),
    "src/house/kit/TimeColumns.jsx", "src/house/kit/MonthGrid.jsx", "src/house/kit/timeColumnsModel.js"];
  for (const f of files) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/(entities|localEntities|base44)\b[^;]*\.(create|update|delete|bulkDelete)\(/.test(text), `${f} writes a record directly`);
  }
  const room = read("src/house/planner/HousePlanner.jsx") + read("src/house/planner/PlannerParts.jsx");
  for (const fn of ["moveActivityTime", "resolveOutcome", "reschedulePlan", "deleteSeries", "withTrashBatch", "ActivityEditor", "PlanDetailsSheet", "EventSheet", "SeriesDeleteSheet"]) {
    assert.ok(room.includes(fn), `the room uses ${fn}`);
  }
  assert.ok(!/"Cancel"/.test(read("src/house/planner/PlannerParts.jsx")), "the outcome is called \"Called off\" (building code §1)");
});

test("the new kit classes stay out of frameKit.css and panels.css", () => {
  for (const f of ["src/house/kit/frame/frameKit.css", "src/house/kit/panels.css"]) {
    assert.ok(!/\.hk-tc-|\.hk-cal-/.test(read(f)), `${f} has no time-column or month-grid classes`);
  }
});

console.log(`\n${passed} passed.`);
