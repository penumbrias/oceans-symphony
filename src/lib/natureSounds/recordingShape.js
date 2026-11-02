// "Shape the sound" for a recording (a nature sound or one of your own):
// low cut, high cut, movement, space (a soft room) and speed. Pure values
// and limits only — the player applies them (naturePlayer.js). Saved with
// the Nature sounds settings (naturePrefs `shape`), so it rides backups.
//
// Every value read back is clamped, so an edited or old setting can't get
// past these limits. The defaults change nothing: the recording plays
// exactly as it was recorded.

export const SHAPE_LIMITS = {
  lowCut: [20, 2000],      // Hz; 20 = off
  highCut: [400, 20000],   // Hz; 20000 = off
  space: [0, 0.6],         // reverb mix
  motionSpeed: [0.02, 0.5], // swells per second
  motionAmount: [0, 0.8],  // how far it dips
  speed: [0.5, 1.5],       // playback rate
};

export const MOTIONS = ["constant", "drift", "waves", "gusts"];

export const DEFAULT_SHAPE = {
  lowCut: 20,
  highCut: 20000,
  space: 0,
  motion: "constant",
  motionSpeed: 0.08,
  motionAmount: 0.4,
  speed: 1,
  keepPitch: true,
};

const num = (v, [lo, hi], d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function clampShape(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = {
    lowCut: num(r.lowCut, SHAPE_LIMITS.lowCut, DEFAULT_SHAPE.lowCut),
    highCut: num(r.highCut, SHAPE_LIMITS.highCut, DEFAULT_SHAPE.highCut),
    space: num(r.space, SHAPE_LIMITS.space, DEFAULT_SHAPE.space),
    motion: MOTIONS.includes(r.motion) ? r.motion : DEFAULT_SHAPE.motion,
    motionSpeed: num(r.motionSpeed, SHAPE_LIMITS.motionSpeed, DEFAULT_SHAPE.motionSpeed),
    motionAmount: num(r.motionAmount, SHAPE_LIMITS.motionAmount, DEFAULT_SHAPE.motionAmount),
    speed: num(r.speed, SHAPE_LIMITS.speed, DEFAULT_SHAPE.speed),
    keepPitch: r.keepPitch !== false,
  };
  // The cuts never cross: keep at least an octave between them.
  if (s.highCut < s.lowCut * 2) s.highCut = Math.min(SHAPE_LIMITS.highCut[1], s.lowCut * 2);
  return s;
}

export const isDefaultShape = (s) => {
  const c = clampShape(s);
  return Object.keys(DEFAULT_SHAPE).every((k) => c[k] === DEFAULT_SHAPE[k]);
};

// Only these need the recording to go through Web Audio; speed works on
// any recording.
export const shapeNeedsRouting = (s) => {
  const c = clampShape(s);
  return c.lowCut > 20 || c.highCut < 20000 || c.space > 0 || c.motion !== "constant";
};

// A soft room: two seconds of decaying stereo noise, made once per context.
export function makeRoomImpulse(ctx, seconds = 2.2, decay = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, decay);
  }
  return buf;
}
