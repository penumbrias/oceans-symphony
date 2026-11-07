#!/usr/bin/env node
// Checks the emergency card (src/lib/emergencyCard.js): what the card
// shows, two rows folding together, and the lock-screen copy holding ONLY
// the sections the person picked (and nothing when it is off).
//
//   node scripts/test-emergency-card.mjs

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
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { buildEmergencyCard, pickEmergencyInfo, writeLockCopy, readLockCopy, cardContacts, LOCK_COPY_KEY } = await import("../src/lib/emergencyCard.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const info = {
  communication: "I can't speak right now. I can hear you.", allergies: "Penicillin", address: "1 Sea Lane",
  preferred_name: "Ocean", blood_type: "O+",
};
const meds = [
  { name: "Sertraline", dose: "50 mg", purpose: "mood" },
  { name: "Secret", share_in_emergency: false },
  { name: "Old", is_archived: true },
];
const contacts = cardContacts([{ name: "Sam", relationship_label: "Friend", contact_methods: [{ type: "phone", value: "+44 7000 000000" }] }]);

test("card shows filled sections only, in order", () => {
  const card = buildEmergencyCard({ info, medications: meds, contacts, safetyPlan: { emergency_response: "Call Sam" } });
  assert.deepEqual(card.map((s) => s.id), ["communication", "about", "allergies", "medications", "medical", "contacts", "safety", "address"]);
  assert.deepEqual(card.find((s) => s.id === "medications").lines, ["Sertraline · 50 mg · for mood"]);
  assert.equal(card.find((s) => s.id === "contacts").contacts[0].phone, "+44 7000 000000");
});

test("pulled-in sections can be turned off", () => {
  const card = buildEmergencyCard({ info: { ...info, show_medications: false, show_contacts: false, show_safety_plan: false }, medications: meds, contacts, safetyPlan: { emergency_response: "x" } });
  assert.ok(!card.some((s) => ["medications", "contacts", "safety"].includes(s.id)));
});

test("two rows fold: newest wins, empty fields filled from older", () => {
  const picked = pickEmergencyInfo([
    { id: "a", allergies: "Nuts", updated_date: "2026-01-01" },
    { id: "b", communication: "Hi", updated_date: "2026-02-01" },
  ]);
  assert.equal(picked.id, "b");
  assert.equal(picked.allergies, "Nuts");
});

test("lock copy is off by default and holds nothing", () => {
  const card = buildEmergencyCard({ info, medications: meds, contacts });
  assert.equal(writeLockCopy({ ...info, lock_fields: ["allergies"] }, card), null);
  assert.equal(store.has(LOCK_COPY_KEY), false);
});

test("lock copy holds only the picked sections", () => {
  const on = { ...info, lock_copy: true, lock_fields: ["communication", "allergies"] };
  const card = buildEmergencyCard({ info: on, medications: meds, contacts });
  writeLockCopy(on, card);
  const copy = readLockCopy();
  assert.deepEqual(copy.sections.map((s) => s.id), ["communication", "allergies"]);
  assert.ok(!JSON.stringify(copy).includes("Sea Lane"));
  assert.ok(!JSON.stringify(copy).includes("Sertraline"));
});

test("switching it off removes the copy", () => {
  writeLockCopy({ ...info, lock_copy: false, lock_fields: ["allergies"] }, buildEmergencyCard({ info }));
  assert.equal(readLockCopy(), null);
});

console.log(`\n${passed} emergency card checks passed`);
