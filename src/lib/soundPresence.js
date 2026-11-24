// A tiny flag that says "the sound code has loaded" (new house step 0.3).
// The Soundscape engine and the nature player mark it when they load, so
// the app frame can leave the "now playing" pill and its sound code out of
// startup: nothing can be playing until one of them has loaded.
let loaded = false;
const listeners = new Set();

export function markSoundLoaded() {
  if (loaded) return;
  loaded = true;
  for (const fn of listeners) { try { fn(); } catch { /* ignore */ } }
}
export function isSoundLoaded() { return loaded; }
export function onSoundLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
