// Is something else already playing sound on this device?
//
// Starting an <audio> element on Android takes the phone's audio focus, and
// music apps stop (not just duck) when they lose it — a tester's music cut
// out whenever a profile song or a page's background song started on its
// own. Autoplay asks this first and waits for a tap instead.
//
// Android reads the app's own SystemSettings plugin
// (android/.../SystemSettingsPlugin.java). Elsewhere, and on an older
// native build without the method, it answers false (autoplay as before).
// Never resolve a plugin proxy from an async function (Capacitor's `.then`
// trap) — only call its methods.

import { registerPlugin } from "@capacitor/core";
import { isNative, getNativePlatform } from "@/lib/platform";

const ANDROID = isNative() && getNativePlatform() === "android";
const SystemSettings = ANDROID ? registerPlugin("SystemSettings") : null;

export async function isOtherAudioPlaying() {
  if (!SystemSettings) return false;
  try {
    const r = await SystemSettings.otherAudioPlaying();
    return !!r?.playing;
  } catch {
    return false;
  }
}

// Resolves once other apps' audio has gone quiet (about 2 s of silence), even
// while this app is in the background. Android only; on an older native build
// without the method it re-checks every few seconds instead. One watch is shared.
let quietWatch = null;
export function waitForOtherAudioQuiet() {
  if (!SystemSettings) return Promise.resolve();
  if (quietWatch) return quietWatch;
  quietWatch = new Promise((resolve) => {
    let handle = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      quietWatch = null;
      try { handle?.remove?.(); } catch { /* already removed */ }
      resolve();
    };
    SystemSettings.addListener("otherAudioQuiet", finish)
      .then((h) => { handle = h; if (done) { try { h.remove(); } catch { /* gone */ } } })
      .catch(() => {});
    SystemSettings.watchOtherAudio().catch(() => setTimeout(finish, 5000));
  });
  return quietWatch;
}

// While sound is playing, ask Android to keep the app alive with a quiet
// foreground service (see MediaKeepAliveService.java), so low memory doesn't
// end the app — and the sound — in the background. Android only; harmless
// elsewhere and on an older native build without the method.
let keepAliveOn = false;
export function setMediaKeepAlive(on) {
  if (!SystemSettings || keepAliveOn === on) return;
  keepAliveOn = on;
  try {
    const p = on ? SystemSettings.startMediaKeepAlive() : SystemSettings.stopMediaKeepAlive();
    if (p && p.catch) p.catch(() => {});
  } catch { /* older native build */ }
}
