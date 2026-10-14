#!/usr/bin/env node
// Checks the near-duplicate symptom matcher (src/lib/symptomDuplicates.js):
// copies of the same thing group together, different things never do, the
// preset packs never collide with themselves, and logs only merge between
// rows on the same scale.
//
//   node scripts/test-symptom-duplicates.mjs

import assert from "node:assert/strict";
import {
  symptomDuplicateKey, findDuplicateGroups, planGroup, resolveMergedSymptomId,
} from "../src/lib/symptomDuplicates.js";
import { TRACKING_BUNDLES } from "../src/lib/trackingPresets.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const k = (l, c = "symptom") => symptomDuplicateKey(l, c);

test("energy variants share one key", () => {
  const key = k("Energy");
  for (const l of ["Energy level", "Energy Level", " energy level ", "Energy levels", "Level of energy", "ENERGY"]) {
    assert.equal(k(l), key, l);
  }
});

test("old seed names match their preset", () => {
  assert.equal(k("Anxiety"), k("Anxious / on edge"));
  assert.equal(k("Feeling irritable"), k("Irritable"));
  assert.equal(k("Used coping skills", "habit"), k("Used a coping skill", "habit"));
});

test("different things stay apart", () => {
  assert.notEqual(k("Low energy"), k("Energy"));
  assert.notEqual(k("Stress"), k("Relationship stress"));
  assert.notEqual(k("Rested", "habit"), k("Rested", "symptom"));
  assert.notEqual(k("Shutdown"), k("Shut down / frozen"));
});

test("preset packs never collide with themselves", () => {
  const seen = new Map();
  for (const b of TRACKING_BUNDLES) for (const it of b.items) {
    const key = k(it.label, it.kind === "behaviour" ? "habit" : "symptom");
    assert.ok(!seen.has(key), `${it.label} collides with ${seen.get(key)}`);
    seen.set(key, it.label);
  }
});

const rows = [
  { id: "a", label: "Energy", type: "rating", scale: "bipolar_2", bundle_id: "mood", created_date: "2025-01-02" },
  { id: "b", label: "Energy level", type: "rating", created_date: "2024-01-01" },
  { id: "c", label: "energy levels", type: "rating", created_date: "2025-03-01" },
  { id: "d", label: "Energy", type: "rating", is_archived: true },
  { id: "e", label: "Overall mood", type: "rating" },
];

test("groups live rows, busiest first, archived ignored", () => {
  const groups = findDuplicateGroups(rows, { c: 9, b: 2 });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map((r) => r.id), ["c", "b", "a"]);
  assert.equal(groups[0].keeperId, "c");
});

test("same scale merges, different scale only hides", () => {
  const [g] = findDuplicateGroups(rows, { c: 9, b: 2 });
  const plan = Object.fromEntries(planGroup(g).map((p) => [p.row.id, p.action]));
  assert.deepEqual(plan, { b: "merge", a: "hide" });
  const plan2 = Object.fromEntries(planGroup(g, "a").map((p) => [p.row.id, p.action]));
  assert.deepEqual(plan2, { b: "hide", c: "hide" });
});

test("merged ids resolve to where they went", () => {
  const byId = { x: { merged_into: "y" }, y: { merged_into: "z" }, z: {} };
  assert.equal(resolveMergedSymptomId("x", byId), "z");
  assert.equal(resolveMergedSymptomId("q", byId), "q");
});

console.log(`\n${passed} passed`);
