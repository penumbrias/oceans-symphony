// The Android system bars' real overlap with the web view, as CSS vars.
//
// Some Android web views (seen on Android 10, 3-button navigation) report
// env(safe-area-inset-bottom) as 0 while the edge-to-edge page draws under
// the nav buttons, and Capacitor only publishes its own --safe-area-inset-*
// for web views it treats as old — so the bottom bar sat under the buttons
// and couldn't be tapped (tester report, v0.270.1). The app's
// SystemSettings plugin reads the window insets natively
// (SystemSettingsPlugin.systemBarInsets) and this publishes them as
// --native-sab, which --os-sab (index.css) takes the max() of — so a phone
// whose env() is right is never double-padded. The top inset goes out as
// --native-sat the same way (--os-sat).
//
// Read again on resize (keyboard, rotation, split screen) and when the app
// comes back to the foreground. An older native build without the method
// simply leaves the var unset. Never resolve a plugin proxy from an async
// function (Capacitor's `.then` trap) — only call its methods.

import { registerPlugin } from "@capacitor/core";
import { isNative, getNativePlatform } from "@/lib/platform";

const ANDROID = isNative() && getNativePlatform() === "android";
const SystemSettings = ANDROID ? registerPlugin("SystemSettings") : null;

let started = false;

async function readInsets() {
  try {
    const r = await SystemSettings.systemBarInsets();
    if (!r?.known) return;
    const b = Number(r.bottom);
    if (Number.isFinite(b)) document.documentElement.style.setProperty("--native-sab", `${Math.max(0, Math.round(b))}px`);
    // --native-sat feeds --os-sat, read only by full-screen overlays.
    const t = Number(r.top);
    if (Number.isFinite(t)) document.documentElement.style.setProperty("--native-sat", `${Math.max(0, Math.round(t))}px`);
  } catch {
    // Older native build, or the window isn't laid out yet — env() stands.
  }
}

export function startNativeInsets() {
  if (!SystemSettings || started || typeof window === "undefined") return;
  started = true;
  let t1 = null;
  let t2 = null;
  const schedule = () => {
    clearTimeout(t1);
    clearTimeout(t2);
    // Twice: insets can settle a beat after the resize event (keyboard
    // animation, nav-bar mode change).
    t1 = setTimeout(readInsets, 120);
    t2 = setTimeout(readInsets, 700);
  };
  readInsets();
  schedule();
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule();
  });
}
