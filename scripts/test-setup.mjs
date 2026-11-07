#!/usr/bin/env node
// Checks the setup step list and the onboarding record merge
// (src/lib/setupModel.js): every step is marked from real data, nothing is
// done on an empty system, and start times keep their first value.
//
//   node scripts/test-setup.mjs

import assert from "node:assert/strict";
import { evaluateSetup, SETUP_STEPS, SETUP_GROUPS, mergeOnboarding, daysUsingApp, settledInForSurvey } from "../src/lib/setupModel.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const t = { system: "collective", alter: "member", alters: "members" };
const empty = {
  settings: null, onboarding: {}, alters: [], checkIns: [], symptoms: [], activityCategories: [],
  supportContacts: [], safetyPlan: null, backupMode: "off", backupLastAt: null, bundlesChosen: false,
};
const byId = (steps) => Object.fromEntries(steps.map((s) => [s.id, s]));

test("an empty system has nothing done", () => {
  const steps = evaluateSetup(empty, t);
  assert.equal(steps.length, SETUP_STEPS.length);
  assert.ok(steps.every((s) => !s.done));
});

test("every step belongs to a known group and opens a page", () => {
  const groups = new Set(SETUP_GROUPS.map((g) => g.id));
  for (const s of evaluateSetup(empty, t)) {
    assert.ok(groups.has(s.group), s.id);
    assert.match(s.path, /^\//, s.id);
  }
});

test("steps are marked from records, in the person's words", () => {
  const s = byId(evaluateSetup({
    ...empty,
    settings: { term_system: "collective" },
    alters: [{ id: "a" }, { id: "b" }, { id: "c", is_archived: true }, { id: "d", trashed_at: "x" }],
    checkIns: [{ id: "e" }],
    symptoms: [{ id: "s" }],
    activityCategories: [{ id: "c1" }, { id: "c2", parent_category_id: "c1" }],
    supportContacts: [{ id: "k" }],
    safetyPlan: { q1: "breathe" },
    backupMode: "auto",
  }, t));
  assert.ok(s.words.done);
  assert.equal(s.words.value, "collective · member");
  assert.equal(s.alters.value, "2 members", "archived and trashed don't count");
  assert.equal(s.checkin.value, "1 check-in");
  assert.equal(s.activities.value, "1 category", "only top-level categories count");
  assert.ok(s.tracking.done && s["safety-plan"].done && s["support-contacts"].done);
  assert.equal(s.backup.value, "Automatic");
});

test("choosing to track nothing still counts as chosen", () => {
  const s = byId(evaluateSetup({ ...empty, onboarding: { packs: "none" } }, t));
  assert.ok(s.tracking.done);
  assert.equal(s.tracking.value, "Nothing for now");
  assert.ok(byId(evaluateSetup({ ...empty, bundlesChosen: true }, t)).tracking.done);
});

test("an older browser flag marks the words chosen", () => {
  assert.ok(byId(evaluateSetup({ ...empty, onboarding: { wordsChosen: true } }, t)).words.done);
});

test("a backup saved once counts, reminders count", () => {
  assert.equal(byId(evaluateSetup({ ...empty, backupLastAt: "2026-11-01" }, t)).backup.value, "Saved once");
  assert.equal(byId(evaluateSetup({ ...empty, backupMode: "reminder" }, t)).backup.value, "Reminders on");
});

test("start times keep their first value; others update", () => {
  const a = mergeOnboarding({}, { started_at: "1", words_at: "1", completed_at: "1" }, 1);
  const b = mergeOnboarding(a, { started_at: "2", words_at: "2", completed_at: "2", packs: "custom" }, 1);
  assert.equal(b.started_at, "1");
  assert.equal(b.words_at, "1");
  assert.equal(b.completed_at, "2");
  assert.equal(b.packs, "custom");
  assert.equal(b.version, 1);
});

test("a merge never drops what was recorded, and ignores undefined", () => {
  const b = mergeOnboarding({ packs: "express", restarted_at: "x" }, { packs: undefined }, 1);
  assert.equal(b.packs, "express");
  assert.equal(b.restarted_at, "x");
  assert.deepEqual(mergeOnboarding(null, {}, 1), { version: 1 });
});

test("the survey waits until a system has used the app a few days", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  // Brand-new system: set up today.
  assert.equal(settledInForSurvey({ onboarding: { started_at: iso(now - day / 2), completed_at: iso(now) }, createdDate: iso(now - day / 2) }, now), false);
  // Set up 6 days ago.
  assert.equal(settledInForSurvey({ onboarding: { completed_at: iso(now - 6 * day) }, createdDate: null }, now), true);
  // Long-time system whose completed_at was stamped today: the old row wins.
  assert.equal(settledInForSurvey({ onboarding: { completed_at: iso(now) }, createdDate: iso(now - 90 * day) }, now), true);
  // Older install with nothing recorded: treated as settled in.
  assert.equal(daysUsingApp({ onboarding: {}, createdDate: null }, now), null);
  assert.equal(settledInForSurvey({ onboarding: {}, hasSettingsRow: true }, now), true);
  // No settings row at all: brand new, not yet.
  assert.equal(settledInForSurvey({ onboarding: {}, hasSettingsRow: false }, now), false);
  // Garbage times are ignored.
  assert.equal(settledInForSurvey({ onboarding: { started_at: "nope" }, createdDate: iso(now - day) }, now), false);
});

console.log(`\n${passed} setup checks passed.`);
