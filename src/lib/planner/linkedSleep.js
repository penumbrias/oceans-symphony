// Keeps a Sleep record in step with the Activity that mirrors it.
//
// Logging sleep creates an Activity with `source_sleep_id` so the night
// shows on the planner. The classic tracker's details modal kept the two
// in step: changing the activity's time or note updated the Sleep record,
// and deleting the activity deleted its Sleep record. The planner merge
// dropped that, so the Sleep page drifted (or kept an entry whose activity
// was gone). Every planner write path that changes or removes an activity
// goes through these two helpers. Both are best-effort: the activity write
// has already succeeded, and a failed mirror must never undo it.

import { base44 } from "@/api/base44Client";

// `patch` is what was just written to the activity. Only fields the Sleep
// record mirrors are carried across; a wake time needs a real length.
export async function syncLinkedSleep(activity, patch) {
  const sleepId = activity?.source_sleep_id;
  if (!sleepId || !patch) return;
  const next = { ...activity, ...patch };
  const out = {};
  if ("timestamp" in patch || "duration_minutes" in patch || "actual_duration_minutes" in patch) {
    const start = next.timestamp ? new Date(next.timestamp) : null;
    if (start && !Number.isNaN(start.getTime())) {
      out.bedtime = start.toISOString();
      const mins = Number(next.actual_duration_minutes) || Number(next.duration_minutes) || 0;
      if (mins > 0) out.wake_time = new Date(start.getTime() + mins * 60000).toISOString();
    }
  }
  if ("notes" in patch) out.notes = patch.notes ?? null;
  if (!Object.keys(out).length) return;
  try { await base44.entities.Sleep.update(sleepId, out); } catch { /* best-effort */ }
}

// The person confirmed deleting the activity; its Sleep record goes with it
// (the classic behaviour), so the Sleep page never keeps an orphan.
export async function deleteLinkedSleep(activity) {
  const sleepId = activity?.source_sleep_id;
  if (!sleepId) return;
  try { await base44.entities.Sleep.delete(sleepId); } catch { /* best-effort */ }
}
