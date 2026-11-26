#!/usr/bin/env node
// The house's Timeline room (plan step 3.3, boards 01-Main, 08-Phone and
// 09-TimelineOptions): the views (a day, six hours, a week), the arrows and
// "Now", the ruler, days put together, Whose, the addresses that land on
// the timeline, the new layers (Meds taken, Everything else) and the
// per-device prefs (shared layers, per-page Show and Whose, colours, Reset
// with Undo). Pure: storage is an in-memory stand-in; nothing real is written.
//
//   node scripts/test-house-timeline.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(src)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
globalThis.localStorage = memStore();
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const V = await import("../src/house/day/dayView.js");
const L = await import("../src/house/home/dayLayers.js");
const P = await import("../src/house/home/layerPrefs.js");
const S = await import("../src/lib/houseSwitch.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m); // November 2026; the 20th is a Friday
const now = at(20, 16, 45);

test("a day: midnight to midnight; arrows move a day; Now comes back", () => {
  const a = V.nowAnchor("day", now);
  const w = V.viewWindow("day", a);
  assert.equal(new Date(w.start).getDate(), 20);
  assert.equal(new Date(w.end).getDate(), 21);
  const back = V.stepAnchor("day", a, -1);
  assert.equal(new Date(back).getDate(), 19);
  assert.equal(V.holdsNow("day", back, now), false);
  assert.equal(V.holdsNow("day", a, now), true);
  assert.deepEqual(V.rulerTicks("day", w).filter((t) => t.left > 0 && t.left < 100).map((t) => t.at.getHours()), [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
});

test("six hours: from the hour before now; arrows move six hours; another day opens at 8", () => {
  const a = V.nowAnchor("hours6", now);
  const w = V.viewWindow("hours6", a);
  assert.equal(new Date(w.start).getHours(), 16);
  assert.equal((w.end - w.start) / 3600000, 6);
  assert.equal(new Date(V.stepAnchor("hours6", a, 1)).getHours(), 22);
  assert.equal(new Date(V.anchorForDay("hours6", at(18, 0), now)).getHours(), 8);
  assert.equal(V.rulerTicks("hours6", w).length, 7);
});

test("a week starts on the person's week start and its ruler is days", () => {
  const mon = V.viewWindow("week", V.nowAnchor("week", now, 1), 1);
  assert.equal(new Date(mon.start).getDay(), 1);
  assert.equal(new Date(mon.start).getDate(), 16);
  const sun = V.viewWindow("week", V.nowAnchor("week", now, 0), 0);
  assert.equal(new Date(sun.start).getDate(), 15);
  assert.equal(V.daysOf(mon).length, 7);
  assert.ok(V.rulerTicks("week", mon).every((t) => t.day));
  assert.equal(new Date(V.stepAnchor("week", mon.start, -1, 1)).getDate(), 9);
});

test("changing range keeps the day being looked at (or now)", () => {
  const past = V.anchorForDay("day", at(12, 0), now);
  assert.equal(new Date(V.switchRange("day", past, "week", now, 1)).getDate(), 9, "the week holding the 12th");
  assert.equal(new Date(V.switchRange("day", V.nowAnchor("day", now), "hours6", now)).getHours(), 16, "today: around now");
});

test("days put together: rows kept once, events kept per day, routines from the last day", () => {
  const s1 = { dateStr: "2026-11-19", hasData: true, sessions: [{ id: "s" }], emotions: [{ id: "e1" }], plannerEvents: [{ event: { id: "pay" } }], dailyProgress: { id: "p19" } };
  const s2 = { dateStr: "2026-11-20", hasData: false, sessions: [{ id: "s" }], emotions: [{ id: "e2" }], plannerEvents: [{ event: { id: "pay" } }], dailyProgress: { id: "p20" } };
  const m = V.mergeSlices([s1, s2]);
  assert.deepEqual(m.sessions.map((x) => x.id), ["s"], "a session over midnight is one row");
  assert.deepEqual(m.emotions.map((x) => x.id), ["e1", "e2"]);
  assert.equal(m.plannerEvents.length, 2);
  assert.equal(m.dailyProgress.id, "p20");
  assert.equal(m.hasData, true);
  const ev = V.weekEventItems([s1, s2]);
  assert.equal(ev.length, 2);
  assert.equal(new Date(ev[1].start).getDate(), 20);
});

test("Whose: one alter's fronting and the records that name them; dates stay", () => {
  const slice = {
    sessions: [{ id: "a", alter_id: "ash" }, { id: "r", alter_id: "river" }, { id: "g", primary_alter_id: "river", co_fronter_ids: ["ash"] }],
    emotions: [{ id: "e1", fronting_alter_ids: ["ash"] }, { id: "e2", fronting_alter_ids: ["river"] }, { id: "e3" }],
    statusNotes: [{ id: "n1", author_alter_ids: ["ash"] }, { id: "n2" }],
    journals: [{ id: "j1", author_alter_id: "ash" }, { id: "j2", author_alter_id: "river" }],
    lineageEvents: [{ id: "l1", source_alter_ids: ["ash"], result_alter_ids: [] }],
    plannerEvents: [{ event: { id: "pay" } }],
    activities: [{ id: "x", alter_id: "ash" }, { id: "y" }],
  };
  const f = V.filterWhose(slice, "ash");
  assert.deepEqual(f.sessions.map((s) => s.id), ["a", "g"]);
  assert.deepEqual(f.sessions[1].co_fronter_ids, [], "a grouped row draws only this one");
  assert.equal(f.sessions[1].primary_alter_id, "ash");
  assert.deepEqual(f.emotions.map((e) => e.id), ["e1"]);
  assert.deepEqual(f.statusNotes.map((e) => e.id), ["n1"]);
  assert.deepEqual(f.journals.map((e) => e.id), ["j1"]);
  assert.deepEqual(f.lineageEvents.map((e) => e.id), ["l1"]);
  assert.deepEqual(f.activities.map((e) => e.id), ["x"]);
  assert.equal(f.plannerEvents.length, 1);
  assert.equal(V.filterWhose(slice, null), slice, "everyone: unchanged");
  assert.equal(slice.sessions[2].co_fronter_ids.length, 1, "the records themselves are never changed");
});

test("addresses that land on the timeline", () => {
  const l = V.landingFrom("?date=2026-11-12&focusSessionId=s1&edit=1&view=week");
  assert.equal(l.date.getDate(), 12);
  assert.equal(l.view, "week");
  assert.equal(l.edit, true);
  assert.equal(V.landingFrom("?date=2026-02-31").date, null, "an impossible date is ignored");
  assert.equal(V.landingFrom("").any, false);
  const sessions = [{ id: "s1", alter_id: "ash", start_time: at(12, 9).toISOString() }];
  const r = V.resolveLanding(l, { sessions }, (id) => id.toUpperCase());
  assert.equal(r.day.getDate(), 12);
  assert.equal(r.pick.ref.type, "session");
  assert.equal(r.pick.label, "ASH");
  assert.equal(r.edit, true);
  const st = V.resolveLanding(V.landingFrom("?highlightStatus=n1"), { statusNotes: [{ id: "n1", timestamp: at(18, 9).toISOString() }] });
  assert.equal(st.day.getDate(), 18);
  assert.equal(st.pick.ref.type, "status");
  const miss = V.resolveLanding(V.landingFrom("?focusSessionId=gone&date=2026-11-03"), { sessions });
  assert.equal(miss.day.getDate(), 3, "an unknown session falls back to the date");
  assert.deepEqual([...V.LANDING_PARAMS], ["focusSessionId", "edit", "highlightStatus"]);
});

test("times typed on a day", () => {
  assert.equal(new Date(V.timeOnDay(at(20, 0), "09:30")).getHours(), 9);
  assert.equal(V.timeOnDay(at(20, 0), "9:30"), null);
  assert.equal(V.hhmmOf(at(20, 9, 37), 15), "09:30");
});

test("new layers: Meds taken and Everything else (never quoting a private note)", () => {
  const slice = {
    doses: [{ id: "d1", medication_id: "m", timestamp: at(20, 9).toISOString(), status: "taken" }, { id: "d2", medication_id: "m", timestamp: at(20, 21).toISOString(), status: "skipped" }],
    alterNotes: [{ id: "an", alter_id: "ash", content: "private words", created_date: at(20, 10).toISOString() }],
    tasks: [{ id: "t", title: "Call", created_date: at(20, 8).toISOString(), completed: true, completed_date: at(20, 11).toISOString() }],
    bulletins: [{ id: "b", content: 'Hi <span class="whisper" data-whisper-for="river">secret</span>', created_date: at(20, 12).toISOString() }],
    lineageEvents: [{ id: "l", type: "split", date: at(20, 0).toISOString() }],
  };
  const lanes = L.buildDayLanes(slice, { medications: { m: { name: "Sertraline" } }, nameOf: (id) => (id === "ash" ? "Ash" : ""), terms: { System: "Crew" } });
  const more = lanes.groups.find((g) => g.id === "more");
  assert.deepEqual(more.rows.find((r) => r.id === "meds").items.map((i) => i.label), ["Sertraline"], "skipped doses aren't 'taken'");
  const other = more.rows.find((r) => r.id === "other").items;
  assert.ok(other.some((i) => i.label === "Note on Ash"));
  assert.ok(!other.some((i) => /private words|secret/.test(i.label)), "no private words in a label");
  assert.ok(other.some((i) => i.label === "Done: Call"));
  assert.ok(other.some((i) => i.label === "Split"));
  assert.equal(L.otherKindPage("alter_note", { alter_id: "ash" }), "/alter/ash");
  assert.equal(L.otherKindPage("bulletin", {}), "/bulletins");
});

test("prefs: a saved list older than a layer keeps that layer's default", () => {
  const old = memStore({ [P.HOUSE_HOME_LAYERS_KEY]: JSON.stringify({ hidden: ["sleep"] }) });
  assert.deepEqual(P.readHiddenLayers(old).sort(), ["meds", "other", "sleep"]);
  P.setLayerShown("meds", true, old);
  assert.deepEqual(P.readHiddenLayers(old).sort(), ["other", "sleep"], "once shown, it stays shown");
  assert.ok(JSON.parse(old.getItem(P.HOUSE_HOME_LAYERS_KEY)).seen.includes("other"));
});

test("prefs: Show and Whose are per page; layers are shared", () => {
  const s = memStore();
  assert.deepEqual(P.readTimelineView("home", s), { range: "day", whose: null });
  assert.deepEqual(P.readTimelineView("homePhone", s), { range: "hours6", whose: null });
  assert.deepEqual(P.readTimelineView("timeline", s), { range: "day", whose: null });
  P.setTimelineView("timeline", { range: "week", whose: "ash" }, s);
  assert.deepEqual(P.readTimelineView("timeline", s), { range: "week", whose: "ash" });
  assert.deepEqual(P.readTimelineView("home", s), { range: "day", whose: null }, "the other page keeps its own");
  P.setTimelineView("timeline", { whose: null }, s);
  assert.deepEqual(P.readTimelineView("timeline", s), { range: "week", whose: null });
  assert.equal(P.setTimelineView("nowhere", { range: "day" }, s), null);
  P.setTimelineView("timeline", { range: "month" }, s);
  assert.equal(P.readTimelineView("timeline", s).range, "week", "an unknown range is ignored");
});

test("prefs: layer colours, Reset content and its Undo", () => {
  const s = memStore();
  P.setLayerShown("sleep", false, s);
  assert.deepEqual(P.setLayerColour("planned", "#ff8800", s), { planned: "#ff8800" });
  assert.equal(P.setLayerColour("planned", "red", s), null, "only #rrggbb");
  P.setTimelineView("timeline", { range: "week" }, s);
  const { ok, before } = P.resetTimelinePrefs("timeline", s);
  assert.equal(ok, true);
  assert.deepEqual(P.readLayerColours(s), {});
  assert.deepEqual(P.readHiddenLayers(s).sort(), [...L.DEFAULT_HIDDEN_LAYERS].sort());
  assert.equal(P.readTimelineView("timeline", s).range, "day");
  assert.equal(P.restoreTimelinePrefs(before, s), true);
  assert.deepEqual(P.readLayerColours(s), { planned: "#ff8800" });
  assert.ok(P.readHiddenLayers(s).includes("sleep"));
  assert.equal(P.readTimelineView("timeline", s).range, "week");
});

test("the Timeline room is drawn by the house only on /timeline", () => {
  assert.equal(S.houseTimelineRoom("/timeline"), true);
  assert.equal(S.houseTimelineRoom("/timeline/"), true);
  assert.equal(S.houseTimelineRoom("/timelines"), false);
  assert.equal(S.houseRebuiltRoom("/timeline"), true);
  assert.equal(S.houseRebuiltRoom("/grounding"), true);
  assert.equal(S.houseRebuiltRoom("/medications"), false);
  assert.match(read("src/App.jsx"), /path="\/timeline" element=\{<HouseRoomGate><Timeline \/><\/HouseRoomGate>\}/);
});

test("the room writes only through the existing write paths", () => {
  const files = ["src/house/timeline/HouseTimeline.jsx", "src/house/day/DayParts.jsx", "src/house/day/DaySheets.jsx"];
  for (const f of files) {
    const text = read(f);
    assert.ok(!/(entities|localEntities|base44)\b[^;]*\.(create|update|delete|bulkDelete)\(/.test(text.replace(/\/\/.*$/gm, "")), `${f} writes a record directly`);
  }
  const sheets = read("src/house/day/DaySheets.jsx");
  for (const fn of ["splitFrontSession", "addPastFrontSessions", "removeFrontSession", "endFrontSession", "reassignFrontSession", "undoFrontReassign"]) {
    assert.ok(sheets.includes(fn), `DaySheets uses ${fn}`);
  }
});

console.log(`\n${passed} passed.`);
