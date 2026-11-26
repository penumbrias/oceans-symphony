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
import { syncLinkedSleep } from "@/lib/planner/linkedSleep";

import { movePatch, restorePatch } from "@/lib/planner/movePatch";

export { movePatch, restorePatch, MOVE_MAX_MINUTES } from "@/lib/planner/movePatch";

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

/** Undo a drag: put the entry back as it was (`before` is the record before the move). */
export async function restoreActivityTime(before) {
  const patch = restorePatch(before);
  if (!patch) return null;
  await base44.entities.Activity.update(before.id, patch);
  await syncLinkedSleep(before, patch);
  return patch;
}
