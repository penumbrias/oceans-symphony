// Trash recovery window + time lock rules (src/lib/trashSettings.js).
// Run: node scripts/test-trash.mjs
import { resolveTrashSettings, changeTrashSettings, DAY_MS } from "../src/lib/trashSettings.js";

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) passed++; else { failed++; console.error("FAIL:", name); } };
const T0 = Date.parse("2026-10-24T00:00:00Z");

// Defaults: 30 days, lock off.
let s = resolveTrashSettings(undefined, T0);
ok(s.days === 30 && s.lock === false && s.pending === null, "defaults");

// Lock off: shortening applies at once.
let v = changeTrashSettings(undefined, { days: 7 }, T0);
ok(v.days === 7 && !v.pending, "unlocked shorten is immediate");

// Turning the lock on is immediate.
v = changeTrashSettings({ days: 30 }, { lock: true }, T0);
ok(v.lock === true && !v.pending, "lock on is immediate");

// Under the lock, turning it off waits the window.
v = changeTrashSettings({ days: 30, lock: true }, { lock: false }, T0);
ok(v.lock === true && v.pending?.lock === false, "lock off is queued");
ok(Date.parse(v.pending.effective_at) === T0 + 30 * DAY_MS, "queued for one window");
ok(resolveTrashSettings(v, T0 + 29 * DAY_MS).lock === true, "still locked before the window passes");
ok(resolveTrashSettings(v, T0 + 30 * DAY_MS).lock === false, "unlocked once the window passes");

// Under the lock, shortening waits; lengthening is immediate and keeps the queue.
v = changeTrashSettings({ days: 30, lock: true }, { days: 7 }, T0);
ok(v.days === 30 && v.pending?.days === 7, "locked shorten is queued");
let v2 = changeTrashSettings(v, { days: 0 }, T0 + DAY_MS);
ok(v2.days === 0 && !v2.pending, "lengthening to never applies now and drops the queued shorten");
v2 = changeTrashSettings({ days: 30, lock: true, pending: { lock: false, effective_at: new Date(T0 + 30 * DAY_MS).toISOString() } }, { days: 60 }, T0 + 5 * DAY_MS);
ok(v2.days === 60 && v2.pending?.lock === false && Date.parse(v2.pending.effective_at) === T0 + 30 * DAY_MS, "lengthening keeps an existing queue's date");

// Adding a new weakening to an existing queue restarts its wait.
v2 = changeTrashSettings({ days: 30, lock: true, pending: { days: 14, effective_at: new Date(T0 + 30 * DAY_MS).toISOString() } }, { lock: false }, T0 + 29 * DAY_MS);
ok(Date.parse(v2.pending.effective_at) === T0 + 59 * DAY_MS, "a new queued weakening waits a full window from now");

// "Never" + lock: turning the lock off still waits at least 30 days.
v = changeTrashSettings({ days: 0, lock: true }, { lock: false }, T0);
ok(Date.parse(v.pending.effective_at) === T0 + 30 * DAY_MS, "never-empty window still waits 30 days");

// Re-locking cancels a queued unlock.
v = changeTrashSettings({ days: 30, lock: true, pending: { lock: false, effective_at: new Date(T0 + 30 * DAY_MS).toISOString() } }, { lock: true }, T0);
ok(v.lock === true && !v.pending, "locking again cancels the queued unlock");

// Junk never throws and falls back to defaults.
s = resolveTrashSettings({ days: -4, lock: "yes", pending: "x" }, T0);
ok(s.days === 30 && s.lock === false && s.pending === null, "junk falls back to defaults");

console.log(`${passed} passed${failed ? `, ${failed} failed` : ""}`);
if (failed) process.exit(1);
