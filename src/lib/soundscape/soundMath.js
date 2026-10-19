// Soundscape — the math. Pure functions only (no Web Audio), so the
// generators, the safety clamps and the movement curves can be tested in
// node and drawn by the visualiser exactly as they're heard.

// ── Safety limits ─────────────────────────────────────────────────────
// Every parameter that reaches the audio graph goes through clampParams
// first, whatever the UI, a saved preset or a restored backup says. The
// ranges keep the sound soft: no tones above 600 Hz, no bright highs
// above 8 kHz, binaural beats no wider than 12 Hz, movement slow enough
// that nothing pulses or flutters.
export const LIMITS = {
  noiseLevel: [0, 1],
  toneFreq: [40, 600],
  toneLevel: [0, 1],
  beat: [0, 12],
  lowpass: [200, 8000],
  highpass: [20, 1500],
  motionAmount: [0, 1],
  motionSpeed: [0.01, 0.25], // cycles per second: 4s per wave at the fastest
  volume: [0, 1],
};

export const NOISE_COLORS = ["brown", "pink", "white", "rain", "none"];
export const MOTION_KINDS = ["constant", "drift", "waves", "gusts"];
export const TONE_WAVES = ["sine", "triangle"];

const clamp = (v, [lo, hi], fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

export const DEFAULT_PARAMS = {
  noise: "brown",
  noiseLevel: 0.8,
  lowpass: 1400,
  highpass: 30,
  toneOn: false,
  toneFreq: 136,
  toneWave: "sine",
  toneLevel: 0.25,
  beat: 0,
  motion: "constant",
  motionAmount: 0.4,
  motionSpeed: 0.06,
  windDown: false,
  volume: 0.5,
};

export function clampParams(p) {
  const src = p && typeof p === "object" ? p : {};
  const d = DEFAULT_PARAMS;
  let highpass = clamp(src.highpass, LIMITS.highpass, d.highpass);
  const lowpass = clamp(src.lowpass, LIMITS.lowpass, d.lowpass);
  // A highpass above the lowpass would cancel everything; keep a gap.
  if (highpass > lowpass / 2) highpass = Math.max(LIMITS.highpass[0], lowpass / 2);
  return {
    noise: NOISE_COLORS.includes(src.noise) ? src.noise : d.noise,
    noiseLevel: clamp(src.noiseLevel, LIMITS.noiseLevel, d.noiseLevel),
    lowpass,
    highpass,
    toneOn: !!src.toneOn,
    toneFreq: clamp(src.toneFreq, LIMITS.toneFreq, d.toneFreq),
    toneWave: TONE_WAVES.includes(src.toneWave) ? src.toneWave : d.toneWave,
    toneLevel: clamp(src.toneLevel, LIMITS.toneLevel, d.toneLevel),
    beat: clamp(src.beat, LIMITS.beat, d.beat),
    motion: MOTION_KINDS.includes(src.motion) ? src.motion : d.motion,
    motionAmount: clamp(src.motionAmount, LIMITS.motionAmount, d.motionAmount),
    motionSpeed: clamp(src.motionSpeed, LIMITS.motionSpeed, d.motionSpeed),
    windDown: !!src.windDown,
    volume: clamp(src.volume, LIMITS.volume, d.volume),
  };
}

// ── Presets ───────────────────────────────────────────────────────────
// The tone presets use frequencies people commonly reach for when
// grounding (136.1 Hz "Om", 432 Hz, alpha-range binaural beats). They're
// offered because people find them calming, not because they do anything
// medical — the UI says so.
const P = (patch) => clampParams({ ...DEFAULT_PARAMS, ...patch });
export const PRESETS = [
  { id: "brown", name: "Brown noise", emoji: "🟤", params: P({ noise: "brown", lowpass: 1400 }) },
  { id: "deep_brown", name: "Deep rumble", emoji: "🌑", params: P({ noise: "brown", lowpass: 450, noiseLevel: 1 }) },
  { id: "pink", name: "Pink noise", emoji: "🌸", params: P({ noise: "pink", lowpass: 6000, noiseLevel: 0.7 }) },
  { id: "white", name: "Soft white noise", emoji: "⚪", params: P({ noise: "white", lowpass: 4000, highpass: 120, noiseLevel: 0.45 }) },
  { id: "rain", name: "Rain", emoji: "🌧️", params: P({ noise: "rain", lowpass: 7000, highpass: 250, noiseLevel: 0.8, motion: "drift", motionAmount: 0.25, motionSpeed: 0.03 }) },
  { id: "wind", name: "Wind", emoji: "🌬️", params: P({ noise: "pink", lowpass: 1100, highpass: 80, noiseLevel: 1, motion: "gusts", motionAmount: 0.75, motionSpeed: 0.07 }) },
  { id: "ocean", name: "Ocean waves", emoji: "🌊", params: P({ noise: "brown", lowpass: 1800, noiseLevel: 1, motion: "waves", motionAmount: 0.8, motionSpeed: 0.08 }) },
  { id: "om", name: "Low hum (136 Hz)", emoji: "🕉️", params: P({ noise: "brown", lowpass: 600, noiseLevel: 0.45, toneOn: true, toneFreq: 136.1, toneLevel: 0.35 }) },
  { id: "432", name: "432 Hz tone", emoji: "🎐", params: P({ noise: "pink", lowpass: 1200, noiseLevel: 0.4, toneOn: true, toneFreq: 432, toneLevel: 0.4, motion: "drift", motionAmount: 0.2, motionSpeed: 0.03 }) },
  { id: "alpha", name: "Alpha binaural (10 Hz)", emoji: "🎧", params: P({ noise: "brown", lowpass: 800, noiseLevel: 0.4, toneOn: true, toneFreq: 200, beat: 10, toneLevel: 0.3 }) },
];
export const DEFAULT_PRESET_ID = "brown";
export const presetById = (id) => PRESETS.find((p) => p.id === id) || null;

// ── Noise generators ──────────────────────────────────────────────────
// Seeded so a regenerated buffer sounds the same (mulberry32).
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fills `out` with noise of the given colour. Each colour is a filter
// over uniform white noise:
//   white  — x[n] uniform in [-1, 1]: equal energy per Hz.
//   pink   — Paul Kellet's 7-pole approximation of a -3 dB/octave slope.
//   brown  — leaky integration of white (a random walk pulled back
//            towards 0): -6 dB/octave, the deep "rumble".
//   rain   — soft pink bed plus sparse droplets: short decaying
//            sinusoids at random times, pitches and loudness.
export function fillNoise(out, color, sampleRate, seed = 1) {
  const r = rng(seed);
  const n = out.length;
  if (color === "none") { out.fill(0); return out; }
  if (color === "white") {
    for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  } else if (color === "brown") {
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
      out[i] = last * 3.5;
    }
  } else {
    // pink (also the bed under rain)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    if (color === "rain") {
      for (let i = 0; i < n; i++) out[i] *= 0.45;
      const drops = Math.round((n / sampleRate) * 70); // ~70 drops a second
      for (let d = 0; d < drops; d++) {
        const start = Math.floor(r() * n);
        const freq = 900 + r() * 3200;
        const amp = 0.05 + Math.pow(r(), 3) * 0.35;
        const decay = 0.004 + r() * 0.018; // seconds
        const len = Math.min(n - start, Math.floor(decay * 6 * sampleRate));
        const w = (2 * Math.PI * freq) / sampleRate;
        for (let k = 0; k < len; k++) {
          out[start + k] += amp * Math.sin(w * k) * Math.exp(-k / (decay * sampleRate));
        }
      }
    }
  }
  return out;
}

// Makes a buffer loop without a click: the last `fade` samples are
// generated past the loop length and cross-faded into the start.
export function makeLoop(color, sampleRate, seconds = 12, seed = 1) {
  const len = Math.floor(seconds * sampleRate);
  const fade = Math.floor(0.5 * sampleRate);
  const raw = fillNoise(new Float32Array(len + fade), color, sampleRate, seed);
  const out = raw.subarray(0, len);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[i] * t + raw[len + i] * (1 - t);
  }
  normalize(out, 0.5);
  return out;
}

export function normalize(buf, peak) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
  if (m > 0) { const g = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  return buf;
}

// ── Movement ──────────────────────────────────────────────────────────
// Smooth value noise in [0, 1] — the "gusts" curve.
function valueNoise(x, seed = 7) {
  const hash = (i) => {
    let h = (i * 374761393 + seed * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return hash(i) * (1 - s) + hash(i + 1) * s;
}

// How much of the sound is "present" at time t (seconds): 1 = full, lower
// = quieter and darker. Never above 1, so movement can't make anything
// louder than the settings already are.
export function motionValue(kind, t, speed, amount) {
  if (kind === "constant" || amount <= 0) return 1;
  let m; // 0..1 shape
  if (kind === "waves") {
    // A swell that rises slowly and falls away, like a wave on a beach.
    const ph = (t * speed) % 1;
    m = Math.pow(Math.sin(Math.PI * ph), 2);
  } else if (kind === "gusts") {
    const x = t * speed * 2;
    m = Math.min(1, Math.max(0, valueNoise(x) * 0.7 + valueNoise(x * 2.3, 11) * 0.3));
  } else {
    // drift: incommensurate slow sines, never quite repeating.
    m = 0.5 + 0.25 * Math.sin(2 * Math.PI * speed * t) + 0.25 * Math.sin(2 * Math.PI * speed * 0.618 * t + 1.3);
  }
  return 1 - amount * 0.7 * (1 - m);
}

// Wind-down over a timed session: quieter and darker towards the end.
export function windDownValue(progress) {
  const p = Math.min(1, Math.max(0, progress));
  return 1 - 0.45 * p;
}

export const fmtHz = (hz) => (hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz * 10) / 10} Hz`);
