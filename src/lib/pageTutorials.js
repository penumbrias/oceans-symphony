// Per-page tutorial state — companion to the full-tour FeatureTour.
//
// The full FeatureTour is a linear walkthrough launched from Settings.
// The page-tutorial banner (PageTutorialBanner) reads the same step
// catalogue but scoped to one route at a time, prompting the user once
// per page on first visit. State lives in localStorage so it survives
// browser refreshes but stays per-install (deliberately NOT in the
// backup; we don't want a restored backup to silently hide tutorials
// the user hasn't actually seen on this device).
//
// Keys:
//   symphony_page_tutorials_seen_v1     — JSON { [route]: true, ... }
//   symphony_page_tutorials_enabled_v1  — "1" (default) | "0"
// Read-only consumer of the full-tour completion marker:
//   symphony_dailytask_tour_completed_v1
//     — set by FeatureTour's "Done 💜" handler. We treat full-tour
//       completion as "user has already seen everything" and suppress
//       the banner by default, unless the user explicitly resets.

const SEEN_KEY = "symphony_page_tutorials_seen_v1";
const ENABLED_KEY = "symphony_page_tutorials_enabled_v1";
const FULL_TOUR_DONE_KEY = "symphony_dailytask_tour_completed_v1";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* non-fatal */ }
}

export function getSeenRoutes() {
  return readJson(SEEN_KEY, {});
}

export function isRouteSeen(route) {
  if (!route) return true;
  return !!getSeenRoutes()[route];
}

export function markRouteSeen(route) {
  if (!route) return;
  const seen = getSeenRoutes();
  if (seen[route]) return;
  seen[route] = true;
  writeJson(SEEN_KEY, seen);
  notifyChange();
}

export function clearAllSeen() {
  try { localStorage.removeItem(SEEN_KEY); } catch { /* non-fatal */ }
  notifyChange();
}

export function arePageTutorialsEnabled() {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw === null) return true; // default ON
    return raw === "1";
  } catch {
    return true;
  }
}

export function setPageTutorialsEnabled(enabled) {
  try { localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0"); } catch { /* non-fatal */ }
  notifyChange();
}

export function hasUserCompletedFullTour() {
  try { return localStorage.getItem(FULL_TOUR_DONE_KEY) != null; }
  catch { return false; }
}

// Lightweight pub-sub so the banner can re-render after Settings actions.
const listeners = new Set();
function notifyChange() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore listener errors */ }
  }
}
export function subscribePageTutorials(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
