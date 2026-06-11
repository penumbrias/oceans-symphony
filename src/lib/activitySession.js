// A single in-progress "activity session" (like start/end sleep), stored in
// localStorage so it survives app restarts and can be read by the persistent
// notification (Phase 99). The Activity record is only CREATED when the session
// ends — so a running session never pollutes the logged grid/tally.
//
// Shape: { categoryId, name, color, startTime (ISO), alterId }

import { base44 } from "@/api/base44Client";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";

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

// End the running activity: create the logged Activity record (attributed to
// whoever was fronting at start) and clear the session. Returns { record,
// minutes, name } or null if nothing was running. Shared by the in-app
// ActivitySessionControl and the persistent-notification "End & log" action so
// both paths behave identically.
export async function endAndLogActiveActivity() {
  const active = getActiveActivity();
  if (!active) return null;
  const start = new Date(active.startTime);
  const end = new Date();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  const record = await base44.entities.Activity.create({
    activity_name: active.name || "Activity",
    parent_category_id: active.categoryId || null,
    timestamp: start.toISOString(),
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    duration_minutes: minutes,
    actual_duration_minutes: minutes,
    status: ACTIVITY_STATUSES.LOGGED,
    alter_id: active.alterId || null,
  });
  clearActiveActivity();
  return { record, minutes, name: active.name || "Activity" };
}
