#!/usr/bin/env node
// The quick list (src/lib/quickPeople.js): pasted lists split into lines,
// named lines save as alters, "Not sure yet" or nameless lines as
// presences, empty lines are skipped, and a failed save keeps its line.
//
//   node scripts/test-quick-people.mjs

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

const { parseNameList, isListPaste, lineKind, spreadPaste, newLine, saveQuickPeople } = await import("../src/lib/quickPeople.js");

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`ok  ${name}`); };

await test("pasted lists split on lines, commas and semicolons", () => {
  assert.deepEqual(parseNameList("Robin\nSky, Ash; Wren\n\n"), ["Robin", "Sky", "Ash", "Wren"]);
  assert.deepEqual(parseNameList("- Robin\n• Sky\n1. Ash\n2) Wren"), ["Robin", "Sky", "Ash", "Wren"]);
  assert.deepEqual(parseNameList("Robin\nrobin\nROBIN"), ["Robin"]);
  assert.equal(isListPaste("Robin"), false);
  assert.equal(isListPaste("Robin, Sky"), true);
});

await test("what each line saves as", () => {
  assert.equal(lineKind(newLine()), null);
  assert.equal(lineKind(newLine({ name: "  " })), null);
  assert.equal(lineKind(newLine({ name: "Robin" })), "alter");
  assert.equal(lineKind(newLine({ name: "Robin", unsure: true })), "presence");
  assert.equal(lineKind(newLine({ color: "#ff0000" })), "presence");
  assert.equal(lineKind(newLine({ emoji: "🌙" })), "presence");
});

await test("a paste fills this line and adds the rest after it", () => {
  const a = newLine({ name: "x", color: "#123456", unsure: true });
  const b = newLine({ name: "Last" });
  const out = spreadPaste([a, b], 0, "Robin\nSky\nAsh");
  assert.deepEqual(out.map((l) => l.name), ["Robin", "Sky", "Ash", "Last"]);
  assert.equal(out[0].key, a.key);
  assert.equal(out[0].color, "#123456");
  assert.ok(out[1].unsure && out[2].unsure && !out[3].unsure);
  assert.equal(new Set(out.map((l) => l.key)).size, 4);
});

await test("saving sends each line to the right writer and keeps failures", async () => {
  const made = { alter: [], presence: [] };
  const create = {
    alter: async (f) => { if (f.name === "Boom") throw new Error("nope"); made.alter.push(f); return { id: `a${made.alter.length}`, ...f }; },
    presence: async (f) => { made.presence.push(f); return { id: `p${made.presence.length}`, ...f }; },
  };
  const lines = [
    newLine({ name: " Robin ", color: "#ff0000", emoji: "🐦" }),
    newLine({ name: "Little one", unsure: true }),
    newLine({ color: "#00ff00" }),
    newLine(),
    newLine({ name: "Boom" }),
  ];
  const res = await saveQuickPeople(lines, { create });
  assert.deepEqual(made.alter, [{ name: "Robin", color: "#ff0000", emoji: "🐦" }]);
  assert.deepEqual(made.presence, [
    { label: "Little one", color: "", emoji: "" },
    { label: "", color: "#00ff00", emoji: "" },
  ]);
  assert.equal(res.alters.length, 1);
  assert.equal(res.presences.length, 2);
  assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].line.name, "Boom");
});

console.log(`${passed} quick list checks passed.`);
