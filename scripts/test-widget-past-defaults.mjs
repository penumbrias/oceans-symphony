#!/usr/bin/env node
// Checks that widgets placed before an update keep what they showed
// (src/lib/widgetFold.js pastDefaults) and that the Coming up widget's
// limit falls back to what it did before its options were set
// (src/lib/upcomingPlansLimit.js resolveWidgetLimit).
//
//   node scripts/test-widget-past-defaults.mjs

import assert from "node:assert/strict";
import { foldedSettings, pastDefaultsFor, instanceCreatedAt, foldWidget } from "../src/lib/widgetFold.js";

// A tiny localStorage so the limit helpers can read an "old cog" value.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
};
const { resolveWidgetLimit, widgetLimitConfig } = await import("../src/lib/upcomingPlansLimit.js");

const idAt = (ms) => `w_${ms.toString(36)}_1abcd`;
const CUT = Date.parse("2026-10-30T22:30:33Z");
const def = { pastDefaults: [{ before: CUT, settings: { limit: 4, ahead: "any" } }] };

// Instance ids carry their creation time.
assert.equal(instanceCreatedAt(idAt(CUT - 5)), CUT - 5);
assert.equal(instanceCreatedAt("seed_profile_info"), null);

// Old widget: keeps the old defaults, but its own saved values win.
assert.deepEqual(foldedSettings(def, {}, idAt(CUT - 1000)), { limit: 4, ahead: "any" });
assert.deepEqual(foldedSettings(def, { limit: 9 }, idAt(CUT - 1000)), { limit: 9, ahead: "any" });
assert.deepEqual(foldedSettings(def, { limit: "" }, idAt(CUT - 1000)), { limit: "", ahead: "any" });
// New widget and profile seeds: today's defaults.
assert.deepEqual(foldedSettings(def, {}, idAt(CUT + 1000)), {});
assert.equal(pastDefaultsFor(def, "seed_profile_info"), null);
// An id that doesn't say when: treated as old (keeps what it showed).
assert.deepEqual(pastDefaultsFor(def, "conv_3"), { limit: 4, ahead: "any" });
// Folds still apply, and past defaults sit underneath them.
const folded = foldWidget({ ...def }, () => ({ show: "upcoming" }));
assert.deepEqual(foldedSettings(folded, {}, idAt(CUT - 1)), { limit: 4, ahead: "any", show: "upcoming" });

// Coming up: nothing set and no old cog value = the next 5 (as before).
assert.deepEqual(resolveWidgetLimit({}), { mode: "count", count: 5, days: 14 });
// The old cog's value is kept until the widget's own options are set.
store.set("upcoming_plans_limit_mode__widget", "window");
store.set("upcoming_plans_limit_window__widget", "3_days");
assert.deepEqual(resolveWidgetLimit({}), { mode: "window", count: 5, days: 3 });
assert.equal(widgetLimitConfig({}).windowMs, 3 * 86400000);
// Older widget options (a fixed window id) still read the same.
assert.deepEqual(resolveWidgetLimit({ upcomingMode: "window", upcomingWindow: "month" }), { mode: "window", count: 5, days: 30 });
// The new slider wins, clamped.
assert.equal(resolveWidgetLimit({ upcomingMode: "window", upcomingDays: 45 }).days, 45);
assert.equal(resolveWidgetLimit({ upcomingMode: "window", upcomingDays: 9999 }).days, 365);
assert.deepEqual(widgetLimitConfig({ upcomingMode: "count", upcomingCount: 8 }), { mode: "count", count: 8 });

console.log("widget past defaults: all good");
