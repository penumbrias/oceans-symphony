// Tests for the drawing pad's pure helpers (src/lib/inkDrawing.js).
// Run: node scripts/test-ink-drawing.mjs
import assert from "node:assert/strict";
import { strokeWidth, strokesBounds, hasInk, drawingHtml, isInkImageClass, INK_CLASS } from "../src/lib/inkDrawing.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("finger and mouse draw the chosen size", () => {
  assert.equal(strokeWidth(6, null), 6);
  assert.equal(strokeWidth(6, 0.5), 6);
  assert.equal(strokeWidth(6, 0), 6);
});
t("a stylus draws lighter and heavier with pressure", () => {
  assert.ok(strokeWidth(10, 0.1) < 10);
  assert.ok(strokeWidth(10, 1) > 10);
  assert.ok(strokeWidth(10, 0.01) >= 0.5);
});
t("an empty page has no bounds and no ink", () => {
  assert.equal(strokesBounds([]), null);
  assert.equal(hasInk([]), false);
  assert.equal(hasInk([{ tool: "eraser", size: 10, points: [{ x: 5, y: 5 }] }]), false);
});
t("bounds hug the strokes with room for the line", () => {
  const b = strokesBounds([{ tool: "pen", size: 4, points: [{ x: 10, y: 20 }, { x: 50, y: 30 }] }], 0);
  assert.deepEqual(b, { x: 8, y: 18, w: 44, h: 14 });
});
t("eraser strokes don't grow the drawing", () => {
  const pen = { tool: "pen", size: 2, points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] };
  const eraser = { tool: "eraser", size: 30, points: [{ x: 300, y: 300 }] };
  assert.deepEqual(strokesBounds([pen, eraser]), strokesBounds([pen]));
});
t("ink markup is inline, em-sized and marked", () => {
  const html = drawingHtml("/local-image/drawing-1", { mode: "ink", w: 32, h: 16 });
  assert.ok(html.includes(`class="${INK_CLASS}"`));
  assert.ok(html.includes("width:2em"));
  assert.ok(html.includes("aspect-ratio:32 / 16"));
  assert.ok(html.includes("display:inline-block"));
  assert.ok(!html.includes("url("));
});
t("picture markup is a plain block picture", () => {
  const html = drawingHtml("/local-image/drawing-2", { mode: "picture", w: 200, h: 100 });
  assert.ok(!html.includes(INK_CLASS));
  assert.ok(html.includes("display:block"));
  assert.ok(html.includes("width:200px"));
});
t("quotes in a url can't break out of the attribute", () => {
  assert.ok(!drawingHtml('/local-image/a"b', { mode: "ink", w: 1, h: 1 }).includes('a"b'));
});
t("the ink class is matched as a whole word", () => {
  assert.equal(isInkImageClass("ink-drawing"), true);
  assert.equal(isInkImageClass("foo ink-drawing bar"), true);
  assert.equal(isInkImageClass("ink-drawings"), false);
  assert.equal(isInkImageClass(null), false);
});
console.log(`\n${n} ink drawing tests passed`);
