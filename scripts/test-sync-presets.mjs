#!/usr/bin/env node
// Checks the appearance-preset merge that runs on every device sync
// (src/lib/syncPresets.js): a union that never loses a preset.
import assert from "node:assert/strict";
import { mergePresetMaps } from "../src/lib/syncPresets.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};
const P = (c) => ({ light: { primary: c }, dark: { primary: c } });

test("a preset only the other device has is added", () => {
  const r = mergePresetMaps(JSON.stringify({ Mine: P("#111") }), JSON.stringify({ Theirs: P("#222") }), "Phone");
  assert.deepEqual(Object.keys(r.merged).sort(), ["Mine", "Theirs"]);
  assert.deepEqual(r.added, ["Theirs"]);
});
test("identical presets (any key order) change nothing", () => {
  const a = { Mine: { light: { a: 1, b: 2 }, dark: {} } };
  const b = { Mine: { dark: {}, light: { b: 2, a: 1 } } };
  assert.equal(mergePresetMaps(JSON.stringify(a), JSON.stringify(b)), null);
});
test("same name, different colours keeps both", () => {
  const r = mergePresetMaps(JSON.stringify({ Ocean: P("#111") }), JSON.stringify({ Ocean: P("#222") }), "Phone");
  assert.deepEqual(r.merged.Ocean, P("#111"));
  assert.deepEqual(r.merged["Ocean (Phone)"], P("#222"));
});
test("a repeat sync doesn't add the renamed copy again", () => {
  const local = { Ocean: P("#111"), "Ocean (Phone)": P("#222") };
  assert.equal(mergePresetMaps(JSON.stringify(local), JSON.stringify({ Ocean: P("#222") }), "Phone"), null);
});
test("nothing stored here yet takes all of theirs", () => {
  const r = mergePresetMaps(null, JSON.stringify({ A: P("#1"), B: P("#2") }));
  assert.deepEqual(r.added.sort(), ["A", "B"]);
});
test("unreadable local value is never replaced", () => {
  assert.equal(mergePresetMaps("{broken", JSON.stringify({ A: P("#1") })), null);
});
test("the device-only unsaved-colours slot never travels", () => {
  assert.equal(mergePresetMaps("{}", JSON.stringify({ "Unsaved colours (auto-kept)": P("#1") })), null);
});
test("junk entries are skipped", () => {
  assert.equal(mergePresetMaps("{}", JSON.stringify({ A: "x", B: null, C: {} })), null);
});
console.log(`${passed} passed`);
