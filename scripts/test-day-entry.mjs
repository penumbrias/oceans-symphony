#!/usr/bin/env node
// The Day's edit and delete paths (house 3.3, docs/house/write-paths.md):
// check-ins, symptom check-ins and episodes, nights, places, diary cards,
// and who a fronting session was (reassignFrontSession). Real entity proxy
// on an in-memory preview database; Recent changes is watched through a
// stub of its one door (the preview database keeps no history).
//
//   node scripts/test-day-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities({
  stubs: {
    // setFront pulls in the push/friends stack; only its primary recompute is used here.
    "@/lib/setFront": "export async function recomputePrimaryFromLevels() { globalThis.__recomputed = (globalThis.__recomputed || 0) + 1; }",
    "@/lib/editRestorePoint": "export function keepEditRestorePoint(entity, rec) { (globalThis.__kept ||= []).push({ entity, snapshot: JSON.parse(JSON.stringify(rec)) }); }",
  },
});
const C = await import("../src/lib/checkinEntry.js");
const S = await import("../src/lib/symptomSessions.js");
const Z = await import("../src/lib/sleepEntry.js");
const F = await import("../src/lib/frontSessionEdit.js");
const { changedFields } = await import("../src/lib/recordEdit.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { parseSessionNote } = await import("../src/lib/perAlterSessionEntries.js");
const { test, run } = runner();

const kept = () => globalThis.__kept || [];
const fresh = () => { h.reset(); globalThis.__kept = []; };
const T = (hh, mm = 0) => new Date(Date.UTC(2026, 10, 20, hh, mm)).toISOString();

// ── shared step ──────────────────────────────────────────────────────
test("changedFields: only what the person changed, and never over another device's edit", () => {
  const stored = { a: 1, b: 2, c: [1] };
  assert.deepEqual(changedFields({ a: 1, b: 3, c: [1] }, stored), { b: 3 });
  // The form loaded b=2; another device changed it to 5; the form still says 2 → keep 5.
  assert.deepEqual(changedFields({ a: 9, b: 2 }, { a: 1, b: 5 }, { a: 1, b: 2 }), { a: 9 });
  assert.deepEqual(changedFields({ a: undefined }, stored), {});
});

// ── check-ins ────────────────────────────────────────────────────────
test("edit check-in: fresh read, changed fields only, distress restamped, who reassigned, restore point kept", async () => {
  fresh();
  const ci = await C.logEmotionCheckIn({ emotions: ["calm"], frontingAlterIds: ["a1"], note: "x", intensity: 2 });
  assert.equal(ci.is_distress, false);
  const out = await C.editEmotionCheckIn(ci.id, { emotions: ["calm", "panicked"], frontingAlterIds: ["a2", "a3"], note: "x", intensity: 2 });
  assert.deepEqual(out.emotions, ["calm", "panicked"]);
  assert.equal(out.is_distress, true);
  assert.deepEqual(out.fronting_alter_ids, ["a2", "a3"]);
  assert.equal(out.note, "x");
  assert.ok(out._ft.emotions && out._ft.fronting_alter_ids, "changed fields are stamped");
  assert.equal(out._ft.note, undefined, "an unchanged field keeps its time");
  assert.equal(kept().length, 1);
  assert.deepEqual(kept()[0].snapshot.emotions, ["calm"], "the version before is kept for Recent changes");
  // Nothing changed → nothing written, no restore point.
  const before = out.updated_date;
  const same = await C.editEmotionCheckIn(ci.id, { intensity: 2 });
  assert.equal(same.updated_date, before);
  assert.equal(kept().length, 1);
});

test("edit check-in with a baseline keeps another device's change to an untouched field", async () => {
  fresh();
  const ci = await C.logEmotionCheckIn({ emotions: ["calm"], frontingAlterIds: ["a1"], note: "old" });
  const baseline = { ...ci };
  await h.E.EmotionCheckIn.update(ci.id, { note: "from the other device" });
  await C.editEmotionCheckIn(ci.id, { baseline, note: "old", intensity: 4 });
  const row = await h.E.EmotionCheckIn.get(ci.id);
  assert.equal(row.note, "from the other device");
  assert.equal(row.intensity, 4);
});

test("check-in note: long notes spill to a journal with a 300-character preview", async () => {
  fresh();
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  const f = await C.checkInNoteFields(long, { at: T(9), title: "Check-in - 20/11/2026" });
  assert.ok(f.journal_entry_id);
  assert.ok(f.note.endsWith("...") && f.note.length === 303);
  assert.equal((await h.E.JournalEntry.get(f.journal_entry_id)).content, long);
  assert.deepEqual(await C.checkInNoteFields("short one", { journalEntryId: "j1" }), { note: "short one", journal_entry_id: "j1" });
  assert.deepEqual(await C.checkInNoteFields("  "), { note: null, journal_entry_id: null });
});

test("delete check-in: it and its symptoms go to the trash in one batch; restore brings both back", async () => {
  fresh();
  const ci = await C.logEmotionCheckIn({ emotions: ["calm"], frontingAlterIds: [] });
  const [s1] = await C.logSymptomCheckIns([{ symptomId: "s1", severity: 3 }], { checkInId: ci.id, frontingAlterIds: [] });
  const other = await C.logSymptomCheckIn({ symptomId: "s2", frontingAlterIds: [] });
  await C.deleteEmotionCheckIn(ci.id);
  assert.equal(await h.E.EmotionCheckIn.get(ci.id), null);
  assert.equal(await h.E.SymptomCheckIn.get(s1.id), null);
  assert.ok(await h.E.SymptomCheckIn.get(other.id), "an unrelated symptom stays");
  assert.equal(h.raw("EmotionCheckIn", ci.id).trash_batch, h.raw("SymptomCheckIn", s1.id).trash_batch);
  await restoreFromTrash([{ entity: "EmotionCheckIn", id: ci.id }, { entity: "SymptomCheckIn", id: s1.id }]);
  assert.ok(await h.E.EmotionCheckIn.get(ci.id));
  assert.ok(await h.E.SymptomCheckIn.get(s1.id));
});

test("check-in symptoms restated: edited in place, removed to the trash, new ones logged with the link", async () => {
  fresh();
  const ci = await C.logEmotionCheckIn({ emotions: [], frontingAlterIds: ["a1"] });
  const rows = await C.logSymptomCheckIns([{ symptomId: "s1", severity: 1 }, { symptomId: "s2", severity: 2 }], { checkInId: ci.id, frontingAlterIds: ["a1"], timestamp: T(9) });
  const r = await C.syncCheckInSymptoms(ci.id, [{ symptomId: "s1", severity: 4 }, { symptomId: "s3", severity: 5, frontingAlterIds: ["a2"] }], { timestamp: T(10), frontingAlterIds: ["a1"] });
  assert.deepEqual(r, { updated: 1, created: 1, removed: 1 });
  const s1 = await h.E.SymptomCheckIn.get(rows[0].id);
  assert.equal(s1.severity, 4);
  assert.equal(s1.timestamp, T(10));
  assert.equal(await h.E.SymptomCheckIn.get(rows[1].id), null);
  assert.ok(h.raw("SymptomCheckIn", rows[1].id).trashed_at, "removed, not erased");
  const added = (await h.E.SymptomCheckIn.filter({ symptom_id: "s3" }))[0];
  assert.deepEqual(h.written(added), { symptom_id: "s3", timestamp: T(10), severity: 5, fronting_alter_ids: ["a2"], check_in_id: ci.id });
});

test("symptom check-in: edit severity and who; delete to the trash", async () => {
  fresh();
  const sc = await C.logSymptomCheckIn({ symptomId: "s1", severity: 2, frontingAlterIds: ["a1"] });
  const out = await C.editSymptomCheckIn(sc.id, { severity: 5, frontingAlterIds: ["a2"] });
  assert.equal(out.severity, 5);
  assert.deepEqual(out.fronting_alter_ids, ["a2"]);
  assert.equal(await C.deleteSymptomCheckIns([sc.id]), 1);
  assert.equal(await h.E.SymptomCheckIn.get(sc.id), null);
  await assert.rejects(C.editSymptomCheckIn(sc.id, { severity: 1 }), /couldn't be found/);
});

// ── symptom episodes ─────────────────────────────────────────────────
test("symptom episode: times validated, an end ends it, notes and authors, delete to the trash", async () => {
  fresh();
  const { session } = await S.startSymptomSession("s1", { startTime: T(8) });
  await assert.rejects(S.editSymptomSession(session.id, { end: T(7) }), /before the start/);
  await assert.rejects(S.editSymptomSession(session.id, { start: "nope" }), /valid start/);
  const moved = await S.editSymptomSession(session.id, { start: T(7) });
  assert.equal(moved.start_time, T(7));
  assert.equal(moved.is_active, true);
  const ended = await S.endSymptomSession(session.id, { endTime: T(9) });
  assert.equal(ended.end_time, T(9));
  assert.equal(ended.is_active, false);
  await assert.rejects(S.editSymptomSession(session.id, { start: T(10) }), /after the end/);
  const noted = await S.editSymptomSession(session.id, { notes: "  headache ", authorIds: ["a1"] });
  assert.equal(noted.notes, "headache");
  assert.deepEqual(noted.author_alter_ids, ["a1"]);
  assert.equal((await S.editSymptomSession(session.id, { notes: "" })).notes, null);
  await S.deleteSymptomSession(session.id);
  assert.equal(await h.E.SymptomSession.get(session.id), null);
  assert.ok(h.raw("SymptomSession", session.id).trashed_at);
});

// ── sleep ────────────────────────────────────────────────────────────
test("edit night: validated, mirror kept in step, dream journal link untouched", async () => {
  fresh();
  const { sleep } = await Z.startSleep({ bedtime: T(1) });
  const ended = await Z.endSleep(sleep, { wakeTime: T(7) });
  await h.E.Sleep.update(sleep.id, { journal_entry_id: "dream1" });
  const actId = (await h.E.Sleep.get(sleep.id)).linked_activity_id;
  assert.ok(actId && ended);
  await assert.rejects(Z.editSleep(sleep.id, { wake_time: T(0) }), /after bedtime/);
  const out = await Z.editSleep(sleep.id, { bedtime: T(0), quality: 7, notes: "ok" });
  assert.equal(out.quality, 7);
  assert.equal(out.journal_entry_id, "dream1");
  const act = await h.E.Activity.get(actId);
  assert.equal(act.timestamp, T(0));
  assert.equal(act.duration_minutes, 420);
  assert.equal(act.notes, "ok");
  assert.equal((await h.E.Activity.filter({ activity_name: "Sleep" })).length, 1, "never a second mirror");
});

test("edit night: an older night finds its mirror by bedtime and links both ways; no mirror is never invented", async () => {
  fresh();
  const night = await h.E.Sleep.create({ date: "2026-11-20", bedtime: T(1), wake_time: T(6) });
  const act = await h.E.Activity.create({ activity_name: "Sleep", timestamp: T(1), duration_minutes: 300 });
  await Z.editSleep(night.id, { wake_time: T(8) });
  assert.equal((await h.E.Sleep.get(night.id)).linked_activity_id, act.id);
  assert.equal((await h.E.Activity.get(act.id)).source_sleep_id, night.id);
  assert.equal((await h.E.Activity.get(act.id)).duration_minutes, 420);
  const lone = await h.E.Sleep.create({ date: "2026-11-19", bedtime: T(2), wake_time: T(5) });
  await Z.editSleep(lone.id, { quality: 3 });
  assert.equal((await h.E.Activity.list()).length, 1);
});

test("delete night: the night and its mirror share one trash batch; the dream journal stays", async () => {
  fresh();
  const { sleep } = await Z.startSleep({ bedtime: T(1) });
  await Z.endSleep(sleep, { wakeTime: T(7) });
  const j = await h.E.JournalEntry.create({ title: "Dream", content: "flying" });
  await h.E.Sleep.update(sleep.id, { journal_entry_id: j.id });
  const actId = (await h.E.Sleep.get(sleep.id)).linked_activity_id;
  const r = await Z.deleteSleep(sleep.id);
  assert.deepEqual(r, { trashed: 2, journalKept: true });
  assert.equal(h.raw("Sleep", sleep.id).trash_batch, h.raw("Activity", actId).trash_batch);
  assert.ok(await h.E.JournalEntry.get(j.id));
  // A night started by mistake has no mirror: just the night.
  const { sleep: oops } = await Z.startSleep({ bedtime: T(22) });
  assert.deepEqual(await Z.deleteSleep(oops.id), { trashed: 1, journalKept: false });
});

// ── places and diary cards ───────────────────────────────────────────
test("edit place: logLocation's shape rules; delete to the trash", async () => {
  fresh();
  const loc = await C.logLocation({ category: "home", name: "Flat", lat: 1, lng: 2, frontingAlterIds: ["a1"] });
  const out = await C.editLocation(loc.id, { category: "work", name: " ", lat: null, lng: null, notes: "n", frontingAlterIds: ["a2"] });
  assert.equal(out.category, "work");
  assert.ok(out.name && out.name.trim(), "the category's label when no name");
  assert.equal(out.latitude, null);
  assert.equal(out.source, "manual");
  assert.deepEqual(out.fronting_alter_ids, ["a2"]);
  assert.equal(kept().length, 1);
  const named = await C.editLocation(loc.id, { name: "Office", category: "work" });
  assert.equal(named.name, "Office");
  await C.deleteLocation(loc.id);
  assert.equal(await h.E.Location.get(loc.id), null);
  assert.ok(h.raw("Location", loc.id).trashed_at);
});

test("edit diary card: diary fields through diaryDataToPatch, the rest kept; delete to the trash", async () => {
  fresh();
  const { diaryDataToPatch, diaryCardToData } = await import("../src/lib/diaryData.js");
  const card = await h.E.DiaryCard.create({ card_type: "daily", date: "2026-11-20", name: "Daily", emotions: ["calm"], notes: { optional: "keep" }, fronting_alter_ids: ["a1"] });
  const data = diaryCardToData(card);
  const out = await C.editDiaryCard(card.id, data);
  const expected = diaryDataToPatch(data);
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(out[k] ?? null, v ?? null, k);
  assert.deepEqual(out.notes, { optional: "keep" });
  assert.deepEqual(out.emotions, ["calm"]);
  await C.deleteDiaryCardRecord(card.id);
  assert.equal(await h.E.DiaryCard.get(card.id), null);
});

// ── who a fronting session was ───────────────────────────────────────
const notesJson = (arr) => JSON.stringify(arr);
async function pastSession(extra = {}) {
  return h.E.FrontingSession.create({
    alter_id: "A", is_primary: true, front_level: "front", start_time: T(8), end_time: T(12), is_active: false,
    note: notesJson([{ text: "early", timestamp: T(8, 30) }, { text: "middle", timestamp: T(10) }, { text: "late", timestamp: T(11, 30) }]),
    session_emotions: JSON.stringify(["calm"]), ...extra,
  });
}
const byAlter = async (id) => (await h.E.FrontingSession.filter({ alter_id: id })).sort((a, b) => a.start_time.localeCompare(b.start_time));

test("reassign the whole session: same row, new member, payloads travel, restore point kept", async () => {
  fresh();
  const s = await pastSession();
  const r = await F.reassignFrontSession({ session: s, toAlterId: "B" });
  const row = await h.E.FrontingSession.get(s.id);
  assert.equal(row.alter_id, "B");
  assert.equal(row.start_time, T(8));
  assert.equal(row.end_time, T(12));
  assert.equal(parseSessionNote(row.note).length, 3);
  assert.equal(row.session_emotions, JSON.stringify(["calm"]));
  assert.deepEqual(r.createdIds, []);
  assert.equal(kept().length, 1);
  assert.equal(kept()[0].snapshot.alter_id, "A");
  assert.equal((await h.E.FrontingSession.list()).length, 1);
});

test("reassign part: split at both ends, middle handed over with its notes; undo puts it all back", async () => {
  fresh();
  const s = await pastSession();
  const r = await F.reassignFrontSession({ session: s, fromAlterId: "A", toAlterId: "B", start: T(9), end: T(11) });
  const a = await byAlter("A");
  const b = await byAlter("B");
  assert.deepEqual(a.map((x) => [x.start_time, x.end_time]), [[T(8), T(9)], [T(11), T(12)]]);
  assert.deepEqual(b.map((x) => [x.start_time, x.end_time]), [[T(9), T(11)]]);
  assert.equal(a[0].id, s.id, "the original row stays the part before");
  assert.deepEqual(parseSessionNote(a[0].note).map((n) => n.text), ["early"]);
  assert.deepEqual(parseSessionNote(b[0].note).map((n) => n.text), ["middle"]);
  assert.deepEqual(parseSessionNote(a[1].note).map((n) => n.text), ["late"]);
  assert.equal(a[0].session_emotions, JSON.stringify(["calm"]), "session-level feelings stay with the start");
  assert.equal(b[0].front_level, "front", "the handed piece keeps the level");
  for (const x of [...a, ...b]) assert.equal(x.co_fronter_ids, undefined, "never the grouped shape");
  await F.undoFrontReassign(r);
  const live = await h.E.FrontingSession.list();
  assert.equal(live.length, 1);
  assert.equal(live[0].id, s.id);
  assert.equal(live[0].end_time, T(12));
  assert.equal(parseSessionNote(live[0].note).length, 3);
});

test("reassign from the start with carryPayload false: entries stay with the original member", async () => {
  fresh();
  const s = await pastSession();
  await F.reassignFrontSession({ session: s, toAlterId: "B", end: T(10, 30), carryPayload: false });
  const [b] = await byAlter("B");
  const [a] = await byAlter("A");
  assert.equal(b.id, s.id);
  assert.deepEqual(parseSessionNote(b.note), []);
  assert.equal(b.session_emotions, null);
  assert.deepEqual(parseSessionNote(a.note).map((n) => n.text), ["early", "middle", "late"]);
  assert.equal(a.session_emotions, JSON.stringify(["calm"]));
  // And with carryPayload (default) the start's feelings go with the handed part.
  fresh();
  const s2 = await pastSession();
  await F.reassignFrontSession({ session: s2, toAlterId: "B", end: T(10, 30) });
  const [b2] = await byAlter("B");
  const [a2] = await byAlter("A");
  assert.deepEqual(parseSessionNote(b2.note).map((n) => n.text), ["early", "middle"]);
  assert.deepEqual(parseSessionNote(a2.note).map((n) => n.text), ["late"]);
  assert.equal(b2.session_emotions, JSON.stringify(["calm"]));
});

test("reassign a legacy grouped row: carved first, others keep the group row", async () => {
  fresh();
  const g = await h.E.FrontingSession.create({ primary_alter_id: "A", co_fronter_ids: ["C"], start_time: T(8), end_time: T(10), is_active: false });
  await F.reassignFrontSession({ session: g, fromAlterId: "C", toAlterId: "B" });
  const group = await h.E.FrontingSession.get(g.id);
  assert.equal(group.primary_alter_id, "A");
  assert.deepEqual(group.co_fronter_ids, []);
  const [b] = await byAlter("B");
  assert.deepEqual([b.start_time, b.end_time], [T(8), T(10)]);
  assert.equal(b.primary_alter_id, undefined);
});

test("add and remove someone for a stretch", async () => {
  fresh();
  const s = await pastSession();
  const added = await F.reassignFrontSession({ session: s, mode: "add", toAlterId: "B", start: T(9), end: T(10) });
  assert.equal(added.createdIds.length, 1);
  assert.equal((await h.E.FrontingSession.get(s.id)).end_time, T(12), "the original is untouched");
  const [b] = await byAlter("B");
  assert.deepEqual([b.start_time, b.end_time, b.front_level], [T(9), T(10), "front"]);
  fresh();
  const s2 = await pastSession();
  const removed = await F.reassignFrontSession({ session: s2, mode: "remove", start: T(9), end: T(11) });
  const a = await byAlter("A");
  assert.deepEqual(a.map((x) => [x.start_time, x.end_time]), [[T(8), T(9)], [T(11), T(12)]]);
  assert.deepEqual(parseSessionNote(a[0].note).map((n) => n.text), ["early", "middle"], "the stretch's notes stay on the remaining part");
  assert.ok(h.raw("FrontingSession", removed.trashedIds[0]).trashed_at, "the removed stretch is in the trash");
  await F.undoFrontReassign(removed);
  const back = await h.E.FrontingSession.list();
  assert.equal(back.length, 1);
  assert.equal(back[0].end_time, T(12));
});

test("reassign validates times and refuses to double-count someone", async () => {
  fresh();
  const s = await pastSession();
  await assert.rejects(F.reassignFrontSession({ session: s, toAlterId: "B", start: T(7) }), /inside the session/);
  await assert.rejects(F.reassignFrontSession({ session: s, toAlterId: "B", end: T(13) }), /inside the session/);
  await assert.rejects(F.reassignFrontSession({ session: s, toAlterId: "B", start: T(10), end: T(9) }), /after the start/);
  await assert.rejects(F.reassignFrontSession({ session: s, toAlterId: "A" }), /already is/);
  await assert.rejects(F.reassignFrontSession({ session: s }), /Pick who/);
  await h.E.FrontingSession.create({ alter_id: "B", start_time: T(11), end_time: T(13), is_active: false });
  await assert.rejects(F.reassignFrontSession({ session: s, toAlterId: "B", start: T(10) }), /already have fronting/);
  assert.equal((await h.E.FrontingSession.get(s.id)).end_time, T(12), "a refused change writes nothing");
  assert.equal(kept().length, 0);
});

test("reassign a session still going from a past time: the new member is in front now", async () => {
  fresh();
  const start = new Date(Date.now() - 3 * 3600e3).toISOString();
  const mid = new Date(Date.now() - 3600e3).toISOString();
  const s = await h.E.FrontingSession.create({ alter_id: "A", is_primary: true, front_level: "front", start_time: start, end_time: null, is_active: true });
  await F.reassignFrontSession({ session: s, toAlterId: "B", start: mid });
  const [a] = await byAlter("A");
  const [b] = await byAlter("B");
  assert.equal(a.end_time, mid);
  assert.equal(a.is_active, false);
  assert.equal(b.start_time, mid);
  assert.equal(b.is_active, true);
  assert.equal(b.end_time, null);
});

test("undo keeps notes written after the reassignment and is safe to run twice", async () => {
  fresh();
  const s = await pastSession();
  const r = await F.reassignFrontSession({ session: s, fromAlterId: "A", toAlterId: "B", start: T(9), end: T(11) });
  const [b] = await byAlter("B");
  const added = { text: "written later", timestamp: T(10, 15) };
  await h.E.FrontingSession.update(b.id, { note: JSON.stringify([...parseSessionNote(b.note), added]) });
  await F.undoFrontReassign(r);
  await F.undoFrontReassign(r);
  const live = await h.E.FrontingSession.list();
  assert.equal(live.length, 1);
  assert.equal(live[0].alter_id, "A");
  assert.deepEqual(parseSessionNote(live[0].note).map((n) => n.text), ["early", "middle", "late", "written later"]);
  assert.ok(kept().some((k) => k.entity === "FrontingSession" && k.snapshot.end_time === T(9)), "the row before the undo is kept in Recent changes");
});

test("undo of a reassign on a live session never reopens an ended row (sync-safe)", async () => {
  fresh();
  const start = new Date(Date.now() - 3 * 3600e3).toISOString();
  const mid = new Date(Date.now() - 3600e3).toISOString();
  const s = await h.E.FrontingSession.create({
    alter_id: "A", is_primary: true, front_level: "front", start_time: start, end_time: null, is_active: true,
    note: JSON.stringify([{ text: "before", timestamp: start }, { text: "after", timestamp: mid }]),
  });
  const r = await F.reassignFrontSession({ session: s, toAlterId: "B", start: mid });
  await F.undoFrontReassign(r);
  await F.undoFrontReassign(r);
  const a = await byAlter("A");
  assert.equal((await byAlter("B")).length, 0, "nobody else is left holding the stretch");
  assert.deepEqual(a.map((x) => [x.start_time, x.end_time, x.is_active]), [[start, mid, false], [mid, null, true]]);
  assert.equal(a[0].id, s.id);
  assert.deepEqual(parseSessionNote(a[0].note).map((n) => n.text), ["before", "after"], "the notes go home to the original row");
  assert.deepEqual(parseSessionNote(a[1].note), []);
  // Merging the undone copy with a device that only saw the reassignment
  // keeps someone in front: the live piece was never trashed.
  const { mergeFrontingSession } = await import("../src/lib/syncMerge.js");
  const other = { ...a[0], end_time: mid, is_active: false };
  assert.equal(mergeFrontingSession(a[0], other).end_time, mid);
  assert.equal(h.raw("FrontingSession", a[1].id).trashed_at ?? null, null);
});

test("a whisper's secret never becomes a Recent changes label", async () => {
  const { historyLabelFor } = await import("../src/lib/localDb.js");
  const label = historyLabelFor("EmotionCheckIn", { id: "x", note: 'ok <span class="whisper" data-whisper-for="B">the secret</span> done' });
  assert.ok(!label.includes("secret"), label);
  assert.ok(label.includes("private whisper"));
});

await run();
