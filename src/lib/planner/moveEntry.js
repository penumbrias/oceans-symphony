// THE way to move or resize an entry on a planner grid by dragging it
// (the new house's Planner room; board 04: "Drag to move, drag the edge to
// resize").
//
// A drag only ever changes when an entry starts and how long it runs. The
// rest of the record is left alone. Rules:
// - The length goes into whichever field the record already used
//   (actual_duration_minutes for something that happened at a different
//   length, else duration_minutes), so a drag never turns a planned length
//   into an actual one.
// - A plan still to come that moves to another time keeps status
//   `scheduled` and the move is recorded in reschedule_history (the
//   planner's model: rescheduling is never a status).
// - A night mirrored from the Sleep page keeps its Sleep record in step
//   (linkedSleep), as every other planner write does.
// - A one-day ceiling isn't forced: 14 days is a sanity cap.

import { base44 } from "@/api/base44Client";
import { statusFor } from "@/lib/activityStatus";
import { syncLinkedSleep } from "@/lib/planner/linkedSleep";

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

/** Move and/or resize one entry. Returns the patch written, or null when nothing changed. */
export async function moveActivityTime(activity, { start, minutes }) {
  const patch = movePatch(activity, { start, minutes });
  if (!patch) return null;
  const same = patch.timestamp === activity.timestamp
    && (patch.duration_minutes ?? patch.actual_duration_minutes) === (Number(activity.actual_duration_minutes) > 0 ? Number(activity.actual_duration_minutes) : Number(activity.duration_minutes));
  if (same) return null;
  await base44.entities.Activity.update(activity.id, patch);
  await syncLinkedSleep(activity, patch);
  return patch;
}
