// "Play inside the app only" (Settings → Accessibility).
//
// By default sound carries on when you leave the app, like a music player
// running in the background. With this option on, leaving the app (Home or
// Recents on the phone, another tab or a minimised window elsewhere) stops
// every song, audio and video, and nothing is allowed to start again until
// you are back — including a song set to "Automatic" that waits for other
// apps to go quiet.
//
// It works from the one shared registry every player already uses
// (mediaExclusive.js), plus a sweep of any <audio>/<video> in the page.
// Nothing is restarted for you when you return, except a song set to play
// when no music is playing. The saved choice is read live, so flipping the
// switch needs no restart.

import { isNative } from "@/lib/platform";
import { isPlayInsideOnly } from "@/lib/useAccessibility";
import { pauseAllMedia, setPlaybackBlocked, resumeIdleSongs, handOffVideosToAudio, handBackVideos } from "@/lib/mediaExclusive";

let away = false;
let started = false;

const sync = () => setPlaybackBlocked(away && isPlayInsideOnly());

function pauseEverything() {
  pauseAllMedia();
  // Anything on the page that isn't registered (belt and braces).
  try {
    document.querySelectorAll("audio, video").forEach((el) => {
      try { if (!el.paused) el.pause(); } catch { /* already gone */ }
    });
  } catch { /* no document */ }
}

function goAway() {
  if (away) return;
  away = true;
  sync();
  if (isPlayInsideOnly()) pauseEverything();
  // Option off: a video carries on as sound, like a song (the phone's web view
  // stops video the moment the app is off screen, but not audio).
  else if (isNative()) handOffVideosToAudio();
}

function comeBack() {
  // A video can be carried as sound without us having flagged "away" (the phone
  // stopped it on its own), so always give it its picture back.
  if (document.visibilityState === "visible") handBackVideos();
  if (!away) return;
  away = false;
  const wasOn = isPlayInsideOnly();
  setPlaybackBlocked(false);
  if (wasOn) resumeIdleSongs();
}

export function initPlayInsideOnly() {
  if (started || typeof window === "undefined") return;
  started = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") goAway(); else comeBack();
  });
  window.addEventListener("focus", () => { if (document.visibilityState === "visible") handBackVideos(); });
  window.addEventListener("pagehide", goAway);
  window.addEventListener("pageshow", comeBack);

  // Anything that starts while we're away (an unregistered element, say) is
  // stopped on the spot. Media events don't bubble, so listen while capturing.
  window.addEventListener("play", (e) => {
    if (!(away && isPlayInsideOnly())) return;
    try { e.target?.pause?.(); } catch { /* not a media element */ }
  }, true);

  // The phone: Recents only pauses the activity (no visibility change), Home
  // pauses then stops it. The Capacitor App plugin reports both.
  if (isNative()) {
    import("@capacitor/app").then(({ App }) => {
      App.addListener("pause", goAway);
      App.addListener("resume", comeBack);
      App.addListener("appStateChange", (s) => { if (s?.isActive) comeBack(); else goAway(); });
    }).catch(() => { /* web build / plugin missing — visibility events still work */ });
  }
}
