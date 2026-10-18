// "Experimental features" switch (Settings → About & help).
//
// Needs, Goals and Mods are still settling, so they stay out of sight until
// a person turns this on. Off hides every way in: the pages leave ALL_PAGES
// (bars, dashboard grid, quick actions, Navigation settings all read it
// live), the hard-coded nav catalogues filter them, their widgets leave the
// picker, their tour steps are skipped, search drops their results, and the
// routes show a small "turn it on" card instead of the page.
//
// Hiding never touches data: goals, wishes, turn agreements and installed
// mods stay in the database, backups and sync. Turning the switch back on
// brings everything back exactly as it was.
//
// A per-device preference, kept durable by BACKUP_LS_KEYS (backupKeys.js).

import { useSyncExternalStore } from "react";

export const EXPERIMENTAL_FEATURES_KEY = "symphony_experimental_features_v1";

export const EXPERIMENTAL_PAGE_IDS = ["needs", "goals", "mods"];
const EXPERIMENTAL_PATH_PREFIXES = ["/needs", "/goals", "/mods", "/mod/"];

const listeners = new Set();

export function experimentalOn() {
  try {
    return localStorage.getItem(EXPERIMENTAL_FEATURES_KEY) === "1";
  } catch {
    return false;
  }
}

export function setExperimentalOn(on) {
  try {
    if (on) localStorage.setItem(EXPERIMENTAL_FEATURES_KEY, "1");
    else localStorage.removeItem(EXPERIMENTAL_FEATURES_KEY);
  } catch { /* the switch just won't stick on this device */ }
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function subscribeExperimental(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  // Another window flipped it.
  window.addEventListener("storage", (e) => {
    if (e.key === EXPERIMENTAL_FEATURES_KEY) listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  });
}

export function useExperimentalOn() {
  return useSyncExternalStore(subscribeExperimental, experimentalOn, () => false);
}

export function isExperimentalPath(path) {
  if (!path || typeof path !== "string") return false;
  const p = path.split("?")[0];
  return EXPERIMENTAL_PATH_PREFIXES.some((pre) => pre.endsWith("/") ? p.startsWith(pre) : (p === pre || p.startsWith(pre + "/")));
}

// True when this nav item / page should be hidden right now.
export function isHiddenExperimental(item) {
  if (experimentalOn() || !item) return false;
  return EXPERIMENTAL_PAGE_IDS.includes(item.id) || !!item.isMod || isExperimentalPath(item.path);
}

export function withoutHiddenExperimental(items) {
  if (experimentalOn() || !Array.isArray(items)) return items;
  return items.filter((it) => !isHiddenExperimental(it));
}
