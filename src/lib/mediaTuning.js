import { useCallback, useEffect, useRef, useState } from "react";

// Tempo & pitch for the audio / video players.
//
// PLAYBACK ONLY. Nothing here re-encodes or rewrites a file — the stored bytes
// stay the original (CLAUDE.md "Original Quality Invariant"). Changing tempo or
// pitch only changes how the element is played right now.
//
//  • Tempo  → the element's own playbackRate with preservesPitch ON, so the
//             speed changes and the voice / notes stay where they are.
//  • Pitch  → a small Web Audio delay-line pitch shifter between the element
//             and the speakers. It is created only the first time a pitch other
//             than 0 is asked for, so plain playback never goes through Web
//             Audio at all (no background-playback or latency surprises).
//  • Link   → tempo and pitch move together, exactly like a normal speed
//             change on a tape: preservesPitch OFF and the shifter bypassed.
//
// The shifter is the classic two-tap crossfaded modulated delay ("Jungle").
// It is good for a few semitones either way and gets a little chorus-y towards
// the ends of the range — that is the trade for not needing a native library.

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
function makeEngine(el) {
  const Ctor = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctor) throw new Error("Web Audio isn't available");
  const ctx = new Ctor();
  const source = ctx.createMediaElementSource(el); // throws if the element is already routed
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0;
  const shifter = makeShifter(ctx);
  source.connect(dry);
  dry.connect(ctx.destination);
  source.connect(shifter.input);
  shifter.output.connect(wet);
  wet.connect(ctx.destination);

  // Once an element is routed through a context it is silent while that
  // context is suspended — wake it whenever playback starts.
  const wake = () => { if (ctx.state === "suspended") ctx.resume().catch(() => {}); };
  el.addEventListener("play", wake);
  wake();

  let armedAt = ctx.currentTime + 0.15; // let the shifter's first window fill before it is heard
  return {
    el,
    setRatio(ratio) {
      const shifted = Math.abs(ratio - 1) > 0.001;
      if (shifted) shifter.setRatio(ratio);
      const at = Math.max(ctx.currentTime, armedAt);
      dry.gain.setTargetAtTime(shifted ? 0 : 1, at, 0.02);
      wet.gain.setTargetAtTime(shifted ? 1 : 0, at, 0.02);
    },
    close() {
      el.removeEventListener("play", wake);
      shifter.stop();
      try { ctx.close(); } catch { /* already closed */ }
    },
  };
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
      if (Math.abs(cur.playbackRate - tempo) > 0.001) cur.playbackRate = tempo;
      if (linked) {
        setPreservesPitch(cur, false);      // speed and pitch move together
        engineRef.current?.setRatio(1);
        return;
      }
      setPreservesPitch(cur, true);         // tempo alone keeps the pitch
      const ratio = semitonesToRatio(semitones);
      // The player was rebuilt (another file) — the old routing belongs to the old element.
      if (engineRef.current && engineRef.current.el !== cur) { engineRef.current.close(); engineRef.current = null; }
      if (!engineRef.current && Math.abs(semitones) > 0.001) {
        try { engineRef.current = makeEngine(cur); } catch { setPitchSupported(false); return; }
      }
      engineRef.current?.setRatio(ratio);
    };
    apply();
    // The element resets its rate when a new source loads.
    el.addEventListener("loadedmetadata", apply);
    return () => el.removeEventListener("loadedmetadata", apply);
  }, [mediaRef, tempo, semitones, linked, elTick]);

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
