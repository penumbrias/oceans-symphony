// Preview Mode controller.
//
// When active, every entity read/write goes through an in-memory snapshot of
// curated example data instead of the real IndexedDB. Real user data is
// never read from or written to while Preview Mode is on, so there is no
// way for a Preview Mode session to alter what's on disk.
//
// State is kept in localStorage so the banner survives reloads, but the
// actual data dump is regenerated from previewSystems.js each time so it
// always reflects "now" relative to the timeline.

import { queryClientInstance } from "./query-client";
import { setPreviewDb, clearPreviewDb, isPreviewDbActive } from "./localDb";
import { getPreviewSystem, PREVIEW_SYSTEMS } from "./previewSystems";

const STORAGE_KEY = "symphony_preview_active_system";

const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}

export function isPreviewActive() {
  return isPreviewDbActive();
}

export function getActiveSystemKey() {
  return localStorage.getItem(STORAGE_KEY) || null;
}

export function getActiveSystem() {
  const key = getActiveSystemKey();
  if (!key) return null;
  return getPreviewSystem(key);
}

export async function enterPreview(systemKey) {
  const system = getPreviewSystem(systemKey);
  if (!system) throw new Error(`Unknown preview system: ${systemKey}`);
  const data = system.build();
  setPreviewDb(data);
  localStorage.setItem(STORAGE_KEY, systemKey);
  await queryClientInstance.invalidateQueries();
  notify();
}

export async function exitPreview() {
  clearPreviewDb();
  localStorage.removeItem(STORAGE_KEY);
  await queryClientInstance.invalidateQueries();
  notify();
}

// Called once on app start to restore preview mode if it was active before
// the page reloaded. Safe to call even when no preview was active.
export async function restorePreviewIfActive() {
  const key = getActiveSystemKey();
  if (!key) return;
  const system = getPreviewSystem(key);
  if (!system) {
    // Stale key — clear it.
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  setPreviewDb(system.build());
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export { PREVIEW_SYSTEMS };
