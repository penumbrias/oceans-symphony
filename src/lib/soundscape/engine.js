// Soundscape — the Web Audio engine. One instance for the whole app, so
// the sound keeps playing while someone moves around Quick Support.
//
// Graph:
//   noise loop → noiseGain → highpass → lowpass → motionGain ┐
//   tone L/R oscillators → toneGain (stereo merge) ──────────┴→ master
//   master → limiter (compressor) → ceiling → analyser → speakers
//
// Safety: every parameter goes through clampParams; every change ramps
// (setTargetAtTime) so nothing jumps; master gain tops out at MAX_GAIN;
// the limiter squashes any peak; start and stop fade.

import { clampParams, makeLoop, motionValue, windDownValue, rainShape, rainKey } from "./soundMath";

const MAX_GAIN = 1.0;
const CEILING = 0.9;
const FADE_IN = 3;
const END_FADE = 20; // seconds of fade at the end of a timed session
const RAMP = 0.12;

const listeners = new Set();
let state = { playing: false, endsAt: null, startedAt: null, duration: null };
const emit = () => { for (const fn of listeners) { try { fn(state); } catch { /* listener */ } } };
const setState = (patch) => { state = { ...state, ...patch }; emit(); };

export const subscribeSoundscape = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSoundscapeState = () => state;

let ctx = null;
let nodes = null;
let params = clampParams(null);
let bufferCache = new Map();
let motionTimer = null;
let endTimer = null;
let stopTimer = null;
let onEndCb = null;
let reshapeTimer = null;
const MAX_CACHED = 6;
// True while a timed session is in its closing fade (volume changes wait).
let fading = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("This device can't make generated sound.");
    ctx = new AC();
  }
  return ctx;
}

// Which loop the current params need: the colour, plus the rain shape
// when it's rain (each shape is its own generated loop).
const noiseKey = (p) => (p.noise === "rain" ? `rain_${rainKey(p)}` : p.noise);

function loopBuffer(p) {
  const c = getCtx();
  const key = `${noiseKey(p)}_${c.sampleRate}`;
  if (bufferCache.has(key)) return bufferCache.get(key);
  const shape = p.noise === "rain" ? rainShape(p) : null;
  const buf = c.createBuffer(2, Math.floor(12 * c.sampleRate), c.sampleRate);
  // Different seeds per channel: decorrelated left/right sounds wide and
  // natural instead of a point in the middle of the head.
  buf.copyToChannel(makeLoop(p.noise, c.sampleRate, 12, 11, shape), 0);
  buf.copyToChannel(makeLoop(p.noise, c.sampleRate, 12, 29, shape), 1);
  bufferCache.set(key, buf);
  // Rain shapes can pile up while someone explores; keep the newest few.
  while (bufferCache.size > MAX_CACHED) bufferCache.delete(bufferCache.keys().next().value);
  return buf;
}

function build() {
  const c = getCtx();
  const master = c.createGain();
  master.gain.value = 0;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.25;
  const ceiling = c.createGain();
  ceiling.gain.value = CEILING;
  const analyser = c.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;
  master.connect(limiter).connect(ceiling).connect(analyser).connect(c.destination);

  const noiseGain = c.createGain();
  const highpass = c.createBiquadFilter();
  highpass.type = "highpass";
  highpass.Q.value = 0.5;
  const lowpass = c.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.5;
  const motionGain = c.createGain();
  noiseGain.connect(highpass).connect(lowpass).connect(motionGain).connect(master);

  const toneGain = c.createGain();
  toneGain.gain.value = 0;
  const merger = c.createChannelMerger(2);
  const toneL = c.createGain();
  const toneR = c.createGain();
  toneL.connect(merger, 0, 0);
  toneR.connect(merger, 0, 1);
  merger.connect(toneGain).connect(master);

  nodes = { master, limiter, analyser, noiseGain, highpass, lowpass, motionGain, toneGain, toneL, toneR, noiseSrc: null, noiseColor: null, oscL: null, oscR: null };
}

function ramp(param, value, tc = RAMP) {
  if (!ctx || !param) return;
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, tc);
}

function syncNoise({ now = false } = {}) {
  const c = ctx;
  const color = params.noise;
  const key = noiseKey(params);
  if (nodes.noiseColor === key && nodes.noiseSrc) return;
  // Reshaping the rain means generating a new loop. While a slider is
  // being dragged, wait until it settles instead of building every step.
  const reshape = !now && nodes.noiseSrc && color === "rain" && String(nodes.noiseColor).startsWith("rain_");
  clearTimeout(reshapeTimer);
  if (reshape) {
    reshapeTimer = setTimeout(() => { if (nodes && state.playing) syncNoise({ now: true }); }, 350);
    return;
  }
  const old = nodes.noiseSrc;
  if (old) {
    // Cross-fade colour changes rather than cutting.
    const g = c.createGain();
    old.disconnect();
    old.connect(g).connect(nodes.noiseGain);
    g.gain.setValueAtTime(1, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
    try { old.stop(c.currentTime + 0.7); } catch { /* already stopped */ }
  }
  nodes.noiseSrc = null;
  nodes.noiseColor = key;
  if (color === "none") return;
  const src = c.createBufferSource();
  src.buffer = loopBuffer(params);
  src.loop = true;
  const g = c.createGain();
  g.gain.setValueAtTime(old ? 0 : 1, c.currentTime);
  if (old) g.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
  src.connect(g).connect(nodes.noiseGain);
  src.start();
  nodes.noiseSrc = src;
}

function syncTone() {
  const c = ctx;
  if (!params.toneOn) {
    ramp(nodes.toneGain.gain, 0, 0.3);
    return;
  }
  if (!nodes.oscL) {
    nodes.oscL = c.createOscillator();
    nodes.oscR = c.createOscillator();
    nodes.oscL.connect(nodes.toneL);
    nodes.oscR.connect(nodes.toneR);
    nodes.oscL.start();
    nodes.oscR.start();
  }
  nodes.oscL.type = params.toneWave;
  nodes.oscR.type = params.toneWave;
  // Binaural: each ear hears a slightly different pitch; the difference
  // is the "beat". Centred on the chosen frequency.
  const half = params.beat / 2;
  ramp(nodes.oscL.frequency, params.toneFreq - half, 0.2);
  ramp(nodes.oscR.frequency, params.toneFreq + half, 0.2);
  // Triangle waves carry more harmonics, so they sit a little lower.
  ramp(nodes.toneGain.gain, params.toneLevel * (params.toneWave === "triangle" ? 0.22 : 0.3), 0.3);
}

function applyStatic() {
  ramp(nodes.noiseGain.gain, params.noiseLevel);
  syncNoise();
  syncTone();
  applyMotion(true);
}

function applyMotion(immediate = false) {
  if (!nodes || !ctx) return;
  const t = ctx.currentTime;
  const m = motionValue(params.motion, t, params.motionSpeed, params.motionAmount);
  let w = 1;
  if (params.windDown && state.duration && state.startedAt) {
    w = windDownValue((Date.now() - state.startedAt) / (state.duration * 1000));
  }
  const tc = immediate ? RAMP : 0.25;
  // Movement darkens as well as quietens: a wave pulling back is muffled.
  ramp(nodes.motionGain.gain, m * w, tc);
  ramp(nodes.lowpass.frequency, Math.max(120, params.lowpass * (0.35 + 0.65 * m) * (0.5 + 0.5 * w)), tc);
  ramp(nodes.highpass.frequency, params.highpass, tc);
}

export function getParams() { return params; }

export function setParams(next) {
  params = clampParams(next);
  if (!nodes || !state.playing) return params;
  applyStatic();
  if (!fading) ramp(nodes.master.gain, params.volume * MAX_GAIN, 0.15);
  return params;
}

export function getAnalyser() { return nodes?.analyser || null; }

// Current "presence" (0..1) for the visualiser.
export function currentMotion() {
  if (!ctx) return 1;
  return motionValue(params.motion, ctx.currentTime, params.motionSpeed, params.motionAmount);
}

export async function startSoundscape(p, { minutes = null, onEnd = null } = {}) {
  const c = getCtx();
  if (c.state === "suspended") await c.resume();
  clearTimeout(stopTimer);
  if (!nodes) build();
  params = clampParams(p);
  const wasPlaying = state.playing;
  setState({ playing: true, startedAt: wasPlaying ? state.startedAt : Date.now() });
  applyStatic();
  if (!wasPlaying) {
    nodes.master.gain.cancelScheduledValues(c.currentTime);
    nodes.master.gain.setValueAtTime(0, c.currentTime);
    nodes.master.gain.linearRampToValueAtTime(params.volume * MAX_GAIN, c.currentTime + FADE_IN);
  } else {
    ramp(nodes.master.gain, params.volume * MAX_GAIN, 0.2);
  }
  clearInterval(motionTimer);
  motionTimer = setInterval(() => applyMotion(false), 200);
  setTimer(minutes, onEnd);
}

export function setTimer(minutes, onEnd = onEndCb) {
  clearTimeout(endTimer);
  onEndCb = onEnd;
  if (!state.playing) return;
  if (fading && nodes && ctx) {
    // Timer changed during the closing fade: come back up.
    fading = false;
    ramp(nodes.master.gain, params.volume * MAX_GAIN, 0.5);
  }
  if (!minutes) {
    setState({ duration: null, endsAt: null });
    return;
  }
  const now = Date.now();
  setState({ duration: minutes * 60, endsAt: now + minutes * 60 * 1000, startedAt: now });
  const total = minutes * 60 * 1000;
  // The last END_FADE seconds fade out gently, then the session ends.
  endTimer = setTimeout(() => {
    if (!nodes || !ctx) return;
    const c = ctx;
    const left = Math.max(0.5, (state.endsAt - Date.now()) / 1000);
    nodes.master.gain.cancelScheduledValues(c.currentTime);
    nodes.master.gain.setValueAtTime(nodes.master.gain.value, c.currentTime);
    nodes.master.gain.linearRampToValueAtTime(0, c.currentTime + left);
    fading = true;
    endTimer = setTimeout(() => stopSoundscape({ fade: 0.1 }), left * 1000);
  }, Math.max(0, total - END_FADE * 1000));
}

export function stopSoundscape({ fade = 1.5 } = {}) {
  clearTimeout(endTimer);
  clearTimeout(reshapeTimer);
  fading = false;
  clearInterval(motionTimer);
  motionTimer = null;
  if (!nodes || !ctx || !state.playing) { setState({ playing: false, endsAt: null, startedAt: null, duration: null }); return; }
  const c = ctx;
  nodes.master.gain.cancelScheduledValues(c.currentTime);
  nodes.master.gain.setValueAtTime(nodes.master.gain.value, c.currentTime);
  nodes.master.gain.linearRampToValueAtTime(0, c.currentTime + fade);
  const old = nodes;
  const cb = onEndCb;
  onEndCb = null;
  // The session is over for the UI right away; the audio finishes fading.
  setState({ playing: false, endsAt: null, startedAt: null, duration: null });
  stopTimer = setTimeout(() => {
    try { old.noiseSrc?.stop(); } catch { /* stopped */ }
    try { old.oscL?.stop(); old.oscR?.stop(); } catch { /* stopped */ }
    try { old.master.disconnect(); } catch { /* gone */ }
    if (nodes === old) nodes = null;
  }, fade * 1000 + 100);
  try { cb?.(); } catch { /* listener */ }
}
