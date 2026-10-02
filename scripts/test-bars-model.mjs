#!/usr/bin/env node
// Checks the one-truth bar model (src/lib/barsModel.js): older pinned-bar
// records keep looking and behaving the same, the first change moves them
// across without losing anything, and each show/hide switch writes the
// flag the chrome on screen actually obeys.
//
//   node scripts/test-bars-model.mjs

import assert from "node:assert/strict";
import {
  readPinnedBar, pinnedBarLook, pinnedBarPatch, pinnedBarLookPatch,
  barShown, barShownPatch,
} from "../src/lib/barsModel.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const apply = (row, patch) => ({ ...row, ...patch });

const legacy = {
  id: "s1",
  ui_v2: { enabled: true, barLooks: { alters: { radius: 4 }, top: { borderW: 2 } }, tokens: { stripH: 50 } },
  ui_v2_home: {
    pages: [{ id: "p1" }],
    altersBar: { enabled: true, position: "top", attached: true, mode: "bar", look: { bg: "#112233", radius: 9, valign: "bottom" } },
  },
};

test("older record reads from the board field", () => {
  const b = readPinnedBar(legacy);
  assert.equal(b.enabled, true);
  assert.equal(b.position, "top");
  assert.equal(b.attached, true);
});

test("older look = board look under the Display options look", () => {
  const l = pinnedBarLook(legacy);
  assert.equal(l.bg, "#112233");
  assert.equal(l.radius, 4);          // Display options wins
  assert.equal(l.valign, "bottom");
});

test("first change moves it across, nothing lost, board field untouched", () => {
  const row = apply(legacy, pinnedBarPatch(legacy, { collapsed: true }));
  assert.equal(row.ui_v2.altersBar.position, "top");
  assert.equal(row.ui_v2.altersBar.collapsed, true);
  assert.equal(row.ui_v2.altersBar.look, undefined);
  assert.deepEqual(pinnedBarLook(row), pinnedBarLook(legacy));
  assert.deepEqual(row.ui_v2_home, legacy.ui_v2_home);
  assert.equal(row.ui_v2.tokens.stripH, 50);
  assert.equal(row.ui_v2.barLooks.top.borderW, 2);
  assert.equal(readPinnedBar(row).enabled, true);
});

test("after the move the board field is no longer read", () => {
  const row = apply(legacy, pinnedBarPatch(legacy, { position: "bottom" }));
  const synced = { ...row, ui_v2_home: { ...row.ui_v2_home, altersBar: { enabled: false, position: "left" } } };
  assert.equal(readPinnedBar(synced).position, "bottom");
  assert.equal(readPinnedBar(synced).enabled, true);
});

test("look patch merges, undefined clears, replace resets", () => {
  let row = apply(legacy, pinnedBarLookPatch(legacy, { shadow: "soft", radius: undefined }));
  const l = pinnedBarLook(row);
  assert.equal(l.shadow, "soft");
  assert.equal(l.radius, undefined);
  assert.equal(l.bg, "#112233");
  row = apply(row, pinnedBarLookPatch(row, {}, { replace: true }));
  assert.deepEqual(pinnedBarLook(row), {});
});

test("record with no pinned bar at all", () => {
  const b = readPinnedBar({ id: "x" });
  assert.equal(b.enabled, false);
  assert.equal(b.position, "bottom");
  assert.equal(b.mode, "bar");
  const row = apply({ id: "x" }, pinnedBarPatch({ id: "x" }, { enabled: true }));
  assert.equal(readPinnedBar(row).enabled, true);
});

test("new UI: switches write ui_v2.bars, top can't be hidden", () => {
  const row = { ui_v2: { enabled: true } };
  assert.equal(barShown(row, "top", true), true);
  assert.equal(barShownPatch(row, "top", false, true), null);
  const r2 = apply(row, barShownPatch(row, "tabs", false, true));
  assert.equal(barShown(r2, "tabs", true), false);
  assert.equal(r2.ui_v2.enabled, true);
});

test("classic: switches write classicBars, pinned needs both flags", () => {
  const row = { ui_v2: { classicBars: { alters: false }, bars: { actions: false } } };
  assert.equal(barShown(row, "actions", false), false);
  let r = apply(row, barShownPatch(row, "actions", true, false));
  assert.equal(barShown(r, "actions", false), true);
  r = apply(r, barShownPatch(r, "alters", true, false));
  assert.equal(barShown(r, "alters", false), true);
  r = apply(r, barShownPatch(r, "top", true, false));
  assert.equal(barShown(r, "top", false), true);
  assert.equal(r.ui_v2.classicBars.top, true);
  r = apply(r, barShownPatch(r, "tabs", false, false));
  assert.equal(r.ui_v2.classicBars.bottom, false);
});

console.log(`\n${passed} passed`);
