// Soundscape focus mode — "distraction-free" while a focus session runs.
//
// What it can and can't block, by platform:
//   Android app — turns on the phone's Do Not Disturb in "Alarms only"
//     mode for the session (alarms still ring), once the person allows
//     Do Not Disturb access for the app. Undone when the session ends, and
//     on the next launch if the app was closed mid-session.
//   Every platform — this app's own pop-ups (reminder toasts) wait until
//     the session ends; nothing is lost, they show afterwards.
//   Web, desktop, iOS — other apps' notifications can't be blocked from
//     here; the screen says so and points at the device's own focus mode.
//
// Never resolve the plugin proxy from an async function (Capacitor's
// `.then` trap) — only call its methods.

import { registerPlugin } from "@capacitor/core";
import { isNative, getNativePlatform } from "@/lib/platform";

const ANDROID = isNative() && getNativePlatform() === "android";
const SystemSettings = ANDROID ? registerPlugin("SystemSettings") : null;

let quiet = false;
const listeners = new Set();
export const isFocusQuiet = () => quiet;
export function subscribeFocusQuiet(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setQuiet(v) {
  quiet = v;
  for (const fn of listeners) { try { fn(v); } catch { /* listener */ } }
}

export const canBlockSystemNotifications = () => !!SystemSettings;

// { supported, accessGranted } — Android only; elsewhere both false.
export async function getDndStatus() {
  if (!SystemSettings) return { supported: false, accessGranted: false };
  try {
    const r = await SystemSettings.dndStatus();
    return { supported: !!r.supported, accessGranted: !!r.accessGranted };
  } catch {
    return { supported: false, accessGranted: false };
  }
}

export async function openDndAccessSettings() {
  if (!SystemSettings) return;
  try { await SystemSettings.openDndAccessSettings(); } catch { /* nothing to open */ }
}

// Returns { systemBlocked } — whether the phone's notifications are
// silenced too, or only this app's pop-ups.
export async function startDistractionFree() {
  setQuiet(true);
  if (!SystemSettings) return { systemBlocked: false };
  try {
    const r = await SystemSettings.startFocusDnd();
    return { systemBlocked: !!r.applied };
  } catch {
    return { systemBlocked: false };
  }
}

export async function stopDistractionFree() {
  setQuiet(false);
  if (!SystemSettings) return;
  try { await SystemSettings.stopFocusDnd(); } catch { /* restored on next launch */ }
}
