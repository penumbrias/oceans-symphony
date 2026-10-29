#!/usr/bin/env node
// Checks "drop beside" (placeBeside in src/lib/experimentalHome.js): a
// widget dropped on another's edge joins that row on that side, the row
// shares the full width evenly, minimum widths hold, heights and other rows
// are untouched, and a full row refuses (the drop falls back to a cell).
//
//   node scripts/test-place-beside.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// experimentalHome imports "@/lib/…"; map the alias to src/.
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
const { placeBeside, resolveOverlaps, hasOverlaps } = await import("../src/lib/experimentalHome.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const w = (id, x, y, cols, rows = 1) => ({ instanceId: id, widgetId: "w", pos: { x, y }, span: { cols, rows }, settings: { keep: id } });
const at = (list, id) => list.find((v) => v.instanceId === id);

const board = [w("a", 0, 0, 4), w("b", 0, 1, 4, 2), w("c", 0, 3, 4)];

test("right of a full-width widget makes two halves", () => {
  const next = placeBeside(board, 4, "c", "a", "right");
  assert.deepEqual(at(next, "a").pos, { x: 0, y: 0 });
  assert.equal(at(next, "a").span.cols, 2);
  assert.deepEqual(at(next, "c").pos, { x: 2, y: 0 });
  assert.equal(at(next, "c").span.cols, 2);
  assert.equal(at(next, "c").span.rows, 1, "height untouched");
  assert.deepEqual(at(next, "b"), board[1], "other rows untouched");
  assert.equal(at(next, "c").settings.keep, "c", "settings kept");
});

test("left side puts the moved widget first", () => {
  const next = placeBeside(board, 4, "c", "a", "left");
  assert.deepEqual(at(next, "c").pos, { x: 0, y: 0 });
  assert.deepEqual(at(next, "a").pos, { x: 2, y: 0 });
});

test("a third widget shares the row (5 columns: 2, 2, 1)", () => {
  const two = placeBeside(board, 5, "c", "a", "right");
  const three = placeBeside(two, 5, "b", "c", "right");
  const row = ["a", "c", "b"].map((id) => at(three, id));
  assert.deepEqual(row.map((v) => v.pos.x), [0, 2, 4]);
  assert.deepEqual(row.map((v) => v.span.cols), [2, 2, 1]);
  assert.ok(row.every((v) => v.pos.y === 0));
  assert.equal(at(three, "b").span.rows, 2, "taller widget keeps its height");
});

test("moving within a row reorders it", () => {
  const two = placeBeside(board, 4, "c", "a", "right"); // a | c
  const swapped = placeBeside(two, 4, "c", "a", "left"); // c | a
  assert.deepEqual(at(swapped, "c").pos, { x: 0, y: 0 });
  assert.deepEqual(at(swapped, "a").pos, { x: 2, y: 0 });
});

test("minimum widths are kept", () => {
  const next = placeBeside(board, 4, "c", "a", "right", (v) => (v.instanceId === "a" ? 3 : 1));
  assert.equal(at(next, "a").span.cols, 3);
  assert.equal(at(next, "c").span.cols, 1);
});

test("a full row refuses", () => {
  const row = [w("a", 0, 0, 1), w("b", 1, 0, 1), w("c", 2, 0, 1), w("d", 3, 0, 1), w("e", 0, 1, 4)];
  assert.equal(placeBeside(row, 4, "e", "a", "right"), null);
  assert.equal(placeBeside(board, 4, "c", "a", "right", () => 3), null, "minimums too wide");
});

test("bad ids and self refuse", () => {
  assert.equal(placeBeside(board, 4, "a", "a", "right"), null);
  assert.equal(placeBeside(board, 4, "zz", "a", "right"), null);
  assert.equal(placeBeside(board, 4, "a", "zz", "right"), null);
});

test("taller moved widget pushes the next row down, no overlaps", () => {
  const tall = [w("a", 0, 0, 4), w("b", 0, 1, 4), w("t", 0, 2, 4, 3)];
  const next = resolveOverlaps(placeBeside(tall, 4, "t", "a", "right"), 4, "t");
  assert.equal(hasOverlaps(next, 4), false);
  assert.deepEqual(at(next, "t").pos, { x: 2, y: 0 });
  assert.ok(at(next, "b").pos.y >= 3);
});

console.log(`\n${passed} checks passed`);
