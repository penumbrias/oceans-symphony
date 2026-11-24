// User preference: show the floating Grounding button (the persistent
// bubble in the corner). Defaults to OFF since v0.380.3 (the owner asked
// for it gone; Support stays in the menus, quick actions and the pixel rail). Toggled from Settings →
// Accessibility. Stored per-device in localStorage because it's a
// display preference — a user might want it on their phone but off
// on their desktop.

const KEY = "symphony_grounding_button_enabled_v1";

export function isGroundingButtonEnabled() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return false; // default OFF
    return raw === "1";
  } catch {
    return false;
  }
}

export function setGroundingButtonEnabled(enabled) {
  try { localStorage.setItem(KEY, enabled ? "1" : "0"); } catch { /* non-fatal */ }
  notify();
}

const listeners = new Set();
function notify() {
  for (const fn of listeners) {
    try { fn(); } catch { /* swallow */ }
  }
}
export function subscribeGroundingButton(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
