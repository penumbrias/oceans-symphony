#!/usr/bin/env node
// Checks the one group tree (src/lib/groupTree.js): parents by id or by an
// imported sp_id, every spelling of "top level", and that loops, self-
// parents and deleted parents can never hide a group.
//
//   node scripts/test-group-tree.mjs

import assert from "node:assert/strict";
import {
  rootGroups, childGroups, descendantGroupIds, wouldNest, flattenGroupTree,
  strandedGroups, parentGroupOf, resolvedParentId, indexGroups,
} from "../src/lib/groupTree.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const ids = (list) => list.map((g) => g.id).sort();

const groups = [
  { id: "a", name: "A", parent: "root" },
  { id: "b", name: "B", sp_id: "SPB", parent: "" },
  { id: "c", name: "C", parent: "SPB" },        // imported: parent by sp_id
  { id: "d", name: "D", parent: "b" },          // parent by id on an imported group
  { id: "e", name: "E", parent: "c" },
  { id: "f", name: "F", parent: "gone" },       // parent deleted
  { id: "g", name: "G", parent: "g" },          // self-parent
  { id: "h", name: "H", parent: "i" },          // loop h ↔ i
  { id: "i", name: "I", parent: "h" },
  { id: "j", name: "J" },
  { id: "k", name: "K", parent: "none" },
];

test("top level covers every spelling plus stranded groups", () => {
  assert.deepEqual(ids(rootGroups(groups)), ["a", "b", "f", "g", "h", "i", "j", "k"]);
});

test("children resolve parents by id and by sp_id", () => {
  assert.deepEqual(ids(childGroups(groups, "b")), ["c", "d"]);
  assert.equal(parentGroupOf(groups[2], groups).id, "b");
  assert.equal(resolvedParentId(groups[2], indexGroups(groups)), "b");
});

test("a self-parent is never its own child", () => {
  assert.deepEqual(childGroups(groups, "g"), []);
});

test("descendants walk the whole subtree and stop on loops", () => {
  assert.deepEqual(descendantGroupIds(groups, "b").sort(), ["c", "d", "e"]);
  assert.deepEqual(descendantGroupIds(groups, "h"), []);
});

test("nesting into your own subtree is refused, including through sp_id", () => {
  assert.equal(wouldNest(groups, "b", "e"), true);
  assert.equal(wouldNest(groups, "b", "b"), true);
  assert.equal(wouldNest(groups, "e", "a"), false);
  assert.equal(wouldNest(groups, "e", null), false);
});

test("flatten lists every group exactly once", () => {
  const flat = flattenGroupTree(groups);
  assert.equal(flat.length, groups.length);
  assert.equal(new Set(flat.map((g) => g.id)).size, groups.length);
  assert.equal(flat.find((g) => g.id === "e")._depth, 2);
});

test("stranded groups are the deleted-parent and loop ones", () => {
  assert.deepEqual(ids(strandedGroups(groups)), ["f", "g", "h", "i"]);
});

console.log(`\n${passed} passed`);
