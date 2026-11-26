#!/usr/bin/env node
// The weekly activity goal write path (src/lib/activityGoalEntry.js): both
// goal shapes, retarget, trash and restore, through the real entity proxy.
// Shapes copied from ActivityGoalsPanel before the move (v0.380.4).
//
//   node scripts/test-activity-goal-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const G = await import("../src/lib/activityGoalEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { test, run } = runner();

test("category and habit goals keep their two shapes", async () => {
  h.reset();
  const c = await G.createActivityGoal({ sourceType: "category", source: { id: "c1", name: "Walk", color: "#111" }, weeklyMinutes: "90", weekStartDate: "2026-11-23" });
  assert.deepEqual(h.written(c), { source_type: "category", source_id: "c1", activity_category_id: "c1", category_name: "Walk", weekly_minutes: 90, color: "#111", week_start_date: "2026-11-23" });
  const hb = await G.createActivityGoal({ sourceType: "habit", source: { id: "h1", label: "Water" }, weeklyMinutes: 30, weekStartDate: "2026-11-23" });
  assert.deepEqual(h.written(hb), { source_type: "habit", source_id: "h1", habit_id: "h1", category_name: "Water", weekly_minutes: 30, color: "#8b5cf6", week_start_date: "2026-11-23" });
  assert.equal(await G.createActivityGoal({ source: null, weeklyMinutes: 5 }), null);
  assert.equal(await G.createActivityGoal({ source: { id: "x", name: "x" }, weeklyMinutes: "" }), null);
});

test("retarget, trash, restore", async () => {
  h.reset();
  const c = await G.createActivityGoal({ source: { id: "c1", name: "Walk" }, weeklyMinutes: 60, weekStartDate: "w" });
  assert.equal((await G.setActivityGoalTarget(c.id, 120)).weekly_minutes, 120);
  await G.trashActivityGoal(c.id);
  assert.equal(await h.E.ActivityGoal.get(c.id), null);
  await restoreFromTrash([{ entity: "ActivityGoal", id: c.id }]);
  assert.equal((await h.E.ActivityGoal.get(c.id)).weekly_minutes, 120);
});

await run();
