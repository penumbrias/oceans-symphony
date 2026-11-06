#!/usr/bin/env node
// Checks the stable edit layout and grid snapping (src/lib/experimentalHome.js):
// a flow page re-seats in order when a widget moves or resizes, and widgets
// placed between grid lines (snapping off) still never slide into each other.
//
//   node scripts/test-board-snap.mjs

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
const {
  flowOrder, flowRepack, flowMove, flowPlace, compactVertically, findFreeCell, resolveOverlaps, hasOverlaps,
  widgetSnaps, snapStepFor, fitRowsToContent, isOffGrid, FINE_STEP, resolveExperimentalHome,
} = await import("../src/lib/experimentalHome.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const w = (id, x, y, cols, rows = 1, settings = {}) => ({ instanceId: id, widgetId: "w", pos: { x, y }, span: { cols, rows }, settings });
const at = (list, id) => list.find((v) => v.instanceId === id);
const ids = (list) => flowOrder(list).map((v) => v.instanceId).join(",");

test("flow order reads top to bottom, left to right", () => {
  assert.equal(ids([w("c", 0, 3, 4), w("b", 2, 0, 2), w("a", 0, 0, 2)]), "a,b,c");
});

test("repacking wraps a row that is full", () => {
  const out = flowRepack([w("a", 0, 0, 2, 2), w("b", 0, 5, 2), w("c", 0, 9, 4)], 4);
  assert.deepEqual(at(out, "a").pos, { x: 0, y: 0 });
  assert.deepEqual(at(out, "b").pos, { x: 2, y: 0 });
  assert.deepEqual(at(out, "c").pos, { x: 0, y: 2 });
});

test("moving a widget in a flow page changes the order, not the stored array", () => {
  const list = [w("a", 0, 0, 4), w("b", 0, 1, 4), w("c", 0, 2, 4)];
  const out = flowMove(list, 4, "c", "a");
  assert.equal(ids(out), "c,a,b");
  assert.deepEqual(out.map((v) => v.instanceId), ["a", "b", "c"]);
  assert.equal(hasOverlaps(out, 4), false);
});

test("quarter-width widgets share a row in a flow page", () => {
  const out = flowRepack([w("a", 0, 0, 1.25), w("b", 0, 1, 2.75), w("c", 0, 2, 0.5)], 4);
  assert.deepEqual(at(out, "b").pos, { x: 1.25, y: 0 });
  assert.deepEqual(at(out, "c").pos, { x: 0, y: 1 });
});

test("snapping: a widget's own choice beats the app-wide one", () => {
  assert.equal(widgetSnaps(w("a", 0, 0, 1), true), true);
  assert.equal(widgetSnaps(w("a", 0, 0, 1), false), false);
  assert.equal(widgetSnaps(w("a", 0, 0, 1, 1, { snap: false }), true), false);
  assert.equal(widgetSnaps(w("a", 0, 0, 1, 1, { snap: true }), false), true);
  assert.equal(widgetSnaps(w("a", 0, 0, 1, 1, { snap: "" }), false), false);
  assert.equal(snapStepFor(w("a", 0, 0, 1), false), FINE_STEP);
  assert.equal(snapStepFor(w("a", 0, 0, 1), true), 1);
});

test("off-grid widgets are told apart", () => {
  assert.equal(isOffGrid(w("a", 1, 2, 2, 1)), false);
  assert.equal(isOffGrid(w("a", 1.25, 2, 2, 1)), true);
  assert.equal(isOffGrid(w("a", 1, 2, 2, 1.5)), true);
});

test("closing gaps never stacks widgets that sit between grid lines", () => {
  const out = compactVertically([w("a", 0, 0, 1.5, 1), w("b", 1, 3, 2, 1), w("c", 3.5, 4, 0.5, 1)], 4);
  assert.equal(hasOverlaps(out, 4), false);
  assert.equal(at(out, "b").pos.y, 1); // shares a column with a, lands under it
  assert.equal(at(out, "c").pos.y, 0); // nothing above it
});

test("closing gaps still works on whole cells", () => {
  const out = compactVertically([w("a", 0, 0, 2, 2), w("b", 0, 5, 2), w("c", 2, 4, 2)], 4);
  assert.deepEqual(at(out, "b").pos, { x: 0, y: 2 });
  assert.deepEqual(at(out, "c").pos, { x: 2, y: 0 });
});

test("a new widget never lands on one that sits between grid lines", () => {
  const cell = findFreeCell([w("a", 0.5, 0, 1, 1)], 4, { cols: 1, rows: 1 });
  assert.notDeepEqual(cell, { x: 0, y: 0 });
  assert.notDeepEqual(cell, { x: 1, y: 0 });
  assert.deepEqual(cell, { x: 2, y: 0 });
});

test("pushing aside works with quarter steps", () => {
  const out = resolveOverlaps([w("a", 0, 0, 2.25, 1.5), w("b", 2, 0, 2, 1)], 4, "a");
  assert.equal(hasOverlaps(out, 4), false);
  assert.equal(at(out, "b").pos.y, 1.5);
});

test("reading a board keeps quarter steps and rounds anything finer", () => {
  const reg = { w: { defaultSpan: { cols: 2, rows: 1 } } };
  const home = resolveExperimentalHome({ version: 2, pages: [{ id: "p", layoutMode: "free", widgets: [
    { instanceId: "a", widgetId: "w", span: { cols: 1.25, rows: 1.5 }, pos: { x: 0.75, y: 2.3 } },
    { instanceId: "b", widgetId: "w", span: { cols: 2, rows: 1 }, pos: { x: 1, y: 0 } },
  ] }] }, reg);
  const [a, b] = home.pages[0].widgets;
  assert.deepEqual(a.span, { cols: 1.25, rows: 1.5 });
  assert.deepEqual(a.pos, { x: 0.75, y: 2.25 });
  assert.deepEqual(b.span, { cols: 2, rows: 1 });
  assert.deepEqual(b.pos, { x: 1, y: 0 });
});

test("flow drop above or below another widget moves it in the order", () => {
  const page = flowRepack([w("a", 0, 0, 4), w("b", 0, 1, 4), w("c", 0, 2, 4)], 4);
  assert.equal(ids(flowPlace(page, 4, "c", "a", "before")), "c,a,b");
  assert.equal(ids(flowPlace(page, 4, "a", "c", "after")), "b,c,a");
  assert.equal(ids(flowPlace(page, 4, "a", "b", "after")), "b,a,c");
  assert.equal(flowPlace(page, 4, "a", "a", "after"), null);
});

test("flow drop on a widget's edge puts them side by side and shares the row", () => {
  const page = flowRepack([w("a", 0, 0, 4), w("b", 0, 1, 4), w("c", 0, 2, 4)], 4);
  const out = flowPlace(page, 4, "c", "a", "right");
  assert.equal(ids(out), "a,c,b");
  assert.deepEqual(at(out, "a").pos, { x: 0, y: 0 });
  assert.deepEqual(at(out, "c").pos, { x: 2, y: 0 });
  assert.equal(at(out, "a").span.cols, 2);
  assert.equal(at(out, "c").span.cols, 2);
  assert.deepEqual(at(out, "b").pos, { x: 0, y: 1 });
  const left = flowPlace(page, 4, "c", "b", "left");
  assert.equal(ids(left), "a,c,b");
  assert.equal(hasOverlaps(left, 4), false);
});

test("flow drop beside keeps rows below in order and the array order stored", () => {
  const page = flowRepack([w("a", 0, 0, 2), w("b", 2, 0, 2), w("c", 0, 1, 4), w("d", 0, 2, 4)], 4);
  const out = flowPlace(page, 4, "a", "d", "left");
  assert.deepEqual(out.map((v) => v.instanceId), ["a", "b", "c", "d"]);
  assert.equal(ids(out), "b,c,a,d");
  assert.equal(hasOverlaps(out, 4), false);
});

test("flow drop in empty space stands at the chosen column (flowAt)", () => {
  // Penumbra's profile: a row with room left over, then a narrow widget.
  const page = flowRepack([w("a", 0, 0, 2), w("b", 2, 0, 1), w("c", 0, 1, 1)], 4);
  // Dropped below the row at column 1.5 → its own row, at 1.5.
  const below = flowPlace(page, 4, "c", "b", "after", () => 1, 1.5);
  assert.deepEqual(at(below, "c").pos, { x: 1.5, y: 1 });
  assert.equal(at(below, "c").settings.flowAt, 1.5);
  // Dropped in the row's empty end → joins that row (room for it).
  const end = flowPlace(page, 4, "c", "b", "after", () => 1, 3);
  assert.deepEqual(at(end, "c").pos, { x: 3, y: 0 });
  // A column already passed on the row starts the next row there.
  const back = flowPlace(page, 4, "c", "b", "after", () => 1, 1);
  assert.deepEqual(at(back, "c").pos, { x: 1, y: 1 });
  // A wider widget is held inside the page.
  const wide = flowRepack([{ ...w("d", 0, 0, 3), settings: { flowAt: 3 } }], 4);
  assert.deepEqual(at(wide, "d").pos, { x: 1, y: 0 });
  // Dropping on a widget's edge clears the column.
  const joined = flowPlace(below, 4, "c", "a", "left");
  assert.equal(at(joined, "c").settings.flowAt, undefined);
  assert.equal(hasOverlaps(below, 4), false);
});

test("rows follow the content and keep the gaps below", () => {
  const w = (id, x, y, cols, rows, settings) => ({ instanceId: id, pos: { x, y }, span: { cols, rows }, ...(settings ? { settings } : {}) });
  const ws = [w("head", 0, 0, 4, 2), w("side", 4, 0, 2, 3), w("bio", 0, 3, 4, 2), w("own", 0, 6, 4, 2, { autoFit: false })];
  const out = fitRowsToContent(ws, { head: 1, side: 3, bio: 6, own: 9 }, 6);
  const at = (id) => out.find((x) => x.instanceId === id);
  assert.equal(at("head").span.rows, 1);
  assert.equal(at("bio").pos.y, 2, "bio moves up with the header, keeping its one-row gap");
  assert.equal(at("bio").span.rows, 6);
  assert.equal(at("own").span.rows, 2, "hand-sized keeps its rows");
  assert.equal(at("own").pos.y, 9, "and moves down below the taller bio, gap kept");
  assert.equal(at("side").pos.y, 0, "a widget beside it doesn't move");
  assert.equal(fitRowsToContent(ws, { head: 2, bio: 2 }, 6), ws, "nothing to change returns the same list");
});

console.log(`\n${passed} passed`);
