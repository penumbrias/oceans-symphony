#!/usr/bin/env node
// The house's Home room (the approved mockups, boards 01-Main and 08-Phone):
// today's plans, the guide's one item, windows and spans, the day's lanes,
// per-device layer prefs, the Home room's pages, and the house defaults
// (pixel look, pixel palette, Atkinson under Pixelify). Pure: storage is an
// in-memory stand-in; nothing real is written.
//
//   node scripts/test-house-home.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

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

const H = await import("../src/house/home/homeModel.js");
const L = await import("../src/house/home/dayLayers.js");
const P = await import("../src/house/home/layerPrefs.js");
const S = await import("../src/lib/houseSwitch.js");
const R = await import("../src/house/tokens/roles.js");
const T = await import("../src/house/paint/translate.js");
const { BACKUP_LS_KEYS } = await import("../src/lib/backupKeys.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };

const at = (h, m = 0) => { const d = new Date(2026, 10, 20, h, m); return d; };
const iso = (h, m = 0) => at(h, m).toISOString();
const now = at(16, 45);

test("today's plans: events, then open plans to resolve, then the next to start, then the rest", () => {
  const acts = [
    { id: "lunch", activity_name: "Lunch", timestamp: iso(12, 30), status: "scheduled" },
    { id: "walk", activity_name: "Walk", duration_minutes: 20, timestamp: iso(17), status: "scheduled" },
    { id: "jrnl", activity_name: "Journal before bed", timestamp: iso(21), status: "scheduled" },
    { id: "done", activity_name: "Meds", timestamp: iso(8), status: "done" },
    { id: "untimed", activity_name: "Laundry", planned_date: "2026-11-20", status: "scheduled" },
    { id: "tomorrow", activity_name: "Tomorrow", timestamp: new Date(2026, 10, 21, 9).toISOString(), status: "scheduled" },
    { id: "gone", activity_name: "Trashed", timestamp: iso(18), status: "scheduled", trashed_at: "x" },
  ];
  const items = H.todayPlanItems({ activities: acts, events: [{ event: { id: "pay", title: "Payday" } }], now, title: H.planTitle });
  assert.deepEqual(items.map((i) => [i.kind, i.title, i.action || null]), [
    ["event", "Payday", null],
    ["open", "Lunch", "resolve"],
    ["next", "Walk, 20 min", "start"],
    ["planned", "Journal before bed", null],
    ["planned", "Laundry", null],
  ]);
});

test("the guide asks about the oldest open plan, else greets", () => {
  const items = H.todayPlanItems({ activities: [
    { id: "a", activity_name: "A", timestamp: iso(13), status: "scheduled" },
    { id: "b", activity_name: "B", timestamp: iso(10), status: "scheduled" },
  ], now });
  assert.equal(H.guideItem(items).activity.id, "b");
  assert.equal(H.guideItem([]), null);
});

test("plan titles carry the planned length", () => {
  assert.equal(H.planTitle({ activity_name: "Walk", duration_minutes: 20 }), "Walk, 20 min");
  assert.equal(H.planTitle({ activity_name: "Hike", duration_minutes: 90 }), "Hike, 1 h 30 min");
  assert.equal(H.planTitle({ activity_name: "Tea" }), "Tea");
});

test("windows, spans and ticks", () => {
  const win = H.nextHoursWindow(now, 6);
  assert.equal(new Date(win.start).getHours(), 16);
  assert.deepEqual(H.spanIn(win, at(16), at(17, 30)), { left: 0, width: 25 });
  assert.equal(H.spanIn(win, at(8), at(9)), null, "outside the window");
  assert.deepEqual(H.spanIn(win, at(21), null, { minWidth: 2 }), { left: 83.33, width: 2 });
  const day = H.dayWindow(now);
  assert.deepEqual(H.hourTicks(day, 6).map((t) => t.at.getHours()), [0, 6, 12, 18, 0]);
});

test("latest status and routine rows", () => {
  assert.equal(H.latestStatus([{ id: 1, note: "a", timestamp: "2026-11-20T08:00:00Z" }, { id: 2, note: "b", timestamp: "2026-11-20T12:00:00Z" }, { id: 3, note: "c", timestamp: "2026-11-20T13:00:00Z", trashed_at: "x" }]).id, 2);
  assert.equal(H.latestStatus([]), null);
  const rows = H.routineRows([{ id: "m", mode: "AUTO", sort_order: 1 }, { id: "w", mode: "MANUAL", sort_order: 2 }, { id: "off", is_active: false }], { isDone: (t) => t.id === "m" });
  assert.deepEqual(rows.map((r) => [r.template.id, r.how, r.done]), [["w", "tap", false], ["m", "auto", true]]);
});

test("the day's lanes: fronting per alter, plans split, check-ins, whispers masked", () => {
  const slice = {
    sessions: [{ id: "s1", alter_id: "ash", start_time: iso(9, 12) }, { id: "s2", alter_id: "river", start_time: iso(11, 40) }, { id: "s0", alter_id: "jun", start_time: iso(6, 40), end_time: iso(9, 12) }],
    activities: [
      { id: "lunch", activity_name: "Lunch", timestamp: iso(12, 30), status: "scheduled", duration_minutes: 30 },
      { id: "tea", activity_name: "Tea", timestamp: iso(11), status: "logged" },
      { id: "meds", activity_name: "Meds", timestamp: iso(8), status: "done" },
    ],
    emotions: [{ id: "e1", timestamp: iso(9, 30), emotions: ["calm"] }],
    statusNotes: [{ id: "n1", timestamp: iso(12, 5), note: 'Hi <span class="whisper" data-whisper-for="river">secret plan</span>' }],
    plannerEvents: [{ event: { id: "pay", title: "Payday" } }],
    sleeps: [], symptomSessions: [], symptomCheckIns: [], locations: [], journals: [],
  };
  const lanes = L.buildDayLanes(slice, { alters: { ash: { name: "Ash", color: "#7fb3a6" }, river: { name: "River" }, jun: { name: "Juniper" } }, now: now.getTime() });
  const fr = lanes.groups.find((g) => g.id === "fronting");
  assert.deepEqual(fr.rows.map((r) => r.label), ["Juniper", "Ash", "River"]);
  const plans = lanes.groups.find((g) => g.id === "plans");
  assert.deepEqual(plans.rows.map((r) => [r.id, r.items.map((i) => `${i.label}:${i.tone}`)]), [["planned", ["Lunch:open", "Meds:done"]], ["logged", ["Tea:logged"]]]);
  assert.deepEqual(lanes.allDay.map((a) => a.label), ["Payday"]);
  const st = lanes.groups.find((g) => g.id === "checkins").rows.find((r) => r.id === "statuses").items[0].label;
  assert.ok(!/secret/.test(st), `whisper leaked: ${st}`);
  const vis = L.visibleGroups(lanes, ["fronting", "locations", "journals"]);
  assert.ok(!vis.some((g) => g.id === "fronting"), "a hidden layer's group goes when it has no rows");
  assert.ok(!vis.some((g) => g.id === "more"));
});

test("layer prefs: defaults, one layer changed, unreadable value kept, backed up", () => {
  const s = memStore();
  assert.deepEqual(P.readHiddenLayers(s), ["locations", "journals"]);
  assert.deepEqual(P.setLayerShown("locations", true, s), ["journals"]);
  assert.deepEqual(P.setLayerShown("sleep", false, s).sort(), ["journals", "sleep"]);
  assert.equal(P.setLayerShown("nope", false, s), null);
  const bad = memStore({ [P.HOUSE_HOME_LAYERS_KEY]: "{oops" });
  assert.deepEqual(P.readHiddenLayers(bad), ["locations", "journals"]);
  P.setLayerShown("sleep", false, bad);
  assert.equal(bad.getItem(P.HOUSE_HOME_LAYERS_KEPT_KEY), "{oops", "the unreadable value is kept, not overwritten blind");
  assert.ok(BACKUP_LS_KEYS.includes(P.HOUSE_HOME_LAYERS_KEY));
  assert.equal(P.readLayerOrder(s)[0], "fronting");
  const ord = P.setLayerOrder(["sleep", "nope", "planned", "sleep"], s);
  assert.deepEqual(ord.slice(0, 3), ["sleep", "planned", "fronting"]);
  assert.deepEqual(P.readHiddenLayers(s).sort(), ["journals", "sleep"], "the order write keeps the hidden list");
});

test("layer order moves rows and groups", () => {
  const lanes = L.buildDayLanes({ sessions: [], activities: [], emotions: [{ id: "e", timestamp: iso(9), emotions: ["calm"] }], sleeps: [], statusNotes: [] }, { now: now.getTime() });
  const order = ["sleep", "feelings", "planned", "logged", "events", "fronting", "symptoms", "statuses", "locations", "journals"];
  const g = L.visibleGroups(lanes, [], order);
  assert.equal(g[0].id, "checkins");
  assert.deepEqual(g[0].rows.slice(0, 2).map((r) => r.id), ["sleep", "feelings"]);
});

test("the Home room's pages: ?page= picks Today · Me · Plans · board", () => {
  assert.equal(S.houseHomePage(""), "today");
  assert.equal(S.houseHomePage("?page=me"), "me");
  assert.equal(S.houseHomePage("?page=nope"), "today");
  assert.equal(S.isHouseHomeRoom("/", "?page=plans"), true);
  assert.equal(S.isHouseHomeRoom("/", "?page=board"), false, "the person's old board stays reachable");
  assert.equal(S.isHouseHomeRoom("/Home", ""), false, "/Home is the alters directory");
});

test("house defaults are the mockups' look; the person's picks win", () => {
  assert.equal(R.houseLookFromRow({}), "pixel");
  assert.equal(R.houseLookFromRow({ ui_look: "smooth" }), "smooth");
  const p = T.translatePaint({}, { device: {}, houseDefault: "pixel" });
  assert.equal(p.tokens.swatches.deep.toUpperCase(), "#1C1F31");
  assert.equal(p.tokens.swatches.accent.toUpperCase(), "#4CC3CF");
  assert.equal(p.tokens.swatches.wave.toUpperCase(), "#6E9BE0");
  const picked = T.translatePaint({}, { device: { selectedTheme: "cool" }, houseDefault: "pixel" });
  assert.equal(picked.tokens.source.name, "cool");
  const t = R.houseTokens(p, { look: "pixel" });
  assert.equal(t.fonts.labelIsPixel, true);
  assert.match(t.fonts.body, /^'Atkinson Hyperlegible'/);
  const atk = R.houseTokens(T.translatePaint({}, { device: { fontFamily: "'Atkinson Hyperlegible', sans-serif" } }), { look: "pixel" });
  assert.equal(atk.fonts.labelIsPixel, true, "Atkinson pairs with the pixel labels, as in the mockups");
  const easy = R.houseTokens(T.translatePaint({}, { device: { fontFamily: "'Atkinson Hyperlegible', sans-serif", fontBeforeEasyRead: "inter" } }), { look: "pixel" });
  assert.equal(easy.fonts.labelIsPixel, false, "easy-read mode still takes the pixel letters out");
  assert.ok(t.vars["--house-title"] && t.vars["--house-bevel-raised"]);
  assert.deepEqual(t.failures, []);
});

console.log(`\n${passed} passed.`);
