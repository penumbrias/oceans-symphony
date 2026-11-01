// Nature sounds — the player. One <audio> element for the whole app, so a
// recording keeps playing while someone moves around (and alongside a
// Soundscape, which is a separate Web Audio engine). A plain media element
// streams and seeks a hosted file without needing the host's permission,
// which a fetch would.

import { natureSoundById } from "./catalog";
import { natureSoundSrc } from "./natureOffline";
import { readNaturePrefs, writeNaturePrefs } from "./naturePrefs";

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
  audio.addEventListener("timeupdate", () => setState({ position: audio.currentTime || 0 }));
  audio.addEventListener("durationchange", () => {
    if (Number.isFinite(audio.duration)) setState({ duration: audio.duration });
  });
  audio.addEventListener("waiting", () => setState({ loading: true }));
  audio.addEventListener("playing", () => setState({ loading: false, playing: true, error: null }));
  audio.addEventListener("pause", () => setState({ playing: false }));
  audio.addEventListener("ended", () => { nextNature(); });
  audio.addEventListener("error", () => {
    if (!state.id) return;
    setState({
      loading: false, playing: false,
      error: navigator.onLine === false
        ? "You're offline. Connect to play this sound."
        : "This sound couldn't load. Check your connection and try again.",
    });
  });
  return audio;
}

function waitForDuration(a) {
  if (Number.isFinite(a.duration) && a.duration > 0) return Promise.resolve(a.duration);
  return new Promise((resolve) => {
    const done = () => { a.removeEventListener("loadedmetadata", done); resolve(Number.isFinite(a.duration) ? a.duration : 0); };
    a.addEventListener("loadedmetadata", done);
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

// at: "start" | "random" | a time in seconds.
export async function playNature(id, { at = "start" } = {}) {
  const sound = natureSoundById(id);
  if (!sound) return;
  const my = ++token;
  const a = el();
  clearInterval(fadeTimer);
  setState({ id, loading: true, error: null, position: 0, duration: sound.seconds || 0 });
  writeNaturePrefs({ lastId: id });
  mediaSession(sound);
  try {
    a.pause();
    a.src = await natureSoundSrc(id);
    if (my !== token) return;
    a.volume = 0;
    if (at !== "start") {
      const d = await waitForDuration(a);
      if (my !== token) return;
      a.currentTime = at === "random" ? randomTime(d) : Math.max(0, Math.min(Number(at) || 0, d));
    }
    await a.play();
    if (my !== token) return;
    fadeTo(targetVolume(), FADE_MS);
  } catch (e) {
    if (my !== token || e?.name === "AbortError") return;
    setState({ loading: false, playing: false, error: "This sound couldn't start on this device." });
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
    if (!a.src) { playNature(state.id, { at: state.position || "start" }); return; }
    a.volume = 0;
    a.play().then(() => fadeTo(targetVolume(), FADE_MS)).catch(() => {});
  } else {
    fadeTo(0, 400, () => a.pause());
  }
}

export function stopNature() {
  token++;
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
