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
  rainAmount: [0, 1],
  rainDrop: [0, 1],
  rainClose: [0, 1],
};

export const NOISE_COLORS = ["brown", "pink", "white", "rain", "none"];
export const MOTION_KINDS = ["constant", "drift", "waves", "gusts"];
export const TONE_WAVES = ["sine", "triangle"];
// What the rain is landing on (only used when noise is "rain").
export const RAIN_SURFACES = ["open", "leaves", "puddles", "roof", "tent"];

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
  rainAmount: 0.35,
  rainDrop: 0.5,
  rainSurface: "open",
  rainClose: 0.6,
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
    // Rain shape is baked into a generated loop, so it moves in 5% steps:
    // each step is one cached buffer, not one per slider pixel.
    rainAmount: step20(clamp(src.rainAmount, LIMITS.rainAmount, d.rainAmount)),
    rainDrop: step20(clamp(src.rainDrop, LIMITS.rainDrop, d.rainDrop)),
    rainSurface: RAIN_SURFACES.includes(src.rainSurface) ? src.rainSurface : d.rainSurface,
    rainClose: step20(clamp(src.rainClose, LIMITS.rainClose, d.rainClose)),
  };
}

const step20 = (v) => Math.round(v * 20) / 20;

// The part of the params that decides the rain loop itself.
export const rainShape = (p) => ({ amount: p.rainAmount, drop: p.rainDrop, surface: p.rainSurface, close: p.rainClose });
export const rainKey = (p) => `${p.rainSurface}_${p.rainAmount}_${p.rainDrop}_${p.rainClose}`;

// Roughly where the drops ring, for the visualiser's predicted shape.
export function rainCenterHz(p) {
  const d = p.rainDrop;
  switch (p.rainSurface) {
    case "leaves": return 4200 - 1800 * d;
    case "puddles": return 1300 - 500 * d;
    case "roof": return 900 - 350 * d;
    case "tent": return 260 - 90 * d;
    default: return 2600 - 1700 * d;
  }
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
  { id: "drizzle", name: "Drizzle", emoji: "☔", params: P({ noise: "rain", lowpass: 6500, highpass: 300, noiseLevel: 0.65, rainAmount: 0.1, rainDrop: 0.15, rainClose: 0.55 }) },
  { id: "downpour", name: "Downpour", emoji: "⛈️", params: P({ noise: "rain", lowpass: 5000, highpass: 120, noiseLevel: 0.9, rainAmount: 0.9, rainDrop: 0.75, rainClose: 0.5, motion: "gusts", motionAmount: 0.35, motionSpeed: 0.04 }) },
  { id: "rain_roof", name: "Rain on a roof", emoji: "🏠", params: P({ noise: "rain", lowpass: 5500, highpass: 90, noiseLevel: 0.8, rainSurface: "roof", rainAmount: 0.45, rainDrop: 0.55, rainClose: 0.7 }) },
  { id: "rain_tent", name: "Rain on a tent", emoji: "⛺", params: P({ noise: "rain", lowpass: 3500, highpass: 50, noiseLevel: 0.8, rainSurface: "tent", rainAmount: 0.4, rainDrop: 0.6, rainClose: 0.9 }) },
  { id: "rain_leaves", name: "Rain in the trees", emoji: "🌳", params: P({ noise: "rain", lowpass: 7500, highpass: 250, noiseLevel: 0.75, rainSurface: "leaves", rainAmount: 0.6, rainDrop: 0.35, rainClose: 0.45, motion: "drift", motionAmount: 0.25, motionSpeed: 0.03 }) },
  { id: "rain_puddles", name: "Puddles", emoji: "💧", params: P({ noise: "rain", lowpass: 6000, highpass: 150, noiseLevel: 0.75, rainSurface: "puddles", rainAmount: 0.25, rainDrop: 0.5, rainClose: 0.8 }) },
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
export function fillNoise(out, color, sampleRate, seed = 1, shape = null) {
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
  } else if (color === "rain") {
    fillRain(out, sampleRate, r, shape || rainShape(DEFAULT_PARAMS));
  } else {
    fillPink(out, r);
  }
  return out;
}

function fillPink(out, r) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
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
  return out;
}

const rms = (b) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i]; return Math.sqrt(s / b.length) || 0; };

// A decaying sine "plink" added into buf, built with the two-term
// recurrence sin(k+1) = 2cos(w)·sin(k) − sin(k−1) so heavy rain stays cheap.
// `att` samples of fade-in soften the hit (distant rain has no sharp edge).
function addRing(buf, start, freq, decay, amp, att, sr) {
  const len = Math.min(buf.length - start, Math.floor(decay * 5 * sr));
  const w = (2 * Math.PI * freq) / sr;
  const c = 2 * Math.cos(w);
  const g = Math.exp(-1 / (decay * sr));
  let y1 = 0, y0 = Math.sin(w), e = amp;
  for (let k = 0; k < len; k++) {
    const a = k < att ? k / att : 1;
    buf[start + k] += y1 * e * a;
    const y2 = c * y0 - y1;
    y1 = y0; y0 = y2; e *= g;
  }
}

// A short burst of noise: the patter of a drop on a leaf.
function addTick(buf, start, decay, amp, att, sr, r) {
  const len = Math.min(buf.length - start, Math.floor(decay * 5 * sr));
  const g = Math.exp(-1 / (decay * sr));
  let e = amp, prev = 0;
  for (let k = 0; k < len; k++) {
    const w = r() * 2 - 1;
    const a = k < att ? k / att : 1;
    buf[start + k] += (w - prev) * 0.5 * e * a; // differenced: crisp, no rumble
    prev = w; e *= g;
  }
}

// A falling drop trapping a bubble in a puddle: the bubble rings at a
// pitch that rises as it settles (the "plink").
function addBubble(buf, start, f0, decay, amp, sr) {
  const len = Math.min(buf.length - start, Math.floor(decay * 5 * sr));
  const g = Math.exp(-1 / (decay * sr));
  let ph = 0, e = amp;
  for (let k = 0; k < len; k++) {
    const t = k / sr;
    ph += (2 * Math.PI * f0 * (1 + (1.8 * t) / (decay * 5))) / sr;
    const a = k < 24 ? k / 24 : 1;
    buf[start + k] += Math.sin(ph) * e * a;
    e *= g;
  }
}

// Rain = a soft pink-noise wash plus drops. The shape decides how many
// drops fall (amount), how big they are (drop: bigger = lower, longer,
// louder), what they land on (surface) and how near they are (close:
// far rain is softer-edged, duller and more wash than drops).
function fillRain(out, sr, r, shape) {
  const n = out.length;
  const amount = Math.min(1, Math.max(0, shape.amount ?? 0.35));
  const drop = Math.min(1, Math.max(0, shape.drop ?? 0.5));
  const close = Math.min(1, Math.max(0, shape.close ?? 0.6));
  const surface = RAIN_SURFACES.includes(shape.surface) ? shape.surface : "open";

  const bed = fillPink(new Float32Array(n), r);
  const drops = new Float32Array(n);
  const count = Math.round((n / sr) * (15 + 260 * Math.pow(amount, 1.5)));
  const att = Math.max(1, Math.round((0.0003 + (1 - close) * 0.004) * sr));
  const size = () => (0.05 + 0.35 * Math.pow(r(), 3)) * (0.6 + 0.8 * drop);

  if (surface === "roof" || surface === "tent") {
    // A hard surface rings at its own pitches whichever drop hits it, so
    // the drops become clicks fed through a few resonating "panels"
    // (two-pole resonators). Cost depends on the loop length, not on
    // how hard it's raining.
    const roof = surface === "roof";
    const panels = 4;
    const ratios = roof ? [1, 2.32, 4.25] : [1, 1.61];
    const gains = roof ? [1, 0.5, 0.28] : [1, 0.35];
    const decay = roof ? 0.035 + 0.05 * drop : 0.01 + 0.018 * drop;
    const list = [];
    for (let d = 0; d < count; d++) list.push({ start: Math.floor(r() * n), amp: size(), panel: Math.floor(r() * panels) });
    const exc = new Float32Array(n);
    const click = Math.max(2, Math.round((0.0004 + 0.0012 * drop) * sr)) + att;
    for (let pi = 0; pi < panels; pi++) {
      exc.fill(0);
      for (const d of list) {
        if (d.panel !== pi) continue;
        const len = Math.min(n - d.start, click);
        for (let k = 0; k < len; k++) exc[d.start + k] += d.amp * (r() * 2 - 1) * (1 - k / len);
      }
      const f0 = (roof ? 430 - 200 * drop : 190 - 80 * drop) * (0.8 + 0.5 * r());
      for (let m = 0; m < ratios.length; m++) {
        const f = f0 * ratios[m];
        const dec = decay / Math.sqrt(ratios[m]);
        const rr = Math.exp(-1 / (dec * sr));
        const a1 = 2 * rr * Math.cos((2 * Math.PI * f) / sr);
        const a2 = -rr * rr;
        const b0 = (1 - rr) * gains[m];
        let y1 = 0, y2 = 0;
        for (let i = 0; i < n; i++) {
          const y = b0 * exc[i] + a1 * y1 + a2 * y2;
          y2 = y1; y1 = y;
          drops[i] += y;
        }
      }
      // A little of the hit itself, so it isn't only the ring.
      for (let i = 0; i < n; i++) drops[i] += exc[i] * (roof ? 0.04 : 0.02);
    }
  } else {
    for (let d = 0; d < count; d++) {
      const start = Math.floor(r() * n);
      const amp = size();
      if (surface === "leaves") {
        if (r() < 0.12) {
          // A bigger drip off a leaf now and then.
          addRing(drops, start, (1400 - 600 * drop) * (0.7 + 0.6 * r()), 0.006 + 0.012 * drop, amp * 0.7, att, sr);
        } else {
          addTick(drops, start, (0.0015 + 0.004 * drop) * (0.6 + 0.8 * r()), amp, att, sr, r);
        }
      } else if (surface === "puddles" && r() < 0.4) {
        addBubble(drops, start, (550 + 1400 * (1 - drop)) * (0.7 + 0.6 * r()), 0.008 + 0.014 * drop, amp * 0.9, sr);
        addTick(drops, start, 0.0015, amp * 0.3, att, sr, r);
      } else {
        const freq = (2600 - 1700 * drop) * (0.6 + 0.8 * r());
        const decay = (0.003 + 0.02 * drop) * (0.5 + r());
        addRing(drops, start, freq, decay, surface === "puddles" ? amp * 0.5 : amp, att, sr);
      }
    }
  }

  // Distance: far drops lose their highs (one-pole lowpass).
  const fc = 1500 + 10000 * close * close;
  const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
  let lp = 0;
  for (let i = 0; i < n; i++) { lp += k * (drops[i] - lp); drops[i] = lp; }

  // Balance the two layers by loudness, so every surface and size sits
  // the same way against the wash: nearer = more drop, heavier = more wash.
  const bedR = rms(bed), dropR = rms(drops);
  const ratio = (0.35 + close) * (1.25 - 0.5 * amount);
  const dg = dropR > 0 ? (bedR * ratio) / dropR : 0;
  for (let i = 0; i < n; i++) out[i] = bed[i] + drops[i] * dg;
  return out;
}

// Makes a buffer loop without a click: the last `fade` samples are
// generated past the loop length and cross-faded into the start.
export function makeLoop(color, sampleRate, seconds = 12, seed = 1, shape = null) {
  const len = Math.floor(seconds * sampleRate);
  const fade = Math.floor(0.5 * sampleRate);
  const raw = fillNoise(new Float32Array(len + fade), color, sampleRate, seed, shape);
  const out = raw.subarray(0, len);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[i] * t + raw[len + i] * (1 - t);
  }
  if (color === "rain") levelRain(out);
  else normalize(out, 0.5);
  return out;
}

// Rain is mostly quiet with sharp drops, so peak-normalising would make a
// drizzle and a downpour wildly different in loudness. Instead: match an
// average loudness, then round off the rare loud drop so nothing
// passes 0.5.
const RAIN_RMS = 0.07;
function levelRain(buf) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  const r = rms(buf);
  if (!r || !peak) return buf;
  const g = Math.min(RAIN_RMS / r, 1.5 / peak);
  for (let i = 0; i < buf.length; i++) buf[i] = 0.5 * Math.tanh((buf[i] * g) / 0.5);
  return buf;
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
