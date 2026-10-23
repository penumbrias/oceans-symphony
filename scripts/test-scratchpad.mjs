// Scratch pad particle rules: node scripts/test-scratchpad.mjs
import assert from "node:assert/strict";
import { createPad, resizePad, beginStroke, extendStroke, endStroke, stepPad, clampRules, PRESETS, RULES } from "../src/lib/scratchpad/particles.js";

// Junk in, safe rules out; presets are already inside the limits.
const wild = clampRules({ carry: 99, drag: -4, life: "x", pull: NaN, edges: "portal" });
assert.equal(wild.carry, RULES.carry.max);
assert.equal(wild.drag, RULES.drag.min);
assert.equal(wild.edges, "bounce");
for (const p of PRESETS) assert.deepEqual(clampRules(p.rules), p.rules, p.id);
console.log("ok  rules are clamped");

function draw(pad, rules, from, to, ms = 300) {
  beginStroke(pad, from[0], from[1], 0);
  for (let k = 1; k <= 20; k++) {
    const t = k / 20;
    extendStroke(pad, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, ms * t);
  }
  endStroke(pad, rules);
}

for (const p of PRESETS) {
  const pad = createPad({ capacity: 700 });
  resizePad(pad, 1000, 1600);
  for (let s = 0; s < 5; s++) draw(pad, p.rules, [150, 200 + s * 250], [850, 260 + s * 250]);
  const n0 = pad.count;
  assert.ok(n0 > 400 && n0 <= 700, `${p.id} spawned ${n0}`);
  const t0 = performance.now();
  for (let f = 0; f < 240; f++) stepPad(pad, p.rules, 1 / 60);
  const ms = (performance.now() - t0) / 240;
  for (let i = 0; i < pad.cap; i++) {
    if (!pad.alive[i]) continue;
    assert.ok(Number.isFinite(pad.x[i]) && Number.isFinite(pad.y[i]), `${p.id} finite`);
    if (p.rules.edges === "bounce") assert.ok(pad.x[i] >= 0 && pad.x[i] <= 1000 && pad.y[i] >= 0 && pad.y[i] <= 1600, `${p.id} inside`);
  }
  console.log(`ok  ${p.id.padEnd(9)} ${n0} particles, ${ms.toFixed(2)} ms/step`);
}

// Spacing: a 700-unit line spawns about one particle every 7 units.
const pad = createPad();
draw(pad, PRESETS[0].rules, [100, 100], [800, 100]);
assert.ok(Math.abs(pad.count - 101) <= 2, `count ${pad.count}`);
console.log("ok  stroke spacing");
