#!/usr/bin/env node
// Checks the medication maths (src/lib/medicationMath.js): today's doses,
// course windows, supply counted from the schedule or from marked doses,
// refill reminder timing, and the "Took meds" routine check.
//
//   node scripts/test-medications.mjs

import assert from "node:assert/strict";
import {
  dosesOnDay, onCourse, courseLabel, supplyOf, supplyLabel, allScheduledTakenToday, asNeededTakenOn, dayKey,
} from "../src/lib/medicationMath.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const now = new Date(2026, 10, 6, 12, 0); // 6 Nov 2026, noon local
const today = dayKey(now);
const med = { id: "m1", name: "Sertraline", times: ["08:00", "20:00"], units_per_dose: 1 };

test("today's doses: taken, due and later", () => {
  const doses = [{ medication_id: "m1", slot: `${today}T08:00`, status: "taken", timestamp: now.toISOString() }];
  const rows = dosesOnDay([med], doses, { now });
  assert.deepEqual(rows.map((r) => r.state), ["taken", "later"]);
  assert.equal(dosesOnDay([med], [], { now })[0].state, "due");
});

test("archived, as-needed and finished courses have no scheduled doses", () => {
  assert.equal(dosesOnDay([{ ...med, is_archived: true }], [], { now }).length, 0);
  assert.equal(dosesOnDay([{ ...med, as_needed: true }], [], { now }).length, 0);
  assert.equal(dosesOnDay([{ ...med, end_date: "2026-11-05" }], [], { now }).length, 0);
  assert.equal(onCourse({ start_date: "2026-11-07" }, today), false);
});

test("course labels", () => {
  assert.equal(courseLabel({ end_date: "2026-11-10" }, now), "Course ends in 4 days");
  assert.equal(courseLabel({ end_date: today }, now), "Course ends today");
  assert.equal(courseLabel({ end_date: "2026-11-04" }, now), "Course ended 2 days ago");
  assert.equal(courseLabel({}, now), null);
});

test("supply from the schedule", () => {
  // Refilled 1 Nov with 30; 2 a day; by noon on the 6th: 5 days × 2 + 1 = 11 used.
  const s = supplyOf({ ...med, last_refill_date: "2026-11-01", refill_quantity: 30 }, [], now);
  assert.equal(s.remaining, 19);
  assert.equal(s.perDay, 2);
  assert.equal(s.daysLeft, 9);
  assert.equal(s.low, false);
  assert.equal(supplyLabel(s), "19 left · about 9 days");
});

test("low supply and refill reminder date", () => {
  const s = supplyOf({ ...med, last_refill_date: "2026-11-01", refill_quantity: 20, refill_reminder: true, refill_remind_days: 7 }, [], now);
  assert.equal(s.daysLeft, 4);
  assert.equal(s.low, true);
  assert.equal(dayKey(s.remindAt), "2026-11-03");
});

test("no reminder when the course ends before the supply runs out", () => {
  const s = supplyOf({ ...med, last_refill_date: "2026-11-01", refill_quantity: 20, refill_reminder: true, end_date: "2026-11-08" }, [], now);
  assert.equal(s.courseEndsFirst, true);
  assert.equal(s.low, false);
  assert.equal(s.remindAt, null);
});

test("supply counted from marked doses (as needed)", () => {
  const prn = { id: "p1", as_needed: true, units_per_dose: 2, last_refill_date: "2026-11-01", refill_quantity: 20 };
  const doses = [
    { medication_id: "p1", status: "taken", timestamp: new Date(2026, 10, 2, 9).toISOString() },
    { medication_id: "p1", status: "taken", timestamp: new Date(2026, 10, 4, 9).toISOString(), amount: 1 },
    { medication_id: "p1", status: "skipped", timestamp: new Date(2026, 10, 5, 9).toISOString() },
    { medication_id: "p1", status: "taken", timestamp: new Date(2026, 9, 30, 9).toISOString() }, // before the refill
  ];
  const s = supplyOf(prn, doses, now);
  assert.equal(s.remaining, 17);
  assert.ok(s.perDay > 0);
  assert.equal(asNeededTakenOn(doses, "2026-11-04").get("p1").length, 1);
});

test("no supply without refill details", () => {
  assert.equal(supplyOf(med, [], now), null);
  assert.equal(supplyOf({ ...med, last_refill_date: "2026-11-01" }, [], now), null);
});

test("Took meds routine: all of today's doses taken", () => {
  const morningOnly = { ...med, times: ["08:00"] };
  assert.equal(allScheduledTakenToday([morningOnly], [], now), false);
  assert.equal(allScheduledTakenToday([morningOnly], [{ medication_id: "m1", slot: `${today}T08:00`, status: "taken" }], now), true);
  assert.equal(allScheduledTakenToday([morningOnly], [{ medication_id: "m1", slot: `${today}T08:00`, status: "skipped" }], now), false);
  assert.equal(allScheduledTakenToday([], [], now), false);
});

console.log(`\n${passed} medication checks passed`);
