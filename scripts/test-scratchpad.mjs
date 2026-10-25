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

// A tilt push moves particles that way; no push leaves the rules alone.
{
  const rules = clampRules({ ...PRESETS[0].rules, carry: 0, drag: 0.5, life: 0 });
  const pad = createPad({ capacity: 200 });
  resizePad(pad, 1000, 1000);
  draw(pad, rules, [300, 500], [700, 500]);
  const meanX = () => { let s = 0, n = 0; for (let i = 0; i < pad.cap; i++) if (pad.alive[i]) { s += pad.x[i]; n++; } return s / n; };
  const x0 = meanX();
  for (let f = 0; f < 60; f++) stepPad(pad, rules, 1 / 60, { x: 600, y: 0 });
  assert.ok(meanX() > x0 + 50, "push to the right moves them right");
  console.log("ok  tilt push");
}

// The tilt vector: flat is nothing, upright is straight down, right side
// down is to the right, and landscape turns it.
{
  const handlers = [];
  globalThis.window = {
    DeviceOrientationEvent: function () {},
    screen: { orientation: { angle: 0 } },
    addEventListener: (_t, fn) => handlers.push(fn),
    removeEventListener: () => {},
  };
  const { startTilt } = await import("../src/lib/scratchpad/tilt.js");
  let v = null;
  const stop = startTilt("gravity", (t) => { v = t; });
  const send = (beta, gamma) => handlers.at(-1)({ beta, gamma, timeStamp: 0 });
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  send(0, 0); assert.ok(near(v.x, 0) && near(v.y, 0), "flat");
  send(90, 0); assert.ok(near(v.x, 0) && near(v.y, 1), "upright falls down");
  send(0, 90); assert.ok(near(v.x, 1) && near(v.y, 0), "right side down");
  window.screen.orientation.angle = 90;
  send(90, 0); assert.ok(near(v.x, 1) && near(v.y, 0), "landscape: phone's bottom is the screen's right");
  stop();
  window.screen.orientation.angle = 0;
  startTilt("nudge", (t) => { v = t; });
  handlers.at(-1)({ beta: 60, gamma: 0, timeStamp: 0 });
  assert.ok(near(v.y, 0), "nudge: holding still is no push");
  for (let k = 1; k <= 200; k++) handlers.at(-1)({ beta: 60, gamma: 0, timeStamp: k * 50 });
  assert.ok(Math.abs(v.y) < 1e-3, "nudge: still stays still");
  handlers.at(-1)({ beta: 90, gamma: 0, timeStamp: 10050 });
  assert.ok(v.y > 0.1, "nudge: tilting further pushes down");
  console.log("ok  tilt vector");
}
