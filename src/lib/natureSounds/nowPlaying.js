// The "now playing" controls outside the app for Nature sounds: a music-app
// style notification on Android (NowPlayingPlugin / NowPlayingService), and
// the browser's / iPhone's media session everywhere else (lock screen,
// Control Center, headset buttons, the desktop media keys).
//
// naturePlayer.js calls showNowPlaying() whenever what's playing changes and
// clearNowPlaying() when it stops; the buttons come back through the
// handlers given to initNowPlaying(). Never throws: a missing plugin (an
// older native build) or an unsupported browser just means no controls.

import { registerPlugin } from "@capacitor/core";
import { isNative, getNativePlatform } from "@/lib/platform";

const onAndroid = () => { try { return isNative() && getNativePlatform() === "android"; } catch { return false; } };
const ANDROID = onAndroid();
const NowPlaying = ANDROID ? registerPlugin("NowPlaying") : null;

let handlers = null;
let listening = false;
let shown = false;
let last = "";

export function initNowPlaying(h) {
  handlers = h;
  if (!NowPlaying || listening) return;
  listening = true;
  try {
    NowPlaying.addListener("action", (e) => {
      const fn = handlers?.[e?.action];
      if (!fn) return;
      try { fn(e?.position); } catch { /* handler failed */ }
    }).catch(() => {});
  } catch { /* older native build */ }
}

const mediaSession = () => (typeof navigator !== "undefined" ? navigator.mediaSession : null);

function webSession(info) {
  const ms = mediaSession();
  if (!ms) return;
  try {
    if (typeof window.MediaMetadata === "function") {
      ms.metadata = new window.MediaMetadata({ title: info.title, artist: info.subtitle, album: "Nature sounds" });
    }
    ms.playbackState = info.playing ? "playing" : "paused";
    const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* not supported */ } };
    set("play", () => handlers?.play?.());
    set("pause", () => handlers?.pause?.());
    set("nexttrack", () => handlers?.next?.());
    set("previoustrack", () => handlers?.previous?.());
    set("stop", () => handlers?.stop?.());
    set("seekto", (d) => { if (d && Number.isFinite(d.seekTime)) handlers?.seek?.(d.seekTime); });
    if (info.duration > 0 && typeof ms.setPositionState === "function") {
      ms.setPositionState({
        duration: info.duration,
        position: Math.max(0, Math.min(info.position || 0, info.duration)),
        playbackRate: 1,
      });
    }
  } catch { /* not supported */ }
}

// info: { title, subtitle, playing, position, duration } (seconds).
export function showNowPlaying(info) {
  // Only send what changed in a way the controls show; the position is
  // carried along with each change (the notification counts on from it).
  const key = `${info.title}|${info.subtitle}|${info.playing}|${Math.round(info.duration || 0)}|${info.seeked || 0}`;
  if (key === last && shown) return;
  last = key;
  shown = true;
  webSession(info);
  if (!NowPlaying) return;
  try {
    const p = NowPlaying.update({
      title: info.title || "",
      subtitle: info.subtitle || "",
      playing: !!info.playing,
      position: info.position || 0,
      duration: info.duration || 0,
    });
    if (p && p.catch) p.catch(() => {});
  } catch { /* older native build */ }
}

export function clearNowPlaying() {
  if (!shown) return;
  shown = false;
  last = "";
  const ms = mediaSession();
  if (ms) {
    try { ms.metadata = null; ms.playbackState = "none"; } catch { /* not supported */ }
  }
  if (!NowPlaying) return;
  try {
    const p = NowPlaying.clear();
    if (p && p.catch) p.catch(() => {});
  } catch { /* older native build */ }
}
