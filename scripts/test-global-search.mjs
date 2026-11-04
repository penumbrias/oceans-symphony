#!/usr/bin/env node
// Checks global search (src/lib/globalSearch.js): every word in any order,
// old records findable, private inbox messages and channels only while
// their people are in front, whisper secrets never indexed, and a
// lifetime-sized index still searches fast.
//
//   node scripts/test-global-search.mjs

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

const { buildSearchIndex, searchIndex, queryWords } = await import("../src/lib/globalSearch.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const ids = (hits) => hits.filter((h) => h.type !== "setting").map((h) => h.id);
const alters = [{ id: "a1", name: "Robin" }, { id: "a2", name: "Sky" }];

test("every word, in any order", () => {
  const index = buildSearchIndex({ journals: [{ id: "j1", title: "Walk", content: "<p>Went to the park with the dog</p>", created_date: "2020-03-01T10:00:00Z" }] });
  assert.deepEqual(ids(searchIndex(index, "dog park")), ["j1"]);
  assert.deepEqual(ids(searchIndex(index, "\"dog park\"")), []);
  assert.deepEqual(ids(searchIndex(index, "\"the park\"")), ["j1"]);
  assert.deepEqual(queryWords('  "dog park"  cat '), ["dog park", "cat"]);
});

test("title matches first, then newest", () => {
  const index = buildSearchIndex({ journals: [
    { id: "old", title: "x", content: "garden", created_date: "2019-01-01T00:00:00Z" },
    { id: "new", title: "y", content: "garden", created_date: "2025-01-01T00:00:00Z" },
    { id: "titled", title: "Garden plans", content: "", created_date: "2010-01-01T00:00:00Z" },
  ] });
  assert.deepEqual(ids(searchIndex(index, "garden")), ["titled", "new", "old"]);
});

test("pinned bulletins findable by text, author and the word pinned", () => {
  const index = buildSearchIndex({ alters, bulletins: [{ id: "b1", content: "<b>House</b> rules", is_pinned: true, author_alter_id: "a1", created_date: "2018-05-01T00:00:00Z" }] });
  assert.deepEqual(ids(searchIndex(index, "house rules")), ["b1"]);
  assert.deepEqual(ids(searchIndex(index, "robin pinned")), ["b1"]);
});

test("private inbox messages only while sender or recipient is in front", () => {
  const msgs = [
    { id: "m1", to_alter_id: "a1", from_alter_id: "a2", content: "secret plan", created_date: "2021-01-01T00:00:00Z" },
    { id: "m2", alter_id: "a1", content: "board plan", created_date: "2021-01-01T00:00:00Z" },
  ];
  const nobody = buildSearchIndex({ alters, alterMessages: msgs, frontingIds: [] });
  assert.deepEqual(ids(searchIndex(nobody, "plan")), ["msg-m2"]);
  const sky = buildSearchIndex({ alters, alterMessages: msgs, frontingIds: ["a2"] });
  assert.deepEqual(ids(searchIndex(sky, "secret")), ["msg-m1"]);
});

test("private channels only while a member is in front", () => {
  const chatChannels = [{ id: "c1", name: "vault", is_private: true, member_alter_ids: ["a1"] }];
  const chatMessages = [{ id: "cm1", channel_id: "c1", content: "hidden words" }];
  assert.equal(ids(searchIndex(buildSearchIndex({ chatChannels, chatMessages, frontingIds: [] }), "hidden")).length, 0);
  assert.equal(ids(searchIndex(buildSearchIndex({ chatChannels, chatMessages, frontingIds: [] }), "vault")).length, 0);
  assert.equal(searchIndex(buildSearchIndex({ chatChannels, chatMessages, frontingIds: ["a1"] }), "hidden").length, 1);
});

test("fronting notes, triggers, group and contact notes, relationships, pages", () => {
  const index = buildSearchIndex({
    alters,
    frontingSessions: [{ id: "s1", alter_id: "a1", start_time: "2017-07-07T09:00:00Z", note: JSON.stringify([{ text: "felt the lighthouse", timestamp: "2017-07-07T10:00:00Z" }]), trigger_label: "loud thunder" }],
    groups: [{ id: "g1", name: "Littles" }],
    groupNotes: [{ id: "gn1", group_id: "g1", content: "crayon box", created_date: "2016-01-01T00:00:00Z" }],
    contacts: [{ id: "k1", name: "Dr Lee" }],
    contactNotes: [{ id: "kn1", contact_id: "k1", content: "talked about sleep", timestamp: "2016-02-02T00:00:00Z" }],
    contactEncounters: [{ id: "ke1", contact_id: "k1", note: "coffee chat", start_time: "2016-03-03T00:00:00Z" }],
    relationships: [{ id: "r1", alter_id_a: "a1", alter_id_b: "a2", relationship_type: "Protector of" }],
    pages: [{ id: "planner", label: "Planner", path: "/planner" }],
  });
  assert.equal(searchIndex(index, "lighthouse")[0].path, "/timeline?date=2017-07-07&focusSessionId=s1");
  assert.equal(searchIndex(index, "thunder")[0].type, "front");
  assert.equal(searchIndex(index, "crayon")[0].path, "/group/g1?tab=notes");
  assert.equal(searchIndex(index, "lee sleep")[0].type, "contactnote");
  assert.equal(searchIndex(index, "coffee")[0].type, "contactnote");
  assert.equal(searchIndex(index, "protector sky")[0].type, "relationship");
  assert.equal(searchIndex(index, "calendar")[0].path, "/planner");
});

test("whisper secrets are never indexed", () => {
  const index = buildSearchIndex({ journals: [{ id: "j", title: "t", content: 'hi <span data-whisper="1" data-whisper-to="a1">tuna sandwich</span>' }] });
  assert.equal(searchIndex(index, "tuna").length, 0);
});

test("a lifetime of records still searches quickly", () => {
  const N = 60000;
  const journals = Array.from({ length: N }, (_, i) => ({ id: `j${i}`, title: `Entry ${i}`, content: `<p>Day ${i} notes about things and stuff number ${i % 997}</p>`, created_date: new Date(2000, 0, 1 + (i % 9000)).toISOString() }));
  let t = performance.now();
  const index = buildSearchIndex({ journals });
  const buildMs = performance.now() - t;
  t = performance.now();
  const hits = searchIndex(index, "stuff number 42");
  const searchMs = performance.now() - t;
  assert.ok(hits.length > 0 && hits.length < N);
  assert.ok(hits.some((h) => h.id === "j42"), "oldest-era record found");
  console.log(`    ${N} records: build ${buildMs.toFixed(0)} ms, search ${searchMs.toFixed(1)} ms`);
  assert.ok(searchMs < 400, "search stays fast");
});

console.log(`\n${passed} passed`);
