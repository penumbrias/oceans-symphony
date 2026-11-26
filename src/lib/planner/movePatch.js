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
