// Nature sounds — the player. One <audio> element for the whole app, so a
// recording keeps playing while someone moves around (and alongside a
// Soundscape, which is a separate Web Audio engine). A plain media element
// streams and seeks a hosted file without needing the host's permission,
// which a fetch would.

import { natureSoundById } from "./catalog";
import { natureSoundSrc } from "./natureOffline";
import { readNaturePrefs, writeNaturePrefs } from "./naturePrefs";
import { isOwnSoundId, listMySounds } from "./ownSounds";

const FADE_MS = 1200;
// A random point never lands this close to the end, so it doesn't jump
// straight into the next sound.
const END_MARGIN = 30;

const listeners = new Set();
let state = { id: null, playing: false, loading: false, error: null, position: 0, duration: 0 };
const emit = () => { for (const fn of listeners) { try { fn(state); } catch { /* listener */ } } };
const setState = (patch) => { state = { ...state, ...patch }; emit(); };
export const subscribeNature = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getNatureState = () => state;

// The list the person is looking at, in its order — next / previous /
// shuffle walk this. Set by the screen.
let queue = [];
export const setNatureQueue = (ids) => { queue = Array.isArray(ids) ? ids : []; };

let audio = null;
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

function fadeTo(to, ms, done) {
  clearInterval(fadeTimer);
  const el = audio;
  if (!el) return;
  const from = el.volume;
  const t0 = Date.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) { clearInterval(fadeTimer); done?.(); }
  }, 40);
}

function el() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "metadata";
  audio.addEventListener("timeupdate", () => {
    const t = audio.currentTime || 0;
    // A minute of good playback since the last recovery earns the tries back.
    if (retries && !audio.paused && t > lastPos + 60) retries = 0;
    if (!audio.paused && t > 0) lastPos = t;
    setState({ position: t });
  });
  audio.addEventListener("durationchange", () => {
    if (Number.isFinite(audio.duration)) setState({ duration: audio.duration });
  });
  audio.addEventListener("waiting", () => {
    setState({ loading: true });
    clearTimeout(stallTimer);
    if (wantPlaying) stallTimer = setTimeout(() => { stallTimer = null; if (wantPlaying && state.id) { retryTimer = null; recover(); } }, STALL_MS);
  });
  audio.addEventListener("playing", () => {
    clearTimeout(stallTimer); stallTimer = null;
    setState({ loading: false, playing: true, error: null });
  });
  audio.addEventListener("pause", () => { clearTimeout(stallTimer); stallTimer = null; setState({ playing: false }); });
  audio.addEventListener("ended", () => { nextNature(); });
  audio.addEventListener("error", () => {
    if (!state.id) return;
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

function mediaSession(sound) {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
  if (!ms || !sound) return;
  try {
    ms.metadata = new window.MediaMetadata({ title: sound.title, artist: sound.place || sound.by, album: "Nature sounds" });
    ms.setActionHandler("play", () => toggleNature(true));
    ms.setActionHandler("pause", () => toggleNature(false));
    ms.setActionHandler("nexttrack", () => nextNature());
    ms.setActionHandler("previoustrack", () => prevNature());
    ms.setActionHandler("stop", () => stopNature());
  } catch { /* not supported */ }
}

// at: "start" | "random" | a time in seconds. resuming: a recovery after a
// drop (keeps the try count and the spot on screen).
export async function playNature(id, { at = "start", resuming = false } = {}) {
  let sound = natureSoundById(id);
  // Your own sounds are read from the database the first time they're needed.
  if (!sound && isOwnSoundId(id)) { await listMySounds(); sound = natureSoundById(id); }
  if (!sound) return;
  const my = ++token;
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
  mediaSession(sound);
  try {
    a.pause();
    a.src = await natureSoundSrc(id);
    if (my !== token) return;
    a.volume = 0;
    if (at !== "start" && !(typeof at === "number" && at <= 0)) {
      const d = await waitForDuration(a);
      if (my !== token) return;
      a.currentTime = at === "random" ? randomTime(d) : Math.max(0, Math.min(Number(at) || 0, d || Number(at) || 0));
    }
    await a.play();
    if (my !== token) return;
    fadeTo(targetVolume(), resuming ? 600 : FADE_MS);
  } catch (e) {
    if (my !== token || e?.name === "AbortError") return;
    // A load that failed on the network is the error listener's to retry.
    if (a.error && !isOwnSoundId(id)) { recover(); return; }
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
    // After a drop the element is dead; load it again from the same spot
    // instead of asking a broken element to play.
    if (!a.src || a.error || state.error || retryTimer || onlineWait) {
      playNature(state.id, { at: state.position || lastPos || "start" });
      return;
    }
    wantPlaying = true;
    a.volume = 0;
    a.play().then(() => fadeTo(targetVolume(), FADE_MS)).catch(() => {
      playNature(state.id, { at: state.position || lastPos || "start" });
    });
  } else {
    wantPlaying = false;
    clearRecovery();
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
    fadeTo(0, 600, () => { a.pause(); a.removeAttribute("src"); a.load(); });
  }
  setState({ id: null, playing: false, loading: false, error: null, position: 0, duration: 0 });
}

export function seekNature(seconds) {
  if (!audio || !state.id) return;
  const d = Number.isFinite(audio.duration) ? audio.duration : state.duration;
  audio.currentTime = Math.max(0, Math.min(seconds, d || seconds));
  lastPos = audio.currentTime; // a drop right after a seek resumes here
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
  if (audio && state.playing) { clearInterval(fadeTimer); audio.volume = targetVolume(); }
}
