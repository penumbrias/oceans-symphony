#!/usr/bin/env node
// Checks the person's own command symbol and words (src/lib/commandTerms.js,
// Settings → Terminology): a custom symbol and word log like the built-in
// ones, the built-in words keep working, prose stays prose, and whispers
// accept a custom word next to /w.
//
//   node scripts/test-command-terms.mjs

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

const { configureCommandTerms, getCommandSign, isValidCommandSign, sanitizeCommandWord } = await import("../src/lib/commandTerms.js");
const { parseLogCommands, buildCatalogues, detectCommandToken, buildCommandSuggestions, findCommandProblems, isReservedCommandWord } = await import("../src/lib/logCommands.js");
const { hasWhisperCommand, buildMidWhisperWarning } = await import("../src/lib/whisperUtils.js");

const catalogues = buildCatalogues({
  symptoms: [{ id: "s1", label: "Anxiety", category: "symptom", type: "boolean" }],
  contacts: [], activityCategories: [{ id: "a1", name: "Reading" }], customEmotions: [], journalEntries: [],
});

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const types = (text) => parseLogCommands(text, catalogues).map((m) => m.type);

test("defaults: ~ and the built-in words", () => {
  configureCommandTerms({});
  assert.equal(getCommandSign(), "~");
  assert.deepEqual(types("today ~symptom:anxiety and ~activity:reading"), ["symptom", "activity"]);
});

test("a custom symbol replaces ~", () => {
  configureCommandTerms({ sign: "!" });
  assert.deepEqual(types("today !symptom:anxiety"), ["symptom"]);
  assert.deepEqual(types("about ~symptom:anxiety"), [], "~ is plain text once the symbol changed");
  assert.equal(findCommandProblems("about ~symptom:nope", catalogues).length, 0, "an old-symbol token never blocks a save");
  const m = parseLogCommands("x !symptom:anxiety! after", catalogues)[0];
  assert.equal("x !symptom:anxiety! after".slice(m.end), " after", "the symbol also closes a command");
  assert.ok(detectCommandToken("note !sym", 9));
  assert.equal(detectCommandToken("note ~sym", 9), null);
});

test("custom words add to the built-in ones", () => {
  configureCommandTerms({ words: { symptom: "ouch", activity: "doing" } });
  assert.deepEqual(types("~ouch:anxiety ~doing:reading ~symptom:anxiety ~act:reading"), ["symptom", "activity", "symptom", "activity"]);
  assert.ok(isReservedCommandWord("ouch"));
  const first = buildCommandSuggestions({ segments: [""], catalogues });
  assert.ok(first.items.some((i) => i.insert === "ouch"), "the menu offers the person's word");
  assert.ok(!first.items.some((i) => i.insert === "symptom"));
  const prob = findCommandProblems("~ouch", catalogues)[0];
  assert.match(prob.reason, /^~ouch needs a name/);
});

test("words are cleaned; bad symbols refused", () => {
  assert.equal(sanitizeCommandWord(" ~Ou ch:! "), "ouch");
  for (const bad of ["a", "1", " ", "@", "/", "[", ":", "<", "+", "-", "!!"]) assert.equal(isValidCommandSign(bad), false, bad);
  for (const ok of ["~", "!", "$", "%", "^", "*"]) assert.equal(isValidCommandSign(ok), true, ok);
  configureCommandTerms({ sign: "@" });
  assert.equal(getCommandSign(), "~", "an invalid saved symbol falls back to ~");
});

test("whisper words", () => {
  configureCommandTerms({ whisper: "psst" });
  assert.ok(hasWhisperCommand("/psst @kai [hi]"));
  assert.ok(hasWhisperCommand("/w @kai [hi]"));
  assert.ok(hasWhisperCommand("/whisper @kai hi"));
  assert.ok(!hasWhisperCommand("/pss @kai"));
  assert.match(buildMidWhisperWarning(), /"\/psst"/);
  configureCommandTerms({});
  assert.ok(!hasWhisperCommand("/psst @kai [hi]"));
});

test("therapy word still works with a custom symbol", () => {
  configureCommandTerms({ sign: "!" });
  const m = parseLogCommands("rough night !therapy sleep is bad", catalogues);
  assert.equal(m[0]?.type, "therapy");
  assert.equal(m[0].plan.note, "sleep is bad");
  configureCommandTerms({});
});

console.log(`\n${passed} command-terms checks passed.`);
