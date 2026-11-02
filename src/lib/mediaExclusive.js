// One sound at a time. Every audio / video player (chat attachments, the Assets
// viewer, the home-screen song widget) registers its element here. When one
// starts playing, every other registered element is paused, so two tracks never
// talk over each other. Playback only — nothing is ever changed in the files.
//
// "Quiet" includes other apps (see otherAudio.js).
//
// The song widget can also ask to be told when the app goes quiet
// (`subscribeIdle`) so its "play when there's no sound playing" option can
// start it once the other audio / video stops, pauses or ends.

import { isOtherAudioPlaying, waitForOtherAudioQuiet, setMediaKeepAlive } from "@/lib/otherAudio";
import { isNative } from "@/lib/platform";

// Whenever something starts or stops sounding, keep the phone from ending the
// app while it plays. A short delay on stopping stops it flapping between tracks.
let keepAliveTimer = null;
const syncKeepAlive = () => {
  if (keepAliveTimer) { clearTimeout(keepAliveTimer); keepAliveTimer = null; }
  if (playing.size) { setMediaKeepAlive(true); return; }
  keepAliveTimer = setTimeout(() => { keepAliveTimer = null; if (!playing.size) setMediaKeepAlive(false); }, 4000);
};
class PlayingSet extends Set {
  add(v) { const r = super.add(v); syncKeepAlive(); return r; }
  delete(v) { const r = super.delete(v); syncKeepAlive(); return r; }
  clear() { super.clear(); syncKeepAlive(); }
}
const playing = new PlayingSet();
const all = new Set();
const idleListeners = new Set();

// "Play inside the app only" (Settings → Accessibility): while the app is away
// (Home, Recents) nothing is allowed to make sound. playInsideOnly.js turns
// this on when the app is left and off when it comes back.
let blocked = false;
export const setPlaybackBlocked = (v) => { blocked = !!v; };
export const isPlaybackBlocked = () => blocked;

const notifyIdleIfQuiet = () => {
  if (playing.size || blocked) return;
  // Defer: a track ending and the next one starting in the same tick shouldn't
  // let the widget sneak in between.
  setTimeout(() => {
    if (playing.size || blocked || !idleListeners.size) return;
    // "Quiet" means the whole phone, not just this app: if Facebook, the
    // Gallery or a music player is playing, wait for it to stop (the app
    // may be in the background by then) and try again.
    isOtherAudioPlaying().then((busy) => {
      if (playing.size) return;
      if (busy) { waitForOtherAudioQuiet().then(notifyIdleIfQuiet); return; }
      for (const fn of [...idleListeners]) { try { fn(); } catch { /* listener failed */ } }
    });
  }, 120);
};

// Chat, bulletin and Assets players: when another app (Facebook, the Gallery, a
// music player) takes the sound and the phone pauses ours, carry on from the
// same spot once that app has stopped. A pause the person made themselves (a
// tap just before) or that we made so one sound plays at a time is left alone.
// Songs are handled by the idle listeners above, so detached elements skip this.
let lastTouchAt = 0;
if (typeof window !== "undefined") {
  const touched = () => { lastTouchAt = Date.now(); };
  window.addEventListener("pointerdown", touched, true);
  window.addEventListener("keydown", touched, true);
}
const ourPause = new Set();
const interrupted = new Set();
let resuming = false;
const resumeInterrupted = () => {
  resuming = false;
  const list = [...interrupted];
  interrupted.clear();
  if (playing.size) return; // something else is playing now — leave it
  for (const el of list) {
    if (all.has(el) && el.paused && !el.ended) { el.play().catch(() => {}); break; }
  }
};

// A video carries on as sound when the app is left (Home, Recents), the way a
// song does. Android's web view stops a <video> as soon as the app is off
// screen — and also anything playing a file that has a picture in it, even
// through an <audio> tag. So the video's own sound is decoded once and played
// through Web Audio (which the phone keeps running in the background), from the
// same spot; the video picks it up again (same spot, playing) when you come
// back. A very long video, which would be too big to hold decoded, falls back
// to a hidden <audio> on the same file. With "Play inside the app only" on,
// none of this happens — everything just stops.
const handoffs = new Map(); // video element -> entry
const MAX_DECODED_BYTES = 100e6; // ~4 minutes of stereo sound held in memory

const onNative = () => { try { return isNative(); } catch { return false; } };

function makeToken(el) {
  // Stands in for the video in `playing`, so a song set to start when nothing
  // is playing doesn't jump in, and another sound starting takes over.
  const token = { tagName: "AUDIO", paused: false, ended: false, isConnected: true };
  token.pause = () => { ourPause.delete(token); stopHandoff(el, false); };
  return token;
}

function videoPos(el, entry) {
  const rate = el.playbackRate || 1;
  let pos = el.currentTime;
  if (el.paused && entry.pausedAt != null) pos += ((performance.now() - entry.pausedAt) / 1000) * rate;
  return pos;
}

// The video itself stops, now that its sound is carried by the stand-in.
function quietVideo(el, entry) {
  if (!el.paused) { ourPause.add(el); try { el.pause(); } catch { /* already gone */ } }
  if (entry.pausedAt == null) entry.pausedAt = performance.now();
}

async function startWebAudio(el, entry, src) {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  const dur = el.duration;
  if (!Ctx || !(dur > 0) || dur * 48000 * 8 > MAX_DECODED_BYTES) throw new Error("too big or unsupported");
  const ctx = new Ctx();
  entry.ctx = ctx;
  try { await ctx.resume(); } catch { /* checked below */ }
  const bytes = await (await fetch(src)).arrayBuffer();
  if (entry.cancelled) return;
  const buf = await ctx.decodeAudioData(bytes);
  if (entry.cancelled) return;
  if (ctx.state !== "running") { try { await ctx.resume(); } catch { /* checked below */ } }
  if (ctx.state !== "running") throw new Error("audio context blocked");
  const gain = ctx.createGain();
  gain.gain.value = el.muted ? 0 : el.volume;
  gain.connect(ctx.destination);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.loop = el.loop;
  // Same tempo and pitch the person set on the video (see mediaTuning.js).
  // Playing a buffer faster raises its pitch with it, so when pitch is set on
  // its own the pitch shifter puts the pitch back to exactly what was asked.
  const tempo = el.playbackRate || 1;
  node.playbackRate.value = tempo;
  const tune = el.__tuning || { semitones: 0, linked: false };
  let tail = node;
  // Unlinked (the usual case, and the player's own speed menu): the pitch is
  // kept at what was asked, so undo the pitch change the faster/slower buffer brings.
  if (!tune.linked && (Math.abs(tune.semitones) > 0.001 || Math.abs(tempo - 1) > 0.001) && ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    try {
      await ctx.audioWorklet.addModule("/pitch-shifter-worklet.js");
      if (entry.cancelled) return;
      const shifter = new AudioWorkletNode(ctx, "pitch-shifter", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        channelCount: 2, channelCountMode: "explicit",
      });
      shifter.parameters.get("ratio").value = Math.pow(2, tune.semitones / 12) / tempo;
      node.connect(shifter);
      tail = shifter;
      entry.shifter = shifter;
    } catch { /* no shifter: tempo only */ }
  }
  tail.connect(gain);
  const rate = tempo;
  const pos = Math.max(0, Math.min(videoPos(el, entry), buf.duration - 0.05));
  node.onended = () => { entry.ended = true; };
  const startedAt = ctx.currentTime;
  node.start(0, pos);
  entry.mode = "webaudio";
  entry.node = node;
  entry.where = () => {
    const t = pos + (ctx.currentTime - startedAt) * rate;
    return entry.ended ? buf.duration : (buf.duration > 0 && el.loop ? t % buf.duration : Math.min(t, buf.duration));
  };
  entry.length = buf.duration;
  quietVideo(el, entry);
}

function startAudioClone(el, entry, src) {
  const a = new Audio();
  a.preload = "auto";
  a.src = src;
  try { a.volume = el.volume; a.muted = el.muted; a.loop = el.loop; a.playbackRate = el.playbackRate; } catch { /* keep defaults */ }
  // Same tempo and pitch the person set (see mediaTuning.js). Unlinked: the
  // phone keeps the pitch while changing the speed, and the pitch shifter moves
  // the pitch to what was asked. Linked: speed and pitch move together.
  const tune = el.__tuning || { semitones: 0, linked: false };
  const setKeep = (on) => { try { a.preservesPitch = on; a.webkitPreservesPitch = on; } catch { /* not supported */ } };
  setKeep(!tune.linked);
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!tune.linked && Math.abs(tune.semitones) > 0.001 && Ctx) {
    try {
      const ctx = new Ctx();
      entry.ctx = ctx;
      const source = ctx.createMediaElementSource(a); // routes the sound through the shifter
      const ratio = Math.pow(2, tune.semitones / 12);
      const toOut = (last) => last.connect(ctx.destination);
      if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
        ctx.audioWorklet.addModule("/pitch-shifter-worklet.js").then(() => {
          if (entry.cancelled) return;
          const shifter = new AudioWorkletNode(ctx, "pitch-shifter", {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
            channelCount: 2, channelCountMode: "explicit",
          });
          shifter.parameters.get("ratio").value = ratio;
          source.connect(shifter);
          toOut(shifter);
        }).catch(() => toOut(source));
      } else {
        toOut(source);
      }
      ctx.resume().catch(() => {});
    } catch { /* plain playback — tempo only */ }
  }
  entry.mode = "clone";
  entry.audio = a;
  const t = videoPos(el, entry);
  const start = () => {
    if (entry.cancelled) return;
    try { if (Number.isFinite(t) && t > 0) a.currentTime = t; } catch { /* not seekable yet */ }
    a.play().then(() => { if (!entry.cancelled) quietVideo(el, entry); }).catch(() => { stopHandoff(el, false); });
  };
  if (a.readyState >= 1) start(); else a.addEventListener("loadedmetadata", start, { once: true });
  a.addEventListener("error", () => stopHandoff(el, false), { once: true });
  entry.where = () => (a.ended ? (Number.isFinite(el.duration) ? el.duration : a.currentTime) : a.currentTime);
  entry.isGoing = () => !a.paused && !a.ended;
}

function startHandoff(el) {
  if (handoffs.has(el)) return;
  const src = el.currentSrc || el.src;
  if (!src) return;
  const entry = { token: makeToken(el), cancelled: false, ended: false, pausedAt: el.paused ? performance.now() : null };
  entry.onPause = () => { if (entry.pausedAt == null) entry.pausedAt = performance.now(); };
  el.addEventListener("pause", entry.onPause);
  handoffs.set(el, entry);
  // Count the stand-in as playing from the start, so a song waiting for quiet
  // doesn't slip in while it gets ready.
  playing.add(entry.token);
  startWebAudio(el, entry, src).catch(() => {
    if (entry.cancelled || handoffs.get(el) !== entry) return;
    try { entry.ctx && entry.ctx.close(); } catch { /* already closed */ }
    entry.ctx = null;
    startAudioClone(el, entry, src);
  });
}

// Ends the stand-in. `resume` puts the video back where the sound got to and
// plays it again if the sound was still going.
function stopHandoff(el, resume) {
  const entry = handoffs.get(el);
  if (!entry) return;
  handoffs.delete(el);
  entry.cancelled = true;
  let pos = null;
  let wasPlaying = false;
  try {
    if (entry.where) {
      pos = entry.where();
      wasPlaying = entry.mode === "webaudio" ? !entry.ended || el.loop : !!(entry.isGoing && entry.isGoing());
    } else if (el.paused && entry.pausedAt != null) {
      // The stand-in never got going before we came back: the phone stopped the
      // video, so carry on from where it would have been.
      pos = videoPos(el, entry);
      wasPlaying = true;
    }
  } catch { /* nothing to carry back */ }
  try { entry.node && entry.node.stop(); } catch { /* already stopped */ }
  try { entry.ctx && entry.ctx.close(); } catch { /* already closed */ }
  if (entry.audio) {
    try { entry.audio.pause(); entry.audio.removeAttribute("src"); entry.audio.load(); } catch { /* already gone */ }
  }
  el.removeEventListener("pause", entry.onPause);
  playing.delete(entry.token);
  ourPause.delete(entry.token);
  if (!resume || !all.has(el) || !el.isConnected) { notifyIdleIfQuiet(); return; }
  try {
    if (!wasPlaying && entry.ended && Number.isFinite(el.duration)) el.currentTime = el.duration;
    else if (Number.isFinite(pos) && pos > 0) el.currentTime = pos;
  } catch { /* not seekable yet */ }
  if (wasPlaying && !blocked) el.play().catch(() => {});
}

// The app was left and sound may carry on: hand every playing video to audio.
export function handOffVideosToAudio() {
  if (blocked) return;
  for (const el of [...playing]) {
    if (el.tagName === "VIDEO") startHandoff(el);
  }
}

// Back in the app: give every video its picture back.
export function handBackVideos() {
  for (const el of [...handoffs.keys()]) stopHandoff(el, true);
}

// Pause every registered player that is sounding right now. These pauses are
// ours, so the "another app took the sound — carry on later" logic ignores them.
export function pauseAllMedia() {
  for (const el of [...all]) {
    try { if (!el.paused) { ourPause.add(el); el.pause(); } } catch { /* already gone */ }
  }
}

// Back in the app: let a song set to start when nothing is playing do so now.
export const resumeIdleSongs = () => notifyIdleIfQuiet();

export function registerMedia(el, { exclusive = true } = {}) {
  if (!el) return () => {};
  all.add(el);
  const onPlay = () => {
    // The app is away and the person asked for sound to stay inside it: stop
    // whatever tried to start (a song waiting for quiet, a resume, a loop).
    if (blocked) { ourPause.add(el); try { el.pause(); } catch { /* already gone */ } return; }
    playing.add(el);
    interrupted.delete(el);
    if (!exclusive) return;
    for (const other of [...playing]) {
      if (other !== el) { ourPause.add(other); try { other.pause(); } catch { /* already gone */ } }
    }
  };
  const onPauseEv = () => {
    if (ourPause.delete(el) || el.ended || !el.isConnected) return;
    if (Date.now() - lastTouchAt < 1000) return; // the person paused it
    // The phone stopped a video because the app is off screen: keep its sound.
    // (Recents leaves the page "visible" but without focus, so check both.)
    if (el.tagName === "VIDEO" && handoffs.has(el)) return;
    if (el.tagName === "VIDEO" && !blocked && typeof document !== "undefined"
      && (document.visibilityState === "hidden" || (onNative() && !document.hasFocus()))) {
      startHandoff(el);
      return;
    }
    setTimeout(() => {
      if (!all.has(el) || !el.paused || el.ended || playing.size) return;
      isOtherAudioPlaying().then((busy) => {
        if (!busy || !all.has(el) || !el.paused) return;
        interrupted.add(el);
        if (!resuming) { resuming = true; waitForOtherAudioQuiet().then(resumeInterrupted); }
      });
    }, 150);
  };
  const onStop = () => { playing.delete(el); notifyIdleIfQuiet(); };
  el.addEventListener("play", onPlay);
  el.addEventListener("playing", onPlay);
  el.addEventListener("pause", onStop);
  el.addEventListener("pause", onPauseEv);
  el.addEventListener("ended", onStop);
  if (!el.paused) onPlay();
  return () => {
    el.removeEventListener("play", onPlay);
    el.removeEventListener("playing", onPlay);
    el.removeEventListener("pause", onStop);
    el.removeEventListener("pause", onPauseEv);
    el.removeEventListener("ended", onStop);
    all.delete(el);
    interrupted.delete(el);
    if (handoffs.has(el)) stopHandoff(el, false);
    if (playing.delete(el)) notifyIdleIfQuiet();
  };
}

// True when some registered element other than `except` is playing right now.
export const isOtherPlaying = (except) => [...playing].some((el) => el !== except);

// Called whenever everything has gone quiet. Returns an unsubscribe.
export function subscribeIdle(fn) {
  idleListeners.add(fn);
  // A song that is waiting while another app is already playing has nothing
  // in this app to wait on — watch the phone's audio so it starts when that stops.
  isOtherAudioPlaying().then((busy) => {
    if (busy && idleListeners.has(fn)) waitForOtherAudioQuiet().then(notifyIdleIfQuiet);
  });
  return () => idleListeners.delete(fn);
}
