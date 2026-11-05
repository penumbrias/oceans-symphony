#!/usr/bin/env node
// Checks the sync read guard (src/lib/syncReadGuard.js):
//   node scripts/test-sync-read-guard.mjs
import assert from "node:assert/strict";
import { syncReadSkipReason, NATIVE_MEDIA_READ_LIMIT_BYTES as LIMIT } from "../src/lib/syncReadGuard.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};
const base = { name: "symphony-sync-sys-dev.media.json", size: 1000, mark: "1000:5", kind: "media", native: true, inflight: null };

test("small media on the phone is read", () => assert.equal(syncReadSkipReason(base), null));
test("big media on the phone is skipped", () => assert.ok(syncReadSkipReason({ ...base, size: LIMIT + 1 })));
test("big media on desktop is read", () => assert.equal(syncReadSkipReason({ ...base, size: LIMIT + 1, native: false }), null));
test("big data file is never size-skipped", () => assert.equal(syncReadSkipReason({ ...base, kind: "data", size: LIMIT * 4 }), null));
test("a file that crashed the last pass is skipped", () =>
  assert.ok(syncReadSkipReason({ ...base, kind: "data", inflight: { name: base.name, mark: base.mark } })));
test("the same file rewritten since is read again", () =>
  assert.equal(syncReadSkipReason({ ...base, inflight: { name: base.name, mark: "2000:9" } }), null));
test("a crash on another file doesn't skip this one", () =>
  assert.equal(syncReadSkipReason({ ...base, inflight: { name: "other", mark: base.mark } }), null));

console.log(`\n${passed} passed`);
