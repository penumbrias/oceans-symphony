#!/usr/bin/env node
// Checks Goals for writing (src/lib/goalWriting.js): chapter numbers,
// word counts and tags.
//
//
//   node scripts/test-goal-writing.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  // goalTree's writers aren't used here: stand-ins keep IndexedDB out.
  const STUBS = {
    "@/api/base44Client": "export const base44 = {};",
    "@/lib/localDb": "export const withTrashBatch = (f) => f();",
    "@/lib/taskCreate": "export const createTask = () => {}; export const deleteTask = () => {};",
    "@/lib/boardStore": "export const trashProfileBoards = () => {};",
    "@/lib/profileBoard": "export const PAGE_BOARD_OWNER_TYPE = 'page';",
  };
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
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const { indexPages } = await import("../src/lib/goalTree.js");
const W = await import("../src/lib/goalWriting.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const goals = [
  { id: "book", title: "My book", child_section_style: "chapter", tags: ["story"] },
  { id: "c1", parent_id: "book", order: 1, title: "Arrival", section_style: "chapter", tags: ["#plot", "Mira"] },
  { id: "n1", parent_id: "book", order: 2, title: "Notes" },
  { id: "c2", parent_id: "book", order: 3, title: "The storm", section_style: "chapter", why: "Rain all night." },
  { id: "s1", parent_id: "c2", order: 1, title: "Harbour", section_style: "scene", tags: ["plot"] },
  { id: "loop", parent_id: "loop", title: "Self", section_style: "chapter" },
];
const steps = [
  { id: "t1", goal_id: "c1", kind: "text", body: "She came by **boat**, at dawn." },
  { id: "t2", goal_id: "s1", kind: "text", body: "<p>The [[Harbour]] was quiet.</p>" },
  { id: "t3", goal_id: "c2", kind: "check", title: "Fix the ending" },
  { id: "t4", goal_id: "c2", kind: "text", body: "gone", removed_at: "2026-11-01" },
];
const index = indexPages(goals);

test("chapters are numbered among their own style, in page order", () => {
  assert.equal(W.sectionNumber(index, index.byId.get("c1")), 1);
  assert.equal(W.sectionNumber(index, index.byId.get("c2")), 2);
  assert.equal(W.sectionHeading(index, index.byId.get("c2")), "Chapter 2");
  assert.equal(W.sectionHeading(index, index.byId.get("s1")), "Scene 1");
  assert.equal(W.sectionHeading(index, index.byId.get("n1")), null);
});

test("a section that loops to itself still gets a number, not a hang", () => {
  assert.equal(W.sectionHeading(index, index.byId.get("loop")), "Chapter 1");
});

test("words are counted without markup, links or removed notes", () => {
  assert.equal(W.countWords("She came by **boat**, at dawn."), 6);
  assert.equal(W.countWords("<p>The [[Harbour]] was quiet.</p>"), 4);
  assert.equal(W.countWords("don't stop — it's fine"), 4);
  assert.equal(W.countWords(""), 0);
  assert.equal(W.pageWordCount(index, steps, "c2"), 3 + 4);
  assert.equal(W.pageWordCount(index, steps, "book"), 6 + 3 + 4);
});

test("tags are kept once, without #, whatever their case", () => {
  assert.deepEqual(W.pageTags(index.byId.get("c1")), ["plot", "Mira"]);
  assert.deepEqual(W.withTag(["plot"], "#Plot"), ["plot"]);
  assert.deepEqual(W.withTag(["plot"], "big twist"), ["plot", "big-twist"]);
  assert.deepEqual(W.withoutTag(["plot", "Mira"], "mira"), ["plot"]);
  assert.deepEqual(W.allPageTags(goals).map((t) => [t.tag, t.count]), [["plot", 2], ["Mira", 1], ["story", 1]]);
  assert.ok(W.pageHasTag(index.byId.get("s1"), "#PLOT"));
  assert.ok(!W.pageHasTag(index.byId.get("n1"), "plot"));
});

console.log(`\n${passed} passed`);
