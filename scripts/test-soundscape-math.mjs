// Soundscape safety + generator checks: node scripts/test-soundscape-math.mjs
import assert from "node:assert/strict";
import { clampParams, LIMITS, PRESETS, makeLoop, motionValue, windDownValue, NOISE_COLORS, MOTION_KINDS, RAIN_SURFACES, rainShape, rainKey } from "../src/lib/soundscape/soundMath.js";

// Out-of-range and junk values never reach the audio graph.
const wild = clampParams({ toneFreq: 20000, lowpass: 22000, highpass: 9000, beat: 40, volume: 5, motionSpeed: 10, noiseLevel: -3, noise: "metal", motion: "strobe" });
assert.equal(wild.toneFreq, LIMITS.toneFreq[1]);
assert.equal(wild.lowpass, LIMITS.lowpass[1]);
assert.ok(wild.highpass <= wild.lowpass / 2);
assert.equal(wild.beat, LIMITS.beat[1]);
assert.equal(wild.volume, 1);
assert.equal(wild.motionSpeed, LIMITS.motionSpeed[1]);
assert.equal(wild.noiseLevel, 0);
assert.equal(wild.noise, "brown");
assert.equal(wild.motion, "constant");
assert.deepEqual(clampParams({ toneFreq: NaN }).toneFreq, 136);
assert.deepEqual(clampParams(null), clampParams({}));
console.log("ok  clampParams");

for (const p of PRESETS) assert.deepEqual(p.params, clampParams(p.params), p.id);
console.log("ok  presets are inside the limits");

for (const c of NOISE_COLORS) {
  const b = makeLoop(c, 8000, 2, 3);
  let peak = 0;
  for (const v of b) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
  assert.ok(peak <= 0.5 + 1e-6, `${c} peak ${peak}`);
  if (c !== "none" && c !== "rain") assert.ok(peak > 0.4);
}
console.log("ok  noise loops finite and normalised");

// Rain shapes: junk falls back, values move in 5% steps, and every
// surface/size/amount stays under the same peak at a similar loudness.
const rj = clampParams({ noise: "rain", rainAmount: 7, rainDrop: -1, rainClose: 0.333, rainSurface: "lava" });
assert.equal(rj.rainAmount, 1);
assert.equal(rj.rainDrop, 0);
assert.equal(rj.rainClose, 0.35);
assert.equal(rj.rainSurface, "open");
assert.notEqual(rainKey(clampParams({ rainSurface: "roof" })), rainKey(clampParams({})));
for (const surface of RAIN_SURFACES) for (const [amount, drop, close] of [[0, 0, 0], [0.35, 0.5, 0.6], [1, 1, 1]]) {
  const b = makeLoop("rain", 8000, 2, 3, { ...rainShape(clampParams({})), surface, amount, drop, close });
  let peak = 0, s = 0;
  for (const v of b) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); s += v * v; }
  const r = Math.sqrt(s / b.length);
  assert.ok(peak <= 0.5 + 1e-6, `${surface} peak ${peak}`);
  assert.ok(r > 0.03 && r < 0.09, `${surface} ${amount}/${drop}/${close} rms ${r}`);
}
console.log("ok  rain shapes bounded and evenly loud");

for (const k of MOTION_KINDS) for (let t = 0; t < 120; t += 0.37) {
  const m = motionValue(k, t, 0.25, 1);
  assert.ok(m <= 1 && m >= 0.3 - 1e-9, `${k} ${m}`);
}
assert.ok(windDownValue(1) > 0.5 && windDownValue(0) === 1 && windDownValue(9) === windDownValue(1));
console.log("ok  movement never louder than the settings");

// Fractals: the formula language only computes numbers, rejects what it
// can't read with a sentence, and every preset renders finite values.
const fr = await import("../src/lib/soundscape/fractals.js");
for (const ok of ["z^2 + c", "z^3 - z + c", "2z^2 + 0.5i*c", "sin(z)*c", "conj(z)^2 + c", "z^2.5 + c", "(z + c)/(z - c)"]) {
  assert.ok(fr.compileFormula(ok).ok, ok);
}
for (const bad of ["", "c + 1", "z^2 + ", "alert(1)", "z^2 + c)", "window", "z ** 2", "z^2;c", "x".repeat(200)]) {
  const r = fr.compileFormula(bad);
  assert.ok(!r.ok && typeof r.error === "string" && r.error.length > 5, bad);
}
const wildF = fr.clampFractal({ kind: "nope", power: 99, depth: 1e9, speed: -4, formula: 5, nroots: 1 });
assert.equal(wildF.kind, "julia");
assert.equal(wildF.power, fr.FRACTAL_LIMITS.power[1]);
assert.equal(wildF.depth, fr.FRACTAL_LIMITS.depth[1]);
assert.equal(wildF.speed, 0);
assert.equal(wildF.nroots, fr.FRACTAL_LIMITS.nroots[0]);
assert.equal(wildF.formula, "z^2 + c");
for (const pr of fr.FRACTAL_PRESETS) {
  assert.deepEqual(pr.fractal, fr.clampFractal(pr.fractal), pr.id);
  for (const [W, H] of [[30, 50], [50, 30]]) {
    const tone = new Float32Array(W * H), bright = new Float32Array(W * H);
    const prog = pr.fractal.kind === "custom" ? fr.compileFormula(pr.fractal.formula).program : null;
    fr.renderFractalField(pr.fractal, 123, W, H, tone, bright, prog);
    let lit = 0;
    for (let i = 0; i < W * H; i++) {
      assert.ok(Number.isFinite(tone[i]) && tone[i] >= 0 && tone[i] <= 1, pr.id);
      assert.ok(Number.isFinite(bright[i]) && bright[i] >= 0 && bright[i] <= 1, pr.id);
      if (bright[i] > 0.2) lit++;
    }
    assert.ok(lit > 0, `${pr.id} draws something`);
  }
  assert.equal(fr.fractalEquation(pr.fractal, 10).length, 2);
}
console.log("ok  fractals: formulas, limits, presets");
