#!/usr/bin/env node
// The Learn write path (src/lib/reflectionEntry.js): reflections (save,
// keep-history, needs check-in, edit, trash, restore) and topic progress,
// through the real entity proxy. Shapes copied from InteractiveExercise,
// NeedsCheckIn, MyReflections and TopicView before the move (v0.380.4).
//
//   node scripts/test-reflection-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const R = await import("../src/lib/reflectionEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { test, run } = runner();

test("a reflection: new entry, then updated in place without keep-history", async () => {
  h.reset();
  const first = await R.saveReflection({ exerciseId: "ex1", exerciseTitle: "Ex", responses: { q1: "a" }, keepHistory: false });
  assert.deepEqual(h.written(first), { exercise_id: "ex1", exercise_title: "Ex", responses: { q1: "a" }, keep_history: false });
  const target = R.reflectionTarget({ sessionEntryId: null, keepHistory: false, latestEntry: first });
  assert.equal(target, first.id);
  const second = await R.saveReflection({ entryId: target, exerciseId: "ex1", exerciseTitle: "Ex 2", responses: { q1: "b" } });
  assert.equal(second.id, first.id);
  assert.deepEqual(h.written(second), { exercise_id: "ex1", exercise_title: "Ex 2", responses: { q1: "b" }, keep_history: false });
  assert.equal(R.reflectionTarget({ keepHistory: true, latestEntry: first }), null, "keep history starts a new entry");
  assert.equal(R.reflectionTarget({ sessionEntryId: "s1", keepHistory: true, latestEntry: first }), "s1", "this session's entry wins");
  assert.equal(R.hasReflectionContent({ a: " ", b: null }), false);
  assert.equal(R.hasReflectionContent({ a: 0 }), true);
});

test("needs check-in keeps one entry", async () => {
  h.reset();
  const n = await R.saveNeedsCheckIn({ ratings: { rest: 5 } });
  assert.deepEqual(h.written(n), { exercise_id: "needs_checkin", exercise_title: "Healthy Needs Check-In", responses: { rest: 5 } });
  const m = await R.saveNeedsCheckIn({ latestEntry: n, ratings: { rest: 7 } });
  assert.equal(m.id, n.id);
  assert.equal((await h.E.SupportJournalEntry.list()).length, 1);
});

test("edit, trash and restore a reflection", async () => {
  h.reset();
  const r = await R.saveReflection({ exerciseId: "ex", exerciseTitle: "Ex", responses: { q: "a" } });
  await R.editReflection(r.id, { q: "edited" });
  await R.trashReflection(r.id);
  assert.equal(await h.E.SupportJournalEntry.get(r.id), null);
  assert.ok(h.raw("SupportJournalEntry", r.id).trashed_at);
  await restoreFromTrash([{ entity: "SupportJournalEntry", id: r.id }]);
  assert.deepEqual((await h.E.SupportJournalEntry.get(r.id)).responses, { q: "edited" });
});

test("topic notes and the done mark", async () => {
  h.reset();
  assert.equal(await R.saveTopicNotes(null, { moduleId: "m", topicId: "t", notes: "  " }), null, "empty notes are never written");
  const p = await R.saveTopicNotes(null, { moduleId: "m", topicId: "t", notes: "my notes" });
  assert.deepEqual(h.written(p), { module_id: "m", topic_id: "t", completed: false, notes: "my notes" });
  const done = await R.toggleTopicComplete(p, { moduleId: "m", topicId: "t" });
  assert.equal(done.completed, true);
  assert.ok(done.completed_date);
  assert.equal(done.notes, "my notes", "notes kept");
  const undone = await R.toggleTopicComplete(done, { moduleId: "m", topicId: "t" });
  assert.equal(undone.completed, false);
  assert.equal(undone.completed_date, null);
  const fresh = await R.toggleTopicComplete(null, { moduleId: "m", topicId: "t2" });
  assert.deepEqual(Object.keys(h.written(fresh)).sort(), ["completed", "completed_date", "module_id", "topic_id"]);
});

await run();
