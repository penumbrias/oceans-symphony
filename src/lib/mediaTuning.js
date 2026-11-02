import { useCallback, useEffect, useRef, useState } from "react";

// Tempo & pitch for the audio / video players.
//
// PLAYBACK ONLY. Nothing here re-encodes or rewrites a file — the stored bytes
// stay the original (CLAUDE.md "Original Quality Invariant"). Changing tempo or
// pitch only changes how the element is played right now.
//
//  • Tempo  → the element's own playbackRate. With the pitch worklet ready the
//             browser's built-in pitch correction is OFF (it sounds robotic on
//             phones) and the worklet puts the pitch back instead.
//  • Pitch  → public/pitch-shifter-worklet.js (WSOLA time-stretch + resample,
//             an AudioWorklet) between the element and the speakers, set to
//             pitch ÷ tempo so tempo and pitch each end up exactly as asked.
//             Until it has loaded — or where AudioWorklet isn't available —
//             the older delay-line shifter and the browser's pitch correction
//             are used. The graph is created only the first time a tempo or
//             pitch change is asked for, so plain playback never goes through
//             Web Audio at all (no background-playback or latency surprises).
//  • Link   → tempo and pitch move together, exactly like a normal speed
//             change on a tape: preservesPitch OFF and the shifter bypassed.
//
// The fallback shifter is the classic two-tap crossfaded modulated delay
// ("Jungle"): fine for a few semitones, a little chorus-y towards the ends.

export const TEMPO_MIN = 0.5;
export const TEMPO_MAX = 2;
export const TEMPO_STEP = 0.05;
export const PITCH_MIN = -12; // semitones
export const PITCH_MAX = 12;
export const PITCH_STEP = 1;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const semitonesToRatio = (st) => Math.pow(2, st / 12);
const ratioToSemitones = (r) => 12 * Math.log2(r);
const roundTo = (v, step) => Math.round(v / step) * step;

// ── pitch shifter ────────────────────────────────────────────────────────────

const WINDOW = 0.1;   // seconds per delay sweep
const FADE = 0.05;    // crossfade length (WINDOW / 2 → pure equal-power crossfade)

function makeShifter(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.max(2, Math.round(WINDOW * sr));

  const fadeBuf = ctx.createBuffer(1, len, sr);
  const f = fadeBuf.getChannelData(0);
  const fadeLen = Math.round(FADE * sr);
  for (let i = 0; i < len; i++) {
    f[i] = i < fadeLen ? Math.sqrt(i / fadeLen) : Math.sqrt(Math.max(0, 1 - (i - fadeLen) / fadeLen));
  }
  const downBuf = ctx.createBuffer(1, len, sr); // delay grows 0 → 1  (pitch down)
  const upBuf = ctx.createBuffer(1, len, sr);   // delay shrinks 1 → 0 (pitch up)
  const d = downBuf.getChannelData(0);
  const u = upBuf.getChannelData(0);
  for (let i = 0; i < len; i++) { d[i] = i / len; u[i] = (len - i) / len; }

  const input = ctx.createGain();
  const output = ctx.createGain();
  const lines = [];
  const sources = [];

  const makeLine = () => {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0;
    const mix = ctx.createGain();
    mix.gain.value = 0;

    const mk = (buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(delay.delayTime);
      sources.push(src);
      return { src, g };
    };
    const down = mk(downBuf);
    const up = mk(upBuf);

    const fade = ctx.createBufferSource();
    fade.buffer = fadeBuf;
    fade.loop = true;
    fade.connect(mix.gain);
    sources.push(fade);

    input.connect(delay);
    delay.connect(mix);
    mix.connect(output);
    return { down, up, fade };
  };

  lines.push(makeLine(), makeLine());

  const t = ctx.currentTime + 0.05;
  const t2 = t + WINDOW - FADE;
  lines[0].down.src.start(t); lines[0].up.src.start(t); lines[0].fade.start(t);
  lines[1].down.src.start(t2); lines[1].up.src.start(t2); lines[1].fade.start(t2);

  return {
    input,
    output,
    // ratio > 1 → higher, < 1 → lower. The delay sweeps by |1 − ratio| × WINDOW
    // over one window, which is exactly what moves the read head at `ratio`×.
    setRatio(ratio) {
      const amount = Math.abs(1 - ratio) * WINDOW;
      const goingUp = ratio > 1;
      const now = ctx.currentTime;
      for (const l of lines) {
        l.up.g.gain.setTargetAtTime(goingUp ? amount : 0, now, 0.01);
        l.down.g.gain.setTargetAtTime(goingUp ? 0 : amount, now, 0.01);
      }
    },
    stop() {
      for (const s of sources) { try { s.stop(); } catch { /* not started */ } }
    },
  };
}

// One engine per media element: element → (dry | shifter) → speakers.
const WORKLET_URL = "/pitch-shifter-worklet.js";

// The phone's own tempo change (pitch kept) comes out quieter than a plain
// speed change on most real music — the overlapped slices it joins add up to
// less than the original, about 1–2 dB on noisy or busy sound. Nothing in the
// page can see the original level, so this is a fixed make-up (+2 dB) while
// that tempo change is on. The pitch shifter measures and matches its own level.
const STRETCH_MAKEUP = 1.26;

// Bends anything near full scale so the make-up can't clip.
function makeLimiterCurve() {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
  }
  return c;
}

function makeEngine(el, onReady) {
  const Ctor = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctor) throw new Error("Web Audio isn't available");
  const ctx = new Ctor();
  const source = ctx.createMediaElementSource(el); // throws if the element is already routed
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0;
  const shifter = makeShifter(ctx);
  const makeup = ctx.createGain();
  const limiter = ctx.createWaveShaper();
  limiter.curve = makeLimiterCurve();
  source.connect(dry);
  dry.connect(makeup);
  source.connect(shifter.input);
  shifter.output.connect(wet);
  wet.connect(makeup);
  makeup.connect(limiter);
  limiter.connect(ctx.destination);

  // Once an element is routed through a context it is silent while that
  // context is suspended — wake it whenever playback starts.
  const wake = () => { if (ctx.state === "suspended") ctx.resume().catch(() => {}); };
  el.addEventListener("play", wake);
  wake();

  let armedAt = ctx.currentTime + 0.15; // let the shifter's first window fill before it is heard
  let node = null;       // the pitch worklet, once loaded
  let closed = false;
  let lastRatio = 1;
  const engine = {
    el,
    get workletReady() { return !!node; },
    // Level lift for the phone's own tempo change (see STRETCH_MAKEUP).
    setMakeup(gain) { makeup.gain.setTargetAtTime(gain, ctx.currentTime, 0.05); },
    setRatio(ratio) {
      lastRatio = ratio;
      const shifted = Math.abs(ratio - 1) > 0.001;
      if (node) { if (shifted) node.parameters.get("ratio").value = ratio; }
      else if (shifted) shifter.setRatio(ratio);
      const at = Math.max(ctx.currentTime, armedAt);
      dry.gain.setTargetAtTime(shifted ? 0 : 1, at, 0.02);
      wet.gain.setTargetAtTime(shifted ? 1 : 0, at, 0.02);
    },
    close() {
      closed = true;
      el.removeEventListener("play", wake);
      shifter.stop();
      try { node?.disconnect(); } catch { /* already gone */ }
      try { ctx.close(); } catch { /* already closed */ }
    },
  };
  // Load the proper pitch shifter in the background and swap it in.
  if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    ctx.audioWorklet.addModule(WORKLET_URL).then(() => {
      if (closed) return;
      const n = new AudioWorkletNode(ctx, "pitch-shifter", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        channelCount: 2, channelCountMode: "explicit",
      });
      source.connect(n);
      n.connect(wet);
      try { source.disconnect(shifter.input); } catch { /* not connected */ }
      shifter.stop();
      node = n;
      armedAt = ctx.currentTime + 0.15;
      engine.setRatio(lastRatio);
      onReady?.();
    }).catch(() => { /* keep the older shifter */ });
  }
  return engine;
}

// ── hook ─────────────────────────────────────────────────────────────────────

function setPreservesPitch(el, on) {
  if ("preservesPitch" in el) el.preservesPitch = on;
  if ("webkitPreservesPitch" in el) el.webkitPreservesPitch = on;
  if ("mozPreservesPitch" in el) el.mozPreservesPitch = on;
}

/**
 * useMediaTuning(mediaRef, resetKey)
 *   mediaRef  — ref to the <audio> / <video> element
 *   resetKey  — change it (e.g. the file id) to go back to normal for a new file
 * Returns { tempo, semitones, linked, pitchSupported, setTempo, setSemitones,
 *           setLinked, reset, isDefault, onNativeRateChange }.
 * Wire `onNativeRateChange` to the element's onRateChange so the player's own
 * speed menu and this panel never disagree.
 */
export function useMediaTuning(mediaRef, resetKey) {
  const [tempo, setTempoState] = useState(1);
  const [semitones, setSemitonesState] = useState(0);
  const [linked, setLinkedState] = useState(false);
  const [pitchSupported, setPitchSupported] = useState(true);
  // Bumped by the player when it rebuilds its element (e.g. entering full screen)
  // so tempo / pitch are re-applied to the new one.
  const [elTick, setElTick] = useState(0);
  const rebind = useCallback(() => setElTick((n) => n + 1), []);
  const engineRef = useRef(null);
  const stateRef = useRef({ tempo: 1, semitones: 0, linked: false });
  stateRef.current = { tempo, semitones, linked };

  // New file → back to normal.
  useEffect(() => {
    setTempoState(1);
    setSemitonesState(0);
  }, [resetKey]);

  // Apply to the element. Runs on every change and when the element/source swaps.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return undefined;
    const apply = () => {
      const cur = el;
      // Published on the element so that, when the app is left and a video's
      // sound carries on through Web Audio (mediaExclusive.js), it plays with
      // the same tempo and pitch.
      cur.__tuning = { tempo, semitones, linked };
      if (Math.abs(cur.playbackRate - tempo) > 0.001) cur.playbackRate = tempo;
      if (linked) {
        setPreservesPitch(cur, false);      // speed and pitch move together
        engineRef.current?.setRatio(1);
        engineRef.current?.setMakeup(1);
        return;
      }
      setPreservesPitch(cur, true);         // fallback: the browser keeps the pitch for tempo alone
      const ratio = semitonesToRatio(semitones);
      // The player was rebuilt (another file) — the old routing belongs to the old element.
      if (engineRef.current && engineRef.current.el !== cur) { engineRef.current.close(); engineRef.current = null; }
      const needsShift = Math.abs(semitones) > 0.001 || Math.abs(tempo - 1) > 0.001;
      if (!engineRef.current && needsShift) {
        try { engineRef.current = makeEngine(cur, rebind); } catch { setPitchSupported(false); return; }
      }
      // Tempo is the player's own speed change with the pitch KEPT (the phone's
      // pitch correction); the shifter then moves the pitch to exactly what
      // was asked. This used to switch the pitch correction OFF and divide the
      // shifter's ratio by the tempo — which only works if the phone really
      // honours that switch. When it doesn't, the pitch came out lower by the
      // whole tempo ratio ("unlinked pitch gets lower"). Keeping the pitch is
      // right either way.
      engineRef.current?.setRatio(ratio);
      engineRef.current?.setMakeup(Math.abs(tempo - 1) > 0.001 ? STRETCH_MAKEUP : 1);
    };
    apply();
    // The element resets its rate when a new source loads.
    el.addEventListener("loadedmetadata", apply);
    return () => el.removeEventListener("loadedmetadata", apply);
  }, [mediaRef, tempo, semitones, linked, elTick, rebind]);

  // Tear the audio graph down with the player.
  useEffect(() => () => { engineRef.current?.close(); engineRef.current = null; }, []);

  const setTempo = useCallback((v) => {
    const t = clamp(roundTo(v, TEMPO_STEP), TEMPO_MIN, TEMPO_MAX);
    setTempoState(t);
    if (stateRef.current.linked) setSemitonesState(clamp(ratioToSemitones(t), PITCH_MIN, PITCH_MAX));
  }, []);

  const setSemitones = useCallback((v) => {
    const st = clamp(roundTo(v, PITCH_STEP), PITCH_MIN, PITCH_MAX);
    setSemitonesState(st);
    if (stateRef.current.linked) setTempoState(clamp(semitonesToRatio(st), TEMPO_MIN, TEMPO_MAX));
  }, []);

  const setLinked = useCallback((on) => {
    setLinkedState(on);
    // Linking snaps pitch to follow the current tempo.
    if (on) setSemitonesState(clamp(ratioToSemitones(stateRef.current.tempo), PITCH_MIN, PITCH_MAX));
  }, []);

  const reset = useCallback(() => {
    setTempoState(1);
    setSemitonesState(0);
  }, []);

  // The player's own speed menu changed the rate — follow it.
  const onNativeRateChange = useCallback((e) => {
    const raw = e.currentTarget.playbackRate;
    // Our own writes come back here too (linked tempos like 2^(3/12) aren't
    // round numbers) — only a real change from the player's menu gets through.
    if (Math.abs(raw - stateRef.current.tempo) < 0.006) return;
    const t = clamp(Math.round(raw * 100) / 100, TEMPO_MIN, TEMPO_MAX);
    setTempoState(t);
    if (stateRef.current.linked) setSemitonesState(clamp(ratioToSemitones(t), PITCH_MIN, PITCH_MAX));
  }, []);

  return {
    tempo, semitones, linked, pitchSupported,
    setTempo, setSemitones, setLinked, reset, onNativeRateChange, rebind,
    isDefault: Math.abs(tempo - 1) < 0.001 && Math.abs(semitones) < 0.001,
  };
}

export const formatTempo = (t) => `${(Math.round(t * 100) / 100).toFixed(2)}×`;
export const formatSemitones = (st) => {
  const v = Math.round(st * 10) / 10;
  return `${v > 0 ? "+" : ""}${Number.isInteger(v) ? v : v.toFixed(1)} st`;
};
