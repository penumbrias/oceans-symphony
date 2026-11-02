// The sound bus — ONE Web Audio context for everything Soundscape plays, so
// generated sound and recordings mix through the same safety chain instead
// of two engines (two limiters, double the work, and the "element already
// routed" error a second context would hit).
//
//   layer gain ┐
//   layer gain ┼→ input → limiter → ceiling → analyser → speakers
//   layer gain ┘
//
// A layer is anything that makes sound: the generated Soundscape (engine.js)
// or a recording's <audio> element (attachElement). Each owns its own gain,
// so fades and volume stay per layer; the limiter and ceiling here cap the
// SUM, so stacking layers can never get louder than one did before.
//
// Waking: phones suspend ("interrupted" on iPhone) the context on calls,
// screen-off or headphone changes. While any layer holds the bus, a
// suspended context is resumed as soon as the page is allowed to.
//
// Recordings: an element can be routed into Web Audio only if its file can
// be READ by the page — a local file, or a host that sends CORS headers.
// Anything else plays silence once routed, so canRouteSrc() decides before
// an element is ever attached; streamed files that can't be routed keep
// playing as a plain element (see the Nature sounds player).

const CEILING = 0.9;

let ctx = null;
let bus = null;
const holders = new Set();
const routed = new WeakMap(); // element → MediaElementAudioSourceNode

export function hasWebAudio() {
  return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
}

export function getAudioContext() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AC) throw new Error("This device can't make generated sound.");
  ctx = new AC();
  ctx.addEventListener?.("statechange", wakeIfHeld);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", wakeIfHeld);
  return ctx;
}

function wakeIfHeld() {
  if (!ctx || !holders.size) return;
  if (ctx.state === "suspended" || ctx.state === "interrupted") ctx.resume().catch(() => { /* not allowed yet */ });
}

function build() {
  const c = getAudioContext();
  const input = c.createGain();
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
  input.connect(limiter).connect(ceiling).connect(analyser).connect(c.destination);
  bus = { input, limiter, analyser };
  return bus;
}

export function getBus() { return bus || build(); }
export function getBusAnalyser() { return bus?.analyser || null; }

// A layer says it is sounding (hold) or done (release). Holding resumes the
// context; the bus keeps waking it while anyone holds it.
export async function holdBus(key) {
  holders.add(key);
  const c = getAudioContext();
  if (c.state !== "running") { try { await c.resume(); } catch { /* resumed on the next gesture */ } }
}
export function releaseBus(key) { holders.delete(key); }
export const isBusHeld = () => holders.size > 0;

// A new layer: its own gain, feeding the bus. Returns the gain node.
export function createLayer() {
  const c = getAudioContext();
  const b = getBus();
  const g = c.createGain();
  g.connect(b.input);
  return g;
}

// ── recordings ──────────────────────────────────────────────────────────────

const corsOk = new Map(); // origin → true/false once probed

function originOf(url) {
  try { return new URL(url, window.location.href).origin; } catch { return null; }
}

// True when the page can read this file, so routing it through Web Audio
// won't turn it silent. blob:/data: and same-origin files (which includes a
// native app's own files through convertFileSrc) always can.
export function isLocalSrc(url) {
  if (!url || typeof window === "undefined") return false;
  if (/^(blob|data):/i.test(url)) return true;
  return originOf(url) === window.location.origin;
}

// Whether a file may be routed: local files yes; a remote host only once a
// small CORS request to it has succeeded (cached per origin, re-checked
// after a failure on the next app start).
export async function canRouteSrc(url) {
  if (!hasWebAudio()) return false;
  if (isLocalSrc(url)) return true;
  const origin = originOf(url);
  if (!origin) return false;
  if (corsOk.has(origin)) return corsOk.get(origin);
  let ok = false;
  try {
    const res = await fetch(url, { mode: "cors", headers: { Range: "bytes=0-1" }, cache: "no-store" });
    ok = res.ok || res.status === 206;
    try { await res.body?.cancel(); } catch { /* nothing to cancel */ }
  } catch { ok = false; }
  // Offline looks the same as "not allowed": only remember a "no" made online.
  if (ok || typeof navigator === "undefined" || navigator.onLine !== false) corsOk.set(origin, ok);
  return ok;
}

// Route an <audio> element into a layer. An element can only ever be routed
// once (a second createMediaElementSource throws), so the source node is
// remembered per element and simply re-connected. Remote files must have
// passed canRouteSrc and the element must have crossOrigin="anonymous" set
// before its src.
export function attachElement(el, layerGain) {
  const c = getAudioContext();
  let src = routed.get(el);
  if (!src) {
    src = c.createMediaElementSource(el);
    routed.set(el, src);
  }
  try { src.disconnect(); } catch { /* not connected */ }
  src.connect(layerGain);
  return src;
}

export const isElementRouted = (el) => routed.has(el);

// Test hook: forget probe results (tests and "try again").
export function resetRouteChecks() { corsOk.clear(); }
