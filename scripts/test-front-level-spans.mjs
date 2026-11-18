#!/usr/bin/env node
// Checks a fronting session's level over time (src/lib/frontLevelSpans.js):
// a level set moments after joining reads as the starting level (a solo
// front must never show "Co-fronting at 8:13, Nearby at 8:13"), and
// `levels_reset_at` lets the session editor set one level for the whole
// session without touching the log.
//
//   node scripts/test-front-level-spans.mjs

import assert from "node:assert/strict";
import { levelChangesOf, levelSpans, levelAt, isJoinSettle } from "../src/lib/frontLevelSpans.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const t = (hhmm, s = 0) => `2026-11-18T${hhmm}:${String(s).padStart(2, "0")}.000Z`;
const ms = (iso) => new Date(iso).getTime();

// The bug's shape: joined at 8:13 with no level, level set a moment later.
const glitched = {
  start_time: t("08:13"), created_date: t("08:13"), front_level: "nearby",
  level_changes: [{ timestamp: t("08:13", 1), from: "cofront", to: "nearby" }],
};

test("a level set right after joining is not a change", () => {
  assert.equal(levelChangesOf(glitched).length, 0);
  assert.equal(levelAt(glitched, ms(t("08:13"))), "nearby");
  const spans = levelSpans(glitched, ms(t("08:13")), ms(t("09:00")));
  assert.deepEqual(spans.map((s) => s.level), ["nearby"]);
});

test("moving the start earlier keeps it the starting level", () => {
  const edited = { ...glitched, start_time: t("07:00") };
  // created_date and start_time are now far apart — the change is real
  // only if it wasn't made in the join window of the original row. The
  // whole-session option covers rows edited before this fix.
  assert.equal(isJoinSettle(edited, ms(t("08:13", 1))), false);
  const reset = { ...edited, levels_reset_at: t("10:00") };
  assert.deepEqual(levelSpans(reset, ms(t("07:00")), ms(t("10:00"))).map((s) => s.level), ["nearby"]);
});

test("a real change later on still counts", () => {
  const s = { ...glitched, front_level: "front",
    level_changes: [...glitched.level_changes, { timestamp: t("09:00"), from: "nearby", to: "front" }] };
  const spans = levelSpans(s, ms(t("08:13")), ms(t("10:00")));
  assert.deepEqual(spans.map((x) => x.level), ["nearby", "front"]);
});

test("a split or past row (created long after its start) keeps quick changes", () => {
  const s = { start_time: t("03:00"), created_date: t("08:00"), front_level: "front",
    level_changes: [{ timestamp: t("08:00", 10), from: "nearby", to: "front" }] };
  assert.equal(levelChangesOf(s).length, 1);
});

test("levels_reset_at supersedes earlier changes, not later ones", () => {
  const s = { start_time: t("06:00"), created_date: t("06:00"), front_level: "front",
    levels_reset_at: t("09:30"),
    level_changes: [
      { timestamp: t("07:00"), from: "front", to: "nearby" },
      { timestamp: t("10:00"), from: "nearby", to: "front" },
    ] };
  assert.deepEqual(levelChangesOf(s).map((c) => c.timestamp), [t("10:00")]);
});

test("rows without created_date behave as before", () => {
  const s = { start_time: t("08:13"), front_level: "nearby",
    level_changes: [{ timestamp: t("08:13", 1), from: "cofront", to: "nearby" }] };
  assert.equal(levelChangesOf(s).length, 1);
});

console.log(`\n${passed} passed`);
