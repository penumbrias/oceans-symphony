#!/usr/bin/env node
// Checks ~activity:new and the "create it?" offer for an unknown
// ~activity:name (src/lib/logCommands.js, src/lib/activityCategoryEntry.js).
//
//   node scripts/test-activity-commands.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
// Stub the modules logCommands only needs for saving (database, React).
const STUBS = {
  "@/api/base44Client": "const R = () => globalThis.__rows; export const base44 = { entities: new Proxy({}, { get: (_, name) => ({ list: async () => (R()[name] || []).slice(), filter: async () => [], create: async (d) => { const rows = R(); const r = { id: name + (rows[name] = rows[name] || []).length, ...d }; rows[name].push(r); return r; } }) }) };",
  "@/components/emotions/EmotionWheelPicker": "export const WHEEL = {};",
  "@/lib/checkinEntry": "export const logEmotionCheckIn = async () => null; export const logSymptomCheckIn = async () => null;",
  "@/lib/symptomSessions": "export const startSymptomSession = async () => ({}); export const endSymptomSessions = async () => []; export const activeSessionsFor = () => [];",
  "@/lib/contacts": "export const contactDisplayName = (c) => c?.name || '';",
  "@/lib/frontingUtils": "export const getActivePrimaryId = () => null; export const getActiveFronterIds = () => [];",
  "@/lib/contactEncounters": "export const startEncounter = async () => null; export const endEncounterForContact = async () => null; export const logVisit = async () => null;",
  "@/lib/activitySession": "export const addActiveActivity = async () => null; export const getActiveActivities = () => []; export const endAndLogActiveActivity = async () => null;",
  "@/lib/trackingModel": "export const isBipolarScale = () => false; export const formatSeverityForSymptom = (s, v) => String(v);",
  "@/lib/alterLabel": "export const effectiveAlias = (a) => a?.alias || '';",
  "@/components/shared/ConfirmDialog": "export const confirm = async () => true;",
};
register(`data:text/javascript,${encodeURIComponent(`
  const STUBS = ${JSON.stringify(STUBS)};
  export async function resolve(spec, ctx, next) {
    if (STUBS[spec]) return { url: "data:text/javascript," + encodeURIComponent(STUBS[spec]), shortCircuit: true };
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(src)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);
globalThis.__rows = {};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.Event = class { constructor(t) { this.type = t; } };

const { configureCommandTerms } = await import("../src/lib/commandTerms.js");
const { parseLogCommands, buildCatalogues, buildCommandSuggestions, findCommandProblems, findMissingActivities, applyLogCommands } = await import("../src/lib/logCommands.js");
configureCommandTerms({});


const CATS = [
  { id: "c1", name: "Self-care", parent_category_id: null },
  { id: "c2", name: "Hygiene", parent_category_id: "c1" },
  { id: "c3", name: "Shower", parent_category_id: "c2" },
  { id: "c4", name: "Work", parent_category_id: null },
];
const catalogues = buildCatalogues({ activityCategories: CATS });

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const one = (text) => parseLogCommands(text, catalogues)[0];

test("new: a name alone goes at the top", () => {
  const m = one("~activity:new:Gardening");
  assert.deepEqual(m.plan, { kind: "activityNew", name: "Gardening", parentId: null, color: null });
  assert.match(m.label, /New activity: Gardening/);
});

test("new: a parent path, with or without the category word", () => {
  assert.equal(one("~activity:new:Hygiene:Brush teeth").plan.parentId, "c2");
  assert.equal(one("~activity:new:Self-care:Hygiene:Brush teeth").plan.parentId, "c2");
  assert.equal(one("~activity:new:category:Hygiene:Brush teeth").plan.parentId, "c2");
  assert.equal(one("~activity:new:category:Gardening").plan.parentId, null);
  // Any activity can hold a new one.
  assert.equal(one("~activity:new:Shower:Cold shower").plan.parentId, "c3");
  assert.match(one("~activity:new:Hygiene:Floss").label, /in Self-care › Hygiene/);
});

test("new: brackets and ~ bound the name; prose after stays", () => {
  const t = "~activity:new:Hygiene:[Floss] then bed";
  assert.equal(one(t).plan.name, "Floss");
  assert.equal(t.slice(one(t).end), " then bed");
  const u = "~activity:new:Floss~ ok";
  assert.equal(u.slice(one(u).end), " ok");
});

test("new: an unknown parent or no name is a problem with a reason", () => {
  assert.equal(parseLogCommands("~activity:new:Nope:Floss", catalogues).length, 0);
  assert.match(findCommandProblems("~activity:new:Nope:Floss", catalogues)[0].reason, /No activity called “Nope” to put it in/);
  assert.match(findCommandProblems("~activity:new", catalogues)[0].reason, /needs a name/);
});

test("new: an existing twin is reused, not duplicated", () => {
  assert.match(one("~activity:new:Hygiene:shower").label, /already an activity/);
});

test("logging still works, and an unknown name is found as missing", () => {
  assert.equal(one("~activity:shower:30m").plan.kind, "activityLog");
  const miss = findMissingActivities("hi ~activity:Gardening in the sun", catalogues);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].name, "Gardening in the sun");
  assert.equal(miss[0].single, true);
  assert.equal(findMissingActivities("~activity:Garden:30m", catalogues)[0].name, "Garden");
  assert.equal(findMissingActivities("~activity:shower", catalogues).length, 0);
  assert.equal(findMissingActivities("~activity:new:Floss", catalogues).length, 0);
});

test("save: yes creates the activity and logs it; the name can be trimmed", async () => {
  globalThis.__rows = { ActivityCategory: CATS.slice() };
  const asked = [];
  const r = await applyLogCommands("~activity:Gardening in the sun", { isRich: false, askCreateActivity: async (n) => { asked.push(n); return "Gardening"; } });
  assert.deepEqual(asked, ["Gardening in the sun"]);
  assert.ok(globalThis.__rows.ActivityCategory.some((c) => c.name === "Gardening" && !c.parent_category_id));
  assert.equal(r.logged.length, 1);
  assert.match(r.content, /Gardening<\/span> in the sun/);
  assert.equal(globalThis.__rows.Activity.length, 1);
});

test("save: a renamed name is written into the text", async () => {
  globalThis.__rows = { ActivityCategory: CATS.slice() };
  const r = await applyLogCommands("~activity:Gardn:30m", { isRich: false, askCreateActivity: async () => "Gardening" });
  assert.equal(r.logged.length, 1);
  assert.match(r.content, /Gardening/);
});

test("save: no keeps the old block", async () => {
  globalThis.__rows = { ActivityCategory: CATS.slice() };
  await assert.rejects(applyLogCommands("~activity:Gardening", { isRich: false, askCreateActivity: async () => null }), /new:Gardening/);
  assert.equal(globalThis.__rows.ActivityCategory.length, CATS.length);
});

test("save: ~activity:new creates once, under the parent, in its colour", async () => {
  globalThis.__rows = { ActivityCategory: CATS.map((c) => ({ ...c, color: c.id === "c2" ? "#123456" : null })) };
  const r = await applyLogCommands("~activity:new:Hygiene:Floss", { isRich: false, askCreateActivity: null });
  const made = globalThis.__rows.ActivityCategory.filter((c) => c.name === "Floss");
  assert.equal(made.length, 1);
  assert.equal(made[0].parent_category_id, "c2");
  assert.equal(made[0].color, "#123456");
  assert.match(r.content, /New activity: Floss in Self-care › Hygiene/);
});

test("autocomplete: 'new' is offered, then a level-by-level picker", () => {
  const s1 = buildCommandSuggestions({ segments: ["activity", ""], catalogues });
  assert.equal(s1.items[0].insert, "new");
  const s2 = buildCommandSuggestions({ segments: ["activity", "new", ""], catalogues });
  assert.deepEqual(s2.items.map((i) => i.insert), ["Self-care", "Work"]);
  assert.match(s2.items[0].label, /›$/);
  const s3 = buildCommandSuggestions({ segments: ["activity", "new", "Self-care", ""], catalogues });
  assert.deepEqual(s3.items.map((i) => i.insert), ["Hygiene"]);
  const s4 = buildCommandSuggestions({ segments: ["activity", "new", "Self-care", "Hygiene", "Shower", ""], catalogues });
  assert.deepEqual(s4.items, []); // a leaf: type the new name
  assert.equal(s4.canFinish, false);
});

test("autocomplete: typing searches, and offers the typed name as new", () => {
  const s = buildCommandSuggestions({ segments: ["activity", "new", "show"], catalogues });
  assert.equal(s.items[0].insert, "Self-care:Hygiene:Shower");
  assert.equal(s.items[s.items.length - 1].terminal, true);
  assert.equal(s.canFinish, true);
  const inside = buildCommandSuggestions({ segments: ["activity", "new", "Self-care", "sho"], catalogues });
  assert.equal(inside.items[0].insert, "Hygiene:Shower");
  const plain = buildCommandSuggestions({ segments: ["activity", "zzz"], catalogues });
  assert.match(plain.items[plain.items.length - 1].label, /New: “zzz”/);
});

for (const [name, fn] of tests) { await fn(); passed += 1; console.log(`ok  ${name}`); }
console.log(`\n${passed} activity-command checks passed.`);
