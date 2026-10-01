#!/usr/bin/env node
// Checks the field-level sync merge (src/lib/syncMerge.js).
//
//   node scripts/test-sync-merge.mjs                 scenario tests
//   node scripts/test-sync-merge.mjs <snapshot.json> ... also fold that
//        device's task records and prove no tick is lost
//
// Snapshot = a device-sync *.data.json (unencrypted) or a backup export.

import fs from "node:fs";
import assert from "node:assert/strict";
import {
  mergeRecordFields, stampCreate, stampUpdate, fieldTime,
  mergeDailyProgress, dailyProgressPeriod, pickDailyProgressKeeper,
  mergeForEntity, mergeFrontingSession,
} from "../src/lib/syncMerge.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};
const T = (n) => new Date(Date.UTC(2026, 8, 20, 12, n)).toISOString();
// Simulate the entity proxy: create at t, then update(patch) at t2.
const created = (data, t) => ({ ...data, id: data.id || "r1", created_date: t, updated_date: t, _ft: stampCreate(t) });
const updated = (rec, patch, t) => ({ ...rec, ...patch, updated_date: t, _ft: stampUpdate(rec, patch, t) });

console.log("field-level merge");
test("edits to different fields on two devices both survive", () => {
  const base = created({ name: "Ari", pronouns: "they", role: "host" }, T(0));
  const phone = updated(base, { pronouns: "she" }, T(1));
  const desk = updated(base, { role: "protector" }, T(2)); // newer record overall
  const onPhone = mergeRecordFields(phone, desk);
  const onDesk = mergeRecordFields(desk, phone);
  for (const r of [onPhone, onDesk]) {
    assert.equal(r.pronouns, "she");
    assert.equal(r.role, "protector");
  }
});
test("a deliberate clear stays cleared (not refilled from the other device)", () => {
  const base = created({ tags: ["a", "b"] }, T(0));
  const phone = updated(base, { tags: [] }, T(3));
  assert.deepEqual(mergeRecordFields(phone, base).tags, []);
});
test("a newer clear on the other device reaches this one", () => {
  const base = created({ avatar_url: "x.png" }, T(0));
  const desk = updated(base, { avatar_url: "" }, T(3));
  assert.equal(mergeRecordFields(base, desk).avatar_url, "");
});
test("same field edited on both: the later edit wins", () => {
  const base = created({ bio: "one" }, T(0));
  const a = updated(base, { bio: "two" }, T(1));
  const b = updated(base, { bio: "three" }, T(2));
  assert.equal(mergeRecordFields(a, b).bio, "three");
  assert.equal(mergeRecordFields(b, a).bio, "three");
});
test("rewriting a field with the same value does not make it newer", () => {
  const base = created({ bio: "one" }, T(0));
  const a = updated(base, { bio: "one" }, T(5));
  assert.equal(fieldTime(a, "bio"), T(0));
});
test("legacy (no field times): an empty incoming value never blanks a local one", () => {
  const local = { id: "r1", notes: "keep me", updated_date: T(1) };
  const incoming = { id: "r1", notes: "", updated_date: T(5) };
  assert.equal(mergeRecordFields(local, incoming).notes, "keep me");
});
test("legacy: an empty local field is still filled from the other side", () => {
  const local = { id: "r1", color: "", updated_date: T(5) };
  const incoming = { id: "r1", color: "#fff", updated_date: T(1) };
  assert.equal(mergeRecordFields(local, incoming).color, "#fff");
});
test("legacy: newer incoming values still win", () => {
  const local = { id: "r1", role: "host", updated_date: T(1) };
  const incoming = { id: "r1", role: "protector", updated_date: T(2) };
  assert.equal(mergeRecordFields(local, incoming).role, "protector");
});
test("merging identical copies changes nothing (same object back)", () => {
  const a = created({ name: "Ari" }, T(0));
  assert.equal(mergeRecordFields(a, { ...a }), a);
});
test("merge is order-independent for independent edits", () => {
  const base = created({ a: 1, b: 1, c: 1 }, T(0));
  const x = updated(base, { a: 2 }, T(1));
  const y = updated(updated(base, { b: 3 }, T(2)), { c: 4 }, T(4));
  const xy = mergeRecordFields(x, y), yx = mergeRecordFields(y, x);
  for (const k of ["a", "b", "c"]) assert.equal(xy[k], yx[k]);
});

console.log("task completions");
const period = (extra = {}) => ({ id: "p1", frequency: "weekly", period_key: "2026-W39", date: "2026-W39", ...extra });
test("ticks made on two devices before syncing both survive", () => {
  const base = created(period({ completed_task_ids: [], completion_times: {} }), T(0));
  const phone = updated(base, { completed_task_ids: ["X"], completion_times: { X: T(1) } }, T(1));
  const desk = updated(base, { completed_task_ids: ["Y"], completion_times: { Y: T(2) } }, T(2));
  const m = mergeDailyProgress(phone, desk);
  assert.deepEqual([...m.completed_task_ids].sort(), ["X", "Y"]);
  assert.deepEqual(Object.keys(m.completion_times).sort(), ["X", "Y"]);
});
test("an untick after the other device's tick wins", () => {
  const base = created(period({ completed_task_ids: ["X"], completion_times: { X: T(1) } }), T(1));
  const phone = updated(base, { completed_task_ids: [], completion_times: {}, cleared_times: { X: T(3) } }, T(3));
  assert.deepEqual(mergeDailyProgress(base, phone).completed_task_ids, []);
  assert.deepEqual(mergeDailyProgress(phone, base).completed_task_ids, []);
});
test("a re-tick after an untick wins", () => {
  const cleared = created(period({ completed_task_ids: [], cleared_times: { X: T(3) } }), T(3));
  const reticked = updated(cleared, { completed_task_ids: ["X"], completion_times: { X: T(4) } }, T(4));
  assert.deepEqual(mergeDailyProgress(cleared, reticked).completed_task_ids, ["X"]);
});
test("old-build ticks without times are kept, and never given a made-up time", () => {
  const legacy = { ...period({ completed_task_ids: ["X"] }), updated_date: T(1), created_date: T(1) };
  const other = created(period({ id: "p2", completed_task_ids: ["Y"], completion_times: { Y: T(2) } }), T(2));
  const m = mergeDailyProgress(legacy, other);
  assert.deepEqual([...m.completed_task_ids].sort(), ["X", "Y"]);
  assert.equal(m.completion_times.X, undefined);
});
test("XP is recomputed from the merged ticks", () => {
  const a = created(period({ completed_task_ids: ["X"], completion_times: { X: T(1) }, xp_earned: 5 }), T(1));
  const b = created(period({ id: "p2", completed_task_ids: ["Y"], completion_times: { Y: T(2) }, xp_earned: 3 }), T(2));
  const m = mergeDailyProgress(a, b, { pointsFor: (id) => ({ X: 5, Y: 3 })[id] });
  assert.equal(m.xp_earned, 8);
});
test("every device picks the same keeper for duplicates", () => {
  const recs = [{ id: "b", created_date: T(1) }, { id: "a", created_date: T(1) }, { id: "c", created_date: T(0) }];
  assert.equal(pickDailyProgressKeeper(recs).id, "c");
  assert.equal(pickDailyProgressKeeper([...recs].reverse()).id, "c");
});

console.log("fronting sessions");
const sess = (extra) => created({ id: "s1", alter_id: "kai", is_primary: true, is_active: true, start_time: T(0), note: "[]", ...extra }, T(0));
test("a switch on the other device ends the front here, at its time", () => {
  const phone = sess();
  const desk = updated(phone, { is_active: false, end_time: T(30) }, T(30));
  const m = mergeFrontingSession(phone, desk);
  assert.equal(m.is_active, false);
  assert.equal(m.end_time, T(30));
});
test("a still-running copy never un-ends a session", () => {
  const ended = updated(sess(), { is_active: false, end_time: T(30) }, T(30));
  const stillLive = updated(sess(), { note: JSON.stringify([{ text: "hi", timestamp: T(40) }]) }, T(40));
  const m = mergeFrontingSession(ended, stillLive);
  assert.equal(m.is_active, false);
  assert.equal(m.end_time, T(30));
  assert.equal(JSON.parse(m.note).length, 1); // the note still arrives
});
test("a session is never rewritten to 0 minutes", () => {
  const ended = updated(sess(), { is_active: false, end_time: T(30) }, T(30));
  const other = updated(sess(), { front_level: "observing" }, T(45));
  const m = mergeFrontingSession(ended, other);
  assert.equal(m.end_time, T(30));
  assert.equal(m.front_level, "observing");
});
test("per-alter notes added on both devices are all kept", () => {
  const base = sess({ note: JSON.stringify([{ text: "a", timestamp: T(1) }]) });
  const p = updated(base, { note: JSON.stringify([{ text: "a", timestamp: T(1) }, { text: "phone", timestamp: T(5) }]) }, T(5));
  const d = updated(base, { note: JSON.stringify([{ text: "a", timestamp: T(1) }, { text: "desk", timestamp: T(6) }]) }, T(6));
  const texts = JSON.parse(mergeFrontingSession(p, d).note).map((n) => n.text);
  assert.deepEqual(texts, ["a", "phone", "desk"]);
});

test("a demoted placeholder from the other device never ends a live front (2026-09-30)", () => {
  const live = sess({ id: "k1" });
  const placeholder = { ...live, is_active: false, is_primary: false, end_time: live.start_time, sync_demoted: true, updated_date: T(30) };
  const m = mergeFrontingSession(live, placeholder);
  assert.equal(m.is_active, true);
  assert.equal(m.end_time, live.end_time);
  assert.equal(m.sync_demoted, undefined);
});
test("a local placeholder takes the origin's real end and stops being a placeholder", () => {
  const live = sess({ id: "k2" });
  const placeholder = { ...live, is_active: false, end_time: live.start_time, sync_demoted: true };
  const realEnd = updated(live, { is_active: false, end_time: T(90) }, T(90));
  const m = mergeFrontingSession(placeholder, realEnd);
  assert.equal(m.end_time, T(90));
  assert.equal(m.sync_demoted, undefined);
});
test("a 0-minute end that lost its placeholder marker still never ends a live front", () => {
  const live = sess({ id: "k3" });
  const bogus = updated(live, { is_active: false, end_time: live.start_time }, T(95));
  const m = mergeFrontingSession(live, bogus);
  assert.equal(m.is_active, true);
});

console.log("logs and settings");
test("presence sightings from both devices are all kept", () => {
  const base = created({ id: "pr", name: "fog", sightings: [T(1)] }, T(1));
  const a = updated(base, { sightings: [T(1), T(5)] }, T(5));
  const b = updated(base, { sightings: [T(1), T(7)] }, T(7));
  assert.deepEqual(mergeForEntity("Presence", a, b).sightings, [T(1), T(5), T(7)]);
});
test("old settings rows: a widget drag no longer carries stale terms across", () => {
  // Both rows predate field times; the desktop's was bumped by a drag.
  const phone = { id: "ss1", system_name: "Renamed", created_date: T(0), updated_date: T(10) };
  const desk = { id: "ss2", system_name: "Old name", created_date: T(0), updated_date: T(50) };
  assert.equal(mergeForEntity("SystemSettings", phone, desk).system_name, "Renamed");
});
test("settings: a real timed rename beats an old row", () => {
  const phone = { id: "ss1", system_name: "Old", created_date: T(0), updated_date: T(50) };
  const deskBase = { id: "ss2", system_name: "Old", created_date: T(0), updated_date: T(5) };
  const desk = { ...deskBase, system_name: "New", updated_date: T(20), _ft: stampUpdate(deskBase, { system_name: "New" }, T(20), { legacyUntimed: true }) };
  assert.equal(mergeForEntity("SystemSettings", phone, desk).system_name, "New");
});
test("settings: a look-only edit does not make the other fields newer", () => {
  const base = { id: "ss", system_name: "A", created_date: T(0), updated_date: T(0) };
  const renamed = { ...base, system_name: "B", updated_date: T(10), _ft: stampUpdate(base, { system_name: "B" }, T(10), { legacyUntimed: true }) };
  const dragged = { ...base, ui_v2_home: { x: 1 }, updated_date: T(30), _ft: stampUpdate(base, { ui_v2_home: { x: 1 } }, T(30), { legacyUntimed: true }) };
  assert.equal(mergeForEntity("SystemSettings", renamed, dragged).system_name, "B");
  assert.equal(mergeForEntity("SystemSettings", dragged, renamed).system_name, "B");
});

// ── Real data: fold one device's duplicates and prove nothing is lost ──
for (const file of process.argv.slice(2)) {
  console.log(`\nreal data: ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const data = raw.body?.data || raw.data || raw;
  const recs = Object.values(data.DailyProgress || {});
  const groups = new Map();
  for (const r of recs) {
    const k = dailyProgressPeriod(r);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  let dupGroups = 0, lost = 0, ticksBefore = 0;
  for (const [k, g] of groups) {
    const before = new Set(g.flatMap((r) => r.completed_task_ids || []));
    ticksBefore += before.size;
    if (g.length < 2) continue;
    dupGroups++;
    const keeper = pickDailyProgressKeeper(g);
    let m = keeper;
    for (const r of g) if (r.id !== keeper.id) m = mergeDailyProgress(m, r);
    for (const id of before) if (!m.completed_task_ids.includes(id)) { lost++; console.log(`    lost ${id} in ${k}`); }
  }
  test(`${recs.length} records, ${groups.size} periods, ${dupGroups} with duplicates — no tick lost (${ticksBefore} ticks)`, () => {
    assert.equal(lost, 0);
  });
}

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}`);
