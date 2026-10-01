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

// When the plan was MEANT to start / end — the "on time" choices (owner,
// 2026-10-01: "started on time" / "completed on time" instead of stamping
// now and fixing it by hand). Null when the plan has no time, or (end) no
// planned length.
export function plannedStartFor(item) {
  if (!item?.timestamp) return null;
  const d = new Date(item.timestamp);
  return Number.isFinite(d.getTime()) ? d : null;
}
export function plannedEndFor(item) {
  const start = plannedStartFor(item);
  const dur = Number(item?.duration_minutes) || 0;
  return start && dur > 0 ? new Date(start.getTime() + dur * 60000) : null;
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

// `endedAt` (optional): when it actually ended — "finished on time", "just
// now", or a time the person picked because it ran late. Done on a plan
// that's RUNNING goes through the same write as ending the session
// (endAndLogActiveActivity: real start, real length). Done/partial on a
// plan that was never started takes its length from the plan's time to
// `endedAt`.
export async function resolveOutcome(item, status, { endedAt = null } = {}) {
  const end = endedAt ? (endedAt instanceof Date ? endedAt : new Date(endedAt)) : null;
  if (status === "done") {
    try {
      const { getActiveActivities, endAndLogActiveActivity } = await import("@/lib/activitySession");
      const sess = getActiveActivities().find((a) => a.planActivityId === item.id);
      if (sess) {
        await endAndLogActiveActivity(sess.id, (end || new Date()).toISOString());
        if (item.task_id) {
          await base44.entities.Task.update(item.task_id, {
            completed: true, is_complete: true, completed_date: new Date().toISOString(),
          }).catch(() => { /* the activity outcome stands even if the task write fails */ });
        }
        return;
      }
    } catch { /* fall through to the plain resolve */ }
  }
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
      const until = end ? end.getTime() : Date.now();
      const elapsed = Math.max(1, Math.round((until - new Date(sess.startTime).getTime()) / 60000));
      patch.actual_duration_minutes = banked + elapsed;
      patch.progress_minutes = null;
      removeActiveActivity(sess.id);
    } else if (banked && !Number(item.actual_duration_minutes)) {
      patch.actual_duration_minutes = banked;
      patch.progress_minutes = null;
    } else if (end && (status === "done" || status === "partial")) {
      const start = plannedStartFor(item);
      const mins = start ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
      if (mins > 0) patch.actual_duration_minutes = mins;
    }
  } catch { /* resolution still happens without session bookkeeping */ }
  await base44.entities.Activity.update(item.id, patch);
  if (item.task_id && status === "done") {
    await base44.entities.Task.update(item.task_id, {
      completed: true, is_complete: true, completed_date: new Date().toISOString(),
    }).catch(() => { /* the activity outcome stands even if the task write fails */ });
  }
}
