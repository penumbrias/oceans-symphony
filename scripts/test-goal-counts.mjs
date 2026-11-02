#!/usr/bin/env node
// Checks how Goals counts activities (src/lib/goalCounting.js): the week
// follows the person's "week starts on", entries saved with just a typed
// name still count, and "some time that day" entries count on their day.
//
//   node scripts/test-goal-counts.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

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

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const { countActivityTimes, activityMinutesThisWeek, activityCategoryIds, categoryNameIndex, goalWeekStartsOn } =
  await import("../src/lib/goalCounting.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const categories = [
  { id: "art", name: "Art" },
  { id: "draw", name: "Drawing", parent_category_id: "art" },
  { id: "sketch", name: "Sketching", parent_category_id: "draw" },
];
const step = { kind: "activity_count", category_id: "draw", target_count: 3, count_period: "week" };
// Sunday evening, 1 Nov 2026.
const now = new Date(2026, 10, 1, 20, 0);
const thursday = new Date(2026, 9, 29, 15, 0).toISOString();

test("week starts on Monday by default, so Thursday's drawing counts on Sunday", () => {
  assert.equal(goalWeekStartsOn(), 1);
  const acts = [{ activity_name: "Drawing", activity_category_ids: ["draw"], timestamp: thursday, status: "logged" }];
  assert.equal(countActivityTimes(step, { activities: acts, categories, now }), 1);
});

test("a Sunday week start is honoured when the person chose it", () => {
  const acts = [{ activity_category_ids: ["draw"], timestamp: thursday, status: "logged" }];
  assert.equal(countActivityTimes(step, { activities: acts, categories, now, weekStartsOn: 0 }), 0);
});

test("an entry with just the typed name counts", () => {
  const acts = [{ activity_name: " drawing ", activity_category_ids: [], timestamp: thursday, status: "logged" }];
  assert.equal(countActivityTimes(step, { activities: acts, categories, now }), 1);
});

test("a typed name never overrides a picked activity", () => {
  const ids = activityCategoryIds({ activity_name: "Drawing", activity_category_ids: ["art"] }, categoryNameIndex(categories));
  assert.deepEqual(ids, ["art"]);
});

test("older entries with parent_category_id count", () => {
  const acts = [{ parent_category_id: "sketch", timestamp: thursday }];
  assert.equal(countActivityTimes(step, { activities: acts, categories, now }), 1);
});

test("a done 'some time that day' plan counts on its day", () => {
  const acts = [{ activity_category_ids: ["draw"], planned_date: "2026-10-30", status: "done" }];
  assert.equal(countActivityTimes(step, { activities: acts, categories, now }), 1);
});

test("plans not done, skipped ones and future ones don't count", () => {
  const acts = [
    { activity_category_ids: ["draw"], planned_date: "2026-10-30", status: "scheduled" },
    { activity_category_ids: ["draw"], timestamp: thursday, status: "skipped" },
    { activity_category_ids: ["draw"], timestamp: new Date(2026, 10, 1, 22, 0).toISOString(), status: "logged" },
  ];
  assert.equal(countActivityTimes(step, { activities: acts, categories, now }), 0);
});

test("weekly minutes use the same week and the typed-name fallback", () => {
  const acts = [
    { activity_name: "Drawing", timestamp: thursday, status: "logged", duration_minutes: 40 },
    { activity_category_ids: ["draw"], timestamp: new Date(2026, 9, 25, 12).toISOString(), status: "logged", duration_minutes: 99 },
  ];
  assert.equal(activityMinutesThisWeek("draw", { activities: acts, categories, now }), 40);
});

const { goalXpEvents, sumXp, goalsEarnXp, GOAL_XP } = await import("../src/lib/goalXp.js");

test("goals earn XP unless switched off", () => {
  assert.equal(goalsEarnXp({}), true);
  assert.equal(goalsEarnXp({ goals_earn_xp: false }), false);
});

test("a weekly tracker earns XP per time, up to its target each week, from when it was added", () => {
  const s = { id: "s1", goal_id: "g1", ...step, target_count: 2, created_date: new Date(2026, 9, 20).toISOString() };
  const acts = [
    { activity_category_ids: ["draw"], timestamp: new Date(2026, 9, 18, 9).toISOString(), status: "logged" }, // before the point
    { activity_category_ids: ["draw"], timestamp: new Date(2026, 9, 21, 9).toISOString(), status: "logged" },
    { activity_category_ids: ["draw"], timestamp: new Date(2026, 9, 22, 9).toISOString(), status: "logged" },
    { activity_category_ids: ["draw"], timestamp: new Date(2026, 9, 23, 9).toISOString(), status: "logged" }, // over target
    { activity_name: "Drawing", timestamp: thursday, status: "logged" }, // next week
  ];
  const ev = goalXpEvents({ goals: [{ id: "g1" }], steps: [s], activities: acts, categories, now });
  assert.equal(ev.length, 3);
  assert.equal(sumXp(ev), 3 * GOAL_XP.activity);
  assert.equal(sumXp(ev, { from: "2026-10-26", to: "2026-11-01" }), GOAL_XP.activity);
});

test("ticks, done to-dos and a reached goal earn XP; removed points and gone goals don't", () => {
  const ev = goalXpEvents({
    goals: [{ id: "g1", status: "done", status_changed_at: "2026-10-30T10:00:00" }],
    steps: [
      { id: "a", goal_id: "g1", kind: "check", done_at: "2026-10-29T10:00:00" },
      { id: "b", goal_id: "g1", kind: "check" },
      { id: "c", goal_id: "g1", kind: "todo", ref_id: "t1" },
      { id: "d", goal_id: "g1", kind: "check", done_at: "2026-10-29T10:00:00", removed_at: "2026-10-30" },
      { id: "e", goal_id: "gone", kind: "check", done_at: "2026-10-29T10:00:00" },
    ],
    tasks: [{ id: "t1", completed: true, completed_date: "2026-10-28T10:00:00" }],
    now,
  });
  assert.equal(sumXp(ev), GOAL_XP.reached + 2 * GOAL_XP.tick);
  assert.deepEqual(ev.map((e) => e.date).sort(), ["2026-10-28", "2026-10-29", "2026-10-30"]);
});

console.log(`\n${passed} passed`);
