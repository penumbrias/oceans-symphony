#!/usr/bin/env node
// New house step 2.1 (the desktop and tablet frame): the switch, the three
// sizes, the docks' one settings field, and page titles. Pure: storage is
// an in-memory stand-in; nothing real is written.
//
//   node scripts/test-house-frame.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
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
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}
globalThis.localStorage = memStore();

const S = await import("../src/lib/houseSwitch.js");
const D = await import("../src/house/frame/dockPrefs.js");
const T = await import("../src/house/frame/pageTitle.js");
const { BACKUP_LS_KEYS } = await import("../src/lib/backupKeys.js");

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`ok  ${name}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── The switch ────────────────────────────────────────────────────────
await test("switch: off unless exactly \"1\"; garbage and missing read as off", () => {
  assert.equal(S.parseHouseSwitch("1"), true);
  for (const v of [null, "", "0", "true", "yes", "on", undefined]) assert.equal(S.parseHouseSwitch(v), false);
});
await test("switch: writes 1/0 and never removes the key (so the mirror can't bring back an old value)", () => {
  const s = memStore();
  assert.equal(S.readHouseSwitch(s), false);
  assert.equal(S.setHouseSwitch(true, s), true);
  assert.equal(s.getItem(S.HOUSE_SWITCH_KEY), "1");
  assert.equal(S.readHouseSwitch(s), true);
  S.setHouseSwitch(false, s);
  assert.equal(s.getItem(S.HOUSE_SWITCH_KEY), "0");
  assert.equal(S.readHouseSwitch(s), false);
});
await test("switch: a storage that throws reads as off and reports the failed write", () => {
  const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(S.readHouseSwitch(bad), false);
  assert.equal(S.setHouseSwitch(true, bad), false);
});
await test("switch and docks field are durable device preferences (BACKUP_LS_KEYS)", () => {
  assert.ok(BACKUP_LS_KEYS.includes(S.HOUSE_SWITCH_KEY));
  assert.ok(BACKUP_LS_KEYS.includes(D.HOUSE_LAYOUT_KEY));
});
await test("switch: Preview Mode doesn't stash or clear it", () => {
  const pm = read("src/lib/previewMode.js");
  assert.ok(!pm.includes(S.HOUSE_SWITCH_KEY) && !/symphony_new_house/.test(pm));
});

// ── Sizes ─────────────────────────────────────────────────────────────
await test("sizes: effective width = width ÷ text scale; sideways phones are phones", () => {
  assert.equal(S.houseSizeClass({ width: 1280 }), "full");
  assert.equal(S.houseSizeClass({ width: 1024 }), "full");
  assert.equal(S.houseSizeClass({ width: 1023 }), "compact");
  assert.equal(S.houseSizeClass({ width: 820 }), "compact");
  assert.equal(S.houseSizeClass({ width: 640 }), "compact");
  assert.equal(S.houseSizeClass({ width: 639 }), "phone");
  assert.equal(S.houseSizeClass({ width: 1280, textScale: 2 }), "compact");
  assert.equal(S.houseSizeClass({ width: 1200, textScale: 2 }), "phone");
  assert.equal(S.houseSizeClass({ width: 844, height: 390, coarse: true }), "phone");
  assert.equal(S.houseSizeClass({ width: 844, height: 390, coarse: false }), "compact");
  assert.equal(S.houseSizeClass({ width: NaN }), "phone");
});

// ── Docks ─────────────────────────────────────────────────────────────
await test("docks: defaults (right dock on Info in the full studio, closed elsewhere)", () => {
  const empty = { v: 1, pages: {} };
  assert.deepEqual(D.dockFor(empty, "/journals", "right", "full"), { shown: true, size: 20, tab: "info" });
  assert.equal(D.dockFor(empty, "/journals", "right", "compact").shown, false);
  assert.deepEqual(D.dockFor(empty, "/journals", "left", "full"), { shown: false, size: 16 });
  assert.equal(D.dockFor(empty, "/journals", "bottom", "full").size, 12.5);
});
await test("docks: sizes clamp to the building code's limits, per size class", () => {
  assert.equal(D.clampDockSize("left", 5, "full"), 13);
  assert.equal(D.clampDockSize("left", 40, "full"), 22);
  assert.equal(D.clampDockSize("left", 40, "compact"), 18);
  assert.equal(D.clampDockSize("right", 10, "full"), 18);
  assert.equal(D.clampDockSize("right", 10, "compact"), 20);
  assert.equal(D.clampDockSize("right", 99, "full"), 28);
  assert.equal(D.clampDockSize("bottom", 99, "full", { pageHeightRem: 40 }), 20);
  assert.equal(D.clampDockSize("bottom", 2, "full"), 8);
  assert.equal(D.clampDockSize("right", "abc", "full"), 20);
  assert.equal(D.clampDockSize("nope", 3), null);
});
await test("docks: page keys fold profiles into one page", () => {
  assert.equal(D.layoutPageKey("/alter/abc?tab=notes"), "/alter/:id");
  assert.equal(D.layoutPageKey("/group/g1"), "/group/:id");
  assert.equal(D.layoutPageKey("/journals/"), "/journals");
  assert.equal(D.layoutPageKey("/"), "/");
  assert.equal(D.layoutPageKey("/mod/m1/p2"), "/mod/m1/:page");
});
await test("docks: one write changes one dock of one page (and the * default), keeps every other key", () => {
  const before = { v: 1, future: { kept: true }, pages: { "/todo": { left: { shown: true }, _ut: 1 }, "/planner": { right: { tab: "help" } } } };
  const after = D.withDock(before, "/todo", "right", { shown: false, size: 24, tab: "history" }, { now: 5 });
  assert.deepEqual(after.future, { kept: true });
  assert.deepEqual(after.pages["/planner"], { right: { tab: "help" } });
  assert.deepEqual(after.pages["/todo"].left, { shown: true });
  assert.deepEqual(after.pages["/todo"].right, { shown: false, tab: "history", sizes: { full: 24 } });
  assert.equal(after.pages["/todo"]._ut, 5);
  assert.equal(after.pages["*"].right.shown, false);
  // Before is untouched (a new object).
  assert.equal(before.pages["/todo"].right, undefined);
});
await test("docks: a page's own choice beats *, * beats the default; sizes are per size class", () => {
  let l = D.withDock({}, "/todo", "right", { shown: false }, {});
  assert.equal(D.dockFor(l, "/journals", "right").shown, false, "a new page follows the last choice");
  l = D.withDock(l, "/journals", "right", { shown: true }, {});
  assert.equal(D.dockFor(l, "/journals", "right").shown, true);
  assert.equal(D.dockFor(l, "/todo", "right").shown, false, "the other page keeps its own");
  l = D.withDock(l, "/todo", "left", { size: 21 }, { sizeClass: "full" });
  assert.equal(D.dockFor(l, "/todo", "left", "full").size, 21);
  assert.equal(D.dockFor(l, "/todo", "left", "compact").size, 16, "the compact studio keeps its own size");
});
await test("docks: hand-edited or hostile values are cleaned when read", () => {
  const l = { pages: { "/x": { right: { shown: "yes", tab: "evil", sizes: { full: 9999 } } } } };
  assert.deepEqual(D.dockFor(l, "/x", "right", "full"), { shown: true, size: 28, tab: "info" });
  assert.deepEqual(D.dockFor(null, "/x", "left"), { shown: false, size: 16 });
});
await test("docks: saveDock is a fresh read + one change; an unreadable field is kept before it is replaced", () => {
  const s = memStore({ [D.HOUSE_LAYOUT_KEY]: JSON.stringify({ v: 1, pages: { "/a": { left: { shown: true } } } }) });
  D.saveDock("/b", "right", { tab: "help" }, { storage: s });
  // Another tab writes in between: the next save still sees it.
  const mid = JSON.parse(s.getItem(D.HOUSE_LAYOUT_KEY));
  mid.pages["/c"] = { bottom: { shown: true } };
  s.setItem(D.HOUSE_LAYOUT_KEY, JSON.stringify(mid));
  D.saveDock("/b", "right", { shown: false }, { storage: s });
  const out = JSON.parse(s.getItem(D.HOUSE_LAYOUT_KEY));
  assert.deepEqual(out.pages["/a"].left, { shown: true });
  assert.deepEqual(out.pages["/c"].bottom, { shown: true });
  assert.equal(out.pages["/b"].right.tab, "help");
  assert.equal(out.pages["/b"].right.shown, false);

  const g = memStore({ [D.HOUSE_LAYOUT_KEY]: "{not json" });
  D.saveDock("/b", "left", { shown: true }, { storage: g });
  assert.equal(g.getItem(D.HOUSE_LAYOUT_KEPT_KEY), "{not json");
  assert.equal(JSON.parse(g.getItem(D.HOUSE_LAYOUT_KEY)).pages["/b"].left.shown, true);
  assert.deepEqual(D.parseLayout("[1,2]").ok, false);
});

// ── Titles ────────────────────────────────────────────────────────────
const terms = { System: "Collective", Alters: "Parts", Alter: "Part" };
await test("titles: real page names from pageLabel, in the person's words", () => {
  assert.equal(T.resolvePageTitle("/", { terms }).title, "Home");
  assert.equal(T.resolvePageTitle("/Home", { terms }).title, "Parts");
  assert.equal(T.resolvePageTitle("/chat", { terms }).title, "Collective Chat");
  assert.equal(T.resolvePageTitle("/system-map", { terms }).title, "Collective Map");
  assert.equal(T.resolvePageTitle("/tasks", { terms }).title, "Routines");
  assert.equal(T.resolvePageTitle("/journals", { terms }).area.label, "Write");
  assert.equal(T.resolvePageTitle("/Home", { terms }).area.label, "Collective");
});
await test("titles: query pages, sub-pages and unknown routes", () => {
  assert.equal(T.resolvePageTitle("/goals", { terms }).title, "Notebook");
  assert.equal(T.resolvePageTitle("/goals", { terms, search: "?notes=1" }).title, "Notes & lists");
  assert.equal(T.resolvePageTitle("/unblend/questions", { terms }).title, "Unblend questions");
  assert.equal(T.resolvePageTitle("/manage-checkin", { terms }).title, "Manage check-ins");
  assert.equal(T.resolvePageTitle("/nope", { terms }).kind, "unknown");
});
await test("titles: profiles are named by their record, else by their kind in the person's words", () => {
  const records = { alters: [{ id: "a1", name: "River", alias: "Riv" }], groups: [{ id: "g1", name: "Littles" }], innerWorldLocations: [{ id: "l1", name: "The Hearth" }] };
  assert.equal(T.resolvePageTitle("/alter/a1?tab=notes", { terms, records }).title, "River");
  assert.equal(T.resolvePageTitle("/alter/a1", { terms, records, formatAlter: (a) => a.alias }).title, "Riv");
  assert.equal(T.resolvePageTitle("/alter/zz", { terms, records }).title, "Part");
  assert.equal(T.resolvePageTitle("/group/g1", { terms, records }).title, "Littles");
  assert.equal(T.resolvePageTitle("/location/l1", { terms, records }).title, "The Hearth");
  assert.equal(T.resolvePageTitle("/contacts/c9", { terms, records }).title, "Contact");
});
await test("titles: every route in App.jsx resolves to a name", () => {
  const app = read("src/App.jsx");
  const routes = [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{(?!<Navigate)/g)].map((m) => m[1]).filter((p) => p !== "*" && !p.startsWith("/house/") && !p.startsWith("/mod/"));
  assert.ok(routes.length > 30);
  for (const r of routes) {
    const res = T.resolvePageTitle(r.replace(":id", "x"), { terms });
    assert.notEqual(res.kind, "unknown", `${r} has no name`);
    assert.ok(res.title && res.title.length > 1, r);
  }
});
await test("titles: the browser title says the page, then the app", () => {
  assert.equal(T.documentTitleFor("Journals"), "Journals · Oceans Symphony");
  assert.equal(T.documentTitleFor(""), "Oceans Symphony");
});

// ── Open-page tabs ────────────────────────────────────────────────────
const OT = await import("../src/house/frame/openTabs.js");
await test("tabs: a fresh device opens one tab on the current page; junk is ignored", () => {
  const a = OT.readTabs(null, "/journals");
  assert.equal(a.tabs.length, 1);
  assert.equal(a.tabs[0].path, "/journals");
  assert.equal(a.active, a.tabs[0].id);
  for (const raw of ["{", "[]", JSON.stringify({ tabs: [{ id: 1, path: "/x" }, { id: "a", path: "http://evil" }] })]) {
    assert.equal(OT.readTabs(raw, "/").tabs.length, 1, raw);
  }
  const kept = OT.readTabs(JSON.stringify({ tabs: [{ id: "a", path: "/" }, { id: "b", path: "/Home" }], active: "zz" }), "/");
  assert.equal(kept.tabs.length, 2);
  assert.equal(kept.active, "a", "an unknown current tab falls back to the first");
});
await test("tabs: the current tab follows; + opens Home; closing the current goes to its neighbour; never the last", () => {
  let s = OT.readTabs(null, "/");
  s = OT.followTo(s, "/journals");
  assert.equal(s.tabs[0].path, "/journals");
  assert.equal(OT.followTo(s, "/journals"), s, "same page: no new state");
  s = OT.openTab(s, "/", "t2");
  assert.equal(s.active, "t2");
  s = OT.openTab(s, "/goals", "t3");
  const first = s.tabs[0].id;
  let r = OT.closeTab(s, "t3");
  assert.equal(r.state.active, "t2");
  assert.equal(r.goTo, "/");
  r = OT.closeTab(r.state, first);
  assert.equal(r.goTo, null, "closing a background tab doesn't move");
  assert.equal(r.state.tabs.length, 1);
  const last = OT.closeTab(r.state, "t2");
  assert.equal(last.state.tabs.length, 1, "the last tab never closes");
  assert.equal(OT.selectTab(r.state, "nope"), r.state);
  let many = OT.readTabs(null, "/");
  for (let n = 0; n < 30; n++) many = OT.openTab(many, `/p${n}`, `id${n}`);
  assert.equal(many.tabs.length, OT.MAX_TABS);
  assert.equal(many.active, "id29");
});
await test("tabs: runtime state only, not a backed-up preference", () => {
  assert.ok(!BACKUP_LS_KEYS.includes(OT.HOUSE_TABS_KEY));
});

// ── The lazy boundary ─────────────────────────────────────────────────
await test("old house: only the tiny switch module is imported eagerly; the frame is a lazy import", () => {
  const layout = read("src/components/layout/AppLayout.jsx");
  const eager = [...layout.matchAll(/^import[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.ok(!eager.some((p) => p.startsWith("@/house/")), "AppLayout imports nothing from src/house eagerly");
  assert.ok(/import\(["']@\/house\/frame\/HouseFrame["']\)/.test(layout), "the frame is a dynamic import");
  const sw = read("src/lib/houseSwitch.js");
  assert.ok(!/@\/house\//.test(sw), "the switch module reaches no house code");
});

console.log(`\n${passed} passed`);
