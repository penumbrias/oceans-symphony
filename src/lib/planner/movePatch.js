// The patch a planner drag writes (pure, so it can be tested without the
// database). The write itself is moveActivityTime in moveEntry.js; the rules
// are documented there.

import { statusFor } from "@/lib/activityStatus";

export const MOVE_MAX_MINUTES = 24 * 60 * 14;

/** The patch a drag writes (pure; exported for tests). */
export function movePatch(activity, { start, minutes }, now = new Date()) {
  if (!activity || !(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  const mins = Math.max(1, Math.min(MOVE_MAX_MINUTES, Math.round(Number(minutes) || 0)));
  const to = start.toISOString();
  const patch = {
    timestamp: to,
    ...(Number(activity.actual_duration_minutes) > 0 ? { actual_duration_minutes: mins } : { duration_minutes: mins }),
  };
  const from = activity.timestamp || null;
  if (statusFor(activity) === "scheduled" && from && from !== to) {
    patch.reschedule_history = [...(Array.isArray(activity.reschedule_history) ? activity.reschedule_history : []), { from, to, ts: now.toISOString() }];
  }
  return patch;
}

/** The patch that puts an entry back exactly as it was before a drag (Undo):
 *  its time, its length field and its reschedule history (so an undone move
 *  isn't counted as a reschedule). `before` is the record as it was. */
export function restorePatch(before) {
  if (!before?.timestamp) return null;
  const patch = { timestamp: before.timestamp };
  if (Number(before.actual_duration_minutes) > 0) patch.actual_duration_minutes = Number(before.actual_duration_minutes);
  else patch.duration_minutes = Number(before.duration_minutes) || 0;
  patch.reschedule_history = Array.isArray(before.reschedule_history) ? before.reschedule_history : [];
  return patch;
}
