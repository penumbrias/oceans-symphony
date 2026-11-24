#!/usr/bin/env node
// The reminder editing write path (src/lib/reminderEntry.js): create, the
// edit patch (never the stale last_fired_at), a new schedule retiring old
// popups, pause, delete with its instances, trash and restore, through the
// real entity proxy. Behaviour copied from ReminderEditorModal and
// RemindersManage before the move (v0.380.4).
//
//   node scripts/test-reminder-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const R = await import("../src/lib/reminderEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { test, run } = runner();

const form = { title: "Water", trigger_type: "interval", trigger_config: { minutes: 60 }, is_active: true };

test("new reminder is created as given", async () => {
  h.reset();
  const r = await R.saveReminder(null, form);
  assert.deepEqual(h.written(r), form);
});

test("an edit never writes the snapshot's bookkeeping back", async () => {
  h.reset();
  const r = await R.saveReminder(null, form);
  await h.E.Reminder.update(r.id, { last_fired_at: "2026-11-24T10:00:00.000Z" });
  const snapshot = { ...r, last_fired_at: "2020-01-01T00:00:00.000Z" };
  const e = await R.saveReminder(snapshot, { ...snapshot, title: "Drink water" });
  assert.equal(e.title, "Drink water");
  assert.equal(e.last_fired_at, "2026-11-24T10:00:00.000Z", "the live fire time is kept");
  assert.equal(e.created_date, r.created_date);
});

test("a new schedule restarts an interval and retires waiting popups only", async () => {
  h.reset();
  const r = await R.saveReminder(null, form);
  const fired = await h.E.ReminderInstance.create({ reminder_id: r.id, status: "fired" });
  const acted = await h.E.ReminderInstance.create({ reminder_id: r.id, status: "acted" });
  const before = Date.now();
  const e = await R.saveReminder(r, { ...r, trigger_config: { minutes: 30 } });
  assert.ok(Date.parse(e.last_fired_at) >= before - 5);
  assert.equal((await h.E.ReminderInstance.get(fired.id)).status, "dismissed");
  assert.equal((await h.E.ReminderInstance.get(acted.id)).status, "acted");
});

test("pause, bulk create, delete with instances; restore the reminder", async () => {
  h.reset();
  const [a] = await R.createReminders([form, { ...form, title: "Meds" }]);
  assert.equal((await h.E.Reminder.list()).length, 2);
  assert.deepEqual(await R.createReminders([]), []);
  assert.equal((await R.setReminderActive(a.id, false)).is_active, false);
  await h.E.ReminderInstance.create({ reminder_id: a.id, status: "fired" });
  await R.deleteReminder(a.id);
  assert.equal(await h.E.Reminder.get(a.id), null);
  assert.equal((await h.E.ReminderInstance.filter({ reminder_id: a.id })).length, 0, "no badge left lit");
  await restoreFromTrash([{ entity: "Reminder", id: a.id }]);
  assert.equal((await h.E.Reminder.get(a.id)).title, "Water");
});

await run();
