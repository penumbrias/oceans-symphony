#!/usr/bin/env node
// New house step 2.2 (the phone frame): the bar's places, the attention
// line's pick, "Last time…", the zones hand-off, and the kit's phone filter
// row. Pure: storage is an in-memory stand-in; nothing real is written.
//
//   node scripts/test-house-phone.mjs

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

const m = new Map();
globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };

const P = await import("../src/house/phone/phonePlaces.js");
const L = await import("../src/house/phone/lastTime.js");
const Z = await import("../src/lib/houseZones.js");
const { ALL_PAGES } = await import("../src/utils/navigationConfig.js");
const { BACKUP_LS_KEYS } = await import("../src/lib/backupKeys.js");

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`ok  ${name}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const terms = { system: "crew", System: "Crew", alters: "parts", Alters: "Parts", alter: "part", Alter: "Part", front: "front", Front: "Front" };

// ── The bar ───────────────────────────────────────────────────────────
await test("bar: Home and Support at the ends, Alters · Do · the Day in the middle by default", () => {
  const ps = P.resolvePlaces(undefined, ALL_PAGES, terms);
  assert.deepEqual(ps.map((p) => p.id), ["home", "alters", "do", "day", "support"]);
  assert.equal(ps[0].path, "/");
  assert.equal(ps[4].path, "/grounding");
  assert.equal(ps[4].label, "Support");
  assert.equal(ps[2].sheet, "do");
  assert.equal(ps[3].path, "/timeline");
});
await test("bar: the Alters place is named in the person's words", () => {
  const ps = P.resolvePlaces(undefined, ALL_PAGES, terms);
  assert.match(ps[1].name, /Parts/);
  assert.equal(ps[1].path, "/Home");
});
await test("bar: a chosen middle keeps known places, drops unknown and duplicate ones, fills from defaults", () => {
  const ps = P.resolvePlaces(["journals", "nope", "journals", "home", "support"], ALL_PAGES, terms);
  assert.deepEqual(ps.map((p) => p.id), ["home", "journals", "alters", "do", "support"]);
  assert.equal(P.resolvePlaces("garbage", ALL_PAGES, terms).length, 5);
});
await test("bar: labels never pass 12 characters; the full name stays", () => {
  assert.equal(P.shortLabel("Home"), "Home");
  assert.equal(P.shortLabel("Activities & plans"), "Activities");
  assert.equal(P.shortLabel("Extraordinarilylongword here").length, 12);
  assert.ok(P.shortLabel("Extraordinarilylongword").endsWith("…"));
  for (const p of P.resolvePlaces(undefined, ALL_PAGES, { ...terms, Alters: "Extraordinarilylongpeople" })) {
    assert.ok(p.label.length <= P.BAR_LABEL_CAP, p.label);
    assert.ok(p.full);
  }
});
await test("bar: which place is current (/ is exact; /Home also owns profiles; Support owns every support route)", () => {
  const [home, alters, , day, support] = P.resolvePlaces(undefined, ALL_PAGES, terms);
  assert.equal(P.placeIsCurrent(home, "/"), true);
  assert.equal(P.placeIsCurrent(home, "/Home"), false);
  assert.equal(P.placeIsCurrent(alters, "/alter/abc"), true);
  assert.equal(P.placeIsCurrent(day, "/timeline"), true);
  assert.equal(P.placeIsCurrent(support, "/safety-plan"), true);
  assert.equal(P.placeIsCurrent(support, "/settings"), false);
});
await test("support routes: grounding, safety plan, emergency, unblend", () => {
  for (const r of ["/grounding", "/grounding?view=x", "/safety-plan", "/emergency", "/unblend"]) assert.equal(P.isSupportRoute(r), true, r);
  for (const r of ["/", "/groundings", "/journals"]) assert.equal(P.isSupportRoute(r), false, r);
});

// ── The attention line ────────────────────────────────────────────────
const save = { id: "save-health", sticky: true, safety: true };
const rem = { id: "reminder" };
const snd = { id: "soundscape" };
await test("attention: one item, +N for the rest, '+N' steps through them", () => {
  assert.deepEqual(P.pickAttention([rem, snd]), { item: rem, rest: 1, waiting: 0 });
  assert.equal(P.pickAttention([rem, snd], { at: 1 }).item, snd);
  assert.equal(P.pickAttention([rem, snd], { at: 2 }).item, rem);
  assert.deepEqual(P.pickAttention([]), { item: null, rest: 0, waiting: 0 });
});
await test("attention: a failed save takes the line and stays (stepping can't pass it)", () => {
  assert.equal(P.pickAttention([rem, save, snd], { at: 1 }).item, save);
  assert.equal(P.pickAttention([rem, save, snd], { at: 2 }).item, save);
});
await test("attention: on Support only data-safety notices show", () => {
  assert.deepEqual(P.pickAttention([rem, snd], { quiet: true }), { item: null, rest: 0, waiting: 2 });
  assert.equal(P.pickAttention([rem, save], { quiet: true }).item, save);
});

// ── Last time… ────────────────────────────────────────────────────────
const H = 3600000;
await test("last time: unreadable state starts again; bad paths are dropped", () => {
  assert.deepEqual(L.readRecent("{nope"), { v: 1, at: 0, recent: [] });
  const s = L.readRecent(JSON.stringify({ at: 5, recent: [{ path: "/a", at: 1 }, { path: "//evil", at: 2 }, { path: "x", at: 3 }] }));
  assert.deepEqual(s.recent, [{ path: "/a", at: 1 }]);
});
await test("last time: a visit goes to the front once; the list keeps 8", () => {
  let s = L.readRecent(null);
  for (let i = 0; i < 12; i += 1) s = L.recordVisit(s, `/p${i}`, i);
  s = L.recordVisit(s, "/p5", 99);
  assert.equal(s.recent.length, L.RECENT_MAX);
  assert.equal(s.recent[0].path, "/p5");
  assert.equal(s.recent.filter((r) => r.path === "/p5").length, 1);
});
await test("last time: shown only after a gap, never pointing at Home", () => {
  let s = L.recordVisit(L.readRecent(null), "/journals", 0);
  s = L.recordVisit(s, "/", H);
  assert.equal(L.lastTimeFrom(s, H + 1 * H), null, "one hour: no card");
  const lt = L.lastTimeFrom(s, H + 5 * H);
  assert.equal(lt.path, "/journals");
  assert.equal(L.lastTimeFrom(L.recordVisit(L.readRecent(null), "/", 0), 10 * H), null);
});
await test("last time: words for how long", () => {
  assert.equal(L.awayWords(5 * H), "5 hours");
  assert.equal(L.awayWords(26 * H), "a day");
  assert.equal(L.awayWords(80 * H), "3 days");
});
await test("last time: runtime state, NOT a backed-up preference", () => {
  assert.ok(!BACKUP_LS_KEYS.includes(L.HOUSE_RECENT_KEY));
});

// ── Zones ─────────────────────────────────────────────────────────────
await test("zones: inactive until the phone frame mounts; leaving clears the line", () => {
  Z._resetZones();
  assert.equal(Z.houseZonesActive(), false);
  const off = Z.activateHouseZones();
  assert.equal(Z.houseZonesActive(), true);
  Z.publishZoneItem("a", { title: "A", priority: 1 });
  off();
  assert.equal(Z.houseZonesActive(), false);
});
await test("zones: same signature refreshes handlers in place (the object the frame holds)", () => {
  Z._resetZones();
  const off = Z.activateHouseZones();
  let calls = "";
  let told = 0;
  Z.publishZoneItem("r", { sig: "1", title: "R", actions: [{ label: "Done", onClick: () => { calls += "old"; } }] });
  const held = Z.zoneItemsSnapshot()[0];
  const before = Z.zoneItemsSnapshot();
  Z.publishZoneItem("r", { sig: "1", title: "R", actions: [{ label: "Done", onClick: () => { calls += "new"; } }] });
  assert.equal(Z.zoneItemsSnapshot(), before, "no new snapshot: the frame isn't re-rendered");
  held.actions[0].onClick();
  assert.equal(calls, "new", "the frame's object carries the newest handler");
  Z.publishZoneItem("r", { sig: "2", title: "R2" });
  assert.notEqual(Z.zoneItemsSnapshot(), before, "a new sig re-renders");
  assert.equal(Z.zoneItemsSnapshot()[0].title, "R2");
  assert.equal(Z.zoneItemsSnapshot()[0].actions, undefined);
  told += 1;
  off();
  assert.equal(Z.zoneItemsSnapshot().length, 0);
  assert.equal(told, 1);
});
await test("zones: highest priority first, then first published", () => {
  Z._resetZones();
  const off = Z.activateHouseZones();
  Z.publishZoneItem("snd", { priority: Z.ZONE_PRIORITY.SOUND });
  Z.publishZoneItem("rem", { priority: Z.ZONE_PRIORITY.REMINDER });
  Z.publishZoneItem("tmr", { priority: Z.ZONE_PRIORITY.SOUND });
  Z.publishZoneItem("save", { priority: Z.ZONE_PRIORITY.SAVE });
  assert.deepEqual(Z.zoneItemsSnapshot().map((i) => i.id), ["save", "rem", "snd", "tmr"]);
  Z.removeZoneItem("rem");
  assert.deepEqual(Z.zoneItemsSnapshot().map((i) => i.id), ["save", "snd", "tmr"]);
  off();
});
await test("houseZones stays tiny and React-only (it's in the main bundle)", () => {
  const t = read("src/lib/houseZones.js");
  assert.ok(t.length < 6000, `${t.length} bytes`);
  const imports = [...t.matchAll(/^import .* from "([^"]+)"/gm)].map((x) => x[1]);
  assert.deepEqual(imports, ["react"]);
});
await test("floating pieces hand off to the line (reminder, save health, soundscape, running activity)", () => {
  for (const [f, id] of [
    ["src/components/reminders/ReminderToast.jsx", "reminder"],
    ["src/components/shared/SaveHealthBanner.jsx", "save-health"],
    ["src/components/grounding/soundscape/SoundscapeGlobalBar.jsx", "soundscape"],
    ["src/components/activities/ActiveActivityBubble.jsx", "active-activity"],
  ]) assert.match(read(f), new RegExp(`useHouseZoneItem\\("${id}"`), f);
});
await test("the failed-save item is sticky and safety (it holds the line, even on Support)", () => {
  const t = read("src/components/shared/SaveHealthBanner.jsx");
  assert.match(t, /sticky: true, safety: true/);
});

// ── Kit: the phone filter row ─────────────────────────────────────────
await test("filter chips on a phone: first 6 plus any that are on; 6 or fewer unchanged", async () => {
  // Choices.jsx is JSX; check the pure rule by its source and a copy of its logic.
  const t = read("src/house/kit/Choices.jsx");
  assert.match(t, /FILTER_CHIPS_PHONE_MAX = 6/);
  assert.match(t, /Filter \(\$\{options\.length\}\)/);
  const rule = (options, value, max = 6) => {
    if (options.length <= max) return { shown: options, folded: false };
    const on = new Set(value.map(String));
    return { shown: options.filter((o, i) => i < max || on.has(String(o.value))), folded: true };
  };
  assert.ok(t.includes("options.filter((o, i) => i < max || on.has(String(o.value)))"), "the rule above mirrors the kit");
  const opts = Array.from({ length: 9 }, (_, i) => ({ value: i, label: `o${i}` }));
  assert.equal(rule(opts.slice(0, 6), []).folded, false);
  assert.deepEqual(rule(opts, [8]).shown.map((o) => o.value), [0, 1, 2, 3, 4, 5, 8]);
});
await test("kit: a held toast still speaks; sheets skip the grab bar; confirm has none; outside press opt-in", () => {
  const toast = read("src/house/kit/Toast.jsx");
  assert.match(toast, /data-toast-held/);
  assert.doesNotMatch(toast, /held \? \{ visibility: "hidden" \} : undefined;\n\s*return \(\n\s*<div className=\{`hk-toast-region/);
  const sheet = read("src/house/kit/Sheet.jsx");
  assert.match(sheet, /!el\.classList\.contains\("hk-sheet-grab"\)/);
  assert.match(sheet, /modal grab=\{false\}/);
  assert.match(sheet, /!closeOnOutside\) return undefined/);
  assert.match(sheet, /Tap again to leave\./);
});

console.log(`\n${passed} passed`);
