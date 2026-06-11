// A single in-progress "activity session" (like start/end sleep), stored in
// localStorage so it survives app restarts and can be read by the persistent
// notification (Phase 99). The Activity record is only CREATED when the session
// ends — so a running session never pollutes the logged grid/tally.
//
// Shape: { categoryId, name, color, startTime (ISO), alterId }

const KEY = "symphony_active_activity_v1";
export const ACTIVE_ACTIVITY_EVENT = "active-activity-changed";

export function getActiveActivity() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setActiveActivity(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
    window.dispatchEvent(new Event(ACTIVE_ACTIVITY_EVENT));
  } catch { /* storage off */ }
}

export function clearActiveActivity() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(ACTIVE_ACTIVITY_EVENT));
  } catch { /* storage off */ }
}
