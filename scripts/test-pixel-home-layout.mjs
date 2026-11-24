#!/usr/bin/env node
// Checks "Use the pixel layout" (src/lib/pixelHomeLayout.js): it builds ONE
// new page in the pixel mockup's arrangement from widgets the registry has,
// and adding it leaves every other page, widget (unknown ones included),
// the default page and the board's own fields exactly as they were.
//
//   node scripts/test-pixel-home-layout.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// pixelHomeLayout imports "@/lib/…"; map the alias to src/.
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
  buildPixelHomePage, withPixelHomePage, freePageLabel, PIXEL_DESK_WIDGETS, PIXEL_PHONE_WIDGETS,
} = await import("../src/lib/pixelHomeLayout.js");
const { resolveExperimentalHome } = await import("../src/lib/experimentalHome.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const def = (extra = {}) => ({ minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 8 }, supportsModes: ["minimal", "normal"], ...extra });
const registry = Object.fromEntries(
  [...PIXEL_DESK_WIDGETS, ...PIXEL_PHONE_WIDGETS].map((s) => [s.widgetId, def()]),
);

const person = {
  version: 2, enabled: true, defaultPageId: "p1", styleMode: "glass",
  grid: { phoneCols: 4, rowPx: 40 }, _lt: "2026-11-01T00:00:00.000Z", _heals: { norm_v4: true },
  _removedPages: { gone: "2026-10-01T00:00:00.000Z" },
  pages: [
    { id: "p1", label: "Home", layoutMode: "free", _ut: "2026-11-02T00:00:00.000Z",
      widgets: [{ instanceId: "w1", widgetId: "status_note", span: { cols: 4, rows: 1 }, pos: { x: 0, y: 0 }, settings: { mine: 1 } }],
      unknownWidgets: [{ instanceId: "wx", widgetId: "from_the_future", span: { cols: 2, rows: 1 } }] },
    { id: "p2", label: "Pixel desk", layoutMode: "free", widgets: [] },
  ],
};
const frozen = JSON.stringify(person);

test("the desk page is three columns over two rows, in the mockup's order", () => {
  const page = buildPixelHomePage(registry, "desk", []);
  assert.deepEqual(page.widgets.map((w) => w.widgetId), PIXEL_DESK_WIDGETS.map((s) => s.widgetId));
  const rows = [...new Set(page.widgets.map((w) => w.pos.y))];
  assert.equal(rows.length, 2);
  for (const y of rows) {
    const row = page.widgets.filter((w) => w.pos.y === y);
    assert.equal(row.length, 3);
    assert.equal(row.reduce((n, w) => n + w.span.cols, 0), 4, "a row fills the 4 columns");
  }
  for (const w of page.widgets) assert.equal(w.span.cols * 4, Math.round(w.span.cols * 4), "quarter steps");
  assert.equal(page.label, "Pixel desk");
  assert.equal(page.layoutMode, "free");
});

test("the phone page is one full-width column, timeline in its short mode", () => {
  const page = buildPixelHomePage(registry, "phone", []);
  assert.deepEqual(page.widgets.map((w) => w.span.cols), page.widgets.map(() => 4));
  assert.deepEqual(page.widgets.map((w) => w.pos.y), page.widgets.map((_, i) => i));
  assert.equal(page.widgets.find((w) => w.widgetId === "timeline_days").mode, "minimal");
  assert.equal(page.showAs, "phone");
});

test("a widget this build doesn't have is skipped, not stored broken", () => {
  const { current_focus: _drop, ...less } = registry;
  const page = buildPixelHomePage(less, "desk", []);
  assert.ok(!page.widgets.some((w) => w.widgetId === "current_focus"));
  assert.equal(page.widgets.length, PIXEL_DESK_WIDGETS.length - 1);
});

test("the page name never clashes with one the person has", () => {
  assert.equal(freePageLabel("Pixel desk", person.pages), "Pixel desk 2");
  assert.equal(freePageLabel("Pixel desk", [...person.pages, { label: "pixel desk 2" }]), "Pixel desk 3");
  assert.equal(buildPixelHomePage(registry, "desk", person.pages).label, "Pixel desk 2");
});

test("adding the page keeps everything the person had, byte for byte", () => {
  const page = buildPixelHomePage(registry, "desk", person.pages);
  const next = withPixelHomePage(person, page);
  assert.equal(JSON.stringify(person), frozen, "input not mutated");
  assert.equal(next.pages.length, 3);
  assert.equal(JSON.stringify(next.pages.slice(0, 2)), JSON.stringify(person.pages), "own pages unchanged, same order");
  assert.equal(next.pages[2], page);
  for (const k of Object.keys(person)) if (k !== "pages") assert.deepEqual(next[k], person[k], `${k} unchanged`);
});

test("no board means no write — never a fresh board in its place", () => {
  const page = buildPixelHomePage(registry, "desk", []);
  assert.equal(withPixelHomePage(null, page), null);
  assert.equal(withPixelHomePage(undefined, page), null);
  assert.equal(withPixelHomePage(person, null), null);
  assert.equal(withPixelHomePage({ ...person, pages: [...person.pages, page] }, page), null, "same page twice");
});

test("the new page survives the board's own reader unchanged in shape", () => {
  const next = withPixelHomePage(person, buildPixelHomePage(registry, "desk", person.pages));
  const read = resolveExperimentalHome(next, registry);
  const p = read.pages[2];
  assert.equal(p.widgets.length, PIXEL_DESK_WIDGETS.length);
  assert.deepEqual(p.widgets.map((w) => w.span.cols), PIXEL_DESK_WIDGETS.map((s) => s.cols));
  assert.equal(read.defaultPageId, "p1", "default page stays the person's");
  assert.equal(read.pages[0].unknownWidgets.length, 1, "unknown widgets kept");
});

console.log(`\n${passed} passed`);
