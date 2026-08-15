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

export async function resolveOutcome(item, status) {
  await base44.entities.Activity.update(item.id, {
    status,
    timestamp: item.timestamp || new Date().toISOString(),
  });
  if (item.task_id && status === "done") {
    await base44.entities.Task.update(item.task_id, {
      completed: true, is_complete: true, completed_date: new Date().toISOString(),
    }).catch(() => { /* the activity outcome stands even if the task write fails */ });
  }
}
