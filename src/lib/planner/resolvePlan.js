// THE way to resolve a plan's outcome (rule 6: one write path).
//
// Used by the planner entry sheet AND the home-notice resolve list, so
// "mark done" behaves identically everywhere: status write, a timestamp
// for un-timed entries to sit at, and the linked to-do completing on
// done so the two can never disagree.

import { base44 } from "@/api/base44Client";

// Rescheduling is the other way out of "unresolved": the plan is still
// happening, just later. Status stays `scheduled` and the move is recorded
// in reschedule_history — the tracker's model, and the same write the
// planner sheet's move-to-day commit performs.
export async function reschedulePlan(item, when) {
  const to = when.toISOString();
  const from = item.timestamp || null;
  await base44.entities.Activity.update(item.id, {
    timestamp: to,
    status: "scheduled",
    ...(from && from !== to
      ? { reschedule_history: [...(item.reschedule_history || []), { from, to, ts: new Date().toISOString() }] }
      : {}),
  });
}

// Start a plan as an in-progress ACTIVE activity, linked back through
// planActivityId so ending it resolves THIS plan to done (the same
// mechanism the lifecycle popover's "Start now" and the classic unresolved
// card use — lifted here so the home notice shares it). `startedAt` lets
// the user say they started late/early instead of stamping "now".
export async function startPlanActive(item, { startedAt = new Date(), categories = [] } = {}) {
  const { addActiveActivity } = await import("@/lib/activitySession");
  const color = (() => {
    for (const id of (item.activity_category_ids || [])) {
      const c = categories.find((x) => x.id === id);
      if (c?.color) return c.color;
    }
    return item.color || null;
  })();
  addActiveActivity({
    planActivityId: item.id,
    categoryId: (item.activity_category_ids || [])[0] || null,
    name: item.activity_name || "Activity",
    color,
    startTime: (startedAt instanceof Date ? startedAt : new Date(startedAt)).toISOString(),
    alterIds: item.fronting_alter_ids || [],
    notes: (item.notes || "").trim(),
  });
  try {
    const { cancelPlanReminder } = await import("@/lib/planReminderScheduler");
    await cancelPlanReminder(item.id);
  } catch { /* non-fatal */ }
}

export async function resolveOutcome(item, status) {
  // Resolving a plan whose session is still RUNNING must also end that
  // session — "Partly" used to set the status while the activity stayed
  // active (owner report). The elapsed time (plus anything banked by
  // earlier pauses) lands as the plan's actual duration.
  const patch = { status };
  // An entry with NO time is an intention for its day (planned_date) and
  // must stay there: stamping "now" on it moved a skipped plan out of the
  // day's untimed strip to the moment it was resolved — it read as having
  // vanished (owner report). Only a plan with neither a time nor a day
  // needs somewhere to sit.
  if (!item.timestamp && !item.planned_date) patch.timestamp = new Date().toISOString();
  try {
    const { getActiveActivities, removeActiveActivity } = await import("@/lib/activitySession");
    const sess = getActiveActivities().find((a) => a.planActivityId === item.id);
    const banked = Number(item.progress_minutes) || 0;
    if (sess) {
      const elapsed = Math.max(1, Math.round((Date.now() - new Date(sess.startTime).getTime()) / 60000));
      patch.actual_duration_minutes = banked + elapsed;
      patch.progress_minutes = null;
      removeActiveActivity(sess.id);
    } else if (banked && !Number(item.actual_duration_minutes)) {
      patch.actual_duration_minutes = banked;
      patch.progress_minutes = null;
    }
  } catch { /* resolution still happens without session bookkeeping */ }
  await base44.entities.Activity.update(item.id, patch);
  if (item.task_id && status === "done") {
    await base44.entities.Task.update(item.task_id, {
      completed: true, is_complete: true, completed_date: new Date().toISOString(),
    }).catch(() => { /* the activity outcome stands even if the task write fails */ });
  }
}
