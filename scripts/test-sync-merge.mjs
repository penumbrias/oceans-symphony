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
  mergeBoards,
} from "../src/lib/syncMerge.js";
import { planFrontResolution } from "../src/lib/frontConflictPlan.js";
import { planAdvancedResolution, conflictDays, originOf, dayKey } from "../src/lib/frontConflictTimeline.js";

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

console.log("front conflicts (both devices switched between syncs)");
{
  // A was live on both. Phone switched to B at :30, desktop to C at :40.
  // Each device keeps its own live front; the other's is a placeholder.
  const apply = (rec, patch, t) => updated(rec, patch, t);
  const demote = (r) => ({ ...r, is_active: false, is_primary: false, end_time: r.start_time, sync_demoted: true });
  const B = created({ id: "B", alter_id: "b", is_primary: true, is_active: true, start_time: T(30), note: "[]" }, T(30));
  const C = created({ id: "C", alter_id: "c", is_primary: true, is_active: true, start_time: T(40), note: "[]" }, T(40));
  const NOW = T(50);
  const run = (choice) => {
    // On the desktop: mine = C, theirs = placeholder B (was primary).
    const desk = { B: demote(B), C };
    const phone = { B, C: demote(C) };
    const plan = planFrontResolution(choice, { theirs: [{ ...desk.B, _wasPrimary: true }], mine: [desk.C], now: NOW });
    for (const { id, patch } of plan) desk[id] = apply(desk[id], patch, NOW);
    // Next sync: the phone merges the desktop's copies.
    for (const id of ["B", "C"]) phone[id] = mergeFrontingSession(phone[id], desk[id]);
    return { desk, phone };
  };
  test("keep this device's: their front ends on BOTH devices; ours comes alive on theirs", () => {
    const { desk, phone } = run("mine");
    for (const d of [desk, phone]) {
      assert.equal(d.B.is_active, false); assert.equal(d.B.end_time, NOW);
      assert.equal(d.C.is_active, true); assert.equal(d.C.end_time ?? null, null);
    }
    assert.ok(!phone.C.sync_demoted); assert.equal(phone.C.is_primary, true);
  });
  test("use the other device's: ours ends on both; theirs is live on both, primary kept", () => {
    const { desk, phone } = run("theirs");
    for (const d of [desk, phone]) {
      assert.equal(d.C.is_active, false); assert.equal(d.C.end_time, NOW);
      assert.equal(d.B.is_active, true);
    }
    assert.equal(desk.B.is_primary, true);
    assert.ok(!phone.C.sync_demoted);
  });
  test("both fronting: both live on both devices, one primary", () => {
    const { desk, phone } = run("both");
    for (const d of [desk, phone]) {
      assert.equal(d.B.is_active, true); assert.equal(d.C.is_active, true);
      assert.equal([d.B, d.C].filter((s) => s.is_primary).length, 1);
    }
  });
  test("a revived front never un-ends a REAL end made on the other device", () => {
    const ended = updated(B, { is_active: false, end_time: T(45) }, T(45));
    const revived = updated(B, { revived_at: T(50) }, T(50));
    assert.equal(mergeFrontingSession(ended, revived).is_active, false);
  });
}

console.log("advanced front review (spans, days, edits)");
{
  // Local-time days, so the test holds in any timezone.
  const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
  const NOW = at(12, 20);
  const apply = (db, writes) => { for (const { id, patch } of writes) db[id] = updated(db[id], patch, NOW); };
  const S = (id, d, h1, h2, o, extra = {}) => created({ id, alter_id: id.toLowerCase(), start_time: at(d, h1), end_time: at(d, h2), is_active: false, is_primary: false, origin_device: o, ...extra }, at(d, h1));
  const base = () => ({
    D1: S("D1", 10, 9, 12, "desk"), P1: S("P1", 10, 10, 13, "phone"),
    D2: S("D2", 11, 9, 12, "desk"), P2: S("P2", 11, 10, 13, "phone"),
    U3: S("U3", 11, 14, 15, undefined),
  });
  const plan = (db, answers) => planAdvancedResolution({ sessions: Object.values(db), thisDevice: "desk", now: NOW, ...answers });

  test("days where the two devices' fronts overlap are found", () => {
    const db = base();
    const origin = (s) => originOf(s, { thisDevice: "desk" });
    assert.deepEqual(conflictDays({ sessions: Object.values(db), now: NOW, origin }), [dayKey(at(10, 12)), dayKey(at(11, 12))]);
  });
  test("a span 'use this device' removes only the other device's sessions in it", () => {
    const db = base();
    const { writes } = plan(db, { spans: [{ from: dayKey(at(10, 0)), to: dayKey(at(11, 0)), keep: "desk" }] });
    apply(db, writes);
    assert.ok(db.P1.removed_at && db.P2.removed_at);
    assert.ok(!db.D1.removed_at && !db.D2.removed_at && !db.U3.removed_at, "unknown-device sessions only change by hand");
  });
  test("one day's choice beats the span; an edit beats both", () => {
    const db = base();
    const { writes } = plan(db, {
      spans: [{ from: dayKey(at(10, 0)), to: dayKey(at(11, 0)), keep: "desk" }],
      days: { [dayKey(at(11, 0))]: "phone" },
      edits: { P1: { removed: false, end_time: at(10, 11) } },
    });
    apply(db, writes);
    assert.ok(!db.P1.removed_at); assert.equal(db.P1.end_time, at(10, 11));
    assert.ok(db.D2.removed_at); assert.ok(!db.P2.removed_at);
  });
  test("an end before the start is refused", () => {
    assert.throws(() => plan(base(), { edits: { D1: { end_time: at(10, 8) } } }), /can't end before/);
  });
  test("removed reaches the other device, stays in the data, and can be put back", () => {
    const desk = base(); const phone = base();
    apply(desk, plan(desk, { edits: { P1: { removed: true } } }).writes);
    phone.P1 = mergeFrontingSession(phone.P1, desk.P1);
    assert.ok(phone.P1.removed_at); assert.equal(phone.P1.alter_id, "p1");
    const later = (rec, patch) => ({ ...rec, ...patch, updated_date: at(12, 21), _ft: stampUpdate(rec, patch, at(12, 21)) });
    desk.P1 = later(desk.P1, { removed_at: null });
    phone.P1 = mergeFrontingSession(phone.P1, desk.P1);
    assert.equal(phone.P1.removed_at, null);
  });
  test("a front removed here ends on the device where it was still live", () => {
    const live = created({ id: "L", alter_id: "l", start_time: at(12, 9), is_active: true, is_primary: true, origin_device: "phone" }, at(12, 9));
    const demoted = { ...live, is_active: false, is_primary: false, end_time: live.start_time, sync_demoted: true };
    const desk = { L: demoted };
    apply(desk, plan(desk, { flagged: { L: { device: "phone", wasPrimary: true } }, edits: { L: { removed: true } } }).writes);
    const onPhone = mergeFrontingSession(live, desk.L);
    assert.equal(onPhone.is_active, false); assert.ok(onPhone.removed_at); assert.ok(onPhone.end_time);
  });
  test("the other device's live front kept with a new end becomes a real session on both", () => {
    const live = created({ id: "L", alter_id: "l", start_time: at(12, 9), is_active: true, is_primary: true, origin_device: "phone" }, at(12, 9));
    const demoted = { ...live, is_active: false, is_primary: false, end_time: live.start_time, sync_demoted: true };
    const desk = { L: demoted };
    apply(desk, plan(desk, { flagged: { L: { device: "phone", wasPrimary: true } }, edits: { L: { end_time: at(12, 11) } } }).writes);
    assert.ok(!desk.L.sync_demoted); assert.equal(desk.L.end_time, at(12, 11));
    const onPhone = mergeFrontingSession(live, desk.L);
    assert.equal(onPhone.is_active, false); assert.equal(onPhone.end_time, at(12, 11));
  });
  test("keeping both live fronts leaves one primary", () => {
    const theirs = created({ id: "T", alter_id: "t", start_time: at(12, 9), is_active: true, is_primary: true, origin_device: "phone" }, at(12, 9));
    const desk = {
      T: { ...theirs, is_active: false, is_primary: false, end_time: theirs.start_time, sync_demoted: true },
      M: created({ id: "M", alter_id: "m", start_time: at(12, 10), is_active: true, is_primary: true, origin_device: "desk" }, at(12, 10)),
    };
    apply(desk, plan(desk, { flagged: { T: { device: "phone", wasPrimary: true } } }).writes);
    assert.equal(desk.T.is_active, true); assert.equal(desk.M.is_active, true);
    assert.equal([desk.T, desk.M].filter((s) => s.is_primary).length, 1);
  });
}

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

console.log("home boards (page by page)");
{
  const pg = (id, w, ut) => ({ id, label: id, widgets: [w], ...(ut ? { _ut: ut } : {}) });
  test("pages added on different devices both survive", () => {
    const a = { pages: [pg("p1", "clock"), pg("pa", "a", T(5))], grid: { phoneCols: 4 } };
    const b = { pages: [pg("p1", "clock"), pg("pb", "b", T(6))], grid: { phoneCols: 5 } };
    const m = mergeBoards(a, b, T(5), T(6));
    assert.deepEqual(m.pages.map((p) => p.id).sort(), ["p1", "pa", "pb"]);
    assert.equal(m.grid.phoneCols, 5); // board settings from the newer board
  });
  test("the same page keeps its newest edit, whichever board is newer", () => {
    const a = { pages: [pg("p1", "edited-on-a", T(9))] };
    const b = { pages: [pg("p1", "edited-on-b", T(3)), pg("p2", "x", T(10))] };
    const m = mergeBoards(a, b, T(9), T(10));
    assert.equal(m.pages.find((p) => p.id === "p1").widgets[0], "edited-on-a");
  });
  test("a page deleted after its last change stays deleted", () => {
    const a = { pages: [pg("p1", "x", T(1))], _removedPages: { p2: T(8) } };
    const b = { pages: [pg("p1", "x", T(1)), pg("p2", "old", T(2))] };
    const m = mergeBoards(a, b, T(8), T(2));
    assert.deepEqual(m.pages.map((p) => p.id), ["p1"]);
    assert.ok(m._removedPages.p2);
  });
  test("a page changed after it was deleted elsewhere comes back", () => {
    const a = { pages: [pg("p1", "x", T(1))], _removedPages: { p2: T(4) } };
    const b = { pages: [pg("p1", "x", T(1)), pg("p2", "kept-editing", T(7))] };
    const m = mergeBoards(a, b, T(4), T(7));
    assert.ok(m.pages.some((p) => p.id === "p2"));
    assert.equal(m._removedPages, undefined);
  });
  test("untimed pages fall back to their board's time", () => {
    const a = { pages: [pg("p1", "older")] };
    const b = { pages: [pg("p1", "newer")] };
    assert.equal(mergeBoards(a, b, T(1), T(2)).pages[0].widgets[0], "newer");
    assert.equal(mergeBoards(a, b, T(3), T(2)).pages[0].widgets[0], "older");
  });
  test("SystemSettings merges both board fields page by page", () => {
    const local = { id: "s", ui_v2_home: { pages: [pg("pa", "a", T(5))] }, classic_home: { pages: [pg("c1", "c", T(1))] }, _ft: { __base: T(0), ui_v2_home: T(5), classic_home: T(1) }, updated_date: T(5) };
    const incoming = { id: "s", ui_v2_home: { pages: [pg("pb", "b", T(6))] }, classic_home: { pages: [pg("c1", "c", T(1)), pg("c2", "d", T(2))] }, _ft: { __base: T(0), ui_v2_home: T(6), classic_home: T(2) }, updated_date: T(6) };
    const m = mergeForEntity("SystemSettings", local, incoming);
    assert.deepEqual(m.ui_v2_home.pages.map((p) => p.id).sort(), ["pa", "pb"]);
    assert.deepEqual(m.classic_home.pages.map((p) => p.id).sort(), ["c1", "c2"]);
  });
}

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}`);
