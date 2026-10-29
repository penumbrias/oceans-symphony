#!/usr/bin/env node
// Checks widget layers (v0.314.0, src/lib/experimentalHome.js): a widget
// set to overlap never pushes or is pushed, and the layer buttons step
// and jump past the other widgets within the allowed range.
//
//   node scripts/test-widget-layers.mjs

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
const { resolveOverlaps, hasOverlaps, compactVertically, nextLayer, layerOf, isLayered } = await import("../src/lib/experimentalHome.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const w = (id, x, y, cols, rows = 1, settings = {}) => ({ instanceId: id, widgetId: "w", pos: { x, y }, span: { cols, rows }, settings });
const at = (list, id) => list.find((v) => v.instanceId === id);

test("an overlapping widget doesn't push the one under it", () => {
  const ws = [w("a", 0, 0, 4, 2), w("b", 1, 1, 2, 1, { layered: true })];
  const out = resolveOverlaps(ws, 4, "b");
  assert.deepEqual(at(out, "a").pos, { x: 0, y: 0 });
  assert.deepEqual(at(out, "b").pos, { x: 1, y: 1 });
  assert.equal(hasOverlaps(ws, 4), false);
});

test("a normal widget moved onto an overlapping one stays put", () => {
  const ws = [w("a", 0, 0, 4, 2, { layered: true }), w("b", 0, 0, 4, 1)];
  const out = resolveOverlaps(ws, 4, "b");
  assert.deepEqual(at(out, "b").pos, { x: 0, y: 0 });
  assert.deepEqual(at(out, "a").pos, { x: 0, y: 0 });
});

test("ordinary widgets still push each other", () => {
  const ws = [w("a", 0, 0, 4, 2), w("b", 0, 1, 4, 1)];
  assert.equal(hasOverlaps(ws, 4), true);
  assert.deepEqual(at(resolveOverlaps(ws, 4, "a"), "b").pos, { x: 0, y: 2 });
});

test("closing gaps leaves an overlapping widget where it is", () => {
  const ws = [w("a", 0, 3, 2, 1, { layered: true }), w("b", 2, 3, 2, 1)];
  const out = compactVertically(ws, 4);
  assert.deepEqual(at(out, "a").pos, { x: 0, y: 3 });
  assert.deepEqual(at(out, "b").pos, { x: 2, y: 0 });
});

test("layer buttons", () => {
  const ws = [w("a", 0, 0, 1, 1, { zLayer: 3 }), w("b", 0, 0, 1, 1, { zLayer: -2 }), w("c", 0, 0, 1)];
  assert.equal(nextLayer(ws, "c", "front"), 4);
  assert.equal(nextLayer(ws, "c", "back"), -3);
  assert.equal(nextLayer(ws, "c", "forward"), 1);
  assert.equal(nextLayer(ws, "a", "backward"), 2);
  assert.equal(nextLayer(ws, "a", "front"), 3, "already in front stays");
  assert.equal(nextLayer([w("x", 0, 0, 1, 1, { zLayer: 20 }), w("y", 0, 0, 1)], "y", "front"), 20, "clamped");
  assert.equal(layerOf(w("z", 0, 0, 1, 1, { zLayer: "" })), 0);
  assert.equal(isLayered(w("z", 0, 0, 1, 1, { layered: "" })), false);
});

console.log(`\n${passed} passed`);
