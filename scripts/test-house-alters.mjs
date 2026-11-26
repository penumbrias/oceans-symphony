#!/usr/bin/env node
// The house's Alters room (boards 03-Alters and 12-AlterProfilePhone): the
// directory's keys (shared with the old page), its views, sort, find,
// filters and nesting, the front lines and week bars, the groups tree,
// the status line, the profile's pages and the old ?tab= names that land on
// them, and the profile's plain-text pieces. Also: the room is drawn only
// on /Home and /alter/:id, the old pages are gated, the room writes only
// through the write paths, and its classes don't clash with the frame's.
// Pure: storage is an in-memory stand-in; nothing real is written.
//
//   node scripts/test-house-alters.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

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
globalThis.sessionStorage = memStore();
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const M = await import("../src/house/alters/altersModel.js");
const S = await import("../src/lib/houseSwitch.js");
const R = await import("../src/house/frame/roomTools.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const H = 3600e3;
const now = new Date(2026, 10, 20, 16, 0).getTime(); // a Friday
const iso = (ms) => new Date(ms).toISOString();
const terms = { alter: "part", alters: "parts", fronting: "out", system: "crew" };

const alters = [
  { id: "a", name: "Ash", pronouns: "they/them", role: "Host", custom_fields: { f1: "teal" } },
  { id: "b", name: "Bea", alias: "B", tags: ["artist"] },
  { id: "c", name: "Cal", is_archived: true },
  { id: "d", name: "Dov", groups: ["g1"] },
  { id: "e", name: "Eli" },
];
const groups = [
  { id: "g1", name: "Littles", member_sp_ids: ["d"] },
  { id: "s1", name: "Ash's crew", owner_alter_id: "a", member_sp_ids: ["e"] },
];

test("the directory reads the old page's keys; bad values fall back", () => {
  const p = M.readDirectoryPrefs({ session: memStore(), local: memStore() });
  assert.equal(p.layout, "5");
  assert.equal(p.sort, null);
  assert.deepEqual(p.filters, { ...M.DEFAULT_FILTERS });
  assert.equal(p.hideGrouped, false);
  const session = memStore({ alterGrid_sortMode: "most", alterGrid_filters: JSON.stringify({ nested: false, roles: ["Host"], mode: "all" }), pxa_groups_collapsed: "[\"g1\"]" });
  const local = memStore({ alter_display_mode: "list", alter_hide_grouped: "true" });
  const q = M.readDirectoryPrefs({ session, local });
  assert.equal(q.sort, "most");
  assert.equal(q.layout, "list");
  assert.equal(q.hideGrouped, true);
  assert.equal(q.filters.nested, false);
  assert.equal(q.filters.mode, "all");
  assert.deepEqual(q.folded, ["g1"]);
  const bad = M.readDirectoryPrefs({ session: memStore({ alterGrid_sortMode: "x", alterGrid_filters: "{nope" }), local: memStore({ alter_display_mode: "9" }) });
  assert.equal(bad.sort, null);
  assert.equal(bad.layout, "5");
  assert.deepEqual(bad.filters, { ...M.DEFAULT_FILTERS });
});

test("writing a preference uses the same keys", () => {
  const session = memStore(); const local = memStore();
  M.writeDirectoryPref({ session, local }, "sort", "alpha-desc");
  M.writeDirectoryPref({ session, local }, "layout", "3");
  M.writeDirectoryPref({ session, local }, "hideGrouped", true);
  M.writeDirectoryPref({ session, local }, "folded", ["g1"]);
  assert.equal(session.getItem("alterGrid_sortMode"), "alpha-desc");
  assert.equal(local.getItem("alter_display_mode"), "3");
  assert.equal(local.getItem("alter_hide_grouped"), "true");
  assert.equal(session.getItem("pxa_groups_collapsed"), "[\"g1\"]");
  const broken = { getItem() { throw new Error("off"); }, setItem() { throw new Error("off"); } };
  M.writeDirectoryPref({ session: broken, local: broken }, "sort", "most"); // never throws
  assert.equal(M.readDirectoryPrefs({ session: broken, local: broken }).layout, "5");
});

test("Grid · List · Tree is one radio over the stored layout and nesting", () => {
  assert.equal(M.viewOf("4", true), "grid");
  assert.equal(M.viewOf("list", true), "tree");
  assert.equal(M.viewOf("list", false), "list");
  assert.deepEqual(M.pickView("grid", { layout: "list", lastCols: "3" }), { layout: "3", nested: true });
  assert.deepEqual(M.pickView("grid", { layout: "2" }), { layout: "2", nested: true });
  assert.deepEqual(M.pickView("list", { layout: "4" }), { layout: "list", nested: false });
  assert.deepEqual(M.pickView("tree", { layout: "4" }), { layout: "list", nested: true });
});

test("sort labels use the person's words", () => {
  const o = M.sortOptions(terms);
  assert.deepEqual(o.map((x) => x.id), ["alpha-asc", "alpha-desc", "most", "least"]);
  assert.equal(o[2].label, "Most out time first");
  assert.equal(M.sortOptions(terms, { manual: true })[0].id, "manual");
});

test("front ranks, totals and last times read both session shapes", () => {
  const active = [{ alter_id: "b", is_primary: true }, { alter_id: "e" }, { primary_alter_id: "d", co_fronter_ids: ["e"] }];
  assert.deepEqual(M.frontRanks(active), { b: 0, e: 1, d: 0 });
  const done = [
    { alter_id: "a", start_time: iso(now - 5 * H), end_time: iso(now - 3 * H) },
    { primary_alter_id: "b", co_fronter_ids: ["a"], start_time: iso(now - 30 * H), end_time: iso(now - 29 * H) },
    { alter_id: "e", start_time: iso(now - H) }, // live: no total
  ];
  assert.deepEqual(M.frontTotals(done), { a: 3 * H, b: H });
  assert.deepEqual(M.lastFrontTimes(done), { a: now - 3 * H, b: now - 29 * H });
  assert.deepEqual(M.frontLine("b", { ranks: { b: 0 }, terms }), { words: "out", on: true });
  assert.deepEqual(M.frontLine("e", { ranks: { e: 1 }, terms }), { words: "co-out", on: true });
  assert.equal(M.frontLine("a", { last: { a: now - 3 * H }, now }).words, "3 h ago");
  assert.equal(M.frontLine("z", {}).words, "");
  assert.equal(M.agoWords(now - 30 * H, now), "yesterday");
  assert.equal(M.agoWords(now - 10 * 24 * H, now), "last week");
  assert.equal(M.agoWords(now + H, now), "");
});

test("the week: seven days, today last, bars as parts of each day, a night split across two", () => {
  const sessions = [
    { alter_id: "a", start_time: iso(now - 2 * H), end_time: iso(now - H) },
    { alter_id: "a", start_time: iso(now - 1.5 * H), end_time: iso(now - 0.5 * H) }, // overlaps: merged
    { alter_id: "a", start_time: new Date(2026, 10, 18, 22).toISOString(), end_time: new Date(2026, 10, 19, 2).toISOString() },
    { alter_id: "b", start_time: iso(now - 2 * H), end_time: iso(now - H) },
  ];
  const w = M.weekOf("a", sessions, now);
  assert.equal(w.length, 7);
  assert.equal(w[6].name, "Fri");
  assert.equal(w[6].bars.length, 1);
  assert.ok(Math.abs(w[6].hours - 1.5) < 1e-9, "overlapping rows count once");
  assert.equal(w[4].name, "Wed");
  assert.ok(Math.abs(w[4].hours - 2) < 1e-9);
  assert.ok(Math.abs(w[5].hours - 2) < 1e-9);
  assert.equal(w[4].bars[0].to, 1);
  const mon = M.weekOf("a", sessions, now, { from: "monday" });
  assert.deepEqual(mon.map((d) => d.name), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "boards 03 and 12 run Mon to Sun");
  assert.ok(Math.abs(mon[4].hours - 1.5) < 1e-9, "Friday is today");
  assert.ok(Math.abs(mon[2].hours - 2) < 1e-9);
  assert.equal(mon[5].future, true);
  assert.equal(mon[5].hours, 0, "days still to come are empty");
  const live = M.weekOf("a", [{ alter_id: "a", start_time: iso(now - H) }], now, { from: "monday" });
  assert.equal(live[5].hours, 0, "a live session never runs into tomorrow");
  assert.equal(M.hoursWords(0), "0 h");
  assert.equal(M.hoursWords(0.5), "30 min");
  assert.equal(M.hoursWords(31.4), "31 h");
});

test("Find: every word, quotes keep a phrase, fields and tags count", () => {
  const fields = [{ id: "f1", name: "Colour" }];
  assert.ok(M.matchesFind(alters[0], "ash host", fields));
  assert.ok(M.matchesFind(alters[0], "teal", fields));
  assert.ok(!M.matchesFind(alters[0], "teal", []));
  assert.ok(M.matchesFind(alters[1], "artist", fields));
  assert.ok(M.matchesFind(alters[0], "\"they/them\"", fields));
  assert.ok(!M.matchesFind(alters[0], "ash bea", fields));
  assert.ok(M.matchesFind(alters[0], "", fields));
});

test("the list: archived hidden, fronters lead, sorts, sub-system members nest under their owner", () => {
  const ranks = { e: 0 };
  const r = M.directoryList({ alters, groups, ranks, sort: "alpha-asc" });
  assert.ok(!r.visible.some((a) => a.id === "c"), "archived never listed");
  assert.equal(r.flat, false);
  assert.deepEqual(r.visible.map((a) => a.id), ["a", "b", "d"], "Eli is inside Ash's sub-system");
  const flat = M.directoryList({ alters, groups, ranks, filters: { ...M.DEFAULT_FILTERS, nested: false } });
  assert.deepEqual(flat.visible.map((a) => a.id), ["e", "a", "b", "d"], "fronters lead");
  const desc = M.directoryList({ alters, groups, sort: "alpha-desc", filters: { ...M.DEFAULT_FILTERS, nested: false } });
  assert.deepEqual(desc.visible.map((a) => a.id), ["e", "d", "b", "a"]);
  const most = M.directoryList({ alters, groups, sort: "most", totals: { b: 5, a: 2 }, filters: { ...M.DEFAULT_FILTERS, nested: false } });
  assert.deepEqual(most.visible.slice(0, 2).map((a) => a.id), ["b", "a"]);
  const hide = M.directoryList({ alters, groups, hideGrouped: true, filters: { ...M.DEFAULT_FILTERS, nested: false } });
  assert.ok(!hide.visible.some((a) => a.id === "d" || a.id === "e"));
  const found = M.directoryList({ alters, groups, search: "eli" });
  assert.equal(found.flat, true);
  assert.deepEqual(found.visible.map((a) => a.id), ["e"]);
});

test("picking a group filters to its members; picking it again clears", () => {
  let f = M.filtersForGroup(M.DEFAULT_FILTERS, groups[0]);
  assert.deepEqual(f.groupIds, ["g1"]);
  assert.equal(M.pickedGroupId(f), "g1");
  assert.deepEqual(M.directoryList({ alters, groups, filters: f }).visible.map((a) => a.id), ["d"]);
  f = M.filtersForGroup(f, groups[0]);
  assert.equal(M.pickedGroupId(f), null);
  const sub = M.filtersForGroup(M.DEFAULT_FILTERS, groups[1]);
  assert.deepEqual(sub.subsystemIds, ["s1"]);
  assert.deepEqual(sub.groupIds, []);
});

test("the groups tree folds a branch and keeps its siblings", () => {
  const tree = [{ id: "x", _depth: 0 }, { id: "x1", _depth: 1 }, { id: "x2", _depth: 2 }, { id: "y", _depth: 0 }];
  assert.equal(M.groupRows(tree).length, 4);
  const shut = M.groupRows(tree, ["x"]);
  assert.deepEqual(shut.map((r) => r.g.id), ["x", "y"]);
  assert.equal(shut[0].hasKids, true);
  assert.equal(shut[0].open, false);
  assert.deepEqual(M.groupRows(tree, ["x1"]).map((r) => r.g.id), ["x", "x1", "y"]);
});

test("the status line counts in the person's words", () => {
  assert.deepEqual(M.statusWords({ alters, ranks: { a: 0, b: 1 }, groups, terms }), ["4 parts", "2 out", "1 group, 1 subcrew"]);
  assert.equal(M.statusWords({ alters: [alters[0]], groups: [], terms })[0], "1 part");
});

test("the profile's pages, and every old ?tab= name lands somewhere", () => {
  assert.deepEqual([...M.PROFILE_TABS], ["profile", "notes", "fronting", "links"]);
  assert.deepEqual(M.profileTabOf(null), { tab: "profile" });
  assert.deepEqual(M.profileTabOf("history"), { tab: "fronting" });
  assert.deepEqual(M.profileTabOf("relationships"), { tab: "links" });
  assert.deepEqual(M.profileTabOf("lineage"), { tab: "links" });
  assert.deepEqual(M.profileTabOf("info"), { tab: "fields" });
  assert.deepEqual(M.profileTabOf("private-messages"), { tab: "inbox" });
  assert.deepEqual(M.profileTabOf("messages", { newLayout: true }), { tab: "inbox" });
  assert.deepEqual(M.profileTabOf("messages", { newLayout: false }), { tab: "board" });
  assert.deepEqual(M.profileTabOf("wishlist"), { tab: "wishes" });
  assert.deepEqual(M.profileTabOf("my-own-page"), { tab: "layout", pageTab: "my-own-page" });
  assert.deepEqual(M.profileTabOf("notes", { view: "layout" }), { tab: "layout", pageTab: "notes" });
  for (const nl of [true, false]) {
    for (const t of M.ALL_PROFILE_TABS) {
      const back = M.profileTabOf(M.tabParamOf(t, { newLayout: nl }), { newLayout: nl });
      assert.equal(back.tab, t, `${t} survives a round trip (newLayout ${nl})`);
    }
  }
});

test("profile pieces: filled fields, the line under the name, the bio as paragraphs, neighbours", () => {
  const fields = [{ id: "f1", name: "Colour" }, { id: "f2", name: "Hidden", is_visible: false }, { id: "f3", name: "Likes cats", field_type: "boolean" }];
  const a = { custom_fields: { f1: "<b>teal</b>", f2: "x", f3: "true", _field_order: ["f3", "f1"] }, alter_custom_fields: [{ name: "Own", value: "mine" }, { name: "Bio", value: "x", from_bio: true }] };
  assert.deepEqual(M.filledFields(a, fields).map((f) => [f.label, f.value]), [["Likes cats", "Yes"], ["Colour", "teal"], ["Own", "mine"]]);
  assert.equal(M.subLine({ pronouns: "she/her", age: 30 }), "she/her  ·  30");
  assert.deepEqual(M.bioParagraphs("<p>One &amp; two</p><p>Three<br>Four</p>"), ["One & two", "Three", "Four"]);
  assert.deepEqual(M.bioParagraphs(""), []);
  assert.equal(M.bioParagraphs("%5B%7B"), null);
  const n = M.neighbours(alters, "b");
  assert.equal(n.prev.id, "a");
  assert.equal(n.next.id, "d", "archived Cal is skipped");
  assert.equal(M.neighbours(alters, "a").prev, null);
});

test("feels lately: their check-ins, newest first, each feeling once, recent only", () => {
  const ci = [
    { timestamp: iso(now - H), fronting_alter_ids: ["a"], emotions: ["Calm", "tired"] },
    { timestamp: iso(now - 2 * H), alter_id: "a", emotions: ["calm", "happy", "proud"] },
    { timestamp: iso(now - 3 * H), fronting_alter_ids: ["b"], emotions: ["angry"] },
    { timestamp: iso(now - 30 * 24 * H), alter_id: "a", emotions: ["old"] },
  ];
  assert.deepEqual(M.feelsLately(ci, "a", { now }), ["calm", "tired", "happy"]);
  assert.deepEqual(M.feelsLately(ci, "z", { now }), []);
});

test("the Alters room is drawn by the house only on /Home and /alter/:id", () => {
  assert.equal(S.houseAltersRoom("/Home"), "directory");
  assert.equal(S.houseAltersRoom("/Home/"), "directory");
  assert.equal(S.houseAltersRoom("/"), null, "/ is the home screen, not the directory");
  assert.equal(S.houseAltersRoom("/home"), null);
  assert.equal(S.houseAltersRoom("/alter/abc"), "profile");
  assert.equal(S.houseAltersRoom("/alter/abc/x"), null);
  assert.equal(S.houseAltersRoom("/alters"), null);
  assert.equal(M.altersRoomOf("/alter/abc"), S.houseAltersRoom("/alter/abc"));
  assert.equal(S.houseRebuiltRoom("/Home"), true);
  assert.equal(S.houseRebuiltRoom("/alter/abc"), true);
  const app = read("src/App.jsx");
  assert.match(app, /path="\/Home" element=\{<HouseRoomGate><Home \/><\/HouseRoomGate>\}/);
  assert.match(app, /path="\/alter\/:id" element=\{<HouseRoomGate><AlterProfile \/><\/HouseRoomGate>\}/);
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("<HouseAlters ") && t.includes("<HouseAlterProfile "), `${f} draws both rooms`);
  }
  assert.ok(/altersRoom( \|\| writeRoom)?( \|\| notebookRoom)?( \|\| settingsRoom)?( \|\| mapRoom)?( \|\| analyticsRoom)?( \|\| remindersRoom)?( \|\| friendsRoom)? \? "px-0"/.test(read("src/house/phone/HousePhoneFrame.jsx")), "the phone room runs edge to edge");
});

test("the person's own layout stays reachable inside the room", () => {
  const p = read("src/house/alters/HouseAlterProfile.jsx");
  assert.ok(p.includes("<AlterProfile"), "the old profile (their layout) is mounted under Your own layout");
  assert.ok(p.includes("openProfileLayoutEditor"), "Edit page opens their layout's editor");
  assert.ok(!/profileBoardStore|ProfileBoard\.(create|update)/.test(p), "the room never writes a ProfileBoard row");
});

test("the room writes only through the write paths", () => {
  const dir = "src/house/alters";
  const files = [...readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`), "src/house/frame/roomTools.js"];
  for (const f of files) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/(entities|localEntities|base44)\b[^;]*\.(create|update|delete|bulkDelete)\(/.test(text), `${f} writes a record directly`);
    assert.ok(!/FrontingSession\.(create|update)/.test(text), `${f} touches a fronting session by hand`);
  }
  const room = files.map(read).join("\n");
  for (const fn of ["changeFront", "toggleFrontFor", "addGroupMember", "setAlterFields", "refreshAlter", "saveRelationship", "writeSettings"]) {
    assert.ok(room.includes(fn), `the room uses ${fn}`);
  }
});

test("the phone docks the profile's bar in its bottom zone, above its own bar", () => {
  const f = read("src/house/phone/HousePhoneFrame.jsx");
  const at = f.indexOf("<AttentionLine"); const bar = f.indexOf("roomTools.bar}"); const phoneBar = f.indexOf("<PhoneBar");
  assert.ok(at > 0 && bar > at && phoneBar > bar, "attention line, then the room's bar, then the frame's bar");
  const p = read("src/house/alters/HouseAlterProfile.jsx");
  assert.ok(/items: menuItems, bar \}/.test(p), "the profile hands its bar to the frame");
  assert.ok(!/position: sticky/.test(read("src/house/alters/alters.css").split("\n").filter((l) => l.includes("hal-pf-bar")).join("\n")), "the bar is not sticky inside the page");
});

test("room tools: published while on screen, cleared when it leaves", () => {
  assert.equal(R.getRoomTools(), null);
  const t = { info: { label: "Info" }, items: [] };
  R.setRoomTools(t);
  assert.equal(R.getRoomTools(), t);
  R.setRoomTools(null);
  assert.equal(R.getRoomTools(), null);
});

test("the room's classes stay out of the frame's and kit's CSS (and it brings none of theirs)", () => {
  for (const f of ["src/house/kit/frame/frameKit.css", "src/house/kit/panels.css", "src/house/kit/kit.css"]) {
    assert.ok(!/\.hal-/.test(read(f)), `${f} has no hal- classes`);
  }
  // The rooms' own prefixes stay apart too (hal- Alters, hw- Write).
  assert.ok(!/\.hw-/.test(read("src/house/alters/alters.css")), "alters.css has no hw- classes");
  assert.ok(!/\.hal-/.test(read("src/house/write/write.css")), "write.css has no hal- classes");
  const css = read("src/house/alters/alters.css");
  assert.ok(!/^\s*\[data-house\][^{]*\.hk-[a-z-]+\s*\{[^}]*\}/m.test(css.replace(/\.hal[a-z-]*[^{]*\.hk-/g, "")), "alters.css defines no bare kit class");
  assert.ok(!/!important/.test(css));
  for (const f of ["HouseAlters.jsx", "HouseAlterProfile.jsx"]) assert.ok(read(`src/house/alters/${f}`).includes("alters/alters.css"), `${f} imports its CSS (the phone needs it)`);
});

console.log(`\n${passed} passed.`);
