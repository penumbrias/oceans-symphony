#!/usr/bin/env node
// Checks ~template:new and ~template:load (src/lib/logCommands.js): what
// resolves at save time, what stays prose, what the autocomplete offers.
//
//   node scripts/test-template-commands.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
// Stub the modules logCommands only needs for saving (database, React).
const STUBS = {
  "@/api/base44Client": "export const base44 = { entities: new Proxy({}, { get: () => ({ list: async () => [], filter: async () => [] }) }) };",
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
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.Event = class { constructor(t) { this.type = t; } };

const { configureCommandTerms } = await import("../src/lib/commandTerms.js");
const { parseLogCommands, buildCatalogues, buildCommandSuggestions, findCommandProblems } = await import("../src/lib/logCommands.js");
configureCommandTerms({});

const catalogues = buildCatalogues({
  templates: [
    { id: "t1", title: "Morning check", content: "<b>How</b> did we sleep?", folder_id: "f1" },
    { id: "t2", title: "Therapy prep", content: "Things to bring up", folder_id: null },
  ],
  templateFolders: [{ id: "f1", name: "Daily", parent_id: null }],
});

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const one = (text) => parseLogCommands(text, catalogues)[0];

test("load: an exact name resolves, prose after it stays", () => {
  const text = "~template:load:Therapy prep and then more";
  const m = one(text);
  assert.equal(m.type, "template");
  assert.equal(m.replaceHtml, "Things to bring up");
  assert.equal(text.slice(m.end), " and then more");
});

test("load: folder paths, brackets and the closing sign", () => {
  assert.equal(one("~template:load:Daily/Morning check").plan.id, "t1");
  assert.equal(one("~template:load:[morning check] after").plan.id, "t1");
  const t = "~template:load:therapy prep~ x";
  assert.equal(t.slice(one(t).end), " x");
});

test("load: an unknown name blocks the save with a reason", () => {
  assert.equal(parseLogCommands("~template:load:nope", catalogues).length, 0);
  const p = findCommandProblems("~template:load:nope", catalogues);
  assert.equal(p.length, 1);
  assert.match(p[0].reason, /No template called/);
});

test("new: title and text, or just text; colons survive in the text", () => {
  const a = one("~template:new:Mornings:how did we sleep? at 7:30");
  assert.deepEqual(a.plan, { kind: "templateNew", title: "Mornings", text: "how did we sleep? at 7:30" });
  assert.equal(a.replaceText, "how did we sleep? at 7:30");
  const b = one("~template:new:[just the text]");
  assert.deepEqual(b.plan, { kind: "templateNew", title: "", text: "just the text" });
  assert.equal(parseLogCommands("~template:new:", catalogues).length, 0);
});

test("autocomplete: actions, folders, then templates carrying their HTML", () => {
  const s1 = buildCommandSuggestions({ segments: ["template", ""], catalogues });
  assert.deepEqual(s1.items.map((i) => i.insert), ["load", "new"]);
  const s2 = buildCommandSuggestions({ segments: ["template", "load", ""], catalogues });
  assert.deepEqual(s2.items.map((i) => i.insert), ["Daily", "Therapy prep"]);
  assert.equal(s2.items[1].replaceWith, "Things to bring up");
  const s3 = buildCommandSuggestions({ segments: ["template", "load", "Daily", ""], catalogues });
  assert.deepEqual(s3.items.map((i) => i.insert), ["Morning check"]);
  const s4 = buildCommandSuggestions({ segments: ["template", "load", "sleep"], catalogues });
  assert.deepEqual(s4.items.map((i) => i.insert), ["Morning check"]);
  const s0 = buildCommandSuggestions({ segments: ["tem"], catalogues });
  assert.ok(s0.items.some((i) => i.insert === "template"));
});

console.log(`\n${passed} template-command checks passed.`);
