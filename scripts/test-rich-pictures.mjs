#!/usr/bin/env node
// Checks pictures in written text (v0.364.0, src/lib/richPictures.js): the
// HTML each layout writes, that a set reads back off the text unchanged,
// and that index.css holds the slideshow keyframes the HTML names.
//
//   node scripts/test-rich-pictures.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const { pictureSetHtml, normalizePictureSet, slideshowKeyframes, MAX_SLIDES, shapesFor } = await import("../src/lib/richPictures.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const A = "/local-image/a", B = "/local-image/b", C = "/local-image/c";
const dataOf = (html) => {
  const m = /data-os-pic="([^"]+)"/.exec(html);
  return m ? JSON.parse(decodeURIComponent(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))) : null;
};

test("a plain picture stays a plain <img> like before", () => {
  const html = pictureSetHtml({ images: [{ src: A }], width: 50 });
  assert.match(html, /^<img src="\/local-image\/a"/);
  assert.match(html, /width:50%;max-width:100%;height:auto;border-radius:8px;display:block;margin:6px 0;/);
});

test("a framed picture sits in a clipping box with its frame", () => {
  const html = pictureSetHtml({ images: [{ src: A, frame: { x: 20, y: 30, zoom: 2 } }], shape: "square" });
  assert.match(html, /^<div[^>]*aspect-ratio:1 \/ 1;overflow:hidden;/);
  assert.match(html, /object-position:20% 30%;transform:scale\(2\);transform-origin:20% 30%/);
});

test("a framed picture in its own shape keeps its height", () => {
  const html = pictureSetHtml({ images: [{ src: A, frame: { x: 50, y: 10, zoom: 1.5 } }] });
  assert.doesNotMatch(html, /aspect-ratio/);
  assert.match(html, /height:auto/);
});

test("one after another writes each picture on its own, each editable", () => {
  const html = pictureSetHtml({ images: [{ src: A }, { src: B }], layout: "inline" });
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.equal((html.match(/data-os-pic=/g) || []).length, 2);
  assert.equal(dataOf(html).images.length, 1);
});

test("a carousel scrolls sideways and needs a shape", () => {
  const html = pictureSetHtml({ images: [{ src: A }, { src: B }], layout: "carousel", shape: "original" });
  assert.match(html, /data-os-gallery="carousel"/);
  assert.match(html, /overflow-x:auto;scroll-snap-type:x mandatory/);
  assert.match(html, /aspect-ratio:4 \/ 3/);
  assert.equal(dataOf(html).shape, "wide");
});

test("a slideshow stacks the pictures and fades them in turn", () => {
  const html = pictureSetHtml({ images: [{ src: A }, { src: B }, { src: C }], layout: "slideshow", seconds: 4, shape: "banner" });
  assert.match(html, /data-os-gallery="slideshow"/);
  assert.match(html, /animation:os-slides-3 12s linear 0s infinite/);
  assert.match(html, /animation:os-slides-3 12s linear 8s infinite/);
  assert.equal((html.match(/grid-area:1 \/ 1/g) || []).length, 3);
});

test("a set reads back the same", () => {
  const set = { images: [{ src: A, frame: { x: 10, y: 90, zoom: 3 } }, { src: B }], layout: "slideshow", shape: "circle", width: 60, corners: 4, seconds: 7 };
  assert.deepEqual(dataOf(pictureSetHtml(set)), normalizePictureSet(set));
});

test("unsafe sources are dropped, and one picture is never a gallery", () => {
  const set = normalizePictureSet({ images: [{ src: "javascript:alert(1)" }, { src: B }], layout: "carousel" });
  assert.deepEqual(set.images, [{ src: B }]);
  assert.equal(set.layout, "inline");
  assert.equal(pictureSetHtml({ images: [{ src: 'x" onerror="y' }] }), "");
});

test("attribute values are escaped", () => {
  const html = pictureSetHtml({ images: [{ src: 'https://e.com/a"b.png' }] });
  assert.match(html, /src="https:\/\/e\.com\/a&quot;b\.png"/);
});

test("too many for a slideshow become a carousel; only inline offers 'as it is'", () => {
  const many = Array.from({ length: MAX_SLIDES + 1 }, (_, i) => ({ src: `/local-image/${i}` }));
  assert.equal(normalizePictureSet({ images: many, layout: "slideshow" }).layout, "carousel");
  assert.ok(shapesFor("inline").some((s) => s.value === "original"));
  assert.ok(!shapesFor("slideshow").some((s) => s.value === "original"));
});

test("index.css holds every slideshow keyframe", () => {
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  for (let n = 2; n <= MAX_SLIDES; n++) assert.ok(css.includes(slideshowKeyframes(n)), `os-slides-${n} missing or different`);
});

console.log(`\n${passed} passed`);
