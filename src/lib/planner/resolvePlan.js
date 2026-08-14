// THE way to resolve a plan's outcome (rule 6: one write path).
//
// Used by the planner entry sheet AND the home-notice resolve list, so
// "mark done" behaves identically everywhere: status write, a timestamp
// for un-timed entries to sit at, and the linked to-do completing on
// done so the two can never disagree.

import { base44 } from "@/api/base44Client";

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
