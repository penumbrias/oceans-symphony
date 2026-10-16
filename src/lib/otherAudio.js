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
