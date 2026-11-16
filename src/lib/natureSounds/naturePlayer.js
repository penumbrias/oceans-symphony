// Nature sounds — the player. One recording at a time for the whole app, so
// it keeps playing while someone moves around, alongside a Soundscape.
// A media element streams and seeks a hosted file without needing the
// host's permission, which a fetch would.
//
// Two elements, one in use at a time:
//   • plain  — plays straight to the speakers. Used for a file the page
//              isn't allowed to read (a host without CORS headers).
//   • routed — goes through the shared sound bus (src/lib/audio/soundBus.js)
//              with its own shaping chain, so "Shape the sound" (low/high
//              cut, movement, space) and the visuals work on it:
//              element → low cut → high cut → movement ┬→ dry ┬→ level → bus
//                                                       └→ room┘
// An element can never be un-routed, which is why there are two: a file
// that can't be read would play silence through the routed one.
// Speed works on either.

import { natureSoundById } from "./catalog";
import { natureSoundSrc } from "./natureOffline";
import { readNaturePrefs, writeNaturePrefs } from "./naturePrefs";
import { isOwnSoundId, listMySounds } from "./ownSounds";
import { clampShape, makeRoomImpulse } from "./recordingShape";
import { motionValue } from "@/lib/soundscape/soundMath";
import { getSoundscapeState, stopSoundscape } from "@/lib/soundscape/engine";
import { initNowPlaying, showNowPlaying, clearNowPlaying } from "./nowPlaying";
import {
  canRouteSrc, isLocalSrc, getAudioContext, createLayer, attachElement, holdBus, releaseBus,
} from "@/lib/audio/soundBus";

const BUS_KEY = "nature";

const FADE_MS = 1200;
// A random point never lands this close to the end, so it doesn't jump
// straight into the next sound.
const END_MARGIN = 30;

const listeners = new Set();
// shapeable: the current sound goes through the sound bus, so the shaping
// knobs and the live visual work on it.
// sleep: the sleep timer, or null — { mode: "time", endsAt } | { mode: "track" } | { mode: "queue" }.
let state = { id: null, playing: false, loading: false, error: null, position: 0, duration: 0, shapeable: false, sleep: null };
const emit = () => { for (const fn of listeners) { try { fn(state); } catch { /* listener */ } } };
const setState = (patch) => { state = { ...state, ...patch }; emit(); syncControls(); };
export const subscribeNature = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getNatureState = () => state;
// A recording is sounding through the sound bus (the visuals can see it).
export const isRecordingLive = () => state.playing && state.shapeable;

// The list the person is looking at, in its order — next / previous /
// shuffle walk this. Set by the screen.
let queue = [];
export const setNatureQueue = (ids) => { queue = Array.isArray(ids) ? ids : []; };

let audio = null; // the element in use
let plainEl = null;
let routedEl = null;
let chain = null; // the routed element's shaping chain
let motionTimer = null;
let fadeTimer = null;
let token = 0; // ignores a load that a newer one replaced

// Keeping a long recording going. The hosted file sits behind a signed link
// that runs out after a while, and a phone can drop its connection for a
// moment; either one stops the <audio> mid-sound. When that happens while
// the person wants it playing, the player loads the sound again from the
// lasting address and carries on from the same spot — a few tries, spaced
// out, and it waits for the connection to come back first.
let wantPlaying = false; // the person's intent, not the element's state
let lastPos = 0; // last position that actually played
let retries = 0;
let retryTimer = null;
let stallTimer = null;
let onlineWait = null;
const RETRY_DELAYS = [1000, 3000, 8000, 15000, 30000];
const STALL_MS = 20000; // stuck "loading" this long while playing counts as a drop

function clearRecovery() {
  clearTimeout(retryTimer); retryTimer = null;
  clearTimeout(stallTimer); stallTimer = null;
  if (onlineWait) { window.removeEventListener("online", onlineWait); onlineWait = null; }
}

function recover() {
  if (!state.id || !wantPlaying || retryTimer || onlineWait) return;
  // A drop in the last few seconds is the sound finishing (a phone can
  // stall or fail on the very end of a stream instead of saying "ended"):
  // move on rather than loading the end again.
  if (state.duration > 0 && lastPos >= state.duration - END_SLACK) { finishedSound(); return; }
  clearTimeout(stallTimer); stallTimer = null;
  const id = state.id;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (retries >= RETRY_DELAYS.length) {
    setState({
      loading: false, playing: false,
      error: offline
        ? "You're offline. Connect to play this sound."
        : "This sound couldn't load. Check your connection and try again.",
    });
    return;
  }
  setState({ loading: true, error: null });
  const go = () => {
    retryTimer = null;
    if (state.id !== id || !wantPlaying) return;
    playNature(id, { at: lastPos, resuming: true });
  };
  if (offline) {
    // Wait for the connection instead of spending tries while it's down.
    onlineWait = () => { window.removeEventListener("online", onlineWait); onlineWait = null; retryTimer = setTimeout(go, 1000); };
    window.addEventListener("online", onlineWait);
    setState({ loading: false, playing: false, error: "Connection lost. The sound will carry on when you're back online." });
    return;
  }
  retryTimer = setTimeout(go, RETRY_DELAYS[retries++]);
}

const targetVolume = () => readNaturePrefs().volume / 100;
// The volume, eased down while the sleep timer's closing fade runs.
function levelNow() {
  const sl = state.sleep;
  if (sl?.mode !== "time") return targetVolume();
  const left = sl.endsAt - Date.now();
  return left < SLEEP_FADE_MS ? targetVolume() * Math.max(0, left / SLEEP_FADE_MS) : targetVolume();
}

// The level the person hears: the routed chain's level gain (iPhones ignore
// an element's own volume), else the element's volume.
const isRouted = (a = audio) => !!a && a === routedEl && !!chain;
function getLevel() {
  if (isRouted()) return chain.level.gain.value;
  return audio ? audio.volume : 0;
}
function setLevel(v) {
  const x = Math.max(0, Math.min(1, v));
  if (isRouted()) {
    const g = chain.level.gain;
    g.cancelScheduledValues(0);
    g.value = x;
  } else if (audio) {
    audio.volume = x;
  }
}

// The app is off screen (another app, the lock screen). The phone slows
// timers down there, so a fade would leave the sound silent or playing for
// far too long: jump straight to the level instead.
const away = () => typeof document !== "undefined" && document.visibilityState === "hidden";

function fadeTo(to, ms, done) {
  clearInterval(fadeTimer);
  if (!audio) return;
  if (away()) { setLevel(to); done?.(); return; }
  const from = getLevel();
  const t0 = Date.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    setLevel(from + (to - from) * k);
    if (k >= 1) { clearInterval(fadeTimer); done?.(); }
  }, 40);
}

// ── shaping ────────────────────────────────────────────────────────────────

function buildChain() {
  if (chain) return chain;
  const c = getAudioContext();
  const input = c.createGain();
  const lowCut = c.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.Q.value = 0.5;
  const highCut = c.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.Q.value = 0.5;
  const motion = c.createGain();
  const dry = c.createGain();
  const room = c.createConvolver();
  room.buffer = makeRoomImpulse(c);
  const wet = c.createGain();
  wet.gain.value = 0;
  const level = createLayer(); // → the bus
  level.gain.value = 0;
  input.connect(lowCut).connect(highCut).connect(motion);
  motion.connect(dry).connect(level);
  motion.connect(room).connect(wet).connect(level);
  chain = { input, lowCut, highCut, motion, dry, wet, level };
  return chain;
}

const ramp = (param, v, tc = 0.12) => {
  const c = getAudioContext();
  param.cancelScheduledValues(c.currentTime);
  param.setTargetAtTime(v, c.currentTime, tc);
};

let shapeT0 = 0;
function applyMotion() {
  if (!chain) return;
  const sh = clampShape(readNaturePrefs().shape);
  const c = getAudioContext();
  const m = motionValue(sh.motion, c.currentTime - shapeT0, sh.motionSpeed, sh.motionAmount);
  ramp(chain.motion.gain, m, 0.25);
  // Like the Soundscape: a swell pulling back is muffled as well as quieter.
  const top = sh.highCut * (sh.motion === "constant" ? 1 : 0.35 + 0.65 * m);
  ramp(chain.highCut.frequency, Math.max(sh.lowCut * 2, Math.min(20000, top)), 0.25);
}

// Apply the saved shape to whatever is playing (speed to either element,
// the rest to the routed chain).
export function applyRecordingShape() {
  const sh = clampShape(readNaturePrefs().shape);
  for (const a of [plainEl, routedEl]) {
    if (!a) continue;
    if ("preservesPitch" in a) a.preservesPitch = sh.keepPitch;
    if ("webkitPreservesPitch" in a) a.webkitPreservesPitch = sh.keepPitch;
    if (Math.abs(a.playbackRate - sh.speed) > 0.001) a.playbackRate = sh.speed;
  }
  if (!chain) return;
  ramp(chain.lowCut.frequency, sh.lowCut);
  ramp(chain.highCut.frequency, sh.highCut);
  // Equal-ish power: the room comes up as the direct sound eases back a touch.
  ramp(chain.wet.gain, sh.space * 1.4, 0.2);
  ramp(chain.dry.gain, 1 - sh.space * 0.5, 0.2);
  clearInterval(motionTimer);
  motionTimer = null;
  if (sh.motion === "constant") { ramp(chain.motion.gain, 1); return; }
  if (!shapeT0) shapeT0 = getAudioContext().currentTime;
  applyMotion();
  motionTimer = setInterval(applyMotion, 200);
}

// The element for a file: routed when the page can read it, else plain.
// Switching elements stops the other one so two never play at once.
function pickElement(routable, src) {
  const want = routable ? (routedEl ||= makeEl()) : (plainEl ||= makeEl());
  if (audio && audio !== want) {
    const old = audio;
    try { old.pause(); old.removeAttribute("src"); old.load(); } catch { /* gone */ }
  }
  audio = want;
  if (routable) {
    // A remote host that passed the CORS check must be asked for it, or the
    // routed element plays silence.
    const cors = isLocalSrc(src) ? null : "anonymous";
    if (want.crossOrigin !== cors) {
      if (cors) want.crossOrigin = cors; else want.removeAttribute("crossorigin");
    }
    attachElement(want, buildChain().input);
    want.volume = 1;
  }
  return want;
}

// ── controls outside the app (notification, lock screen, media keys) ───────

let seeks = 0; // bumps on a seek so the controls pick up the new spot

function syncControls() {
  if (!state.id) { clearNowPlaying(); return; }
  const sound = natureSoundById(state.id);
  if (!sound) return;
  showNowPlaying({
    title: sound.title,
    subtitle: sound.own ? "Your sound" : (sound.place || sound.by || ""),
    // The person's intent, so changing sounds doesn't flash "paused".
    playing: wantPlaying && !state.error,
    position: state.position,
    duration: state.duration,
    seeked: seeks,
  });
}

// Coming back to the app (or the screen turning on) and finding the sound
// finished while it was meant to be playing: carry on with the next one.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.id && wantPlaying && audio && atEnd(audio)) finishedSound();
  });
}

initNowPlaying({
  play: () => toggleNature(true),
  pause: () => toggleNature(false),
  next: () => nextNature(),
  previous: () => prevNature(),
  stop: () => stopNature(),
  seek: (t) => { if (Number.isFinite(t)) seekNature(t); },
});

// ── sleep timer ────────────────────────────────────────────────────────────
// Stops the sound after a set time (fading out over the last half minute),
// at the end of this sound, or once Up next runs out. When it ends, the
// made-from-math Soundscape stops too, so the room goes quiet.

const SLEEP_FADE_MS = 30000;
let sleepTick = null;
let soundscapeFading = false;

export function setNatureSleepTimer(choice) {
  clearInterval(sleepTick);
  sleepTick = null;
  soundscapeFading = false;
  let sleep = null;
  if (typeof choice === "number" && choice > 0) {
    sleep = { mode: "time", endsAt: Date.now() + choice * 60000, minutes: choice };
    sleepTick = setInterval(checkSleep, 1000);
  } else if (choice === "track" || choice === "queue") {
    sleep = { mode: choice };
  }
  // A timer moved out of its closing fade comes back up to full.
  if (audio && wantPlaying && state.playing) { clearInterval(fadeTimer); setLevel(targetVolume()); }
  setState({ sleep });
}

// Also run from the element's timeupdate, which keeps going in the
// background where a phone slows timers down.
function checkSleep() {
  const sl = state.sleep;
  if (!sl || sl.mode !== "time") return;
  const left = sl.endsAt - Date.now();
  if (left <= 0) { finishSleep(); return; }
  if (left > SLEEP_FADE_MS) return;
  if (!soundscapeFading && getSoundscapeState().playing) {
    soundscapeFading = true;
    stopSoundscape({ fade: left / 1000 });
  }
  if (audio && wantPlaying && !audio.paused) {
    clearInterval(fadeTimer);
    setLevel(targetVolume() * (left / SLEEP_FADE_MS));
  }
}

function finishSleep() {
  clearInterval(sleepTick);
  sleepTick = null;
  if (!soundscapeFading && getSoundscapeState().playing) stopSoundscape({ fade: 3 });
  soundscapeFading = false;
  wantPlaying = false;
  clearRecovery();
  clearInterval(fadeTimer);
  if (audio && !audio.paused) { try { audio.pause(); } catch { /* gone */ } }
  setState({ sleep: null, playing: false, loading: false });
}

// A sound came to its end on its own. Several signals can say so (the
// element's "ended", a pause or stall right at the end, coming back to the
// app and finding it finished, pressing play on a finished sound); the
// first one moves on, once per load.
const END_SLACK = 15; // seconds from the end that count as "finished"
let endHandledFor = -1;
function atEnd(a) {
  if (!a) return false;
  if (a.ended) return true;
  const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
  return d > 0 && a.currentTime >= d - 1.5;
}
function finishedSound() {
  if (endHandledFor === token) return;
  endHandledFor = token;
  onEnded();
}

function onEnded() {
  const sl = state.sleep;
  if (sl?.mode === "track" || (sl?.mode === "queue" && !readNaturePrefs().upNext.length)) {
    finishSleep();
    return;
  }
  nextNature();
}

function makeEl() {
  const audio = new Audio();
  audio.preload = "metadata";
  const mine = () => audio === currentEl();
  audio.addEventListener("timeupdate", () => {
    if (!mine()) return;
    const t = audio.currentTime || 0;
    // A minute of good playback since the last recovery earns the tries back.
    if (retries && !audio.paused && t > lastPos + 60) retries = 0;
    if (!audio.paused && t > 0) lastPos = t;
    checkSleep();
    setState({ position: t });
  });
  audio.addEventListener("durationchange", () => {
    if (!mine()) return;
    if (Number.isFinite(audio.duration)) setState({ duration: audio.duration });
  });
  audio.addEventListener("waiting", () => {
    if (!mine()) return;
    setState({ loading: true });
    clearTimeout(stallTimer);
    if (wantPlaying) stallTimer = setTimeout(() => { stallTimer = null; if (wantPlaying && state.id) { retryTimer = null; recover(); } }, STALL_MS);
  });
  audio.addEventListener("playing", () => {
    if (!mine()) return;
    clearTimeout(stallTimer); stallTimer = null;
    if (isRouted(audio)) holdBus(BUS_KEY);
    // Played again from earlier on (a seek back): its end counts again.
    if (!atEnd(audio)) endHandledFor = -1;
    setState({ loading: false, playing: true, error: null });
  });
  audio.addEventListener("pause", () => {
    if (!mine()) return;
    clearTimeout(stallTimer); stallTimer = null;
    releaseBus(BUS_KEY);
    setState({ playing: false });
    // Some phones pause at the very end without an "ended".
    if (wantPlaying && atEnd(audio)) finishedSound();
  });
  audio.addEventListener("ended", () => { if (mine()) finishedSound(); });
  audio.addEventListener("error", () => {
    if (!mine() || !state.id) return;
    // A file of your own isn't on the network: retrying won't help.
    if (wantPlaying && !isOwnSoundId(state.id)) { recover(); return; }
    wantPlaying = false;
    setState({
      loading: false, playing: false,
      error: isOwnSoundId(state.id)
        ? "This file couldn't play on this device."
        : navigator.onLine === false
        ? "You're offline. Connect to play this sound."
        : "This sound couldn't load. Check your connection and try again.",
    });
  });
  return audio;
}

// The element in use (a function, so listeners made before a switch read it fresh).
const currentEl = () => audio;

// An element to call play/pause on before any sound is loaded.
function el() {
  return audio || (plainEl ||= makeEl()) && (audio = plainEl);
}

function waitForDuration(a) {
  if (Number.isFinite(a.duration) && a.duration > 0) return Promise.resolve(a.duration);
  return new Promise((resolve, reject) => {
    const off = () => { a.removeEventListener("loadedmetadata", done); a.removeEventListener("error", fail); };
    const done = () => { off(); resolve(Number.isFinite(a.duration) ? a.duration : 0); };
    const fail = () => { off(); reject(new Error("load failed")); };
    a.addEventListener("loadedmetadata", done);
    a.addEventListener("error", fail);
  });
}

const randomTime = (duration) => Math.random() * Math.max(0, duration - END_MARGIN);

// at: "start" | "random" | a time in seconds. resuming: a recovery after a
// drop (keeps the try count and the spot on screen).
export async function playNature(id, { at = "start", resuming = false } = {}) {
  let sound = natureSoundById(id);
  // Your own sounds are read from the database the first time they're needed.
  if (!sound && isOwnSoundId(id)) { await listMySounds(); sound = natureSoundById(id); }
  if (!sound) return;
  const my = ++token;
  // Nothing about the old sound "finishing" counts until this one plays.
  endHandledFor = my;
  const a = el();
  clearInterval(fadeTimer);
  if (!resuming) { clearRecovery(); retries = 0; }
  wantPlaying = true;
  const startAt = typeof at === "number" ? Math.max(0, at) : 0;
  lastPos = startAt;
  setState({
    id, loading: true, error: null, position: startAt,
    duration: (resuming && state.duration) || sound.seconds || 0,
  });
  writeNaturePrefs({ lastId: id });
  try {
    a.pause();
    const src = await natureSoundSrc(id);
    if (my !== token) return;
    // The check is a small network request; with the screen off it can hang,
    // so after a few seconds the sound plays the plain way instead.
    const routable = await Promise.race([
      canRouteSrc(src),
      new Promise((r) => setTimeout(() => r(false), 5000)),
    ]);
    if (my !== token) return;
    let b = a;
    try { b = pickElement(routable, src); } catch { b = pickElement(false, src); }
    b.src = src;
    setState({ shapeable: isRouted(b) });
    applyRecordingShape();
    setLevel(0);
    if (at !== "start" && !(typeof at === "number" && at <= 0)) {
      const d = await waitForDuration(b);
      if (my !== token) return;
      b.currentTime = at === "random" ? randomTime(d) : Math.max(0, Math.min(Number(at) || 0, d || Number(at) || 0));
    }
    await b.play();
    if (my !== token) return;
    fadeTo(levelNow(), resuming ? 600 : FADE_MS);
  } catch (e) {
    if (my !== token || e?.name === "AbortError") return;
    // A load that failed on the network is the error listener's to retry.
    if (audio?.error && !isOwnSoundId(id)) { recover(); return; }
    wantPlaying = false;
    setState({ loading: false, playing: false, error: isOwnSoundId(id) && e?.message ? e.message : "This sound couldn't start on this device." });
  }
}

// Play/pause the current sound (or start the last one).
export function toggleNature(force) {
  const want = force ?? !state.playing;
  if (!state.id) {
    const last = readNaturePrefs().lastId || queue[0];
    if (want && last) playNature(last);
    return;
  }
  const a = el();
  if (want) {
    // A sound that already finished (the app was asleep when it ended)
    // moves on to the next one, like a music player, instead of starting over.
    if (state.id && audio && atEnd(audio) && !a.error) {
      wantPlaying = true;
      onEnded();
      return;
    }
    // After a drop the element is dead; load it again from the same spot
    // instead of asking a broken element to play.
    if (!a.src || a.error || state.error || retryTimer || onlineWait) {
      playNature(state.id, { at: state.position || lastPos || "start" });
      return;
    }
    wantPlaying = true;
    setLevel(0);
    syncControls();
    a.play().then(() => fadeTo(levelNow(), FADE_MS)).catch(() => {
      playNature(state.id, { at: state.position || lastPos || "start" });
    });
  } else {
    wantPlaying = false;
    clearRecovery();
    syncControls();
    fadeTo(0, 400, () => a.pause());
  }
}

export function stopNature() {
  token++;
  wantPlaying = false;
  clearRecovery();
  retries = 0;
  if (audio) {
    const a = audio;
    fadeTo(0, 600, () => { a.pause(); a.removeAttribute("src"); a.load(); releaseBus(BUS_KEY); });
  }
  clearInterval(motionTimer);
  motionTimer = null;
  // "After this sound" / "When Up next runs out" have nothing left to wait for.
  const sleep = state.sleep?.mode === "time" ? state.sleep : null;
  setState({ id: null, playing: false, loading: false, error: null, position: 0, duration: 0, shapeable: false, sleep });
}

export function seekNature(seconds) {
  if (!audio || !state.id) return;
  const d = Number.isFinite(audio.duration) ? audio.duration : state.duration;
  audio.currentTime = Math.max(0, Math.min(seconds, d || seconds));
  lastPos = audio.currentTime; // a drop right after a seek resumes here
  seeks++;
  setState({ position: audio.currentTime });
}

export async function jumpToRandomPoint() {
  if (!state.id) return;
  const a = el();
  const d = await waitForDuration(a);
  seekNature(randomTime(d));
  if (!state.playing) toggleNature(true);
}

const pickRandom = (ids, avoid) => {
  const pool = ids.length > 1 ? ids.filter((x) => x !== avoid) : ids;
  return pool[Math.floor(Math.random() * pool.length)] || null;
};

export function playRandomNature(ids = queue) {
  const id = pickRandom(ids, state.id);
  if (id) playNature(id);
}

export function nextNature() {
  // Up next comes first, in the order the person queued it. A sound that
  // isn't on this device any more is skipped, not left to stop the queue.
  const up = readNaturePrefs().upNext.filter((x) => natureSoundById(x) || isOwnSoundId(x));
  if (up.length) {
    const [id, ...rest] = up;
    writeNaturePrefs({ upNext: rest });
    playNature(id);
    return;
  }
  if (!queue.length) { stopNature(); return; }
  if (readNaturePrefs().shuffle) { playRandomNature(); return; }
  const i = queue.indexOf(state.id);
  playNature(queue[(i + 1) % queue.length]);
}

export function prevNature() {
  // Like a music player: back to the start first, then the previous sound.
  if (audio && state.id && audio.currentTime > 5) { seekNature(0); return; }
  if (!queue.length) return;
  const i = queue.indexOf(state.id);
  playNature(queue[(i - 1 + queue.length) % queue.length]);
}

export function setNatureVolume(v) {
  writeNaturePrefs({ volume: v });
  if (audio && state.playing) { clearInterval(fadeTimer); setLevel(levelNow()); }
}

// ── Up next ────────────────────────────────────────────────────────────────
// Sounds the person queued. Next (or a sound ending) takes the first one;
// once it's empty the list carries on as before.

const upNext = () => readNaturePrefs().upNext;

// Returns false when the sound is already waiting in Up next.
export function addToUpNext(id) {
  if (!id || upNext().includes(id)) return false;
  writeNaturePrefs({ upNext: [...upNext(), id] });
  return true;
}

export function removeFromUpNext(index) {
  const list = [...upNext()];
  list.splice(index, 1);
  writeNaturePrefs({ upNext: list });
}

export function moveInUpNext(index, by) {
  const list = [...upNext()];
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
  writeNaturePrefs({ upNext: list });
}

export function clearUpNext() { writeNaturePrefs({ upNext: [] }); }

// Play one now; the ones before it stay queued.
export function playFromUpNext(index) {
  const list = [...upNext()];
  const [id] = list.splice(index, 1);
  if (!id) return;
  writeNaturePrefs({ upNext: list });
  playNature(id);
}

// Change the recording's shape (any subset of recordingShape's fields) and
// hear it right away.
export function setRecordingShape(patch) {
  const prev = readNaturePrefs().shape;
  writeNaturePrefs({ shape: clampShape(patch === null ? null : { ...prev, ...patch }) });
  applyRecordingShape();
}

// Test hook: the routed chain's nodes (null until a routed sound has played).
export const recordingChainForTests = () => chain;
