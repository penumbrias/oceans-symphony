// Settings for the Pinned Daily Tasks dashboard widget. Stored in
// localStorage so the choice persists across sessions per device. The
// widget reads `loadPrefs()` once and re-reads after a `savePrefs()`
// via a custom event so the open settings dialog can react without a
// full reload.

const STORAGE_KEY = "symphony_pinned_daily_tasks_prefs_v1";
const CHANGE_EVENT = "symphony:pinned-daily-tasks-prefs-changed";

export const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];

export const DEFAULT_PREFS = {
  // "auto": filter by enabledFrequencies, sort by priorityOrder, hide
  //   completed (if hideCompleted), incomplete-first.
  // "manual": render the picked templates in the saved order.
  mode: "auto",
  // Scrollable list height in pixels. The user can tune this so the
  // widget fits the rest of the dashboard.
  maxHeight: 320,
  // Auto-mode: which frequencies to surface, ordered from most-to-
  // least urgent. The first entry's incomplete tasks render first;
  // ties are broken by template `sort_order`.
  priorityOrder: ["monthly", "weekly", "daily"],
  enabledFrequencies: ["monthly", "weekly", "daily"],
  // Auto-mode: hide tasks once they're completed for the current
  // period (so the list shrinks as you go).
  hideCompleted: true,
  // Manual-mode: pick template ids to render. Order in this array is
  // the on-screen order.
  pickedIds: [],
};

export function loadPrefs() {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return sanitize(parsed);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(next) {
  try {
    if (typeof localStorage === "undefined") return;
    const sanitized = sanitize(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }
  } catch {
    // localStorage full or disabled — non-fatal
  }
}

export function subscribePrefs(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

function sanitize(raw) {
  const out = { ...DEFAULT_PREFS, ...(raw || {}) };
  if (!["auto", "manual"].includes(out.mode)) out.mode = "auto";
  const h = Number(out.maxHeight);
  out.maxHeight = Number.isFinite(h) ? Math.max(140, Math.min(800, Math.round(h))) : DEFAULT_PREFS.maxHeight;
  const validFreq = (f) => FREQUENCIES.includes(f);
  const dedupe = (arr) => {
    const seen = new Set();
    const r = [];
    for (const v of arr) { if (!seen.has(v)) { seen.add(v); r.push(v); } }
    return r;
  };
  out.priorityOrder = dedupe((Array.isArray(out.priorityOrder) ? out.priorityOrder : []).filter(validFreq));
  // Ensure every frequency exists somewhere in priorityOrder (so toggling
  // one on doesn't leave it positionless). Append missing at the end.
  for (const f of FREQUENCIES) {
    if (!out.priorityOrder.includes(f)) out.priorityOrder.push(f);
  }
  out.enabledFrequencies = dedupe((Array.isArray(out.enabledFrequencies) ? out.enabledFrequencies : []).filter(validFreq));
  out.hideCompleted = out.hideCompleted !== false;
  out.pickedIds = Array.isArray(out.pickedIds) ? out.pickedIds.filter(id => typeof id === "string") : [];
  return out;
}
