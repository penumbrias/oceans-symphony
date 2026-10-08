// node scripts/test-preset-sync.mjs — saved appearance presets merge on sync.
import assert from "node:assert/strict";
import { mergePresetLibraries, samePreset, UNSAVED_STASH } from "../src/lib/presetSync.js";

const A = { light: { bg: "#fff", primary: "#a0f" }, dark: { bg: "#000", primary: "#a0f" } };
const B = { light: { bg: "#eee", primary: "#0af" } };

// New preset from the other device is added; inputs untouched.
{
  const local = { Mine: A };
  const r = mergePresetLibraries(local, { Theirs: B }, { deviceName: "Phone" });
  assert.deepEqual(Object.keys(r.presets).sort(), ["Mine", "Theirs"]);
  assert.equal(r.added, 1);
  assert.deepEqual(Object.keys(local), ["Mine"]);
}
// Identical (key order / stamp differences ignored) → nothing.
{
  const r = mergePresetLibraries({ X: { dark: A.dark, light: A.light } }, { X: { ...A, _ut: 5 } });
  assert.equal(r.added + r.updated + r.copied, 0);
  assert.ok(samePreset(A, { ...A, _ut: 9 }));
}
// Both stamped: newer wins, older never overwrites.
{
  const r1 = mergePresetLibraries({ X: { ...A, _ut: 1 } }, { X: { ...B, _ut: 2 } });
  assert.equal(r1.updated, 1); assert.ok(samePreset(r1.presets.X, B));
  const r2 = mergePresetLibraries({ X: { ...A, _ut: 3 } }, { X: { ...B, _ut: 2 } });
  assert.equal(r2.updated, 0); assert.ok(samePreset(r2.presets.X, A));
}
// Unstamped conflict: both kept, repeat sync adds nothing more.
{
  const r = mergePresetLibraries({ X: A }, { X: B }, { deviceName: "Phone" });
  assert.ok(samePreset(r.presets.X, A));
  assert.ok(samePreset(r.presets["X (from Phone)"], B));
  const again = mergePresetLibraries(r.presets, { X: B }, { deviceName: "Phone" });
  assert.equal(again.copied, 0);
  assert.equal(Object.keys(again.presets).length, 2);
  // A different version later gets its own copy; nothing is overwritten.
  const C = { light: { bg: "#123" } };
  const third = mergePresetLibraries(again.presets, { X: C }, { deviceName: "Phone" });
  assert.ok(samePreset(third.presets["X (from Phone)"], B));
  assert.ok(samePreset(third.presets["X (from Phone) 2"], C));
}
// Deleted here after their copy was saved → stays deleted; edited there later → returns.
{
  const r1 = mergePresetLibraries({}, { X: { ...B, _ut: 10 } }, { removed: { X: 20 } });
  assert.equal(r1.presets.X, undefined);
  const r2 = mergePresetLibraries({}, { X: B }, { removed: { X: 20 } });
  assert.equal(r2.presets.X, undefined);
  const r3 = mergePresetLibraries({}, { X: { ...B, _ut: 30 } }, { removed: { X: 20 } });
  assert.ok(r3.presets.X);
}
// The device's own stash never travels; junk input is harmless.
{
  const r = mergePresetLibraries({}, { [UNSAVED_STASH]: A, bad: "x", arr: [1] });
  assert.deepEqual(r.presets, {});
  assert.deepEqual(mergePresetLibraries({ X: A }, null).presets, { X: A });
}
console.log("preset sync: all tests passed");
